import { describe, it, expect } from 'vitest';
import { createSettingsStore, DEFAULT_SETTINGS, MAX_RETENTION_DAYS } from '../../src/core/settings';
import type { StorageArea } from '../../src/core/profiles';

function fakeArea(initial: Record<string, unknown> = {}): StorageArea {
  const data = { ...initial };
  return {
    async get(key: string) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
    },
  };
}

describe('createSettingsStore', () => {
  it('rend les réglages par défaut quand rien n’est enregistré', async () => {
    expect(await createSettingsStore(fakeArea()).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('désactive le coffre par défaut', () => {
    expect(DEFAULT_SETTINGS.vaultEnabled).toBe(false);
  });

  it('relit ce qui a été enregistré', async () => {
    const store = createSettingsStore(fakeArea());
    await store.save({ vaultEnabled: true, vaultRetentionDays: 3 });
    expect(await store.get()).toEqual({ vaultEnabled: true, vaultRetentionDays: 3 });
  });

  it('retombe sur les défauts devant un contenu malformé', async () => {
    const store = createSettingsStore(fakeArea({ settings: 'pas un objet' }));
    expect(await store.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('complète un enregistrement partiel avec les défauts', async () => {
    const store = createSettingsStore(fakeArea({ settings: { vaultEnabled: true } }));
    expect(await store.get()).toEqual({
      vaultEnabled: true,
      vaultRetentionDays: DEFAULT_SETTINGS.vaultRetentionDays,
    });
  });

  it('refuse une rétention hors bornes', async () => {
    const store = createSettingsStore(fakeArea());
    await expect(store.save({ vaultEnabled: true, vaultRetentionDays: 0 })).rejects.toThrow(/rétention/i);
    await expect(
      store.save({ vaultEnabled: true, vaultRetentionDays: MAX_RETENTION_DAYS + 1 }),
    ).rejects.toThrow(/rétention/i);
  });

  it('refuse une rétention non entière', async () => {
    const store = createSettingsStore(fakeArea());
    await expect(store.save({ vaultEnabled: true, vaultRetentionDays: 2.5 })).rejects.toThrow(/rétention/i);
  });

  it('remplace une rétention hors bornes par le défaut au lieu de la propager', async () => {
    for (const stored of [0, -5, 1000, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const store = createSettingsStore(
        fakeArea({ settings: { vaultEnabled: true, vaultRetentionDays: stored } }),
      );
      const settings = await store.get();
      // Une rétention NaN rend `now - createdAt < NaN` toujours faux : le coffre
      // ne serait jamais purgé, et des jetons de session vivraient indéfiniment.
      expect(settings.vaultRetentionDays).toBe(DEFAULT_SETTINGS.vaultRetentionDays);
      expect(settings.vaultEnabled).toBe(true);
    }
  });

  it('garde une rétention valide aux deux bornes', async () => {
    for (const stored of [1, MAX_RETENTION_DAYS]) {
      const store = createSettingsStore(
        fakeArea({ settings: { vaultEnabled: false, vaultRetentionDays: stored } }),
      );
      expect((await store.get()).vaultRetentionDays).toBe(stored);
    }
  });
});
