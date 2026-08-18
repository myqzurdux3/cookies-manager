# Audit — Cookies Manager

Audit démarré le 2026-08-18 sur `main` @ `8a3cc39`.

---

## Phase 0 — Cartographie

### Structure

| Élément             | Détail                                                                             |
| ------------------- | ---------------------------------------------------------------------------------- |
| Type                | Extension Chrome / Brave, Manifest V3                                              |
| Langage             | TypeScript 5.9 (`strict`, `noUncheckedIndexedAccess`), ES2022, modules ESM         |
| Build               | Vite 5.4 → `dist/` (3 entrées : `popup.html`, `options.html`, `src/background.ts`) |
| Tests               | Vitest 2.1.9, environnement `node`, `tests/**/*.test.ts`                           |
| Dépendances runtime | **aucune**                                                                         |
| Dépendances dev     | `typescript`, `vite`, `vitest`, `@types/chrome`                                    |
| Outil annexe        | `tools/make-icons.py` (Pillow, hors chaîne de build, exécution manuelle)           |

### Points d'entrée

- `src/background.ts` — service worker MV3. Routeur de messages, propriétaire de tout l'état.
- `src/ui/popup/popup.ts` — popup : choix du profil, aperçu, confirmation, rapport.
- `src/ui/options/options.ts` — page d'options : profils, keep-list, coffre, import/export.
- `public/manifest.json` — permissions de base `browsingData`, `cookies`, `storage` ;
  optionnelles `history`, `downloads`, `contentSettings`.

### Couches

```
ui/{popup,options}  ──messages──▶  background.ts
                                     │
                    core/{profiles,settings,vault}  (persistance)
                    core/planner ──▶ core/engine ──▶ cleaners/*
                    core/{matcher,patterns}         (règles keep-list)
```

### Commandes

| Commande            | Effet                  | État vérifié le 2026-08-18                      |
| ------------------- | ---------------------- | ----------------------------------------------- |
| `npm install`       | Installe les dev-deps  | OK                                              |
| `npm test`          | Vitest                 | **198 tests / 17 fichiers, tous verts, 1,84 s** |
| `npm run typecheck` | `tsc --noEmit`         | **0 erreur**                                    |
| `npm run build`     | `vite build` → `dist/` | **OK, 380 ms, 28 modules**                      |

### Couverture (v8, mesurée pour cet audit — pas dans le dépôt)

| Zone                                         | Stmts                          |
| -------------------------------------------- | ------------------------------ |
| Global                                       | **62,63 %** (branches 90,14 %) |
| `src/core`                                   | 94,21 %                        |
| `src/cleaners`                               | 92,45 %                        |
| `src/ui/labels.ts`, `src/ui/options/grid.ts` | 100 %                          |
| `src/background.ts`                          | **0 %**                        |
| `src/ui/popup/popup.ts`                      | **0 %**                        |
| `src/ui/options/options.ts`                  | **0 %**                        |
| `src/core/messages.ts`                       | **0 %**                        |

La logique pure est bien couverte ; tout ce qui touche directement `chrome.*` ou le DOM
ne l'est pas du tout. C'est là que se concentrent les risques non détectés par la suite.

### Base saine ?

**Oui.** Build, typecheck et tests passent avant toute modification. Le refactoring peut
commencer.

### Réserves de la phase 0

- `npm audit` : 5 vulnérabilités (1 critique, 1 haute, 3 modérées), **toutes en dev-only**
  (`vite`, `esbuild`, `vitest`, `vite-node`). Aucune n'atteint le code livré dans `dist/`.
  Détail en phase 1.
- La couverture n'est pas mesurée par le dépôt : `@vitest/coverage-v8` n'est pas déclaré.

---

## Phase 1 — Défauts relevés (lecture seule, rien n'a été corrigé)

