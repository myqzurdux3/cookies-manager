> **Archive de conception.** Ce document décrit l'intention d'origine du projet,
> pas son comportement actuel. Plusieurs de ses hypothèses sur les API Chrome se
> sont révélées fausses — voir [AUDIT.md](../../AUDIT.md) et
> [docs/limites-navigateur.md](../../limites-navigateur.md). À lire comme une
> archive, jamais comme une référence.

# Cookies Manager — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire une extension MV3 pour Chrome et Brave qui supprime les données de navigation avec une keep-list par site croisée avec les catégories de données, pilotée par des profils de nettoyage nommés.

**Architecture:** Un cœur pur et testable sans navigateur (`matcher`, `planner`, `profiles`) produit un plan d'exécution ; un moteur itère sur des cleaners qui implémentent tous la même interface, un par catégorie de données, chacun encapsulant les limites de son API. Les surfaces d'interface (popup, options) ne parlent au service worker que par messages.

**Tech Stack:** TypeScript, Vite (build), Vitest (tests), API `chrome.*` MV3. Aucune dépendance runtime.

**Spec:** `docs/superpowers/specs/2026-08-16-cookies-manager-design.md`

## Global Constraints

- Manifest V3. Cible Chrome et Brave, un seul code.
- Aucune dépendance runtime. Les seules dépendances sont de développement : `typescript`, `vite`, `vitest`, `@types/chrome`.
- Aucune requête réseau sortante, aucune télémétrie. CSP `script-src 'self'; object-src 'self'`.
- Persistance dans `chrome.storage.local` uniquement. Jamais `chrome.storage.sync`.
- Toute ambiguïté de correspondance de keep-list résout vers « conserver ».
- Chaque cleaner reçoit son API `chrome` par injection de dépendance. Aucun accès au global `chrome` en dehors de `src/background.ts` et des fichiers d'interface.
- `passwords` et `formData` ne figurent dans aucun profil par défaut.
- Les tests du cœur (`tests/core/`) ne référencent jamais le global `chrome`.
- Messages de commit : préfixe conventionnel (`feat:`, `test:`, `docs:`, `chore:`).

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `public/manifest.json` | Manifeste MV3, permissions |
| `src/core/types.ts` | Types partagés : `Category`, `KeepRule`, `Profile`, `Plan`, `Cleaner` |
| `src/core/matcher.ts` | Un hostname + une keep-list → ce qui est protégé |
| `src/core/profiles.ts` | CRUD des profils, profils par défaut, export/import JSON |
| `src/core/planner.ts` | Profil + keep-list → plan d'exécution par catégorie |
| `src/core/engine.ts` | Exécute aperçu et nettoyage, agrège le rapport, tient le journal |
| `src/cleaners/index.ts` | Registre des cleaners |
| `src/cleaners/cookies.ts` | Cookies, finesse au cookie près |
| `src/cleaners/storage.ts` | localStorage, IndexedDB, cacheStorage, serviceWorkers |
| `src/cleaners/httpCache.ts` | Cache HTTP, tout ou rien |
| `src/cleaners/credentials.ts` | Mots de passe et formulaires, tout ou rien |
| `src/cleaners/history.ts` | Historique, finesse à l'URL |
| `src/cleaners/downloads.ts` | Liste des téléchargements, finesse à l'URL |
| `src/cleaners/siteSettings.ts` | Autorisations de site, par instantané et restauration |
| `src/background.ts` | Service worker : routage des messages, câblage du vrai `chrome` |
| `src/ui/popup/*` | Choisir un profil, voir l'aperçu, confirmer, lire le rapport |
| `src/ui/options/*` | Éditer les profils et la keep-list, import/export |

---

### Task 1: Squelette du projet, manifeste et outillage

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`
- Create: `public/manifest.json`
- Create: `popup.html`, `options.html`
- Create: `src/background.ts`, `src/ui/popup/popup.ts`, `src/ui/options/options.ts`
- Test: `tests/setup.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `npm test`, `npm run build`, `npm run typecheck`. Un dossier `dist/` chargeable comme extension décompressée.

- [ ] **Step 1: Écrire le test de fumée**

Créer `tests/setup.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import manifest from '../public/manifest.json';

describe('manifest', () => {
  it('cible Manifest V3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('ne demande que les permissions de base, les autres restant optionnelles', () => {
    expect(manifest.permissions.sort()).toEqual(['browsingData', 'cookies', 'storage']);
    expect(manifest.optional_permissions.sort()).toEqual(['contentSettings', 'downloads', 'history']);
  });

  it('interdit tout script distant', () => {
    expect(manifest.content_security_policy.extension_pages).toBe(
      "script-src 'self'; object-src 'self'",
    );
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/setup.test.ts`
Expected: FAIL — `vitest` n'est pas installé, ou `Cannot find module '../public/manifest.json'`.

- [ ] **Step 3: Créer `package.json`**

```json
{
  "name": "cookies-manager",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

Puis : `npm install`

- [ ] **Step 4: Créer `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "types": ["chrome", "vitest/globals"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

- [ ] **Step 5: Créer `vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        options: resolve(__dirname, 'options.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Créer `public/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Cookies Manager",
  "description": "Suppression des données de navigation avec conservation par site.",
  "version": "0.1.0",
  "permissions": ["browsingData", "cookies", "storage"],
  "optional_permissions": ["history", "downloads", "contentSettings"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_popup": "popup.html", "default_title": "Cookies Manager" },
  "options_page": "options.html",
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

- [ ] **Step 7: Créer les points d'entrée minimaux**

`popup.html` :

```html
<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8" /><title>Cookies Manager</title></head>
  <body><main id="app"></main><script type="module" src="/src/ui/popup/popup.ts"></script></body>
</html>
```

`options.html` :

```html
<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8" /><title>Cookies Manager — options</title></head>
  <body><main id="app"></main><script type="module" src="/src/ui/options/options.ts"></script></body>
</html>
```

`src/ui/popup/popup.ts` :

```ts
document.querySelector('#app')!.textContent = 'Cookies Manager';
```

`src/ui/options/options.ts` :

```ts
document.querySelector('#app')!.textContent = 'Options';
```

`src/background.ts` :

```ts
chrome.runtime.onInstalled.addListener(() => {
  console.log('Cookies Manager installé');
});
```

`.gitignore` :

```
node_modules/
dist/
```

- [ ] **Step 8: Lancer les tests et le build**

Run: `npm test && npm run typecheck && npm run build`
Expected: 3 tests PASS, aucune erreur de type, `dist/manifest.json` et `dist/background.js` présents.

- [ ] **Step 9: Vérifier le chargement dans le navigateur**

Ouvrir `chrome://extensions`, activer le mode développeur, « Charger l'extension non empaquetée », choisir `dist/`.
Expected: l'extension apparaît sans erreur, la popup affiche « Cookies Manager ».

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "chore: scaffold MV3 extension with vite and vitest"
```

---

### Task 2: Types partagés et moteur de correspondance

Le cœur du produit. Un bug ici supprime des données que l'utilisateur voulait garder, donc c'est la tâche la plus testée du plan.

**Files:**
- Create: `src/core/types.ts`, `src/core/matcher.ts`
- Test: `tests/core/matcher.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type Category` — union de 11 littéraux, voir code.
  - `type KeepRule = { pattern: string; keep: Partial<Record<Category, true>>; keepCookies?: string[] }`
  - `type Profile = { id: string; name: string; since: Since; categories: Category[]; keepRules: KeepRule[] }`
  - `type Since = 'hour' | 'day' | 'week' | 'month' | 'all'`
  - `normalizeHost(host: string): string`
  - `matchesPattern(host: string, pattern: string): boolean`
  - `isProtected(host: string, category: Category, rules: KeepRule[]): boolean`
  - `type CookieProtection = { all: boolean; names: Set<string> }`
  - `cookieProtection(host: string, rules: KeepRule[]): CookieProtection`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/core/matcher.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { normalizeHost, matchesPattern, isProtected, cookieProtection } from '../../src/core/matcher';
import type { KeepRule } from '../../src/core/types';

describe('normalizeHost', () => {
  it('retire le point initial des domaines de cookie', () => {
    expect(normalizeHost('.github.com')).toBe('github.com');
  });

  it('met en minuscules', () => {
    expect(normalizeHost('GitHub.COM')).toBe('github.com');
  });
});

describe('matchesPattern', () => {
  it('correspond exactement', () => {
    expect(matchesPattern('github.com', 'github.com')).toBe(true);
  });

  it('correspond au domaine de cookie pointé', () => {
    expect(matchesPattern('.github.com', 'github.com')).toBe(true);
  });

  it('ne correspond pas à un sous-domaine sans wildcard', () => {
    expect(matchesPattern('gist.github.com', 'github.com')).toBe(false);
  });

  it('ne correspond pas à un domaine qui contient le motif en suffixe', () => {
    expect(matchesPattern('evilgithub.com', 'github.com')).toBe(false);
  });

  it('le wildcard couvre les sous-domaines', () => {
    expect(matchesPattern('gist.github.com', '*.github.com')).toBe(true);
  });

  it('le wildcard couvre aussi le domaine nu', () => {
    expect(matchesPattern('github.com', '*.github.com')).toBe(true);
  });

  it('le wildcard ne franchit pas la frontière de label', () => {
    expect(matchesPattern('evilgithub.com', '*.github.com')).toBe(false);
  });

  it('l\'étoile seule correspond à tout', () => {
    expect(matchesPattern('n-importe-quoi.fr', '*')).toBe(true);
  });
});

describe('isProtected', () => {
  const rules: KeepRule[] = [
    { pattern: 'github.com', keep: { cookies: true } },
    { pattern: '*.github.com', keep: { history: true } },
  ];

  it('protège une catégorie couverte par une règle', () => {
    expect(isProtected('github.com', 'cookies', rules)).toBe(true);
  });

  it('ne protège pas une catégorie absente des règles', () => {
    expect(isProtected('github.com', 'httpCache', rules)).toBe(false);
  });

  it('additionne les protections de plusieurs règles', () => {
    expect(isProtected('github.com', 'history', rules)).toBe(true);
  });

  it('ne protège pas un hôte non couvert', () => {
    expect(isProtected('example.com', 'cookies', rules)).toBe(false);
  });
});

describe('cookieProtection', () => {
  it('protège tous les cookies quand aucun nom n\'est précisé', () => {
    const rules: KeepRule[] = [{ pattern: 'github.com', keep: { cookies: true } }];
    expect(cookieProtection('github.com', rules)).toEqual({ all: true, names: new Set() });
  });

  it('protège uniquement les noms listés', () => {
    const rules: KeepRule[] = [
      { pattern: 'github.com', keep: { cookies: true }, keepCookies: ['user_session'] },
    ];
    expect(cookieProtection('github.com', rules)).toEqual({
      all: false,
      names: new Set(['user_session']),
    });
  });

  it('unit les noms de deux règles', () => {
    const rules: KeepRule[] = [
      { pattern: 'github.com', keep: { cookies: true }, keepCookies: ['user_session'] },
      { pattern: '*.github.com', keep: { cookies: true }, keepCookies: ['dotcom_user'] },
    ];
    expect(cookieProtection('github.com', rules).names).toEqual(
      new Set(['user_session', 'dotcom_user']),
    );
  });

  it('une règle sans liste de noms l\'emporte sur une règle restrictive', () => {
    const rules: KeepRule[] = [
      { pattern: 'github.com', keep: { cookies: true }, keepCookies: ['user_session'] },
      { pattern: '*.github.com', keep: { cookies: true } },
    ];
    expect(cookieProtection('github.com', rules).all).toBe(true);
  });

  it('ignore une règle qui ne protège pas les cookies', () => {
    const rules: KeepRule[] = [{ pattern: 'github.com', keep: { history: true } }];
    expect(cookieProtection('github.com', rules)).toEqual({ all: false, names: new Set() });
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/core/matcher.test.ts`
Expected: FAIL — `Cannot find module '../../src/core/matcher'`.

- [ ] **Step 3: Écrire `src/core/types.ts`**

```ts
export type Category =
  | 'cookies'
  | 'localStorage'
  | 'indexedDB'
  | 'cacheStorage'
  | 'serviceWorkers'
  | 'httpCache'
  | 'history'
  | 'downloads'
  | 'formData'
  | 'passwords'
  | 'siteSettings';

export const ALL_CATEGORIES: Category[] = [
  'cookies',
  'localStorage',
  'indexedDB',
  'cacheStorage',
  'serviceWorkers',
  'httpCache',
  'history',
  'downloads',
  'formData',
  'passwords',
  'siteSettings',
];

export type Since = 'hour' | 'day' | 'week' | 'month' | 'all';

export type KeepRule = {
  pattern: string;
  keep: Partial<Record<Category, true>>;
  keepCookies?: string[];
};

export type Profile = {
  id: string;
  name: string;
  since: Since;
  categories: Category[];
  keepRules: KeepRule[];
};
```

- [ ] **Step 4: Écrire `src/core/matcher.ts`**

```ts
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
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/core/matcher.test.ts && npm run typecheck`
Expected: 20 tests PASS, aucune erreur de type.

- [ ] **Step 6: Commit**

```bash
git add src/core tests/core
git commit -m "feat: keep-list matcher with per-cookie granularity"
```

---

### Task 3: Stockage des profils

**Files:**
- Create: `src/core/profiles.ts`
- Test: `tests/core/profiles.test.ts`

**Interfaces:**
- Consumes: `Profile`, `Category` de `src/core/types.ts`.
- Produces:
  - `interface StorageArea { get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> }`
  - `createProfileStore(area: StorageArea): ProfileStore`
  - `ProfileStore` expose `list(): Promise<Profile[]>`, `save(profile: Profile): Promise<void>`, `remove(id: string): Promise<void>`, `exportJson(): Promise<string>`, `importJson(json: string): Promise<void>`
  - `DEFAULT_PROFILES: Profile[]`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/core/profiles.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { createProfileStore, DEFAULT_PROFILES } from '../../src/core/profiles';
import type { StorageArea } from '../../src/core/profiles';
import type { Profile } from '../../src/core/types';

function fakeArea(initial: Record<string, unknown> = {}): StorageArea & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    async get(key: string) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
    },
  };
}

