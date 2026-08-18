import type { Engine } from './engine';
import type { Message } from './messages';
import { buildPlan } from './planner';
import type { ProfileStore } from './profiles';
import type { RestoreReport } from './restore';
import type { SettingsStore } from './settings';
import type { Vault } from './vault';

/**
 * Tout ce que le routeur touche au navigateur, injecté. `background.ts` ne
 * garde que le câblage à `chrome.*` ; la logique de routage se teste sans lui.
 */
export type RouterDeps = {
  profiles: ProfileStore;
  settings: SettingsStore;
  vault: Vault;
  /**
   * Un moteur par message. La phrase secrète est passée ici plutôt que gardée
   * dans une variable de module : deux nettoyages concurrents ne peuvent plus
   * se voler leur phrase ni se l'effacer mutuellement.
   */
  engineFor: (passphrase: string | null) => Engine;
  restore: (passphrase: string) => Promise<RestoreReport>;
  now: () => number;
};

export function createRouter(deps: RouterDeps): (message: Message) => Promise<unknown> {
  async function profileById(id: string) {
    const profile = (await deps.profiles.list()).find((candidate) => candidate.id === id);
    if (profile === undefined) throw new Error(`profil introuvable : ${id}`);
    return profile;
  }

  return async function handle(message: Message): Promise<unknown> {
    switch (message.type) {
      case 'LIST_PROFILES':
        return deps.profiles.list();
      case 'SAVE_PROFILE':
        return deps.profiles.save(message.profile);
      case 'DELETE_PROFILE':
        return deps.profiles.remove(message.id);
      case 'PREVIEW': {
        const plan = buildPlan(await profileById(message.profileId), deps.now());
        return deps.engineFor(null).preview(plan);
      }
      case 'CLEAN': {
        const now = deps.now();
        const settings = await deps.settings.get();
        await deps.vault.purgeExpired(now, settings.vaultRetentionDays);
        const plan = buildPlan(await profileById(message.profileId), now);
        return deps.engineFor(message.passphrase ?? null).clean(plan, now);
      }
      case 'JOURNAL':
        return deps.engineFor(null).journal();
      case 'EXPORT':
        return deps.profiles.exportJson();
      case 'IMPORT':
        return deps.profiles.importJson(message.json);
      case 'GET_SETTINGS':
        return deps.settings.get();
      case 'SAVE_SETTINGS':
        return deps.settings.save(message.settings);
      case 'VAULT_DESCRIBE':
        return deps.vault.describe();
      case 'VAULT_RESTORE':
        return deps.restore(message.passphrase);
      case 'VAULT_CLEAR':
        return deps.vault.clear();
      default:
        // Le type Message est exhaustif, mais rien ne garantit qu'un message
        // reçu à l'exécution le respecte. Répondre `{ok: true, data: undefined}`
        // à un message inconnu ferait passer un bug d'appelant pour un succès.
        throw new Error(`message inconnu : ${JSON.stringify((message as { type: unknown }).type)}`);
    }
  };
}
