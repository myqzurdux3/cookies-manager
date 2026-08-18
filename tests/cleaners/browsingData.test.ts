import { describe, it, expect } from 'vitest';
import { createStorageCleaner } from '../../src/cleaners/storage';
import { createHttpCacheCleaner } from '../../src/cleaners/httpCache';
import {
  chromeMajorVersion,
  createCredentialsCleaner,
  PASSWORDS_REMOVED_FROM,
} from '../../src/cleaners/credentials';
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

  it('marque le rapport comme non chiffrable : la catégorie est vidée en bloc', async () => {
    const { api } = fakeApi();
    const report = await createStorageCleaner(api, 'localStorage', knownHosts).clean(
      plan('localStorage', []),
    );
    // Sans ce drapeau, l'interface affiche « 0 supprimé(s) » après avoir tout vidé.
    expect(report.countable).toBe(false);
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

  it("refuse d'effacer les mots de passe sur un Chrome qui les ignore", async () => {
    const { api, calls } = fakeApi();
    const cleaner = createCredentialsCleaner(api, 'passwords', PASSWORDS_REMOVED_FROM);
    const report = await cleaner.clean(plan('passwords', [], 0));

    // Ne pas appeler l'API : elle résoudrait sans rien faire, et le rapport
    // annoncerait « vidé entièrement » pour une suppression qui n'a pas eu lieu.
    expect(calls).toEqual([]);
    expect(report.status).toBe('failed');
    expect(report.error).toMatch(/Chrome 144/);
  });

  it("l'annonce aussi dans l'aperçu, avant toute confirmation", async () => {
    const preview = await createCredentialsCleaner(
      fakeApi().api,
      'passwords',
      PASSWORDS_REMOVED_FROM,
    ).preview(plan('passwords', []));
    expect(preview.note).toMatch(/Chrome 144/);
  });

  it('laisse les données de formulaire intactes : elles ne sont pas concernées', async () => {
    const { api, calls } = fakeApi();
    const report = await createCredentialsCleaner(api, 'formData', PASSWORDS_REMOVED_FROM).clean(
      plan('formData', [], 0),
    );
    expect(calls[0]!.types).toEqual({ formData: true });
    expect(report.status).toBe('ok');
  });

  it('efface encore les mots de passe sur un Chrome antérieur', async () => {
    const { api, calls } = fakeApi();
    const report = await createCredentialsCleaner(
      api,
      'passwords',
      PASSWORDS_REMOVED_FROM - 1,
    ).clean(plan('passwords', [], 0));
    expect(calls[0]!.types).toEqual({ passwords: true });
    expect(report.status).toBe('ok');
  });
});

describe('chromeMajorVersion', () => {
  it('lit la version majeure de Chrome', () => {
    expect(
      chromeMajorVersion(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      ),
    ).toBe(144);
  });

  it('lit aussi celle de Brave, qui annonce Chrome', () => {
    expect(
      chromeMajorVersion(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Brave/151',
      ),
    ).toBe(151);
  });

  it("rend null quand la version est illisible, pour ne rien supposer", () => {
    expect(chromeMajorVersion('Mozilla/5.0 (compatible; inconnu)')).toBeNull();
  });
});
