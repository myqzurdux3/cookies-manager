# Cookies Manager

Extension Chrome et Brave qui supprime les données de navigation en conservant
celles des sites que vous listez. La keep-list se croise avec les catégories de
données : garder les cookies de `github.com` sans garder son historique.

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

La page d'options règle le reste : profils, catégories, sites conservés,
import/export, coffre de cookies.

## Configuration

Un profil décrit une période, des catégories à nettoyer, et une liste de sites
conservés. Motifs acceptés :

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

Toutes les catégories ne se filtrent pas par site, et certaines ne font pas ce
qu'on croit — voir [les limites du navigateur](docs/limites-navigateur.md), à
lire avant de se fier à la keep-list.

Le [coffre de cookies](docs/coffre.md) est optionnel et désactivé par défaut.

## Vie privée

Aucune requête réseau, aucune télémétrie, aucune dépendance à l'exécution. Les
profils restent dans `chrome.storage.local` et ne sont jamais synchronisés. La
permission `<all_urls>` sert uniquement aux opérations sur les cookies.

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT — voir [LICENSE](LICENSE).
