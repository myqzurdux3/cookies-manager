// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import optionsHtml from '../../options.html?raw';
import { mountBody, settle, stubChrome, text } from './dom';
import type { Reply } from './dom';

const PROFILE = {
  id: 'p1',
  name: 'Nettoyage léger',
  since: 'day',
  categories: ['cookies'],
  keepRules: [{ pattern: 'github.com', keep: { cookies: true } }],
};

function ok(data: unknown): Reply {
  return { ok: true, data };
}

const HAPPY = (type: string): Reply => {
  if (type === 'LIST_PROFILES') return ok([PROFILE]);
  if (type === 'GET_SETTINGS') return ok({ vaultEnabled: false, vaultRetentionDays: 7 });
  if (type === 'VAULT_DESCRIBE') return ok(null);
  if (type === 'EXPORT') return ok('[]');
  return ok(null);
};

async function mountOptions(reply: (type: string) => Reply) {
  mountBody(optionsHtml);
  const chrome = stubChrome(reply);
  vi.resetModules();
  await import('../../src/ui/options/options');
  await settle();
  return chrome;
}

function click(selector: string) {
  document.querySelector<HTMLButtonElement>(selector)!.click();
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('page d’options', () => {
  it('charge les profils et la keep-list', async () => {
    await mountOptions(HAPPY);
    expect(document.querySelector<HTMLInputElement>('#name')!.value).toBe('Nettoyage léger');
    expect(text('#keeplist')).toContain('github.com');
  });

  it('demande une confirmation avant de supprimer le coffre', async () => {
    const chrome = await mountOptions(HAPPY);

    click('#vault-clear');
    await settle();
    // La suppression du coffre est irréversible : un seul clic ne suffit pas.
    expect(chrome.sent.some((message) => message.type === 'VAULT_CLEAR')).toBe(false);
    expect(text('#status')).toMatch(/confirmer/i);

    click('#vault-clear');
    await settle();
    expect(chrome.sent.some((message) => message.type === 'VAULT_CLEAR')).toBe(true);
  });

  it('désarme la confirmation dès que le coffre est supprimé', async () => {
    const chrome = await mountOptions(HAPPY);
    click('#vault-clear');
    await settle();
    click('#vault-clear');
    await settle();

    click('#vault-clear');
    await settle();
    const clears = chrome.sent.filter((message) => message.type === 'VAULT_CLEAR');
    expect(clears).toHaveLength(1);
  });

  it("affiche l'échec d'un export au lieu de le perdre", async () => {
    await mountOptions((type) =>
      type === 'EXPORT' ? { ok: false, error: 'export refusé' } : HAPPY(type),
    );
    click('#export');
    await settle();
    expect(text('#status')).toContain('export refusé');
  });

  it("affiche l'échec d'une suppression de profil", async () => {
    await mountOptions((type) =>
      type === 'DELETE_PROFILE' ? { ok: false, error: 'profil verrouillé' } : HAPPY(type),
    );
    click('#delete-profile');
    await settle();
    expect(text('#status')).toContain('profil verrouillé');
  });

  it('annonce un service worker injoignable au chargement', async () => {
    await mountOptions((type) =>
      type === 'LIST_PROFILES' ? { ok: false, error: 'worker endormi' } : HAPPY(type),
    );
    expect(text('#status')).toContain('worker endormi');
  });

  it("affiche l'échec d'une suppression de coffre confirmée", async () => {
    await mountOptions((type) =>
      type === 'VAULT_CLEAR' ? { ok: false, error: 'coffre verrouillé' } : HAPPY(type),
    );
    click('#vault-clear');
    await settle();
    click('#vault-clear');
    await settle();
    expect(text('#status')).toContain('coffre verrouillé');
  });

  it('normalise un motif à la saisie et le dit', async () => {
    await mountOptions(HAPPY);
    const champ = document.querySelector<HTMLInputElement>('#new-pattern')!;
    champ.value = '*google.com';
    click('#add-pattern');
    await settle();

    expect(text('#keeplist')).toContain('*.google.com');
    expect(text('#status')).toContain('*.google.com');
    expect(champ.value).toBe('');
  });

  it('refuse un motif impossible à corriger, avec sa raison', async () => {
    await mountOptions(HAPPY);
    document.querySelector<HTMLInputElement>('#new-pattern')!.value = 'git*hub.com';
    click('#add-pattern');
    await settle();

    expect(text('#status')).toMatch(/wildcard/i);
    expect(text('#keeplist')).not.toContain('git*hub.com');
  });

  it('refuse un doublon plutôt que d’empiler deux fois le même site', async () => {
    await mountOptions(HAPPY);
    document.querySelector<HTMLInputElement>('#new-pattern')!.value = 'github.com';
    click('#add-pattern');
    await settle();
    document.querySelector<HTMLInputElement>('#new-pattern')!.value = 'github.com';
    click('#add-pattern');
    await settle();

    expect(text('#status')).toMatch(/déjà dans la liste/i);
    const lignes = Array.from(
      document.querySelectorAll<HTMLTableRowElement>('#keeplist tr'),
    ).filter((tr) => tr.textContent?.startsWith('github.com') === true);
    expect(lignes).toHaveLength(1);
  });

  it('enregistre le profil courant et signale un refus', async () => {
    const chrome = await mountOptions(HAPPY);
    document.querySelector<HTMLInputElement>('#name')!.value = 'Renommé';
    document
      .querySelector<HTMLFormElement>('#editor')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    const envoye = chrome.sent.find((m) => m.type === 'SAVE_PROFILE') as
      { profile: { name: string } } | undefined;
    expect(envoye?.profile.name).toBe('Renommé');
    expect(text('#status')).toContain('enregistré');
  });

  it('affiche le refus du moteur quand un profil est invalide', async () => {
    await mountOptions((type) =>
      type === 'SAVE_PROFILE' ? { ok: false, error: 'motif refusé' } : HAPPY(type),
    );
    document
      .querySelector<HTMLFormElement>('#editor')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(text('#status')).toContain('motif refusé');
  });

  it('refuse une restauration sans phrase, puis en transmet une', async () => {
    const chrome = await mountOptions(HAPPY);
    click('#vault-restore');
    await settle();
    expect(chrome.sent.some((m) => m.type === 'VAULT_RESTORE')).toBe(false);
    expect(text('#status')).toMatch(/phrase secrète requise/i);

    const champ = document.querySelector<HTMLInputElement>('#vault-passphrase')!;
    champ.value = 'ma phrase';
    click('#vault-restore');
    await settle();
    expect(chrome.sent.some((m) => m.type === 'VAULT_RESTORE')).toBe(true);
    // La phrase ne doit pas rester dans le champ après l'appel.
    expect(champ.value).toBe('');
  });

  it('enregistre les réglages du coffre et rapporte un refus', async () => {
    const chrome = await mountOptions((type) =>
      type === 'SAVE_SETTINGS' ? { ok: false, error: 'rétention invalide' } : HAPPY(type),
    );
    document.querySelector<HTMLInputElement>('#vault-retention')!.value = '0';
    click('#save-settings');
    await settle();
    expect(chrome.sent.some((m) => m.type === 'SAVE_SETTINGS')).toBe(true);
    expect(text('#status')).toContain('rétention invalide');
  });

  it('importe un JSON et signale un import refusé', async () => {
    await mountOptions((type) =>
      type === 'IMPORT' ? { ok: false, error: 'format de profils invalide' } : HAPPY(type),
    );
    document.querySelector<HTMLTextAreaElement>('#import-area')!.value = 'pas du json';
    click('#import');
    await settle();
    expect(text('#status')).toContain('format de profils invalide');
  });

  it('exporte les profils dans la zone de texte', async () => {
    await mountOptions((type) => (type === 'EXPORT' ? ok('[{"id":"p1"}]') : HAPPY(type)));
    click('#export');
    await settle();
    expect(document.querySelector<HTMLTextAreaElement>('#import-area')!.value).toBe(
      '[{"id":"p1"}]',
    );
  });
});
