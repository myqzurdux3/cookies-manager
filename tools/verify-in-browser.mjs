#!/usr/bin/env node
/**
 * Vérifie l'extension dans un vrai navigateur, sans dépendance.
 *
 * La suite de tests n'ouvre aucun navigateur : elle parle à de faux objets
 * `chrome.*`. Ce script fait l'inverse — il charge `dist/` dans une instance
 * jetable de Chrome ou Brave et exerce le vrai chemin des messages, jusqu'à la
 * sauvegarde et la restauration du coffre.
 *
 * Il ne remplace pas docs/recette-manuelle.md : rien de visuel n'est vérifié.
 *
 *   npm run build && node tools/verify-in-browser.mjs
 *
 * Le profil du navigateur est neuf, isolé et supprimé à la fin. Votre profil
 * personnel n'est jamais touché.
 */
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.CDP_PORT ?? 9366);
const DIST = new URL('../dist/', import.meta.url).pathname;
const BROWSERS = [
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'brave-browser',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function check(label, ok, detail) {
  results.push({ label, ok, detail });
  console.log(`${ok ? '  ok  ' : ' ÉCHEC'} ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Parcourt PATH à la main : lancer un shell pour ça ouvrirait une injection. */
async function findBrowser() {
  const dirs = (process.env.PATH ?? '').split(':').filter(Boolean);
  for (const name of BROWSERS) {
    for (const dir of dirs) {
      const candidate = join(dir, name);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Pas là, on continue.
      }
    }
  }
  return null;
}

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('connexion CDP impossible'));
  });
  let id = 1;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  };
  return {
    send(method, params = {}) {
      const n = id++;
      ws.send(JSON.stringify({ id: n, method, params }));
      return new Promise((res, rej) => pending.set(n, { res, rej }));
    },
    close: () => ws.close(),
  };
}

async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return r.json();
}

/** Un service worker MV3 s'endort : ouvrir une page de l'extension le réveille. */
async function waitFor(pred, extensionId, page = 'popup.html') {
  for (let i = 0; i < 20; i += 1) {
    const list = await targets();
    const hit = list.find(pred);
    if (hit) return hit;
    const known =
      extensionId ?? list.find((t) => t.url.startsWith('chrome-extension://'))?.url.split('/')[2];
    if (known) {
      await fetch(`http://127.0.0.1:${PORT}/json/new?chrome-extension://${known}/${page}`, {
        method: 'PUT',
      }).catch(() => {});
    }
    await sleep(700);
  }
  throw new Error('cible introuvable dans le navigateur');
}

async function evaluate(client, expression) {
  const r = await client.send('Runtime.evaluate', {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  }
  return r.result.value;
}

const browser = await findBrowser();
if (!browser) {
  console.error('Aucun navigateur Chromium trouvé. Cherché :', BROWSERS.join(', '));
  process.exit(2);
}

/**
 * Le port doit être libre : `brave-browser` et `google-chrome` sont des
 * enveloppes shell, et tuer le processus lancé ne tue pas toujours le
 * navigateur. Se raccrocher à une instance survivante ferait tourner la
 * vérification sur un profil déjà sale — et rendrait le résultat faux.
 */
async function portLibre() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1000) });
    return false;
  } catch {
    return true;
  }
}

if (!(await portLibre())) {
  console.error(
    `Le port ${PORT} est déjà occupé — une instance précédente n'est pas morte.\n` +
      `Fermez-la, ou relancez avec CDP_PORT=<autre port>.`,
  );
  process.exit(2);
}

const profile = await mkdtemp(join(tmpdir(), 'cookies-manager-verif-'));
const proc = spawn(
  browser,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--load-extension=${DIST}`,
    `--disable-extensions-except=${DIST}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-background-networking',
    'about:blank',
  ],
  // Groupe de processus dédié : le navigateur se lance derrière une enveloppe
  // shell, et seul un signal au groupe entier l'arrête réellement.
  { stdio: 'ignore', detached: true },
);

