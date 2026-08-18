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
import { createHash } from 'node:crypto';
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

// `WebSocket` n'est global qu'à partir de Node 22 : le dire clairement plutôt
// que d'échouer sur un « WebSocket is not defined » au premier appel.
if (typeof WebSocket === 'undefined') {
  console.error(
    `Node ${process.versions.node} n'expose pas WebSocket. Ce script demande Node 22 ou plus récent.`,
  );
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function check(label, ok, detail) {
  results.push({ label, ok, detail });
  console.log(`${ok ? '  ok  ' : ' ÉCHEC'} ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Parcourt PATH à la main : lancer un shell pour ça ouvrirait une injection. */
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
  const ecouteurs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id === undefined) {
      for (const fn of ecouteurs) fn(m);
      return;
    }
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
    /** Attend un événement du protocole, ou rend la main au bout du délai. */
    attendre(methode, timeoutMs = 15000) {
      return new Promise((res) => {
        const fin = setTimeout(() => res(false), timeoutMs);
        ecouteurs.push((m) => {
          if (m.method === methode) {
            clearTimeout(fin);
            res(true);
          }
        });
      });
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

/**
 * Le service worker peut apparaître dans la liste des cibles avant que les API
 * de l'extension y soient liées : `chrome.cookies` est alors `undefined`. On
 * attend qu'il réponde vraiment avant de lui demander quoi que ce soit.
 */
async function attendrePret(client, timeoutMs = 30000, extensionId = null) {
  // S'attacher à un worker le laisse parfois suspendu en attente du débogueur :
  // il n'exécute alors rien, et ses API ne sont jamais liées.
  await client.send('Runtime.runIfWaitingForDebugger').catch(() => {});

  const limite = Date.now() + timeoutMs;
  let derniereErreur = 'aucune';
  while (Date.now() < limite) {
    try {
      const etat = await evaluate(
        client,
        `return JSON.stringify({
           pret: typeof chrome?.cookies?.set === 'function' && typeof chrome?.storage?.local?.set === 'function',
           chrome: typeof chrome,
           espaces: typeof chrome === 'object' && chrome !== null ? Object.keys(chrome).sort().join(',') : null,
           url: location.href,
         });`,
      );
      const { pret, chrome: typeChrome, espaces, url } = JSON.parse(etat);
      if (pret === true) return;
      derniereErreur = `typeof chrome=${typeChrome}, espaces=[${espaces ?? '—'}], url=${url}`;
    } catch (cause) {
      derniereErreur = cause instanceof Error ? cause.message : String(cause);
    }
    await sleep(300);
  }
  // Diagnostic : si l'extension n'est pas chargée, la page ouverte est une page
  // d'erreur sans aucun `chrome.*`, ce qui donne exactement la même symptôme.
  const cibles = await targets().catch(() => []);
  const extensions = cibles
    .filter((t) => t.url.startsWith('chrome-extension://'))
    .map((t) => t.url)
    .join('\n    ');
  throw new Error(
    `les API de l'extension ne sont pas devenues disponibles : ${derniereErreur}\n` +
      `  extension attendue : ${extensionId ?? 'inconnue'}\n` +
      `  cibles chrome-extension:// vues :\n    ${extensions || '(aucune)'}\n` +
      `  sortie du navigateur : ${dernieresLignes()}`,
  );
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

/**
 * Charge une page de l'extension dans une cible et attend son chargement.
 *
 * S'attacher à une cible fraîchement ouverte donne parfois le contexte de la
 * page vide qui la précède : `chrome.*` n'y existe pas, et attendre ne change
 * rien puisque le contexte, lui, ne change plus.
 */
async function ouvrirPage(client, url) {
  await client.send('Page.enable');
  const charge = client.attendre('Page.loadEventFired');
  await client.send('Page.navigate', { url });
  await charge;
  await client.send('Runtime.enable');
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
    // Nécessaires sur un exécuteur d'intégration continue : le bac à sable est
    // inutilisable en conteneur, et /dev/shm y est trop petit pour Chrome.
    '--no-sandbox',
    '--disable-dev-shm-usage',
    // Chrome 137 a désactivé `--load-extension`. Ces deux commutateurs le
    // réautorisent ; sans eux l'extension ne se charge pas du tout et la seule
    // cible `chrome-extension://` visible est une extension interne de Chrome.
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--enable-unsafe-extension-debugging',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-background-networking',
    'about:blank',
  ],
  // Groupe de processus dédié : le navigateur se lance derrière une enveloppe
  // shell, et seul un signal au groupe entier l'arrête réellement.
  { stdio: ['ignore', 'ignore', 'pipe'], detached: true },
);

let erreurNavigateur = '';
proc.stderr?.on('data', (d) => (erreurNavigateur += String(d)));

const dernieresLignes = () =>
  erreurNavigateur.trim().split('\n').slice(-3).join(' | ') || 'aucun message';

/**
 * Sonder l'ouverture du port plutôt que d'attendre un délai fixe : le démarrage
 * prend quelques centaines de millisecondes en local et plusieurs secondes sur
 * un exécuteur d'intégration continue.
 */
async function attendreNavigateur(timeoutMs = 30000) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (proc.exitCode !== null) {
      throw new Error(`le navigateur s'est arrêté (code ${proc.exitCode}) : ${dernieresLignes()}`);
    }
    if (!(await portLibre())) return;
    await sleep(400);
  }
  throw new Error(
    `le navigateur n'a pas ouvert son port en ${timeoutMs / 1000} s : ${dernieresLignes()}`,
  );
}