Méthode : lecture ligne à ligne des 19 fichiers de `src/`, plus quatre analyses parallèles
(sémantique réelle des API Chrome contre `developer.chrome.com`, code mort, qualité de la
suite de tests, secrets dans l'historique Git).

Colonne **Confiance** : `certain` = démontré par le code ou une citation de la doc ;
`probable` = raisonnement solide mais non exécuté dans un vrai navigateur ;
`à vérifier` = hypothèse à mesurer ou à tester en conditions réelles.

### Bloquant

| Fichier:ligne                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                       | Correction proposée                                                                                                                                                                | Confiance  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `src/cleaners/siteSettings.ts:73` | `contentSettings.<type>.clear({scope:'regular'})` n'efface que les règles posées **par cette extension**, pas les autorisations accordées par l'utilisateur dans Chrome. La catégorie « Autorisations de site » ne supprime donc probablement rien de ce que l'utilisateur croit supprimer. Tout le design (instantané → `clear` → restauration) repose sur cette prémisse, écrite noir sur blanc dans le plan (`docs/superpowers/plans/…:1822`). | Si confirmé : retirer la catégorie ou la requalifier honnêtement dans l'interface et le README. Aucune API d'extension ne permet de retirer une exception posée par l'utilisateur. | à vérifier |

### Majeur

| Fichier:ligne                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                        | Correction proposée                                                                                                      | Confiance  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `src/cleaners/storage.ts:65`                  | `clean()` rend `{status:'ok', deleted:0, kept:0}` **sans** `countable:false`, contrairement à `httpCache.ts:20` et `credentials.ts:27`. Résultat : après avoir vidé tout le stockage local, l'interface affiche « 0 supprimé(s) · 0 conservé(s) » au lieu de « vidé entièrement » — exactement le contresens que le commentaire de `types.ts:57-61` dit vouloir empêcher. Fausse aussi `runSummary().wiped`, qui sous-compte de 4. | Ajouter `countable: false`. Test d'abord.                                                                                | certain    |
| `src/cleaners/downloads.ts:24`                | `downloads.search()` est appelé sans `limit`. La valeur par défaut documentée est **1000** ; `0` signifie « sans limite ». Au-delà de 1000 téléchargements, les plus anciens ne sont ni comptés ni effacés, en silence.                                                                                                                                                                                                            | `query()` doit passer `limit: 0`.                                                                                        | certain    |
| `src/cleaners/cookies.ts:43`                  | `cookies.getAll({})` ne rend **pas** les cookies partitionnés (CHIPS) : `partitionKey` est requis. Ces cookies ne sont ni prévisualisés, ni supprimés, ni sauvegardés dans le coffre.                                                                                                                                                                                                                                              | À court terme : le documenter comme limite. À terme : énumérer les partitions.                                           | certain    |
| `src/cleaners/siteSettings.ts:70`             | `if (current.setting !== 'default')` — `contentSettings.get()` ne rend jamais `'default'` : il rend la valeur effective (`ask`, `block`, `allow`). La condition est donc toujours vraie, et le nettoyage réécrit le défaut du navigateur en règle explicite pour chaque hôte conservé.                                                                                                                                             | Comparer au défaut réel du type, ou ne restaurer que ce qui diffère d'une liste de défauts connus.                       | probable   |
| `src/background.ts:48`                        | `() => collectKnownHosts(api)` n'est pas mémoïsé. `protectedOrigins` l'appelle une fois **par règle à wildcard**, et `engine.preview` lance les 4 cleaners de stockage en `Promise.all`. Profil « complet » + 3 règles wildcard = 12 `collectKnownHosts()` concurrents, chacun faisant un `cookies.getAll({})` plus un `history.search({maxResults: 5000})`.                                                                       | Mémoïser une seule promesse par exécution.                                                                               | certain    |
| `src/background.ts:25`                        | `pendingPassphrase` est une variable de module, posée avant `engine.clean` et remise à `null` dans le `finally`. Deux messages `CLEAN` concurrents (deux fenêtres de popup) se marchent dessus : la phrase de l'un peut chiffrer le coffre de l'autre, ou disparaître en cours de route.                                                                                                                                           | Passer la phrase en argument jusqu'au callback `backup` au lieu d'un état de module ; sérialiser les nettoyages.         | probable   |
| `src/core/vault.ts:137`                       | `store()` écrase l'unique enregistrement du coffre. Un second nettoyage détruit la sauvegarde du premier avant que l'utilisateur ait pu restaurer. Rien ne l'annonce, et le README promet une restauration « pendant sept jours ».                                                                                                                                                                                                 | Refuser d'écraser un coffre non restauré sans confirmation explicite, ou le documenter clairement.                       | certain    |
| `src/background.ts:100`                       | `vault.purgeExpired` n'est appelé que dans le handler `CLEAN`. Si l'utilisateur ne relance jamais de nettoyage, un coffre de jetons de session survit indéfiniment au-delà de sa rétention. La promesse de rétention n'est pas tenue.                                                                                                                                                                                              | Purger aussi sur `chrome.runtime.onStartup`/`onInstalled`, ou via `chrome.alarms`.                                       | certain    |
| `src/cleaners/history.ts:82`                  | `history.deleteUrl({url})` supprime **toutes** les visites de cette URL, sans borne de temps. Un profil « dernière heure » efface donc aussi les visites d'il y a six mois pour les URL touchées dans l'heure. Non documenté.                                                                                                                                                                                                      | Documenter la limite ; `deleteRange` borne le temps mais ne sait pas exclure de site — le compromis doit être explicite. | à vérifier |
| `src/ui/popup/popup.ts:92,128,160`            | `await send(...)` sans `try/catch`. Une erreur du service worker devient un rejet non capturé : la popup reste figée, `confirmBtn` désactivé (`:127`), sans message. Même trou dans `options.ts` : `:160` `reload`, `:185` suppression de profil, `:229` export, `:256` `loadSettings`, `:296` suppression du coffre.                                                                                                              | Envelopper chaque appel et afficher l'erreur.                                                                            | certain    |
| `src/ui/options/options.ts:295`               | « Supprimer le coffre » agit au premier clic, sans confirmation, et l'action est irréversible.                                                                                                                                                                                                                                                                                                                                     | Demander une confirmation.                                                                                               | certain    |
| `src/cleaners/httpCache.ts:6`, `README.md:51` | Le code, l'interface et le README affirment tous que le cache HTTP est « tout ou rien ». La doc `browsingData` liste pourtant `cache` parmi les types qui acceptent `origins`/`excludeOrigins`.                                                                                                                                                                                                                                    | Si confirmé : supporter l'exclusion par origine pour le cache, corriger les trois textes.                                | à vérifier |
| `src/cleaners/credentials.ts:26`              | La suppression des mots de passe par extension serait retirée depuis Chrome 144. La catégorie afficherait alors « vidé entièrement » sans rien vider — le pire résultat pour une case marquée « définitif ».                                                                                                                                                                                                                       | Si confirmé : retirer la catégorie `passwords` ou l'annoncer indisponible.                                               | à vérifier |

### Mineur

| Fichier:ligne                         | Description                                                                                                                                                                                                                                                                                                                             | Correction proposée                                                                                 | Confiance  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------- |
| `src/core/engine.ts:113-116`          | Journal en lecture-modification-écriture sans verrou : deux nettoyages concurrents perdent une entrée. De plus, si `runs` est corrompu et n'est pas un tableau, `[record, ...previous]` jette **après** la suppression : l'interface annonce un échec alors que les données ont bien disparu.                                           | Valider `previous` avant l'étalement.                                                               | certain    |
| `src/cleaners/history.ts:42-43`       | `oldest = Math.min(...page.map((i) => i.lastVisitTime ?? 0))` : un seul élément sans `lastVisitTime` donne `0`, ce qui rompt la pagination et laisse le reste de l'historique en place, en silence.                                                                                                                                     | Ignorer les éléments sans date au lieu de les compter comme `0`.                                    | probable   |
| `src/cleaners/history.ts:33-45`       | La pagination suppose que `endTime` est **exclusif**. La doc Chrome ne le dit nulle part. Si `endTime` était inclusif, `oldest === endTime` couperait la boucle à 1000 entrées.                                                                                                                                                         | Dédupliquer par URL et sortir sur « aucune URL nouvelle » plutôt que sur une comparaison de bornes. | à vérifier |
| `src/core/settings.ts:43-46`          | `get()` accepte n'importe quel `number` : `NaN`, `Infinity`, `0`, négatif, décimal. `save()` valide, `get()` non. Un store abîmé donne `purgeExpired(now, NaN)`, dont la comparaison est toujours fausse : le coffre n'est jamais purgé.                                                                                                | Appliquer les mêmes bornes à la lecture, avec repli sur le défaut.                                  | certain    |
| `src/cleaners/siteSettings.ts:73-78`  | `clear()` puis `set()` : si `clear` réussit et `set` échoue, l'autorisation est perdue définitivement. `error ??=` ne garde que la première erreur, les suivantes sont avalées.                                                                                                                                                         | Rapporter les échecs par hôte plutôt qu'un seul message.                                            | certain    |
| `src/core/patterns.ts`                | Aucun traitement des noms de domaine internationalisés. `münchen.de` est accepté comme motif, mais les domaines de cookies sont en punycode (`xn--mnchen-3ya.de`) : le motif ne protège rien, sans le dire. C'est précisément le mode de défaillance que ce module dit exister pour empêcher.                                           | Normaliser via `new URL()` pour obtenir la forme punycode.                                          | probable   |
| `src/core/messages.ts:10`             | Le message `JOURNAL` n'a **aucun** consommateur dans l'interface. Le journal est écrit à chaque nettoyage et n'est lisible que depuis la console du service worker (`docs/recette-manuelle.md`, scénario 6).                                                                                                                            | Soit exposer le journal, soit assumer qu'il est interne.                                            | certain    |
| `src/core/types.ts:33`                | `KeepRule.keepCookies` est honoré par `matcher.cookieProtection` mais aucune interface ne peut le poser : `options.ts:204` écrit toujours `keep: {cookies: true}` sans lui. Atteignable uniquement par l'import JSON — contrat implicite non documenté.                                                                                 | Documenter, ou construire l'interface, ou retirer le champ.                                         | certain    |
| `package.json:17-19`                  | `allowScripts` n'est lu par aucun gestionnaire : c'est de la configuration `@lavamoat/allow-scripts`, et même là elle irait sous `lavamoat.allowScripts`. Inerte, mais lisible comme un garde-fou de sécurité actif.                                                                                                                    | Supprimer.                                                                                          | certain    |
| —                                     | `npm audit` : 5 vulnérabilités (1 critique `vitest`, 1 haute `vite`, 3 modérées). Toutes en dev-only, aucune n'atteint `dist/` : l'extension n'a aucune dépendance runtime. Correction = montée en majeure de `vite`/`vitest`.                                                                                                          | Monter en version dans un lot séparé, hors de cet audit.                                            | certain    |
| `public/manifest.json:6`              | `host_permissions: ["<all_urls>"]` est la permission d'installation la plus large de Chrome. Elle est nécessaire aux opérations sur les cookies, mais le README n'en dit rien alors qu'il insiste sur « aucune requête réseau ». Le test de manifeste (`tests/setup.test.ts:9`) prétend contrôler les permissions et ne la regarde pas. | La documenter dans le README ; l'inclure dans l'assertion du test.                                  | certain    |
| `src/core/vault.ts:155`               | `record.iterations` est relu du stockage sans borne et passé à `deriveKey` : un enregistrement trafiqué force un PBKDF2 non borné et bloque le service worker.                                                                                                                                                                          | Borner `iterations` dans `isRecord`.                                                                | certain    |
| `src/cleaners/history.ts:64` vs `:69` | `preview` compte `items.length` sans dédoublonner, `clean` dédoublonne par URL dans un `Set`. Les deux nombres peuvent diverger sur la même exécution.                                                                                                                                                                                  | Dédoublonner des deux côtés.                                                                        | certain    |
| `src/cleaners/cookies.ts:66`          | Le `catch` ne gère que le rejet. `chrome.cookies.remove` **résout avec `null`** quand le cookie est introuvable : cet échec est compté comme une suppression.                                                                                                                                                                           | Vérifier la valeur de retour en plus du rejet.                                                      | à vérifier |

### Cosmétique

| Fichier:ligne                | Description                                                                                                                                                                                                                                                                          | Correction proposée                    | Confiance |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | --------- |
| `src/ui/theme.css:102`       | Règle `.logo` : aucun élément ne porte cette classe (le HTML utilise `.brand-mark`).                                                                                                                                                                                                 | Supprimer.                             | certain   |
| `tests/setup.test.ts:10-11`  | `manifest.permissions.sort()` trie **sur place** le tableau du module JSON importé : mutation d'un état partagé entre tests.                                                                                                                                                         | Trier une copie.                       | certain   |
| `src/cleaners/storage.ts:54` | `origins.length / 2` suppose que `flatMap` rend toujours exactement 2 origines par hôte. Invariant couplé et silencieux.                                                                                                                                                             | Compter les hôtes avant l'expansion.   | certain   |
| `src/core/profiles.ts:24`    | Le profil « léger » embarque `{pattern:'*', keep:{}}`, une règle qui ne protège rien. Elle s'affiche comme une ligne vide dans la grille, et `grid.toggleRule` la supprime silencieusement dès la première case cochée.                                                              | Retirer la règle du profil par défaut. | certain   |
| `src/background.ts:87`       | `handle()` n'a pas de branche par défaut : un message non reconnu résout `{ok:true, data:undefined}`. Sans `externally_connectable`, aucune page web ne peut l'atteindre, et les autres extensions arrivent sur `onMessageExternal` — le risque est nul, la réponse reste trompeuse. | Jeter sur message inconnu.             | certain   |
| `src/ui/popup/popup.ts:42`   | Les permissions optionnelles sont demandées au moment de l'**aperçu**, avant toute confirmation. Annuler ensuite laisse la permission accordée.                                                                                                                                      | Demander au moment de la confirmation. | certain   |

### Sécurité — ce qui a été cherché et non trouvé

Analyse des 26 commits, toutes branches. **Aucun secret** : pas de clé privée, pas de jeton
(`ghp_`, `sk-`, `xox*`, `AKIA`, `AIza`), pas de `.env`, pas de blob base64 suspect (les seuls
sont les empreintes `sha512-` du lockfile). Les 126 occurrences de `password`/`secret`/
`passphrase` sont le vocabulaire métier de l'extension, pas des identifiants. Aucun fichier
de build, cache ou config d'IDE n'a jamais été versionné ; `dist/` et `node_modules/` sont
ignorés depuis le tout premier commit. Un seul auteur, sur une adresse GitHub `noreply`.

Sur le fond cryptographique : PBKDF2-SHA-256 à 310 000 itérations, sel de 16 octets et IV de
12 octets tirés au hasard à chaque écriture, AES-256-GCM, clé jamais persistée. Rien à
redire sur la construction elle-même.

### Défauts de la suite de tests elle-même

Vérifiés par mutation : le code a été cassé volontairement dans une copie jetable, la suite
relancée. « survit » = la suite reste à 198/198 alors que le code est faux.

| Emplacement                              | Description                                                                                                                                                                                                                                      | Confiance |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `src/cleaners/storage.ts:65`             | Remplacer le rapport par `{deleted: 999, kept: 42}` : **198/198 vert**. Aucun test n'inspecte jamais le rapport de ce cleaner — c'est pour ça que le `countable` manquant a survécu.                                                             | certain   |
| `src/core/profiles.ts:59-64`             | Supprimer les 6 lignes de validation de forme (`id`/`name` non-chaîne, `categories`/`keepRules` non-tableau) : **198/198 vert**.                                                                                                                 | certain   |
| `src/cleaners/history.ts:43`             | Supprimer les **deux** `break` de la pagination : **198/198 vert**. Le faux `history.search` ignore la requête et rend `[]` au deuxième appel, donc la boucle de pagination n'est jamais réellement exercée.                                     | certain   |
| `src/core/matcher.ts:9`                  | Remplacer `pattern.trim().toLowerCase()` par `pattern` : **198/198 vert**. Aucun test n'utilise de motif en majuscules ou entouré d'espaces.                                                                                                     | certain   |
| `src/core/vault.ts:182`                  | Passer `<` à `<=` dans `purgeExpired` : **198/198 vert**. La borne exacte n'est testée que de part et d'autre, jamais dessus.                                                                                                                    | certain   |
| `src/core/engine.ts:49-53`, `:57-66`     | Brancher `{items: 99999}` ou une note `'SWALLOWED'` dans les deux chemins d'erreur de `preview` : **198/198 vert**.                                                                                                                              | certain   |
| `src/cleaners/siteSettings.ts:63`        | Transformer `if (setting === undefined) continue` en `throw` : **198/198 vert**.                                                                                                                                                                 | certain   |
| `src/cleaners/index.ts:27-29`            | Remplacer le `catch` cookies par un `throw` : **198/198 vert**. Le test nommé « API indisponible » (`index.test.ts:54`) n'exerce en fait que l'optional chaining, jamais le `catch`.                                                             | certain   |
| `tests/cleaners/downloads.test.ts:56-60` | Test vide de sens : il prouve le repli `finalUrl ?? url` en montrant que l'élément est **protégé**. Casser le repli laisse `erased` à `[]` : le test passe quand même.                                                                           | certain   |
| `tests/setup.test.ts:9`                  | Le test s'appelle « ne demande que les permissions de base » mais ne regarde pas `host_permissions: ["<all_urls>"]`, la permission la plus large que Chrome accorde à l'installation. Ajouter `file:///*` au manifeste laisse les 3 tests verts. | certain   |
| `tests/core/vault.test.ts:51`            | Le test vise la corruption base64 mais la fixture échoue avant, sur `isRecord`. Le chemin `vault.ts:147-153` (« contenu corrompu ») n'est exécuté par **aucun** test ; le regex `/illisible/i` masque la différence.                             | certain   |
| `tests/core/settings.test.ts:26`         | Aller-retour tautologique : le faux `area.set` fait un `Object.assign`, donc `get()` rend l'objet **par référence**. L'assertion ne peut pas échouer.                                                                                            | certain   |

**Divergences entre les faux et les vraies API Chrome** — chaque faux masque un défaut réel :

- `history.search` (`history.test.ts:15`) ignore totalement la requête. Toute la pagination
  est de la fiction.
- `downloads.search` (`downloads.test.ts:14`) ignore `limit` et `startedAfter` — d'où le
  plafond de 1000 non détecté.
- `cookies.remove` (`cookies.test.ts:16`) _jette_ en cas d'échec. Le vrai `chrome.cookies.remove`
  **résout avec `null`** quand le cookie est introuvable. `cookies.ts:59-68` ne gère que le
  rejet : un échec silencieux est compté comme une suppression réussie.
- Les faux `area` (`Object.assign`) stockent des **références vivantes** ; `chrome.storage.local`
  sérialise en JSON et rend une copie. Tout ce qui dépend de la sérialisation est non testé —
  y compris le commentaire de `vault.ts:188-189` qui justifie l'existence de `clear()`.
- `contentSettings.clear()` (`siteSettings.test.ts:17`) ne prend aucun argument, alors que le
  code appelle `clear({scope:'regular'})`. Le scope n'est jamais vérifié.

**`patterns.ts` — comportement mesuré, assuré par aucun test :**

```
'münchen.de'         => accepté tel quel
matchesPattern('xn--mnchen-3ya.de', 'münchen.de')  =>  false
'ＧＩＴＨＵＢ.ｃｏｍ'  => accepté (pleine chasse, pas de normalisation NFKC)
'github。com'         => accepté (U+3002 passe les contrôles de point)
'*.' + 'a'*5000 + '.com' => accepté (aucune borne de label 63 / nom 253)
```

**`src/core/vault.ts:155`** : `record.iterations` est relu du stockage et passé à `deriveKey`
sans borne. Un enregistrement abîmé ou trafiqué force un PBKDF2 non borné — blocage du service
worker. Surface d'attaque faible (il faut déjà écrire dans le stockage de l'extension), mais
la validation manque. Sévérité mineure.

