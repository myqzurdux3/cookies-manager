# Journal des modifications

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et le
versionnage [semver](https://semver.org/lang/fr/).

_English: [below](#changelog-english)._

## [0.1.0] — 2026-08-19

Première version publiée.

### Ajouté

- **Profils de nettoyage** : une période, des catégories, et une keep-list par
  site. Deux profils livrés, « léger » et « complet ».
- **Keep-list croisée avec les catégories** : garder les cookies d'un site sans
  garder son historique. Motifs `exemple.com`, `*.exemple.com` et `*`, avec
  correction des saisies mal formées et refus motivé de ce qui n'est pas
  corrigeable.
- **Aperçu avant nettoyage** : ce qui va disparaître, catégorie par catégorie,
  avec les limites du navigateur annoncées là où elles s'appliquent.
- **Onze catégories** : cookies, stockage local, IndexedDB, cache des
  applications, service workers, cache HTTP, historique, liste des
  téléchargements, données de formulaire, mots de passe, autorisations de site.
- **Coffre de cookies**, optionnel et désactivé par défaut : les cookies
  condamnés sont chiffrés en `AES-256-GCM` avant suppression, clé dérivée par
  `PBKDF2-SHA-256` à 310 000 itérations. Rétention réglable de 1 à 90 jours.
  Un coffre existant est annoncé avant d'être remplacé.
- **Interface bilingue français / anglais**, suivant la langue du navigateur ou
  forcée dans les options.
- **Export et import des profils** en JSON, validés à l'import.
- Thème clair et sombre, suivant le système.

### Sécurité

- Aucune requête réseau, aucune télémétrie, aucune dépendance à l'exécution.
- Aucun script injecté dans les pages, `externally_connectable` non déclaré.
- Les profils restent dans `chrome.storage.local`, jamais synchronisés.
- La phrase secrète du coffre n'est jamais enregistrée et ne vit que le temps
  d'un nettoyage.

### Limites connues

Documentées et mesurées dans un vrai navigateur — voir
[docs/limites-navigateur.md](docs/limites-navigateur.md) :

- Chrome 144 et suivants **ignorent** la suppression des mots de passe par une
  extension. L'extension le détecte et le signale au lieu de prétendre l'avoir
  faite.
- Les **cookies cloisonnés (CHIPS)** sont hors de portée de l'API : un nettoyage
  total les laisse intacts.
- Les **autorisations de site** que vous avez accordées vous-même ne peuvent pas
  être effacées par une extension.
- La suppression d'une **URL de l'historique** efface toutes ses visites, sans
  borne de temps.
- La protection du **cache HTTP** est partielle : le filtre porte sur l'URL de
  la ressource, pas sur le site visité.
- Les **cookies** n'ont pas de filtre de période : l'API n'expose pas leur date
  de création.

### Vérifications à la publication

341 tests, 96 % de couverture, `npm audit` à 0 vulnérabilité, et 13/13
vérifications dans un vrai Chromium (`npm run verify:browser`).

`docs/recette-manuelle.md` — la recette visuelle sur un profil Chrome dédié —
**n'a pas été jouée** pour cette version.

---

<a id="changelog-english"></a>

# Changelog (English)

## [0.1.0] — 2026-08-19

First published release.

### Added

- **Cleaning profiles**: a time range, categories, and a per-site keep-list. Two
  profiles ship by default, “light” and “full”.
- **Keep-list crossed with categories**: keep a site's cookies without keeping
  its history. Patterns `example.com`, `*.example.com` and `*`, with malformed
  entries corrected and uncorrectable ones refused with a reason.
- **Preview before cleaning**: what is about to disappear, category by category,
  with the browser's limits stated where they apply.
- **Eleven categories**: cookies, local storage, IndexedDB, application cache,
  service workers, HTTP cache, history, download list, form data, passwords,
  site permissions.
- **Cookie vault**, optional and off by default: doomed cookies are encrypted
  with `AES-256-GCM` before deletion, key derived by `PBKDF2-SHA-256` over
  310,000 iterations. Retention adjustable from 1 to 90 days. An existing vault
  is announced before being replaced.
- **Bilingual French / English interface**, following the browser language or
  forced in the options.
- **Profile export and import** as JSON, validated on import.
- Light and dark theme, following the system.

### Security

- No network request, no telemetry, no runtime dependency.
- No script injected into pages, `externally_connectable` not declared.
- Profiles stay in `chrome.storage.local`, never synchronised.
- The vault passphrase is never stored and only lives for the duration of a
  cleaning.

### Known limits

Documented and measured in a real browser — see
[docs/browser-limits.md](docs/browser-limits.md):

- Chrome 144 and later **ignore** password deletion by an extension. The
  extension detects this and reports it instead of pretending it happened.
- **Partitioned cookies (CHIPS)** are out of reach of the API: a full cleaning
  leaves them intact.
- **Site permissions** you granted yourself cannot be erased by an extension.
- Deleting a **history URL** erases all of its visits, with no time bound.
- **HTTP cache** protection is partial: the filter applies to the URL of the
  resource, not to the site visited.
- **Cookies** have no time filter: the API does not expose their creation date.

### Release checks

341 tests, 96% coverage, `npm audit` clean, and 13/13 checks in a real Chromium
(`npm run verify:browser`).

`docs/recette-manuelle.md` — the visual test plan on a dedicated Chrome profile
— **was not played** for this release.

[0.1.0]: https://github.com/myqzurdux3/cookies-manager/releases/tag/v0.1.0