let code = 0;
try {
  await attendreNavigateur();

  // On travaille uniquement depuis une page de l'extension. Une page a le même
  // accès aux API qu'un service worker, et elle ne se suspend pas : s'attacher
  // à un worker le laisse parfois figé, et son contexte n'expose alors rien.
  const chemin = DIST.replace(/\/$/, '');
  let extensionId = extensionIdDepuis(chemin);

  // `--load-extension` peut être ignoré sans le dire — Chrome 137 l'a désactivé.
  // On retombe alors sur le protocole DevTools, dont l'identifiant fait foi.
  if (!(await extensionVisible(extensionId))) {
    const attribue = await chargerExtension(chemin);
    if (attribue !== null) extensionId = attribue;
    await sleep(800);
  }
  console.log(`Navigateur : ${browser}\nExtension  : ${extensionId}\n`);

  await fetch(`http://127.0.0.1:${PORT}/json/new?chrome-extension://${extensionId}/options.html`, {
    method: 'PUT',
  });
  const optionsPage = await waitFor(
    (t) => t.type === 'page' && t.url.endsWith('options.html'),
    extensionId,
    'options.html',
  );
  const pageClient = await cdp(optionsPage.webSocketDebuggerUrl);
  await ouvrirPage(pageClient, `chrome-extension://${extensionId}/options.html`);
  await attendrePret(pageClient, 30000, extensionId);
  const swClient = pageClient;

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
  await ouvrirPage(popupClient, `chrome-extension://${extensionId}/popup.html`);
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

  // --- La popup annonce qu'un coffre existant sera remplacé ---
  // Le coffre vient d'être écrit par le nettoyage ci-dessus : une popup neuve
  // doit donc l'annoncer avant d'en écrire un second par-dessus.
  await fetch(`http://127.0.0.1:${PORT}/json/new?chrome-extension://${extensionId}/popup.html`, {
    method: 'PUT',
  });
  const popup2 = await waitFor(
    (t) => t.type === 'page' && t.url.endsWith('popup.html') && t.id !== popupPage.id,
    extensionId,
  );
  const popupClient2 = await cdp(popup2.webSocketDebuggerUrl);
  await ouvrirPage(popupClient2, `chrome-extension://${extensionId}/popup.html`);
  await sleep(900);

  const avertissement = await evaluate(
    popupClient2,
    `document.querySelector('#profiles button').click();
     await new Promise((r) => setTimeout(r, 800));
     const el = document.querySelector('#vault-existing');
     return JSON.stringify({ masque: el.hidden, texte: el.textContent ?? '' });`,
  );
  const vu = JSON.parse(avertissement);
  check(
    'un coffre existant est annoncé avant d’être remplacé',
    vu.masque === false && /remplac/i.test(vu.texte),
    vu.masque ? 'aucun avertissement affiché' : vu.texte.slice(0, 60),
  );
  popupClient2.close();

  // --- Le routeur rejette ce qu'il ne connaît pas ---
  const inconnu = await send({ type: 'MESSAGE_QUI_N_EXISTE_PAS' });
  check('un message inconnu est rejeté', inconnu.ok === false, inconnu.error);

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