**`tests/core/vault.test.ts` : 574 ms mesurés, dont ~100 % en dérivation de clé** — 14 PBKDF2
à 310 000 itérations. C'est ~60 % du temps total de la suite. Le chemin de lecture prend déjà
le compte d'itérations dans l'enregistrement (`vault.ts:155`) ; seul `store()` code la constante
en dur. Un troisième paramètre optionnel sur `createVault` rendrait les tests instantanés sans
changer le comportement de production. Aucun test ne vérifie aujourd'hui que `record.iterations`
vaut bien 310 000.

### Ce que la phase 1 n'a pas pu établir

- Aucun test n'a été exécuté dans un vrai Chrome. Tous les constats marqués `à vérifier`
  reposent sur la documentation, pas sur une observation.
- La sémantique de `endTime` dans `history.search` n'est documentée nulle part.
- L'effet réel de `excludeOrigins` sur le cache HTTP n'a pas été mesuré.
- Le coût réel de la non-mémoïsation (`background.ts:48`) est démontré structurellement,
  mais son ampleur en millisecondes n'a pas été mesurée.

---

## Phase 2 — Code mort et dépendances

Méthode : pour chacun des 95 symboles exportés de `src/`, un `grep -rn '\bSYMBOL\b' src/ tests/
*.html vite.config.ts` filtré de sa propre ligne de définition. Un symbole n'est déclaré mort
que si ce grep ne rend rien.

