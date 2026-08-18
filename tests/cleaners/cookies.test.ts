import { describe, it, expect } from 'vitest';
import { createCookiesCleaner, cookieUrl } from '../../src/cleaners/cookies';
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

function plan(keepRules: CategoryPlan['keepRules']): CategoryPlan {
  return { category: 'cookies', since: 0, keepRules };
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
});
