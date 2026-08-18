import { describe, it, expect } from 'vitest';
import { createRouter } from '../../src/core/router';
import type { RouterDeps } from '../../src/core/router';
import type { Engine } from '../../src/core/engine';
import type { Profile } from '../../src/core/types';
import type { Settings } from '../../src/core/settings';

const PROFILE: Profile = {
  id: 'p1',
  name: 'Test',
  since: 'all',
  categories: ['cookies'],
  keepRules: [],
};

function fakeDeps(overrides: Partial<RouterDeps> = {}) {
  const passphrases: (string | null)[] = [];
  const purges: { now: number; days: number }[] = [];
  const settings: Settings = { vaultEnabled: true, vaultRetentionDays: 7 };

  const engine: Engine = {
    async preview() {
      return [];
    },
    async clean() {
      return [];
    },
    async journal() {
      return [];
    },
  };

  const deps: RouterDeps = {
    profiles: {
      async list() {
        return [PROFILE];
      },
      async save() {},
      async remove() {},
      async exportJson() {
        return '[]';
      },
      async importJson() {},
    },
    settings: {
      async get() {
        return settings;
      },
      async save() {},
    },
    vault: {
      async store() {},
      async read() {
        return [];
      },
      async describe() {
        return null;
      },
      async purgeExpired(now: number, days: number) {
        purges.push({ now, days });
        return false;
      },
      async clear() {},
    },
    engineFor(passphrase) {
      passphrases.push(passphrase);
      return engine;
    },
    async restore() {
      return { restored: 0, failures: [] };
    },
    now: () => 1000,
    ...overrides,
  };

  return { deps, passphrases, purges };
}

describe('createRouter', () => {
  it('transmet la phrase secrète du message au moteur, sans état de module', async () => {
    const { deps, passphrases } = fakeDeps();
    const handle = createRouter(deps);

    // Deux nettoyages concurrents : chacun doit garder sa propre phrase.
    await Promise.all([
      handle({ type: 'CLEAN', profileId: 'p1', passphrase: 'phrase A' }),
      handle({ type: 'CLEAN', profileId: 'p1', passphrase: 'phrase B' }),
    ]);

    expect(passphrases.sort()).toEqual(['phrase A', 'phrase B']);
  });

  it('passe null quand aucune phrase n’accompagne le nettoyage', async () => {
    const { deps, passphrases } = fakeDeps();
    await createRouter(deps)({ type: 'CLEAN', profileId: 'p1' });
    expect(passphrases).toEqual([null]);
  });

  it('purge le coffre expiré avant de nettoyer', async () => {
    const { deps, purges } = fakeDeps();
    await createRouter(deps)({ type: 'CLEAN', profileId: 'p1' });
    expect(purges).toEqual([{ now: 1000, days: 7 }]);
  });

  it('rejette un profil inconnu en le nommant', async () => {
    const { deps } = fakeDeps();
    await expect(createRouter(deps)({ type: 'PREVIEW', profileId: 'absent' })).rejects.toThrow(
      /profil introuvable : absent/,
    );
  });

  it('rejette un message inconnu au lieu de répondre un succès vide', async () => {
    const { deps } = fakeDeps();
    const handle = createRouter(deps);
    await expect(handle({ type: 'DROP_EVERYTHING' } as never)).rejects.toThrow(/message inconnu/);
  });

  it('ne purge pas le coffre pour un simple aperçu', async () => {
    const { deps, purges } = fakeDeps();
    await createRouter(deps)({ type: 'PREVIEW', profileId: 'p1' });
    expect(purges).toEqual([]);
  });
});
