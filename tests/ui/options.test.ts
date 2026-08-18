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
  if (type === 'GET_SETTINGS')
    return ok({ vaultEnabled: false, vaultRetentionDays: 7, language: 'auto' });
  if (type === 'VAULT_DESCRIBE') return ok(null);
  if (type === 'EXPORT') return ok('[]');
  return ok(null);
};

async function mountOptions(reply: (type: string) => Reply, uiLanguage = 'fr-FR') {
  mountBody(optionsHtml);
  const chrome = stubChrome(reply, uiLanguage);
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

  it('coche et décoche une catégorie du profil courant', async () => {
    const chrome = await mountOptions(HAPPY);
    const cases = Array.from(document.querySelectorAll<HTMLInputElement>('#categories input'));
    const historique = cases[6]!; // ordre de ALL_CATEGORIES

    historique.checked = true;
    historique.dispatchEvent(new Event('change'));
    document
      .querySelector<HTMLFormElement>('#editor')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    const envoye = chrome.sent.find((m) => m.type === 'SAVE_PROFILE') as
      { profile: { categories: string[] } } | undefined;
    expect(envoye?.profile.categories).toContain('history');

    historique.checked = false;
    historique.dispatchEvent(new Event('change'));
    document
      .querySelector<HTMLFormElement>('#editor')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    const dernier = chrome.sent.filter((m) => m.type === 'SAVE_PROFILE').at(-1) as unknown as {
      profile: { categories: string[] };
    };
    expect(dernier.profile.categories).not.toContain('history');
  });

  it('annonce une keep-list vide au lieu de laisser un tableau nu', async () => {
    await mountOptions((type) =>
      type === 'LIST_PROFILES' ? ok([{ ...PROFILE, keepRules: [] }]) : HAPPY(type),
    );
    expect(text('#keeplist')).toMatch(/aucun site conservé/i);
  });

  it('bascule une colonne de la grille et retire un site', async () => {
    const chrome = await mountOptions(HAPPY);

    // La colonne « Stockage » couvre quatre catégories d'un coup.
    const lignes = Array.from(document.querySelectorAll<HTMLTableRowElement>('#keeplist tr'));
    const ligne = lignes.find((tr) => tr.textContent?.startsWith('github.com'))!;
    const stockage = Array.from(ligne.querySelectorAll<HTMLInputElement>('input'))[1]!;
    stockage.checked = true;
    stockage.dispatchEvent(new Event('change'));
    await settle();

    document
      .querySelector<HTMLFormElement>('#editor')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    const envoye = chrome.sent.find((m) => m.type === 'SAVE_PROFILE') as unknown as {
      profile: { keepRules: { pattern: string; keep: Record<string, true> }[] };
    };
    const regle = envoye.profile.keepRules.find((r) => r.pattern === 'github.com')!;
    expect(Object.keys(regle.keep).sort()).toEqual([
      'cacheStorage',
      'cookies',
      'indexedDB',
      'localStorage',
      'serviceWorkers',
    ]);

    document.querySelector<HTMLButtonElement>('#keeplist .remove')!.click();
    await settle();
    expect(text('#keeplist')).not.toContain('github.com');
    expect(text('#status')).toMatch(/retiré/i);
  });

  it('crée un profil neuf et change de profil sélectionné', async () => {
    await mountOptions((type) =>
      type === 'LIST_PROFILES'
        ? ok([PROFILE, { ...PROFILE, id: 'p2', name: 'Second' }])
        : HAPPY(type),
    );

    const select = document.querySelector<HTMLSelectElement>('#profile-select')!;
    select.value = 'p2';
    select.dispatchEvent(new Event('change'));
    expect(document.querySelector<HTMLInputElement>('#name')!.value).toBe('Second');

    click('#new-profile');
    expect(document.querySelector<HTMLInputElement>('#name')!.value).toBe('Nouveau profil');
    expect(text('#keeplist')).toMatch(/aucun site conservé/i);
  });

  it('confirme la suppression d’un profil et recharge la liste', async () => {
    const chrome = await mountOptions(HAPPY);
    click('#delete-profile');
    await settle();
    expect(chrome.sent.some((m) => m.type === 'DELETE_PROFILE')).toBe(true);
    expect(text('#status')).toMatch(/profil supprimé/i);
  });

  it('confirme un import et un enregistrement de réglages réussis', async () => {
    const chrome = await mountOptions(HAPPY);

    document.querySelector<HTMLTextAreaElement>('#import-area')!.value = '[]';
    click('#import');
    await settle();
    expect(text('#status')).toMatch(/profils importés/i);

    document.querySelector<HTMLInputElement>('#vault-retention')!.value = '30';
    click('#save-settings');
    await settle();
    const reglages = chrome.sent.find((m) => m.type === 'SAVE_SETTINGS') as unknown as {
      settings: { vaultRetentionDays: number };
    };
    expect(reglages.settings.vaultRetentionDays).toBe(30);
    expect(text('#status')).toMatch(/réglages enregistrés/i);
  });

  it('annonce des réglages illisibles au chargement', async () => {
    await mountOptions((type) =>
      type === 'GET_SETTINGS' ? { ok: false, error: 'réglages abîmés' } : HAPPY(type),
    );
    expect(text('#status')).toContain('réglages abîmés');
  });

  it('confirme un motif ajouté sans correction', async () => {
    await mountOptions(HAPPY);
    document.querySelector<HTMLInputElement>('#new-pattern')!.value = 'exemple.test';
    click('#add-pattern');
    await settle();
    expect(text('#status')).toMatch(/exemple\.test ajouté/i);
  });

  it('marque une colonne conservée en partie comme indéterminée', async () => {
    // Seuls deux des quatre stockages sont conservés : ni tout, ni rien.
    await mountOptions((type) =>
      type === 'LIST_PROFILES'
        ? ok([
            {
              ...PROFILE,
              keepRules: [{ pattern: 'github.com', keep: { localStorage: true, indexedDB: true } }],
            },
          ])
        : HAPPY(type),
    );

    const ligne = Array.from(document.querySelectorAll<HTMLTableRowElement>('#keeplist tr')).find(
      (tr) => tr.textContent?.startsWith('github.com'),
    )!;
    const stockage = Array.from(ligne.querySelectorAll<HTMLInputElement>('input'))[1]!;
    expect(stockage.indeterminate).toBe(true);
    expect(stockage.checked).toBe(false);
    expect(stockage.title).toMatch(/conservé en partie/i);
  });
});

