import type { StorageArea } from './profiles';

/**
 * Coffre de sauvegarde des cookies condamnés.
 *
 * Un coffre de cookies est un coffre de jetons de session actifs : déchiffré, il
 * permet d'usurper les sessions concernées sans mot de passe ni second facteur.
 * D'où le chiffrement systématique, la clé jamais persistée, et la rétention
 * courte par défaut.
 */

export const VAULT_KEY = 'vault';
export const DEFAULT_RETENTION_DAYS = 7;
export const PBKDF2_ITERATIONS = 310_000;

/**
 * Le compte d'itérations est relu du stockage, pas de la constante : un coffre
 * écrit par une version antérieure reste lisible. Il faut donc le borner —
 * une valeur aberrante bloquerait le service worker le temps du calcul.
 */
export const MAX_PBKDF2_ITERATIONS = 1_000_000;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Instantané d'un cookie. Les champs optionnels ont été ajoutés après la
 * première version du coffre : un coffre écrit avant leur ajout reste lisible,
 * la restauration retombant sur les valeurs par défaut du navigateur.
 */
export type StoredCookie = {
  name: string;
  domain: string;
  path: string;
  secure: boolean;
  value: string;
  storeId?: string;
  hostOnly?: boolean;
  httpOnly?: boolean;
  sameSite?: chrome.cookies.SameSiteStatus;
  session?: boolean;
  expirationDate?: number;
};

export type VaultRecord = {
  version: 1;
  salt: string;
  iv: string;
  iterations: number;
  cipher: string;
  createdAt: number;
  cookieCount: number;
  domains: string[];
};

export type VaultSummary = Pick<VaultRecord, 'version' | 'createdAt' | 'cookieCount' | 'domains'>;

export interface Vault {
  store(cookies: StoredCookie[], passphrase: string, at: number): Promise<void>;
  read(passphrase: string): Promise<StoredCookie[]>;
  describe(): Promise<VaultSummary | null>;
  purgeExpired(now: number, retentionDays: number): Promise<boolean>;
  clear(): Promise<void>;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isRecord(value: unknown): value is VaultRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<VaultRecord>;
  return (
    typeof candidate.cipher === 'string' &&
    typeof candidate.salt === 'string' &&
    typeof candidate.iv === 'string' &&
    typeof candidate.iterations === 'number' &&
    Number.isInteger(candidate.iterations) &&
    candidate.iterations >= 1 &&
    candidate.iterations <= MAX_PBKDF2_ITERATIONS &&
    typeof candidate.createdAt === 'number'
  );
}

/**
 * `iterations` n'est paramétrable que pour les tests : dériver une clé à
 * 310 000 itérations coûte ~40 ms, et la suite le fait quinze fois. Le chemin
 * de lecture prend de toute façon le compte dans l'enregistrement, pas dans
 * cette valeur — un coffre reste donc lisible quel qu'ait été le réglage.
 */
export function createVault(
  cryptoApi: Crypto,
  area: StorageArea,
  iterations: number = PBKDF2_ITERATIONS,
): Vault {
  async function deriveKey(
    passphrase: string,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number,
  ): Promise<CryptoKey> {
    const material = await cryptoApi.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return cryptoApi.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  async function load(): Promise<VaultRecord | null> {
    const stored = await area.get(VAULT_KEY);
    const value = stored[VAULT_KEY];
    if (value === undefined || value === null) return null;
    if (!isRecord(value)) throw new Error('coffre illisible : enregistrement malformé');
    return value;
  }

  return {
    async store(cookies: StoredCookie[], passphrase: string, at: number): Promise<void> {
      const salt = cryptoApi.getRandomValues(new Uint8Array(SALT_BYTES));
      const iv = cryptoApi.getRandomValues(new Uint8Array(IV_BYTES));
      const key = await deriveKey(passphrase, salt, iterations);
      const cipher = await cryptoApi.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(JSON.stringify(cookies)),
      );

      const record: VaultRecord = {
        version: 1,
        salt: toBase64(salt),
        iv: toBase64(iv),
        iterations,
        cipher: toBase64(new Uint8Array(cipher)),
        createdAt: at,
        cookieCount: cookies.length,
        domains: [...new Set(cookies.map((cookie) => cookie.domain))],
      };

      await area.set({ [VAULT_KEY]: record });
    },

    async read(passphrase: string): Promise<StoredCookie[]> {
      const record = await load();
      if (record === null) throw new Error('aucun coffre enregistré');

      let salt: Uint8Array<ArrayBuffer>;
      let iv: Uint8Array<ArrayBuffer>;
      let cipher: Uint8Array<ArrayBuffer>;
      try {
        salt = fromBase64(record.salt);
        iv = fromBase64(record.iv);
        cipher = fromBase64(record.cipher);
      } catch {
        throw new Error('coffre illisible : contenu corrompu');
      }

      const key = await deriveKey(passphrase, salt, record.iterations);
      let plain: ArrayBuffer;
      try {
        plain = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
      } catch {
        // AES-GCM authentifie le message : un échec signifie mauvaise clé ou
        // contenu altéré. On ne rend jamais de données partielles.
        throw new Error('phrase incorrecte, ou coffre altéré');
      }

      return JSON.parse(new TextDecoder().decode(plain)) as StoredCookie[];
    },

    async describe(): Promise<VaultSummary | null> {
      const record = await load();
      if (record === null) return null;
      return {
        version: record.version,
        createdAt: record.createdAt,
        cookieCount: record.cookieCount,
        domains: record.domains,
      };
    },

    async purgeExpired(now: number, retentionDays: number): Promise<boolean> {
      const record = await load();
      if (record === null) return false;
      if (now - record.createdAt < retentionDays * DAY_MS) return false;
      await this.clear();
      return true;
    },

    async clear(): Promise<void> {
      // `set({ vault: undefined })` ne supprimerait rien : la sérialisation JSON
      // de chrome.storage laisse la clé et son contenu en place.
      if (area.remove !== undefined) {
        await area.remove(VAULT_KEY);
        return;
      }
      await area.set({ [VAULT_KEY]: null });
    },
  };
}
