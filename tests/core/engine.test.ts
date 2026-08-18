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
      [
        fakeCleaner('cookies', order),
        fakeCleaner('history', order),
        fakeCleaner('httpCache', order),
      ],
      fakeArea(),
    );
    const previews = await engine.preview(plan);
    expect(previews.map((p) => p.category)).toEqual(['cookies', 'history']);
  });

  it("exécute les cleaners dans l'ordre du plan", async () => {
    const order: string[] = [];
    const engine = createEngine(
      [fakeCleaner('history', order), fakeCleaner('cookies', order)],
      fakeArea(),
    );
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
      runs: Array.from({ length: JOURNAL_LIMIT }, (_, i) => ({
        profileId: `old${i}`,
        at: i,
        results: [],
      })),
    });
    const engine = createEngine([fakeCleaner('cookies', []), fakeCleaner('history', [])], area);
    await engine.clean(plan, 9999);
    const journal = await engine.journal();
    expect(journal).toHaveLength(JOURNAL_LIMIT);
    expect(journal[0]!.at).toBe(9999);
  });

  it("repart d'un journal vide si la valeur stockée est illisible", async () => {
    const engine = createEngine(
      [fakeCleaner('cookies', []), fakeCleaner('history', [])],
      fakeArea({ runs: 'pas un tableau' }),
    );

    // Le journal est écrit après la suppression : y jeter ferait rapporter un
    // échec alors que les données ont bel et bien disparu.
    const results = await engine.clean(plan, 42);
    expect(results).toHaveLength(2);

    const journal = await engine.journal();
    expect(journal).toHaveLength(1);
    expect(journal[0]!.at).toBe(42);
  });

  it('rend un journal vide plutôt que la valeur illisible', async () => {
    const engine = createEngine([], fakeArea({ runs: { pas: 'un tableau' } }));
    expect(await engine.journal()).toEqual([]);
  });

  it("rapporte une catégorie sans cleaner au lieu de l'ignorer", async () => {
    const engine = createEngine([], fakeArea());
    const [previews, reports] = await Promise.all([engine.preview(plan), engine.clean(plan, 1)]);

    expect(previews[0]!.preview).toMatchObject({ countable: false, items: 0 });
    expect(previews[0]!.preview.note).toMatch(/aucun cleaner disponible pour cookies/);
    expect(reports[0]!.report).toMatchObject({ status: 'failed', deleted: 0, kept: 0 });
    expect(reports[0]!.report.error).toMatch(/aucun cleaner disponible/);
  });

  it("remonte l'échec d'un aperçu sans faire tomber les autres catégories", async () => {
    const cassé: Cleaner = {
      id: 'cookies',
      perSite: 'exact',
      preview() {
        return Promise.reject(new Error('aperçu indisponible'));
      },
      async clean() {
        return { status: 'ok', deleted: 0, kept: 0 };
      },
    };
    const previews = await createEngine([cassé, fakeCleaner('history', [])], fakeArea()).preview(
      plan,
    );

    expect(previews[0]!.preview.note).toMatch(/aperçu indisponible/);
    expect(previews[0]!.preview.countable).toBe(false);
    // La catégorie suivante doit rester chiffrable.
    expect(previews[1]!.preview.countable).toBe(true);
  });

  it('convertit en texte une erreur qui n’est pas une Error', async () => {
    const cassé: Cleaner = {
      id: 'cookies',
      perSite: 'exact',
      async preview() {
        return { countable: true, items: 0 };
      },
      clean() {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- le chemin testé est justement celui d’une cause qui n’est pas une Error
        return Promise.reject('panne sans objet Error');
      },
    };
    const [resultat] = await createEngine([cassé], fakeArea()).clean(
      { profileId: 'p1', since: 0, categories: [{ category: 'cookies', since: 0, keepRules: [] }] },
      1,
    );
    expect(resultat!.report.error).toBe('panne sans objet Error');
  });
});
