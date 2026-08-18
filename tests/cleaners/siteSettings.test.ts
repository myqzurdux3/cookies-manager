import { describe, it, expect } from 'vitest';
import {
  createSiteSettingsCleaner,
  MANAGED_DEFAULTS,
  MANAGED_TYPES,
} from '../../src/cleaners/siteSettings';
import type { CategoryPlan } from '../../src/core/planner';

function fakeApi(settings: Record<string, string> = {}) {
  const events: string[] = [];
  const contentSettings: Record<string, unknown> = {};

  for (const type of MANAGED_TYPES) {
    contentSettings[type] = {
      async get(details: { primaryUrl: string }) {
        // chrome.contentSettings.get() ne rend jamais 'default' : il rend la
        // valeur effective, donc le défaut du navigateur quand rien n'est posé.
        return { setting: settings[`${type}:${details.primaryUrl}`] ?? MANAGED_DEFAULTS[type] };
      },
      async set(details: { primaryPattern: string; setting: string }) {
        events.push(`set ${type} ${details.primaryPattern} ${details.setting}`);
      },
      async clear() {
        events.push(`clear ${type}`);
      },
    };
  }

  return { events, api: { contentSettings } as never };
}

function plan(keepRules: CategoryPlan['keepRules']): CategoryPlan {
  return { category: 'siteSettings', since: 0, keepRules };
}

describe('createSiteSettingsCleaner', () => {
  it('annonce une finesse par origine', () => {
    expect(createSiteSettingsCleaner(fakeApi().api).perSite).toBe('origin');
  });

  it("efface chaque type géré quand rien n'est protégé", async () => {
    const { api, events } = fakeApi();
    await createSiteSettingsCleaner(api).clean(plan([]));
    expect(events).toEqual(MANAGED_TYPES.map((type) => `clear ${type}`));
  });

  it("restaure les réglages non par défaut d'un site protégé après effacement", async () => {
    const { api, events } = fakeApi({ 'notifications:https://github.com': 'allow' });
    await createSiteSettingsCleaner(api).clean(
      plan([{ pattern: 'github.com', keep: { siteSettings: true } }]),
    );
    expect(events.indexOf('clear notifications')).toBeLessThan(
      events.indexOf('set notifications https://github.com/* allow'),
    );
  });

  it('ne restaure pas un réglage resté par défaut', async () => {
    const { api, events } = fakeApi();
    await createSiteSettingsCleaner(api).clean(
      plan([{ pattern: 'github.com', keep: { siteSettings: true } }]),
    );
    expect(events.some((event) => event.startsWith('set '))).toBe(false);
  });

  it('restaure un réglage qui vaut le défaut voisin mais pas celui de son type', async () => {
    // 'block' est le défaut de popups, pas celui de notifications : pour
    // notifications c'est un choix explicite de l'utilisateur, à restaurer.
    const { api, events } = fakeApi({ 'notifications:https://github.com': 'block' });
    await createSiteSettingsCleaner(api).clean(
      plan([{ pattern: 'github.com', keep: { siteSettings: true } }]),
    );
    expect(events).toContain('set notifications https://github.com/* block');
    expect(events).not.toContain('set popups https://github.com/* block');
  });

  it("ne restaure pas les réglages d'une règle qui ne protège pas cette catégorie", async () => {
    const { api, events } = fakeApi({ 'notifications:https://github.com': 'allow' });
    await createSiteSettingsCleaner(api).clean(
      plan([{ pattern: 'github.com', keep: { cookies: true } }]),
    );
    expect(events.some((event) => event.startsWith('set '))).toBe(false);
  });

  it("avertit dans l'aperçu que les motifs à wildcard ne sont pas restaurables", async () => {
    const preview = await createSiteSettingsCleaner(fakeApi().api).preview(
      plan([{ pattern: '*.github.com', keep: { siteSettings: true } }]),
    );
    expect(preview.note).toMatch(/wildcard/i);
  });

  it("n'avertit pas pour un wildcard qui ne protège pas cette catégorie", async () => {
    const preview = await createSiteSettingsCleaner(fakeApi().api).preview(
      plan([{ pattern: '*.github.com', keep: { cookies: true } }]),
    );
    expect(preview.note).toBeUndefined();
  });

  it("compte les sites protégés restaurables dans l'aperçu", async () => {
    const preview = await createSiteSettingsCleaner(fakeApi().api).preview(
      plan([
        { pattern: 'github.com', keep: { siteSettings: true } },
        { pattern: 'example.com', keep: { siteSettings: true } },
      ]),
    );
    expect(preview.items).toBe(2);
  });
});
