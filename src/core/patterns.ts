/**
 * Normalisation des motifs de keep-list.
 *
 * Un motif mal formé accepté en silence ne protège rien : c'est le pire résultat
 * possible pour un outil de suppression. Toute saisie passe donc par ici, qui
 * corrige les fautes courantes ou refuse explicitement.
 *
 * `*google.com` est corrigé en `*.google.com` plutôt qu'interprété comme un
 * suffixe littéral : un suffixe couvrirait aussi `evilgoogle.com`, ce qui
 * transformerait une faute de frappe en faille.
 */

export type PatternResult =
  | { ok: true; pattern: string; changed: boolean }
  | { ok: false; reason: string };

const INVALID_CHARS = /[\s/\\@:?#]/;

export function normalizePattern(input: string): PatternResult {
  const original = input.trim().toLowerCase();
  if (original === '') return { ok: false, reason: 'motif vide' };
  if (original === '*') return { ok: true, pattern: '*', changed: false };

  let pattern = original;

  // URL collée : on ne garde que l'hôte.
  pattern = pattern.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const slash = pattern.indexOf('/');
  if (slash !== -1) pattern = pattern.slice(0, slash);
  pattern = pattern.replace(/:\d+$/, '');

  // `.github.com` désigne un domaine et ses sous-domaines : c'est `*.github.com`.
  if (pattern.startsWith('.')) pattern = `*${pattern}`;
  // `*google.com` : le point manque entre le wildcard et le domaine.
  else if (pattern.startsWith('*') && !pattern.startsWith('*.')) {
    pattern = `*.${pattern.slice(1)}`;
  }

  const body = pattern.startsWith('*.') ? pattern.slice(2) : pattern;

  if (body === '') return { ok: false, reason: 'motif sans domaine' };
  if (body.includes('*')) return { ok: false, reason: 'le wildcard doit être en tête, sous la forme *.exemple.com' };
  if (INVALID_CHARS.test(body)) return { ok: false, reason: 'caractère interdit dans le motif' };
  if (body.startsWith('.') || body.endsWith('.') || body.includes('..')) {
    return { ok: false, reason: 'point mal placé dans le motif' };
  }

  return { ok: true, pattern, changed: pattern !== original };
}
