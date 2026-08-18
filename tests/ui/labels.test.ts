import { describe, it, expect } from 'vitest';
import {
  CATEGORY_LABELS,
  formatRestoreReport,
  formatRunSummary,
  formatVaultReplacement,
  formatVaultState,
  needsExtraConfirmation,
  previewRow,
  profileMeta,
  protectedSites,
  reportRow,
  runSummary,
} from '../../src/ui/labels';
import { ALL_CATEGORIES } from '../../src/core/types';

describe('CATEGORY_LABELS', () => {
  it('nomme chaque catégorie', () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
    }
  });
});

describe('previewRow', () => {
  it('sépare le libellé du décompte', () => {
    expect(previewRow({ category: 'cookies', preview: { countable: true, items: 12 } })).toEqual({
      label: 'Cookies',
      value: '12 à supprimer',
      note: undefined,
      tone: 'strong',
    });
  });

  it('atténue une ligne qui ne supprime rien', () => {
    expect(previewRow({ category: 'cookies', preview: { countable: true, items: 0 } }).tone).toBe(
      'muted',
    );
  });

  it("reporte la note quand l'API ne sait pas compter", () => {
    expect(
      previewRow({
        category: 'httpCache',
        preview: { countable: false, items: 0, note: 'tout ou rien' },
      }),
    ).toMatchObject({ label: 'Cache HTTP', value: 'non chiffrable', note: 'tout ou rien' });
  });
});

describe('reportRow', () => {
  it('résume un nettoyage réussi', () => {
    expect(
      reportRow({ category: 'cookies', report: { status: 'ok', deleted: 3, kept: 2 } }),
    ).toEqual({ label: 'Cookies', value: '3 supprimé(s) · 2 conservé(s)', tone: 'strong' });
  });

  it("met l'erreur en note pour un nettoyage partiel", () => {
    expect(
      reportRow({
        category: 'history',
        report: { status: 'partial', deleted: 1, kept: 0, error: 'verrouillé' },
      }),
    ).toEqual({
      label: 'Historique',
      value: '1 supprimé(s) · 0 conservé(s)',
      note: 'échec partiel : verrouillé',
      tone: 'failed',
    });
  });

  it('signale un échec complet', () => {
    expect(
      reportRow({
        category: 'passwords',
        report: { status: 'failed', deleted: 0, kept: 0, error: 'permission refusée' },
      }),
    ).toEqual({
      label: 'Mots de passe',
      value: 'échec',
      note: 'permission refusée',
      tone: 'failed',
    });
  });
});

describe('reportRow, catégories non chiffrables', () => {
  it('dit « vidé entièrement » au lieu de « 0 supprimé »', () => {
    expect(
      reportRow({
        category: 'httpCache',
        report: { status: 'ok', deleted: 0, kept: 0, countable: false },
      }),
    ).toEqual({ label: 'Cache HTTP', value: 'vidé entièrement', tone: 'strong' });
  });

  it('garde le message d’échec quand la catégorie non chiffrable échoue', () => {
    expect(
      reportRow({
        category: 'httpCache',
        report: { status: 'failed', deleted: 0, kept: 0, error: 'refusé' },
      }).value,
    ).toBe('échec');
  });
});

describe('runSummary', () => {
  it('additionne les suppressions et les conservations', () => {
    const summary = runSummary([
      { category: 'cookies', report: { status: 'ok', deleted: 128, kept: 12 } },
      { category: 'history', report: { status: 'ok', deleted: 170, kept: 32 } },
    ]);
    expect(summary).toMatchObject({ deleted: 298, kept: 44, wiped: 0, failed: 0 });
  });

  it('compte à part les catégories vidées en bloc', () => {
    const summary = runSummary([
      { category: 'cookies', report: { status: 'ok', deleted: 4, kept: 1 } },
      { category: 'httpCache', report: { status: 'ok', deleted: 0, kept: 0, countable: false } },
      { category: 'passwords', report: { status: 'ok', deleted: 0, kept: 0, countable: false } },
    ]);
    expect(summary).toMatchObject({ deleted: 4, kept: 1, wiped: 2 });
  });

  it('compte les échecs, partiels compris', () => {
    const summary = runSummary([
      { category: 'cookies', report: { status: 'partial', deleted: 2, kept: 0, error: 'x' } },
      { category: 'history', report: { status: 'failed', deleted: 0, kept: 0, error: 'y' } },
    ]);
    expect(summary.failed).toBe(2);
  });
});

