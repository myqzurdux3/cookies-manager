import { isProtected } from '../core/matcher';
import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, Preview } from '../core/types';

export type HistoryItem = { url?: string; lastVisitTime?: number };

export type HistoryApi = {
  history: {
    search(query: {
      text: string;
      startTime: number;
      endTime?: number;
      maxResults: number;
    }): Promise<HistoryItem[]>;
    deleteUrl(details: { url: string }): Promise<void>;
  };
};

const PAGE_SIZE = 1000;

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function collect(api: HistoryApi, since: number): Promise<HistoryItem[]> {
  const items: HistoryItem[] = [];
  let endTime: number | undefined;

  for (;;) {
    const page = await api.history.search({
      text: '',
      startTime: since,
      endTime,
      maxResults: PAGE_SIZE,
    });
    if (page.length === 0) break;
    items.push(...page);
    const oldest = Math.min(...page.map((item) => item.lastVisitTime ?? 0));
    if (oldest === 0 || oldest === endTime) break;
    endTime = oldest;
  }

  return items;
}

function isDeletable(item: HistoryItem, plan: CategoryPlan): boolean {
  if (item.url === undefined) return false;
  const host = hostOf(item.url);
  if (host === null) return false;
  return !isProtected(host, 'history', plan.keepRules);
}

export function createHistoryCleaner(api: HistoryApi): Cleaner {
  return {
    id: 'history',
    perSite: 'exact',

    async preview(plan: CategoryPlan): Promise<Preview> {
      const items = await collect(api, plan.since);
      return { countable: true, items: items.filter((item) => isDeletable(item, plan)).length };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      const items = await collect(api, plan.since);
      const urls = new Set<string>();
      let kept = 0;

      for (const item of items) {
        if (isDeletable(item, plan)) urls.add(item.url!);
        else kept += 1;
      }

      let deleted = 0;
      let error: string | undefined;

      for (const url of urls) {
        try {
          await api.history.deleteUrl({ url });
          deleted += 1;
        } catch (cause) {
          error ??= cause instanceof Error ? cause.message : String(cause);
        }
      }

      return { status: error === undefined ? 'ok' : 'partial', deleted, kept, error };
    },
  };
}
