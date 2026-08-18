// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import popupHtml from '../../popup.html?raw';
import { mountBody, settle, stubChrome, text } from './dom';
import type { Reply } from './dom';

const PROFILE = {
  id: 'p1',
  name: 'Nettoyage léger',
  since: 'day',
  categories: ['cookies'],
  keepRules: [{ pattern: 'github.com', keep: { cookies: true } }],
};

async function mountPopup(reply: (type: string) => Reply) {
  mountBody(popupHtml);
  const chrome = stubChrome(reply);
  vi.resetModules();
  await import('../../src/ui/popup/popup');
  await settle();
  return chrome;
}

function ok(data: unknown): Reply {
  return { ok: true, data };
}

const HAPPY = (type: string): Reply => {
  if (type === 'GET_SETTINGS') return ok({ vaultEnabled: false, vaultRetentionDays: 7 });
  if (type === 'LIST_PROFILES') return ok([PROFILE]);
  if (type === 'PREVIEW')
    return ok([{ category: 'cookies', preview: { countable: true, items: 3 } }]);
  if (type === 'CLEAN')
    return ok([{ category: 'cookies', report: { status: 'ok', deleted: 3, kept: 1 } }]);
  return ok(null);
};

function clickProfile() {
  document.querySelector<HTMLButtonElement>('#profiles button')!.click();
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('popup', () => {
  it('liste les profils et affiche leur aperçu', async () => {
    await mountPopup(HAPPY);
    expect(text('#profiles')).toContain('Nettoyage léger');

    clickProfile();
    await settle();
    expect(document.querySelector<HTMLElement>('#preview')!.hidden).toBe(false);
    expect(text('#preview-list')).toContain('3 à supprimer');
  });

  it("affiche l'erreur du service worker au lieu de rester figée sur l'aperçu", async () => {
    await mountPopup((type) =>
      type === 'PREVIEW' ? { ok: false, error: 'aperçu impossible' } : HAPPY(type),
    );

    clickProfile();
    await settle();

    expect(text('#preview-list')).toContain('aperçu impossible');
    expect(document.querySelector<HTMLElement>('#preview')!.hidden).toBe(false);
  });

  it('réactive le bouton quand le nettoyage échoue, au lieu de le laisser mort', async () => {
    await mountPopup((type) =>
      type === 'CLEAN' ? { ok: false, error: 'moteur en panne' } : HAPPY(type),
    );

    clickProfile();
    await settle();
    const confirm = document.querySelector<HTMLButtonElement>('#confirm')!;
    confirm.click();
    await settle();

    expect(text('#preview-list')).toContain('moteur en panne');
    // Sans réactivation, la popup est inutilisable jusqu'à sa fermeture.
    expect(confirm.disabled).toBe(false);
  });

  it("n'envoie rien et le dit quand la phrase du coffre manque", async () => {
    const chrome = await mountPopup((type) =>
      type === 'GET_SETTINGS' ? ok({ vaultEnabled: true, vaultRetentionDays: 7 }) : HAPPY(type),
    );

    clickProfile();
    await settle();
    document.querySelector<HTMLButtonElement>('#confirm')!.click();
    await settle();

    expect(chrome.sent.some((message) => message.type === 'CLEAN')).toBe(false);
    expect(text('#preview-list')).toMatch(/phrase secrète requise/i);
  });

  it('annonce un refus de permission sans rien envoyer au moteur', async () => {
    const chrome = await mountPopup((type) =>
      type === 'LIST_PROFILES' ? ok([{ ...PROFILE, categories: ['history'] }]) : HAPPY(type),
    );
    chrome.denyPermissions();

    clickProfile();
    await settle();

    expect(chrome.permissionRequests).toEqual([{ permissions: ['history'] }]);
    expect(chrome.sent.some((message) => message.type === 'PREVIEW')).toBe(false);
    expect(text('#preview-list')).toMatch(/permissions refusées/i);
    expect(document.querySelector<HTMLButtonElement>('#confirm')!.disabled).toBe(true);
  });

  it('affiche le rapport, le total et les sites épargnés après un nettoyage', async () => {
    await mountPopup((type) =>
      type === 'CLEAN'
        ? ok([
            { category: 'cookies', report: { status: 'ok', deleted: 3, kept: 1 } },
            {
              category: 'httpCache',
              report: { status: 'ok', deleted: 0, kept: 0, countable: false },
            },
          ])
        : HAPPY(type),
    );

    clickProfile();
    await settle();
    document.querySelector<HTMLButtonElement>('#confirm')!.click();
    await settle();

    expect(document.querySelector<HTMLElement>('#report')!.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('#preview')!.hidden).toBe(true);
    expect(text('#report-summary')).toContain('3 éléments supprimés');
    // Une catégorie vidée en bloc ne doit pas se lire « 0 supprimé ».
    expect(text('#report-list')).toContain('vidé entièrement');
    expect(text('#report-summary')).toContain('catégorie vidée entièrement');
    expect(document.querySelector<HTMLElement>('#spared')!.hidden).toBe(false);
    expect(text('#spared-list')).toContain('github.com');
  });

  it('signale un échec partiel plutôt que de le fondre dans le total', async () => {
    await mountPopup((type) =>
      type === 'CLEAN'
        ? ok([
            {
              category: 'cookies',
              report: { status: 'partial', deleted: 2, kept: 0, error: 'cookie verrouillé' },
            },
          ])
        : HAPPY(type),
    );

    clickProfile();
    await settle();
    document.querySelector<HTMLButtonElement>('#confirm')!.click();
    await settle();

    expect(text('#report-list')).toContain('cookie verrouillé');
    expect(text('#report-summary')).toContain('catégorie en échec');
  });

  it('revient à la liste des profils depuis le rapport comme depuis l’aperçu', async () => {
    await mountPopup(HAPPY);

    clickProfile();
    await settle();
    document.querySelector<HTMLButtonElement>('#cancel')!.click();
    expect(document.querySelector<HTMLElement>('#chooser')!.hidden).toBe(false);

    clickProfile();
    await settle();
    document.querySelector<HTMLButtonElement>('#confirm')!.click();
    await settle();
    document.querySelector<HTMLButtonElement>('#done')!.click();
    expect(document.querySelector<HTMLElement>('#chooser')!.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('#report')!.hidden).toBe(true);
  });

  it('verrouille le bouton derrière la case rouge pour un profil dangereux', async () => {
    await mountPopup((type) =>
      type === 'LIST_PROFILES' ? ok([{ ...PROFILE, categories: ['passwords'] }]) : HAPPY(type),
    );

    clickProfile();
    await settle();
    const confirm = document.querySelector<HTMLButtonElement>('#confirm')!;
    expect(document.querySelector<HTMLElement>('#danger')!.hidden).toBe(false);
    expect(confirm.disabled).toBe(true);

    const check = document.querySelector<HTMLInputElement>('#danger-check')!;
    check.checked = true;
    check.dispatchEvent(new Event('change'));
    expect(confirm.disabled).toBe(false);
  });
});
