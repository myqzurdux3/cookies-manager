import { createEngine } from './core/engine';
import type { Message, Response } from './core/messages';
import { buildPlan } from './core/planner';
import { createProfileStore } from './core/profiles';
import { buildCleaners, collectKnownHosts } from './cleaners/index';
import type { ChromeLike } from './cleaners/index';

const api = chrome as unknown as ChromeLike;
const store = createProfileStore(chrome.storage.local);
const engine = createEngine(
  buildCleaners(api, () => collectKnownHosts(api)),
  chrome.storage.local,
);

async function profileById(id: string) {
  const profile = (await store.list()).find((candidate) => candidate.id === id);
  if (profile === undefined) throw new Error(`profil introuvable : ${id}`);
  return profile;
}

async function handle(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'LIST_PROFILES':
      return store.list();
    case 'SAVE_PROFILE':
      return store.save(message.profile);
    case 'DELETE_PROFILE':
      return store.remove(message.id);
    case 'PREVIEW':
      return engine.preview(buildPlan(await profileById(message.profileId), Date.now()));
    case 'CLEAN': {
      const now = Date.now();
      return engine.clean(buildPlan(await profileById(message.profileId), now), now);
    }
    case 'JOURNAL':
      return engine.journal();
    case 'EXPORT':
      return store.exportJson();
    case 'IMPORT':
      return store.importJson(message.json);
  }
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handle(message)
    .then((data) => sendResponse({ ok: true, data } satisfies Response))
    .catch((cause: unknown) =>
      sendResponse({
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause),
      } satisfies Response),
    );
  return true;
});
