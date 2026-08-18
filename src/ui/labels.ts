import type { CategoryResult, PreviewResult } from '../core/engine';
import type { RestoreReport } from '../core/restore';
import type { VaultSummary } from '../core/vault';
import type { Category, Profile, Since } from '../core/types';
import { msg } from '../i18n';

export function categoryLabel(category: Category): string {
  return msg().categories[category];
}

export function sinceLabel(since: Since): string {
  return msg().since[since];
}

/** Une ligne de l'interface : libellé à gauche, valeur à droite, note en dessous. */
export type Row = {
  label: string;
  value: string;
  note?: string;
  tone?: 'muted' | 'strong' | 'failed';
};

export function previewRow(result: PreviewResult): Row {
  const label = categoryLabel(result.category);
  const { countable, items, note } = result.preview;
  if (countable) {
    return {
      label,
      value: msg().row.toDelete(items),
      note,
      tone: items > 0 ? 'strong' : 'muted',
    };
  }
  return { label, value: msg().row.notCountable, note, tone: 'muted' };
}

export function reportRow(result: CategoryResult): Row {
  const label = categoryLabel(result.category);
  const { status, deleted, kept, error, countable } = result.report;
  const t = msg();

  if (status === 'failed') {
    return { label, value: t.row.failed, note: error ?? t.row.unknownReason, tone: 'failed' };
  }

  // Sans décompte possible, « 0 supprimé » se lirait « rien n'a bougé ».
  if (countable === false) {
    return { label, value: t.row.wipedFully, tone: 'strong' };
  }

  const value = t.row.deletedKept(deleted, kept);
  if (status === 'partial') {
    return {
      label,
      value,
      note: t.row.partialFailure(error ?? t.row.unknownReason),
      tone: 'failed',
    };
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

export function formatRunSummary(summary: RunSummary): string {
  const t = msg().summary;
  const parts = [t.deleted(summary.deleted), t.kept(summary.kept)];
  if (summary.wiped > 0) parts.push(t.wiped(summary.wiped));
  if (summary.failed > 0) parts.push(t.failed(summary.failed));
  return parts.join(' · ');
}

/** Motifs qui protègent effectivement quelque chose : une règle sans case cochée ne compte pas. */
export function protectedSites(profile: Pick<Profile, 'keepRules'>): string[] {
  return profile.keepRules
    .filter((rule) => Object.values(rule.keep).some((kept) => kept === true))
    .map((rule) => rule.pattern);
}

export function profileMeta(profile: Pick<Profile, 'since' | 'categories'>): string {
  return msg().profileMeta(sinceLabel(profile.since), profile.categories.length);
}

export function needsExtraConfirmation(categories: Category[]): boolean {
  return categories.includes('passwords') || categories.includes('formData');
}

export function formatRestoreReport(report: RestoreReport): string {
  const t = msg().restore;
  const base = t.restored(report.restored);
  if (report.failures.length === 0) return `${base} ${t.allBack}`;
  const details = report.failures
    .map((failure) => t.failureDetail(failure.name, failure.domain, failure.error))
    .join(' | ');
  return `${base} ${t.refused(report.failures.length, details)}`;
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
  return msg().vault.replacement(formatDate(summary.createdAt), summary.cookieCount);
}

/**
 * Résume le coffre sans jamais toucher à son contenu : nombre de cookies,
 * domaines et date. Aucune valeur de cookie ne transite par cette fonction.
 */
export function formatVaultState(
  summary: VaultSummary | null,
  formatDate: (at: number) => string,
): string {
  if (summary === null) return msg().vault.none;
  return msg().vault.state(
    formatDate(summary.createdAt),
    summary.cookieCount,
    summary.domains.length,
  );
}
