import type { CategoryResult, PreviewResult } from '../../core/engine';
import { send } from '../../core/messages';
import type { Settings } from '../../core/settings';
import type { Category, Profile } from '../../core/types';
import type { VaultSummary } from '../../core/vault';
import type { Row } from '../labels';
import {
  formatRunSummary,
  formatVaultReplacement,
  needsExtraConfirmation,
  previewRow,
  profileMeta,
  protectedSites,
  reportRow,
  runSummary,
} from '../labels';

const OPTIONAL: Partial<Record<Category, chrome.runtime.ManifestPermissions>> = {
  history: 'history',
  downloads: 'downloads',
  siteSettings: 'contentSettings',
};

const profilesEl = document.querySelector<HTMLUListElement>('#profiles')!;
const chooserEl = document.querySelector<HTMLElement>('#chooser')!;
const previewEl = document.querySelector<HTMLElement>('#preview')!;
const previewList = document.querySelector<HTMLUListElement>('#preview-list')!;
const reportEl = document.querySelector<HTMLElement>('#report')!;
const reportList = document.querySelector<HTMLUListElement>('#report-list')!;
const dangerEl = document.querySelector<HTMLLabelElement>('#danger')!;
const dangerCheck = document.querySelector<HTMLInputElement>('#danger-check')!;
const confirmBtn = document.querySelector<HTMLButtonElement>('#confirm')!;
const cancelBtn = document.querySelector<HTMLButtonElement>('#cancel')!;
const vaultEl = document.querySelector<HTMLLabelElement>('#vault')!;
const passphraseInput = document.querySelector<HTMLInputElement>('#passphrase')!;
const vaultExistingEl = document.querySelector<HTMLElement>('#vault-existing')!;
const summaryEl = document.querySelector<HTMLParagraphElement>('#report-summary')!;
const sparedEl = document.querySelector<HTMLElement>('#spared')!;
const sparedList = document.querySelector<HTMLUListElement>('#spared-list')!;
const doneBtn = document.querySelector<HTMLButtonElement>('#done')!;

let selected: Profile | null = null;
let settings: Settings = { vaultEnabled: false, vaultRetentionDays: 7 };

async function ensurePermissions(profile: Profile): Promise<boolean> {
  const needed = profile.categories
    .map((category) => OPTIONAL[category])
    .filter(
      (permission): permission is chrome.runtime.ManifestPermissions => permission !== undefined,
    );
  if (needed.length === 0) return true;
  return chrome.permissions.request({ permissions: needed });
}

function renderRows(list: HTMLUListElement, rows: Row[]): void {
  list.replaceChildren(
    ...rows.map((row) => {
      const li = document.createElement('li');

      const label = document.createElement('span');
      label.className = 'row-label';
      label.textContent = row.label;

      const value = document.createElement('span');
      value.className = `row-value${row.tone === undefined ? '' : ` ${row.tone}`}`;
      value.textContent = row.value;

      li.append(label, value);

      if (row.note !== undefined) {
        const note = document.createElement('span');
        note.className = 'row-note';
        note.textContent = row.note;
        li.append(note);
      }

      return li;
    }),
  );
}

