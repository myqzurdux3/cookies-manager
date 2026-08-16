import type { CategoryResult, PreviewResult } from '../../core/engine';
import { send } from '../../core/messages';
import type { Category, Profile } from '../../core/types';
import { formatPreview, formatReport, needsExtraConfirmation } from '../labels';

const OPTIONAL: Partial<Record<Category, chrome.runtime.ManifestPermissions>> = {
  history: 'history',
  downloads: 'downloads',
  siteSettings: 'contentSettings',
};

const profilesEl = document.querySelector<HTMLUListElement>('#profiles')!;
const previewEl = document.querySelector<HTMLElement>('#preview')!;
const previewList = document.querySelector<HTMLUListElement>('#preview-list')!;
const reportEl = document.querySelector<HTMLElement>('#report')!;
const reportList = document.querySelector<HTMLUListElement>('#report-list')!;
const dangerEl = document.querySelector<HTMLLabelElement>('#danger')!;
const dangerCheck = document.querySelector<HTMLInputElement>('#danger-check')!;
const confirmBtn = document.querySelector<HTMLButtonElement>('#confirm')!;
const cancelBtn = document.querySelector<HTMLButtonElement>('#cancel')!;

let selected: Profile | null = null;

async function ensurePermissions(profile: Profile): Promise<boolean> {
  const needed = profile.categories
    .map((category) => OPTIONAL[category])
    .filter((permission): permission is chrome.runtime.ManifestPermissions => permission !== undefined);
  if (needed.length === 0) return true;
  return chrome.permissions.request({ permissions: needed });
}

function render(list: HTMLUListElement, lines: string[]): void {
  list.replaceChildren(
    ...lines.map((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      return li;
    }),
  );
}

async function showPreview(profile: Profile): Promise<void> {
  selected = profile;
  reportEl.hidden = true;

  if (!(await ensurePermissions(profile))) {
    render(previewList, ["Permissions refusées : ce profil ne peut pas s'exécuter."]);
    previewEl.hidden = false;
    confirmBtn.disabled = true;
    return;
  }

  const results = (await send({ type: 'PREVIEW', profileId: profile.id })) as PreviewResult[];
  render(previewList, results.map(formatPreview));

  const risky = needsExtraConfirmation(profile.categories);
  dangerEl.hidden = !risky;
  dangerCheck.checked = false;
  confirmBtn.disabled = risky;
  previewEl.hidden = false;
}

dangerCheck.addEventListener('change', () => {
  confirmBtn.disabled = !dangerCheck.checked;
});

cancelBtn.addEventListener('click', () => {
  previewEl.hidden = true;
  selected = null;
});

confirmBtn.addEventListener('click', async () => {
  if (selected === null) return;
  confirmBtn.disabled = true;
  const results = (await send({ type: 'CLEAN', profileId: selected.id })) as CategoryResult[];
  previewEl.hidden = true;
  render(reportList, results.map(formatReport));
  reportEl.hidden = false;
});

async function init(): Promise<void> {
  const profiles = (await send({ type: 'LIST_PROFILES' })) as Profile[];
  profilesEl.replaceChildren(
    ...profiles.map((profile) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = profile.name;
      button.addEventListener('click', () => void showPreview(profile));
      li.append(button);
      return li;
    }),
  );
}

void init();
