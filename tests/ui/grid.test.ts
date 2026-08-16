import { describe, it, expect } from 'vitest';
import { PER_SITE, cellState, toggleRule } from '../../src/ui/options/grid';
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

describe('cellState', () => {
  it('grise une catégorie sans exclusion possible', () => {
    const state = cellState('httpCache', false);
    expect(state.disabled).toBe(true);
    expect(state.title).toMatch(/API/i);
  });

  it('laisse une catégorie exclusible modifiable', () => {
    expect(cellState('cookies', false).disabled).toBe(false);
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
