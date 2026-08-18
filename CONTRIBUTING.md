# Contribuer

## Mise en route

```bash
npm install
npm test
```

Node 22 ou plus récent : les scripts de `tools/` pilotent un navigateur avec le
`WebSocket` global, qui n'existe pas avant. La suite de tests, elle, tourne
aussi sous Node 20.

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

## L'audit

[docs/AUDIT.md](docs/AUDIT.md) recense ce qui a été vérifié, ce qui ne l'a pas
été, et pourquoi. À lire avant de conclure qu'un comportement est intentionnel.

## Limites du navigateur

Avant d'ajouter ou de modifier une catégorie de nettoyage, lire
[docs/limites-navigateur.md](docs/limites-navigateur.md). Plusieurs API Chrome
ne font pas ce que leur nom laisse croire, et ce fichier documente ce qui a été
vérifié, avec ses sources.

## Vérification en navigateur

`npm run verify:browser` construit puis charge l'extension dans une instance
jetable de Chrome, en headless, et exerce le vrai chemin des messages :
keep-list, aperçu contre nettoyage, sauvegarde et restauration du coffre,
avertissement de remplacement du coffre, masquage réel des écrans de la popup,
et rejet d'un message inconnu — dix vérifications. Le profil est neuf et supprimé à la fin ; votre profil
personnel n'est jamais touché.

Ce script ne vérifie rien de visuel.

**Il ne tourne pas en intégration continue.** Sur l'exécuteur GitHub,
l'extension se charge — ses cibles sont visibles — mais le contexte de ses
pages n'expose aucun `chrome.*`, et la cause n'a pas été identifiée. C'est donc
une étape locale, à lancer avant toute publication. Si vous trouvez pourquoi,
le job est prêt à être rétabli : le script rapporte `typeof chrome`, les
espaces de noms présents et l'URL évaluée en cas d'échec.

## Recette manuelle

Les tests unitaires ne touchent aucun navigateur, et le script ci-dessus ne voit
rien de l'interface. Avant de publier, jouer
[docs/recette-manuelle.md](docs/recette-manuelle.md) sur un profil Chrome dédié.

## Captures d'écran

`node tools/screenshots.mjs` régénère les images du README depuis le `dist/`
courant, en clair et en sombre, avec des données fabriquées sur des domaines
`.test`. À relancer après toute modification de l'interface.

## Icônes

Le logo n'est pas un binaire opaque : sa géométrie vit dans
`tools/make-icons.py`, qui produit le SVG de l'interface et les PNG du manifeste
à partir de la même définition. Modifier le dessin veut dire modifier ce script
et relancer `python3 tools/make-icons.py`. Pillow est requis, uniquement pour
cette régénération.
