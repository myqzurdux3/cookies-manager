import type { StorageArea } from './profiles';
import { DEFAULT_RETENTION_DAYS } from './vault';

const KEY = 'settings';

export const MAX_RETENTION_DAYS = 90;

export type Settings = {
  vaultEnabled: boolean;
  vaultRetentionDays: number;
};

export const DEFAULT_SETTINGS: Settings = {
  vaultEnabled: false,
  vaultRetentionDays: DEFAULT_RETENTION_DAYS,
};

export interface SettingsStore {
  get(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
}

function validate(settings: Settings): void {
  const days = settings.vaultRetentionDays;
  if (!Number.isInteger(days) || days < 1 || days > MAX_RETENTION_DAYS) {
    throw new Error(`rétention invalide : attendu un entier de 1 à ${MAX_RETENTION_DAYS} jours`);
  }
}

export function createSettingsStore(area: StorageArea): SettingsStore {
  return {
    async get(): Promise<Settings> {
      const stored = await area.get(KEY);
      const value = stored[KEY];
      if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS };

      const partial = value as Partial<Settings>;
      return {
        vaultEnabled:
          typeof partial.vaultEnabled === 'boolean'
            ? partial.vaultEnabled
            : DEFAULT_SETTINGS.vaultEnabled,
        vaultRetentionDays:
          typeof partial.vaultRetentionDays === 'number'
            ? partial.vaultRetentionDays
            : DEFAULT_SETTINGS.vaultRetentionDays,
      };
    },

    async save(settings: Settings): Promise<void> {
      validate(settings);
      await area.set({ [KEY]: settings });
    },
  };
}
