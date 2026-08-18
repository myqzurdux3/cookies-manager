import { send } from '../../core/messages';
import { normalizePattern } from '../../core/patterns';
import type { RestoreReport } from '../../core/restore';
import type { Settings } from '../../core/settings';
import { ALL_CATEGORIES } from '../../core/types';
import type { Profile, Since } from '../../core/types';
import type { VaultSummary } from '../../core/vault';
import { CATEGORY_LABELS, formatRestoreReport, formatVaultState } from '../labels';
import { COLUMNS, UNFILTERABLE, groupState, removeRule, toggleGroup } from './grid';

const select = document.querySelector<HTMLSelectElement>('#profile-select')!;
const nameInput = document.querySelector<HTMLInputElement>('#name')!;
const sinceSelect = document.querySelector<HTMLSelectElement>('#since')!;
const categoriesEl = document.querySelector<HTMLDivElement>('#categories')!;
const keeplistEl = document.querySelector<HTMLTableElement>('#keeplist')!;
const newPattern = document.querySelector<HTMLInputElement>('#new-pattern')!;
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const importArea = document.querySelector<HTMLTextAreaElement>('#import-area')!;
const unfilterableEl = document.querySelector<HTMLParagraphElement>('#unfilterable')!;

let profiles: Profile[] = [];
let current: Profile | null = null;
let hideStatus: ReturnType<typeof setTimeout> | undefined;

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function say(message: string, error = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', error);
  statusEl.classList.add('visible');
  clearTimeout(hideStatus);
  hideStatus = setTimeout(() => statusEl.classList.remove('visible'), 6000);
}

function renderCategories(): void {
  categoriesEl.replaceChildren(
    ...ALL_CATEGORIES.map((category) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = current!.categories.includes(category);
      input.addEventListener('change', () => {
        current!.categories = input.checked
          ? [...current!.categories, category]
          : current!.categories.filter((c) => c !== category);
      });

      const text = document.createElement('span');
      text.textContent = CATEGORY_LABELS[category];
      label.append(input, text);

      if (category === 'passwords' || category === 'formData') {
        const warn = document.createElement('span');
        warn.className = 'danger-note';
        warn.textContent = '— définitif, aucune exclusion par site';
        label.append(warn);
      }
      return label;
    }),
  );
}

function renderUnfilterableNote(): void {
  const names = UNFILTERABLE.map((category) => CATEGORY_LABELS[category]).join(' · ');
  unfilterableEl.textContent =
    `Ignorent la keep-list : ${names}. L'API navigateur n'accepte aucune exclusion par site ` +
    `pour ces catégories — c'est tout ou rien, et elles ne figurent donc pas dans la grille.`;
}

function renderKeeplist(): void {
  const header = document.createElement('tr');
  const siteHead = document.createElement('th');
  siteHead.textContent = 'Site conservé';
  header.append(siteHead);

  for (const column of COLUMNS) {
    const th = document.createElement('th');
    th.textContent = column.label;
    if (column.hint !== undefined) th.title = column.hint;
    header.append(th);
  }

  const removeHead = document.createElement('th');
  removeHead.textContent = 'Retirer';
  header.append(removeHead);

  if (current!.keepRules.length === 0) {
    const empty = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'empty';
    cell.colSpan = COLUMNS.length + 2;
    cell.textContent = 'Aucun site conservé : tout sera supprimé.';
    empty.append(cell);
    keeplistEl.replaceChildren(header, empty);
    return;
  }

  const rows = current!.keepRules.map((rule) => {
    const tr = document.createElement('tr');
    const patternCell = document.createElement('td');
    patternCell.textContent = rule.pattern;
    tr.append(patternCell);

    for (const column of COLUMNS) {
      const td = document.createElement('td');
      const state = groupState(current!.keepRules, rule.pattern, column.categories);

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = state === 'all';
      input.indeterminate = state === 'partial';
      input.title =
        state === 'partial'
          ? `${column.label} : conservé en partie. Cocher protège tout le groupe.`
          : state === 'all'
            ? `${column.label} conservé pour ce site`
            : `${column.label} supprimé pour ce site`;

      input.addEventListener('change', () => {
        current!.keepRules = toggleGroup(
          current!.keepRules,
          rule.pattern,
          column.categories,
          input.checked,
        );
        renderKeeplist();
      });

      td.append(input);
      tr.append(td);
    }

    const removeCell = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove';
    removeBtn.textContent = '✕';
    removeBtn.title = `Retirer ${rule.pattern} de la liste des sites conservés`;
    removeBtn.addEventListener('click', () => {
      current!.keepRules = removeRule(current!.keepRules, rule.pattern);
      renderKeeplist();
      say(`${rule.pattern} retiré. Pensez à enregistrer le profil.`);
    });
    removeCell.append(removeBtn);
    tr.append(removeCell);

    return tr;
  });

  keeplistEl.replaceChildren(header, ...rows);
}

