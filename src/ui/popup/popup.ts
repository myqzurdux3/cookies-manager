import type { CategoryResult, PreviewResult } from '../../core/engine';
import { send } from '../../core/messages';
import type { Settings } from '../../core/settings';
import type { Category, Profile } from '../../core/types';
import type { Row } from '../labels';
import { needsExtraConfirmation, previewRow, profileMeta, reportRow } from '../labels';

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

let selected: Profile | null = null;
let settings: Settings = { vaultEnabled: false, vaultRetentionDays: 7 };

async function ensurePermissions(profile: Profile): Promise<boolean> {
  const needed = profile.categories
    .map((category) => OPTIONAL[category])
    .filter((permission): permission is chrome.runtime.ManifestPermissions => permission !== undefined);
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

async function showPreview(profile: Profile): Promise<void> {
  selected = profile;
  reportEl.hidden = true;

  if (!(await ensurePermissions(profile))) {
    renderMessage(previewList, "Permissions refusées : ce profil ne peut pas s'exécuter.");
    previewEl.hidden = false;
    confirmBtn.disabled = true;
    return;
  }

  const results = (await send({ type: 'PREVIEW', profileId: profile.id })) as PreviewResult[];
  renderRows(previewList, results.map(previewRow));

  const risky = needsExtraConfirmation(profile.categories);
  dangerEl.hidden = !risky;
  dangerCheck.checked = false;
  confirmBtn.disabled = risky;
  vaultEl.hidden = !(settings.vaultEnabled && profile.categories.includes('cookies'));
  passphraseInput.value = '';
  chooserEl.hidden = true;
  previewEl.hidden = false;
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

confirmBtn.addEventListener('click', async () => {
  if (selected === null) return;

  const needsPassphrase = !vaultEl.hidden;
  if (needsPassphrase && passphraseInput.value === '') {
    renderMessage(previewList, "Phrase secrète requise : le coffre est actif, rien n'a été supprimé.");
    return;
  }

  confirmBtn.disabled = true;
  const results = (await send({
    type: 'CLEAN',
    profileId: selected.id,
    passphrase: needsPassphrase ? passphraseInput.value : undefined,
  })) as CategoryResult[];
  passphraseInput.value = '';
  previewEl.hidden = true;
  chooserEl.hidden = false;
  renderRows(reportList, results.map(reportRow));
  reportEl.hidden = false;
});

async function init(): Promise<void> {
  settings = (await send({ type: 'GET_SETTINGS' })) as Settings;
  const profiles = (await send({ type: 'LIST_PROFILES' })) as Profile[];

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
