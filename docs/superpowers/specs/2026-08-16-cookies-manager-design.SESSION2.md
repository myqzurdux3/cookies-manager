# cookies-manager — spécification de conception

Date : 2026-08-16
Statut : approuvé, prêt pour le plan d'implémentation

## 1. Objectif

Remplacer le dialogue « Effacer les données de navigation » de Chrome et Brave par un
outil offrant un contrôle par domaine et par catégorie de données : purger l'ensemble
du navigateur tout en conservant explicitement les données de sites choisis.

Le manque principal de l'outil natif est l'absence de granularité. Effacer les cookies
déconnecte de tout, y compris des sites où l'on souhaitait rester connecté. La keep-list
par domaine et par catégorie est donc la fonctionnalité centrale, pas une option.

## 2. Périmètre

### Dans le périmètre (v1)

- Purge globale déclenchée manuellement, avec keep-list.
- Keep-list au niveau domaine × catégorie de données, wildcards supportés.
- Plage temporelle réglable (dernière heure, 24 h, 7 jours, 4 semaines, tout).
- Aperçu obligatoire avant exécution, avec compteurs et liste des protections.
- Sauvegarde chiffrée des cookies supprimés, restaurable.
- Journal des purges.
- Chrome et Brave, sous Linux.

### Hors périmètre (v1)

- Purge automatique, planifiée, ou au démarrage / à la fermeture du navigateur.
- Suppression ciblée (« efface uniquement ces domaines »).
- Inspecteur / navigateur de données en lecture.
- Synchronisation entre machines.
- Gestion multi-profils : l'extension agit dans le profil où elle est installée. Le
  compagnon range néanmoins coffre et journal par profil, pour qu'une installation dans
  un second profil ne vienne pas écraser les données du premier.
- Windows et macOS.

## 3. Architecture

Approche retenue : extension MV3 principale, compagnon natif mince.

L'extension fait tout ce que les API du navigateur permettent. Un binaire natif,
joint par native messaging, couvre les trois besoins que l'extension ne peut pas
satisfaire seule : le coffre chiffré sur disque, le journal persistant, et l'élagage
du cache HTTP par domaine (navigateur fermé). L'extension fonctionne sans le
compagnon, en mode dégradé annoncé à l'utilisateur.

```
cookies-manager/
├── extension/                 # MV3, TypeScript + Vite
│   ├── manifest.json          # champ `key` fixe : ID d'extension stable
│   ├── background/
│   │   └── orchestrator.ts    # service worker, exécution du plan
│   ├── ui/
│   │   ├── popup/             # plage temporelle, aperçu, confirmation
│   │   └── options/           # éditeur de keep-list, réglages, journal
│   └── core/
│       ├── inventory.ts       # recensement cookies / origines / historique
│       ├── rules.ts           # matching de domaine, wildcards, précédence
│       ├── planner.ts         # (inventaire, règles) -> plan  [fonction pure]
│       ├── executors/
│       │   ├── cookies.ts     # chrome.cookies
│       │   ├── storage.ts     # chrome.browsingData + origins/excludeOrigins
│       │   ├── history.ts     # chrome.history, URL par URL
│       │   ├── downloads.ts   # chrome.downloads.erase
│       │   ├── permissions.ts # chrome.contentSettings
│       │   └── global.ts      # cache, passwords, formData (tout-ou-rien)
│       └── bridge.ts          # native messaging, optionnel
└── companion/                 # binaire Rust statique
    ├── protocol.rs            # cadrage 4 octets little-endian + JSON, stdin/stdout
    ├── vault.rs               # coffre de cookies chiffré
    ├── journal.rs             # journal en ajout seul
    └── offline.rs             # élagage du cache par domaine, navigateur fermé
```

### Flux d'une purge

