import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, KeepRule, Preview } from '../core/types';

export const MANAGED_TYPES = [
  'notifications',
  'location',
  'camera',
  'microphone',
  'popups',
  'automaticDownloads',
];

type SettingApi = {
  get(details: { primaryUrl: string }): Promise<{ setting: string }>;
  set(details: { primaryPattern: string; setting: string; scope?: string }): Promise<void>;
  clear(details: { scope: string }): Promise<void>;
};

export type ContentSettingsApi = {
  contentSettings: Record<string, SettingApi>;
};

const WILDCARD_NOTE =
  "Les motifs à wildcard ne sont pas restaurables pour cette catégorie : l'API exige une URL concrète pour relire un réglage. Utilisez des motifs exacts pour les autorisations à conserver.";

/**
 * Seules les règles protégeant explicitement cette catégorie comptent : une règle
 * qui ne garde que les cookies d'un domaine ne doit pas faire survivre ses
 * autorisations de site.
 */
function relevantRules(plan: CategoryPlan): KeepRule[] {
  return plan.keepRules.filter((rule) => rule.keep.siteSettings === true);
}

function concreteHosts(plan: CategoryPlan): string[] {
  return relevantRules(plan)
    .map((rule) => rule.pattern.toLowerCase())
    .filter((pattern) => !pattern.includes('*'));
}

export function createSiteSettingsCleaner(api: ContentSettingsApi): Cleaner {
  return {
    id: 'siteSettings',
    perSite: 'origin',

    async preview(plan: CategoryPlan): Promise<Preview> {
      const hosts = concreteHosts(plan);
      const hasWildcard = relevantRules(plan).some((rule) => rule.pattern.includes('*'));
      return {
        countable: false,
        items: hosts.length,
        note: hasWildcard ? WILDCARD_NOTE : undefined,
      };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      const hosts = concreteHosts(plan);
      let restored = 0;
      let error: string | undefined;

      for (const type of MANAGED_TYPES) {
        const setting = api.contentSettings[type];
        if (setting === undefined) continue;

        const snapshot: { url: string; value: string }[] = [];
        try {
          for (const host of hosts) {
            const url = `https://${host}`;
            const current = await setting.get({ primaryUrl: url });
            if (current.setting !== 'default') snapshot.push({ url, value: current.setting });
          }

          await setting.clear({ scope: 'regular' });

          for (const entry of snapshot) {
            await setting.set({ primaryPattern: `${entry.url}/*`, setting: entry.value });
            restored += 1;
          }
        } catch (cause) {
          error ??= cause instanceof Error ? cause.message : String(cause);
        }
      }

      return {
        status: error === undefined ? 'ok' : 'partial',
        deleted: 0,
        kept: restored,
        error,
      };
    },
  };
}
