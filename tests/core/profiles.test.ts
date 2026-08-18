import { describe, it, expect } from 'vitest';
import { createProfileStore, defaultProfiles } from '../../src/core/profiles';
import type { StorageArea } from '../../src/core/profiles';
import type { Profile } from '../../src/core/types';

function fakeArea(
  initial: Record<string, unknown> = {},
): StorageArea & { data: Record<string, unknown> } {
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

describe('normalisation des motifs à l’enregistrement', () => {
  it('corrige un motif mal formé au lieu de le garder inerte', async () => {
    const store = createProfileStore(fakeArea());
    await store.save({
      id: 'p1',
      name: 'Test',
      since: 'all',
      categories: ['cookies'],
      keepRules: [{ pattern: '*google.com', keep: { cookies: true } }],
    });
    const saved = (await store.list()).find((p) => p.id === 'p1')!;
    expect(saved.keepRules[0]!.pattern).toBe('*.google.com');
  });

  it('refuse un motif impossible à normaliser', async () => {
    const store = createProfileStore(fakeArea());
    await expect(
      store.save({
        id: 'p1',
        name: 'Test',
        since: 'all',
        categories: ['cookies'],
        keepRules: [{ pattern: 'git*hub.com', keep: { cookies: true } }],
      }),
    ).rejects.toThrow(/motif/i);
  });

  it('répare à la lecture un motif inerte déjà enregistré', async () => {
    const store = createProfileStore(
      fakeArea({
        profiles: [
          {
            id: 'p1',
            name: 'Ancien',
            since: 'all',
            categories: ['cookies'],
            keepRules: [{ pattern: '*google.com', keep: { cookies: true } }],
          },
        ],
      }),
    );
    expect((await store.list())[0]!.keepRules[0]!.pattern).toBe('*.google.com');
  });

  it('laisse passer un motif irrécupérable au lieu de rendre la liste illisible', async () => {
    const store = createProfileStore(
      fakeArea({
        profiles: [
          {
            id: 'p1',
            name: 'Ancien',
            since: 'all',
            categories: ['cookies'],
            keepRules: [{ pattern: 'git*hub.com', keep: { cookies: true } }],
          },
        ],
      }),
    );
    expect((await store.list())[0]!.keepRules[0]!.pattern).toBe('git*hub.com');
  });

  it('corrige aussi les motifs d’un import', async () => {
    const store = createProfileStore(fakeArea());
    await store.importJson(
      JSON.stringify([
        {
          id: 'p1',
          name: 'Test',
          since: 'all',
          categories: ['cookies'],
          keepRules: [{ pattern: '.claude.ai', keep: { cookies: true } }],
        },
      ]),
    );
    expect((await store.list())[0]!.keepRules[0]!.pattern).toBe('*.claude.ai');
  });
});

describe('createProfileStore', () => {
  it('rend les profils par défaut quand le stockage est vide', async () => {
    const store = createProfileStore(fakeArea());
    expect(await store.list()).toEqual(defaultProfiles());
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

  it("rejette un JSON qui n'est pas une liste de profils", async () => {
    const store = createProfileStore(fakeArea({ profiles: [] }));
    await expect(store.importJson('{"nope": 1}')).rejects.toThrow('format de profils invalide');
  });

  it('rejette un profil importé dont le motif de keep-list est vide', async () => {
    const store = createProfileStore(fakeArea({ profiles: [] }));
    const bad = JSON.stringify([{ ...sample, keepRules: [{ pattern: '', keep: {} }] }]);
    await expect(store.importJson(bad)).rejects.toThrow('motif vide');
  });

  it('ne mutate pas les profils par défaut quand le stockage est genuinely vide', async () => {
    // First store saves a profile to genuinely empty storage (no "profiles" key)
    const store1 = createProfileStore(fakeArea());
    await store1.save(sample);

    // Second store over a second empty area should still get untouched defaults
    const store2 = createProfileStore(fakeArea());
    const defaults = await store2.list();
    expect(defaults).toEqual(defaultProfiles());
    expect(defaults).toHaveLength(2);
    expect(defaults[0]!.id).toBe('light');
    expect(defaults[1]!.id).toBe('full');
  });

  it('rejette un profil avec période invalide', async () => {
    const store = createProfileStore(fakeArea({ profiles: [] }));
    const bad = JSON.stringify([{ ...sample, since: 'hier' }]);
    await expect(store.importJson(bad)).rejects.toThrow('période invalide');
  });

  it('rejette un profil avec catégorie inconnue', async () => {
    const store = createProfileStore(fakeArea({ profiles: [] }));
    const bad = JSON.stringify([{ ...sample, categories: ['cookies', 'nonsense'] }]);
    await expect(store.importJson(bad)).rejects.toThrow('catégorie inconnue');
  });

  it('rejette une règle de conservation invalide', async () => {
    const store = createProfileStore(fakeArea({ profiles: [] }));
    const bad = JSON.stringify([
      { ...sample, keepRules: [{ pattern: 'example.com', keep: { cookies: false } }] },
    ]);
    await expect(store.importJson(bad)).rejects.toThrow('règle de conservation invalide');
  });

  it('rejette une liste de cookies invalide', async () => {
    const store = createProfileStore(fakeArea({ profiles: [] }));
    const bad = JSON.stringify([
      {
        ...sample,
        keepRules: [
          { pattern: 'example.com', keep: { cookies: true }, keepCookies: ['valid', 123] },
        ],
      },
    ]);
    await expect(store.importJson(bad)).rejects.toThrow('liste de cookies invalide');
  });
});

describe('defaultProfiles()', () => {
  it("n'inclut jamais les mots de passe ni les formulaires", () => {
    for (const profile of defaultProfiles()) {
      expect(profile.categories).not.toContain('passwords');
      expect(profile.categories).not.toContain('formData');
    }
  });

  describe('validation de la forme des profils importés', () => {
    // Supprimer ces six lignes de profiles.ts laissait les 198 tests verts.
    const store = () => createProfileStore(fakeArea());

    it('refuse un identifiant qui n’est pas une chaîne', async () => {
      const json = JSON.stringify([
        { id: 42, name: 'x', since: 'all', categories: [], keepRules: [] },
      ]);
      await expect(store().importJson(json)).rejects.toThrow(/format de profils invalide/);
    });

    it('refuse un nom qui n’est pas une chaîne', async () => {
      const json = JSON.stringify([
        { id: 'a', name: null, since: 'all', categories: [], keepRules: [] },
      ]);
      await expect(store().importJson(json)).rejects.toThrow(/format de profils invalide/);
    });

    it('refuse des catégories qui ne sont pas un tableau', async () => {
      const json = JSON.stringify([
        { id: 'a', name: 'x', since: 'all', categories: 'cookies', keepRules: [] },
      ]);
      await expect(store().importJson(json)).rejects.toThrow(/format de profils invalide/);
    });

    it('refuse une keep-list qui n’est pas un tableau', async () => {
      const json = JSON.stringify([
        { id: 'a', name: 'x', since: 'all', categories: [], keepRules: {} },
      ]);
      await expect(store().importJson(json)).rejects.toThrow(/format de profils invalide/);
    });

    it('refuse un profil qui n’est pas un objet', async () => {
      await expect(store().importJson(JSON.stringify(['pas un profil']))).rejects.toThrow(
        /format de profils invalide/,
      );
    });
  });

  // `keepCookies` n'est atteignable que par l'import JSON : aucune interface ne
  // sait le poser. Sa validation est donc le seul garde-fou.
  it('accepte une liste de cookies nommés à l’import', async () => {
    const store = createProfileStore(fakeArea());
    const json = JSON.stringify([
      {
        id: 'a',
        name: 'x',
        since: 'all',
        categories: ['cookies'],
        keepRules: [{ pattern: 'github.com', keep: { cookies: true }, keepCookies: ['session'] }],
      },
    ]);
    await store.importJson(json);
    const [profil] = await store.list();
    expect(profil!.keepRules[0]!.keepCookies).toEqual(['session']);
  });

  it('refuse une liste de cookies qui n’est pas un tableau de chaînes', async () => {
    const store = createProfileStore(fakeArea());
    for (const keepCookies of ['session', [42], [null]]) {
      const json = JSON.stringify([
        {
          id: 'a',
          name: 'x',
          since: 'all',
          categories: ['cookies'],
          keepRules: [{ pattern: 'github.com', keep: { cookies: true }, keepCookies }],
        },
      ]);
      await expect(store.importJson(json)).rejects.toThrow(/liste de cookies invalide/);
    }
  });

  it('refuse une règle dont le bloc de conservation n’est pas un objet', async () => {
    for (const keep of [null, 'cookies', ['cookies'], 42]) {
      const json = JSON.stringify([
        {
          id: 'a',
          name: 'x',
          since: 'all',
          categories: ['cookies'],
          keepRules: [{ pattern: 'github.com', keep }],
        },
      ]);
      await expect(createProfileStore(fakeArea()).importJson(json)).rejects.toThrow(
        /règle de conservation invalide/,
      );
    }
  });
});
