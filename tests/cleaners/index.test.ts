import { describe, it, expect } from 'vitest';
import { buildCleaners, cachedKnownHosts, collectKnownHosts } from '../../src/cleaners/index';
import { ALL_CATEGORIES } from '../../src/core/types';

function fakeChrome() {
  return {
    browsingData: { async remove() {} },
    cookies: {
      async getAll() {
        return [{ name: 'a', domain: '.github.com', path: '/', secure: true }];
      },
      async remove() {},
    },
    history: {
      async search() {
        return [{ url: 'https://example.com/a', lastVisitTime: 1 }];
      },
      async deleteUrl() {},
    },
    downloads: {
      async search() {
        return [];
      },
      async erase() {
        return [];
      },
    },
    contentSettings: {},
  } as never;
}

describe('buildCleaners', () => {
  it('fournit un cleaner pour chaque catégorie déclarée', () => {
    const ids = buildCleaners(fakeChrome(), async () => []).map((cleaner) => cleaner.id);
    expect(ids.sort()).toEqual([...ALL_CATEGORIES].sort());
  });

  it('déclare la finesse réelle de chaque catégorie', () => {
    const byId = new Map(buildCleaners(fakeChrome(), async () => []).map((c) => [c.id, c.perSite]));
    expect(byId.get('cookies')).toBe('exact');
    expect(byId.get('localStorage')).toBe('origin');
    expect(byId.get('httpCache')).toBe('none');
    expect(byId.get('passwords')).toBe('none');
    expect(byId.get('formData')).toBe('none');
  });
});

describe('collectKnownHosts', () => {
  it("réunit les hôtes des cookies et de l'historique, sans doublon", async () => {
    const hosts = await collectKnownHosts(fakeChrome());
    expect(hosts.sort()).toEqual(['example.com', 'github.com']);
  });

  it('ignore silencieusement une API indisponible', async () => {
    const partial = {
      cookies: {
        async getAll() {
          return [];
        },
      },
    } as never;
    expect(await collectKnownHosts(partial)).toEqual([]);
  });

  it("remonte l'erreur si même les cookies sont refusés", async () => {
    const refused = {
      cookies: {
        async getAll(): Promise<never> {
          throw new Error('permission cookies refusée');
        },
      },
    } as never;
    await expect(collectKnownHosts(refused)).rejects.toThrow(/permission cookies refusée/);
  });
});

describe('cachedKnownHosts', () => {
  it("n'interroge le navigateur qu'une fois, quel que soit le nombre d'appels", async () => {
    let cookieCalls = 0;
    let historyCalls = 0;
    const api = {
      cookies: {
        async getAll() {
          cookieCalls += 1;
          return [{ name: 'a', domain: '.github.com', path: '/', secure: true }];
        },
      },
      history: {
        async search() {
          historyCalls += 1;
          return [{ url: 'https://example.com/a', lastVisitTime: 1 }];
        },
      },
    } as never;

    const source = cachedKnownHosts(api);
    const results = await Promise.all([source(), source(), source()]);

    expect(cookieCalls).toBe(1);
    expect(historyCalls).toBe(1);
    for (const hosts of results) expect([...hosts].sort()).toEqual(['example.com', 'github.com']);
  });

  it('ne mémorise pas un échec : le prochain appel réessaie', async () => {
    let calls = 0;
    const api = {
      cookies: {
        async getAll() {
          calls += 1;
          if (calls === 1) throw new Error('service worker réveillé trop tôt');
          return [];
        },
      },
    } as never;

    const source = cachedKnownHosts(api);
    await expect(source()).rejects.toThrow(/réveillé trop tôt/);
    expect(await source()).toEqual([]);
    expect(calls).toBe(2);
  });
});
