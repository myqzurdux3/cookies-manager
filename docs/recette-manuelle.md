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

## Scénario 4 — les permissions optionnelles sont demandées

1. Retirer la permission `history` dans `chrome://extensions` → détails.
2. Lancer un profil qui inclut l'historique.

Attendu : le navigateur demande la permission ; un refus affiche un message
d'échec sans rien supprimer.

## Scénario 5 — le journal enregistre

1. Après un nettoyage, ouvrir la console du service worker.
2. Lire `chrome.storage.local.get('runs')`.

Attendu : le nettoyage figure en tête, le journal ne dépasse pas 20 entrées.
