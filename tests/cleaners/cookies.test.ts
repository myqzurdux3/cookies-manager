import { describe, it, expect } from 'vitest';
import { createCookiesCleaner, cookieUrl, deletableCookies } from '../../src/cleaners/cookies';
import type { CategoryPlan } from '../../src/core/planner';

type FakeCookie = { name: string; domain: string; path: string; secure: boolean };

function fakeApi(cookies: FakeCookie[]) {
  const removed: { url: string; name: string }[] = [];
  return {
    removed,
    api: {
      cookies: {
        async getAll() {
          return cookies as unknown as chrome.cookies.Cookie[];
        },
        async remove(details: { url: string; name: string }) {
          removed.push(details);
          return details;
        },
      },
    },
  };
}

const COOKIES: FakeCookie[] = [
  { name: 'user_session', domain: '.github.com', path: '/', secure: true },
  { name: '_ga', domain: '.github.com', path: '/', secure: false },
  { name: 'sid', domain: 'example.com', path: '/', secure: true },
];

function plan(keepRules: CategoryPlan['keepRules'], since = 0): CategoryPlan {
  return { category: 'cookies', since, keepRules };
}

describe('cookieUrl', () => {
  it('construit une URL https pour un cookie sécurisé à domaine pointé', () => {
    expect(cookieUrl({ domain: '.github.com', path: '/', secure: true })).toBe(
      'https://github.com/',
    );
  });

  it('construit une URL http pour un cookie non sécurisé', () => {
    expect(cookieUrl({ domain: 'example.com', path: '/app', secure: false })).toBe(
      'http://example.com/app',
    );
  });
});

describe('createCookiesCleaner', () => {
  it('annonce une finesse exacte', () => {
    expect(createCookiesCleaner(fakeApi([]).api).perSite).toBe('exact');
  });

  it("compte exactement les cookies à supprimer dans l'aperçu", async () => {
    const cleaner = createCookiesCleaner(fakeApi(COOKIES).api);
    const preview = await cleaner.preview(
      plan([{ pattern: 'github.com', keep: { cookies: true } }]),
    );
    expect(preview).toMatchObject({ countable: true, items: 1 });
  });

  it("signale dans l'aperçu que la période ne s'applique pas aux cookies", async () => {
    const cleaner = createCookiesCleaner(fakeApi(COOKIES).api);
    const preview = await cleaner.preview({ ...plan([]), since: 1_700_000_000_000 });
    expect(preview.note).toMatch(/période/i);
  });

  it('supprime les cookies non protégés et garde les autres', async () => {
    const { api, removed } = fakeApi(COOKIES);
    const cleaner = createCookiesCleaner(api);
    const report = await cleaner.clean(plan([{ pattern: 'github.com', keep: { cookies: true } }]));
    expect(removed.map((r) => r.name)).toEqual(['sid']);
    expect(report).toMatchObject({ status: 'ok', deleted: 1, kept: 2 });
  });

  it('protège un cookie par son nom et supprime ses voisins', async () => {
    const { api, removed } = fakeApi(COOKIES);
    const cleaner = createCookiesCleaner(api);
    await cleaner.clean(
      plan([{ pattern: 'github.com', keep: { cookies: true }, keepCookies: ['user_session'] }]),
    );
    expect(removed.map((r) => r.name).sort()).toEqual(['_ga', 'sid']);
  });

  it('supprime tout quand la keep-list est vide', async () => {
    const { api, removed } = fakeApi(COOKIES);
    await createCookiesCleaner(api).clean(plan([]));
    expect(removed).toHaveLength(3);
  });

  it('rend un statut partiel quand une suppression échoue', async () => {
    const api = {
      cookies: {
        async getAll() {
          return COOKIES as unknown as chrome.cookies.Cookie[];
        },
        async remove() {
          throw new Error('accès refusé');
        },
      },
    };
    const report = await createCookiesCleaner(api).clean(plan([]));
    expect(report.status).toBe('partial');
    expect(report.deleted).toBe(0);
    expect(report.error).toMatch(/accès refusé/);
  });

  it("annonce dans l'aperçu que les cookies cloisonnés échappent au nettoyage", async () => {
    const preview = await createCookiesCleaner(fakeApi(COOKIES).api).preview(plan([]));
    // Mesuré dans Chromium 150 : getAll({}) ne rend pas les cookies partitionnés,
    // et un nettoyage total les laisse intacts. Le taire serait mentir.
    expect(preview.note).toMatch(/cloisonn/i);
  });

  it("le dit aussi quand une période est demandée, sans perdre l'autre note", async () => {
    const preview = await createCookiesCleaner(fakeApi(COOKIES).api).preview(plan([], 1234));
    expect(preview.note).toMatch(/cloisonn/i);
    expect(preview.note).toMatch(/période/i);
  });

  describe('deletableCookies', () => {
    // Le coffre sauvegarde exactement ce que le cleaner va supprimer : les deux
    // doivent s'appuyer sur la même règle, sans la dupliquer.
    it('rend exactement les cookies que le nettoyage supprimerait', () => {
      const condamnes = deletableCookies(
        COOKIES as never,
        plan([{ pattern: '*.github.com', keep: { cookies: true } }]),
      );
      expect(condamnes.map((c) => c.domain)).not.toContain('.github.com');
      expect(condamnes.length).toBeGreaterThan(0);
    });

    it('rend une liste vide quand tout est protégé', () => {
      expect(
        deletableCookies(COOKIES as never, plan([{ pattern: '*', keep: { cookies: true } }])),
      ).toEqual([]);
    });
  });
});
