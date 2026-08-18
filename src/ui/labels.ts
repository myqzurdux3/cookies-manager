import type { CategoryResult, PreviewResult } from '../core/engine';
import type { RestoreReport } from '../core/restore';
import type { VaultSummary } from '../core/vault';
import type { Category, Profile, Since } from '../core/types';

export const CATEGORY_LABELS: Record<Category, string> = {
  cookies: 'Cookies',
  localStorage: 'Stockage local',
  indexedDB: 'IndexedDB',
  cacheStorage: 'Cache des applications',
  serviceWorkers: 'Service workers',
  httpCache: 'Cache HTTP',
  history: 'Historique',
  downloads: 'Liste des téléchargements',
  formData: 'Données de formulaire',
  passwords: 'Mots de passe',
  siteSettings: 'Autorisations de site',
};

export const SINCE_LABELS: Record<Since, string> = {
  hour: 'dernière heure',
  day: 'dernier jour',
  week: 'dernière semaine',
  month: 'dernier mois',
  all: 'tout',
};

/** Une ligne de l'interface : libellé à gauche, valeur à droite, note en dessous. */
export type Row = {
  label: string;
  value: string;
  note?: string;
  tone?: 'muted' | 'strong' | 'failed';
};

export function previewRow(result: PreviewResult): Row {
  const label = CATEGORY_LABELS[result.category];
  const { countable, items, note } = result.preview;
  if (countable) {
    return {
      label,
      value: `${items} à supprimer`,
      note,
      tone: items > 0 ? 'strong' : 'muted',
    };
  }
  return { label, value: 'non chiffrable', note, tone: 'muted' };
}

export function reportRow(result: CategoryResult): Row {
  const label = CATEGORY_LABELS[result.category];
  const { status, deleted, kept, error, countable } = result.report;

  if (status === 'failed') {
    return { label, value: 'échec', note: error ?? 'raison inconnue', tone: 'failed' };
  }

  // Sans décompte possible, « 0 supprimé » se lirait « rien n'a bougé ».
  if (countable === false) {
    return { label, value: 'vidé entièrement', tone: 'strong' };
  }

  const value = `${deleted} supprimé(s) · ${kept} conservé(s)`;
  if (status === 'partial') {
    return { label, value, note: `échec partiel : ${error ?? 'raison inconnue'}`, tone: 'failed' };
  }
  return { label, value, tone: 'strong' };
}

export type RunSummary = { deleted: number; kept: number; wiped: number; failed: number };

export function runSummary(results: CategoryResult[]): RunSummary {
  return results.reduce<RunSummary>(
    (total, { report }) => ({
      deleted: total.deleted + report.deleted,
      kept: total.kept + report.kept,
      wiped: total.wiped + (report.countable === false && report.status === 'ok' ? 1 : 0),
      failed: total.failed + (report.status === 'ok' ? 0 : 1),
    }),
    { deleted: 0, kept: 0, wiped: 0, failed: 0 },
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`;
}

export function formatRunSummary(summary: RunSummary): string {
  const parts = [
    plural(summary.deleted, 'élément supprimé', 'éléments supprimés'),
    plural(summary.kept, 'conservé', 'conservés'),
  ];
  if (summary.wiped > 0) {
    parts.push(
      plural(summary.wiped, 'catégorie vidée entièrement', 'catégories vidées entièrement'),
    );
  }
  if (summary.failed > 0) {
    parts.push(plural(summary.failed, 'catégorie en échec', 'catégories en échec'));
  }
  return parts.join(' · ');
}

/** Motifs qui protègent effectivement quelque chose : une règle sans case cochée ne compte pas. */
export function protectedSites(profile: Pick<Profile, 'keepRules'>): string[] {
  return profile.keepRules
    .filter((rule) => Object.values(rule.keep).some((kept) => kept === true))
    .map((rule) => rule.pattern);
}

export function profileMeta(profile: Pick<Profile, 'since' | 'categories'>): string {
  const count = profile.categories.length;
  return `${SINCE_LABELS[profile.since]} · ${count} catégorie${count > 1 ? 's' : ''}`;
}

export function needsExtraConfirmation(categories: Category[]): boolean {
  return categories.includes('passwords') || categories.includes('formData');
}

export function formatRestoreReport(report: RestoreReport): string {
  const base = `${report.restored} cookie(s) restauré(s).`;
  if (report.failures.length === 0) return `${base} Vos sessions sont de nouveau actives.`;
  const details = report.failures
    .map((failure) => `${failure.name} (${failure.domain}) : ${failure.error}`)
    .join(' | ');
  return `${base} ${report.failures.length} refusé(s) par le navigateur — ${details}`;
}

/**
 * Avertit qu'un coffre existant va être écrasé.
 *
 * Il n'y a qu'un seul emplacement de stockage : un nouveau nettoyage détruit la
 * sauvegarde précédente. Sans cet avertissement, la seule façon de s'en rendre
 * compte est d'avoir besoin de restaurer et de constater que c'est trop tard.
 * Aucune valeur de cookie ne transite par cette fonction.
 */
export function formatVaultReplacement(
  summary: VaultSummary | null,
  formatDate: (at: number) => string,
): string | null {
  if (summary === null) return null;
  const cookies = summary.cookieCount > 1 ? 'cookies' : 'cookie';
  return (
    `Un coffre du ${formatDate(summary.createdAt)} existe déjà ` +
    `(${summary.cookieCount} ${cookies}) et sera remplacé : restaurez-le d'abord si vous en avez besoin.`
  );
}

/**
 * Résume le coffre sans jamais toucher à son contenu : nombre de cookies,
 * domaines et date. Aucune valeur de cookie ne transite par cette fonction.
 */
export function formatVaultState(
  summary: VaultSummary | null,
  formatDate: (at: number) => string,
): string {
  if (summary === null) return 'Aucun coffre enregistré.';
  const domains = summary.domains.length;
  return `Coffre du ${formatDate(summary.createdAt)} : ${summary.cookieCount} cookie(s) sur ${domains} domaine(s).`;
}
