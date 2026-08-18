import { describe, it, expect } from 'vitest';
import { createDownloadsCleaner } from '../../src/cleaners/downloads';
import type { CategoryPlan } from '../../src/core/planner';

type Item = { id: number; finalUrl?: string; url?: string };

function fakeApi(items: Item[]) {
  const erased: number[] = [];
  const queries: Record<string, unknown>[] = [];
  return {
    erased,
    queries,
    api: {
      downloads: {
        async search(query: Record<string, unknown>) {
          queries.push(query);
          return items;
        },
        async erase(query: { id: number }) {
          erased.push(query.id);
          return [query.id];
        },
      },
    },
  };
}

const ITEMS: Item[] = [
  { id: 1, finalUrl: 'https://github.com/x.zip' },
  { id: 2, finalUrl: 'https://example.com/y.zip' },
  { id: 3, url: 'https://example.com/z.zip' },
];

function plan(keepRules: CategoryPlan['keepRules']): CategoryPlan {
  return { category: 'downloads', since: 0, keepRules };
}

describe('createDownloadsCleaner', () => {
  it('annonce une finesse exacte', () => {
    expect(createDownloadsCleaner(fakeApi([]).api).perSite).toBe('exact');
  });

  it('compte exactement les entrées à effacer', async () => {
    const preview = await createDownloadsCleaner(fakeApi(ITEMS).api).preview(
      plan([{ pattern: 'github.com', keep: { downloads: true } }]),
    );
    expect(preview).toEqual({ countable: true, items: 2 });
  });

  it('efface les entrées non protégées et garde les autres', async () => {
    const { api, erased } = fakeApi(ITEMS);
    const report = await createDownloadsCleaner(api).clean(
      plan([{ pattern: 'github.com', keep: { downloads: true } }]),
    );
    expect(erased).toEqual([2, 3]);
    expect(report).toMatchObject({ status: 'ok', deleted: 2, kept: 1 });
  });

  it('retombe sur url quand finalUrl est absent', async () => {
    const { api, erased } = fakeApi([{ id: 9, url: 'https://github.com/a.zip' }]);
    await createDownloadsCleaner(api).clean(plan([{ pattern: 'github.com', keep: { downloads: true } }]));
    expect(erased).toEqual([]);
  });

  it('demande explicitement toutes les entrées, sans plafond', async () => {
    const { api, queries } = fakeApi(ITEMS);
    await createDownloadsCleaner(api).preview(plan([]));
    // chrome.downloads.search plafonne à 1000 par défaut ; 0 lève la limite.
    expect(queries[0]!.limit).toBe(0);
  });

  it('borne la recherche dans le temps quand la période le demande', async () => {
    const { api, queries } = fakeApi(ITEMS);
    await createDownloadsCleaner(api).clean({ category: 'downloads', since: 86_400_000, keepRules: [] });
    expect(queries[0]!.limit).toBe(0);
    expect(queries[0]!.startedAfter).toBe(new Date(86_400_000).toISOString());
  });

  it('conserve une entrée sans URL exploitable', async () => {
    const { api, erased } = fakeApi([{ id: 9 }]);
    const report = await createDownloadsCleaner(api).clean(plan([]));
    expect(erased).toEqual([]);
    expect(report.kept).toBe(1);
  });
});