function renderMessage(list: HTMLUListElement, message: string): void {
  renderRows(list, [{ label: message, value: '', tone: 'failed' }]);
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function showPreview(profile: Profile): Promise<void> {
  selected = profile;
  reportEl.hidden = true;

  if (!(await ensurePermissions(profile))) {
    renderMessage(previewList, "Permissions refusées : ce profil ne peut pas s'exécuter.");
    previewEl.hidden = false;
    confirmBtn.disabled = true;
    return;
  }

  let results: PreviewResult[];
  try {
    results = (await send({ type: 'PREVIEW', profileId: profile.id })) as PreviewResult[];
  } catch (cause) {
    // Sans ce filet, l'échec restait un rejet non capturé : la popup gardait
    // l'écran précédent et l'utilisateur n'apprenait jamais ce qui s'est passé.
    renderMessage(previewList, `Aperçu impossible : ${reason(cause)}`);
    chooserEl.hidden = true;
    previewEl.hidden = false;
    confirmBtn.disabled = true;
    return;
  }
  renderRows(previewList, results.map(previewRow));

  const risky = needsExtraConfirmation(profile.categories);
  dangerEl.hidden = !risky;
  dangerCheck.checked = false;
  confirmBtn.disabled = risky;
  vaultEl.hidden = !(settings.vaultEnabled && profile.categories.includes('cookies'));
  passphraseInput.value = '';
  await annoncerRemplacementDuCoffre();
  chooserEl.hidden = true;
  previewEl.hidden = false;
}

/**
 * Le coffre n'a qu'un seul emplacement : nettoyer une seconde fois détruit la
 * sauvegarde précédente. Sans cet avertissement, on ne s'en aperçoit qu'au
 * moment d'en avoir besoin — c'est-à-dire trop tard.
 *
 * Un échec ici ne doit pas empêcher le nettoyage : on se tait plutôt que de
 * bloquer sur une information secondaire.
 */
async function annoncerRemplacementDuCoffre(): Promise<void> {
  vaultExistingEl.hidden = true;
  if (vaultEl.hidden) return;

  try {
    const summary = (await send({ type: 'VAULT_DESCRIBE' })) as VaultSummary | null;
    const message = formatVaultReplacement(summary, (at) =>
      new Date(at).toLocaleDateString('fr-FR'),
    );
    if (message === null) return;
    vaultExistingEl.textContent = message;
    vaultExistingEl.hidden = false;
  } catch {
    // Sans réponse, on n'affirme rien.
  }
}

function backToChooser(): void {
  previewEl.hidden = true;
  chooserEl.hidden = false;
  selected = null;
}

dangerCheck.addEventListener('change', () => {
  confirmBtn.disabled = !dangerCheck.checked;
});

cancelBtn.addEventListener('click', backToChooser);

confirmBtn.addEventListener('click', () => {
  void runClean();
});

/**
 * Un gestionnaire `async` passé à `addEventListener` rend une promesse que
 * personne n'attend : un rejet deviendrait une erreur non capturée, invisible.
 */
async function runClean(): Promise<void> {
  if (selected === null) return;

  const needsPassphrase = !vaultEl.hidden;
  if (needsPassphrase && passphraseInput.value === '') {
    renderMessage(
      previewList,
      "Phrase secrète requise : le coffre est actif, rien n'a été supprimé.",
    );
    return;
  }

  const profile = selected;
  confirmBtn.disabled = true;

  let results: CategoryResult[];
  try {
    results = (await send({
      type: 'CLEAN',
      profileId: profile.id,
      passphrase: needsPassphrase ? passphraseInput.value : undefined,
    })) as CategoryResult[];
  } catch (cause) {
    // Le bouton vient d'être désactivé : sans réactivation, la popup est morte
    // jusqu'à sa fermeture, sans que rien n'explique pourquoi.
    renderMessage(previewList, `Nettoyage impossible : ${reason(cause)}`);
    confirmBtn.disabled = false;
    return;
  }

  passphraseInput.value = '';
  previewEl.hidden = true;

  summaryEl.textContent = formatRunSummary(runSummary(results));
  renderRows(reportList, results.map(reportRow));

  const spared = protectedSites(profile);
  sparedEl.hidden = spared.length === 0;
  sparedList.replaceChildren(
    ...spared.map((pattern) => {
      const li = document.createElement('li');
      li.textContent = pattern;
      return li;
    }),
  );

  reportEl.hidden = false;
}

doneBtn.addEventListener('click', () => {
  reportEl.hidden = true;
  chooserEl.hidden = false;
  selected = null;
});

async function init(): Promise<void> {
  let profiles: Profile[];
  try {
    settings = (await send({ type: 'GET_SETTINGS' })) as Settings;
    profiles = (await send({ type: 'LIST_PROFILES' })) as Profile[];
  } catch (cause) {
    renderMessage(previewList, `Service worker injoignable : ${reason(cause)}`);
    chooserEl.hidden = true;
    previewEl.hidden = false;
    confirmBtn.disabled = true;
    return;
  }

  profilesEl.replaceChildren(
    ...profiles.map((profile) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';

      const name = document.createElement('span');
      name.className = 'profile-name';
      name.textContent = profile.name;

      const meta = document.createElement('span');
      meta.className = 'profile-meta';
      meta.textContent = profileMeta(profile);

      button.append(name, meta);
      button.addEventListener('click', () => void showPreview(profile));
      li.append(button);
      return li;
    }),
  );
}

void init();
