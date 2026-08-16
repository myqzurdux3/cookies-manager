import { describe, it, expect } from 'vitest';
import { normalizePattern } from '../../src/core/patterns';
import { matchesPattern } from '../../src/core/matcher';

function ok(input: string) {
  const result = normalizePattern(input);
  if (!result.ok) throw new Error(`attendu valide, refusé : ${result.reason}`);
  return result;
}

describe('normalizePattern', () => {
  it('laisse un hôte exact inchangé', () => {
    expect(ok('github.com')).toEqual({ ok: true, pattern: 'github.com', changed: false });
  });

  it('laisse un wildcard bien formé inchangé', () => {
    expect(ok('*.github.com')).toEqual({ ok: true, pattern: '*.github.com', changed: false });
  });

  it('accepte le wildcard universel', () => {
    expect(ok('*')).toEqual({ ok: true, pattern: '*', changed: false });
  });

  it('rétablit le point manquant de *google.com', () => {
    expect(ok('*google.com')).toEqual({ ok: true, pattern: '*.google.com', changed: true });
  });

  it('rétablit le point manquant de *claude.ai', () => {
    expect(ok('*claude.ai')).toEqual({ ok: true, pattern: '*.claude.ai', changed: true });
  });

  it('traduit un point de tête en wildcard', () => {
    expect(ok('.github.com')).toEqual({ ok: true, pattern: '*.github.com', changed: true });
  });

  it('accepte une URL collée et n’en garde que l’hôte', () => {
    expect(ok('https://github.com/user/repo')).toEqual({
      ok: true,
      pattern: 'github.com',
      changed: true,
    });
  });

  it('retire le port', () => {
    expect(ok('localhost:3000')).toEqual({ ok: true, pattern: 'localhost', changed: true });
  });

  it('normalise la casse et les espaces sans le signaler comme réécriture', () => {
    // `changed` sert à prévenir l'utilisateur d'une réécriture structurelle.
    // Une mise en minuscules n'en est pas une : la signaler serait du bruit.
    expect(ok('  GitHub.COM  ')).toEqual({ ok: true, pattern: 'github.com', changed: false });
  });

  it('refuse un motif vide', () => {
    expect(normalizePattern('   ')).toMatchObject({ ok: false });
  });

  it('refuse un wildcard interne', () => {
    expect(normalizePattern('git*hub.com')).toMatchObject({ ok: false });
  });

  it('refuse un wildcard sans domaine', () => {
    expect(normalizePattern('*.')).toMatchObject({ ok: false });
  });

  it('refuse un point final ou doublé', () => {
    expect(normalizePattern('github.com.')).toMatchObject({ ok: false });
    expect(normalizePattern('github..com')).toMatchObject({ ok: false });
  });

  it('refuse une espace interne', () => {
    expect(normalizePattern('git hub.com')).toMatchObject({ ok: false });
  });
});

describe('le motif normalisé protège vraiment', () => {
  it('*google.com normalisé couvre les sous-domaines et l’apex', () => {
    const { pattern } = ok('*google.com');
    expect(matchesPattern('accounts.google.com', pattern)).toBe(true);
    expect(matchesPattern('google.com', pattern)).toBe(true);
    expect(matchesPattern('.google.com', pattern)).toBe(true);
  });

  it('*claude.ai normalisé couvre claude.ai', () => {
    const { pattern } = ok('*claude.ai');
    expect(matchesPattern('claude.ai', pattern)).toBe(true);
    expect(matchesPattern('www.claude.ai', pattern)).toBe(true);
  });

  it('ne laisse pas un domaine voisin se faire passer pour le bon', () => {
    const { pattern } = ok('*google.com');
    expect(matchesPattern('evilgoogle.com', pattern)).toBe(false);
    expect(matchesPattern('google.com.attaquant.net', pattern)).toBe(false);
  });
});
