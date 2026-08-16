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
| `python3 tools/make-icons.py` | Régénère le logo : `public/icons/logo.svg` et les PNG du manifeste |

Le logo n'est pas un binaire opaque : sa géométrie vit dans `tools/make-icons.py`,
qui produit à la fois le SVG de l'interface et les PNG 16/32/48/128 du manifeste,
à partir de la même définition. Modifier le dessin veut dire modifier ce script et
relancer la commande. Seul Pillow est requis, et seulement pour cette régénération.

## Syntaxe des motifs de keep-list

| Vous tapez | Enregistré comme | Couvre |
|---|---|---|
| `github.com` | `github.com` | cet hôte exactement, plus ses cookies de domaine `.github.com` |
| `*.github.com` | `*.github.com` | `github.com` et tous ses sous-domaines |
| `*google.com` | `*.google.com` | corrigé : le point manquant est ajouté |
| `.claude.ai` | `*.claude.ai` | corrigé : un point de tête vaut wildcard |
| `https://github.com/x` | `github.com` | corrigé : seul l'hôte est retenu |
| `*` | `*` | tous les sites |

`*google.com` n'est **pas** interprété comme un suffixe littéral : cela couvrirait
aussi `evilgoogle.com`, transformant une faute de frappe en faille. Les motifs
impossibles à corriger (`git*hub.com`, espaces, motif vide) sont refusés à la
saisie avec la raison. Les profils enregistrés avant cette règle sont réparés au
chargement.

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

## Coffre de cookies (optionnel, désactivé par défaut)

Activable dans les options. Une fois actif, les cookies condamnés sont chiffrés
et sauvegardés avant suppression, restaurables pendant sept jours par défaut.

Chiffrement `AES-256-GCM`, clé dérivée d'une phrase secrète par `PBKDF2-SHA-256`.
La clé n'est jamais enregistrée, le coffre vit dans `chrome.storage.local`.

À savoir avant de l'activer :

- Un coffre de cookies est un coffre de **jetons de session actifs**. Déchiffré,
  il permet d'usurper les sessions concernées sans mot de passe ni second
  facteur.
- Une phrase secrète oubliée rend le coffre définitivement illisible.
- Si l'écriture du coffre échoue, les cookies ne sont pas supprimés : jamais de
  suppression sans la sauvegarde promise.
- Seuls les cookies sont sauvegardés. Les autres catégories ne sont pas
  relisibles avant suppression.
- Certains cookies peuvent être refusés à la restauration par le navigateur
  lui-même (règles de préfixe, origine devenue invalide). Les refus sont
  rapportés un par un ; ils n'interrompent pas la restauration des autres.

## Vie privée

Aucune requête réseau, aucune télémétrie, aucune dépendance runtime. Les
profils restent dans `chrome.storage.local` et ne sont jamais synchronisés.