function renderProfile(profile: Profile): void {
  current = structuredClone(profile);
  nameInput.value = current.name;
  sinceSelect.value = current.since;
  renderCategories();
  renderKeeplist();
}

function optionFor(profile: Profile): HTMLOptionElement {
  // `new Option(...)` n'existe que dans un navigateur : createElement rend la
  // page pilotable en test, pour un résultat identique.
  const option = document.createElement('option');
  option.value = profile.id;
  option.textContent = profile.name;
  return option;
}

async function reload(selectId?: string): Promise<void> {
  try {
    profiles = (await send({ type: 'LIST_PROFILES' })) as Profile[];
  } catch (cause) {
    say(`Profils illisibles : ${reason(cause)}`, true);
    return;
  }
  select.replaceChildren(...profiles.map(optionFor));
  const target = profiles.find((p) => p.id === selectId) ?? profiles[0];
  if (target === undefined) return;
  select.value = target.id;
  renderProfile(target);
}

select.addEventListener('change', () => {
  const profile = profiles.find((p) => p.id === select.value);
  if (profile !== undefined) renderProfile(profile);
});

document.querySelector('#new-profile')!.addEventListener('click', () => {
  renderProfile({
    id: crypto.randomUUID(),
    name: 'Nouveau profil',
    since: 'all',
    categories: ['cookies'],
    keepRules: [],
  });
});

document.querySelector('#delete-profile')!.addEventListener('click', async () => {
  if (current === null) return;
  try {
    await send({ type: 'DELETE_PROFILE', id: current.id });
  } catch (cause) {
    say(`Suppression refusée : ${reason(cause)}`, true);
    return;
  }
  say('Profil supprimé.');
  await reload();
});

document.querySelector('#add-pattern')!.addEventListener('click', () => {
  if (current === null) return;

  const result = normalizePattern(newPattern.value);
  if (!result.ok) {
    say(`Motif refusé : ${result.reason}`, true);
    return;
  }

  if (current.keepRules.some((rule) => rule.pattern === result.pattern)) {
    say(`${result.pattern} est déjà dans la liste.`, true);
    return;
  }

  current.keepRules = [...current.keepRules, { pattern: result.pattern, keep: { cookies: true } }];
  newPattern.value = '';
  renderKeeplist();
  say(
    result.changed
      ? `Ajouté sous la forme ${result.pattern} — un wildcard s'écrit *.exemple.com. Pensez à enregistrer.`
      : `${result.pattern} ajouté. Pensez à enregistrer le profil.`,
  );
});

document.querySelector<HTMLFormElement>('#editor')!.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (current === null) return;
  current.name = nameInput.value;
  current.since = sinceSelect.value as Since;
  try {
    await send({ type: 'SAVE_PROFILE', profile: current });
    say('Profil enregistré.');
    await reload(current.id);
  } catch (cause) {
    say(`Enregistrement refusé : ${cause instanceof Error ? cause.message : String(cause)}`, true);
  }
});

