import { isProtected } from '../core/matcher';
import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, Preview } from '../core/types';
import { hostOf } from './history';

export type DownloadItem = { id: number; finalUrl?: string; url?: string };

export type DownloadsApi = {
  downloads: {
    search(query: object): Promise<DownloadItem[]>;
    erase(query: { id: number }): Promise<number[]>;
  };
};

function isDeletable(item: DownloadItem, plan: CategoryPlan): boolean {
  const url = item.finalUrl ?? item.url;
  if (url === undefined) return false;
  const host = hostOf(url);
  if (host === null) return false;
  return !isProtected(host, 'downloads', plan.keepRules);
}

/**
 * `limit: 0` lève le plafond : sans lui, `chrome.downloads.search` s'arrête à
 * 1000 entrées et les plus anciennes ne sont ni comptées ni effacées, en
 * silence — le pire résultat pour un outil de suppression.
 */
function query(plan: CategoryPlan): object {
  return plan.since === 0
    ? { limit: 0 }
    : { limit: 0, startedAfter: new Date(plan.since).toISOString() };
}

export function createDownloadsCleaner(api: DownloadsApi): Cleaner {
  return {
    id: 'downloads',
    perSite: 'exact',

    async preview(plan: CategoryPlan): Promise<Preview> {
      const items = await api.downloads.search(query(plan));
      return { countable: true, items: items.filter((item) => isDeletable(item, plan)).length };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      const items = await api.downloads.search(query(plan));
      let deleted = 0;
      let kept = 0;
      let error: string | undefined;

      for (const item of items) {
        if (!isDeletable(item, plan)) {
          kept += 1;
          continue;
        }
        try {
          await api.downloads.erase({ id: item.id });
          deleted += 1;
        } catch (cause) {
          error ??= cause instanceof Error ? cause.message : String(cause);
        }
      }

      return { status: error === undefined ? 'ok' : 'partial', deleted, kept, error };
    },
  };
}
