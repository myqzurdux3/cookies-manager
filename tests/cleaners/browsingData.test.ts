import { describe, it, expect } from 'vitest';
import { createStorageCleaner } from '../../src/cleaners/storage';
import { createHttpCacheCleaner } from '../../src/cleaners/httpCache';
import { createCredentialsCleaner } from '../../src/cleaners/credentials';
import type { CategoryPlan } from '../../src/core/planner';

function fakeApi() {
  const calls: { options: chrome.browsingData.RemovalOptions; types: Record<string, boolean> }[] = [];
  return {
    calls,
    api: {
      browsingData: {
        async remove(options: chrome.browsingData.RemovalOptions, types: Record<string, boolean>) {
          calls.push({ options, types });
        },
      },
    },
  };
}

const knownHosts = async () => ['github.com', 'gist.github.com', 'example.com'];

function plan(category: CategoryPlan['category'], keepRules: CategoryPlan['keepRules'], since = 0): CategoryPlan {
  return { category, since, keepRules };
}

describe('createStorageCleaner', () => {
  it('annonce une finesse par origine', () => {
    expect(createStorageCleaner(fakeApi().api, 'localStorage', knownHosts).perSite).toBe('origin');
  });

  it('exclut les origines protégées, en http et en https', async () => {
    const { api, calls } = fakeApi();
    const cleaner = createStorageCleaner(api, 'localStorage', knownHosts);
    await cleaner.clean(plan('localStorage', [{ pattern: 'github.com', keep: { localStorage: true } }]));
    expect(calls[0]!.options.excludeOrigins).toEqual(['https://github.com', 'http://github.com']);
    expect(calls[0]!.types).toEqual({ localStorage: true });
  });

  it('développe un motif à wildcard à partir des hôtes connus', async () => {
    const { api, calls } = fakeApi();
    const cleaner = createStorageCleaner(api, 'indexedDB', knownHosts);
    await cleaner.clean(plan('indexedDB', [{ pattern: '*.github.com', keep: { indexedDB: true } }]));
    expect(calls[0]!.options.excludeOrigins).toContain('https://gist.github.com');
    expect(calls[0]!.options.excludeOrigins).not.toContain('https://example.com');
  });

  it('transmet la période', async () => {
    const { api, calls } = fakeApi();
    await createStorageCleaner(api, 'localStorage', knownHosts).clean(plan('localStorage', [], 1234));
    expect(calls[0]!.options.since).toBe(1234);
  });

  it('rend un aperçu partiel et non chiffrable', async () => {
    const preview = await createStorageCleaner(fakeApi().api, 'localStorage', knownHosts).preview(
      plan('localStorage', [{ pattern: 'github.com', keep: { localStorage: true } }]),
    );
    expect(preview.countable).toBe(false);
    expect(preview.note).toMatch(/minorant|non exhaustive/i);
  });

  it('rend un statut échoué quand l\'API rejette', async () => {
    const api = {
      browsingData: {
        async remove() {
          throw new Error('permission manquante');
        },
      },
    };
    const report = await createStorageCleaner(api, 'localStorage', knownHosts).clean(
      plan('localStorage', []),
    );
    expect(report).toMatchObject({ status: 'failed', deleted: 0, kept: 0 });
    expect(report.error).toMatch(/permission manquante/);
  });
});

describe('createHttpCacheCleaner', () => {
  it('n\'offre aucune finesse par site', () => {
    expect(createHttpCacheCleaner(fakeApi().api).perSite).toBe('none');
  });

  it('efface tout le cache sans exclusion, même si des règles existent', async () => {
    const { api, calls } = fakeApi();
    await createHttpCacheCleaner(api).clean(
      plan('httpCache', [{ pattern: 'github.com', keep: { httpCache: true } }], 42),
    );
    expect(calls[0]!.types).toEqual({ cache: true });
    expect(calls[0]!.options).toEqual({ since: 42 });
  });

  it('explique dans l\'aperçu que la conservation par site est impossible', async () => {
    const preview = await createHttpCacheCleaner(fakeApi().api).preview(plan('httpCache', []));
    expect(preview.countable).toBe(false);
    expect(preview.note).toMatch(/tout ou rien/i);
  });
});

describe('createCredentialsCleaner', () => {
  it('n\'offre aucune finesse par site', () => {
    expect(createCredentialsCleaner(fakeApi().api, 'passwords').perSite).toBe('none');
  });

  it('efface les mots de passe', async () => {
    const { api, calls } = fakeApi();
    await createCredentialsCleaner(api, 'passwords').clean(plan('passwords', [], 0));
    expect(calls[0]!.types).toEqual({ passwords: true });
  });

  it('efface les données de formulaire', async () => {
    const { api, calls } = fakeApi();
    await createCredentialsCleaner(api, 'formData').clean(plan('formData', [], 0));
    expect(calls[0]!.types).toEqual({ formData: true });
  });
});