### Résultat général

Le dépôt est **propre** sur ce plan. Zéro dépendance inutilisée, zéro import non déclaré, zéro
fichier jamais importé, zéro symbole de module non exporté et non utilisé, zéro asset orphelin
dans `public/`. Les 4 devDependencies sont toutes prouvées utilisées. Aucun `TODO`, `FIXME`,
`HACK`, `@ts-ignore` ni bloc de code commenté dans tout `src/`.

### Supprimable sans risque — fait, commit `7b860d9`

| Élément                                           | Preuve                                                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui/theme.css:102` règle `.logo`              | `grep -rn logo src/ tests/ *.html` ne rend que la définition et `logo.svg` ; le HTML utilise `.brand-mark`.                                                                                     |
| `package.json:17-19` clé `allowScripts`           | Aucun gestionnaire ne lit cette clé. C'est de la configuration `@lavamoat/allow-scripts` — absent de `node_modules`, absent du lockfile — et sa place canonique serait `lavamoat.allowScripts`. |
| `export` sur `protectedOrigins` (`storage.ts:21`) | `grep -rn protectedOrigins src/ tests/` hors du fichier : aucun résultat.                                                                                                                       |

198 tests verts, typecheck et build OK après suppression.

### Probablement mort — à confirmer par toi, rien n'a été touché

| Élément                                             | Preuve de non-usage                                                                                                                                                                                                                                                                              | Pourquoi je ne l'ai pas supprimé                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cleaner.perSite` (`src/core/types.ts:67`)          | Écrit par les 8 fabriques de cleaners, **lu zéro fois** en production : `grep -rn "perSite" src/ \| grep -v "perSite: '"` ne rend que la déclaration. Lu uniquement par 8 assertions de test.                                                                                                    | C'est un troisième exemplaire du même fait, avec `PER_SITE` et `COLUMNS`/`UNFILTERABLE`. Le supprimer, le garder ou en faire la source unique est une décision de conception, pas un nettoyage.                                                                                                      |
| `PER_SITE` (`src/ui/options/grid.ts:3`)             | Zéro référence dans `src/`, y compris dans son propre fichier.                                                                                                                                                                                                                                   | **Il sert d'oracle** à deux tests (`tests/ui/grid.test.ts:35-42`) qui vérifient que la grille ne montre que des catégories filtrables. Le supprimer déplacerait la constante dans le fichier de test et affaiblirait le contrôle : aucun gain mesurable.                                             |
| `KeepRule.keepCookies` (`src/core/types.ts:33`)     | `grep -rn keepCookies src/ui/` : aucun résultat. Le seul lecteur est `matcher.cookieProtection`. Seule voie d'écriture : le champ d'import JSON (`options.html:127`).                                                                                                                            | Ce n'est pas du code mort mais une fonctionnalité sans interface. Trois issues : construire l'interface, documenter le contrat, ou retirer le champ. À toi.                                                                                                                                          |
| `relevantRules` (`src/cleaners/siteSettings.ts:31`) | Prédicat identique à celui déjà appliqué par `buildPlan` (`planner.ts:31`), seul producteur de `CategoryPlan` en production : no-op démontrable.                                                                                                                                                 | Deux tests construisent des plans à la main sans passer par `buildPlan` (`siteSettings.test.ts:59-65`, `:74-79`) et en dépendent. `storage.ts:27` fait l'inverse et fait confiance à `buildPlan` : l'incohérence entre les deux cleaners est réelle, mais la trancher demande de choisir un contrat. |
| Branches inatteignables en production               | `engine.ts:18-25,49-54,76-79` (`missing()`) : `buildCleaners` rend les 11 cleaners de `ALL_CATEGORIES`, et `profiles.ts:73` rejette toute autre catégorie à l'import. `vault.ts:194` (repli `set(null)`) : gardé par `area.remove !== undefined`, et `chrome.storage.local` a toujours `remove`. | Ce sont des gardes défensives dont les tests dépendent. Les retirer économise dix lignes et supprime un filet. Non rentable.                                                                                                                                                                         |

