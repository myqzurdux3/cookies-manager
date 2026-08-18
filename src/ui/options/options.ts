import { send } from '../../core/messages';
import { normalizePattern } from '../../core/patterns';
import type { RestoreReport } from '../../core/restore';
import { DEFAULT_SETTINGS } from '../../core/settings';
import type { Settings } from '../../core/settings';
import { ALL_CATEGORIES } from '../../core/types';
import type { Profile, Since } from '../../core/types';
import type { VaultSummary } from '../../core/vault';
import { applyPreference, msg } from '../../i18n';
import type { LanguagePreference } from '../../i18n';
import { categoryLabel, formatRestoreReport, formatVaultState } from '../labels';
import { applyStaticText } from '../static';
import { UNFILTERABLE, columns, groupState, removeRule, toggleGroup } from './grid';

const select = document.querySelector<HTMLSelectElement>('#profile-select')!;
const nameInput = document.querySelector<HTMLInputElement>('#name')!;
const sinceSelect = document.querySelector<HTMLSelectElement>('#since')!;
const categoriesEl = document.querySelector<HTMLDivElement>('#categories')!;
const keeplistEl = document.querySelector<HTMLTableElement>('#keeplist')!;
const newPattern = document.querySelector<HTMLInputElement>('#new-pattern')!;
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const importArea = document.querySelector<HTMLTextAreaElement>('#import-area')!;
const unfilterableEl = document.querySelector<HTMLParagraphElement>('#unfilterable')!;
const languageSelect = document.querySelector<HTMLSelectElement>('#language')!;

// La langue du navigateur dès le chargement : les réglages enregistrés
// arriveront quelques instants plus tard, et diront la même chose dans le cas
// « automatique ». Sans cela, la page s'afficherait d'abord en français.
applyPreference('auto');
applyStaticText();

let profiles: Profile[] = [];
let current: Profile | null = null;
let hideStatus: ReturnType<typeof setTimeout> | undefined;
/** Derniers réglages enregistrés : changer de langue ne doit pas valider au
 * passage une rétention en cours de saisie. */
let saved: Settings = { ...DEFAULT_SETTINGS };

/**
 * Un gestionnaire `async` passé tel quel à `addEventListener` rend une promesse
 * que personne n'attend : un rejet devient une erreur non capturée, invisible.
 * Ce point de passage l'ignore explicitement — chaque gestionnaire traite déjà
 * ses propres erreurs — et supprime au passage la répétition du `querySelector`.
 */
function onClick(selector: string, handler: () => Promise<void> | void): void {
  document.querySelector(selector)!.addEventListener('click', () => {
    void handler();
  });
}

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
      text.textContent = categoryLabel(category);
      label.append(input, text);

      if (category === 'passwords' || category === 'formData') {
        const warn = document.createElement('span');
        warn.className = 'danger-note';
        warn.textContent = msg().options.dangerNote;
        label.append(warn);
      }
      return label;
    }),
  );
}

function renderUnfilterableNote(): void {
  const names = UNFILTERABLE.map(categoryLabel).join(' · ');
  unfilterableEl.textContent = msg().options.unfilterableNote(names);
}

