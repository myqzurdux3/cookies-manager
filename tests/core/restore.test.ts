import { describe, it, expect } from 'vitest';
import { restoreDetails } from '../../src/core/restore';
import type { StoredCookie } from '../../src/core/vault';

function cookie(overrides: Partial<StoredCookie> = {}): StoredCookie {
  return {
    name: 'session',
    domain: '.github.com',
    path: '/',
    secure: true,
    value: 'abc',
    hostOnly: false,
    httpOnly: true,
    sameSite: 'lax',
    session: false,
    expirationDate: 2_000_000_000,
    ...overrides,
  };
}

describe('restoreDetails', () => {
  it('reconstruit une URL cohérente avec le domaine et le chemin', () => {
    expect(restoreDetails(cookie({ path: '/app' })).url).toBe('https://github.com/app');
  });

  it('utilise http pour un cookie non sécurisé', () => {
    expect(restoreDetails(cookie({ secure: false })).url).toBe('http://github.com/');
  });

  it('reporte domaine, httpOnly, sameSite et expiration', () => {
    expect(restoreDetails(cookie())).toMatchObject({
      domain: '.github.com',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      expirationDate: 2_000_000_000,
      path: '/',
      name: 'session',
      value: 'abc',
    });
  });

  it('omet l’expiration d’un cookie de session', () => {
    const details = restoreDetails(cookie({ session: true, expirationDate: undefined }));
    expect('expirationDate' in details).toBe(false);
  });

  it('omet le domaine d’un cookie host-only', () => {
    const details = restoreDetails(cookie({ hostOnly: true, domain: 'github.com' }));
    expect('domain' in details).toBe(false);
    expect(details.url).toBe('https://github.com/');
  });

  it('omet le domaine d’un cookie préfixé __Host- même si le domaine est stocké', () => {
    const details = restoreDetails(cookie({ name: '__Host-device_id', domain: '.claude.ai' }));
    expect('domain' in details).toBe(false);
  });

  it('force chemin racine et secure pour un cookie __Host-', () => {
    const details = restoreDetails(
      cookie({ name: '__Host-device_id', path: '/sous-chemin', secure: false }),
    );
    expect(details.path).toBe('/');
    expect(details.secure).toBe(true);
    expect(details.url?.startsWith('https://')).toBe(true);
  });

  it('force secure pour un cookie préfixé __Secure-', () => {
    const details = restoreDetails(cookie({ name: '__Secure-token', secure: false }));
    expect(details.secure).toBe(true);
  });

  it('conserve le chemin d’un cookie __Secure-, contrairement à __Host-', () => {
    expect(restoreDetails(cookie({ name: '__Secure-token', path: '/api' })).path).toBe('/api');
  });

  it('reporte le magasin de cookies quand il est connu', () => {
    expect(restoreDetails(cookie({ storeId: '1' })).storeId).toBe('1');
  });

  it('tolère un coffre ancien dépourvu des champs ajoutés', () => {
    const ancien = {
      name: 'session',
      domain: '.github.com',
      path: '/',
      secure: true,
      value: 'abc',
    } as StoredCookie;
    const details = restoreDetails(ancien);
    expect(details).toMatchObject({ domain: '.github.com', url: 'https://github.com/' });
    expect('expirationDate' in details).toBe(false);
  });
});
