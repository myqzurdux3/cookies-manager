#!/usr/bin/env node
/**
 * Produit les captures d'écran du README, en clair et en sombre.
 *
 * Elles sont prises dans un vrai navigateur, sur le `dist/` courant, avec des
 * données fabriquées sur des domaines `.test` — jamais de données réelles.
 * Régénérer après toute modification de l'interface :
 *
 *   npm run build && node tools/screenshots.mjs
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.CDP_PORT ?? 9377);
const DIST = new URL('../dist/', import.meta.url).pathname;
const OUT = new URL('../docs/images/', import.meta.url).pathname;
const BROWSERS = [
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'brave-browser',
];

// `WebSocket` n'est global qu'à partir de Node 22 : le dire clairement plutôt
// que d'échouer sur un « WebSocket is not defined » au premier appel.
if (typeof WebSocket === 'undefined') {
  console.error(
    `Node ${process.versions.node} n'expose pas WebSocket. Ce script demande Node 22 ou plus récent.`,
  );
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Identifiant d'une extension non empaquetée : Chrome le dérive du chemin
 * absolu du dossier — les 128 premiers bits du SHA-256, chaque quartet mappé
 * sur `a`..`p`. Le calculer évite d'aller le deviner parmi les cibles du
 * navigateur, où l'on tombe sur les extensions internes de Chrome.
 */
function extensionIdDepuis(chemin) {
  const empreinte = createHash('sha256').update(chemin).digest('hex').slice(0, 32);
  return [...empreinte].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

async function findBrowser() {
  for (const name of BROWSERS) {
    for (const dir of (process.env.PATH ?? '').split(':').filter(Boolean)) {
      try {
        await access(join(dir, name), constants.X_OK);
        return join(dir, name);
      } catch {
        // Pas là.
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

const targets = async () => (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();

async function waitFor(pred, extensionId, page = 'popup.html') {
  for (let i = 0; i < 20; i += 1) {
    const hit = (await targets()).find(pred);
    if (hit) return hit;
    const id =
      extensionId ??
      (await targets()).find((t) => t.url.startsWith('chrome-extension://'))?.url.split('/')[2];
    if (id) {
      await fetch(`http://127.0.0.1:${PORT}/json/new?chrome-extension://${id}/${page}`, {
        method: 'PUT',
      }).catch(() => {});
    }
    await sleep(700);
  }
  throw new Error('cible introuvable');
}

/**
 * Le service worker peut apparaître dans la liste des cibles avant que les API
 * de l'extension y soient liées : `chrome.cookies` est alors `undefined`. On
 * attend qu'il réponde vraiment avant de lui demander quoi que ce soit.
 */
async function attendrePret(client, timeoutMs = 30000) {
  // S'attacher à un worker le laisse parfois suspendu en attente du débogueur :
  // il n'exécute alors rien, et ses API ne sont jamais liées.
  await client.send('Runtime.runIfWaitingForDebugger').catch(() => {});

  const limite = Date.now() + timeoutMs;
  let derniereErreur = 'aucune';
  while (Date.now() < limite) {
    try {
      const pret = await evaluate(
        client,
        `return typeof chrome?.cookies?.set === 'function' && typeof chrome?.storage?.local?.set === 'function';`,
      );
      if (pret === true) return;
      derniereErreur = `API absentes (chrome ${typeof pret})`;
    } catch (cause) {
      derniereErreur = cause instanceof Error ? cause.message : String(cause);
    }
    await sleep(300);
  }
  throw new Error(`les API de l'extension ne sont pas devenues disponibles : ${derniereErreur}`);
}

/**
 * Charge l'extension par le protocole DevTools si `--load-extension` n'a rien
 * donné. Chrome 137 a désactivé ce commutateur, et les indicateurs de
 * contournement ne survivent pas à toutes les versions ; `Extensions.loadUnpacked`
 * est le chemin resté supporté. Rend `true` si l'extension est chargée.
 */
async function chargerExtension(chemin) {
  const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const navigateur = await cdp(version.webSocketDebuggerUrl);
  try {
    // La commande rend l'identifiant qu'elle a attribué : c'est lui qui fait
    // foi, pas celui qu'on aurait calculé depuis le chemin.
    const { id } = await navigateur.send('Extensions.loadUnpacked', { path: chemin });
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  } finally {
    navigateur.close();
  }
}

/** Une cible de l'extension attendue est-elle visible ? */
async function extensionVisible(extensionId) {
  const cibles = await targets().catch(() => []);
  return cibles.some((t) => t.url.startsWith(`chrome-extension://${extensionId}/`));
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

async function portLibre() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1000) });
    return false;
  } catch {
    return true;
  }
}

const browser = await findBrowser();
if (!browser) {
  console.error('Aucun navigateur Chromium trouvé.');
  process.exit(2);
}
if (!(await portLibre())) {
  console.error(`Port ${PORT} occupé — fermez l'instance précédente.`);
  process.exit(2);
}

await mkdir(OUT, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'cookies-manager-shots-'));
const proc = spawn(
  browser,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--load-extension=${DIST}`,
    `--disable-extensions-except=${DIST}`,
    '--no-sandbox',
    '--disable-dev-shm-usage',
    // Chrome 137 a désactivé `--load-extension`. Ces deux commutateurs le
    // réautorisent ; sans eux l'extension ne se charge pas du tout et la seule
    // cible `chrome-extension://` visible est une extension interne de Chrome.
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--enable-unsafe-extension-debugging',
    '--force-device-scale-factor=2',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-background-networking',
    'about:blank',
  ],
  { stdio: 'ignore', detached: true },
);