1. L'utilisateur ouvre la popup, choisit la plage temporelle et les catégories.
2. `inventory` recense l'état réel du navigateur.
3. `rules` classe chaque domaine rencontré.
4. `planner` produit un plan explicite : pour chaque catégorie, ce qui est supprimé
   et ce qui est conservé, avec la règle responsable de chaque protection.
5. L'aperçu affiche le plan. Rien ne s'exécute sans confirmation.
6. `bridge` demande au compagnon de sauvegarder les cookies condamnés dans le coffre.
7. Les `executors` s'exécutent.
8. Le rapport final est affiché et consigné au journal.

### Contrainte structurante : `planner` est pur

`planner` prend un inventaire et un jeu de règles, retourne un plan, et ne produit
aucun effet de bord. Trois conséquences voulues :

- il est testable sans navigateur, ce qui met l'essentiel de la logique sous tests
  rapides et déterministes ;
- le mode simulation consiste simplement à s'arrêter après l'étape 5 ;
- les `executors` sont les seuls modules à toucher aux API du navigateur, ce qui
  concentre le risque dans un endroit petit et explicitement testé.

## 4. Contrainte des API : la matrice n'est pas uniforme

`chrome.browsingData` n'accepte un filtre `origins` / `excludeOrigins` que pour une
partie des types de données. C'est la contrainte qui façonne le produit et elle doit
rester visible dans l'interface.

| Catégorie | Filtrable par domaine | Moyen |
|---|---|---|
| cookies | oui | `chrome.cookies.getAll` + `remove` |
| localStorage, IndexedDB, cacheStorage, serviceWorkers, fileSystems | oui | `browsingData` avec `excludeOrigins` |
| historique | oui | `chrome.history`, suppression URL par URL |
| téléchargements (liste) | oui | `chrome.downloads.erase` |
| permissions de site | oui | `chrome.contentSettings` |
| cache HTTP | **non** | global uniquement ; par domaine seulement en différé (voir ci-dessous) |
| mots de passe | **non** | global uniquement |
| données de formulaire | **non** | global uniquement |

`chrome.downloads.erase` efface les *entrées* de la liste des téléchargements, pas les
fichiers sur disque. L'interface le dit.

### Le cache par domaine est nécessairement différé

L'élagage du cache HTTP par domaine suppose que le navigateur ne tienne pas ses fichiers
ouverts. Or la purge est déclenchée manuellement depuis la popup, donc navigateur ouvert.
Les deux ne peuvent pas coïncider.

Mécanisme retenu : au moment de la purge, l'extension **met en file** un travail d'élagage
auprès du compagnon. Le compagnon l'exécute dès qu'il constate que le profil n'est plus
verrouillé, c'est-à-dire au prochain arrêt du navigateur. L'extension signale le résultat
au démarrage suivant et le consigne au journal.

Conséquence pour l'interface : la case « cache » d'une règle est étiquetée **différé**, et
l'aperçu indique clairement que cette partie ne s'appliquera pas immédiatement. Sans le
compagnon, la case disparaît et le cache redevient purement global.

Les trois catégories globales apparaissent dans un bloc séparé de l'interface, marqué
« ignore la keep-list ». `passwords` et `formData` sont décochés par défaut et demandent
une confirmation supplémentaire.

## 5. Moteur de règles

### Modèle de données

Stocké dans `chrome.storage.local`, sous une clé versionnée pour permettre les migrations.

```ts
type Category =
  | 'cookies' | 'storage' | 'history' | 'downloads' | 'permissions'
  | 'cache' | 'passwords' | 'formData';

type Rule = {
  pattern: string;                          // 'github.com' | '*.google.com'
  keep: Partial<Record<Category, boolean>>; // catégorie absente = défaut
  note?: string;
  createdAt: number;
};

type Settings = {
  version: number;
  rules: Rule[];
  defaultCategories: Category[];   // catégories cochées par défaut dans la popup
  vaultEnabled: boolean;
  vaultRetentionDays: number;      // 7 par défaut
  journalEnabled: boolean;
};
```

