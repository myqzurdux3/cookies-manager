# Ce que l'API du navigateur ne permet pas

Ces limites viennent de Chrome, pas de cette extension. Chacune est vérifiée
contre la documentation officielle ou la source Chromium, référence à l'appui.

## Mots de passe : suppression retirée depuis Chrome 144

`browsingData.remove` **ignore** le type `passwords` depuis Chrome 144 (stable
le 13 janvier 2026) : « Support for password deletion through extensions has
been removed. This data type will be ignored. » L'appel réussit sans rien
supprimer.

L'extension détecte la version du navigateur et refuse explicitement la
catégorie plutôt que d'annoncer une suppression qui n'a pas lieu. Pour effacer
vos mots de passe, passez par Chrome, Paramètres, Suppression des données de
navigation.

Les données de formulaire ne sont pas concernées : ce type fonctionne toujours.

## Autorisations de site : l'extension ne peut pas effacer vos choix

`contentSettings.<type>.clear()` n'efface que « all content setting rules set by
this extension ». Dans Chromium, l'appel se résout en
`ClearContentSettingsForExtensionAndContentType(extension_id, …)` : les règles
posées par une extension vivent dans un fournisseur distinct, superposé aux
préférences de l'utilisateur, et l'appel ne touche jamais ces dernières.

**Conséquence : la catégorie « Autorisations de site » ne supprime pas les
autorisations que vous avez accordées vous-même dans Chrome.** Aucune API
d'extension stable ne le permet — `browsingData` n'expose aucune clé vers les
types internes correspondants.

Une extension peut en revanche _masquer_ une autorisation utilisateur en posant
sa propre règle, qui prend le pas tant qu'elle est installée. Ce n'est pas une
suppression.

## Cache HTTP : filtrable, mais pas comme on l'attend

Contrairement à ce que cette documentation affirmait jusqu'ici, l'API **accepte**
`origins` et `excludeOrigins` pour le cache, depuis Chrome 74 : « Only supported
for cookies, storage and cache. »

Cette extension n'en tire pas parti, et c'est délibéré : le filtre s'applique à
l'**URL de la ressource**, pas au site visité. Exclure `https://exemple.com` ne
préserverait que les ressources servies par ce domaine — pas les images, polices
ou scripts que le site charge depuis un CDN tiers. Une case « conserver le cache
de ce site » promettrait donc plus qu'elle ne tient.

À savoir aussi : la borne de temps porte sur la **dernière utilisation** d'une
entrée de cache, pas sur sa création.

## Historique : la suppression n'est pas bornée dans le temps

`history.deleteUrl` « removes all occurrences of the given URL from the
history » — sans borne de temps. Un profil réglé sur « dernière heure » efface
donc **toutes** les visites des URL concernées, y compris celles d'il y a six
mois.

Il n'existe aucune façon de contourner cela : `history.deleteRange` borne le
temps mais n'accepte ni URL ni exclusion, et `browsingData.remove` avec
`{history: true}` refuse le filtrage par origine.

## Cookies partitionnés : hors de portée

`cookies.getAll({})` ne rend **pas** les cookies partitionnés (CHIPS) : il faut
fournir une `partitionKey`. Ces cookies ne sont donc ni comptés dans l'aperçu,
ni supprimés, ni sauvegardés dans le coffre.

## Cookies : pas de filtre de période

L'API ne fournit pas la date de création d'un cookie. Le réglage de période ne
s'applique donc pas à cette catégorie, ce que l'aperçu annonce.

## Stockage web : l'aperçu est un minorant

Aucune API n'énumère les origines qui stockent des données. La liste des sites
protégés est dérivée des cookies et de l'historique : elle est partielle, et un
motif à wildcard ne protège que les hôtes ainsi découverts.

## Permission `<all_urls>`

Le manifeste demande `host_permissions: ["<all_urls>"]`. C'est la permission
d'installation la plus large de Chrome, et elle est nécessaire : lire et
supprimer un cookie exige la permission d'hôte du domaine concerné, et
l'extension ne sait pas à l'avance quels domaines sont présents.

Elle ne sert qu'à cela. L'extension n'émet aucune requête réseau et n'injecte
aucun script dans les pages.

## Sources

- [chrome.browsingData](https://developer.chrome.com/docs/extensions/reference/api/browsingData)
- [chrome.contentSettings](https://developer.chrome.com/docs/extensions/reference/api/contentSettings)
- [chrome.cookies](https://developer.chrome.com/docs/extensions/reference/api/cookies)
- [chrome.history](https://developer.chrome.com/docs/extensions/reference/api/history)
- [content_settings_api.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/extensions/api/content_settings/content_settings_api.cc)
- [browsing_data_api.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/extensions/api/browsing_data/browsing_data_api.cc)
