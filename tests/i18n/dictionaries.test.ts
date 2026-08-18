import { describe, it, expect, afterEach } from 'vitest';
import { EN } from '../../src/i18n/en';
import { FR } from '../../src/i18n/fr';
import {
  applyPreference,
  browserLanguage,
  language,
  msg,
  resolveLanguage,
  setLanguage,
} from '../../src/i18n';

/** Chemins de toutes les feuilles, avec leur type : « options.added: function ». */
function shape(node: unknown, prefix = ''): string[] {
  if (Array.isArray(node)) return [`${prefix}: array(${node.length})`];
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([key, value]) =>
      shape(value, prefix === '' ? key : `${prefix}.${key}`),
    );
  }
  return [`${prefix}: ${typeof node}`];
}

afterEach(() => {
  setLanguage('fr');
});

describe('dictionnaires', () => {
  it('ont exactement les mêmes clés, du même type', () => {
    // Le typage l'impose déjà à la compilation ; ce test le vérifie à
    // l'exécution, y compris pour les tableaux de fragments enrichis, dont la
    // longueur doit correspondre pour que la phrase reste construite pareil.
    expect(shape(EN).sort()).toEqual(shape(FR).sort());
  });

  it('ne laissent aucune traduction vide', () => {
    for (const [name, dict] of [
      ['fr', FR],
      ['en', EN],
    ] as const) {
      for (const path of shape(dict)) {
        expect(`${name} ${path}`).not.toMatch(/: (undefined|object)$/);
      }
    }
  });

  it('traduisent réellement : les phrases longues diffèrent entre les deux', () => {
    // Les libellés courts peuvent coïncider (« Cookies », « IndexedDB ») ; une
    // phrase identique dans les deux langues signale un oubli de traduction.
    expect(FR.popup.dangerHint).not.toBe(EN.popup.dangerHint);
    expect(FR.options.tagline).not.toBe(EN.options.tagline);
    expect(FR.notes.cookiesPartitioned).not.toBe(EN.notes.cookiesPartitioned);
  });
});

/** Toutes les fonctions du dictionnaire, avec leur chemin. */
function functions(node: unknown, prefix = ''): [string, (...args: never[]) => unknown][] {
  if (typeof node === 'function') return [[prefix, node as (...args: never[]) => unknown]];
  if (Array.isArray(node)) return [];
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([key, value]) =>
      functions(value, prefix === '' ? key : `${prefix}.${key}`),
    );
  }
  return [];
}

describe('phrases construites', () => {
  it('rendent une chaîne utile, au singulier comme au pluriel', () => {
    // Une interpolation qui vise une clé absente rend « undefined » au milieu
    // d'une phrase, sans lever d'erreur : seule l'exécution le montre.
    for (const [name, dict] of [
      ['fr', FR],
      ['en', EN],
    ] as const) {
      for (const [path, fn] of functions(dict)) {
        for (const value of [1, 2]) {
          const args = Array.from({ length: fn.length }, () => value) as never[];
          const rendered = fn(...args);
          expect(typeof rendered, `${name} ${path}`).toBe('string');
          expect(rendered as string, `${name} ${path}`).not.toBe('');
          expect(rendered as string, `${name} ${path}`).not.toContain('undefined');
        }
      }
    }
  });

  it('couvre les deux dictionnaires en entier', () => {
    expect(functions(FR).length).toBe(functions(EN).length);
    expect(functions(FR).length).toBeGreaterThan(30);
  });
});

describe('resolveLanguage', () => {
  it('respecte une préférence explicite, quelle que soit la langue du navigateur', () => {
    expect(resolveLanguage('fr', 'en-US')).toBe('fr');
    expect(resolveLanguage('en', 'fr-FR')).toBe('en');
  });

  it('suit le navigateur en automatique, anglais par défaut', () => {
    expect(resolveLanguage('auto', 'fr-CA')).toBe('fr');
    expect(resolveLanguage('auto', 'FR')).toBe('fr');
    expect(resolveLanguage('auto', 'de-DE')).toBe('en');
    expect(resolveLanguage('auto', '')).toBe('en');
  });

  it('traite une valeur inconnue comme « automatique »', () => {
    // Un réglage abîmé ne doit pas laisser l'interface sans dictionnaire.
    const corrupted = 'klingon' as unknown as 'auto';
    expect(resolveLanguage(corrupted, 'fr-FR')).toBe('fr');
    expect(resolveLanguage(corrupted, 'en-GB')).toBe('en');
  });
});

describe('langue active', () => {
  it('change le dictionnaire rendu par msg()', () => {
    setLanguage('en');
    expect(language()).toBe('en');
    expect(msg().popup.clean).toBe(EN.popup.clean);
    setLanguage('fr');
    expect(msg().popup.clean).toBe(FR.popup.clean);
  });

  it('rend une chaîne vide quand `chrome` n’existe pas', () => {
    // Hors extension, la référence est une ReferenceError, pas une propriété
    // absente : sans le `try`, tout appelant planterait.
    expect(browserLanguage()).toBe('');
  });

  it('applyPreference applique et rend la langue retenue', () => {
    expect(applyPreference('fr')).toBe('fr');
    expect(language()).toBe('fr');
    expect(applyPreference('auto')).toBe('en');
  });
});
