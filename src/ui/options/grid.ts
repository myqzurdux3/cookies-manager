import type { Category, KeepRule } from '../../core/types';

export const PER_SITE: Record<Category, 'exact' | 'origin' | 'none'> = {
  cookies: 'exact',
  localStorage: 'origin',
  indexedDB: 'origin',
  cacheStorage: 'origin',
  serviceWorkers: 'origin',
  httpCache: 'none',
  history: 'exact',
  downloads: 'exact',
  formData: 'none',
  passwords: 'none',
  siteSettings: 'origin',
};

const NO_EXCLUSION =
  "L'API navigateur n'accepte aucune exclusion par site pour cette catégorie : c'est tout ou rien.";

export function cellState(category: Category, checked: boolean): { disabled: boolean; title: string } {
  if (PER_SITE[category] === 'none') return { disabled: true, title: NO_EXCLUSION };
  return {
    disabled: false,
    title: checked ? 'Conservé pour ce site' : 'Supprimé pour ce site',
  };
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
