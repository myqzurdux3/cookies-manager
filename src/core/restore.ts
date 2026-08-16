import { cookieUrl } from '../cleaners/cookies';
import type { StoredCookie } from './vault';

export type RestoreFailure = { name: string; domain: string; error: string };
export type RestoreReport = { restored: number; failures: RestoreFailure[] };

/**
 * Reconstruit les paramètres de `chrome.cookies.set` pour un cookie sauvegardé.
 *
 * Les préfixes de nom imposent des contraintes que le navigateur fait respecter
 * en refusant le cookie :
 * - `__Host-` : aucun attribut `domain`, chemin racine, connexion sécurisée.
 * - `__Secure-` : connexion sécurisée.
 *
 * Un cookie host-only doit lui aussi être posé sans `domain`, sinon il devient
 * un cookie de domaine et fuit vers les sous-domaines.
 */
export function restoreDetails(cookie: StoredCookie): chrome.cookies.SetDetails {
  const isHostPrefixed = cookie.name.startsWith('__Host-');
  const isSecurePrefixed = cookie.name.startsWith('__Secure-');

  const secure = cookie.secure || isHostPrefixed || isSecurePrefixed;
  const path = isHostPrefixed ? '/' : cookie.path;
  const omitDomain = isHostPrefixed || cookie.hostOnly === true;

  const details: chrome.cookies.SetDetails = {
    url: cookieUrl({ domain: cookie.domain, path, secure }),
    name: cookie.name,
    value: cookie.value,
    path,
    secure,
  };

  if (!omitDomain) details.domain = cookie.domain;
  if (cookie.httpOnly !== undefined) details.httpOnly = cookie.httpOnly;
  if (cookie.sameSite !== undefined) details.sameSite = cookie.sameSite;
  if (cookie.storeId !== undefined) details.storeId = cookie.storeId;
  if (cookie.session !== true && cookie.expirationDate !== undefined) {
    details.expirationDate = cookie.expirationDate;
  }

  return details;
}
