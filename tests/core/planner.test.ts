import { describe, it, expect } from 'vitest';
import { buildPlan, sinceToTimestamp } from '../../src/core/planner';
import type { Profile } from '../../src/core/types';

const NOW = 1_700_000_000_000;

describe('sinceToTimestamp', () => {
  it('rend zéro pour "all"', () => {
    expect(sinceToTimestamp('all', NOW)).toBe(0);
  });

  it('recule d\'une heure', () => {
    expect(sinceToTimestamp('hour', NOW)).toBe(NOW - 3_600_000);
  });

  it('recule d\'une semaine', () => {
    expect(sinceToTimestamp('week', NOW)).toBe(NOW - 7 * 86_400_000);
  });
});

describe('buildPlan', () => {
  const profile: Profile = {
    id: 'p1',
    name: 'Test',
    since: 'hour',
    categories: ['cookies', 'history'],
    keepRules: [
      { pattern: 'github.com', keep: { cookies: true } },
      { pattern: 'news.fr', keep: { history: true } },
    ],
  };

  it('produit un plan par catégorie du profil', () => {
    const plan = buildPlan(profile, NOW);
    expect(plan.categories.map((c) => c.category)).toEqual(['cookies', 'history']);
  });

  it('propage la période à chaque catégorie', () => {
    const plan = buildPlan(profile, NOW);
    expect(plan.categories.every((c) => c.since === NOW - 3_600_000)).toBe(true);
  });

  it('ne transmet à une catégorie que les règles qui la concernent', () => {
    const plan = buildPlan(profile, NOW);
    const cookies = plan.categories.find((c) => c.category === 'cookies')!;
    expect(cookies.keepRules.map((r) => r.pattern)).toEqual(['github.com']);
  });

  it('ignore une catégorie absente du profil', () => {
    const plan = buildPlan(profile, NOW);
    expect(plan.categories.find((c) => c.category === 'passwords')).toBeUndefined();
  });

  it('rend une liste de règles vide quand aucune ne concerne la catégorie', () => {
    const plan = buildPlan({ ...profile, keepRules: [] }, NOW);
    expect(plan.categories[0]!.keepRules).toEqual([]);
  });

  it('déduplique les catégories répétées dans le profil', () => {
    const plan = buildPlan({ ...profile, categories: ['cookies', 'cookies'] }, NOW);
    expect(plan.categories).toHaveLength(1);
  });
});
