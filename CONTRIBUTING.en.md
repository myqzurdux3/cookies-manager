# Contributing

_Français : [CONTRIBUTING.md](CONTRIBUTING.md)_

## Getting started

```bash
npm install
npm test
```

Node 22 or newer: the scripts in `tools/` drive a browser through the global
`WebSocket`, which does not exist before that. The test suite itself also runs
on Node 20.

## Commands

| Command                | Effect                            |
| ---------------------- | --------------------------------- |
| `npm test`             | Vitest suite, no browser          |
| `npm run typecheck`    | `tsc --noEmit`                    |
| `npm run lint`         | ESLint                            |
| `npm run format`       | Prettier, writing                 |
| `npm run format:check` | Prettier, checking — what CI runs |
| `npm run build`        | Produces `dist/`                  |

These five commands must pass before any proposed change. CI runs the same ones.

## What is expected of a change

- **A failing test first.** For a bug fix, the test must fail before the fix and
  pass after. Without that, nothing proves the bug existed.
- **Justify with a measurable gain.** A bug avoided, duplication removed,
  complexity reduced. “It looks nicer” is not a justification.
- **Comments explain the _why_.** The code already says the _what_. API
  constraints, trade-offs and traps deserve a comment; paraphrasing the code
  does not.

## Text and translations

The interface is bilingual. No visible text is hard-coded: it lives in
`src/i18n/fr.ts`, which is the reference, and `src/i18n/en.ts` derives from it
by typing — a key missing in English does not compile. Static markup carries
`data-i18n`.

Two tests guard that rule: `tests/i18n/aucune-chaine-figee.test.ts` refuses any
accented string outside the dictionaries, and `tests/ui/static.test.ts` checks
that every key in the HTML exists on both sides.

Five pairs of files change together:

| Français                     | English                  |
| ---------------------------- | ------------------------ |
| `README.md`                  | `README.en.md`           |
| `SECURITY.md`                | `SECURITY.en.md`         |
| `CONTRIBUTING.md`            | `CONTRIBUTING.en.md`     |
| `docs/limites-navigateur.md` | `docs/browser-limits.md` |
| `docs/coffre.md`             | `docs/vault.md`          |

`docs/AUDIT.md` and `docs/recette-manuelle.md` stay in French only. They are
working documents, not welcome documents.

## The audit

[docs/AUDIT.md](docs/AUDIT.md) _(in French)_ records what was verified, what was
not, and why. Read it before concluding that a behaviour is intentional.

## Browser limits

Before adding or changing a cleaning category, read
[docs/browser-limits.md](docs/browser-limits.md). Several Chrome APIs do not do
what their name suggests, and that file documents what was verified, with its
sources.

## Browser verification

`npm run verify:browser` builds the extension, loads it into a disposable Chrome
instance in headless mode, and exercises the real message path: keep-list,
preview against cleaning, vault backup and restore, the vault replacement
warning, the popup screens actually being hidden, the service worker switching
language, and an unknown message being rejected — thirteen checks. The profile
is fresh and deleted at the end; your own profile is never touched.

This script verifies nothing visual.

**It does not run in continuous integration.** On the GitHub runner the
extension loads — its targets are visible — but the context of its pages exposes
no `chrome.*`, and the cause was never identified. It is therefore a local step,
to run before any release. If you find out why, the job is ready to be restored:
on failure the script reports `typeof chrome`, the namespaces present, and the
URL it evaluated.

## Manual test plan

Unit tests never touch a browser, and the script above sees nothing of the
interface. Before releasing, play
[docs/recette-manuelle.md](docs/recette-manuelle.md) _(in French)_ on a
dedicated Chrome profile.

## Screenshots

`node tools/screenshots.mjs` regenerates the README images from the current
`dist/`, in light and dark, with fabricated data on `.test` domains. Run it
again after any interface change.

## Icons

The logo is not an opaque binary: its geometry lives in `tools/make-icons.py`,
which produces both the SVG used by the interface and the PNGs of the manifest
from the same definition. Changing the drawing means changing that script and
running `python3 tools/make-icons.py` again. Pillow is required, for that
regeneration only.
