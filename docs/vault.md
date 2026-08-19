# Cookie vault

_Français : [coffre.md](coffre.md)_

Optional, off by default. Once enabled in the options, the doomed cookies are
encrypted and saved **before** deletion, restorable for seven days by default.

`AES-256-GCM` encryption, key derived from a passphrase by `PBKDF2-SHA-256` with
310,000 iterations, salt and IV drawn at random on every write. The key is never
stored; the vault lives in `chrome.storage.local`.

## What to know before enabling it

- A cookie vault is a vault of **live session tokens**. Once decrypted, it
  allows the sessions concerned to be impersonated without a password or second
  factor.
- A forgotten passphrase makes the vault permanently unreadable.
- **A new cleaning replaces the previous vault.** There is only one record: if
  you clean twice without restoring in between, the first backup is lost. The
  popup says so before the cleaning, with the date and the cookie count of the
  existing vault.
- If writing the vault fails, the cookies are not deleted: never a deletion
  without the promised backup.
- Only cookies are saved — the other categories cannot be read back before
  deletion. Partitioned cookies (CHIPS) escape the API and are therefore not
  saved.
- Some cookies may be refused on restore by the browser itself (`__Host-` /
  `__Secure-` prefix rules, an origin that has become invalid). Refusals are
  reported one by one and do not interrupt the restoration of the others.

## Retention

The default retention is seven days, adjustable from 1 to 90. The vault is
purged on browser startup, on install, and before every cleaning.

A browser that is never restarted and where nothing is ever cleaned therefore
keeps its vault: the purge depends on the service worker waking up.
