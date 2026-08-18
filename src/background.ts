import { createEngine } from './core/engine';
import type { Message, Response } from './core/messages';
import { buildPlan } from './core/planner';
import type { CategoryPlan } from './core/planner';
import { createProfileStore } from './core/profiles';
import { createSettingsStore } from './core/settings';
import { createVault } from './core/vault';
import type { StoredCookie } from './core/vault';
import { restoreDetails } from './core/restore';
import type { RestoreFailure, RestoreReport } from './core/restore';
import { buildCleaners, cachedKnownHosts } from './cleaners/index';
import type { ChromeLike } from './cleaners/index';
import { deletableCookies } from './cleaners/cookies';

const api = chrome as unknown as ChromeLike;
const area = chrome.storage.local;
const store = createProfileStore(area);
const settingsStore = createSettingsStore(area);
const vault = createVault(crypto, area);

/**
 * La phrase secrète ne vit que le temps d'une purge : elle arrive par message
 * depuis la popup, sert à dériver la clé, et n'est jamais persistée.
 */
let pendingPassphrase: string | null = null;

async function backupCookies(categoryPlan: CategoryPlan): Promise<void> {
  if (pendingPassphrase === null) {
    throw new Error('phrase secrète absente alors que le coffre est actif');
  }
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
  await vault.store(condemned, pendingPassphrase, Date.now());
}

/**
 * Un moteur neuf par message : la liste des hôtes connus est mémoïsée pour la
 * durée d'une exécution et pas au-delà. Partager un moteur entre messages ferait
 * raisonner un nettoyage sur une liste d'hôtes collectée bien plus tôt.
 * Construire les onze cleaners ne coûte que onze objets littéraux.
 */
function createRunEngine() {
  return createEngine(buildCleaners(api, cachedKnownHosts(api)), area, {
    backup: async (categoryPlan) => {
      const settings = await settingsStore.get();
      if (!settings.vaultEnabled) return;
      await backupCookies(categoryPlan);
    },
  });
}

async function profileById(id: string) {
  const profile = (await store.list()).find((candidate) => candidate.id === id);
  if (profile === undefined) throw new Error(`profil introuvable : ${id}`);
  return profile;
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

async function handle(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'LIST_PROFILES':
      return store.list();
    case 'SAVE_PROFILE':
      return store.save(message.profile);
    case 'DELETE_PROFILE':
      return store.remove(message.id);
    case 'PREVIEW':
      return createRunEngine().preview(buildPlan(await profileById(message.profileId), Date.now()));
    case 'CLEAN': {
      const now = Date.now();
      const settings = await settingsStore.get();
      await vault.purgeExpired(now, settings.vaultRetentionDays);
      pendingPassphrase = message.passphrase ?? null;
      try {
        return await createRunEngine().clean(buildPlan(await profileById(message.profileId), now), now);
      } finally {
        pendingPassphrase = null;
      }
    }
    case 'JOURNAL':
      return createRunEngine().journal();
    case 'EXPORT':
      return store.exportJson();
    case 'IMPORT':
      return store.importJson(message.json);
    case 'GET_SETTINGS':
      return settingsStore.get();
    case 'SAVE_SETTINGS':
      return settingsStore.save(message.settings);
    case 'VAULT_DESCRIBE':
      return vault.describe();
    case 'VAULT_RESTORE':
      return restore(message.passphrase);
    case 'VAULT_CLEAR':
      return vault.clear();
  }
}

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
