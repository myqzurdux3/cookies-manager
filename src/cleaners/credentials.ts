import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, Preview } from '../core/types';
import type { BrowsingDataApi } from './storage';

const NOTES = {
  passwords:
    "Les mots de passe enregistrés sont tout ou rien : aucune exclusion par site n'est possible. Suppression définitive.",
  formData:
    "Les données de formulaire sont tout ou rien : aucune exclusion par site n'est possible. Suppression définitive.",
} as const;

/**
 * Version de Chrome à partir de laquelle `browsingData.remove` ignore le type
 * `passwords` : « Support for password deletion through extensions has been
 * removed. This data type will be ignored. » L'appel résout normalement, sans
 * rien supprimer — c'est le pire cas pour une case marquée « définitif », qui
 * annoncerait « vidé entièrement » après n'avoir rien vidé.
 */
export const PASSWORDS_REMOVED_FROM = 144;

const PASSWORDS_UNAVAILABLE =
  'Chrome 144 et suivants ignorent la suppression des mots de passe par une extension : ' +
  "rien n'a été supprimé. Passez par Chrome, Paramètres, Suppression des données de navigation.";

/** Version majeure de Chrome, ou `null` si elle est illisible — on ne suppose alors rien. */
export function chromeMajorVersion(userAgent: string): number | null {
  const match = /Chrome\/(\d+)/.exec(userAgent);
  if (match === null) return null;
  const major = Number(match[1]);
  return Number.isInteger(major) ? major : null;
}

export function createCredentialsCleaner(
  api: BrowsingDataApi,
  category: 'passwords' | 'formData',
  chromeMajor: number | null = null,
): Cleaner {
  const unavailable =
    category === 'passwords' && chromeMajor !== null && chromeMajor >= PASSWORDS_REMOVED_FROM;

  return {
    id: category,
    perSite: 'none',

    async preview(): Promise<Preview> {
      return { countable: false, items: 0, note: unavailable ? PASSWORDS_UNAVAILABLE : NOTES[category] };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      // On n'appelle pas l'API : elle résoudrait sans rien faire, et le rapport
      // annoncerait une suppression qui n'a pas eu lieu.
      if (unavailable) {
        return { status: 'failed', deleted: 0, kept: 0, error: PASSWORDS_UNAVAILABLE };
      }

      try {
        await api.browsingData.remove({ since: plan.since }, { [category]: true });
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
