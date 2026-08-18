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
});
