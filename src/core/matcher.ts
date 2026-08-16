import type { Category, KeepRule } from './types';

export function normalizeHost(host: string): string {
  return host.replace(/^\./, '').toLowerCase();
}

export function matchesPattern(host: string, pattern: string): boolean {
  const h = normalizeHost(host);
  const p = pattern.trim().toLowerCase();
  if (p === '*') return true;
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    return h === base || h.endsWith(`.${base}`);
  }
  return h === p;
}

export function isProtected(host: string, category: Category, rules: KeepRule[]): boolean {
  return rules.some((rule) => matchesPattern(host, rule.pattern) && rule.keep[category] === true);
}

export type CookieProtection = { all: boolean; names: Set<string> };

export function cookieProtection(host: string, rules: KeepRule[]): CookieProtection {
  const names = new Set<string>();
  let all = false;

  for (const rule of rules) {
    if (!matchesPattern(host, rule.pattern) || rule.keep.cookies !== true) continue;
    if (rule.keepCookies === undefined) {
      all = true;
    } else {
      for (const name of rule.keepCookies) names.add(name);
    }
  }

  return all ? { all: true, names: new Set() } : { all: false, names };
}