let code = 0;
try {
  await sleep(2500);
  const sw = await waitFor((t) => t.type === 'service_worker');
  const extensionId = new URL(sw.url).host;
  console.log(`Navigateur : ${browser}\nExtension  : ${extensionId}\n`);

  const swClient = await cdp(sw.webSocketDebuggerUrl);
  await swClient.send('Runtime.enable');

  await fetch(`http://127.0.0.1:${PORT}/json/new?chrome-extension://${extensionId}/options.html`, {
    method: 'PUT',
  });
  const optionsPage = await waitFor(
    (t) => t.type === 'page' && t.url.endsWith('options.html'),
    extensionId,
    'options.html',
  );
  const pageClient = await cdp(optionsPage.webSocketDebuggerUrl);
  await pageClient.send('Runtime.enable');

  const send = (message) =>
    evaluate(pageClient, `return chrome.runtime.sendMessage(${JSON.stringify(message)});`);

  // --- La keep-list protège ce qu'elle annonce ---
  await evaluate(
    swClient,
    `for (const c of [
       {url:'https://garde.test/', name:'session', value:'a'},
       {url:'https://sous.garde.test/', name:'session', value:'b'},
       {url:'https://efface.test/', name:'session', value:'c'},
     ]) await chrome.cookies.set(c);`,
  );

  await send({
    type: 'SAVE_PROFILE',
    profile: {
      id: 'verif',
      name: 'Vérification',
      since: 'all',
      categories: ['cookies'],
      keepRules: [{ pattern: '*.garde.test', keep: { cookies: true } }],
    },
  });

  const preview = await send({ type: 'PREVIEW', profileId: 'verif' });
  check(
    'l’aperçu annonce un seul cookie à supprimer',
    preview.data?.[0]?.preview?.items === 1,
    `items=${preview.data?.[0]?.preview?.items}`,
  );

  const clean = await send({ type: 'CLEAN', profileId: 'verif' });
  const cookiesReport = clean.data?.[0]?.report;
  check(
    'le nettoyage supprime 1 cookie et en garde 2',
    cookiesReport?.deleted === 1 && cookiesReport?.kept === 2,
    JSON.stringify(cookiesReport),
  );

  const restants = await evaluate(
    swClient,
    `return (await chrome.cookies.getAll({})).map(c => c.domain).sort().join(',');`,
  );
  check(
    'le wildcard couvre l’apex et le sous-domaine',
    restants === 'garde.test,sous.garde.test',
    restants,
  );

  // --- Le coffre : sauvegarde puis restauration ---
  await send({ type: 'SAVE_SETTINGS', settings: { vaultEnabled: true, vaultRetentionDays: 7 } });
  await send({
    type: 'SAVE_PROFILE',
    profile: {
      id: 'total',
      name: 'Total',
      since: 'all',
      categories: ['cookies'],
      keepRules: [],
    },
  });
  await send({ type: 'CLEAN', profileId: 'total', passphrase: 'phrase de vérification' });

  const vide = await evaluate(swClient, `return (await chrome.cookies.getAll({})).length;`);
  check('tous les cookies ont disparu', vide === 0, `restants=${vide}`);

  const mauvaise = await send({ type: 'VAULT_RESTORE', passphrase: 'mauvaise phrase' });
  check('une mauvaise phrase est refusée', mauvaise.ok === false, mauvaise.error);

  const bonne = await send({ type: 'VAULT_RESTORE', passphrase: 'phrase de vérification' });
  check(
    'la bonne phrase restaure les cookies',
    bonne.ok === true && bonne.data.restored === 2 && bonne.data.failures.length === 0,
    JSON.stringify(bonne.data ?? bonne.error),
  );

  // --- La popup masque vraiment ce qu'elle déclare masqué ---
  // L'attribut `hidden` ne tient que par une règle de la feuille du navigateur,
  // qu'une règle d'auteur écrase sans bruit. Seul un vrai navigateur le voit.
  await fetch(`http://127.0.0.1:${PORT}/json/new?chrome-extension://${extensionId}/popup.html`, {
    method: 'PUT',
  });
  const popupPage = await waitFor(
    (t) => t.type === 'page' && t.url.endsWith('popup.html'),
    extensionId,
  );
  const popupClient = await cdp(popupPage.webSocketDebuggerUrl);
  await popupClient.send('Runtime.enable');
  await sleep(800);

  const masques = await evaluate(
    popupClient,
    `const style = (sel) => getComputedStyle(document.querySelector(sel)).display;
     return [style('#preview'), style('#report'), style('#danger'), style('#vault')].join(',');`,
  );
  check(
    'la popup masque aperçu, rapport et encarts au chargement',
    masques === 'none,none,none,none',
    masques,
  );

  const bascule = await evaluate(
    popupClient,
    `document.querySelector('#profiles button').click();
     await new Promise((r) => setTimeout(r, 600));
     return [
       getComputedStyle(document.querySelector('#chooser')).display === 'none',
       getComputedStyle(document.querySelector('#preview')).display !== 'none',
     ].join(',');`,
  );
  check('choisir un profil remplace la liste par l’aperçu', bascule === 'true,true', bascule);
  popupClient.close();

  // --- Le routeur rejette ce qu'il ne connaît pas ---
  const inconnu = await send({ type: 'MESSAGE_QUI_N_EXISTE_PAS' });
  check('un message inconnu est rejeté', inconnu.ok === false, inconnu.error);

  swClient.close();
  pageClient.close();
} catch (cause) {
  check('déroulement du script', false, cause instanceof Error ? cause.message : String(cause));
} finally {
  await arreter();
  await rm(profile, { recursive: true, force: true });
}

/**
 * Le navigateur se lance derrière une enveloppe shell : signaler le groupe de
 * processus est nécessaire, mais pas toujours suffisant. On attend que le port
 * soit réellement relâché, puis on escalade — une instance survivante ferait
 * échouer la prochaine exécution sur un profil sale.
 */
async function arreter() {
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    try {
      process.kill(-proc.pid, signal);
    } catch {
      try {
        proc.kill(signal);
      } catch {
        // Déjà mort.
      }
    }
    for (let i = 0; i < 10; i += 1) {
      if (await portLibre()) return;
      await sleep(300);
    }
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications passées`);
if (failed.length > 0) code = 1;
process.exit(code);
