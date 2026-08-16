import { describe, it, expect } from 'vitest';
import { buildCleaners, collectKnownHosts } from '../../src/cleaners/index';
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
});
