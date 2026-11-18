// v3.14.4: Precache im Service Worker gegen gemischte Versionen.
// Hintergrund: In v3.14.3 lieferte das CDN von GitHub Pages kurz nach dem Deploy
// eine alte modules/selectors.js, während app.js schon neu war. Der neue Cache war
// dadurch gemischt (Monat-PDF: "minutesToHM is not a function", Woche leer).
// Die Tests führen den echten install-Handler aus sw.js in einer Node-Sandbox aus.

import fs from 'fs';
import path from 'path';
import vm from 'vm';

function loadServiceWorker(repoRoot, fetchImpl) {
  const src = fs.readFileSync(path.join(repoRoot, 'sw.js'), 'utf8');
  const listeners = {};
  const stores = new Map();
  const deleted = [];
  const fetchCalls = [];
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(url, response) { store.set(url, response); },
        async match(url) { return store.get(url); },
      };
    },
    async delete(name) { deleted.push(name); return stores.delete(name); },
    async keys() { return [...stores.keys()]; },
    async match() { return undefined; },
  };
  const self = {
    addEventListener(type, fn) { listeners[type] = fn; },
    location: { origin: 'https://example.test' },
    clients: { claim() {} },
    skipWaiting() {},
  };
  const sandbox = {
    self, caches, console: { warn() {}, log() {}, error() {} },
    fetch: (url, opts) => { fetchCalls.push({ url, opts }); return fetchImpl(url, opts); },
    Response: class {}, URL, Promise,
  };
  vm.runInNewContext(src + '\n;this.__CACHE_NAME = CACHE_NAME; this.__ASSETS = ASSETS;', sandbox);
  return { listeners, stores, deleted, fetchCalls, CACHE_NAME: sandbox.__CACHE_NAME, ASSETS: sandbox.__ASSETS };
}

function response(body) {
  return { ok: true, status: 200, text: async () => body };
}

async function runInstall(sw) {
  let promise = null;
  sw.listeners.install({ waitUntil(p) { promise = p; } });
  try { await promise; return { ok: true }; } catch (e) { return { ok: false, error: String(e && e.message) }; }
}

export async function runServiceWorkerPrecacheTests({ assertEq, repoRoot }) {
  console.log('\n=== v3.14.4: Service Worker holt eine einheitliche Version ===');
  const appVersion = fs.readFileSync(path.join(repoRoot, 'modules/constants.js'), 'utf8')
    .match(/APP_VERSION = '([^']+)'/)[1];

  // Fall 1: alle Dateien in der richtigen Version.
  const good = loadServiceWorker(repoRoot, async (url) =>
    response(url.includes('modules/constants.js') ? `export const APP_VERSION = '${appVersion}';` : 'x'));
  const r1 = await runInstall(good);
  assertEq('SWP1: Installation mit einheitlicher Version gelingt', r1.ok, true);
  const local = good.fetchCalls.filter((c) => !c.url.startsWith('https:'));
  assertEq('SWP1: jede eigene Datei mit ?v=CACHE_NAME geholt',
    local.length > 0 && local.every((c) => /[?&]v=/.test(c.url) && c.url.endsWith('v=' + good.CACHE_NAME)), true);
  assertEq('SWP1: jede Anfrage mit cache: reload', good.fetchCalls.every((c) => c.opts && c.opts.cache === 'reload'), true);
  assertEq('SWP1: fremde Bibliotheken ohne Zusatz (Integrität bleibt gültig)',
    good.fetchCalls.filter((c) => c.url.startsWith('https:')).every((c) => !c.url.includes('?v=')), true);
  const stored = [...(good.stores.get(good.CACHE_NAME) || new Map()).keys()].sort();
  assertEq('SWP1: gespeichert unter den normalen Adressen', JSON.stringify(stored), JSON.stringify([...good.ASSETS].sort()));
  assertEq('SWP1: Cache-Name passt zur App-Version', good.CACHE_NAME, 'arbeitszeit-v' + appVersion.replace(/\./g, '-'));

  // Fall 2: CDN liefert eine alte constants.js (wie beim Fehler in v3.14.3).
  const stale = loadServiceWorker(repoRoot, async (url) =>
    response(url.includes('modules/constants.js') ? "export const APP_VERSION = '3.14.2';" : 'x'));
  const r2 = await runInstall(stale);
  assertEq('SWP2: alte Datei vom CDN lässt die Installation scheitern', r2.ok, false);
  assertEq('SWP2: Fehlermeldung nennt die Versionsprüfung', /Versionsprüfung/.test(r2.error || ''), true);
  assertEq('SWP2: halbfertiger neuer Cache wird gelöscht', stale.deleted.includes(stale.CACHE_NAME) && !stale.stores.has(stale.CACHE_NAME), true);

  // Fall 3: eine Pflichtdatei fehlt (HTTP 404).
  const missing = loadServiceWorker(repoRoot, async (url) =>
    url.includes('modules/selectors.js') ? { ok: false, status: 404 } : response(`APP_VERSION = '${appVersion}'`));
  const r3 = await runInstall(missing);
  assertEq('SWP3: fehlende Pflichtdatei lässt die Installation scheitern', r3.ok, false);
  assertEq('SWP3: auch dann wird der neue Cache gelöscht', missing.deleted.includes(missing.CACHE_NAME), true);
}
