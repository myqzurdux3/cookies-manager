# Cookies Manager — nettoyage de données de navigation par site

Date : 2026-08-16
Statut : design validé, prêt pour le plan d'implémentation

## Problème

Le dialogue « Effacer les données de navigation » de Chrome et Brave ne sait
faire qu'une chose : tout supprimer, ou rien. Impossible de garder la session
de sa banque en purgeant le reste, impossible de vider le cache d'un site sans
vider son historique, impossible de rejouer la même sélection deux fois sans
tout reconfigurer à la main.

Cette extension fournit ce que le dialogue natif ne fournit pas : une keep-list
par site croisée avec les catégories de données, et des profils de nettoyage
réutilisables.

## Périmètre

Extension navigateur Manifest V3, pour Chrome et Brave, avec un seul code.

Dans le périmètre :

- Nettoyage manuel, déclenché depuis la popup.
- Toutes les catégories standard : cookies, stockage web, cache HTTP,
  historique, téléchargements, formulaires, mots de passe, autorisations.
- Keep-list au grain domaine × catégorie, wildcards acceptés.
- Profils de nettoyage nommés, chacun avec sa période, ses catégories et sa
  keep-list.
- Aperçu avant suppression.

Hors périmètre, décidé explicitement :

- Nettoyage automatique (fermeture du navigateur, planifié, à la fermeture
  d'un onglet). Le déclenchement reste manuel.
- Compagnon natif en native messaging. L'API navigateur couvre le besoin en
  mode manuel ; un binaire local ajouterait une installation, des permissions
  fortes et une seconde base de code pour un gain quasi nul. La porte reste
  ouverte si un besoin réel apparaît.
- Toute fonction d'annulation. Les données supprimées ne reviennent pas.

## Contrainte fondatrice

La finesse par site n'est pas uniforme : elle dépend de ce que l'API expose.

| Catégorie | Finesse | Mécanisme |
|---|---|---|
| Cookies | cookie individuel | `chrome.cookies.getAll` + `remove` |
| localStorage, IndexedDB, cacheStorage, serviceWorkers | origine | `browsingData` + `excludeOrigins` |
| Historique | URL | `chrome.history.search` + `deleteUrl` |
| Téléchargements (liste) | URL | `chrome.downloads.search` + `erase` |
| Autorisations de site | motif | `chrome.contentSettings` |
| Cache HTTP | aucune | tout ou rien |
| Mots de passe, formulaires | aucune | tout ou rien |

Les deux dernières lignes ne se contournent pas : l'API ne les expose pas.
L'interface doit les afficher comme telles, cases d'exclusion grisées avec la
raison, plutôt que suggérer un contrôle qui n'existe pas.

## Architecture

Trois surfaces : popup (lancer), page d'options (configurer), service worker
(exécuter).

```
src/
  core/
    profiles.ts    CRUD des profils, persistance chrome.storage.local
    matcher.ts     hostname + keep-list -> catégories protégées
    planner.ts     profil + keep-list -> plan d'exécution par catégorie
    engine.ts      exécute le plan, agrège le rapport
  cleaners/
    cookies.ts  storage.ts  history.ts  downloads.ts
    httpCache.ts  credentials.ts  permissions.ts
  ui/
    popup/  options/
```

Chaque cleaner implémente la même interface, ce qui isole les bizarreries
d'API dans un seul fichier par catégorie :

```ts
interface Cleaner {
  id: Category;
  perSite: 'exact' | 'origin' | 'none';  // finesse réelle offerte par l'API
  preview(plan: CategoryPlan): Promise<Preview>;
  clean(plan: CategoryPlan): Promise<CleanReport>;
}
```

`perSite: 'none'` remonte jusqu'à l'interface, qui grise les cases
d'exclusion correspondantes.

Le moteur ne connaît aucune API navigateur : il itère sur des cleaners.
Ajouter une catégorie plus tard coûte un fichier et zéro modification du
moteur. Chaque cleaner reçoit l'objet `chrome` par injection, ce qui le rend
testable sans navigateur.

## Modèle de données

```ts
type Category =
  | 'cookies' | 'localStorage' | 'indexedDB' | 'cacheStorage' | 'serviceWorkers'
  | 'httpCache' | 'history' | 'downloads' | 'formData' | 'passwords' | 'permissions';

type KeepRule = {
  pattern: string;                       // "github.com" | "*.google.com" | "*"
  keep: Partial<Record<Category, true>>; // catégories protégées pour ce motif
  keepCookies?: string[];                // noms de cookies à garder (défaut : tous)
};

type Profile = {
  id: string;
  name: string;
  since: 'hour' | 'day' | 'week' | 'month' | 'all';
  categories: Category[];                // ce que ce profil nettoie
  keepRules: KeepRule[];
};
```

### Règles de correspondance

- `github.com` correspond à l'hôte `github.com` et au cookie de domaine
  `.github.com`. Il ne correspond ni à `evilgithub.com`, ni à
  `gist.github.com`.
- `*.github.com` correspond à `gist.github.com` et à `github.com` lui-même :
  le sous-domaine vide compte.
- `*` correspond à tout hôte.
- Quand plusieurs règles correspondent à un même hôte, les protections
  s'additionnent. La règle la plus permissive gagne. Se tromper vers
  « conserver » se corrige ; se tromper vers « supprimer » ne se corrige pas.
- Aucune liste de suffixes publics n'est nécessaire : on compare des motifs à
  des hôtes, jamais à des domaines enregistrables déduits.

### Persistance

Les profils vont dans `chrome.storage.local`, jamais dans `sync`. Une
keep-list révèle les sites sensibles de son propriétaire ; elle n'a rien à
faire sur un serveur tiers.

## Flux d'exécution

Un nettoyage passe toujours par deux temps.

**Aperçu.** Le planner résout la keep-list, puis chaque cleaner répond en
parallèle sans rien supprimer. La qualité de l'aperçu dépend de l'API :

| Catégorie | Aperçu |
|---|---|
| Cookies | exact — N cookies sur M domaines, liste consultable |
| Historique, téléchargements | exact — N entrées |
| Stockage web | partiel — origines ciblées connues, dérivées des cookies et de l'historique. Aucune API n'énumère les origines qui stockent des données ; la liste est un minorant, annoncé comme tel |
| Cache HTTP, mots de passe, formulaires | non chiffrable — l'API ne rend aucun décompte |

**Exécution.** Après confirmation explicite, le moteur lance les cleaners en
séquence. Un cleaner qui échoue n'interrompt pas les autres : chacun rend
`{status: 'ok' | 'partial' | 'failed', deleted, kept, error?}` et le rapport
final agrège le tout. Les 20 derniers nettoyages restent en journal local, ce
qui permet de vérifier après coup que la keep-list a protégé ce qu'il fallait.

## Garde-fous

- Mots de passe et formulaires sont hors des profils par défaut. Les inclure
  demande une case dédiée, jamais pré-cochée, plus une seconde validation au
  lancement. Ce sont les seules catégories à la fois coûteuses à perdre et
  dépourvues d'exclusion par site.
- Toute ambiguïté de correspondance résout vers « conserver ».
- Export et import JSON des profils : sauvegarde de la configuration, pas des
  données.
- Permissions minimales. `browsingData`, `cookies`, `storage` en base.
  `history`, `downloads`, `contentSettings` en `optional_permissions`,
  demandées seulement si un profil les utilise. `host_permissions:
  <all_urls>` est obligatoire : `chrome.cookies.getAll` ne rend les cookies
  d'un domaine que si l'extension a la permission sur ce domaine.
- Zéro réseau : aucune requête sortante, aucune télémétrie, CSP stricte,
  aucune dépendance runtime. Une extension qui lit les cookies ne doit avoir
  aucun moyen de les faire sortir, et cela doit être vérifiable dans le
  manifeste.

## Tests

`matcher.ts` et `planner.ts` sont du code pur, sans API navigateur. Ils sont
écrits en TDD et testés sous Vitest, sans navigateur. C'est là que les bugs
coûtent des données, donc c'est là que va l'effort. Cas obligatoires :
wildcards, cookie à domaine pointé (`.github.com`), additivité de deux règles,
et les faux positifs qui doivent échouer (`evilgithub.com` ne matche jamais
`github.com`).

Les cleaners reçoivent l'API `chrome` par injection : les tests passent un
faux objet et vérifient les appels émis — `cookies.remove` appelé pour `_ga`,
jamais pour `user_session`. La valeur du test est dans la sélection, pas dans
la suppression réelle.

Une recette manuelle documentée termine la vérification : profil jouet,
navigateur de test, contrôle visuel que les sites de la keep-list restent
connectés.

## Pile technique

TypeScript, build Vite, tests Vitest. Interface en HTML et CSS simples, sans
framework : trois écrans, aucun état partagé complexe. Aucune dépendance
runtime.
