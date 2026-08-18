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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await sleep(2500);
  const sw = await waitFor((t) => t.type === 'service_worker');
  const extensionId = new URL(sw.url).host;
  const swClient = await cdp(sw.webSocketDebuggerUrl);
  await swClient.send('Runtime.enable');

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
