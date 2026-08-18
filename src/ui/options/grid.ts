import { msg } from '../../i18n';
import type { Category, KeepRule } from '../../core/types';

export const PER_SITE: Record<Category, 'exact' | 'origin' | 'none'> = {
  cookies: 'exact',
  localStorage: 'origin',
  indexedDB: 'origin',
  cacheStorage: 'origin',
  serviceWorkers: 'origin',
  httpCache: 'origin',
  history: 'exact',
  downloads: 'exact',
  formData: 'none',
  passwords: 'none',
  siteSettings: 'origin',
};

export type Column = { key: string; label: string; categories: Category[]; hint?: string };

/**
 * Colonnes de la grille. Les quatre stockages web partagent une colonne : ils
 * relèvent tous de la même API, du même grain par origine, et personne ne
 * distingue `cacheStorage` de `serviceWorkers` au moment de protéger un site.
 *
 * Fonction et non constante : les libellés et les infobulles sont traduits, et
 * la grille est redessinée à chaque changement de langue.
 */
export function columns(): Column[] {
  const t = msg();
  return [
    { key: 'cookies', label: t.columns.cookies, categories: ['cookies'] },
    {
      key: 'storage',
      label: t.columns.storage,
      categories: ['localStorage', 'indexedDB', 'cacheStorage', 'serviceWorkers'],
      hint: t.columnHints.storage,
    },
    {
      key: 'httpCache',
      label: t.columns.httpCache,
      categories: ['httpCache'],
      hint: t.columnHints.httpCache,
    },
    { key: 'history', label: t.columns.history, categories: ['history'] },
    { key: 'downloads', label: t.columns.downloads, categories: ['downloads'] },
    {
      key: 'siteSettings',
      label: t.columns.siteSettings,
      categories: ['siteSettings'],
      hint: t.columnHints.siteSettings,
    },
  ];
}

/** Catégories que l'API ne sait pas exclure par site : hors tableau, dans leur propre bloc. */
export const UNFILTERABLE: Category[] = ['passwords', 'formData'];

export type GroupState = 'all' | 'partial' | 'none';

export function groupState(rules: KeepRule[], pattern: string, categories: Category[]): GroupState {
  const rule = rules.find((candidate) => candidate.pattern === pattern);
  if (rule === undefined) return 'none';
  const kept = categories.filter((category) => rule.keep[category] === true).length;
  if (kept === 0) return 'none';
  return kept === categories.length ? 'all' : 'partial';
}

export function toggleGroup(
  rules: KeepRule[],
  pattern: string,
  categories: Category[],
  checked: boolean,
): KeepRule[] {
  return categories.reduce(
    (accumulated, category) => toggleRule(accumulated, pattern, category, checked),
    rules,
  );
}

export function removeRule(rules: KeepRule[], pattern: string): KeepRule[] {
  return rules.filter((rule) => rule.pattern !== pattern);
}

export function toggleRule(
  rules: KeepRule[],
  pattern: string,
  category: Category,
  checked: boolean,
): KeepRule[] {
  const next = rules.map((rule) => ({ ...rule, keep: { ...rule.keep } }));
  const existing = next.find((rule) => rule.pattern === pattern);

  if (checked) {
    if (existing === undefined) next.push({ pattern, keep: { [category]: true } });
    else existing.keep[category] = true;
    return next;
  }

  if (existing !== undefined) delete existing.keep[category];
  return next.filter((rule) => Object.keys(rule.keep).length > 0);
}
