import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, Preview } from '../core/types';
import type { BrowsingDataApi } from './storage';

const NOTES = {
  passwords:
    "Les mots de passe enregistrés sont tout ou rien : aucune exclusion par site n'est possible. Suppression définitive.",
  formData:
    "Les données de formulaire sont tout ou rien : aucune exclusion par site n'est possible. Suppression définitive.",
} as const;

export function createCredentialsCleaner(
  api: BrowsingDataApi,
  category: 'passwords' | 'formData',
): Cleaner {
  return {
    id: category,
    perSite: 'none',

    async preview(): Promise<Preview> {
      return { countable: false, items: 0, note: NOTES[category] };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      try {
        await api.browsingData.remove({ since: plan.since }, { [category]: true });
        return { status: 'ok', deleted: 0, kept: 0 };
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
