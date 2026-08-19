# What the browser API does not allow

_Français : [limites-navigateur.md](limites-navigateur.md)_

These limits come from Chrome, not from this extension. Each one is checked
against the official documentation or the Chromium source, with the reference
given.

## Passwords: deletion removed as of Chrome 144

`browsingData.remove` **ignores** the `passwords` type as of Chrome 144 (stable
on 13 January 2026): “Support for password deletion through extensions has been
removed. This data type will be ignored.” The call succeeds without deleting
anything.

The extension detects the browser version and explicitly refuses the category,
rather than announcing a deletion that does not happen. To erase your passwords,
go to Chrome, Settings, Delete browsing data.

Form data is not affected: that type still works.

## Site permissions: the extension cannot erase your choices

`contentSettings.<type>.clear()` only erases “all content setting rules set by
this extension”. In Chromium, the call resolves to
`ClearContentSettingsForExtensionAndContentType(extension_id, …)`: the rules set
by an extension live in a separate provider, layered on top of the user’s
preferences, and the call never touches the latter.

**Consequence: the “Site permissions” category does not delete the permissions
you granted yourself in Chrome.** No stable extension API allows it —
`browsingData` exposes no key to the corresponding internal types.

An extension can, however, _mask_ a user permission by setting its own rule,
which takes precedence for as long as it is installed. That is not a deletion.

## HTTP cache: filterable, but the protection is partial

The API accepts `origins` and `excludeOrigins` for the cache as of Chrome 74:
“Only supported for cookies, storage and cache.” This documentation claimed the
opposite until the audit; that was wrong.

The extension now makes use of it: the cache appears in the keep-list grid, and
protected origins are excluded from the wipe. **But the protection is partial,
and you should know this before ticking the box:**

- The filter applies to the **URL of the resource**, not to the site visited.
  Protecting `example.com` preserves what `example.com` serves — not the images,
  fonts or scripts the page loads from a third-party CDN. A protected site will
  therefore partly reload from the network.
- Conversely, protecting a CDN domain would preserve its resources for **every**
  site that uses it.
- The time bound applies to an entry’s **last use**, not to its creation.

The preview repeats these limits as soon as at least one site is protected.

## History: deletion is not bounded in time

`history.deleteUrl` “removes all occurrences of the given URL from the history”
— with no time bound. A profile set to “last hour” therefore erases **all**
visits to the URLs concerned, including those from six months ago.

There is no way around this: `history.deleteRange` bounds time but accepts
neither URLs nor exclusions, and `browsingData.remove` with `{history: true}`
refuses per-origin filtering.

## Partitioned cookies (CHIPS): out of reach

A third-party service embedded in a page — a chat widget, a video player — can
set a cookie **partitioned by the site visited**. The same widget on two
different sites gets two separate cookies, which stops it from following you
from one to the other.

`cookies.getAll({})` does **not** return these cookies: you have to supply the
partition key, and no API enumerates them. They are therefore invisible to the
extension: not counted in the preview, not deleted, not saved to the vault.

Measured in Chromium 150, with a normal cookie and a partitioned cookie set on
the same domain:

```
getAll({})                            → ["normal@discord.test"]
getAll({partitionKey: google.test})   → ["partitionne@discord.test"]

full cleaning, no keep-list           → deleted: 1, kept: 0
after                                  → visible [] · in the partition ["partitionne"]
```

**A full cleaning therefore leaves these cookies behind.** This does not depend
on any keep-list setting. The preview of the “Cookies” category says so.

## Cookies: no time filter

The API does not expose a cookie’s creation date. The time-range setting
therefore does not apply to this category, which the preview states.

## Web storage: the preview is a lower bound

No API enumerates the origins that store data. The list of protected sites is
derived from cookies and history: it is partial, and a wildcard pattern only
protects the hosts discovered that way.

## The `<all_urls>` permission

The manifest asks for `host_permissions: ["<all_urls>"]`. It is Chrome’s
broadest install-time permission, and it is necessary: reading and deleting a
cookie requires the host permission for the domain concerned, and the extension
cannot know in advance which domains are present.

That is all it is used for. The extension makes no network request and injects
no script into pages.

## Sources

- [chrome.browsingData](https://developer.chrome.com/docs/extensions/reference/api/browsingData)
- [chrome.contentSettings](https://developer.chrome.com/docs/extensions/reference/api/contentSettings)
- [chrome.cookies](https://developer.chrome.com/docs/extensions/reference/api/cookies)
- [chrome.history](https://developer.chrome.com/docs/extensions/reference/api/history)
- [content_settings_api.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/extensions/api/content_settings/content_settings_api.cc)
- [browsing_data_api.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/extensions/api/browsing_data/browsing_data_api.cc)
