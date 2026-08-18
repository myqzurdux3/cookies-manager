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

/**
 * Faux plus fidèle que `fakeApi` : il honore `startTime`, `endTime` et
 * `maxResults` comme le fait `chrome.history.search`. `endTime` est traité
 * comme **inclusif** — la documentation Chrome ne tranche pas, et c'est le cas
 * qui met la pagination en défaut.
 */
function pagingApi(visits: Visit[], pageSize: number) {
  const deleted: string[] = [];
  const searches: { startTime: number; endTime?: number }[] = [];
  return {
    deleted,
    searches,
    api: {
      history: {
        async search(query: { startTime: number; endTime?: number; maxResults: number }) {
          searches.push({ startTime: query.startTime, endTime: query.endTime });
          if (searches.length > 50) throw new Error('pagination sans fin');
          return visits
            .filter((visit) => {
              const at = visit.lastVisitTime ?? 0;
              return at >= query.startTime && (query.endTime === undefined || at <= query.endTime);
            })
            .sort((a, b) => (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0))
            .slice(0, Math.min(query.maxResults, pageSize));
        },
        async deleteUrl(details: { url: string }) {
          deleted.push(details.url);
        },
      },
    },
  };
}

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
    let first = true;
    const paged = {
      history: {
        async search() {
          if (!first) return [];
          first = false;
          return PAGES;
        },
        async deleteUrl() {
          throw new Error('historique verrouillé');
        },
      },
    };
    const report = await createHistoryCleaner(paged).clean(plan([]));
    expect(report.status).toBe('partial');
    expect(report.error).toMatch(/historique verrouillé/);
  });

  // Garde-fou : Chrome ne documente aucun ordre de tri pour history.search, et
  // une entrée sans date valait 0 dans le calcul de la borne suivante.
  it("pagine jusqu'au bout même si une entrée n'a pas de date de visite", async () => {
    const visits: Visit[] = [
      { url: 'https://a.example/1', lastVisitTime: 500 },
      { url: 'https://b.example/2' }, // pas de lastVisitTime
      { url: 'https://c.example/3', lastVisitTime: 300 },
      { url: 'https://d.example/4', lastVisitTime: 200 },
      { url: 'https://e.example/5', lastVisitTime: 100 },
    ];
    const { api, deleted } = pagingApi(visits, 2);
    const report = await createHistoryCleaner(api).clean(plan([], 0));

    expect(deleted.sort()).toEqual([
      'https://a.example/1',
      'https://b.example/2',
      'https://c.example/3',
      'https://d.example/4',
      'https://e.example/5',
    ]);
    expect(report.deleted).toBe(5);
  });

  it("compte dans l'aperçu exactement ce que le nettoyage supprimera", async () => {
    const visits: Visit[] = [
      { url: 'https://a.example/1', lastVisitTime: 400 },
      { url: 'https://b.example/2', lastVisitTime: 300 },
      { url: 'https://c.example/3', lastVisitTime: 200 },
      { url: 'https://d.example/4', lastVisitTime: 100 },
    ];
    const preview = await createHistoryCleaner(pagingApi(visits, 2).api).preview(plan([], 0));
    const { api, deleted } = pagingApi(visits, 2);
    await createHistoryCleaner(api).clean(plan([], 0));

    // Avec un endTime inclusif, les pages se recouvrent : l'aperçu comptait les
    // doublons, le nettoyage les dédoublonnait. Les deux nombres divergeaient.
    expect(preview.items).toBe(deleted.length);
    expect(preview.items).toBe(4);
  });
});
