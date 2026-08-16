import { describe, it, expect } from 'vitest';
import { createProfileStore, DEFAULT_PROFILES } from '../../src/core/profiles';
import type { StorageArea } from '../../src/core/profiles';
import type { Profile } from '../../src/core/types';

function fakeArea(initial: Record<string, unknown> = {}): StorageArea & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    async get(key: string) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
    },
  };
}

const sample: Profile = {
  id: 'p1',
  name: 'Test',
  since: 'day',
  categories: ['cookies'],
  keepRules: [{ pattern: 'github.com', keep: { cookies: true } }],
};

describe('createProfileStore', () => {
  it('rend les profils par défaut quand le stockage est vide', async () => {
    const store = createProfileStore(fakeArea());
    expect(await store.list()).toEqual(DEFAULT_PROFILES);
  });

  it('enregistre puis relit un profil', async () => {
    const store = createProfileStore(fakeArea({ profiles: [] }));
    await store.save(sample);
    expect(await store.list()).toEqual([sample]);
  });

  it('remplace un profil de même identifiant au lieu de le dupliquer', async () => {
    const store = createProfileStore(fakeArea({ profiles: [sample] }));
    await store.save({ ...sample, name: 'Renommé' });
    const profiles = await store.list();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.name).toBe('Renommé');
  });

  it('supprime un profil', async () => {
    const store = createProfileStore(fakeArea({ profiles: [sample] }));
    await store.remove('p1');
    expect(await store.list()).toEqual([]);
  });

  it('fait un aller-retour par export puis import', async () => {
    const source = createProfileStore(fakeArea({ profiles: [sample] }));
    const json = await source.exportJson();
    const target = createProfileStore(fakeArea({ profiles: [] }));
    await target.importJson(json);
    expect(await target.list()).toEqual([sample]);
  });

  it('rejette un JSON qui n\'est pas une liste de profils', async () => {
    const store = createProfileStore(fakeArea({ profiles: [] }));
    await expect(store.importJson('{"nope": 1}')).rejects.toThrow('format de profils invalide');
  });

  it('rejette un profil importé dont le motif de keep-list est vide', async () => {
    const store = createProfileStore(fakeArea({ profiles: [] }));
    const bad = JSON.stringify([{ ...sample, keepRules: [{ pattern: '', keep: {} }] }]);
    await expect(store.importJson(bad)).rejects.toThrow('motif vide');
  });
});

describe('DEFAULT_PROFILES', () => {
  it('n\'inclut jamais les mots de passe ni les formulaires', () => {
    for (const profile of DEFAULT_PROFILES) {
      expect(profile.categories).not.toContain('passwords');
      expect(profile.categories).not.toContain('formData');
    }
  });
});