describe('langue de la page d’options', () => {
  it('suit le navigateur quand la préférence est « automatique »', async () => {
    await mountOptions(HAPPY, 'en-GB');

    expect(document.documentElement.lang).toBe('en');
    expect(text('#unfilterable')).toContain('Ignore the keep-list');
    expect(text('#categories')).toContain('Local storage');
    expect(text('#keeplist')).toContain('Site kept');
    expect(document.querySelector<HTMLSelectElement>('#language')!.value).toBe('auto');
  });

  it('laisse une préférence explicite l’emporter sur le navigateur', async () => {
    await mountOptions(
      (type) =>
        type === 'GET_SETTINGS'
          ? ok({ vaultEnabled: false, vaultRetentionDays: 7, language: 'en' })
          : HAPPY(type),
      'fr-FR',
    );

    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector<HTMLSelectElement>('#language')!.value).toBe('en');
  });

  it('bascule la page entière et enregistre le choix', async () => {
    const chrome = await mountOptions(HAPPY);
    expect(text('#unfilterable')).toContain('Ignorent la keep-list');

    const language = document.querySelector<HTMLSelectElement>('#language')!;
    language.value = 'en';
    language.dispatchEvent(new Event('change'));
    await settle();

    // Le balisage figé et les fragments construits en JavaScript doivent basculer
    // ensemble : traduire l'un sans l'autre donnerait une page à moitié anglaise.
    expect(document.querySelector('#add-pattern')!.textContent).toBe('Add a site');
    expect(text('#unfilterable')).toContain('Ignore the keep-list');
    expect(text('#categories')).toContain('Form data');

    const saved = chrome.sent.find((message) => message.type === 'SAVE_SETTINGS');
    expect(saved).toMatchObject({
      settings: { language: 'en', vaultEnabled: false, vaultRetentionDays: 7 },
    });
  });

  it('annonce un refus d’enregistrement sans revenir en arrière', async () => {
    // La langue est appliquée avant d'être enregistrée : un refus doit se dire,
    // dans la langue choisie, sans rendre la page illisible.
    await mountOptions((type) =>
      type === 'SAVE_SETTINGS' ? { ok: false, error: 'stockage plein' } : HAPPY(type),
    );

    const language = document.querySelector<HTMLSelectElement>('#language')!;
    language.value = 'en';
    language.dispatchEvent(new Event('change'));
    await settle();

    expect(text('#status')).toBe('Settings refused: stockage plein');
    expect(document.querySelector('#add-pattern')!.textContent).toBe('Add a site');
  });

  it('date le coffre selon la langue active', async () => {
    // `toLocaleString` reçoit la locale du dictionnaire : sans cela, un coffre
    // s'afficherait daté à la française au milieu d'une page anglaise.
    await mountOptions(
      (type) =>
        type === 'VAULT_DESCRIBE'
          ? ok({ createdAt: Date.UTC(2026, 0, 31, 12), cookieCount: 2, domains: ['a.test'] })
          : HAPPY(type),
      'en-US',
    );

    expect(text('#vault-state')).toContain('Vault from');
    expect(text('#vault-state')).toContain('1/31/2026');
  });

  it('désarme la suppression du coffre en changeant de langue', async () => {
    // Le bouton armé porte une clé de traduction : le réécrire sans désarmer
    // laisserait un bouton d'apparence neutre à un clic de l'effacement.
    const chrome = await mountOptions(HAPPY);
    click('#vault-clear');
    await settle();
    expect(text('#vault-clear')).toBe('Confirmer la suppression');

    const language = document.querySelector<HTMLSelectElement>('#language')!;
    language.value = 'en';
    language.dispatchEvent(new Event('change'));
    await settle();

    expect(text('#vault-clear')).toBe('Delete the vault');

    // Ce clic doit réarmer, pas effacer.
    click('#vault-clear');
    await settle();
    expect(chrome.sent.filter((message) => message.type === 'VAULT_CLEAR')).toHaveLength(0);
    expect(text('#vault-clear')).toBe('Confirm deletion');
  });
});
