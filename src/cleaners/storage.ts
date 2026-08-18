import { matchesPattern } from '../core/matcher';
import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, Preview } from '../core/types';

export type BrowsingDataApi = {
  browsingData: {
    remove(
      options: chrome.browsingData.RemovalOptions,
      types: Record<string, boolean>,
    ): Promise<void>;
  };
};

export type OriginSource = () => Promise<string[]>;

export type StorageCategory = 'localStorage' | 'indexedDB' | 'cacheStorage' | 'serviceWorkers';

const PARTIAL_NOTE =
  "Liste des origines dérivée des cookies et de l'historique : c'est un minorant, la liste n'est pas exhaustive.";

async function protectedOrigins(
  plan: CategoryPlan,
  knownHosts: OriginSource,
): Promise<string[]> {
  const hosts = new Set<string>();

  for (const rule of plan.keepRules) {
    if (rule.pattern.includes('*')) {
      for (const host of await knownHosts()) {
        if (matchesPattern(host, rule.pattern)) hosts.add(host);
      }
    } else {
      hosts.add(rule.pattern.toLowerCase());
    }
  }

  return [...hosts].flatMap((host) => [`https://${host}`, `http://${host}`]);
}

export function createStorageCleaner(
  api: BrowsingDataApi,
  category: StorageCategory,
  knownHosts: OriginSource,
): Cleaner {
  return {
    id: category,
    perSite: 'origin',

    async preview(plan: CategoryPlan): Promise<Preview> {
      // Compter les origines puis diviser par deux supposerait que l'expansion
      // rende toujours exactement un https et un http par hôte : un invariant
      // couplé et silencieux. On compte les hôtes.
      const hosts = new Set(
        (await protectedOrigins(plan, knownHosts)).map((origin) => new URL(origin).host),
      );
      return {
        countable: false,
        items: 0,
        note: `${hosts.size} origine(s) protégée(s). ${PARTIAL_NOTE}`,
      };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      const excludeOrigins = await protectedOrigins(plan, knownHosts);
      const options: chrome.browsingData.RemovalOptions = { since: plan.since };
      if (excludeOrigins.length > 0) options.excludeOrigins = excludeOrigins;

      try {
        await api.browsingData.remove(options, { [category]: true });
        // `countable: false` : l'API ne rend aucun décompte. Sans ce drapeau,
        // l'interface afficherait « 0 supprimé » après avoir tout vidé.
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
