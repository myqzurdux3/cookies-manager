import { describe, it, expect } from 'vitest';
import {
  CATEGORY_LABELS,
  formatPreview,
  formatReport,
  formatRestoreReport,
  formatVaultState,
  needsExtraConfirmation,
} from '../../src/ui/labels';
import { ALL_CATEGORIES } from '../../src/core/types';

describe('CATEGORY_LABELS', () => {
  it('nomme chaque catégorie', () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
    }
  });
});

describe('formatPreview', () => {
  it('affiche un décompte exact', () => {
    expect(formatPreview({ category: 'cookies', preview: { countable: true, items: 12 } })).toBe(
      'Cookies : 12 à supprimer',
    );
  });

  it('affiche le singulier au singulier', () => {
    expect(formatPreview({ category: 'cookies', preview: { countable: true, items: 1 } })).toBe(
      'Cookies : 1 à supprimer',
    );
  });

  it("affiche « non chiffrable » quand l'API ne compte pas", () => {
    expect(
      formatPreview({ category: 'httpCache', preview: { countable: false, items: 0, note: 'tout ou rien' } }),
    ).toBe('Cache HTTP : non chiffrable — tout ou rien');
  });
});

describe('formatReport', () => {
  it('résume un nettoyage réussi', () => {
    expect(
      formatReport({ category: 'cookies', report: { status: 'ok', deleted: 3, kept: 2 } }),
    ).toBe('Cookies : 3 supprimé(s), 2 conservé(s)');
  });

  it("fait remonter l'erreur d'un nettoyage partiel", () => {
    expect(
      formatReport({
        category: 'history',
        report: { status: 'partial', deleted: 1, kept: 0, error: 'verrouillé' },
      }),
    ).toBe('Historique : 1 supprimé(s), 0 conservé(s) — échec partiel : verrouillé');
  });

  it('signale un échec complet', () => {
    expect(
      formatReport({
        category: 'passwords',
        report: { status: 'failed', deleted: 0, kept: 0, error: 'permission refusée' },
      }),
    ).toBe('Mots de passe : échec — permission refusée');
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
