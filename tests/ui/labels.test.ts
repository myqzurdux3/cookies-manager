import { describe, it, expect } from 'vitest';
import {
  CATEGORY_LABELS,
  formatRestoreReport,
  formatVaultState,
  needsExtraConfirmation,
  previewRow,
  profileMeta,
  reportRow,
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
    expect(reportRow({ category: 'cookies', report: { status: 'ok', deleted: 3, kept: 2 } })).toEqual(
      { label: 'Cookies', value: '3 supprimé(s) · 2 conservé(s)', tone: 'strong' },
    );
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
});
