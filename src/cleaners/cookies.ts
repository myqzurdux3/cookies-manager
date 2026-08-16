import { cookieProtection, normalizeHost } from '../core/matcher';
import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, Preview } from '../core/types';

export type CookiesApi = {
  cookies: {
    getAll(details: object): Promise<chrome.cookies.Cookie[]>;
    remove(details: { url: string; name: string; storeId?: string }): Promise<unknown>;
  };
};

const TIME_NOTE =
  "Le filtre de période ne s'applique pas aux cookies : l'API ne fournit pas leur date de création.";

export function cookieUrl(cookie: { domain: string; path: string; secure: boolean }): string {
  const scheme = cookie.secure ? 'https' : 'http';
  return `${scheme}://${normalizeHost(cookie.domain)}${cookie.path}`;
}

function isDeletable(cookie: chrome.cookies.Cookie, plan: CategoryPlan): boolean {
  const protection = cookieProtection(cookie.domain, plan.keepRules);
  if (protection.all) return false;
  return !protection.names.has(cookie.name);
}

/**
 * Les cookies que ce plan supprimerait. Exporté pour que le coffre sauvegarde
 * exactement ce qui va disparaître, sans dupliquer la règle de sélection.
 */
export function deletableCookies(
  cookies: chrome.cookies.Cookie[],
  plan: CategoryPlan,
): chrome.cookies.Cookie[] {
  return cookies.filter((cookie) => isDeletable(cookie, plan));
}

export function createCookiesCleaner(api: CookiesApi): Cleaner {
  return {
    id: 'cookies',
    perSite: 'exact',

    async preview(plan: CategoryPlan): Promise<Preview> {
      const cookies = await api.cookies.getAll({});
      const items = cookies.filter((cookie) => isDeletable(cookie, plan)).length;
      return plan.since === 0 ? { countable: true, items } : { countable: true, items, note: TIME_NOTE };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      const cookies = await api.cookies.getAll({});
      let deleted = 0;
      let kept = 0;
      let error: string | undefined;

      for (const cookie of cookies) {
        if (!isDeletable(cookie, plan)) {
          kept += 1;
          continue;
        }
        try {
          await api.cookies.remove({
            url: cookieUrl(cookie),
            name: cookie.name,
            storeId: cookie.storeId,
          });
          deleted += 1;
        } catch (cause) {
          error ??= cause instanceof Error ? cause.message : String(cause);
        }
      }

      return { status: error === undefined ? 'ok' : 'partial', deleted, kept, error };
    },
  };
}