const sample: Profile = {
  id: 'p1',
  name: 'Test',
  since: 'day',
  categories: ['cookies'],
  keepRules: [{ pattern: 'github.com', keep: { cookies: true } }],
};

describe('createProfileStore', () => {
  it('rend les profils par défaut quand le stockage est vide', async () => {
    const store = createProfileStore(fakeArea());
    expect(await store.list()).toEqual(DEFAULT_PROFILES);
  });

  it('enregistre puis relit un profil', async () => {
    const store = createProfileStore(fakeArea({ profiles: [] }));
    await store.save(sample);
    expect(await store.list()).toEqual([sample]);
  });

  it('remplace un profil de même identifiant au lieu de le dupliquer', async () => {
    const store = createProfileStore(fakeArea({ profiles: [sample] }));
    await store.save({ ...sample, name: 'Renommé' });
    const profiles = await store.list();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.name).toBe('Renommé');
  });

  it('supprime un profil', async () => {
    const store = createProfileStore(fakeArea({ profiles: [sample] }));
    await store.remove('p1');
    expect(await store.list()).toEqual([]);
  });

  it('fait un aller-retour par export puis import', async () => {
    const source = createProfileStore(fakeArea({ profiles: [sample] }));
    const json = await source.exportJson();
    const target = createProfileStore(fakeArea({ profiles: [] }));
    await target.importJson(json);
    expect(await target.list()).toEqual([sample]);
  });

  it('rejette un JSON qui n\'est pas une liste de profils', async () => {
    const store = createProfileStore(fakeArea({ profiles: [] }));
    await expect(store.importJson('{"nope": 1}')).rejects.toThrow('format de profils invalide');
  });

  it('rejette un profil importé dont le motif de keep-list est vide', async () => {
    const store = createProfileStore(fakeArea({ profiles: [] }));
    const bad = JSON.stringify([{ ...sample, keepRules: [{ pattern: '', keep: {} }] }]);
    await expect(store.importJson(bad)).rejects.toThrow('motif vide');
  });
});

