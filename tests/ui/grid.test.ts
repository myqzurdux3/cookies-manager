import { describe, it, expect } from 'vitest';
import {
  COLUMNS,
  PER_SITE,
  UNFILTERABLE,
  groupState,
  removeRule,
  toggleGroup,
  toggleRule,
} from '../../src/ui/options/grid';
import { ALL_CATEGORIES } from '../../src/core/types';
import type { KeepRule } from '../../src/core/types';

describe('PER_SITE', () => {
  it('déclare une finesse pour chaque catégorie', () => {
    for (const category of ALL_CATEGORIES) expect(PER_SITE[category]).toBeDefined();
  });

  it("correspond aux limites réelles de l'API", () => {
    expect(PER_SITE.cookies).toBe('exact');
    expect(PER_SITE.httpCache).toBe('none');
    expect(PER_SITE.passwords).toBe('none');
    expect(PER_SITE.formData).toBe('none');
  });
});

describe('COLUMNS et UNFILTERABLE', () => {
  it('couvrent ensemble toutes les catégories, sans doublon', () => {
    const shown = COLUMNS.flatMap((column) => column.categories);
    const all = [...shown, ...UNFILTERABLE].sort();
    expect(all).toEqual([...ALL_CATEGORIES].sort());
    expect(new Set(all).size).toBe(all.length);
  });

  it('ne met dans le tableau que des catégories réellement filtrables', () => {
    for (const category of COLUMNS.flatMap((c) => c.categories)) {
      expect(PER_SITE[category]).not.toBe('none');
    }
  });

  it('sort du tableau exactement les catégories non filtrables', () => {
    for (const category of UNFILTERABLE) expect(PER_SITE[category]).toBe('none');
  });

  it('regroupe les quatre stockages web en une colonne', () => {
    const storage = COLUMNS.find((column) => column.key === 'storage')!;
    expect([...storage.categories].sort()).toEqual([
      'cacheStorage',
      'indexedDB',
      'localStorage',
      'serviceWorkers',
    ]);
  });
});

describe('groupState', () => {
  const storage = ['localStorage', 'indexedDB', 'cacheStorage', 'serviceWorkers'] as const;

  it('rend « none » quand aucune catégorie du groupe n’est conservée', () => {
    expect(groupState([{ pattern: 'a.com', keep: {} }], 'a.com', [...storage])).toBe('none');
  });

  it('rend « all » quand toutes le sont', () => {
    const rules: KeepRule[] = [
      {
        pattern: 'a.com',
        keep: { localStorage: true, indexedDB: true, cacheStorage: true, serviceWorkers: true },
      },
    ];
    expect(groupState(rules, 'a.com', [...storage])).toBe('all');
  });

  it('rend « partial » quand une partie seulement l’est', () => {
    const rules: KeepRule[] = [{ pattern: 'a.com', keep: { localStorage: true } }];
    expect(groupState(rules, 'a.com', [...storage])).toBe('partial');
  });

  it('rend « none » pour un motif absent', () => {
    expect(groupState([], 'inconnu.com', [...storage])).toBe('none');
  });
});

describe('toggleGroup', () => {
  const storage = ['localStorage', 'indexedDB', 'cacheStorage', 'serviceWorkers'] as const;

  it('coche toutes les catégories du groupe', () => {
    const rules = toggleGroup([], 'a.com', [...storage], true);
    expect(rules[0]!.keep).toEqual({
      localStorage: true,
      indexedDB: true,
      cacheStorage: true,
      serviceWorkers: true,
    });
  });

  it('décoche tout le groupe sans toucher aux autres catégories', () => {
    const initial: KeepRule[] = [
      { pattern: 'a.com', keep: { cookies: true, localStorage: true, indexedDB: true } },
    ];
    expect(toggleGroup(initial, 'a.com', [...storage], false)[0]!.keep).toEqual({ cookies: true });
  });

  it('supprime la règle devenue vide', () => {
    const initial: KeepRule[] = [{ pattern: 'a.com', keep: { localStorage: true } }];
    expect(toggleGroup(initial, 'a.com', [...storage], false)).toEqual([]);
  });

  it("ne modifie pas le tableau d'origine", () => {
    const initial: KeepRule[] = [{ pattern: 'a.com', keep: { localStorage: true } }];
    toggleGroup(initial, 'a.com', [...storage], true);
    expect(initial[0]!.keep).toEqual({ localStorage: true });
  });
});

describe('removeRule', () => {
  it('retire la ligne visée', () => {
    const initial: KeepRule[] = [
      { pattern: 'github.com', keep: { cookies: true } },
      { pattern: 'example.com', keep: { history: true } },
    ];
    expect(removeRule(initial, 'github.com')).toEqual([
      { pattern: 'example.com', keep: { history: true } },
    ]);
  });

  it('ignore un motif absent', () => {
    const initial: KeepRule[] = [{ pattern: 'github.com', keep: { cookies: true } }];
    expect(removeRule(initial, 'inconnu.com')).toEqual(initial);
  });

  it("ne modifie pas le tableau d'origine", () => {
    const initial: KeepRule[] = [{ pattern: 'github.com', keep: { cookies: true } }];
    removeRule(initial, 'github.com');
    expect(initial).toHaveLength(1);
  });
});

describe('toggleRule', () => {
  it('crée une règle quand le motif est absent', () => {
    const rules = toggleRule([], 'github.com', 'cookies', true);
    expect(rules).toEqual([{ pattern: 'github.com', keep: { cookies: true } }]);
  });

  it('ajoute une catégorie à une règle existante', () => {
    const initial: KeepRule[] = [{ pattern: 'github.com', keep: { cookies: true } }];
    const rules = toggleRule(initial, 'github.com', 'history', true);
    expect(rules[0]!.keep).toEqual({ cookies: true, history: true });
  });

  it('retire une catégorie sans toucher aux autres', () => {
    const initial: KeepRule[] = [{ pattern: 'github.com', keep: { cookies: true, history: true } }];
    const rules = toggleRule(initial, 'github.com', 'history', false);
    expect(rules[0]!.keep).toEqual({ cookies: true });
  });

  it('supprime la règle devenue vide', () => {
    const initial: KeepRule[] = [{ pattern: 'github.com', keep: { cookies: true } }];
    expect(toggleRule(initial, 'github.com', 'cookies', false)).toEqual([]);
  });

  it("ne modifie pas le tableau d'origine", () => {
    const initial: KeepRule[] = [{ pattern: 'github.com', keep: { cookies: true } }];
    toggleRule(initial, 'github.com', 'history', true);
    expect(initial[0]!.keep).toEqual({ cookies: true });
  });
});