### Sémantique des motifs

| Motif | Protège |
|---|---|
| `github.com` | l'hôte `github.com` exactement, cookies host-only et cookies de domaine `.github.com` |
| `*.github.com` | `github.com` et tout sous-domaine |
| `sso.github.com` | ce seul hôte |

### Précédence

Le motif le plus spécifique gagne. Le score est le nombre d'étiquettes littérales du
motif ; un hôte exact bat un wildcard de même score.

**À score égal, la conservation l'emporte.** Un outil de suppression doit échouer du
côté sûr : en cas d'ambiguïté, la donnée survit. Le coût d'une purge manquée est de
relancer la purge ; le coût d'une suppression erronée est une session perdue.

### Validation

Les motifs `*`, `*.com`, `*.co.uk` et tout wildcard remontant au-dessus de l'eTLD+1
sont rejetés à la saisie, via une liste de suffixes publics embarquée. Sans ce garde-fou,
une seule ligne annule silencieusement toute la purge.

### Défaut

Tout domaine ne correspondant à aucune règle est supprimé, dans les catégories cochées
et la plage temporelle choisie.

### Avertissement d'interface

Conserver les cookies d'un fournisseur d'identité (`*.google.com`, `*.facebook.com`)
conserve aussi son traçage tiers sur les sites qui l'intègrent. L'éditeur de règles
affiche cet arbitrage au moment où la règle est créée.

## 6. Aperçu

L'aperçu affiche le plan produit par `planner` : cookies condamnés et domaines
concernés, entrées d'historique, téléchargements, et la liste explicite des protections
avec la règle responsable de chacune.

**Limite assumée.** Aucune API n'énumère les origines détenant du localStorage ou de
l'IndexedDB. La *suppression* reste néanmoins exacte, car elle s'exprime en
`excludeOrigins` — « efface tout sauf ces origines » — ce qui ne demande jamais la liste
des cibles. C'est le *comptage* qui est approximatif : l'ensemble des origines plausibles
est reconstruit à partir des cookies, de l'historique et des Top Sites.

L'interface distingue donc deux natures de chiffres : les exacts (cookies, historique,
téléchargements) et les estimations, marquées comme telles. Aucun faux précis.

## 7. Coffre de sauvegarde

### Nature du risque

Une sauvegarde de cookies est une sauvegarde de jetons de session actifs. Quiconque
obtient ce fichier déchiffré peut usurper les sessions concernées, sans mot de passe et
sans second facteur. Cette fonctionnalité fait donc stocker à un outil de suppression
exactement ce qu'il est censé détruire. Le compromis est assumé pour un usage personnel,
mais il élargit réellement la surface d'attaque.

### Garanties non négociables

- Chiffrement XChaCha20-Poly1305.
- Clé conservée dans le trousseau du système (Secret Service : GNOME Keyring, KWallet),
  jamais écrite à côté du coffre. Corollaire accepté : une session utilisateur compromise
  compromet le coffre.
- Emplacement `~/.local/share/cookies-manager/<profil>/vault/`, permissions `0600`.
- Jamais dans `~/Téléchargements`, jamais synchronisé, jamais commité.
- Purge automatique après `vaultRetentionDays` (7 par défaut) : contenu écrasé avant
  suppression du fichier.
- La restauration réinjecte des sessions vivantes. Confirmation explicite obligatoire,
  avec affichage de ce qui sera restauré.
- **Un échec d'écriture du coffre annule la purge.** Jamais de suppression sans la
  sauvegarde promise.

## 8. Journal

Format JSONL en ajout seul, à côté du coffre, mêmes permissions `0600`.

Contenu : horodatage, plage temporelle, catégories demandées, compteurs par catégorie,
domaines protégés et règle ayant protégé chacun, état final (complète / interrompue /
partielle).

