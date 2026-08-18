import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, Preview } from '../core/types';
import type { BrowsingDataApi } from './storage';

const NOTE =
  "Le cache HTTP est vidé en bloc. L'API accepterait bien une exclusion par origine, mais elle " +
  "filtre sur l'URL de la ressource et non sur le site visité : protéger un site ne préserverait " +
  'pas ce qu’il charge depuis un CDN tiers.';

export function createHttpCacheCleaner(api: BrowsingDataApi): Cleaner {
  return {
    id: 'httpCache',
    perSite: 'none',

    async preview(): Promise<Preview> {
      return { countable: false, items: 0, note: NOTE };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      try {
        await api.browsingData.remove({ since: plan.since }, { cache: true });
        return { status: 'ok', deleted: 0, kept: 0, countable: false };
      } catch (cause) {
        return {
          status: 'failed',
          deleted: 0,
          kept: 0,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  };
}
