# Contribuer

## Mise en route

```bash
npm install
npm test
```

## Commandes

| Commande               | Effet                                          |
| ---------------------- | ---------------------------------------------- |
| `npm test`             | Suite Vitest, sans navigateur                  |
| `npm run typecheck`    | `tsc --noEmit`                                 |
| `npm run lint`         | ESLint                                         |
| `npm run format`       | Prettier, en écriture                          |
| `npm run format:check` | Prettier, en vérification — ce que lance la CI |
| `npm run build`        | Produit `dist/`                                |

Ces cinq commandes doivent passer avant toute proposition de modification. La CI
lance les mêmes.

## Attentes sur les modifications

- **Un test qui échoue d'abord.** Pour une correction de bug, le test doit
  échouer avant la correction et passer après. Sans cela, rien ne prouve que le
  bug existait.
- **Justifier par un gain mesurable.** Bug évité, duplication supprimée,
  complexité réduite. « C'est plus joli » n'est pas une justification.
- **Les commentaires expliquent le _pourquoi_.** Le code dit déjà le _quoi_.
  Les contraintes d'API, les compromis et les pièges méritent un commentaire ;
  la paraphrase du code, non.

## Limites du navigateur

Avant d'ajouter ou de modifier une catégorie de nettoyage, lire
[docs/limites-navigateur.md](docs/limites-navigateur.md). Plusieurs API Chrome
ne font pas ce que leur nom laisse croire, et ce fichier documente ce qui a été
vérifié, avec ses sources.

## Vérification en navigateur

`npm run verify:browser` construit puis charge l'extension dans une instance
jetable de Chrome ou Brave, en headless, et exerce le vrai chemin des messages :
keep-list, aperçu contre nettoyage, sauvegarde et restauration du coffre, rejet
d'un message inconnu. Le profil est neuf et supprimé à la fin ; votre profil
personnel n'est jamais touché.

Ce script ne vérifie rien de visuel.

## Recette manuelle

Les tests unitaires ne touchent aucun navigateur, et le script ci-dessus ne voit
rien de l'interface. Avant de publier, jouer
[docs/recette-manuelle.md](docs/recette-manuelle.md) sur un profil Chrome dédié.

## Icônes

Le logo n'est pas un binaire opaque : sa géométrie vit dans
`tools/make-icons.py`, qui produit le SVG de l'interface et les PNG du manifeste
à partir de la même définition. Modifier le dessin veut dire modifier ce script
et relancer `python3 tools/make-icons.py`. Pillow est requis, uniquement pour
cette régénération.