async function capture(client, nom, { width, hauteurMax }) {
  for (const theme of ['light', 'dark']) {
    await client.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: theme }],
    });
    await client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: hauteurMax,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await sleep(400);

    // Se caler sur le contenu : une bande vide sur le côté fait une capture
    // bâclée, et une page trop longue est illisible dans un README.
    const mesure = JSON.parse(
      await evaluate(
        client,
        `return JSON.stringify({
           largeur: Math.ceil(document.body.getBoundingClientRect().width),
           hauteur: Math.ceil(document.body.scrollHeight),
         });`,
      ),
    );

    const { data } = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: Math.min(mesure.largeur, width),
        height: Math.min(mesure.hauteur, hauteurMax),
        scale: 1,
      },
    });
    const fichier = join(OUT, `${nom}-${theme === 'light' ? 'clair' : 'sombre'}.png`);
    await writeFile(fichier, Buffer.from(data, 'base64'));
    console.log(`  écrit ${fichier.split('/').slice(-2).join('/')}`);
  }
}

try {
  // Sonder l'ouverture du port plutôt qu'attendre un délai fixe : `portLibre()`
  // rend `true` tant que rien n'écoute, donc on attend qu'il rende `false`.
  for (let i = 0; i < 60; i += 1) {
    if (!(await portLibre())) break;
    await sleep(400);
  }
  // Travailler depuis une page de l'extension plutôt que depuis son service
  // worker : même accès aux API, et pas de suspension possible.
  const chemin = DIST.replace(/\/$/, '');
  let extensionId = extensionIdDepuis(chemin);
  if (!(await extensionVisible(extensionId))) {
    const attribue = await chargerExtension(chemin);
    if (attribue !== null) extensionId = attribue;
    await sleep(800);
  }
  await fetch(`http://127.0.0.1:${PORT}/json/new?chrome-extension://${extensionId}/options.html`, {
    method: 'PUT',
  });
  const amorce = await waitFor(
    (t) => t.type === 'page' && t.url.endsWith('options.html'),
    extensionId,
    'options.html',
  );
  const swClient = await cdp(amorce.webSocketDebuggerUrl);
  await swClient.send('Runtime.enable');
  await attendrePret(swClient);

  // Des données fabriquées, sur des domaines réservés aux tests.
  await evaluate(
    swClient,
    `for (const c of [
       {url:'https://exemple.test/',      name:'session',  value:'x'},
       {url:'https://app.exemple.test/',  name:'session',  value:'y'},
       {url:'https://boutique.test/',     name:'panier',   value:'z'},
       {url:'https://boutique.test/',     name:'pub',      value:'z'},
       {url:'https://actualites.test/',   name:'consent',  value:'z'},
       {url:'https://forum.test/',        name:'sid',      value:'z'},
     ]) await chrome.cookies.set(c);
     await chrome.storage.local.set({profiles: [
       {id:'leger', name:'Nettoyage léger', since:'day', categories:['cookies','httpCache'],
        keepRules:[{pattern:'*.exemple.test', keep:{cookies:true}}]},
       {id:'complet', name:'Nettoyage complet', since:'all',
        categories:['cookies','localStorage','indexedDB','cacheStorage','serviceWorkers','httpCache','history','downloads'],
        keepRules:[
          {pattern:'*.exemple.test', keep:{cookies:true, localStorage:true, indexedDB:true, cacheStorage:true, serviceWorkers:true, history:true}},
          {pattern:'boutique.test', keep:{cookies:true}},
        ]},
     ]});`,
  );

  console.log('Popup :');
  await fetch(`http://127.0.0.1:${PORT}/json/new?chrome-extension://${extensionId}/popup.html`, {
    method: 'PUT',
  });
  const popup = await waitFor(
    (t) => t.type === 'page' && t.url.endsWith('popup.html'),
    extensionId,
  );
  const popupClient = await cdp(popup.webSocketDebuggerUrl);
  await popupClient.send('Page.enable');
  await popupClient.send('Runtime.enable');
  await sleep(900);
  // Ouvrir l'aperçu du premier profil : c'est l'écran qui montre le produit.
  await evaluate(popupClient, `document.querySelector('#profiles button').click(); return true;`);
  await sleep(900);
  await capture(popupClient, 'popup', { width: 380, hauteurMax: 700 });
  popupClient.close();

  console.log('Options :');
  await fetch(`http://127.0.0.1:${PORT}/json/new?chrome-extension://${extensionId}/options.html`, {
    method: 'PUT',
  });
  const options = await waitFor(
    (t) => t.type === 'page' && t.url.endsWith('options.html'),
    extensionId,
    'options.html',
  );
  const optionsClient = await cdp(options.webSocketDebuggerUrl);
  await optionsClient.send('Page.enable');
  await optionsClient.send('Runtime.enable');
  await sleep(1200);
  await evaluate(
    optionsClient,
    `document.querySelector('#profile-select').value = 'complet';
     document.querySelector('#profile-select').dispatchEvent(new Event('change'));
     return true;`,
  );
  await sleep(500);
  await capture(optionsClient, 'options', { width: 1000, hauteurMax: 860 });
  optionsClient.close();

  swClient.close();
  console.log('\nCaptures régénérées.');
} catch (cause) {
  console.error('Échec :', cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
} finally {
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
    let libre = false;
    for (let i = 0; i < 10 && !libre; i += 1) {
      libre = await portLibre();
      if (!libre) await sleep(300);
    }
    if (libre) break;
  }
  await rm(profile, { recursive: true, force: true });
}