describe('formatRunSummary', () => {
  it('résume en une phrase', () => {
    expect(formatRunSummary({ deleted: 312, kept: 47, wiped: 0, failed: 0 })).toBe(
      '312 éléments supprimés · 47 conservés',
    );
  });

  it('mentionne les catégories vidées en bloc', () => {
    expect(formatRunSummary({ deleted: 4, kept: 1, wiped: 2, failed: 0 })).toBe(
      '4 éléments supprimés · 1 conservé · 2 catégories vidées entièrement',
    );
  });

  it('signale les échecs', () => {
    expect(formatRunSummary({ deleted: 4, kept: 0, wiped: 0, failed: 1 })).toBe(
      '4 éléments supprimés · 0 conservé · 1 catégorie en échec',
    );
  });
});

describe('protectedSites', () => {
  it('rend les motifs qui protègent au moins une catégorie', () => {
    expect(
      protectedSites({
        keepRules: [
          { pattern: '*.google.com', keep: { cookies: true } },
          { pattern: 'vide.com', keep: {} },
          { pattern: 'github.com', keep: { history: true } },
        ],
      }),
    ).toEqual(['*.google.com', 'github.com']);
  });

  it('rend une liste vide quand rien n’est protégé', () => {
    expect(protectedSites({ keepRules: [] })).toEqual([]);
  });
});

describe('profileMeta', () => {
  it('accorde le pluriel des catégories', () => {
    expect(profileMeta({ since: 'all', categories: ['cookies'] })).toBe('tout · 1 catégorie');
    expect(profileMeta({ since: 'week', categories: ['cookies', 'history'] })).toBe(
      'dernière semaine · 2 catégories',
    );
  });
});

describe('formatRestoreReport', () => {
  it('annonce une restauration complète', () => {
    expect(formatRestoreReport({ restored: 5, failures: [] })).toBe(
      '5 cookie(s) restauré(s). Vos sessions sont de nouveau actives.',
    );
  });

  it('rapporte les cookies refusés sans masquer les réussites', () => {
    const message = formatRestoreReport({
      restored: 4,
      failures: [
        { name: '__Host-device_id', domain: '.claude.ai', error: 'Failed to parse or set cookie' },
      ],
    });
    expect(message).toMatch(/^4 cookie\(s\) restauré\(s\)\./);
    expect(message).toMatch(/1 refusé\(s\)/);
    expect(message).toMatch(/__Host-device_id/);
  });
});

describe('formatVaultState', () => {
  const stamp = (at: number) => `date(${at})`;

  it('annonce un coffre absent', () => {
    expect(formatVaultState(null, stamp)).toBe('Aucun coffre enregistré.');
  });

  it('résume un coffre existant', () => {
    expect(
      formatVaultState(
        { version: 1, createdAt: 42, cookieCount: 3, domains: ['.github.com', '.example.com'] },
        stamp,
      ),
    ).toBe('Coffre du date(42) : 3 cookie(s) sur 2 domaine(s).');
  });
});

describe('needsExtraConfirmation', () => {
  it('exige une confirmation pour les mots de passe', () => {
    expect(needsExtraConfirmation(['cookies', 'passwords'])).toBe(true);
  });

  it('exige une confirmation pour les données de formulaire', () => {
    expect(needsExtraConfirmation(['formData'])).toBe(true);
  });

  it("n'exige rien pour les catégories ordinaires", () => {
    expect(needsExtraConfirmation(['cookies', 'httpCache'])).toBe(false);
  });

  describe('formatVaultReplacement', () => {
    const date = (at: number) => new Date(at).toISOString().slice(0, 10);

    it("n'annonce rien quand aucun coffre n'existe", () => {
      expect(formatVaultReplacement(null, date)).toBeNull();
    });

    it('annonce le remplacement du coffre existant, avec sa date et son contenu', () => {
      const message = formatVaultReplacement(
        {
          version: 1,
          createdAt: 1_700_000_000_000,
          cookieCount: 12,
          domains: ['a.test', 'b.test'],
        },
        date,
      );
      expect(message).toContain('2023-11-14');
      expect(message).toContain('12');
      expect(message).toMatch(/remplac/i);
    });

    it('accorde le singulier', () => {
      const message = formatVaultReplacement(
        { version: 1, createdAt: 0, cookieCount: 1, domains: ['a.test'] },
        date,
      );
      expect(message).toContain('(1 cookie)');
    });
  });
});
