import { createEngine } from './core/engine';
import type { Engine } from './core/engine';
import type { Message, Response } from './core/messages';
import type { CategoryPlan } from './core/planner';
import { createProfileStore } from './core/profiles';
import { createRouter } from './core/router';
import { createSettingsStore } from './core/settings';
import { createVault } from './core/vault';
import type { StoredCookie } from './core/vault';
import { restoreDetails } from './core/restore';
import type { RestoreFailure, RestoreReport } from './core/restore';
import { buildCleaners, cachedKnownHosts } from './cleaners/index';
import type { ChromeLike } from './cleaners/index';
import { deletableCookies } from './cleaners/cookies';
import { chromeMajorVersion } from './cleaners/credentials';

const api = chrome as unknown as ChromeLike;
const area = chrome.storage.local;
const store = createProfileStore(area);
const settingsStore = createSettingsStore(area);
const vault = createVault(crypto, area);
const chromeMajor = chromeMajorVersion(navigator.userAgent);

async function backupCookies(categoryPlan: CategoryPlan, passphrase: string): Promise<void> {
  const cookies = await api.cookies.getAll({});
  const condemned: StoredCookie[] = deletableCookies(cookies, categoryPlan).map((cookie) => ({
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    value: cookie.value,
    storeId: cookie.storeId,
    hostOnly: cookie.hostOnly,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    session: cookie.session,
    expirationDate: cookie.expirationDate,
  }));
  await vault.store(condemned, passphrase, Date.now());
}

/**
 * Un moteur neuf par message, portant la phrase secrète de ce message.
 *
 * La phrase ne vit donc que le temps d'un nettoyage et n'est jamais persistée.
 * Elle transite par la fermeture plutôt que par une variable de module : deux
 * nettoyages concurrents ne peuvent plus se voler leur phrase ni l'effacer sous
 * les pieds de l'autre.
 *
 * La liste des hôtes connus est mémoïsée à la même échelle : partagée plus
 * longtemps, elle ferait raisonner un nettoyage sur des hôtes périmés, donc
 * sous-protéger des sites de la keep-list.
 */
function engineFor(passphrase: string | null): Engine {
  return createEngine(buildCleaners(api, cachedKnownHosts(api), chromeMajor), area, {
    backup: async (categoryPlan) => {
      const settings = await settingsStore.get();
      if (!settings.vaultEnabled) return;
      if (passphrase === null) {
        throw new Error('phrase secrète absente alors que le coffre est actif');
      }
      await backupCookies(categoryPlan, passphrase);
    },
  });
}

/**
 * Un cookie refusé par le navigateur ne doit pas emporter toute la restauration :
 * on rapporte les échecs au lieu d'interrompre la boucle.
 */
async function restore(passphrase: string): Promise<RestoreReport> {
  const cookies = await vault.read(passphrase);
  const failures: RestoreFailure[] = [];
  let restored = 0;

  for (const cookie of cookies) {
    try {
      await chrome.cookies.set(restoreDetails(cookie));
      restored += 1;
    } catch (cause) {
      failures.push({
        name: cookie.name,
        domain: cookie.domain,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return { restored, failures };
}

/**
 * La rétention du coffre est une promesse de sécurité : passé le délai, des
 * jetons de session chiffrés ne doivent plus traîner. Purger uniquement au
 * moment d'un nettoyage ne la tenait pas — un utilisateur qui n'en relance
 * jamais gardait son coffre indéfiniment.
 */
async function purgeExpiredVault(): Promise<void> {
  const settings = await settingsStore.get();
  await vault.purgeExpired(Date.now(), settings.vaultRetentionDays);
}

chrome.runtime.onStartup.addListener(() => void purgeExpiredVault());
chrome.runtime.onInstalled.addListener(() => void purgeExpiredVault());

const handle = createRouter({
  profiles: store,
  settings: settingsStore,
  vault,
  engineFor,
  restore,
  now: () => Date.now(),
});

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handle(message)
    .then((data) => sendResponse({ ok: true, data } satisfies Response))
    .catch((cause: unknown) =>
      sendResponse({
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause),
      } satisfies Response),
    );
  return true;
});
