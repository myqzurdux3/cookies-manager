# Coffre de cookies

Optionnel, désactivé par défaut. Une fois activé dans les options, les cookies
condamnés sont chiffrés et sauvegardés **avant** suppression, restaurables
pendant sept jours par défaut.

Chiffrement `AES-256-GCM`, clé dérivée d'une phrase secrète par `PBKDF2-SHA-256`
à 310 000 itérations, sel et IV tirés au hasard à chaque écriture. La clé n'est
jamais enregistrée ; le coffre vit dans `chrome.storage.local`.

## À savoir avant de l'activer

- Un coffre de cookies est un coffre de **jetons de session actifs**. Déchiffré,
  il permet d'usurper les sessions concernées sans mot de passe ni second
  facteur.
- Une phrase secrète oubliée rend le coffre définitivement illisible.
- **Un nouveau nettoyage remplace le coffre précédent.** Il n'y a qu'un seul
  enregistrement : si vous nettoyez deux fois sans restaurer entre les deux, la
  première sauvegarde est perdue.
- Si l'écriture du coffre échoue, les cookies ne sont pas supprimés : jamais de
  suppression sans la sauvegarde promise.
- Seuls les cookies sont sauvegardés — les autres catégories ne sont pas
  relisibles avant suppression. Les cookies partitionnés (CHIPS) échappent à
  l'API et ne sont donc pas sauvegardés.
- Certains cookies peuvent être refusés à la restauration par le navigateur
  lui-même (règles de préfixe `__Host-`/`__Secure-`, origine devenue invalide).
  Les refus sont rapportés un par un et n'interrompent pas la restauration des
  autres.

## Rétention

La rétention par défaut est de sept jours, réglable de 1 à 90. Le coffre est
purgé au démarrage du navigateur, à l'installation, et avant chaque nettoyage.

Un navigateur qui n'est jamais relancé et où l'on ne nettoie jamais garde donc
son coffre : la purge dépend d'un réveil du service worker.
