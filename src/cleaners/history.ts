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

/**
 * Parcourt l'historique par pages en reculant la borne haute.
 *
 * Deux précautions, toutes deux dues à des garanties que Chrome ne donne pas :
 * la documentation ne dit pas si `endTime` est inclusif, et n'annonce aucun
 * ordre de tri. On dédoublonne donc par URL — sinon des pages qui se recouvrent
 * font compter deux fois la même entrée dans l'aperçu — et on ignore les
 * entrées sans date pour calculer la borne suivante, au lieu de les traiter
 * comme l'époque zéro et d'arrêter le parcours au milieu.
 */
async function collect(api: HistoryApi, since: number): Promise<HistoryItem[]> {
  const items: HistoryItem[] = [];
  const seen = new Set<string>();
  let endTime: number | undefined;

  for (;;) {
    const page = await api.history.search({
      text: '',
      startTime: since,
      endTime,
      maxResults: PAGE_SIZE,
    });
    if (page.length === 0) break;

    let added = 0;
    let oldest: number | undefined;

    for (const item of page) {
      if (item.url !== undefined) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        added += 1;
      }
      items.push(item);

      const at = item.lastVisitTime;
      if (at !== undefined && (oldest === undefined || at < oldest)) oldest = at;
    }

    // Plus rien de neuf, ou plus de borne pour reculer : le parcours est fini.
    if (added === 0 || oldest === undefined || oldest === endTime) break;
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
      // `collect` a déjà dédoublonné : le compte de l'aperçu et celui du
      // nettoyage portent donc sur exactement le même ensemble.
      const urls = items.filter((item) => isDeletable(item, plan)).map((item) => item.url!);
      const kept = items.length - urls.length;

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
