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

function isValidRetention(days: unknown): days is number {
  return typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= MAX_RETENTION_DAYS;
}

function validate(settings: Settings): void {
  if (!isValidRetention(settings.vaultRetentionDays)) {
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
        // `save` valide déjà, mais un stockage abîmé ou édité à la main peut
        // contenir n'importe quoi. Une rétention NaN rendrait la comparaison de
        // `purgeExpired` toujours fausse : le coffre ne serait jamais purgé.
        vaultRetentionDays: isValidRetention(partial.vaultRetentionDays)
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
