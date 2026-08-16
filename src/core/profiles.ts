import type { Profile } from './types';

export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const KEY = 'profiles';

export const DEFAULT_PROFILES: Profile[] = [
  {
    id: 'light',
    name: 'Nettoyage léger',
    since: 'day',
    categories: ['cookies', 'httpCache'],
    keepRules: [{ pattern: '*', keep: {} }],
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
  for (const profile of value) {
    if (typeof profile?.id !== 'string' || typeof profile?.name !== 'string') {
      throw new Error('format de profils invalide');
    }
    if (!Array.isArray(profile.categories) || !Array.isArray(profile.keepRules)) {
      throw new Error('format de profils invalide');
    }
    for (const rule of profile.keepRules) {
      if (typeof rule?.pattern !== 'string' || rule.pattern.trim() === '') {
        throw new Error('motif vide dans la keep-list');
      }
    }
  }
  return value as Profile[];
}

export function createProfileStore(area: StorageArea): ProfileStore {
  async function read(): Promise<Profile[]> {
    const stored = await area.get(KEY);
    const value = stored[KEY];
    return value === undefined ? DEFAULT_PROFILES : validate(value);
  }

  async function write(profiles: Profile[]): Promise<void> {
    await area.set({ [KEY]: profiles });
  }

  return {
    list: read,

    async save(profile) {
      const profiles = await read();
      const index = profiles.findIndex((p) => p.id === profile.id);
      if (index === -1) profiles.push(profile);
      else profiles[index] = profile;
      await write(profiles);
    },

    async remove(id) {
      await write((await read()).filter((p) => p.id !== id));
    },

    async exportJson() {
      return JSON.stringify(await read(), null, 2);
    },

    async importJson(json) {
      await write(validate(JSON.parse(json)));
    },
  };
}