function renderKeeplist(): void {
  const header = document.createElement('tr');
  const siteHead = document.createElement('th');
  siteHead.textContent = msg().options.colSite;
  header.append(siteHead);

  const grid = columns();
  for (const column of grid) {
    const th = document.createElement('th');
    th.textContent = column.label;
    if (column.hint !== undefined) th.title = column.hint;
    header.append(th);
  }

  const removeHead = document.createElement('th');
  removeHead.textContent = msg().options.colRemove;
  header.append(removeHead);

  if (current!.keepRules.length === 0) {
    const empty = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'empty';
    cell.colSpan = grid.length + 2;
    cell.textContent = msg().options.emptyKeeplist;
    empty.append(cell);
    keeplistEl.replaceChildren(header, empty);
    return;
  }

  const rows = current!.keepRules.map((rule) => {
    const tr = document.createElement('tr');
    const patternCell = document.createElement('td');
    patternCell.textContent = rule.pattern;
    tr.append(patternCell);

    for (const column of grid) {
      const td = document.createElement('td');
      const state = groupState(current!.keepRules, rule.pattern, column.categories);

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = state === 'all';
      input.indeterminate = state === 'partial';
      input.title =
        state === 'partial'
          ? msg().options.colPartial(column.label)
          : state === 'all'
            ? msg().options.colKept(column.label)
            : msg().options.colRemoved(column.label);

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
    removeBtn.title = msg().options.removeTitle(rule.pattern);
    removeBtn.addEventListener('click', () => {
      current!.keepRules = removeRule(current!.keepRules, rule.pattern);
      renderKeeplist();
      say(msg().options.removed(rule.pattern));
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
    say(msg().options.profilesUnreadable(reason(cause)), true);
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

onClick('#new-profile', () => {
  renderProfile({
    id: crypto.randomUUID(),
    name: msg().options.newProfileName,
    since: 'all',
    categories: ['cookies'],
    keepRules: [],
  });
});

onClick('#delete-profile', async () => {
  if (current === null) return;
  try {
    await send({ type: 'DELETE_PROFILE', id: current.id });
  } catch (cause) {
    say(msg().options.deleteRefused(reason(cause)), true);
    return;
  }
  say(msg().options.profileDeleted);
  await reload();
});

onClick('#add-pattern', () => {
  if (current === null) return;

  const result = normalizePattern(newPattern.value);
  if (!result.ok) {
    say(msg().options.patternRefused(result.reason), true);
    return;
  }

  if (current.keepRules.some((rule) => rule.pattern === result.pattern)) {
    say(msg().options.alreadyListed(result.pattern), true);
    return;
  }

  current.keepRules = [...current.keepRules, { pattern: result.pattern, keep: { cookies: true } }];
  newPattern.value = '';
  renderKeeplist();
  say(
    result.changed
      ? msg().options.addedNormalized(result.pattern)
      : msg().options.added(result.pattern),
  );
});

async function saveProfile(): Promise<void> {
  if (current === null) return;
  current.name = nameInput.value;
  current.since = sinceSelect.value as Since;
  try {
    await send({ type: 'SAVE_PROFILE', profile: current });
    say(msg().options.profileSaved);
    await reload(current.id);
  } catch (cause) {
    say(msg().options.saveRefused(reason(cause)), true);
  }
}

document.querySelector<HTMLFormElement>('#editor')!.addEventListener('submit', (event) => {
  // preventDefault doit rester synchrone : la soumission part sinon avant que
  // le gestionnaire asynchrone ne reprenne la main.
  event.preventDefault();
  void saveProfile();
});

onClick('#export', async () => {
  try {
    importArea.value = (await send({ type: 'EXPORT' })) as string;
  } catch (cause) {
    say(msg().options.exportRefused(reason(cause)), true);
    return;
  }
  say(msg().options.exported);
});

onClick('#import', async () => {
  try {
    await send({ type: 'IMPORT', json: importArea.value });
    say(msg().options.imported);
    await reload();
  } catch (cause) {
    say(msg().options.importRefused(reason(cause)), true);
  }
});

// --- Coffre de cookies ---

const vaultEnabled = document.querySelector<HTMLInputElement>('#vault-enabled')!;
const vaultRetention = document.querySelector<HTMLInputElement>('#vault-retention')!;
const vaultState = document.querySelector<HTMLParagraphElement>('#vault-state')!;
const vaultPassphrase = document.querySelector<HTMLInputElement>('#vault-passphrase')!;

async function refreshVaultState(): Promise<void> {
  const summary = (await send({ type: 'VAULT_DESCRIBE' })) as VaultSummary | null;
  vaultState.textContent = formatVaultState(summary, (at) =>
    new Date(at).toLocaleString(msg().locale),
  );
}

async function loadSettings(): Promise<void> {
  try {
    const settings = (await send({ type: 'GET_SETTINGS' })) as Settings;
    saved = settings;
    vaultEnabled.checked = settings.vaultEnabled;
    vaultRetention.value = String(settings.vaultRetentionDays);
    languageSelect.value = settings.language;
    applyPreference(settings.language);
    redraw();
    await refreshVaultState();
  } catch (cause) {
    say(msg().options.settingsUnreadable(reason(cause)), true);
  }
}

/**
 * Redessine tout ce que le dictionnaire touche : le balisage figé, et les
 * fragments construits en JavaScript, que `applyStaticText` ne voit pas.
 *
 * `disarmVaultClear` d'abord : le bouton « Confirmer la suppression » porte une
 * clé de traduction, donc réécrire le balisage lui rendrait son libellé neutre
 * tout en le laissant armé — un clic de plus aurait alors effacé le coffre sans
 * confirmation visible.
 */
function redraw(): void {
  disarmVaultClear();
  applyStaticText();
  renderUnfilterableNote();
  if (current !== null) {
    renderCategories();
    renderKeeplist();
  }
}

languageSelect.addEventListener('change', () => {
  void changeLanguage();
});

/**
 * La langue s'applique avant d'être enregistrée : l'interface répond au clic
 * sans attendre le service worker. Un refus d'enregistrement est annoncé — dans
 * la langue choisie — et la page reprendra l'ancienne préférence au rechargement.
 *
 * Les réglages partent depuis `saved`, pas depuis le formulaire : une rétention
 * en cours de saisie ne doit pas être validée par un changement de langue.
 */
async function changeLanguage(): Promise<void> {
  const language = languageSelect.value as LanguagePreference;
  applyPreference(language);
  redraw();
  const settings: Settings = { ...saved, language };
  try {
    await send({ type: 'SAVE_SETTINGS', settings });
    saved = settings;
    await refreshVaultState();
  } catch (cause) {
    say(msg().options.settingsRefused(reason(cause)), true);
  }
}

onClick('#save-settings', async () => {
  try {
    await send({
      type: 'SAVE_SETTINGS',
      settings: {
        vaultEnabled: vaultEnabled.checked,
        vaultRetentionDays: Number(vaultRetention.value),
        language: languageSelect.value as LanguagePreference,
      },
    });
    saved = {
      vaultEnabled: vaultEnabled.checked,
      vaultRetentionDays: Number(vaultRetention.value),
      language: languageSelect.value as LanguagePreference,
    };
    say(msg().options.settingsSaved);
  } catch (cause) {
    say(msg().options.settingsRefused(reason(cause)), true);
  }
});

onClick('#vault-restore', async () => {
  if (vaultPassphrase.value === '') {
    say(msg().options.restorePassphraseRequired, true);
    return;
  }
  try {
    const report = (await send({
      type: 'VAULT_RESTORE',
      passphrase: vaultPassphrase.value,
    })) as RestoreReport;
    say(formatRestoreReport(report), report.failures.length > 0);
  } catch (cause) {
    say(msg().options.restoreRefused(reason(cause)), true);
  } finally {
    vaultPassphrase.value = '';
  }
});

const vaultClear = document.querySelector<HTMLButtonElement>('#vault-clear')!;

/**
 * Supprimer le coffre est irréversible et ne demandait qu'un clic. Confirmation
 * en deux temps sur le bouton lui-même, plutôt qu'une modale : le service
 * worker ne peut pas répondre pendant qu'une modale bloque la page.
 */
let vaultClearArmed = false;

function disarmVaultClear(): void {
  vaultClearArmed = false;
  vaultClear.textContent = msg().options.clearVault;
  vaultClear.classList.remove('danger');
}

vaultClear.addEventListener('click', () => {
  void clearVault();
});

async function clearVault(): Promise<void> {
  if (!vaultClearArmed) {
    vaultClearArmed = true;
    vaultClear.textContent = msg().options.confirmDelete;
    vaultClear.classList.add('danger');
    say(msg().options.clearVaultArm, true);
    return;
  }

  disarmVaultClear();
  try {
    await send({ type: 'VAULT_CLEAR' });
  } catch (cause) {
    say(msg().options.clearVaultRefused(reason(cause)), true);
    return;
  }
  say(msg().options.vaultCleared);
  await refreshVaultState();
}

renderUnfilterableNote();
void reload();
void loadSettings();
