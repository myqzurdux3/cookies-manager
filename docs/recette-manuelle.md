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

3. Sur Chrome 144 ou plus récent, lancer quand même le nettoyage.

Attendu : la ligne « Mots de passe » rapporte un échec explicite renvoyant vers
les paramètres de Chrome — et non « vidé entièrement ». Le navigateur ignore
cette suppression depuis la version 144.

## Scénario 4 — les permissions optionnelles sont demandées

1. Retirer la permission `history` dans `chrome://extensions` → détails.
2. Lancer un profil qui inclut l'historique.

Attendu : le navigateur demande la permission ; un refus affiche un message
d'échec sans rien supprimer.

## Scénario 5 bis — le coffre protège d'une keep-list mal réglée

1. Options → cocher « Sauvegarder les cookies avant suppression », enregistrer.
2. Lancer un nettoyage des cookies **sans** protéger `github.com`, en saisissant
   une phrase secrète dans la popup.
3. Constater la déconnexion de `github.com`.
4. Options → saisir la même phrase → « Restaurer les cookies ».

Attendu : la session `github.com` est de nouveau active après rechargement.

5. Refaire une restauration avec une phrase fausse.

Attendu : message « phrase incorrecte », aucun cookie restauré.

6. Vider le champ de rétention à `0` et enregistrer.

Attendu : les réglages sont refusés avec un message sur la rétention.

## Scénario 5 ter — pas de suppression sans sauvegarde

1. Coffre actif, lancer un nettoyage des cookies en laissant la phrase vide.

Attendu : la popup refuse et annonce que rien n'a été supprimé.

## Scénario 5 quater — le récap dit ce qui est parti

1. Lancer un nettoyage sur un profil incluant cookies, historique et cache HTTP,
   avec au moins un site dans la keep-list.

Attendu : le bandeau de total additionne les suppressions, le cache HTTP
s'affiche « vidé entièrement » et non « 0 supprimé », et les sites protégés
apparaissent en pastilles sous « Sites épargnés ».

## Scénario 7 — la suppression du coffre demande une confirmation

1. Options → « Supprimer le coffre ».

Attendu : le bouton passe à « Confirmer la suppression », un message rouge
l'annonce, et rien n'est supprimé.

2. Cliquer une seconde fois.

Attendu : le coffre est supprimé, le bouton revient à son libellé d'origine.

## Scénario 8 — une erreur du service worker se voit

1. `chrome://extensions` → arrêter le service worker de l'extension, puis
   ouvrir la popup et enchaîner rapidement sur un aperçu.

Attendu : en cas d'échec, la popup affiche la cause au lieu de rester figée, et
le bouton « Nettoyer » reste utilisable pour réessayer.

## Scénario 6 — le journal enregistre

1. Après un nettoyage, ouvrir la console du service worker.
2. Lire `chrome.storage.local.get('runs')`.

Attendu : le nettoyage figure en tête, le journal ne dépasse pas 20 entrées.
