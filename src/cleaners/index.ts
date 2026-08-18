import { normalizeHost } from '../core/matcher';
import type { Cleaner } from '../core/types';
import { createCookiesCleaner } from './cookies';
import type { CookiesApi } from './cookies';
import { createCredentialsCleaner } from './credentials';
import { createDownloadsCleaner } from './downloads';
import type { DownloadsApi } from './downloads';
import { createHistoryCleaner, hostOf } from './history';
import type { HistoryApi } from './history';
import { createHttpCacheCleaner } from './httpCache';
import { createSiteSettingsCleaner } from './siteSettings';
import type { ContentSettingsApi } from './siteSettings';
import { createStorageCleaner } from './storage';
import type { BrowsingDataApi, OriginSource } from './storage';

export type ChromeLike = BrowsingDataApi &
  CookiesApi &
  Partial<HistoryApi> &
  Partial<DownloadsApi> &
  Partial<ContentSettingsApi>;

export async function collectKnownHosts(api: ChromeLike): Promise<string[]> {
  const hosts = new Set<string>();

  // `cookies` est une permission obligatoire du manifeste : si elle échoue, la
  // liste d'hôtes serait incomplète et les règles à wildcard ne protégeraient
  // qu'une partie des sites. L'erreur remonte donc au moteur, qui marque la
  // catégorie en échec — mieux vaut ne rien supprimer que sous-protéger.
  for (const cookie of await api.cookies.getAll({})) hosts.add(normalizeHost(cookie.domain));

  try {
    const items = (await api.history?.search({ text: '', startTime: 0, maxResults: 5000 })) ?? [];
    for (const item of items) {
      const host = item.url === undefined ? null : hostOf(item.url);
      if (host !== null) hosts.add(host);
    }
  } catch {
    // Permission `history` non accordée : la liste reste partielle, c'est annoncé dans l'aperçu.
  }

  return [...hosts];
}

/**
 * Mémoïse `collectKnownHosts` pour une exécution.
 *
 * `protectedOrigins` appelle cette source une fois par règle à wildcard, et
 * `engine.preview` lance les quatre cleaners de stockage en parallèle : sans
 * mémoïsation, un profil complet avec trois règles à wildcard déclenchait douze
 * `cookies.getAll` et douze `history.search` concurrents pour le même résultat.
 *
 * Un échec n'est pas mémorisé : le service worker peut être réveillé avant que
 * les API soient prêtes, et le prochain appel doit pouvoir réussir.
 *
 * La durée de vie voulue est celle d'un message, pas celle du service worker —
 * `background.ts` en crée donc une par message, pour ne jamais raisonner sur une
 * liste d'hôtes périmée.
 */
export function cachedKnownHosts(api: ChromeLike): OriginSource {
  let pending: Promise<string[]> | undefined;
  return () => {
    pending ??= collectKnownHosts(api).catch((cause: unknown) => {
      pending = undefined;
      throw cause;
    });
    return pending;
  };
}

export function buildCleaners(
  api: ChromeLike,
  knownHosts: OriginSource,
  chromeMajor: number | null = null,
): Cleaner[] {
  return [
    createCookiesCleaner(api),
    createStorageCleaner(api, 'localStorage', knownHosts),
    createStorageCleaner(api, 'indexedDB', knownHosts),
    createStorageCleaner(api, 'cacheStorage', knownHosts),
    createStorageCleaner(api, 'serviceWorkers', knownHosts),
    createHttpCacheCleaner(api, knownHosts),
    createHistoryCleaner(api as HistoryApi),
    createDownloadsCleaner(api as DownloadsApi),
    createCredentialsCleaner(api, 'formData', chromeMajor),
    createCredentialsCleaner(api, 'passwords', chromeMajor),
    createSiteSettingsCleaner(api as ContentSettingsApi),
  ];
}
