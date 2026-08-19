# Security

_Français : [SECURITY.md](SECURITY.md)_

## Reporting a vulnerability

Open a [private security advisory](https://github.com/myqzurdux3/cookies-manager/security/advisories/new)
rather than a public issue. Describe the behaviour you observed, the Chrome
version, and enough to reproduce it.

**Never paste real cookie values** into a report, public or private: those are
live session tokens.

## What counts as a vulnerability here

This extension deletes data. The most serious defects are the ones that make it
**lie about what it did**:

- data announced as deleted that is not;
- data announced as kept that disappears;
- an accepted keep-list pattern that protects nothing;
- a leak of the vault contents, or of the passphrase.

## Vault threat model

The cookie vault is **off by default**. Once enabled, it holds session tokens
encrypted with `AES-256-GCM`, with a key derived by `PBKDF2-SHA-256` over
310,000 iterations from a passphrase only the user knows. The key is never
persisted.

What the vault does not protect against:

- an attacker who already has the passphrase;
- an attacker able to run code in the service worker during a cleaning, the
  passphrase being in memory at that moment;
- physical access to the disk combined with a weak passphrase — the cost of
  PBKDF2 is the only barrier.

## Surface

- No network request, no telemetry, no runtime dependency.
- No script injected into pages.
- `host_permissions: ["<all_urls>"]` is the broadest permission in the
  manifest. It is required for cookie operations: reading or deleting a cookie
  requires the host permission for its domain.
- `externally_connectable` is not declared: no web page can send a message to
  the extension.
- Content security policy: `script-src 'self'; object-src 'self'`.

## Versions

The project has no published release yet. Only the `main` branch is maintained.
