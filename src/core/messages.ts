import type { Profile } from './types';

export type Message =
  | { type: 'LIST_PROFILES' }
  | { type: 'SAVE_PROFILE'; profile: Profile }
  | { type: 'DELETE_PROFILE'; id: string }
  | { type: 'PREVIEW'; profileId: string }
  | { type: 'CLEAN'; profileId: string }
  | { type: 'JOURNAL' }
  | { type: 'EXPORT' }
  | { type: 'IMPORT'; json: string };

export type Response = { ok: true; data: unknown } | { ok: false; error: string };

export async function send(message: Message): Promise<unknown> {
  const response = (await chrome.runtime.sendMessage(message)) as Response;
  if (!response.ok) throw new Error(response.error);
  return response.data;
}
