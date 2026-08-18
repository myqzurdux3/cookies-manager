import { msg } from '../i18n';
import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, Preview } from '../core/types';
import { protectedOrigins } from './storage';
import type { BrowsingDataApi, OriginSource } from './storage';

/**
 * L'API accepte `excludeOrigins` pour le cache depuis Chrome 74 — contrairement
 * à ce que ce fichier a longtemps affirmé. Mais le filtre porte sur l'URL de la
 * **ressource**, pas sur le site visité : protéger `exemple.com` préserve ce que
 * sert `exemple.com`, pas les images, polices et scripts que la page charge
 * depuis un CDN tiers.
 *
 * La protection est donc partielle, et le dire fait partie de la protection.
 */

export function createHttpCacheCleaner(api: BrowsingDataApi, knownHosts: OriginSource): Cleaner {
  return {
    id: 'httpCache',
    perSite: 'origin',

    async preview(plan: CategoryPlan): Promise<Preview> {
      const origins = await protectedOrigins(plan, knownHosts);
      return {
        countable: false,
        items: 0,
        note:
          origins.length === 0
            ? msg().notes.httpCacheBlock
            : `${msg().notes.httpCacheBlock} ${msg().notes.httpCachePartial}`,
      };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      const excludeOrigins = await protectedOrigins(plan, knownHosts);
      const options: chrome.browsingData.RemovalOptions = { since: plan.since };
      if (excludeOrigins.length > 0) options.excludeOrigins = excludeOrigins;

      try {
        await api.browsingData.remove(options, { cache: true });
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