### Fichiers et configuration

- `tools/make-icons.py` : hors chaîne de build, aucun script npm ne l'invoque — mais documenté
  dans le README comme outil manuel. Ce n'est pas un orphelin.
- `.superpowers/` : **non versionné**, auto-ignoré par `.superpowers/sdd/.gitignore` (`*`).
- `docs/superpowers/` : **versionné** — 3728 lignes de plan et de spec de génération.
  Voir la phase 5.
- `dist/` : non versionné, ignoré depuis le premier commit. Contient un build **périmé**
  (`dist/types.js`, `dist/labels.js` : noms de chunks d'une configuration antérieure).
- **Aucune CI n'existe** : pas de `.github/`, aucun `.yml` dans le dépôt.
- `node_modules` contient 66 paquets `extraneous` (`@vitest/coverage-v8` et ses transitives),
  installés pour mesurer la couverture de cet audit et absents de `package.json`. `npm ci` les
  retirerait. Voir la phase 6.

---

## Phases 3 à 6 — ce qui a été fait

Chaque correction a suivi la même règle : un test qui échoue d'abord, la
correction ensuite, un commit par correctif. Les seules exceptions sont
signalées nommément plus bas.

### État initial contre état final

| Mesure                       | Avant                                              | Après                                                                        |
| ---------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Tests                        | 198 / 17 fichiers                                  | **256 / 20 fichiers**                                                        |
| Couverture (stmts)           | 62,63 %                                            | **83,26 %**                                                                  |
| `src/background.ts`          | 0 %                                                | routage extrait et testé (`src/core/router.ts`, 6 tests)                     |
| `src/ui/popup/popup.ts`      | 0 %                                                | **79,2 %**                                                                   |
| `src/ui/options/options.ts`  | 0 %                                                | **64,8 %**                                                                   |
| `src/core/messages.ts`       | 0 %                                                | **100 %**                                                                    |
| Durée de la suite            | 1,84 s                                             | 1,67 s malgré 58 tests de plus                                               |
| `npm audit`                  | 5 vulnérabilités (1 critique, 1 haute, 3 modérées) | **0**                                                                        |
| Dépendances à l'exécution    | 0                                                  | **0** — inchangé, c'est voulu                                                |
| Dépendances de développement | 4                                                  | 10 (prettier, eslint, typescript-eslint, @eslint/js, happy-dom, coverage-v8) |
| Formateur / linter           | aucun                                              | prettier + eslint, `npm run lint` et `format:check` verts                    |
| CI                           | aucune                                             | GitHub Actions, matrice Node 20/22/24                                        |
| Licence                      | absente                                            | MIT                                                                          |
| Lignes (`src` + `tests`)     | 4476                                               | 6030                                                                         |

### Corrections, du plus grave au plus bénin

| Commit                          | Correction                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a1bf34e`                       | **Mots de passe.** Depuis Chrome 144 (stable le 13/01/2026), `browsingData.remove` ignore le type `passwords` : l'appel réussit sans rien supprimer. L'extension affichait « vidé entièrement » derrière une case de confirmation rouge marquée « définitif ». Elle détecte maintenant la version et rend un échec explicite.                                                               |
| `9eba593`                       | **Autorisations de site.** `contentSettings.clear()` n'efface que les règles posées par l'extension, jamais celles de l'utilisateur (vérifié dans la source Chromium). La catégorie est requalifiée dans l'aperçu et la grille au lieu de laisser croire à une suppression.                                                                                                                 |
| `7d63c0c`                       | **Stockage.** Le rapport omettait `countable: false` : l'interface affichait « 0 supprimé(s) » après avoir vidé tout le stockage local. Faussait aussi le total des catégories vidées.                                                                                                                                                                                                      |
| `29290b4`                       | **Téléchargements.** `downloads.search` plafonne à 1000 résultats sans `limit`. Au-delà, les plus anciens n'étaient ni comptés ni effacés, en silence.                                                                                                                                                                                                                                      |
| `c7013e0`                       | **Hôtes connus.** `collectKnownHosts` avalait toute erreur de `cookies.getAll` et rendait une liste amputée : les règles à wildcard ne protégeaient plus qu'une partie des sites, sans le dire.                                                                                                                                                                                             |
| `2d7526b`                       | **Phrase secrète.** Elle vivait dans une variable de module : deux nettoyages concurrents pouvaient se la voler ou l'effacer mutuellement. Elle passe maintenant par la fermeture d'un moteur créé par message. Même commit : purge du coffre expiré au démarrage (la rétention n'était tenue que si l'on relançait un nettoyage), et rejet des messages inconnus au lieu d'un faux succès. |
| `ca4913f`                       | **Autorisations de site.** `get()` ne rend jamais `'default'` : la condition était toujours vraie et le nettoyage réécrivait le défaut du navigateur en règle d'extension, masquant les changements ultérieurs de l'utilisateur.                                                                                                                                                            |
| `2106012`                       | **Historique.** L'aperçu comptait sans dédoublonner, le nettoyage dédoublonnait : sur un jeu de 4 entrées paginé par 2, aperçu 7 contre 4 suppressions. Et une entrée sans date valait « époque zéro », ce qui pouvait couper la pagination.                                                                                                                                                |
| `84d9896`                       | **Motifs unicode.** Chrome rend des hôtes en punycode ; un motif unicode ne correspondait à rien et ne protégeait rien, en silence.                                                                                                                                                                                                                                                         |
| `4cb56e2`                       | **Rétention.** `get()` acceptait `NaN`, ce qui rendait la comparaison de purge toujours fausse : le coffre n'était jamais purgé.                                                                                                                                                                                                                                                            |
| `d7af11c`                       | **Coffre.** Le compte d'itérations relu du stockage n'était pas borné : un enregistrement trafiqué imposait un PBKDF2 sans limite.                                                                                                                                                                                                                                                          |
| `0feba0b`                       | **Journal.** Une valeur `runs` abîmée était étalée sans contrôle — une chaîne produisait quinze entrées bidon, un objet aurait fait jeter _après_ la suppression.                                                                                                                                                                                                                           |
| `ed42191` + `331111b`           | **Interface.** Les appels au service worker n'étaient pas protégés : une erreur devenait un rejet non capturé, la popup restait figée, le bouton mort. Ajout aussi d'une confirmation en deux temps avant la suppression du coffre, qui agissait au premier clic.                                                                                                                           |
| `f1dd3ff`                       | **Performance.** La liste des hôtes connus n'était pas mémoïsée : un profil complet avec trois règles à wildcard déclenchait douze `cookies.getAll` et douze `history.search(5000)` concurrents pour le même résultat.                                                                                                                                                                      |
| `5fa2a0b`                       | Tests fermant les trous révélés par mutation, et trois nettoyages cosmétiques.                                                                                                                                                                                                                                                                                                              |
| `f7a3f09`                       | Suite deux fois plus rapide : le coffre dérivait quinze clés PBKDF2 réelles.                                                                                                                                                                                                                                                                                                                |
| `244f4da`, `44063e6`, `79db87f` | Prettier et ESLint configurés puis appliqués, formatage isolé dans un commit à part.                                                                                                                                                                                                                                                                                                        |
| `bfa44a5`, `9eba593`            | Documentation : trois affirmations fausses corrigées, README découpé, licence MIT, CONTRIBUTING.                                                                                                                                                                                                                                                                                            |
| `04de8c0`                       | CI, `.gitignore` complété, gabarits d'issue et de PR.                                                                                                                                                                                                                                                                                                                                       |
| `84c1e39`                       | Couverture mesurable, `npm audit` ramené à zéro.                                                                                                                                                                                                                                                                                                                                            |

### Deux choses à savoir sur l'historique

- **`331111b` « chore: sauvegarde automatique »** n'est pas de moi : un hook du
  dépôt a committé mon travail en cours sur `options.ts` pendant que je le
  testais. Le contenu est correct et vérifié, seul le message est générique.
  Je ne l'ai pas réécrit : tu m'as demandé de ne pas toucher à l'historique.
- **`7b860d9` puis `9429823`** : j'ai supprimé la clé `allowScripts` de
  `package.json` en me fiant à une analyse qui la disait inerte. C'était faux —
  npm 11 lit ce champ, `npm approve-scripts` le gère. Je l'ai rétablie dès que
  l'installation d'une dépendance l'a montré. La leçon vaut d'être écrite : la
  preuve « aucun code ne référence ce symbole » ne vaut rien quand le
  consommateur est un outil externe.

---

## Ce qui n'a pas été fait, et pourquoi

C'est la section qui compte.

### Rien n'a été vérifié dans un vrai navigateur

**Aucun test n'a tourné dans Chrome.** Toute la suite s'exécute sous Node avec
de faux objets `chrome.*`. Les tests d'interface utilisent happy-dom, qui n'est
pas un navigateur. Chaque affirmation de ce rapport sur le comportement des API
Chrome vient de la documentation officielle ou de la source Chromium — jamais
d'une observation. Les faux ont été rapprochés du comportement réel là où je
l'ai su, mais un faux reste un faux : c'est précisément ce qui a laissé passer
les défauts corrigés ici.

`docs/recette-manuelle.md` existe pour ça et n'a pas été jouée.

### Défauts identifiés et volontairement non corrigés

| Défaut                                                                                                                                   | Pourquoi je n'ai pas touché                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Le coffre écrase la sauvegarde précédente** (`vault.ts`). Un second nettoyage détruit le coffre du premier avant toute restauration.   | Trois issues possibles — refuser d'écraser, garder plusieurs coffres, avertir dans la popup — et elles n'ont pas le même coût ni la même surface d'interface. C'est un choix de produit. Documenté dans `docs/coffre.md`.                                                                                                                                                |
| **Cookies partitionnés (CHIPS)** : jamais comptés, jamais supprimés, jamais sauvegardés.                                                 | Les énumérer demande de découvrir les `partitionKey` existantes, ce que l'API ne propose pas directement. C'est une fonctionnalité, pas un correctif. Documenté.                                                                                                                                                                                                         |
| **Cache HTTP exclusible par origine** : l'API le permet depuis Chrome 74, contrairement à ce que le code affirmait.                      | Implémenter demanderait une colonne de plus dans la grille, donc une promesse à l'utilisateur. Or le filtre porte sur l'URL de la ressource, pas sur le site visité : « conserver le cache de ce site » ne préserverait pas ce qu'il charge depuis un CDN. Une demi-promesse vaut moins qu'une limite annoncée. Le texte est corrigé, la fonctionnalité reste à décider. |
| **`history.deleteUrl` ignore la période.** Un profil « dernière heure » efface des visites d'il y a six mois.                            | Aucun contournement n'existe : `deleteRange` borne le temps mais n'accepte ni URL ni exclusion. Seule la documentation pouvait changer, et elle a changé.                                                                                                                                                                                                                |
| **`cookies.remove` résout avec `null`** au lieu de rejeter quand le cookie est introuvable : cet échec est compté comme une suppression. | Marqué « à vérifier » et non confirmé par une source formelle. Corriger sur une hypothèse ferait basculer des suppressions réussies en échecs. À confirmer dans un vrai navigateur d'abord.                                                                                                                                                                              |
| **`Cleaner.perSite`, `PER_SITE`, `COLUMNS`/`UNFILTERABLE`** : trois exemplaires du même fait, dont un jamais lu en production.           | Fusionner suppose de choisir laquelle est la source de vérité — décision de conception. Et supprimer `PER_SITE` déplacerait simplement la constante dans le fichier de test tout en affaiblissant deux contrôles. Aucun gain mesurable.                                                                                                                                  |
| **`KeepRule.keepCookies`** : honoré par le moteur, impossible à saisir dans l'interface, atteignable seulement par import JSON.          | Construire l'interface est une fonctionnalité ; retirer le champ casse les profils importés qui s'en servent. À toi de trancher.                                                                                                                                                                                                                                         |
| **`relevantRules`** (`siteSettings.ts`) : filtre déjà appliqué par `buildPlan`.                                                          | Deux tests construisent des plans à la main et en dépendent. Le retirer demande de fixer un contrat entre le planificateur et les cleaners.                                                                                                                                                                                                                              |
| **Le journal n'a aucune interface.** Écrit à chaque nettoyage, lisible seulement depuis la console du service worker.                    | Fonctionnalité manquante, pas défaut. Signalé.                                                                                                                                                                                                                                                                                                                           |
| **`vite`/`vitest` en montée de majeure** : finalement fait (`84c1e39`), mais après coup et hors du plan initial.                         | Je l'avais écarté en phase 1 comme « hors périmètre ». Introduire happy-dom a ajouté une faille critique, ce qui a rendu la montée nécessaire. Signalé ici parce que le raisonnement de départ était mauvais.                                                                                                                                                            |

### Ce que je n'ai pas su mesurer

- **Le gain réel de la mémoïsation** (`f1dd3ff`). La démonstration est
  structurelle — douze appels au lieu d'un — mais je n'ai pas mesuré de
  millisecondes, faute de navigateur.
- **La sémantique de `endTime`** dans `history.search` n'est documentée nulle
  part. La pagination est maintenant robuste dans les deux cas, mais je ne sais
  toujours pas lequel est vrai.
- **`since` sur les types de stockage** : la documentation ne dit pas si la
  borne de temps est honorée pour `localStorage`, `indexedDB`, `cacheStorage`
  et `serviceWorkers`. Le code la passe ; je ne peux pas affirmer qu'elle est
  prise en compte.
- **Aucune mesure de performance** n'a été faite, nulle part. Le seul chiffre
  de ce rapport est le temps de la suite de tests.

---

## Risques restants, par priorité

1. **La catégorie « Autorisations de site » ne fait toujours pas ce que son nom
   dit.** Elle est maintenant honnête dans l'interface, mais un utilisateur
   pressé cochera la case en croyant effacer ses autorisations. La retirer reste
   la seule option pleinement honnête.
2. **Les cookies partitionnés échappent à tout** — y compris au coffre. Un
   utilisateur qui active le coffre et nettoie perd ces cookies sans
   sauvegarde, contrairement à ce que la promesse générale laisse entendre.
3. **Le coffre est un point unique de destruction.** Deux nettoyages
   d'affilée et la première sauvegarde est perdue. Le seul garde-fou est une
   ligne de documentation.
4. **Le service worker n'est jamais testé tel qu'il tourne.** `background.ts`
   reste à 0 % : le routage en a été extrait et testé, mais le câblage à
   `chrome.*`, la restauration des cookies et la sauvegarde ne sont couverts par
   rien.
5. **La suppression de l'historique déborde de la période demandée.** Limite
   d'API, désormais documentée, mais l'utilisateur qui choisit « dernière
   heure » ne s'attend pas à perdre six mois.
6. **`<all_urls>` reste une permission très large.** Justifiée, documentée,
   mais c'est la surface d'attaque la plus grande du manifeste.
7. **`options.ts` est à 64 % et fait 380 lignes**, avec du rendu, de la
   validation et du câblage mêlés. C'est le fichier où le prochain bug est le
   plus probable.

---

## Ce que tu dois vérifier toi-même

1. **Jouer `docs/recette-manuelle.md` en entier**, dans un vrai Chrome, sur un
   profil de test. C'est le seul moyen de valider tout ce qui précède. Les trois
   scénarios ajoutés (mots de passe sur Chrome 144+, confirmation du coffre,
   erreur du service worker) n'ont jamais été exécutés.
2. **Confirmer le comportement des mots de passe** sur ta version de Chrome
   (`chrome://version`). Si tu es en dessous de 144, la catégorie fonctionne
   encore et mon garde-fou ne se déclenche pas.
3. **Vérifier qu'une autorisation de site accordée à la main survit bien** à un
   nettoyage. Si elle survit, ma conclusion sur `contentSettings.clear()` est
   confirmée et la catégorie mérite d'être retirée.
4. **Tester la restauration du coffre de bout en bout** avec de vrais cookies de
   session : c'est le chemin le plus critique et le moins observable.
5. **Relire les trois décisions de produit** listées plus haut : coffre écrasé,
   CHIPS, cache HTTP filtrable.
6. **Décider du sort de `docs/superpowers/`** (3728 lignes d'archives) et de
   `AUDIT.md` lui-même, qui n'a pas vocation à vivre éternellement à la racine.
7. **Vérifier la CI au premier push** : elle n'a jamais tourné sur GitHub. Le
   job « icons » installe Pillow et compare le résultat aux fichiers versionnés,
   ce qui est vrai localement mais dépend de la version de Pillow de l'exécuteur.
