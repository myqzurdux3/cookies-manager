import { describe, it, expect } from 'vitest';
import { createVault, DEFAULT_RETENTION_DAYS, VAULT_KEY } from '../../src/core/vault';
import type { StorageArea } from '../../src/core/profiles';

// WebCrypto est global depuis Node 18 : pas besoin d'importer node:crypto, ce qui
// éviterait d'ajouter @types/node aux dépendances de développement.
const crypto = globalThis.crypto;

function fakeArea(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  const area: StorageArea = {
    async get(key: string) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
    },
  };
  return { area, data };
}

const COOKIES = [
  { name: 'user_session', domain: '.github.com', path: '/', secure: true, value: 'secret' },
  { name: '_ga', domain: '.example.com', path: '/', secure: false, value: 'tracking' },
];

const DAY = 24 * 60 * 60 * 1000;

describe('createVault', () => {
  it('rend les cookies identiques après un aller-retour', async () => {
    const { area } = fakeArea();
    const vault = createVault(crypto, area);
    await vault.store(COOKIES, 'phrase correcte', 1000);
    expect(await vault.read('phrase correcte')).toEqual(COOKIES);
  });

  it('rejette une phrase incorrecte sans rendre de données', async () => {
    const { area } = fakeArea();
    const vault = createVault(crypto, area);
    await vault.store(COOKIES, 'phrase correcte', 1000);
    await expect(vault.read('mauvaise phrase')).rejects.toThrow(/phrase incorrecte/i);
  });

  it('distingue un coffre absent d’une phrase incorrecte', async () => {
    const { area } = fakeArea();
    const vault = createVault(crypto, area);
    await expect(vault.read('peu importe')).rejects.toThrow(/aucun coffre/i);
    expect(await vault.describe()).toBeNull();
  });

  it('signale un coffre illisible', async () => {
    const { area } = fakeArea({ [VAULT_KEY]: { version: 1, cipher: 'pas du base64 valide !!' } });
    const vault = createVault(crypto, area);
    await expect(vault.read('peu importe')).rejects.toThrow(/illisible/i);
  });

  it('produit un chiffré différent à chaque écriture, à phrase égale', async () => {
    const { area, data } = fakeArea();
    const vault = createVault(crypto, area);
    await vault.store(COOKIES, 'même phrase', 1000);
    const first = structuredClone(data[VAULT_KEY]) as { cipher: string; salt: string; iv: string };
    await vault.store(COOKIES, 'même phrase', 2000);
    const second = data[VAULT_KEY] as { cipher: string; salt: string; iv: string };
    expect(second.cipher).not.toBe(first.cipher);
    expect(second.salt).not.toBe(first.salt);
    expect(second.iv).not.toBe(first.iv);
  });

  it('ne divulgue ni chiffré, ni sel, ni vecteur, ni valeur de cookie dans describe', async () => {
    const { area } = fakeArea();
    const vault = createVault(crypto, area);
    await vault.store(COOKIES, 'phrase', 1000);
    const described = await vault.describe();
    expect(described).toMatchObject({ createdAt: 1000, cookieCount: 2 });
    const serialized = JSON.stringify(described);
    expect(serialized).not.toMatch(/cipher|salt|iv|secret|tracking/);
  });

  it('résume les domaines sans doublon dans describe', async () => {
    const { area } = fakeArea();
    const vault = createVault(crypto, area);
    await vault.store([...COOKIES, { ...COOKIES[0]!, name: 'autre' }], 'phrase', 1000);
    expect((await vault.describe())!.domains.sort()).toEqual(['.example.com', '.github.com']);
  });

  it('écrit sous la seule clé du coffre', async () => {
    const { area, data } = fakeArea({ runs: ['journal intact'] });
    const vault = createVault(crypto, area);
    await vault.store(COOKIES, 'phrase', 1000);
    expect(Object.keys(data).sort()).toEqual(['runs', VAULT_KEY].sort());
    expect(data.runs).toEqual(['journal intact']);
  });

  it('supprime un coffre au-delà de la rétention', async () => {
    const { area } = fakeArea();
    const vault = createVault(crypto, area);
    await vault.store(COOKIES, 'phrase', 0);
    expect(await vault.purgeExpired((DEFAULT_RETENTION_DAYS + 1) * DAY, DEFAULT_RETENTION_DAYS)).toBe(true);
    expect(await vault.describe()).toBeNull();
  });

  it('conserve un coffre encore dans la rétention', async () => {
    const { area } = fakeArea();
    const vault = createVault(crypto, area);
    await vault.store(COOKIES, 'phrase', 0);
    expect(await vault.purgeExpired(DAY, DEFAULT_RETENTION_DAYS)).toBe(false);
    expect(await vault.describe()).not.toBeNull();
  });

  it('efface le coffre à la demande', async () => {
    const { area } = fakeArea();
    const vault = createVault(crypto, area);
    await vault.store(COOKIES, 'phrase', 1000);
    await vault.clear();
    expect(await vault.describe()).toBeNull();
  });

  it('efface par remove quand l’aire de stockage le propose', async () => {
    const { area, data } = fakeArea();
    const removed: string[] = [];
    const withRemove = {
      ...area,
      async remove(key: string) {
        removed.push(key);
        delete data[key];
      },
    };
    const vault = createVault(crypto, withRemove);
    await vault.store(COOKIES, 'phrase', 1000);
    await vault.clear();
    expect(removed).toEqual([VAULT_KEY]);
    expect(VAULT_KEY in data).toBe(false);
  });

  it('traite un coffre effacé par écriture de null comme absent', async () => {
    const { area } = fakeArea({ [VAULT_KEY]: null });
    const vault = createVault(crypto, area);
    expect(await vault.describe()).toBeNull();
    await expect(vault.read('phrase')).rejects.toThrow(/aucun coffre/i);
  });
});
