import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Deux chaînes françaises avaient échappé à la traduction — les raisons de refus
 * d'un motif vide — et rien ne l'a signalé : ni le compilateur, qui n'a pas
 * d'avis sur le contenu d'une chaîne, ni les tests, qui les lisaient en
 * français. Ce garde-fou les aurait vues.
 */
function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path === join('src', 'i18n') ? [] : tsFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** Retire commentaires de bloc et de ligne, pour ne garder que du code. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const STRING = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
const FRENCH = /[àâäçéèêëîïôöûùüÿœÀÂÇÉÈÊËÎÏÔÛÙŒ«»]/;

describe('chaînes figées', () => {
  it('ne laisse aucun texte français hors des dictionnaires', () => {
    const offenders = tsFiles('src').flatMap((file) => {
      const matches = withoutComments(readFileSync(file, 'utf8')).match(STRING) ?? [];
      return matches.filter((literal) => FRENCH.test(literal)).map((l) => `${file}: ${l}`);
    });
    expect(offenders).toEqual([]);
  });

  it('trouve bien les fautives quand il y en a', () => {
    // Sans cette contre-épreuve, un `tsFiles` qui ne rendrait rien passerait
    // pour un dépôt propre.
    const faulty = withoutComments(`const x = 'période invalide'; // commentaire à accent`);
    expect((faulty.match(STRING) ?? []).filter((l) => FRENCH.test(l))).toHaveLength(1);
    expect(tsFiles('src').length).toBeGreaterThan(15);
  });
});
