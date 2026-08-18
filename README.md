<h1 align="center">Cookies Manager</h1>

<p align="center">
  Extension Chrome qui supprime les données de navigation<br>
  <strong>en conservant celles des sites que vous listez</strong>.
</p>

<p align="center">
  <a href="https://github.com/myqzurdux3/cookies-manager/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/myqzurdux3/cookies-manager/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Licence MIT" src="https://img.shields.io/badge/licence-MIT-blue.svg"></a>
  <img alt="Manifest V3" src="https://img.shields.io/badge/manifest-v3-lightgrey.svg">
  <img alt="Zéro dépendance à l'exécution" src="https://img.shields.io/badge/dépendances%20runtime-0-brightgreen.svg">
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/popup-sombre.png">
    <img alt="Popup de l'extension : aperçu de ce qui va être supprimé" src="docs/images/popup-clair.png" width="340">
  </picture>
</p>

La keep-list se croise avec les catégories de données : garder les cookies de
`github.com` sans garder son historique. L'aperçu annonce exactement ce qui va
disparaître, avant de toucher à quoi que ce soit.

## Installation

```bash
npm install
npm run build
```

Puis `chrome://extensions` → mode développeur → « Charger l'extension non
empaquetée » → choisir `dist/`.

## Usage

Cliquer sur l'icône ouvre la popup : choisir un profil, lire l'aperçu, nettoyer.
Deux profils existent par défaut, « léger » et « complet ».

## Configuration

Un profil décrit une période, des catégories à nettoyer, et une liste de sites
conservés.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/options-sombre.png">
    <img alt="Page d'options : catégories nettoyées et grille des sites conservés" src="docs/images/options-clair.png">
  </picture>
</p>

Motifs acceptés :

| Vous tapez     | Enregistré comme | Couvre                                                         |
| -------------- | ---------------- | -------------------------------------------------------------- |
| `github.com`   | `github.com`     | cet hôte exactement, plus ses cookies de domaine `.github.com` |
| `*.github.com` | `*.github.com`   | `github.com` et tous ses sous-domaines                         |
| `*`            | `*`              | tous les sites                                                 |

Les fautes courantes sont corrigées à la saisie : `*google.com` devient
`*.google.com`, `.claude.ai` devient `*.claude.ai`, une URL collée est réduite à
son hôte, un nom unicode est converti en punycode. `*google.com` n'est **pas**
interprété comme un suffixe littéral : cela couvrirait aussi `evilgoogle.com`.
Un motif impossible à corriger est refusé avec sa raison.

## À lire avant de se fier à la keep-list

Toutes les catégories ne se filtrent pas par site, et certaines ne font pas ce
qu'on croit. Ces limites viennent de Chrome, pas de cette extension, et elles
sont [documentées et vérifiées une par une](docs/limites-navigateur.md) — dont
celles-ci, mesurées dans un vrai navigateur :

- **Mots de passe** : depuis Chrome 144, le navigateur ignore leur suppression
  par une extension. L'extension le détecte et le dit, plutôt que d'annoncer une
  suppression qui n'a pas lieu.
- **Autorisations de site** : une extension ne peut retirer que ses propres
  règles, jamais celles que vous avez accordées vous-même.
- **Historique** : la suppression d'une URL efface toutes ses visites, sans
  borne de temps.
- **Cookies cloisonnés** : ceux qu'un service tiers pose depuis une page ne sont
  pas visibles de l'API, et survivent même à un nettoyage total.
- **Cache HTTP** : protégeable par site, mais le filtre porte sur l'URL de la
  ressource — ce qu'un site charge depuis un CDN tiers est vidé quand même.

Le [coffre de cookies](docs/coffre.md) est optionnel et désactivé par défaut :
il chiffre les cookies condamnés avant de les supprimer, pour pouvoir les
restaurer.

## Vie privée

Aucune requête réseau, aucune télémétrie, **aucune dépendance à l'exécution**.
Les profils restent dans `chrome.storage.local` et ne sont jamais synchronisés.
La permission `<all_urls>` sert uniquement aux opérations sur les cookies.

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md). En résumé : `npm test`, `npm run lint`,
et `npm run verify:browser`, qui charge l'extension dans un vrai navigateur.

## Licence

MIT — voir [LICENSE](LICENSE).
