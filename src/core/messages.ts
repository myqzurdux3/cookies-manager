import type { Settings } from './settings';
import type { Profile } from './types';

export type Message =
  | { type: 'LIST_PROFILES' }
  | { type: 'SAVE_PROFILE'; profile: Profile }
  | { type: 'DELETE_PROFILE'; id: string }
  | { type: 'PREVIEW'; profileId: string }
  | { type: 'CLEAN'; profileId: string; passphrase?: string }
  | { type: 'JOURNAL' }
  | { type: 'EXPORT' }
  | { type: 'IMPORT'; json: string }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: Settings }
  | { type: 'VAULT_DESCRIBE' }
  | { type: 'VAULT_RESTORE'; passphrase: string }
  | { type: 'VAULT_CLEAR' };

export type Response = { ok: true; data: unknown } | { ok: false; error: string };

export async function send(message: Message): Promise<unknown> {
  const response: Response = await chrome.runtime.sendMessage(message);
  if (!response.ok) throw new Error(response.error);
  return response.data;
}