document.querySelector('#export')!.addEventListener('click', async () => {
  try {
    importArea.value = (await send({ type: 'EXPORT' })) as string;
  } catch (cause) {
    say(`Export refusé : ${reason(cause)}`, true);
    return;
  }
  say('Profils exportés dans la zone de texte.');
});

document.querySelector('#import')!.addEventListener('click', async () => {
  try {
    await send({ type: 'IMPORT', json: importArea.value });
    say('Profils importés.');
    await reload();
  } catch (cause) {
    say(`Import refusé : ${cause instanceof Error ? cause.message : String(cause)}`, true);
  }
});

// --- Coffre de cookies ---

const vaultEnabled = document.querySelector<HTMLInputElement>('#vault-enabled')!;
const vaultRetention = document.querySelector<HTMLInputElement>('#vault-retention')!;
const vaultState = document.querySelector<HTMLParagraphElement>('#vault-state')!;
const vaultPassphrase = document.querySelector<HTMLInputElement>('#vault-passphrase')!;

async function refreshVaultState(): Promise<void> {
  const summary = (await send({ type: 'VAULT_DESCRIBE' })) as VaultSummary | null;
  vaultState.textContent = formatVaultState(summary, (at) => new Date(at).toLocaleString('fr-FR'));
}

async function loadSettings(): Promise<void> {
  try {
    const settings = (await send({ type: 'GET_SETTINGS' })) as Settings;
    vaultEnabled.checked = settings.vaultEnabled;
    vaultRetention.value = String(settings.vaultRetentionDays);
    await refreshVaultState();
  } catch (cause) {
    say(`Réglages illisibles : ${reason(cause)}`, true);
  }
}

document.querySelector('#save-settings')!.addEventListener('click', async () => {
  try {
    await send({
      type: 'SAVE_SETTINGS',
      settings: {
        vaultEnabled: vaultEnabled.checked,
        vaultRetentionDays: Number(vaultRetention.value),
      },
    });
    say('Réglages enregistrés.');
  } catch (cause) {
    say(`Réglages refusés : ${cause instanceof Error ? cause.message : String(cause)}`, true);
  }
});

document.querySelector('#vault-restore')!.addEventListener('click', async () => {
  if (vaultPassphrase.value === '') {
    say('Phrase secrète requise pour restaurer.', true);
    return;
  }
  try {
    const report = (await send({
      type: 'VAULT_RESTORE',
      passphrase: vaultPassphrase.value,
    })) as RestoreReport;
    say(formatRestoreReport(report), report.failures.length > 0);
  } catch (cause) {
    say(`Restauration refusée : ${cause instanceof Error ? cause.message : String(cause)}`, true);
  } finally {
    vaultPassphrase.value = '';
  }
});

const vaultClear = document.querySelector<HTMLButtonElement>('#vault-clear')!;
const VAULT_CLEAR_LABEL = vaultClear.textContent ?? 'Supprimer le coffre';

/**
 * Supprimer le coffre est irréversible et ne demandait qu'un clic. Confirmation
 * en deux temps sur le bouton lui-même, plutôt qu'une modale : le service
 * worker ne peut pas répondre pendant qu'une modale bloque la page.
 */
let vaultClearArmed = false;

function disarmVaultClear(): void {
  vaultClearArmed = false;
  vaultClear.textContent = VAULT_CLEAR_LABEL;
  vaultClear.classList.remove('danger');
}

vaultClear.addEventListener('click', async () => {
  if (!vaultClearArmed) {
    vaultClearArmed = true;
    vaultClear.textContent = 'Confirmer la suppression';
    vaultClear.classList.add('danger');
    say('Suppression définitive du coffre : cliquez à nouveau pour confirmer.', true);
    return;
  }

  disarmVaultClear();
  try {
    await send({ type: 'VAULT_CLEAR' });
  } catch (cause) {
    say(`Suppression du coffre refusée : ${reason(cause)}`, true);
    return;
  }
  say('Coffre supprimé.');
  await refreshVaultState();
});

renderUnfilterableNote();
void reload();
void loadSettings();
