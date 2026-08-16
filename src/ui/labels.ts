import type { CategoryResult, PreviewResult } from '../core/engine';
import type { VaultSummary } from '../core/vault';
import type { Category } from '../core/types';

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

export function formatPreview(result: PreviewResult): string {
  const label = CATEGORY_LABELS[result.category];
  if (result.preview.countable) return `${label} : ${result.preview.items} à supprimer`;
  const note = result.preview.note === undefined ? '' : ` — ${result.preview.note}`;
  return `${label} : non chiffrable${note}`;
}

export function formatReport(result: CategoryResult): string {
  const label = CATEGORY_LABELS[result.category];
  const { status, deleted, kept, error } = result.report;
  if (status === 'failed') return `${label} : échec — ${error ?? 'raison inconnue'}`;
  const counts = `${deleted} supprimé(s), ${kept} conservé(s)`;
  if (status === 'partial') return `${label} : ${counts} — échec partiel : ${error ?? 'raison inconnue'}`;
  return `${label} : ${counts}`;
}

export function needsExtraConfirmation(categories: Category[]): boolean {
  return categories.includes('passwords') || categories.includes('formData');
}

/**
 * Résume le coffre sans jamais toucher à son contenu : nombre de cookies,
 * domaines et date. Aucune valeur de cookie ne transite par cette fonction.
 */
export function formatVaultState(summary: VaultSummary | null, formatDate: (at: number) => string): string {
  if (summary === null) return 'Aucun coffre enregistré.';
  const domains = summary.domains.length;
  return `Coffre du ${formatDate(summary.createdAt)} : ${summary.cookieCount} cookie(s) sur ${domains} domaine(s).`;
}
