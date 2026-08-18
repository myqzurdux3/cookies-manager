# Sécurité

## Signaler une faille

Ouvrez un [avis de sécurité privé](https://github.com/myqzurdux3/cookies-manager/security/advisories/new)
plutôt qu'une issue publique. Décrivez le comportement observé, la version de
Chrome, et de quoi reproduire.

**Ne collez jamais de vraies valeurs de cookies** dans un rapport, public ou
privé : ce sont des jetons de session actifs.

## Ce qui compte comme une faille ici

Cette extension supprime des données. Les défauts les plus graves sont ceux qui
lui font **mentir sur ce qu'elle a fait** :

- une donnée annoncée comme supprimée qui ne l'est pas ;
- une donnée annoncée comme conservée qui disparaît ;
- un motif de keep-list accepté qui ne protège rien ;
- une fuite du contenu du coffre, ou de la phrase secrète.

## Modèle de menace du coffre

Le coffre de cookies est **désactivé par défaut**. Une fois actif, il conserve
des jetons de session chiffrés en `AES-256-GCM`, avec une clé dérivée par
`PBKDF2-SHA-256` à 310 000 itérations d'une phrase que l'utilisateur seul
connaît. La clé n'est jamais persistée.

Ce que le coffre ne protège pas :

- un attaquant qui a déjà la phrase secrète ;
- un attaquant capable d'exécuter du code dans le service worker au moment d'un
  nettoyage, la phrase transitant alors en mémoire ;
- l'accès physique au disque combiné à une phrase faible — le coût de PBKDF2 est
  la seule barrière.

## Surface

- Aucune requête réseau, aucune télémétrie, aucune dépendance à l'exécution.
- Aucun script injecté dans les pages.
- `host_permissions: ["<all_urls>"]` est la permission la plus large du
  manifeste. Elle est nécessaire aux opérations sur les cookies : lire ou
  supprimer un cookie exige la permission d'hôte de son domaine.
- `externally_connectable` n'est pas déclaré : aucune page web ne peut envoyer
  de message à l'extension.
- Politique de sécurité du contenu : `script-src 'self'; object-src 'self'`.

## Versions

Le projet n'a pas encore de version publiée. Seule la branche `main` est
maintenue.
