import { send } from '../../core/messages';
import type { Settings } from '../../core/settings';
import { ALL_CATEGORIES } from '../../core/types';
import type { Profile, Since } from '../../core/types';
import type { RestoreReport } from '../../core/restore';
import type { VaultSummary } from '../../core/vault';
import { CATEGORY_LABELS, formatRestoreReport, formatVaultState } from '../labels';
import { normalizePattern } from '../../core/patterns';
import { cellState, removeRule, toggleRule } from './grid';

const select = document.querySelector<HTMLSelectElement>('#profile-select')!;
const nameInput = document.querySelector<HTMLInputElement>('#name')!;
const sinceSelect = document.querySelector<HTMLSelectElement>('#since')!;
const categoriesEl = document.querySelector<HTMLDivElement>('#categories')!;
const keeplistEl = document.querySelector<HTMLTableElement>('#keeplist')!;
const newPattern = document.querySelector<HTMLInputElement>('#new-pattern')!;
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const importArea = document.querySelector<HTMLTextAreaElement>('#import-area')!;

let profiles: Profile[] = [];
let current: Profile | null = null;

function say(message: string): void {
  statusEl.textContent = message;
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
      label.append(input, ` ${CATEGORY_LABELS[category]}`);
      if (category === 'passwords' || category === 'formData') {
        const warn = document.createElement('span');
        warn.textContent = ' — suppression définitive, aucune exclusion par site';
        warn.style.color = '#a00';
        label.append(warn);
      }
      return label;
    }),
  );
}

function renderKeeplist(): void {
  const header = document.createElement('tr');
  header.append(document.createElement('th'));
  for (const category of ALL_CATEGORIES) {
    const th = document.createElement('th');
    th.textContent = CATEGORY_LABELS[category];
    header.append(th);
  }
  const removeHeader = document.createElement('th');
  removeHeader.textContent = 'Retirer';
  header.append(removeHeader);

  const rows = current!.keepRules.map((rule) => {
    const tr = document.createElement('tr');
    const patternCell = document.createElement('td');
    patternCell.textContent = rule.pattern;
    tr.append(patternCell);

    for (const category of ALL_CATEGORIES) {
      const td = document.createElement('td');
      const checked = rule.keep[category] === true;
      const state = cellState(category, checked);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      input.disabled = state.disabled;
      input.title = state.title;
      if (state.disabled) td.classList.add('disabled');
      input.addEventListener('change', () => {
        current!.keepRules = toggleRule(current!.keepRules, rule.pattern, category, input.checked);
        renderKeeplist();
      });
      td.append(input);
      tr.append(td);
    }

    const removeCell = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
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

async function reload(selectId?: string): Promise<void> {
  profiles = (await send({ type: 'LIST_PROFILES' })) as Profile[];
  select.replaceChildren(...profiles.map((profile) => new Option(profile.name, profile.id)));
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
  await send({ type: 'DELETE_PROFILE', id: current.id });
  say('Profil supprimé.');
  await reload();
});

document.querySelector('#add-pattern')!.addEventListener('click', () => {
  if (current === null) return;

  const result = normalizePattern(newPattern.value);
  if (!result.ok) {
    say(`Motif refusé : ${result.reason}`);
    return;
  }

  if (current.keepRules.some((rule) => rule.pattern === result.pattern)) {
    say(`${result.pattern} est déjà dans la liste.`);
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
  await send({ type: 'SAVE_PROFILE', profile: current });
  say('Profil enregistré.');
  await reload(current.id);
});

document.querySelector('#export')!.addEventListener('click', async () => {
  importArea.value = (await send({ type: 'EXPORT' })) as string;
  say('Profils exportés dans la zone de texte.');
});

document.querySelector('#import')!.addEventListener('click', async () => {
  try {
    await send({ type: 'IMPORT', json: importArea.value });
    say('Profils importés.');
    await reload();
  } catch (cause) {
    say(`Import refusé : ${cause instanceof Error ? cause.message : String(cause)}`);
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
  const settings = (await send({ type: 'GET_SETTINGS' })) as Settings;
  vaultEnabled.checked = settings.vaultEnabled;
  vaultRetention.value = String(settings.vaultRetentionDays);
  await refreshVaultState();
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
    say(`Réglages refusés : ${cause instanceof Error ? cause.message : String(cause)}`);
  }
});

document.querySelector('#vault-restore')!.addEventListener('click', async () => {
  if (vaultPassphrase.value === '') {
    say('Phrase secrète requise pour restaurer.');
    return;
  }
  try {
    const report = (await send({
      type: 'VAULT_RESTORE',
      passphrase: vaultPassphrase.value,
    })) as RestoreReport;
    say(formatRestoreReport(report));
  } catch (cause) {
    say(`Restauration refusée : ${cause instanceof Error ? cause.message : String(cause)}`);
  } finally {
    vaultPassphrase.value = '';
  }
});

document.querySelector('#vault-clear')!.addEventListener('click', async () => {
  await send({ type: 'VAULT_CLEAR' });
  say('Coffre supprimé.');
  await refreshVaultState();
});

void reload();
void loadSettings();
