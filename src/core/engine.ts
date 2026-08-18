import type { CategoryPlan, Plan } from './planner';
import type { StorageArea } from './profiles';
import type { Category, CleanReport, Cleaner, Preview } from './types';

export const JOURNAL_LIMIT = 20;
const KEY = 'runs';

export type PreviewResult = { category: Category; preview: Preview };
export type CategoryResult = { category: Category; report: CleanReport };
export type RunRecord = { profileId: string; at: number; results: CategoryResult[] };

export interface Engine {
  preview(plan: Plan): Promise<PreviewResult[]>;
  clean(plan: Plan, at: number): Promise<CategoryResult[]>;
  journal(): Promise<RunRecord[]>;
}

/**
 * Le journal est une commodité, jamais une source de vérité. Une valeur abîmée
 * repart de zéro plutôt que d'empoisonner le rapport : l'étalement d'une chaîne
 * la découpait caractère par caractère, et celui d'un objet aurait jeté — après
 * la suppression, faisant rapporter un échec pour des données bel et bien
 * effacées.
 */
function readJournal(value: unknown): RunRecord[] {
  return Array.isArray(value) ? (value as RunRecord[]) : [];
}

function missing(category: Category): CleanReport {
  return {
    status: 'failed',
    deleted: 0,
    kept: 0,
    error: `aucun cleaner disponible pour ${category}`,
  };
}

export type EngineOptions = {
  /**
   * Sauvegarde des cookies condamnés, appelée juste avant le cleaner cookies.
   * Si elle jette, les cookies ne sont pas supprimés : jamais de suppression
   * sans la sauvegarde promise. Seuls les cookies sont concernés — les autres
   * catégories ne sont pas relisibles avant suppression.
   */
  backup?: (plan: CategoryPlan) => Promise<void>;
};

export function createEngine(
  cleaners: Cleaner[],
  area: StorageArea,
  options: EngineOptions = {},
): Engine {
  const byId = new Map(cleaners.map((cleaner) => [cleaner.id, cleaner]));

  return {
    async preview(plan: Plan): Promise<PreviewResult[]> {
      return Promise.all(
        plan.categories.map(async (categoryPlan) => {
          const cleaner = byId.get(categoryPlan.category);
          if (cleaner === undefined) {
            return {
              category: categoryPlan.category,
              preview: { countable: false, items: 0, note: missing(categoryPlan.category).error },
            };
          }
          try {
            return { category: categoryPlan.category, preview: await cleaner.preview(categoryPlan) };
          } catch (cause) {
            return {
              category: categoryPlan.category,
              preview: {
                countable: false,
                items: 0,
                note: cause instanceof Error ? cause.message : String(cause),
              },
            };
          }
        }),
      );
    },

    async clean(plan: Plan, at: number): Promise<CategoryResult[]> {
      const results: CategoryResult[] = [];

      for (const categoryPlan of plan.categories) {
        const cleaner = byId.get(categoryPlan.category);
        if (cleaner === undefined) {
          results.push({ category: categoryPlan.category, report: missing(categoryPlan.category) });
          continue;
        }
        if (categoryPlan.category === 'cookies' && options.backup !== undefined) {
          try {
            await options.backup(categoryPlan);
          } catch (cause) {
            const reason = cause instanceof Error ? cause.message : String(cause);
            results.push({
              category: categoryPlan.category,
              report: {
                status: 'failed',
                deleted: 0,
                kept: 0,
                error: `sauvegarde impossible, cookies conservés : ${reason}`,
              },
            });
            continue;
          }
        }

        try {
          results.push({ category: categoryPlan.category, report: await cleaner.clean(categoryPlan) });
        } catch (cause) {
          results.push({
            category: categoryPlan.category,
            report: {
              status: 'failed',
              deleted: 0,
              kept: 0,
              error: cause instanceof Error ? cause.message : String(cause),
            },
          });
        }
      }

      const stored = await area.get(KEY);
      const previous = readJournal(stored[KEY]);
      const record: RunRecord = { profileId: plan.profileId, at, results };
      await area.set({ [KEY]: [record, ...previous].slice(0, JOURNAL_LIMIT) });

      return results;
    },

    async journal(): Promise<RunRecord[]> {
      const stored = await area.get(KEY);
      return readJournal(stored[KEY]);
    },
  };
}