describe('DEFAULT_PROFILES', () => {
  it('n\'inclut jamais les mots de passe ni les formulaires', () => {
    for (const profile of DEFAULT_PROFILES) {
      expect(profile.categories).not.toContain('passwords');
      expect(profile.categories).not.toContain('formData');
    }
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/core/profiles.test.ts`
Expected: FAIL — `Cannot find module '../../src/core/profiles'`.

- [ ] **Step 3: Écrire `src/core/profiles.ts`**

```ts
import type { Profile } from './types';

export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const KEY = 'profiles';

export const DEFAULT_PROFILES: Profile[] = [
  {
    id: 'light',
    name: 'Nettoyage léger',
    since: 'day',
    categories: ['cookies', 'httpCache'],
    keepRules: [{ pattern: '*', keep: {} }],
  },
  {
    id: 'full',
    name: 'Nettoyage complet',
    since: 'all',
    categories: [
      'cookies',
      'localStorage',
      'indexedDB',
      'cacheStorage',
      'serviceWorkers',
      'httpCache',
      'history',
      'downloads',
    ],
    keepRules: [],
  },
];

export interface ProfileStore {
  list(): Promise<Profile[]>;
  save(profile: Profile): Promise<void>;
  remove(id: string): Promise<void>;
  exportJson(): Promise<string>;
  importJson(json: string): Promise<void>;
}

function validate(value: unknown): Profile[] {
  if (!Array.isArray(value)) throw new Error('format de profils invalide');
  for (const profile of value) {
    if (typeof profile?.id !== 'string' || typeof profile?.name !== 'string') {
      throw new Error('format de profils invalide');
    }
    if (!Array.isArray(profile.categories) || !Array.isArray(profile.keepRules)) {
      throw new Error('format de profils invalide');
    }
    for (const rule of profile.keepRules) {
      if (typeof rule?.pattern !== 'string' || rule.pattern.trim() === '') {
        throw new Error('motif vide dans la keep-list');
      }
    }
  }
  return value as Profile[];
}

export function createProfileStore(area: StorageArea): ProfileStore {
  async function read(): Promise<Profile[]> {
    const stored = await area.get(KEY);
    const value = stored[KEY];
    return value === undefined ? DEFAULT_PROFILES : validate(value);
  }

  async function write(profiles: Profile[]): Promise<void> {
    await area.set({ [KEY]: profiles });
  }

  return {
    list: read,

    async save(profile) {
      const profiles = await read();
      const index = profiles.findIndex((p) => p.id === profile.id);
      if (index === -1) profiles.push(profile);
      else profiles[index] = profile;
      await write(profiles);
    },

    async remove(id) {
      await write((await read()).filter((p) => p.id !== id));
    },

    async exportJson() {
      return JSON.stringify(await read(), null, 2);
    },

    async importJson(json) {
      await write(validate(JSON.parse(json)));
    },
  };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/core/profiles.test.ts && npm run typecheck`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/profiles.ts tests/core/profiles.test.ts
git commit -m "feat: profile store with validated json import/export"
```

---

### Task 4: Planificateur

**Files:**
- Create: `src/core/planner.ts`
- Test: `tests/core/planner.test.ts`

**Interfaces:**
- Consumes: `Profile`, `Category`, `Since`, `KeepRule` de `src/core/types.ts`.
- Produces:
  - `sinceToTimestamp(since: Since, now: number): number` — rend 0 pour `'all'`.
  - `type CategoryPlan = { category: Category; since: number; keepRules: KeepRule[] }`
  - `type Plan = { profileId: string; since: number; categories: CategoryPlan[] }`
  - `buildPlan(profile: Profile, now: number): Plan`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/core/planner.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { buildPlan, sinceToTimestamp } from '../../src/core/planner';
import type { Profile } from '../../src/core/types';

const NOW = 1_700_000_000_000;

describe('sinceToTimestamp', () => {
  it('rend zéro pour "all"', () => {
    expect(sinceToTimestamp('all', NOW)).toBe(0);
  });

  it('recule d\'une heure', () => {
    expect(sinceToTimestamp('hour', NOW)).toBe(NOW - 3_600_000);
  });

  it('recule d\'une semaine', () => {
    expect(sinceToTimestamp('week', NOW)).toBe(NOW - 7 * 86_400_000);
  });
});

describe('buildPlan', () => {
  const profile: Profile = {
    id: 'p1',
    name: 'Test',
    since: 'hour',
    categories: ['cookies', 'history'],
    keepRules: [
      { pattern: 'github.com', keep: { cookies: true } },
      { pattern: 'news.fr', keep: { history: true } },
    ],
  };

  it('produit un plan par catégorie du profil', () => {
    const plan = buildPlan(profile, NOW);
    expect(plan.categories.map((c) => c.category)).toEqual(['cookies', 'history']);
  });

  it('propage la période à chaque catégorie', () => {
    const plan = buildPlan(profile, NOW);
    expect(plan.categories.every((c) => c.since === NOW - 3_600_000)).toBe(true);
  });

  it('ne transmet à une catégorie que les règles qui la concernent', () => {
    const plan = buildPlan(profile, NOW);
    const cookies = plan.categories.find((c) => c.category === 'cookies')!;
    expect(cookies.keepRules.map((r) => r.pattern)).toEqual(['github.com']);
  });

  it('ignore une catégorie absente du profil', () => {
    const plan = buildPlan(profile, NOW);
    expect(plan.categories.find((c) => c.category === 'passwords')).toBeUndefined();
  });

  it('rend une liste de règles vide quand aucune ne concerne la catégorie', () => {
    const plan = buildPlan({ ...profile, keepRules: [] }, NOW);
    expect(plan.categories[0]!.keepRules).toEqual([]);
  });

  it('déduplique les catégories répétées dans le profil', () => {
    const plan = buildPlan({ ...profile, categories: ['cookies', 'cookies'] }, NOW);
    expect(plan.categories).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/core/planner.test.ts`
Expected: FAIL — `Cannot find module '../../src/core/planner'`.

- [ ] **Step 3: Écrire `src/core/planner.ts`**

```ts
import type { Category, KeepRule, Profile, Since } from './types';

const DURATIONS: Record<Exclude<Since, 'all'>, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
};

export function sinceToTimestamp(since: Since, now: number): number {
  return since === 'all' ? 0 : now - DURATIONS[since];
}

export type CategoryPlan = {
  category: Category;
  since: number;
  keepRules: KeepRule[];
};

export type Plan = {
  profileId: string;
  since: number;
  categories: CategoryPlan[];
};

export function buildPlan(profile: Profile, now: number): Plan {
  const since = sinceToTimestamp(profile.since, now);
  const categories = [...new Set(profile.categories)].map((category) => ({
    category,
    since,
    keepRules: profile.keepRules.filter((rule) => rule.keep[category] === true),
  }));

  return { profileId: profile.id, since, categories };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/core/planner.test.ts && npm run typecheck`
Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/planner.ts tests/core/planner.test.ts
git commit -m "feat: build per-category execution plan from profile"
```

---

### Task 5: Interface Cleaner et cleaner des cookies

C'est le cleaner le plus fin du lot : il énumère les cookies un par un et n'efface que ceux qui ne sont protégés ni par domaine ni par nom.

**Files:**
- Modify: `src/core/types.ts` (ajout des types `Cleaner`, `Preview`, `CleanReport`)
- Create: `src/cleaners/cookies.ts`
- Test: `tests/cleaners/cookies.test.ts`

**Interfaces:**
- Consumes: `CategoryPlan` de `src/core/planner.ts`, `cookieProtection` et `normalizeHost` de `src/core/matcher.ts`.
- Produces:
  - `type Preview = { countable: boolean; items: number; note?: string }`
  - `type CleanReport = { status: 'ok' | 'partial' | 'failed'; deleted: number; kept: number; error?: string }`
  - `interface Cleaner { id: Category; perSite: 'exact' | 'origin' | 'none'; preview(plan: CategoryPlan): Promise<Preview>; clean(plan: CategoryPlan): Promise<CleanReport> }`
  - `type CookiesApi = { cookies: { getAll(details: object): Promise<chrome.cookies.Cookie[]>; remove(details: { url: string; name: string; storeId?: string }): Promise<unknown> } }`
  - `createCookiesCleaner(api: CookiesApi): Cleaner`
  - `cookieUrl(cookie: { domain: string; path: string; secure: boolean }): string`

- [ ] **Step 1: Ajouter les types dans `src/core/types.ts`**

Ajouter à la fin du fichier :

```ts
import type { CategoryPlan } from './planner';

export type Preview = {
  countable: boolean;
  items: number;
  note?: string;
};

export type CleanReport = {
  status: 'ok' | 'partial' | 'failed';
  deleted: number;
  kept: number;
  error?: string;
};

export interface Cleaner {
  id: Category;
  perSite: 'exact' | 'origin' | 'none';
  preview(plan: CategoryPlan): Promise<Preview>;
  clean(plan: CategoryPlan): Promise<CleanReport>;
}
```

- [ ] **Step 2: Écrire les tests qui échouent**

Créer `tests/cleaners/cookies.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { createCookiesCleaner, cookieUrl } from '../../src/cleaners/cookies';
import type { CategoryPlan } from '../../src/core/planner';

type FakeCookie = { name: string; domain: string; path: string; secure: boolean };

function fakeApi(cookies: FakeCookie[]) {
  const removed: { url: string; name: string }[] = [];
  return {
    removed,
    api: {
      cookies: {
        async getAll() {
          return cookies as unknown as chrome.cookies.Cookie[];
        },
        async remove(details: { url: string; name: string }) {
          removed.push(details);
          return details;
        },
      },
    },
  };
}

const COOKIES: FakeCookie[] = [
  { name: 'user_session', domain: '.github.com', path: '/', secure: true },
  { name: '_ga', domain: '.github.com', path: '/', secure: false },
  { name: 'sid', domain: 'example.com', path: '/', secure: true },
];

function plan(keepRules: CategoryPlan['keepRules']): CategoryPlan {
  return { category: 'cookies', since: 0, keepRules };
}

describe('cookieUrl', () => {
  it('construit une URL https pour un cookie sécurisé à domaine pointé', () => {
    expect(cookieUrl({ domain: '.github.com', path: '/', secure: true })).toBe('https://github.com/');
  });

  it('construit une URL http pour un cookie non sécurisé', () => {
    expect(cookieUrl({ domain: 'example.com', path: '/app', secure: false })).toBe(
      'http://example.com/app',
    );
  });
});

describe('createCookiesCleaner', () => {
  it('annonce une finesse exacte', () => {
    expect(createCookiesCleaner(fakeApi([]).api).perSite).toBe('exact');
  });

  it('compte exactement les cookies à supprimer dans l\'aperçu', async () => {
    const cleaner = createCookiesCleaner(fakeApi(COOKIES).api);
    const preview = await cleaner.preview(plan([{ pattern: 'github.com', keep: { cookies: true } }]));
    expect(preview).toMatchObject({ countable: true, items: 1 });
  });

  it('signale dans l\'aperçu que la période ne s\'applique pas aux cookies', async () => {
    const cleaner = createCookiesCleaner(fakeApi(COOKIES).api);
    const preview = await cleaner.preview({ ...plan([]), since: 1_700_000_000_000 });
    expect(preview.note).toMatch(/période/i);
  });

  it('supprime les cookies non protégés et garde les autres', async () => {
    const { api, removed } = fakeApi(COOKIES);
    const cleaner = createCookiesCleaner(api);
    const report = await cleaner.clean(plan([{ pattern: 'github.com', keep: { cookies: true } }]));
    expect(removed.map((r) => r.name)).toEqual(['sid']);
    expect(report).toMatchObject({ status: 'ok', deleted: 1, kept: 2 });
  });

  it('protège un cookie par son nom et supprime ses voisins', async () => {
    const { api, removed } = fakeApi(COOKIES);
    const cleaner = createCookiesCleaner(api);
    await cleaner.clean(
      plan([{ pattern: 'github.com', keep: { cookies: true }, keepCookies: ['user_session'] }]),
    );
    expect(removed.map((r) => r.name).sort()).toEqual(['_ga', 'sid']);
  });

  it('supprime tout quand la keep-list est vide', async () => {
    const { api, removed } = fakeApi(COOKIES);
    await createCookiesCleaner(api).clean(plan([]));
    expect(removed).toHaveLength(3);
  });

  it('rend un statut partiel quand une suppression échoue', async () => {
    const api = {
      cookies: {
        async getAll() {
          return COOKIES as unknown as chrome.cookies.Cookie[];
        },
        async remove() {
          throw new Error('accès refusé');
        },
      },
    };
    const report = await createCookiesCleaner(api).clean(plan([]));
    expect(report.status).toBe('partial');
    expect(report.deleted).toBe(0);
    expect(report.error).toMatch(/accès refusé/);
  });
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/cleaners/cookies.test.ts`
Expected: FAIL — `Cannot find module '../../src/cleaners/cookies'`.

- [ ] **Step 4: Écrire `src/cleaners/cookies.ts`**

```ts
import { cookieProtection, normalizeHost } from '../core/matcher';
import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, Preview } from '../core/types';

export type CookiesApi = {
  cookies: {
    getAll(details: object): Promise<chrome.cookies.Cookie[]>;
    remove(details: { url: string; name: string; storeId?: string }): Promise<unknown>;
  };
};

const TIME_NOTE =
  "Le filtre de période ne s'applique pas aux cookies : l'API ne fournit pas leur date de création.";

export function cookieUrl(cookie: { domain: string; path: string; secure: boolean }): string {
  const scheme = cookie.secure ? 'https' : 'http';
  return `${scheme}://${normalizeHost(cookie.domain)}${cookie.path}`;
}

function isDeletable(cookie: chrome.cookies.Cookie, plan: CategoryPlan): boolean {
  const protection = cookieProtection(cookie.domain, plan.keepRules);
  if (protection.all) return false;
  return !protection.names.has(cookie.name);
}

export function createCookiesCleaner(api: CookiesApi): Cleaner {
  return {
    id: 'cookies',
    perSite: 'exact',

    async preview(plan: CategoryPlan): Promise<Preview> {
      const cookies = await api.cookies.getAll({});
      const items = cookies.filter((cookie) => isDeletable(cookie, plan)).length;
      return plan.since === 0 ? { countable: true, items } : { countable: true, items, note: TIME_NOTE };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      const cookies = await api.cookies.getAll({});
      let deleted = 0;
      let kept = 0;
      let error: string | undefined;

      for (const cookie of cookies) {
        if (!isDeletable(cookie, plan)) {
          kept += 1;
          continue;
        }
        try {
          await api.cookies.remove({
            url: cookieUrl(cookie),
            name: cookie.name,
            storeId: cookie.storeId,
          });
          deleted += 1;
        } catch (cause) {
          error ??= cause instanceof Error ? cause.message : String(cause);
        }
      }

      return { status: error === undefined ? 'ok' : 'partial', deleted, kept, error };
    },
  };
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/cleaners/cookies.test.ts && npm run typecheck`
Expected: 9 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/cleaners/cookies.ts tests/cleaners/cookies.test.ts
git commit -m "feat: cookie cleaner with per-cookie keep-list"
```

---

### Task 6: Cleaners fondés sur browsingData — stockage, cache HTTP, identifiants

Trois cleaners d'un coup parce qu'ils partagent la même API et le même fichier de test, et qu'aucun n'a de sens seul : ils forment le lot « ce que `chrome.browsingData` sait faire ».

**Files:**
- Create: `src/cleaners/storage.ts`, `src/cleaners/httpCache.ts`, `src/cleaners/credentials.ts`
- Test: `tests/cleaners/browsingData.test.ts`

**Interfaces:**
- Consumes: `CategoryPlan`, `Cleaner`, `isProtected`.
- Produces:
  - `type BrowsingDataApi = { browsingData: { remove(options: chrome.browsingData.RemovalOptions, types: Record<string, boolean>): Promise<void> } }`
  - `type OriginSource = () => Promise<string[]>` — fournit les hôtes connus, utilisée pour l'aperçu et pour développer les motifs à wildcard.
  - `createStorageCleaner(api: BrowsingDataApi, category: StorageCategory, origins: OriginSource): Cleaner` où `StorageCategory = 'localStorage' | 'indexedDB' | 'cacheStorage' | 'serviceWorkers'`
  - `createHttpCacheCleaner(api: BrowsingDataApi): Cleaner`
  - `createCredentialsCleaner(api: BrowsingDataApi, category: 'passwords' | 'formData'): Cleaner`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/cleaners/browsingData.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { createStorageCleaner } from '../../src/cleaners/storage';
import { createHttpCacheCleaner } from '../../src/cleaners/httpCache';
import { createCredentialsCleaner } from '../../src/cleaners/credentials';
import type { CategoryPlan } from '../../src/core/planner';

function fakeApi() {
  const calls: { options: chrome.browsingData.RemovalOptions; types: Record<string, boolean> }[] = [];
  return {
    calls,
    api: {
      browsingData: {
        async remove(options: chrome.browsingData.RemovalOptions, types: Record<string, boolean>) {
          calls.push({ options, types });
        },
      },
    },
  };
}

const knownHosts = async () => ['github.com', 'gist.github.com', 'example.com'];

function plan(category: CategoryPlan['category'], keepRules: CategoryPlan['keepRules'], since = 0): CategoryPlan {
  return { category, since, keepRules };
}

describe('createStorageCleaner', () => {
  it('annonce une finesse par origine', () => {
    expect(createStorageCleaner(fakeApi().api, 'localStorage', knownHosts).perSite).toBe('origin');
  });

  it('exclut les origines protégées, en http et en https', async () => {
    const { api, calls } = fakeApi();
    const cleaner = createStorageCleaner(api, 'localStorage', knownHosts);
    await cleaner.clean(plan('localStorage', [{ pattern: 'github.com', keep: { localStorage: true } }]));
    expect(calls[0]!.options.excludeOrigins).toEqual(['https://github.com', 'http://github.com']);
    expect(calls[0]!.types).toEqual({ localStorage: true });
  });

  it('développe un motif à wildcard à partir des hôtes connus', async () => {
    const { api, calls } = fakeApi();
    const cleaner = createStorageCleaner(api, 'indexedDB', knownHosts);
    await cleaner.clean(plan('indexedDB', [{ pattern: '*.github.com', keep: { indexedDB: true } }]));
    expect(calls[0]!.options.excludeOrigins).toContain('https://gist.github.com');
    expect(calls[0]!.options.excludeOrigins).not.toContain('https://example.com');
  });

  it('transmet la période', async () => {
    const { api, calls } = fakeApi();
    await createStorageCleaner(api, 'localStorage', knownHosts).clean(plan('localStorage', [], 1234));
    expect(calls[0]!.options.since).toBe(1234);
  });

  it('rend un aperçu partiel et non chiffrable', async () => {
    const preview = await createStorageCleaner(fakeApi().api, 'localStorage', knownHosts).preview(
      plan('localStorage', [{ pattern: 'github.com', keep: { localStorage: true } }]),
    );
    expect(preview.countable).toBe(false);
    expect(preview.note).toMatch(/minorant|non exhaustive/i);
  });

  it('rend un statut échoué quand l\'API rejette', async () => {
    const api = {
      browsingData: {
        async remove() {
          throw new Error('permission manquante');
        },
      },
    };
    const report = await createStorageCleaner(api, 'localStorage', knownHosts).clean(
      plan('localStorage', []),
    );
    expect(report).toMatchObject({ status: 'failed', deleted: 0, kept: 0 });
    expect(report.error).toMatch(/permission manquante/);
  });
});

describe('createHttpCacheCleaner', () => {
  it('n\'offre aucune finesse par site', () => {
    expect(createHttpCacheCleaner(fakeApi().api).perSite).toBe('none');
  });

  it('efface tout le cache sans exclusion, même si des règles existent', async () => {
    const { api, calls } = fakeApi();
    await createHttpCacheCleaner(api).clean(
      plan('httpCache', [{ pattern: 'github.com', keep: { httpCache: true } }], 42),
    );
    expect(calls[0]!.types).toEqual({ cache: true });
    expect(calls[0]!.options).toEqual({ since: 42 });
  });

  it('explique dans l\'aperçu que la conservation par site est impossible', async () => {
    const preview = await createHttpCacheCleaner(fakeApi().api).preview(plan('httpCache', []));
    expect(preview.countable).toBe(false);
    expect(preview.note).toMatch(/tout ou rien/i);
  });
});

describe('createCredentialsCleaner', () => {
  it('n\'offre aucune finesse par site', () => {
    expect(createCredentialsCleaner(fakeApi().api, 'passwords').perSite).toBe('none');
  });

  it('efface les mots de passe', async () => {
    const { api, calls } = fakeApi();
    await createCredentialsCleaner(api, 'passwords').clean(plan('passwords', [], 0));
    expect(calls[0]!.types).toEqual({ passwords: true });
  });

  it('efface les données de formulaire', async () => {
    const { api, calls } = fakeApi();
    await createCredentialsCleaner(api, 'formData').clean(plan('formData', [], 0));
    expect(calls[0]!.types).toEqual({ formData: true });
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/cleaners/browsingData.test.ts`
Expected: FAIL — `Cannot find module '../../src/cleaners/storage'`.

- [ ] **Step 3: Écrire `src/cleaners/storage.ts`**

```ts
import { matchesPattern } from '../core/matcher';
import type { CategoryPlan } from '../core/planner';
import type { Category, Cleaner, CleanReport, Preview } from '../core/types';

export type BrowsingDataApi = {
  browsingData: {
    remove(
      options: chrome.browsingData.RemovalOptions,
      types: Record<string, boolean>,
    ): Promise<void>;
  };
};

export type OriginSource = () => Promise<string[]>;

export type StorageCategory = 'localStorage' | 'indexedDB' | 'cacheStorage' | 'serviceWorkers';

const PARTIAL_NOTE =
  "Liste des origines dérivée des cookies et de l'historique : c'est un minorant, la liste n'est pas exhaustive.";

export async function protectedOrigins(
  plan: CategoryPlan,
  knownHosts: OriginSource,
): Promise<string[]> {
  const hosts = new Set<string>();

  for (const rule of plan.keepRules) {
    if (rule.pattern.includes('*')) {
      for (const host of await knownHosts()) {
        if (matchesPattern(host, rule.pattern)) hosts.add(host);
      }
    } else {
      hosts.add(rule.pattern.toLowerCase());
    }
  }

  return [...hosts].flatMap((host) => [`https://${host}`, `http://${host}`]);
}

export function createStorageCleaner(
  api: BrowsingDataApi,
  category: StorageCategory,
  knownHosts: OriginSource,
): Cleaner {
  return {
    id: category as Category,
    perSite: 'origin',

    async preview(plan: CategoryPlan): Promise<Preview> {
      const origins = await protectedOrigins(plan, knownHosts);
      return {
        countable: false,
        items: 0,
        note: `${origins.length / 2} origine(s) protégée(s). ${PARTIAL_NOTE}`,
      };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      const excludeOrigins = await protectedOrigins(plan, knownHosts);
      const options: chrome.browsingData.RemovalOptions = { since: plan.since };
      if (excludeOrigins.length > 0) options.excludeOrigins = excludeOrigins;

      try {
        await api.browsingData.remove(options, { [category]: true });
        return { status: 'ok', deleted: 0, kept: 0 };
      } catch (cause) {
        return {
          status: 'failed',
          deleted: 0,
          kept: 0,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  };
}
```

- [ ] **Step 4: Écrire `src/cleaners/httpCache.ts`**

```ts
import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, Preview } from '../core/types';
import type { BrowsingDataApi } from './storage';

const NOTE =
  "Le cache HTTP est tout ou rien : l'API navigateur n'accepte aucune exclusion par site pour cette catégorie.";

export function createHttpCacheCleaner(api: BrowsingDataApi): Cleaner {
  return {
    id: 'httpCache',
    perSite: 'none',

    async preview(): Promise<Preview> {
      return { countable: false, items: 0, note: NOTE };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      try {
        await api.browsingData.remove({ since: plan.since }, { cache: true });
        return { status: 'ok', deleted: 0, kept: 0 };
      } catch (cause) {
        return {
          status: 'failed',
          deleted: 0,
          kept: 0,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  };
}
```

- [ ] **Step 5: Écrire `src/cleaners/credentials.ts`**

```ts
import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, Preview } from '../core/types';
import type { BrowsingDataApi } from './storage';

const NOTES = {
  passwords:
    "Les mots de passe enregistrés sont tout ou rien : aucune exclusion par site n'est possible. Suppression définitive.",
  formData:
    "Les données de formulaire sont tout ou rien : aucune exclusion par site n'est possible. Suppression définitive.",
} as const;

export function createCredentialsCleaner(
  api: BrowsingDataApi,
  category: 'passwords' | 'formData',
): Cleaner {
  return {
    id: category,
    perSite: 'none',

    async preview(): Promise<Preview> {
      return { countable: false, items: 0, note: NOTES[category] };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      try {
        await api.browsingData.remove({ since: plan.since }, { [category]: true });
        return { status: 'ok', deleted: 0, kept: 0 };
      } catch (cause) {
        return {
          status: 'failed',
          deleted: 0,
          kept: 0,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  };
}
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/cleaners/browsingData.test.ts && npm run typecheck`
Expected: 12 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/cleaners tests/cleaners/browsingData.test.ts
git commit -m "feat: storage, http cache and credentials cleaners"
```

---

### Task 7: Cleaners par énumération — historique et téléchargements

**Files:**
- Create: `src/cleaners/history.ts`, `src/cleaners/downloads.ts`
- Test: `tests/cleaners/history.test.ts`, `tests/cleaners/downloads.test.ts`

**Interfaces:**
- Consumes: `CategoryPlan`, `Cleaner`, `isProtected`.
- Produces:
  - `type HistoryApi = { history: { search(query: { text: string; startTime: number; endTime?: number; maxResults: number }): Promise<{ url?: string; lastVisitTime?: number }[]>; deleteUrl(details: { url: string }): Promise<void> } }`
  - `createHistoryCleaner(api: HistoryApi): Cleaner`
  - `type DownloadsApi = { downloads: { search(query: object): Promise<{ id: number; finalUrl?: string; url?: string; startTime?: string }[]>; erase(query: { id: number }): Promise<number[]> } }`
  - `createDownloadsCleaner(api: DownloadsApi): Cleaner`
  - `hostOf(url: string): string | null` exporté depuis `src/cleaners/history.ts`, réutilisé par `downloads.ts`

- [ ] **Step 1: Écrire les tests de l'historique**

Créer `tests/cleaners/history.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { createHistoryCleaner, hostOf } from '../../src/cleaners/history';
import type { CategoryPlan } from '../../src/core/planner';

type Visit = { url?: string; lastVisitTime?: number };

function fakeApi(pages: Visit[]) {
  const deleted: string[] = [];
  let calls = 0;
  return {
    deleted,
    api: {
      history: {
        async search() {
          calls += 1;
          return calls === 1 ? pages : [];
        },
        async deleteUrl(details: { url: string }) {
          deleted.push(details.url);
        },
      },
    },
  };
}

const PAGES: Visit[] = [
  { url: 'https://github.com/a', lastVisitTime: 100 },
  { url: 'https://gist.github.com/b', lastVisitTime: 200 },
  { url: 'https://example.com/c', lastVisitTime: 300 },
];

function plan(keepRules: CategoryPlan['keepRules'], since = 0): CategoryPlan {
  return { category: 'history', since, keepRules };
}

describe('hostOf', () => {
  it('extrait l\'hôte d\'une URL', () => {
    expect(hostOf('https://github.com/a?x=1')).toBe('github.com');
  });

  it('rend null pour une URL illisible', () => {
    expect(hostOf('pas-une-url')).toBeNull();
  });
});

describe('createHistoryCleaner', () => {
  it('annonce une finesse exacte', () => {
    expect(createHistoryCleaner(fakeApi([]).api).perSite).toBe('exact');
  });

  it('compte exactement les entrées à supprimer', async () => {
    const preview = await createHistoryCleaner(fakeApi(PAGES).api).preview(
      plan([{ pattern: '*.github.com', keep: { history: true } }]),
    );
    expect(preview).toEqual({ countable: true, items: 1 });
  });

  it('supprime les entrées non protégées', async () => {
    const { api, deleted } = fakeApi(PAGES);
    const report = await createHistoryCleaner(api).clean(
      plan([{ pattern: '*.github.com', keep: { history: true } }]),
    );
    expect(deleted).toEqual(['https://example.com/c']);
    expect(report).toMatchObject({ status: 'ok', deleted: 1, kept: 2 });
  });

  it('conserve une entrée dont l\'URL est illisible plutôt que de la supprimer', async () => {
    const { api, deleted } = fakeApi([{ url: 'pas-une-url', lastVisitTime: 1 }]);
    const report = await createHistoryCleaner(api).clean(plan([]));
    expect(deleted).toEqual([]);
    expect(report.kept).toBe(1);
  });

  it('rend un statut partiel quand une suppression échoue', async () => {
    const api = {
      history: {
        async search() {
          return PAGES;
        },
        async deleteUrl() {
          throw new Error('historique verrouillé');
        },
      },
    };
    let first = true;
    const paged = {
      history: {
        async search() {
          if (!first) return [];
          first = false;
          return PAGES;
        },
        deleteUrl: api.history.deleteUrl,
      },
    };
    const report = await createHistoryCleaner(paged).clean(plan([]));
    expect(report.status).toBe('partial');
    expect(report.error).toMatch(/historique verrouillé/);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/cleaners/history.test.ts`
Expected: FAIL — `Cannot find module '../../src/cleaners/history'`.

- [ ] **Step 3: Écrire `src/cleaners/history.ts`**

La recherche d'historique est paginée : `chrome.history.search` plafonne à `maxResults`, donc on descend dans le temps avec un curseur `endTime` jusqu'à ce qu'une page revienne vide.

```ts
import { isProtected } from '../core/matcher';
import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, Preview } from '../core/types';

export type HistoryItem = { url?: string; lastVisitTime?: number };

export type HistoryApi = {
  history: {
    search(query: {
      text: string;
      startTime: number;
      endTime?: number;
      maxResults: number;
    }): Promise<HistoryItem[]>;
    deleteUrl(details: { url: string }): Promise<void>;
  };
};

const PAGE_SIZE = 1000;

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function collect(api: HistoryApi, since: number): Promise<HistoryItem[]> {
  const items: HistoryItem[] = [];
  let endTime: number | undefined;

  for (;;) {
    const page = await api.history.search({
      text: '',
      startTime: since,
      endTime,
      maxResults: PAGE_SIZE,
    });
    if (page.length === 0) break;
    items.push(...page);
    const oldest = Math.min(...page.map((item) => item.lastVisitTime ?? 0));
    if (oldest === 0 || oldest === endTime) break;
    endTime = oldest;
  }

  return items;
}

function isDeletable(item: HistoryItem, plan: CategoryPlan): boolean {
  if (item.url === undefined) return false;
  const host = hostOf(item.url);
  if (host === null) return false;
  return !isProtected(host, 'history', plan.keepRules);
}

export function createHistoryCleaner(api: HistoryApi): Cleaner {
  return {
    id: 'history',
    perSite: 'exact',

    async preview(plan: CategoryPlan): Promise<Preview> {
      const items = await collect(api, plan.since);
      return { countable: true, items: items.filter((item) => isDeletable(item, plan)).length };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      const items = await collect(api, plan.since);
      const urls = new Set<string>();
      let kept = 0;

      for (const item of items) {
        if (isDeletable(item, plan)) urls.add(item.url!);
        else kept += 1;
      }

      let deleted = 0;
      let error: string | undefined;

      for (const url of urls) {
        try {
          await api.history.deleteUrl({ url });
          deleted += 1;
        } catch (cause) {
          error ??= cause instanceof Error ? cause.message : String(cause);
        }
      }

      return { status: error === undefined ? 'ok' : 'partial', deleted, kept, error };
    },
  };
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run tests/cleaners/history.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Écrire les tests des téléchargements**

Créer `tests/cleaners/downloads.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { createDownloadsCleaner } from '../../src/cleaners/downloads';
import type { CategoryPlan } from '../../src/core/planner';

type Item = { id: number; finalUrl?: string; url?: string };

function fakeApi(items: Item[]) {
  const erased: number[] = [];
  return {
    erased,
    api: {
      downloads: {
        async search() {
          return items;
        },
        async erase(query: { id: number }) {
          erased.push(query.id);
          return [query.id];
        },
      },
    },
  };
}

const ITEMS: Item[] = [
  { id: 1, finalUrl: 'https://github.com/x.zip' },
  { id: 2, finalUrl: 'https://example.com/y.zip' },
  { id: 3, url: 'https://example.com/z.zip' },
];

function plan(keepRules: CategoryPlan['keepRules']): CategoryPlan {
  return { category: 'downloads', since: 0, keepRules };
}

describe('createDownloadsCleaner', () => {
  it('annonce une finesse exacte', () => {
    expect(createDownloadsCleaner(fakeApi([]).api).perSite).toBe('exact');
  });

  it('compte exactement les entrées à effacer', async () => {
    const preview = await createDownloadsCleaner(fakeApi(ITEMS).api).preview(
      plan([{ pattern: 'github.com', keep: { downloads: true } }]),
    );
    expect(preview).toEqual({ countable: true, items: 2 });
  });

  it('efface les entrées non protégées et garde les autres', async () => {
    const { api, erased } = fakeApi(ITEMS);
    const report = await createDownloadsCleaner(api).clean(
      plan([{ pattern: 'github.com', keep: { downloads: true } }]),
    );
    expect(erased).toEqual([2, 3]);
    expect(report).toMatchObject({ status: 'ok', deleted: 2, kept: 1 });
  });

  it('retombe sur url quand finalUrl est absent', async () => {
    const { api, erased } = fakeApi([{ id: 9, url: 'https://github.com/a.zip' }]);
    await createDownloadsCleaner(api).clean(plan([{ pattern: 'github.com', keep: { downloads: true } }]));
    expect(erased).toEqual([]);
  });

  it('conserve une entrée sans URL exploitable', async () => {
    const { api, erased } = fakeApi([{ id: 9 }]);
    const report = await createDownloadsCleaner(api).clean(plan([]));
    expect(erased).toEqual([]);
    expect(report.kept).toBe(1);
  });
});
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/cleaners/downloads.test.ts`
Expected: FAIL — `Cannot find module '../../src/cleaners/downloads'`.

- [ ] **Step 7: Écrire `src/cleaners/downloads.ts`**

`chrome.downloads.search` accepte `startedAfter` au format ISO 8601, d'où la conversion de la période.

```ts
import { isProtected } from '../core/matcher';
import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, Preview } from '../core/types';
import { hostOf } from './history';

export type DownloadItem = { id: number; finalUrl?: string; url?: string };

export type DownloadsApi = {
  downloads: {
    search(query: object): Promise<DownloadItem[]>;
    erase(query: { id: number }): Promise<number[]>;
  };
};

function isDeletable(item: DownloadItem, plan: CategoryPlan): boolean {
  const url = item.finalUrl ?? item.url;
  if (url === undefined) return false;
  const host = hostOf(url);
  if (host === null) return false;
  return !isProtected(host, 'downloads', plan.keepRules);
}

function query(plan: CategoryPlan): object {
  return plan.since === 0 ? {} : { startedAfter: new Date(plan.since).toISOString() };
}

export function createDownloadsCleaner(api: DownloadsApi): Cleaner {
  return {
    id: 'downloads',
    perSite: 'exact',

    async preview(plan: CategoryPlan): Promise<Preview> {
      const items = await api.downloads.search(query(plan));
      return { countable: true, items: items.filter((item) => isDeletable(item, plan)).length };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      const items = await api.downloads.search(query(plan));
      let deleted = 0;
      let kept = 0;
      let error: string | undefined;

      for (const item of items) {
        if (!isDeletable(item, plan)) {
          kept += 1;
          continue;
        }
        try {
          await api.downloads.erase({ id: item.id });
          deleted += 1;
        } catch (cause) {
          error ??= cause instanceof Error ? cause.message : String(cause);
        }
      }

      return { status: error === undefined ? 'ok' : 'partial', deleted, kept, error };
    },
  };
}
```

- [ ] **Step 8: Lancer tous les tests**

Run: `npm test && npm run typecheck`
Expected: tous PASS.

- [ ] **Step 9: Commit**

```bash
git add src/cleaners/history.ts src/cleaners/downloads.ts tests/cleaners/history.test.ts tests/cleaners/downloads.test.ts
git commit -m "feat: history and downloads cleaners with per-url keep-list"
```

---

### Task 8: Cleaner des autorisations de site

`chrome.contentSettings` n'expose aucune suppression par motif : `clear()` efface tout un type d'un coup. La conservation par site s'obtient donc par instantané puis restauration — on lit les réglages des sites protégés, on efface le type entier, on réapplique. Les motifs à wildcard ne sont pas restaurables : `get()` exige une URL concrète.

**Files:**
- Create: `src/cleaners/siteSettings.ts`
- Test: `tests/cleaners/siteSettings.test.ts`

**Interfaces:**
- Consumes: `CategoryPlan`, `Cleaner`.
- Produces:
  - `type ContentSettingsApi = { contentSettings: Record<string, { get(details: { primaryUrl: string }): Promise<{ setting: string }>; set(details: object): Promise<void>; clear(details: { scope: string }): Promise<void> }> }`
  - `createSiteSettingsCleaner(api: ContentSettingsApi): Cleaner`
  - `MANAGED_TYPES: string[]` — les types de réglage pris en charge.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/cleaners/siteSettings.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { createSiteSettingsCleaner, MANAGED_TYPES } from '../../src/cleaners/siteSettings';
import type { CategoryPlan } from '../../src/core/planner';

function fakeApi(settings: Record<string, string> = {}) {
  const events: string[] = [];
  const contentSettings: Record<string, unknown> = {};

  for (const type of MANAGED_TYPES) {
    contentSettings[type] = {
      async get(details: { primaryUrl: string }) {
        return { setting: settings[`${type}:${details.primaryUrl}`] ?? 'default' };
      },
      async set(details: { primaryPattern: string; setting: string }) {
        events.push(`set ${type} ${details.primaryPattern} ${details.setting}`);
      },
      async clear() {
        events.push(`clear ${type}`);
      },
    };
  }

  return { events, api: { contentSettings } as never };
}

function plan(keepRules: CategoryPlan['keepRules']): CategoryPlan {
  return { category: 'siteSettings', since: 0, keepRules };
}

describe('createSiteSettingsCleaner', () => {
  it('annonce une finesse par origine', () => {
    expect(createSiteSettingsCleaner(fakeApi().api).perSite).toBe('origin');
  });

  it('efface chaque type géré quand rien n\'est protégé', async () => {
    const { api, events } = fakeApi();
    await createSiteSettingsCleaner(api).clean(plan([]));
    expect(events).toEqual(MANAGED_TYPES.map((type) => `clear ${type}`));
  });

  it('restaure les réglages non par défaut d\'un site protégé après effacement', async () => {
    const { api, events } = fakeApi({ 'notifications:https://github.com': 'allow' });
    await createSiteSettingsCleaner(api).clean(
      plan([{ pattern: 'github.com', keep: { siteSettings: true } }]),
    );
    expect(events.indexOf('clear notifications')).toBeLessThan(
      events.indexOf('set notifications https://github.com/* allow'),
    );
  });

  it('ne restaure pas un réglage resté par défaut', async () => {
    const { api, events } = fakeApi();
    await createSiteSettingsCleaner(api).clean(
      plan([{ pattern: 'github.com', keep: { siteSettings: true } }]),
    );
    expect(events.some((event) => event.startsWith('set '))).toBe(false);
  });

  it('avertit dans l\'aperçu que les motifs à wildcard ne sont pas restaurables', async () => {
    const preview = await createSiteSettingsCleaner(fakeApi().api).preview(
      plan([{ pattern: '*.github.com', keep: { siteSettings: true } }]),
    );
    expect(preview.note).toMatch(/wildcard/i);
  });

  it('compte les sites protégés restaurables dans l\'aperçu', async () => {
    const preview = await createSiteSettingsCleaner(fakeApi().api).preview(
      plan([
        { pattern: 'github.com', keep: { siteSettings: true } },
        { pattern: 'example.com', keep: { siteSettings: true } },
      ]),
    );
    expect(preview.items).toBe(2);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/cleaners/siteSettings.test.ts`
Expected: FAIL — `Cannot find module '../../src/cleaners/siteSettings'`.

- [ ] **Step 3: Écrire `src/cleaners/siteSettings.ts`**

```ts
import type { CategoryPlan } from '../core/planner';
import type { Cleaner, CleanReport, Preview } from '../core/types';

export const MANAGED_TYPES = [
  'notifications',
  'location',
  'camera',
  'microphone',
  'popups',
  'automaticDownloads',
];

type SettingApi = {
  get(details: { primaryUrl: string }): Promise<{ setting: string }>;
  set(details: { primaryPattern: string; setting: string; scope?: string }): Promise<void>;
  clear(details: { scope: string }): Promise<void>;
};

export type ContentSettingsApi = {
  contentSettings: Record<string, SettingApi>;
};

const WILDCARD_NOTE =
  "Les motifs à wildcard ne sont pas restaurables pour cette catégorie : l'API exige une URL concrète pour relire un réglage. Utilisez des motifs exacts pour les autorisations à conserver.";

function concreteHosts(plan: CategoryPlan): string[] {
  return plan.keepRules
    .map((rule) => rule.pattern.toLowerCase())
    .filter((pattern) => !pattern.includes('*'));
}

export function createSiteSettingsCleaner(api: ContentSettingsApi): Cleaner {
  return {
    id: 'siteSettings',
    perSite: 'origin',

    async preview(plan: CategoryPlan): Promise<Preview> {
      const hosts = concreteHosts(plan);
      const hasWildcard = plan.keepRules.some((rule) => rule.pattern.includes('*'));
      return {
        countable: false,
        items: hosts.length,
        note: hasWildcard ? WILDCARD_NOTE : undefined,
      };
    },

    async clean(plan: CategoryPlan): Promise<CleanReport> {
      const hosts = concreteHosts(plan);
      let restored = 0;
      let error: string | undefined;

      for (const type of MANAGED_TYPES) {
        const setting = api.contentSettings[type];
        if (setting === undefined) continue;

        const snapshot: { url: string; value: string }[] = [];
        try {
          for (const host of hosts) {
            const url = `https://${host}`;
            const current = await setting.get({ primaryUrl: url });
            if (current.setting !== 'default') snapshot.push({ url, value: current.setting });
          }

          await setting.clear({ scope: 'regular' });

          for (const entry of snapshot) {
            await setting.set({ primaryPattern: `${entry.url}/*`, setting: entry.value });
            restored += 1;
          }
        } catch (cause) {
          error ??= cause instanceof Error ? cause.message : String(cause);
        }
      }

      return {
        status: error === undefined ? 'ok' : 'partial',
        deleted: 0,
        kept: restored,
        error,
      };
    },
  };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/cleaners/siteSettings.test.ts && npm run typecheck`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cleaners/siteSettings.ts tests/cleaners/siteSettings.test.ts
git commit -m "feat: site settings cleaner via snapshot and restore"
```

---

### Task 9: Moteur et journal

**Files:**
- Create: `src/core/engine.ts`
- Test: `tests/core/engine.test.ts`

**Interfaces:**
- Consumes: `Cleaner`, `Preview`, `CleanReport`, `Plan`, `StorageArea`.
- Produces:
  - `type PreviewResult = { category: Category; preview: Preview }`
  - `type CategoryResult = { category: Category; report: CleanReport }`
  - `type RunRecord = { profileId: string; at: number; results: CategoryResult[] }`
  - `createEngine(cleaners: Cleaner[], area: StorageArea): Engine`
  - `Engine` expose `preview(plan: Plan): Promise<PreviewResult[]>`, `clean(plan: Plan, at: number): Promise<CategoryResult[]>`, `journal(): Promise<RunRecord[]>`
  - `JOURNAL_LIMIT = 20`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/core/engine.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { createEngine, JOURNAL_LIMIT } from '../../src/core/engine';
import type { StorageArea } from '../../src/core/profiles';
import type { Cleaner } from '../../src/core/types';
import type { Plan } from '../../src/core/planner';

function fakeArea(initial: Record<string, unknown> = {}): StorageArea {
  const data = { ...initial };
  return {
    async get(key: string) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
    },
  };
}

function fakeCleaner(id: Cleaner['id'], order: string[], deleted = 1): Cleaner {
  return {
    id,
    perSite: 'exact',
    async preview() {
      return { countable: true, items: deleted };
    },
    async clean() {
      order.push(id);
      return { status: 'ok', deleted, kept: 0 };
    },
  };
}

const plan: Plan = {
  profileId: 'p1',
  since: 0,
  categories: [
    { category: 'cookies', since: 0, keepRules: [] },
    { category: 'history', since: 0, keepRules: [] },
  ],
};

describe('createEngine', () => {
  it('n\'interroge que les cleaners présents dans le plan', async () => {
    const order: string[] = [];
    const engine = createEngine(
      [fakeCleaner('cookies', order), fakeCleaner('history', order), fakeCleaner('httpCache', order)],
      fakeArea(),
    );
    const previews = await engine.preview(plan);
    expect(previews.map((p) => p.category)).toEqual(['cookies', 'history']);
  });

  it('exécute les cleaners dans l\'ordre du plan', async () => {
    const order: string[] = [];
    const engine = createEngine([fakeCleaner('history', order), fakeCleaner('cookies', order)], fakeArea());
    await engine.clean(plan, 1000);
    expect(order).toEqual(['cookies', 'history']);
  });

  it('poursuit les autres cleaners quand l\'un jette', async () => {
    const order: string[] = [];
    const exploding: Cleaner = {
      id: 'cookies',
      perSite: 'exact',
      async preview() {
        return { countable: false, items: 0 };
      },
      async clean() {
        throw new Error('boum');
      },
    };
    const engine = createEngine([exploding, fakeCleaner('history', order)], fakeArea());
    const results = await engine.clean(plan, 1000);
    expect(results[0]!.report).toMatchObject({ status: 'failed', error: 'boum' });
    expect(results[1]!.report.status).toBe('ok');
    expect(order).toEqual(['history']);
  });

  it('signale une catégorie sans cleaner disponible', async () => {
    const engine = createEngine([fakeCleaner('cookies', [])], fakeArea());
    const results = await engine.clean(plan, 1000);
    expect(results[1]!.report).toMatchObject({ status: 'failed' });
    expect(results[1]!.report.error).toMatch(/aucun cleaner/i);
  });

  it('écrit le nettoyage au journal', async () => {
    const area = fakeArea();
    const engine = createEngine([fakeCleaner('cookies', []), fakeCleaner('history', [])], area);
    await engine.clean(plan, 1234);
    const journal = await engine.journal();
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ profileId: 'p1', at: 1234 });
  });

  it('garde le plus récent en tête et plafonne le journal', async () => {
    const area = fakeArea({
      runs: Array.from({ length: JOURNAL_LIMIT }, (_, i) => ({ profileId: `old${i}`, at: i, results: [] })),
    });
    const engine = createEngine([fakeCleaner('cookies', []), fakeCleaner('history', [])], area);
    await engine.clean(plan, 9999);
    const journal = await engine.journal();
    expect(journal).toHaveLength(JOURNAL_LIMIT);
    expect(journal[0]!.at).toBe(9999);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/core/engine.test.ts`
Expected: FAIL — `Cannot find module '../../src/core/engine'`.

- [ ] **Step 3: Écrire `src/core/engine.ts`**

```ts
import type { Plan } from './planner';
import type { StorageArea } from './profiles';
import type { Category, CleanReport, Cleaner, Preview } from './types';

export const JOURNAL_LIMIT = 20;
const KEY = 'runs';

export type PreviewResult = { category: Category; preview: Preview };
export type CategoryResult = { category: Category; report: CleanReport };
export type RunRecord = { profileId: string; at: number; results: CategoryResult[] };

export interface Engine {
  preview(plan: Plan): Promise<PreviewResult[]>;
  clean(plan: Plan, at: number): Promise<CategoryResult[]>;
  journal(): Promise<RunRecord[]>;
}

function missing(category: Category): CleanReport {
  return {
    status: 'failed',
    deleted: 0,
    kept: 0,
    error: `aucun cleaner disponible pour ${category}`,
  };
}

export function createEngine(cleaners: Cleaner[], area: StorageArea): Engine {
  const byId = new Map(cleaners.map((cleaner) => [cleaner.id, cleaner]));

  return {
    async preview(plan: Plan): Promise<PreviewResult[]> {
      return Promise.all(
        plan.categories.map(async (categoryPlan) => {
          const cleaner = byId.get(categoryPlan.category);
          if (cleaner === undefined) {
            return {
              category: categoryPlan.category,
              preview: { countable: false, items: 0, note: missing(categoryPlan.category).error },
            };
          }
          try {
            return { category: categoryPlan.category, preview: await cleaner.preview(categoryPlan) };
          } catch (cause) {
            return {
              category: categoryPlan.category,
              preview: {
                countable: false,
                items: 0,
                note: cause instanceof Error ? cause.message : String(cause),
              },
            };
          }
        }),
      );
    },

    async clean(plan: Plan, at: number): Promise<CategoryResult[]> {
      const results: CategoryResult[] = [];

      for (const categoryPlan of plan.categories) {
        const cleaner = byId.get(categoryPlan.category);
        if (cleaner === undefined) {
          results.push({ category: categoryPlan.category, report: missing(categoryPlan.category) });
          continue;
        }
        try {
          results.push({ category: categoryPlan.category, report: await cleaner.clean(categoryPlan) });
        } catch (cause) {
          results.push({
            category: categoryPlan.category,
            report: {
              status: 'failed',
              deleted: 0,
              kept: 0,
              error: cause instanceof Error ? cause.message : String(cause),
            },
          });
        }
      }

      const stored = await area.get(KEY);
      const previous = (stored[KEY] as RunRecord[] | undefined) ?? [];
      const record: RunRecord = { profileId: plan.profileId, at, results };
      await area.set({ [KEY]: [record, ...previous].slice(0, JOURNAL_LIMIT) });

      return results;
    },

    async journal(): Promise<RunRecord[]> {
      const stored = await area.get(KEY);
      return (stored[KEY] as RunRecord[] | undefined) ?? [];
    },
  };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/core/engine.test.ts && npm run typecheck`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/engine.ts tests/core/engine.test.ts
git commit -m "feat: engine orchestrating cleaners with run journal"
```

---

### Task 10: Registre des cleaners et service worker

Premier point du plan où le vrai objet `chrome` est touché. Tout ce qui précède reste testable sans navigateur.

**Files:**
- Create: `src/cleaners/index.ts`, `src/core/messages.ts`
- Modify: `src/background.ts` (remplacement complet)
- Test: `tests/cleaners/index.test.ts`

**Interfaces:**
- Consumes: tous les constructeurs de cleaners, `createEngine`, `createProfileStore`, `buildPlan`.
- Produces:
  - `buildCleaners(api: ChromeLike, knownHosts: OriginSource): Cleaner[]`
  - `collectKnownHosts(api: ChromeLike): Promise<string[]>`
  - `type Message = { type: 'LIST_PROFILES' } | { type: 'SAVE_PROFILE'; profile: Profile } | { type: 'DELETE_PROFILE'; id: string } | { type: 'PREVIEW'; profileId: string } | { type: 'CLEAN'; profileId: string } | { type: 'JOURNAL' } | { type: 'EXPORT' } | { type: 'IMPORT'; json: string }`
  - `type Response = { ok: true; data: unknown } | { ok: false; error: string }`

- [ ] **Step 1: Écrire le test du registre**

Créer `tests/cleaners/index.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { buildCleaners, collectKnownHosts } from '../../src/cleaners/index';
import { ALL_CATEGORIES } from '../../src/core/types';

function fakeChrome() {
  return {
    browsingData: { async remove() {} },
    cookies: {
      async getAll() {
        return [{ name: 'a', domain: '.github.com', path: '/', secure: true }];
      },
      async remove() {},
    },
    history: {
      async search() {
        return [{ url: 'https://example.com/a', lastVisitTime: 1 }];
      },
      async deleteUrl() {},
    },
    downloads: { async search() { return []; }, async erase() { return []; } },
    contentSettings: {},
  } as never;
}

describe('buildCleaners', () => {
  it('fournit un cleaner pour chaque catégorie déclarée', () => {
    const ids = buildCleaners(fakeChrome(), async () => []).map((cleaner) => cleaner.id);
    expect(ids.sort()).toEqual([...ALL_CATEGORIES].sort());
  });

  it('déclare la finesse réelle de chaque catégorie', () => {
    const byId = new Map(buildCleaners(fakeChrome(), async () => []).map((c) => [c.id, c.perSite]));
    expect(byId.get('cookies')).toBe('exact');
    expect(byId.get('localStorage')).toBe('origin');
    expect(byId.get('httpCache')).toBe('none');
    expect(byId.get('passwords')).toBe('none');
    expect(byId.get('formData')).toBe('none');
  });
});

describe('collectKnownHosts', () => {
  it('réunit les hôtes des cookies et de l\'historique, sans doublon', async () => {
    const hosts = await collectKnownHosts(fakeChrome());
    expect(hosts.sort()).toEqual(['example.com', 'github.com']);
  });

  it('ignore silencieusement une API indisponible', async () => {
    const partial = { cookies: { async getAll() { return []; } } } as never;
    expect(await collectKnownHosts(partial)).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/cleaners/index.test.ts`
Expected: FAIL — `Cannot find module '../../src/cleaners/index'`.

- [ ] **Step 3: Écrire `src/cleaners/index.ts`**

```ts
import { normalizeHost } from '../core/matcher';
import type { Cleaner } from '../core/types';
import { createCookiesCleaner } from './cookies';
import type { CookiesApi } from './cookies';
import { createCredentialsCleaner } from './credentials';
import { createDownloadsCleaner } from './downloads';
import type { DownloadsApi } from './downloads';
import { createHistoryCleaner, hostOf } from './history';
import type { HistoryApi } from './history';
import { createHttpCacheCleaner } from './httpCache';
import { createSiteSettingsCleaner } from './siteSettings';
import type { ContentSettingsApi } from './siteSettings';
import { createStorageCleaner } from './storage';
import type { BrowsingDataApi, OriginSource } from './storage';

export type ChromeLike = BrowsingDataApi &
  CookiesApi &
  Partial<HistoryApi> &
  Partial<DownloadsApi> &
  Partial<ContentSettingsApi>;

export async function collectKnownHosts(api: ChromeLike): Promise<string[]> {
  const hosts = new Set<string>();

  try {
    for (const cookie of await api.cookies.getAll({})) hosts.add(normalizeHost(cookie.domain));
  } catch {
    // API indisponible : on continue avec ce qu'on a.
  }

  try {
    const items = (await api.history?.search({ text: '', startTime: 0, maxResults: 5000 })) ?? [];
    for (const item of items) {
      const host = item.url === undefined ? null : hostOf(item.url);
      if (host !== null) hosts.add(host);
    }
  } catch {
    // Permission `history` non accordée : la liste reste partielle, c'est annoncé dans l'aperçu.
  }

  return [...hosts];
}

export function buildCleaners(api: ChromeLike, knownHosts: OriginSource): Cleaner[] {
  return [
    createCookiesCleaner(api),
    createStorageCleaner(api, 'localStorage', knownHosts),
    createStorageCleaner(api, 'indexedDB', knownHosts),
    createStorageCleaner(api, 'cacheStorage', knownHosts),
    createStorageCleaner(api, 'serviceWorkers', knownHosts),
    createHttpCacheCleaner(api),
    createHistoryCleaner(api as HistoryApi),
    createDownloadsCleaner(api as DownloadsApi),
    createCredentialsCleaner(api, 'formData'),
    createCredentialsCleaner(api, 'passwords'),
    createSiteSettingsCleaner(api as ContentSettingsApi),
  ];
}
```

- [ ] **Step 4: Écrire `src/core/messages.ts`**

```ts
import type { Profile } from './types';

export type Message =
  | { type: 'LIST_PROFILES' }
  | { type: 'SAVE_PROFILE'; profile: Profile }
  | { type: 'DELETE_PROFILE'; id: string }
  | { type: 'PREVIEW'; profileId: string }
  | { type: 'CLEAN'; profileId: string }
  | { type: 'JOURNAL' }
  | { type: 'EXPORT' }
  | { type: 'IMPORT'; json: string };

export type Response = { ok: true; data: unknown } | { ok: false; error: string };

export async function send(message: Message): Promise<unknown> {
  const response = (await chrome.runtime.sendMessage(message)) as Response;
  if (!response.ok) throw new Error(response.error);
  return response.data;
}
```

- [ ] **Step 5: Réécrire `src/background.ts`**

```ts
import { createEngine } from './core/engine';
import type { Message, Response } from './core/messages';
import { buildPlan } from './core/planner';
import { createProfileStore } from './core/profiles';
import { buildCleaners, collectKnownHosts } from './cleaners/index';
import type { ChromeLike } from './cleaners/index';

const api = chrome as unknown as ChromeLike;
const store = createProfileStore(chrome.storage.local);
const engine = createEngine(
  buildCleaners(api, () => collectKnownHosts(api)),
  chrome.storage.local,
);

async function profileById(id: string) {
  const profile = (await store.list()).find((candidate) => candidate.id === id);
  if (profile === undefined) throw new Error(`profil introuvable : ${id}`);
  return profile;
}

async function handle(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'LIST_PROFILES':
      return store.list();
    case 'SAVE_PROFILE':
      return store.save(message.profile);
    case 'DELETE_PROFILE':
      return store.remove(message.id);
    case 'PREVIEW':
      return engine.preview(buildPlan(await profileById(message.profileId), Date.now()));
    case 'CLEAN': {
      const now = Date.now();
      return engine.clean(buildPlan(await profileById(message.profileId), now), now);
    }
    case 'JOURNAL':
      return engine.journal();
    case 'EXPORT':
      return store.exportJson();
    case 'IMPORT':
      return store.importJson(message.json);
  }
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handle(message)
    .then((data) => sendResponse({ ok: true, data } satisfies Response))
    .catch((cause: unknown) =>
      sendResponse({
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause),
      } satisfies Response),
    );
  return true;
});
```

- [ ] **Step 6: Lancer les tests et le build**

Run: `npm test && npm run typecheck && npm run build`
Expected: tous PASS, `dist/background.js` produit.

- [ ] **Step 7: Commit**

```bash
git add src/cleaners/index.ts src/core/messages.ts src/background.ts tests/cleaners/index.test.ts
git commit -m "feat: cleaner registry and service worker message routing"
```

---

### Task 11: Popup — choisir, prévisualiser, confirmer

**Files:**
- Modify: `popup.html` (remplacement complet)
- Modify: `src/ui/popup/popup.ts` (remplacement complet)
- Create: `src/ui/popup/popup.css`, `src/ui/labels.ts`
- Test: `tests/ui/labels.test.ts`

**Interfaces:**
- Consumes: `send` de `src/core/messages.ts`, `PreviewResult`, `CategoryResult`.
- Produces:
  - `CATEGORY_LABELS: Record<Category, string>` dans `src/ui/labels.ts`
  - `formatPreview(result: PreviewResult): string`
  - `formatReport(result: CategoryResult): string`
  - `needsExtraConfirmation(categories: Category[]): boolean` — vrai si `passwords` ou `formData` est présent.

- [ ] **Step 1: Écrire les tests des libellés**

Créer `tests/ui/labels.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  CATEGORY_LABELS,
  formatPreview,
  formatReport,
  needsExtraConfirmation,
} from '../../src/ui/labels';
import { ALL_CATEGORIES } from '../../src/core/types';

describe('CATEGORY_LABELS', () => {
  it('nomme chaque catégorie', () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
    }
  });
});

describe('formatPreview', () => {
  it('affiche un décompte exact', () => {
    expect(formatPreview({ category: 'cookies', preview: { countable: true, items: 12 } })).toBe(
      'Cookies : 12 à supprimer',
    );
  });

  it('affiche le singulier au singulier', () => {
    expect(formatPreview({ category: 'cookies', preview: { countable: true, items: 1 } })).toBe(
      'Cookies : 1 à supprimer',
    );
  });

  it('affiche « non chiffrable » quand l\'API ne compte pas', () => {
    expect(
      formatPreview({ category: 'httpCache', preview: { countable: false, items: 0, note: 'tout ou rien' } }),
    ).toBe('Cache HTTP : non chiffrable — tout ou rien');
  });
});

describe('formatReport', () => {
  it('résume un nettoyage réussi', () => {
    expect(
      formatReport({ category: 'cookies', report: { status: 'ok', deleted: 3, kept: 2 } }),
    ).toBe('Cookies : 3 supprimé(s), 2 conservé(s)');
  });

  it('fait remonter l\'erreur d\'un nettoyage partiel', () => {
    expect(
      formatReport({
        category: 'history',
        report: { status: 'partial', deleted: 1, kept: 0, error: 'verrouillé' },
      }),
    ).toBe('Historique : 1 supprimé(s), 0 conservé(s) — échec partiel : verrouillé');
  });

  it('signale un échec complet', () => {
    expect(
      formatReport({
        category: 'passwords',
        report: { status: 'failed', deleted: 0, kept: 0, error: 'permission refusée' },
      }),
    ).toBe('Mots de passe : échec — permission refusée');
  });
});

describe('needsExtraConfirmation', () => {
  it('exige une confirmation pour les mots de passe', () => {
    expect(needsExtraConfirmation(['cookies', 'passwords'])).toBe(true);
  });

  it('exige une confirmation pour les données de formulaire', () => {
    expect(needsExtraConfirmation(['formData'])).toBe(true);
  });

  it('n\'exige rien pour les catégories ordinaires', () => {
    expect(needsExtraConfirmation(['cookies', 'httpCache'])).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/ui/labels.test.ts`
Expected: FAIL — `Cannot find module '../../src/ui/labels'`.

- [ ] **Step 3: Écrire `src/ui/labels.ts`**

```ts
import type { CategoryResult, PreviewResult } from '../core/engine';
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
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run tests/ui/labels.test.ts`
Expected: 10 tests PASS.

- [ ] **Step 5: Écrire `popup.html`**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Cookies Manager</title>
    <link rel="stylesheet" href="/src/ui/popup/popup.css" />
  </head>
  <body>
    <h1>Nettoyage</h1>
    <ul id="profiles"></ul>
    <section id="preview" hidden>
      <h2>Aperçu</h2>
      <ul id="preview-list"></ul>
      <label id="danger" hidden>
        <input type="checkbox" id="danger-check" />
        Je confirme la suppression des mots de passe ou des données de formulaire. Cette action est
        définitive.
      </label>
      <button id="confirm" type="button">Nettoyer</button>
      <button id="cancel" type="button">Annuler</button>
    </section>
    <section id="report" hidden>
      <h2>Rapport</h2>
      <ul id="report-list"></ul>
    </section>
    <a href="options.html" target="_blank">Configurer les profils</a>
    <script type="module" src="/src/ui/popup/popup.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Écrire `src/ui/popup/popup.css`**

```css
body {
  font: 13px/1.5 system-ui, sans-serif;
  margin: 0;
  padding: 12px;
  width: 320px;
}

h1 { font-size: 15px; margin: 0 0 8px; }
h2 { font-size: 13px; margin: 12px 0 4px; }
ul { list-style: none; margin: 0; padding: 0; }

#profiles li button {
  width: 100%;
  text-align: left;
  padding: 8px;
  margin-bottom: 4px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: none;
  cursor: pointer;
}

#profiles li button:hover { background: #f2f2f2; }
#preview-list li, #report-list li { padding: 2px 0; }
#danger { display: block; margin: 8px 0; color: #a00; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 7: Écrire `src/ui/popup/popup.ts`**

Les permissions optionnelles se demandent depuis la popup et jamais depuis le service worker : `chrome.permissions.request` exige un geste utilisateur.

```ts
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
    render(previewList, ['Permissions refusées : ce profil ne peut pas s\'exécuter.']);
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
```

- [ ] **Step 8: Vérifier dans le navigateur**

Run: `npm run build`, puis recharger l'extension dans `chrome://extensions`.
Expected: la popup liste « Nettoyage léger » et « Nettoyage complet ». Un clic affiche un aperçu chiffré pour les cookies. « Annuler » referme l'aperçu sans rien supprimer.

- [ ] **Step 9: Commit**

```bash
git add popup.html src/ui tests/ui
git commit -m "feat: popup with preview, danger confirmation and report"
```

---

### Task 12: Page d'options — éditeur de profils et de keep-list

**Files:**
- Modify: `options.html` (remplacement complet)
- Modify: `src/ui/options/options.ts` (remplacement complet)
- Create: `src/ui/options/options.css`, `src/ui/options/grid.ts`
- Test: `tests/ui/grid.test.ts`

**Interfaces:**
- Consumes: `CATEGORY_LABELS`, `ALL_CATEGORIES`, `buildCleaners` (uniquement pour lire `perSite`), `send`.
- Produces:
  - `PER_SITE: Record<Category, 'exact' | 'origin' | 'none'>` dans `src/ui/options/grid.ts` — table statique, source de vérité de l'interface pour griser les cases.
  - `cellState(category: Category, checked: boolean): { disabled: boolean; title: string }`
  - `toggleRule(rules: KeepRule[], pattern: string, category: Category, checked: boolean): KeepRule[]`

- [ ] **Step 1: Écrire les tests de la grille**

Créer `tests/ui/grid.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { PER_SITE, cellState, toggleRule } from '../../src/ui/options/grid';
import { ALL_CATEGORIES } from '../../src/core/types';
import type { KeepRule } from '../../src/core/types';

describe('PER_SITE', () => {
  it('déclare une finesse pour chaque catégorie', () => {
    for (const category of ALL_CATEGORIES) expect(PER_SITE[category]).toBeDefined();
  });

  it('correspond aux limites réelles de l\'API', () => {
    expect(PER_SITE.cookies).toBe('exact');
    expect(PER_SITE.httpCache).toBe('none');
    expect(PER_SITE.passwords).toBe('none');
    expect(PER_SITE.formData).toBe('none');
  });
});

describe('cellState', () => {
  it('grise une catégorie sans exclusion possible', () => {
    const state = cellState('httpCache', false);
    expect(state.disabled).toBe(true);
    expect(state.title).toMatch(/API/i);
  });

  it('laisse une catégorie exclusible modifiable', () => {
    expect(cellState('cookies', false).disabled).toBe(false);
  });
});

describe('toggleRule', () => {
  it('crée une règle quand le motif est absent', () => {
    const rules = toggleRule([], 'github.com', 'cookies', true);
    expect(rules).toEqual([{ pattern: 'github.com', keep: { cookies: true } }]);
  });

  it('ajoute une catégorie à une règle existante', () => {
    const initial: KeepRule[] = [{ pattern: 'github.com', keep: { cookies: true } }];
    const rules = toggleRule(initial, 'github.com', 'history', true);
    expect(rules[0]!.keep).toEqual({ cookies: true, history: true });
  });

  it('retire une catégorie sans toucher aux autres', () => {
    const initial: KeepRule[] = [{ pattern: 'github.com', keep: { cookies: true, history: true } }];
    const rules = toggleRule(initial, 'github.com', 'history', false);
    expect(rules[0]!.keep).toEqual({ cookies: true });
  });

  it('supprime la règle devenue vide', () => {
    const initial: KeepRule[] = [{ pattern: 'github.com', keep: { cookies: true } }];
    expect(toggleRule(initial, 'github.com', 'cookies', false)).toEqual([]);
  });

  it('ne modifie pas le tableau d\'origine', () => {
    const initial: KeepRule[] = [{ pattern: 'github.com', keep: { cookies: true } }];
    toggleRule(initial, 'github.com', 'history', true);
    expect(initial[0]!.keep).toEqual({ cookies: true });
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/ui/grid.test.ts`
Expected: FAIL — `Cannot find module '../../src/ui/options/grid'`.

- [ ] **Step 3: Écrire `src/ui/options/grid.ts`**

```ts
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
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run tests/ui/grid.test.ts`
Expected: 9 tests PASS.

- [ ] **Step 5: Écrire `options.html`**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Cookies Manager — options</title>
    <link rel="stylesheet" href="/src/ui/options/options.css" />
  </head>
  <body>
    <h1>Profils de nettoyage</h1>
    <select id="profile-select"></select>
    <button id="new-profile" type="button">Nouveau profil</button>
    <button id="delete-profile" type="button">Supprimer</button>

    <form id="editor">
      <label>Nom <input type="text" id="name" required /></label>
      <label>
        Période
        <select id="since">
          <option value="hour">Dernière heure</option>
          <option value="day">Dernier jour</option>
          <option value="week">Dernière semaine</option>
          <option value="month">Dernier mois</option>
          <option value="all">Tout</option>
        </select>
      </label>

      <h2>Catégories nettoyées</h2>
      <div id="categories"></div>

      <h2>Sites conservés</h2>
      <p class="hint">
        Motifs acceptés : <code>github.com</code> (hôte exact), <code>*.github.com</code>
        (sous-domaines inclus), <code>*</code> (tous les sites). Les cases grisées correspondent aux
        catégories que l'API navigateur ne sait pas exclure par site.
      </p>
      <table id="keeplist"></table>
      <input type="text" id="new-pattern" placeholder="exemple.com" />
      <button id="add-pattern" type="button">Ajouter un site</button>

      <button type="submit">Enregistrer</button>
    </form>

    <h2>Sauvegarde de la configuration</h2>
    <button id="export" type="button">Exporter en JSON</button>
    <textarea id="import-area" placeholder="Coller un JSON de profils ici"></textarea>
    <button id="import" type="button">Importer</button>
    <p id="status" role="status"></p>

    <script type="module" src="/src/ui/options/options.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Écrire `src/ui/options/options.css`**

```css
body { font: 14px/1.6 system-ui, sans-serif; margin: 24px auto; max-width: 900px; padding: 0 16px; }
h1 { font-size: 20px; }
h2 { font-size: 16px; margin-top: 24px; }
label { display: block; margin: 8px 0; }
table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: center; font-size: 12px; }
th:first-child, td:first-child { text-align: left; }
input[disabled] { cursor: not-allowed; }
td.disabled { background: #f5f5f5; }
.hint { color: #555; font-size: 12px; }
textarea { display: block; width: 100%; height: 120px; margin: 8px 0; font-family: monospace; }
#status { min-height: 1.6em; color: #060; }
```

- [ ] **Step 7: Écrire `src/ui/options/options.ts`**

```ts
import { send } from '../../core/messages';
import { ALL_CATEGORIES } from '../../core/types';
import type { Category, Profile, Since } from '../../core/types';
import { CATEGORY_LABELS } from '../labels';
import { PER_SITE, cellState, toggleRule } from './grid';

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
  select.replaceChildren(
    ...profiles.map((profile) => new Option(profile.name, profile.id)),
  );
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
  const pattern = newPattern.value.trim();
  if (pattern === '' || current === null) return;
  if (current.keepRules.some((rule) => rule.pattern === pattern)) return;
  current.keepRules = [...current.keepRules, { pattern, keep: { cookies: true } }];
  newPattern.value = '';
  renderKeeplist();
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

void reload();
```

- [ ] **Step 8: Vérifier dans le navigateur**

Run: `npm run build`, recharger l'extension, ouvrir la page d'options.
Expected: la grille affiche une colonne par catégorie ; les colonnes Cache HTTP, Mots de passe et Données de formulaire sont grisées avec une infobulle expliquant pourquoi. Ajouter `github.com`, cocher Cookies, enregistrer, rouvrir la page : la ligne est toujours là.

- [ ] **Step 9: Lancer la suite complète**

Run: `npm test && npm run typecheck && npm run build`
Expected: tous PASS.

- [ ] **Step 10: Commit**

```bash
git add options.html src/ui/options tests/ui/grid.test.ts
git commit -m "feat: options page with keep-list grid and json backup"
```

---

### Task 13: Documentation et recette manuelle

**Files:**
- Create: `README.md`, `docs/recette-manuelle.md`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: rien de logiciel.

- [ ] **Step 1: Écrire `README.md`**

```markdown
# Cookies Manager

Extension Chrome et Brave qui supprime les données de navigation avec une
keep-list par site, croisée avec les catégories de données.

## Installation en développement

```bash
npm install
npm run build
```

Puis `chrome://extensions` → mode développeur → « Charger l'extension non
empaquetée » → choisir `dist/`.

## Développement

| Commande | Effet |
|---|---|
| `npm test` | Suite Vitest, sans navigateur |
| `npm run typecheck` | Vérification TypeScript |
| `npm run build` | Produit `dist/` |

## Ce que l'API navigateur ne permet pas

Trois limites viennent de Chrome, pas de cette extension :

- **Cache HTTP** : aucune exclusion par site. C'est tout ou rien.
- **Mots de passe et données de formulaire** : aucune exclusion par site,
  et suppression définitive. Ces catégories ne figurent dans aucun profil
  par défaut.
- **Cookies supprimés un par un** : le filtre de période ne s'applique pas,
  l'API ne fournit pas la date de création d'un cookie.

Deux limites supplémentaires, plus fines :

- **Stockage web** : l'aperçu est un minorant. Aucune API n'énumère les
  origines qui stockent des données ; la liste affichée est dérivée des
  cookies et de l'historique.
- **Autorisations de site** : la conservation passe par un instantané puis
  une restauration. Les motifs à wildcard ne sont pas restaurables, l'API
  exigeant une URL concrète pour relire un réglage.

## Vie privée

Aucune requête réseau, aucune télémétrie, aucune dépendance runtime. Les
profils restent dans `chrome.storage.local` et ne sont jamais synchronisés.
```

- [ ] **Step 2: Écrire `docs/recette-manuelle.md`**

```markdown
# Recette manuelle

À jouer avant chaque publication, sur un profil de navigateur de test.

## Préparation

1. Créer un profil Chrome dédié.
2. Se connecter à deux sites qui posent des cookies de session, par exemple
   `github.com` et un autre de votre choix.
3. Visiter trois ou quatre sites supplémentaires pour peupler l'historique.
4. Charger `dist/` comme extension non empaquetée.

## Scénario 1 — la keep-list protège une session

1. Options → nouveau profil, période « Tout », catégories : cookies,
   stockage local, historique.
2. Ajouter le site `github.com`, cocher Cookies et Stockage local.
3. Enregistrer, ouvrir la popup, lancer l'aperçu.
4. Vérifier que le décompte des cookies exclut ceux de `github.com`.
5. Nettoyer, puis recharger `github.com`.

Attendu : la session est intacte, les autres sites sont déconnectés.

## Scénario 2 — le wildcard couvre les sous-domaines

1. Remplacer le motif par `*.github.com`, garder Cookies coché.
2. Visiter `gist.github.com`, nettoyer.

Attendu : les cookies de `gist.github.com` survivent aussi.

## Scénario 3 — les catégories dangereuses sont verrouillées

1. Créer un profil incluant les mots de passe.
2. Ouvrir la popup et lancer l'aperçu.

Attendu : le bouton « Nettoyer » est désactivé tant que la case de
confirmation rouge n'est pas cochée.

## Scénario 4 — les permissions optionnelles sont demandées

1. Retirer la permission `history` dans `chrome://extensions` → détails.
2. Lancer un profil qui inclut l'historique.

Attendu : le navigateur demande la permission ; un refus affiche un message
d'échec sans rien supprimer.

## Scénario 5 — le journal enregistre

1. Après un nettoyage, ouvrir la console du service worker.
2. Lire `chrome.storage.local.get('runs')`.

Attendu : le nettoyage figure en tête, le journal ne dépasse pas 20 entrées.
```

- [ ] **Step 3: Vérifier l'état final**

Run: `npm test && npm run typecheck && npm run build`
Expected: tous PASS, `dist/` produit.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/recette-manuelle.md
git commit -m "docs: readme and manual test recipe"
```

---

## Notes de correction par rapport à la spec

Deux points de la spec se sont révélés inexacts en préparant le plan. Ils
sont corrigés ici et doivent être reportés dans le document de spec :

1. **Autorisations de site.** La spec annonçait une finesse « par motif » via
   `chrome.contentSettings`. En réalité `clear()` efface un type entier et
   aucune suppression par motif n'existe. La Task 8 obtient la conservation
   par instantané puis restauration, au prix d'une limite : les motifs à
   wildcard ne sont pas restaurables.

2. **Période et cookies.** Supprimer les cookies un par un donne la finesse
   au nom près mais perd le filtre de période : `chrome.cookies.Cookie`
   n'expose pas de date de création. L'aperçu l'annonce explicitement quand
   la période n'est pas « Tout ».

3. **Renommage.** La catégorie appelée `permissions` dans la spec s'appelle
   `siteSettings` dans le plan : `chrome.permissions` désigne déjà les
   permissions de l'extension elle-même, et la collision de noms serait une
   source de bugs.

---

### Task 14: Coffre de cookies (optionnel, désactivé par défaut)

Ajouté après la seconde session de conception. Voir la section « Coffre de
cookies » de la spec. À implémenter **après** la Task 13 : le coffre est une
greffe sur un produit qui doit d'abord fonctionner sans lui.

**Files:**
- Create: `src/core/vault.ts`
- Test: `tests/core/vault.test.ts`
- Modify: `src/core/engine.ts`, `src/ui/options/options.ts`, `src/ui/popup/popup.ts`

**Interfaces:**
- Consumes : `StorageArea`, `chrome.cookies.Cookie`, `SubtleCrypto` (injecté).
- Produces :
  - `type VaultRecord = { version: 1; salt: string; iv: string; iterations: number; cipher: string; createdAt: number; cookieCount: number; domains: string[] }`
  - `createVault(subtle: SubtleCrypto, area: StorageArea): Vault`
  - `Vault` expose :
    - `store(cookies: Cookie[], passphrase: string, at: number): Promise<void>`
    - `read(passphrase: string): Promise<Cookie[]>`
    - `describe(): Promise<Omit<VaultRecord, 'cipher' | 'salt' | 'iv'> | null>`
    - `purgeExpired(now: number, retentionDays: number): Promise<boolean>`
    - `clear(): Promise<void>`
  - `VAULT_KEY = 'vault'`, `DEFAULT_RETENTION_DAYS = 7`, `PBKDF2_ITERATIONS`

**Contraintes propres à cette tâche :**
- `AES-256-GCM`, clé dérivée par `PBKDF2-SHA-256`, sel et vecteur d'initialisation
  aléatoires par écriture. La clé n'est jamais persistée.
- Le coffre va dans `chrome.storage.local`. Jamais dans `sync`.
- `describe()` ne rend que des métadonnées : jamais de valeur de cookie, jamais
  le sel ni le vecteur d'initialisation.
- Une phrase secrète fausse doit produire une erreur distincte d'un coffre absent
  ou d'un coffre corrompu — l'interface a trois messages différents à afficher.
- Le coffre est désactivé par défaut : `vaultEnabled: false` dans les réglages.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/core/vault.test.ts`. Utiliser le `webcrypto` de `node:crypto` comme
`SubtleCrypto` injecté et le `fakeArea` déjà employé dans `tests/core/engine.test.ts`.
Cas obligatoires :

- Aller-retour : `store` puis `read` avec la bonne phrase rend les cookies identiques.
- Mauvaise phrase : `read` rejette avec l'erreur « phrase incorrecte », et ne rend
  jamais de données partielles.
- Coffre absent : `read` et `describe` distinguent ce cas d'une phrase fausse.
- Deux `store` successifs avec la même phrase produisent des chiffrés différents
  (sel et vecteur d'initialisation aléatoires).
- `describe` ne contient ni `cipher`, ni `salt`, ni `iv`, ni aucune valeur de cookie.
- `purgeExpired` supprime au-delà de la rétention, conserve en deçà, et rend un
  booléen indiquant s'il a supprimé.
- `store` écrit bien sous `VAULT_KEY` dans l'aire de stockage, et nulle part ailleurs.

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

- [ ] **Step 3: Écrire `src/core/vault.ts`**

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

- [ ] **Step 5: Brancher le coffre dans `src/core/engine.ts`**

Quand le coffre est actif et que le plan comporte la catégorie `cookies` :
l'aperçu exact des cookies condamnés est calculé avant suppression, puis remis au
coffre. **Si `store` échoue, la catégorie `cookies` est marquée `failed` et ses
cookies ne sont pas supprimés ; les autres catégories poursuivent normalement.**
Test dédié à ce chemin d'échec — c'est la garantie centrale de la fonctionnalité.

- [ ] **Step 6: Interface**

Options : case d'activation, champ de rétention, avertissement sur la nature du
coffre (jetons de session) et sur la perte définitive en cas de phrase oubliée,
bouton de restauration, bouton de suppression du coffre.
Popup : demande de la phrase avant lancement si le coffre est actif, et mention
dans l'aperçu que seuls les cookies sont sauvegardés.

- [ ] **Step 7: Lancer la suite complète**

- [ ] **Step 8: Commit**
