import { describe, it, expect } from 'vitest';
import { createHistoryCleaner, hostOf } from '../../src/cleaners/history';
import type { CategoryPlan } from '../../src/core/planner';

type Visit = { url?: string; lastVisitTime?: number };

function fakeApi(pages: Visit[]) {
  const deleted: string[] = [];
  let calls = 0;
  return {
    deleted,
    api: {
      history: {
        async search() {
          calls += 1;
          return calls === 1 ? pages : [];
        },
        async deleteUrl(details: { url: string }) {
          deleted.push(details.url);
        },
      },
    },
  };
}

const PAGES: Visit[] = [
  { url: 'https://github.com/a', lastVisitTime: 100 },
  { url: 'https://gist.github.com/b', lastVisitTime: 200 },
  { url: 'https://example.com/c', lastVisitTime: 300 },
];

function plan(keepRules: CategoryPlan['keepRules'], since = 0): CategoryPlan {
  return { category: 'history', since, keepRules };
}

describe('hostOf', () => {
  it("extrait l'hôte d'une URL", () => {
    expect(hostOf('https://github.com/a?x=1')).toBe('github.com');
  });

  it('rend null pour une URL illisible', () => {
    expect(hostOf('pas-une-url')).toBeNull();
  });
});

describe('createHistoryCleaner', () => {
  it('annonce une finesse exacte', () => {
    expect(createHistoryCleaner(fakeApi([]).api).perSite).toBe('exact');
  });

  it('compte exactement les entrées à supprimer', async () => {
    const preview = await createHistoryCleaner(fakeApi(PAGES).api).preview(
      plan([{ pattern: '*.github.com', keep: { history: true } }]),
    );
    expect(preview).toEqual({ countable: true, items: 1 });
  });

  it('supprime les entrées non protégées', async () => {
    const { api, deleted } = fakeApi(PAGES);
    const report = await createHistoryCleaner(api).clean(
      plan([{ pattern: '*.github.com', keep: { history: true } }]),
    );
    expect(deleted).toEqual(['https://example.com/c']);
    expect(report).toMatchObject({ status: 'ok', deleted: 1, kept: 2 });
  });

  it("conserve une entrée dont l'URL est illisible plutôt que de la supprimer", async () => {
    const { api, deleted } = fakeApi([{ url: 'pas-une-url', lastVisitTime: 1 }]);
    const report = await createHistoryCleaner(api).clean(plan([]));
    expect(deleted).toEqual([]);
    expect(report.kept).toBe(1);
  });

  it('rend un statut partiel quand une suppression échoue', async () => {
    const api = {
      history: {
        async search() {
          return PAGES;
        },
        async deleteUrl() {
          throw new Error('historique verrouillé');
        },
      },
    };
    let first = true;
    const paged = {
      history: {
        async search() {
          if (!first) return [];
          first = false;
          return PAGES;
        },
        deleteUrl: api.history.deleteUrl,
      },
    };
    const report = await createHistoryCleaner(paged).clean(plan([]));
    expect(report.status).toBe('partial');
    expect(report.error).toMatch(/historique verrouillé/);
  });
});
