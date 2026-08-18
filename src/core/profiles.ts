import { normalizePattern } from './patterns';
import { ALL_CATEGORIES } from './types';
import type { Profile, Since, Category } from './types';

export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  /**
   * `chrome.storage.local` sérialise en JSON : écrire `undefined` laisse la clé
   * intacte au lieu de l'effacer. Toute suppression réelle passe donc par
   * `remove`. Optionnel pour rester compatible avec les aires de test.
   */
  remove?(key: string): Promise<void>;
}

const KEY = 'profiles';

export const DEFAULT_PROFILES: Profile[] = [
  {
    id: 'light',
    name: 'Nettoyage léger',
    since: 'day',
    categories: ['cookies', 'httpCache'],
    keepRules: [],
  },
  {
    id: 'full',
    name: 'Nettoyage complet',
    since: 'all',
    categories: [
      'cookies',
      'localStorage',
      'indexedDB',
      'cacheStorage',
      'serviceWorkers',
      'httpCache',
      'history',
      'downloads',
    ],
    keepRules: [],
  },
];

export interface ProfileStore {
  list(): Promise<Profile[]>;
  save(profile: Profile): Promise<void>;
  remove(id: string): Promise<void>;
  exportJson(): Promise<string>;
  importJson(json: string): Promise<void>;
}

function validate(value: unknown): Profile[] {
  if (!Array.isArray(value)) throw new Error('format de profils invalide');

  const validSince = new Set<string>(['hour', 'day', 'week', 'month', 'all']);
  const validCategories = new Set(ALL_CATEGORIES);

  for (const profile of value) {
    if (typeof profile?.id !== 'string' || typeof profile?.name !== 'string') {
      throw new Error('format de profils invalide');
    }
    if (!Array.isArray(profile.categories) || !Array.isArray(profile.keepRules)) {
      throw new Error('format de profils invalide');
    }

    // Validate since
    if (typeof profile.since !== 'string' || !validSince.has(profile.since)) {
      throw new Error('période invalide');
    }

    // Validate categories
    for (const category of profile.categories) {
      if (typeof category !== 'string' || !validCategories.has(category as Category)) {
        throw new Error('catégorie inconnue');
      }
    }

    // Validate keepRules
    for (const rule of profile.keepRules) {
      if (typeof rule?.pattern !== 'string' || rule.pattern.trim() === '') {
        throw new Error('motif vide dans la keep-list');
      }

      // Validate keep object
      const keep = rule.keep;
      if (keep === null || typeof keep !== 'object' || Array.isArray(keep)) {
        throw new Error('règle de conservation invalide');
      }
      for (const [key, val] of Object.entries(keep)) {
        if (!validCategories.has(key as Category) || val !== true) {
          throw new Error('règle de conservation invalide');
        }
      }

      // Validate keepCookies if present
      if ('keepCookies' in rule && rule.keepCookies !== undefined) {
        if (!Array.isArray(rule.keepCookies) || !rule.keepCookies.every((item: unknown) => typeof item === 'string')) {
          throw new Error('liste de cookies invalide');
        }
      }
    }
  }
  return value as Profile[];
}

/**
 * Un motif mal formé enregistré tel quel ne protège rien, sans le dire. Toute
 * écriture passe donc par la normalisation : les fautes courantes sont
 * corrigées, le reste est refusé.
 */
function normalizeRules(profile: Profile): Profile {
  return {
    ...profile,
    keepRules: profile.keepRules.map((rule) => {
      const result = normalizePattern(rule.pattern);
      if (!result.ok) throw new Error(`motif refusé « ${rule.pattern} » : ${result.reason}`);
      return { ...rule, pattern: result.pattern };
    }),
  };
}

/**
 * Même correction, appliquée à la lecture : un profil enregistré avant que la
 * normalisation existe contient peut-être un motif inerte comme `*google.com`.
 * Le corriger au chargement évite qu'il continue de ne rien protéger en silence.
 * Ici on ne jette jamais — un motif irrécupérable est laissé tel quel plutôt que
 * de rendre toute la liste de profils illisible.
 */
function repairRules(profile: Profile): Profile {
  return {
    ...profile,
    keepRules: profile.keepRules.map((rule) => {
      const result = normalizePattern(rule.pattern);
      return result.ok ? { ...rule, pattern: result.pattern } : rule;
    }),
  };
}

export function createProfileStore(area: StorageArea): ProfileStore {
  async function read(): Promise<Profile[]> {
    const stored = await area.get(KEY);
    const value = stored[KEY];
    if (value === undefined) return structuredClone(DEFAULT_PROFILES);
    return validate(value).map(repairRules);
  }

  async function write(profiles: Profile[]): Promise<void> {
    await area.set({ [KEY]: profiles });
  }

  return {
    list: read,

    async save(profile) {
      const normalized = normalizeRules(profile);
      const profiles = await read();
      const index = profiles.findIndex((p) => p.id === normalized.id);
      if (index === -1) profiles.push(normalized);
      else profiles[index] = normalized;
      await write(profiles);
    },

    async remove(id) {
      await write((await read()).filter((p) => p.id !== id));
    },

    async exportJson() {
      return JSON.stringify(await read(), null, 2);
    },

    async importJson(json) {
      await write(validate(JSON.parse(json)).map(normalizeRules));
    },
  };
}
