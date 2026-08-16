import { describe, it, expect } from 'vitest';
import { normalizeHost, matchesPattern, isProtected, cookieProtection } from '../../src/core/matcher';
import type { KeepRule } from '../../src/core/types';

describe('normalizeHost', () => {
  it('retire le point initial des domaines de cookie', () => {
    expect(normalizeHost('.github.com')).toBe('github.com');
  });

  it('met en minuscules', () => {
    expect(normalizeHost('GitHub.COM')).toBe('github.com');
  });
});

describe('matchesPattern', () => {
  it('correspond exactement', () => {
    expect(matchesPattern('github.com', 'github.com')).toBe(true);
  });

  it('correspond au domaine de cookie pointé', () => {
    expect(matchesPattern('.github.com', 'github.com')).toBe(true);
  });

  it('ne correspond pas à un sous-domaine sans wildcard', () => {
    expect(matchesPattern('gist.github.com', 'github.com')).toBe(false);
  });

  it('ne correspond pas à un domaine qui contient le motif en suffixe', () => {
    expect(matchesPattern('evilgithub.com', 'github.com')).toBe(false);
  });

  it('le wildcard couvre les sous-domaines', () => {
    expect(matchesPattern('gist.github.com', '*.github.com')).toBe(true);
  });

  it('le wildcard couvre aussi le domaine nu', () => {
    expect(matchesPattern('github.com', '*.github.com')).toBe(true);
  });

  it('le wildcard ne franchit pas la frontière de label', () => {
    expect(matchesPattern('evilgithub.com', '*.github.com')).toBe(false);
  });

  it('l\'étoile seule correspond à tout', () => {
    expect(matchesPattern('n-importe-quoi.fr', '*')).toBe(true);
  });
});

describe('isProtected', () => {
  const rules: KeepRule[] = [
    { pattern: 'github.com', keep: { cookies: true } },
    { pattern: '*.github.com', keep: { history: true } },
  ];

  it('protège une catégorie couverte par une règle', () => {
    expect(isProtected('github.com', 'cookies', rules)).toBe(true);
  });

  it('ne protège pas une catégorie absente des règles', () => {
    expect(isProtected('github.com', 'httpCache', rules)).toBe(false);
  });

  it('additionne les protections de plusieurs règles', () => {
    expect(isProtected('github.com', 'history', rules)).toBe(true);
  });

  it('ne protège pas un hôte non couvert', () => {
    expect(isProtected('example.com', 'cookies', rules)).toBe(false);
  });
});

describe('cookieProtection', () => {
  it('protège tous les cookies quand aucun nom n\'est précisé', () => {
    const rules: KeepRule[] = [{ pattern: 'github.com', keep: { cookies: true } }];
    expect(cookieProtection('github.com', rules)).toEqual({ all: true, names: new Set() });
  });

  it('protège uniquement les noms listés', () => {
    const rules: KeepRule[] = [
      { pattern: 'github.com', keep: { cookies: true }, keepCookies: ['user_session'] },
    ];
    expect(cookieProtection('github.com', rules)).toEqual({
      all: false,
      names: new Set(['user_session']),
    });
  });

  it('unit les noms de deux règles', () => {
    const rules: KeepRule[] = [
      { pattern: 'github.com', keep: { cookies: true }, keepCookies: ['user_session'] },
      { pattern: '*.github.com', keep: { cookies: true }, keepCookies: ['dotcom_user'] },
    ];
    expect(cookieProtection('github.com', rules).names).toEqual(
      new Set(['user_session', 'dotcom_user']),
    );
  });

  it('une règle sans liste de noms l\'emporte sur une règle restrictive', () => {
    const rules: KeepRule[] = [
      { pattern: 'github.com', keep: { cookies: true }, keepCookies: ['user_session'] },
      { pattern: '*.github.com', keep: { cookies: true } },
    ];
    expect(cookieProtection('github.com', rules).all).toBe(true);
  });

  it('ignore une règle qui ne protège pas les cookies', () => {
    const rules: KeepRule[] = [{ pattern: 'github.com', keep: { history: true } }];
    expect(cookieProtection('github.com', rules)).toEqual({ all: false, names: new Set() });
  });
});
