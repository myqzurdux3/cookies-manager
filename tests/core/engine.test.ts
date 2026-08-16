import { describe, it, expect } from 'vitest';
import { createEngine, JOURNAL_LIMIT } from '../../src/core/engine';
import type { StorageArea } from '../../src/core/profiles';
import type { Cleaner } from '../../src/core/types';
import type { Plan } from '../../src/core/planner';

function fakeArea(initial: Record<string, unknown> = {}): StorageArea {
  const data = { ...initial };
  return {
    async get(key: string) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
    },
  };
}

function fakeCleaner(id: Cleaner['id'], order: string[], deleted = 1): Cleaner {
  return {
    id,
    perSite: 'exact',
    async preview() {
      return { countable: true, items: deleted };
    },
    async clean() {
      order.push(id);
      return { status: 'ok', deleted, kept: 0 };
    },
  };
}

const plan: Plan = {
  profileId: 'p1',
  since: 0,
  categories: [
    { category: 'cookies', since: 0, keepRules: [] },
    { category: 'history', since: 0, keepRules: [] },
  ],
};

describe('createEngine', () => {
  it("n'interroge que les cleaners présents dans le plan", async () => {
    const order: string[] = [];
    const engine = createEngine(
      [fakeCleaner('cookies', order), fakeCleaner('history', order), fakeCleaner('httpCache', order)],
      fakeArea(),
    );
    const previews = await engine.preview(plan);
    expect(previews.map((p) => p.category)).toEqual(['cookies', 'history']);
  });

  it("exécute les cleaners dans l'ordre du plan", async () => {
    const order: string[] = [];
    const engine = createEngine([fakeCleaner('history', order), fakeCleaner('cookies', order)], fakeArea());
    await engine.clean(plan, 1000);
    expect(order).toEqual(['cookies', 'history']);
  });

  it("poursuit les autres cleaners quand l'un jette", async () => {
    const order: string[] = [];
    const exploding: Cleaner = {
      id: 'cookies',
      perSite: 'exact',
      async preview() {
        return { countable: false, items: 0 };
      },
      async clean() {
        throw new Error('boum');
      },
    };
    const engine = createEngine([exploding, fakeCleaner('history', order)], fakeArea());
    const results = await engine.clean(plan, 1000);
    expect(results[0]!.report).toMatchObject({ status: 'failed', error: 'boum' });
    expect(results[1]!.report.status).toBe('ok');
    expect(order).toEqual(['history']);
  });

  it('signale une catégorie sans cleaner disponible', async () => {
    const engine = createEngine([fakeCleaner('cookies', [])], fakeArea());
    const results = await engine.clean(plan, 1000);
    expect(results[1]!.report).toMatchObject({ status: 'failed' });
    expect(results[1]!.report.error).toMatch(/aucun cleaner/i);
  });

  it('écrit le nettoyage au journal', async () => {
    const area = fakeArea();
    const engine = createEngine([fakeCleaner('cookies', []), fakeCleaner('history', [])], area);
    await engine.clean(plan, 1234);
    const journal = await engine.journal();
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ profileId: 'p1', at: 1234 });
  });

  it('sauvegarde les cookies avant de lancer le cleaner cookies', async () => {
    const order: string[] = [];
    const engine = createEngine(
      [fakeCleaner('cookies', order), fakeCleaner('history', order)],
      fakeArea(),
      {
        async backup() {
          order.push('backup');
        },
      },
    );
    await engine.clean(plan, 1000);
    expect(order).toEqual(['backup', 'cookies', 'history']);
  });

  it('renonce à supprimer les cookies quand la sauvegarde échoue', async () => {
    const order: string[] = [];
    const engine = createEngine(
      [fakeCleaner('cookies', order), fakeCleaner('history', order)],
      fakeArea(),
      {
        async backup() {
          throw new Error('trousseau indisponible');
        },
      },
    );
    const results = await engine.clean(plan, 1000);
    expect(results[0]!.report).toMatchObject({ status: 'failed', deleted: 0 });
    expect(results[0]!.report.error).toMatch(/sauvegarde impossible.*trousseau indisponible/i);
    expect(order).toEqual(['history']);
    expect(results[1]!.report.status).toBe('ok');
  });

  it('ne sauvegarde rien quand le plan ne touche pas aux cookies', async () => {
    const order: string[] = [];
    const historyOnly: Plan = {
      profileId: 'p1',
      since: 0,
      categories: [{ category: 'history', since: 0, keepRules: [] }],
    };
    const engine = createEngine([fakeCleaner('history', order)], fakeArea(), {
      async backup() {
        order.push('backup');
      },
    });
    await engine.clean(historyOnly, 1000);
    expect(order).toEqual(['history']);
  });

  it('garde le plus récent en tête et plafonne le journal', async () => {
    const area = fakeArea({
      runs: Array.from({ length: JOURNAL_LIMIT }, (_, i) => ({ profileId: `old${i}`, at: i, results: [] })),
    });
    const engine = createEngine([fakeCleaner('cookies', []), fakeCleaner('history', [])], area);
    await engine.clean(plan, 9999);
    const journal = await engine.journal();
    expect(journal).toHaveLength(JOURNAL_LIMIT);
    expect(journal[0]!.at).toBe(9999);
  });
});