**Jamais de valeurs de cookies.** Une liste de domaines reste toutefois de l'historique
de navigation : le journal est sensible, soumis à la même rétention, et désactivable.

## 9. Gestion des erreurs

- **Exécuteurs indépendants.** Une catégorie en échec n'annule pas les autres. Chacune
  retourne `{ supprimé, erreurs }` ; le rapport agrège. Pas de purge silencieusement
  partielle.
- **Service worker interrompu.** MV3 peut couper le worker pendant une purge longue.
  Parade : traitement par lots, progression persistée dans `storage.session`, reprise au
  réveil, état « interrompue » consigné.
- **Compagnon absent ou en échec.** `bridge` applique un délai de connexion court. En cas
  d'échec, l'extension dégrade — cache redevenu global, coffre sauté — et l'annonce dans
  l'aperçu, avant la purge.
- **Échec du coffre.** Purge annulée (voir §7).
- **Brave.** Mêmes API, quelques surfaces divergentes (`contentSettings` notamment).
  Détection de fonctionnalité au démarrage ; les options non supportées sont masquées
  plutôt que mises en échec.

## 10. Tests

Développement piloté par les tests.

- **`planner`** — cœur de la suite. Tables `règles × inventaire -> plan attendu`,
  exécutées sans navigateur.
- **`rules`** — matching exhaustif : formes de l'attribut `domain` des cookies,
  wildcards, égalités de score, rejet des suffixes publics.
- **`executors`** — code à plus haut risque. Un `origins` employé là où il fallait
  `excludeOrigins` supprime exactement ce que l'utilisateur voulait conserver. API
  `chrome.*` simulée, assertions sur les arguments exacts, et un test dédié à cette
  inversion précise.
- **Compagnon** — cadrage du protocole, aller-retour du coffre, comportement lorsque la
  clé du trousseau est absente.
- **Intégration** — un test fumigène : Chrome en contexte persistant via Playwright,
  extension chargée non empaquetée, cookies semés, purge lancée, survivants vérifiés
  contre la keep-list.

## 11. Distribution

```
make build      # vite build + cargo build --release
make install    # binaire vers ~/.local/bin, puis écriture du manifeste
                # NativeMessagingHosts pour les deux navigateurs :
                #   ~/.config/google-chrome/NativeMessagingHosts/
                #   ~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/
make uninstall
```

L'extension est chargée non empaquetée. Le champ `key` du manifeste fixe son ID, que le
manifeste natif déclare en `allowed_origins`.

## 12. Décisions et justifications

| Décision | Justification |
|---|---|
| Extension + compagnon mince | L'extension couvre presque tout ; le compagnon n'est justifié que par le cache par domaine et le coffre. Réimplémenter le format de profil de Chrome apporterait peu pour un risque élevé. |
| Déclenchement manuel uniquement | Demandé. Supprime les alarmes, les hooks de fermeture fragiles en MV3, et la logique de fermeture d'onglet. |
| Matrice domaine × catégorie | Demandé. Équilibre entre pouvoir et charge d'entretien, contre le tout-ou-rien par domaine et la sélection cookie par cookie. |
| Égalité résolue en faveur de la conservation | Le coût d'une suppression erronée dépasse celui d'une purge manquée. |
| `planner` pur | Met la logique décisionnelle sous tests rapides et cantonne les effets de bord aux `executors`. |
| Clé dans le trousseau système | Choisi contre la phrase secrète : pas de friction à chaque purge, au prix d'un couplage à la sécurité de la session. |
| Plage temporelle exposée | Demandée. Elle s'applique correctement à l'historique, au cache et aux téléchargements ; l'interface indique que cookies et stockage local restent en pratique tout-ou-rien. |
| Cache par domaine mis en file plutôt qu'exécuté | Purge manuelle implique navigateur ouvert, élagage du cache implique navigateur fermé. Différer est la seule façon honnête de tenir les deux ; l'alternative serait de prétendre le faire. |
