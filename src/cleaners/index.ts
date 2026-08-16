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

  try {
    for (const cookie of await api.cookies.getAll({})) hosts.add(normalizeHost(cookie.domain));
  } catch {
    // API indisponible : on continue avec ce qu'on a.
  }

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

export function buildCleaners(api: ChromeLike, knownHosts: OriginSource): Cleaner[] {
  return [
    createCookiesCleaner(api),
    createStorageCleaner(api, 'localStorage', knownHosts),
    createStorageCleaner(api, 'indexedDB', knownHosts),
    createStorageCleaner(api, 'cacheStorage', knownHosts),
    createStorageCleaner(api, 'serviceWorkers', knownHosts),
    createHttpCacheCleaner(api),
    createHistoryCleaner(api as HistoryApi),
    createDownloadsCleaner(api as DownloadsApi),
    createCredentialsCleaner(api, 'formData'),
    createCredentialsCleaner(api, 'passwords'),
    createSiteSettingsCleaner(api as ContentSettingsApi),
  ];
}
