// @ts-check
/**
 * modules/storage-idb.js (seit v3.15.0)
 *
 * Stufe 2 der IndexedDB-Umstellung: Spiegelkopie. Die App liest und schreibt
 * weiter in localStorage (Schlüssel arbeitszeit_v1). Jeder erfolgreiche
 * Schreibvorgang wird zusätzlich im Hintergrund in IndexedDB abgelegt:
 *   Datenbank „arbeitszeit“, Speicher „state“, Schlüssel „current“,
 *   Inhalt { json, savedAt, appVersion, checksum }.
 *
 * Beim Start vergleicht startMirror() beide Kopien. Bei Abweichung gilt
 * localStorage, die Spiegelkopie wird neu geschrieben. Einzige Ausnahme:
 * Der normale Speicher ist leer oder beschädigt, die Spiegelkopie enthält
 * aber Daten. Dann wird nichts überschrieben und die App bietet die
 * Wiederherstellung an (Zustand „restore“, Schreiben angehalten).
 *
 * Fehler in IndexedDB unterbrechen nie das Speichern und nie den Start.
 */
import { computeWorkMinutes } from './compute.js';

export const MIRROR_DB = 'arbeitszeit';
export const MIRROR_STORE = 'state';
export const MIRROR_KEY = 'current';
export const MIRROR_STATUS_EVENT = 'arbeitszeit-mirror-status';

/**
 * @typedef {{ entries: number, employers: number, minutes: number }} MirrorChecksum
 * @typedef {{ json: string, savedAt: string, appVersion: string, checksum: MirrorChecksum }} MirrorRecord
 * @typedef {'init'|'idle'|'current'|'created'|'renewed'|'unavailable'|'error'|'restore'} MirrorKey
 * @typedef {{ key: MirrorKey, savedAt: string|null, checksum: MirrorChecksum|null, previous: MirrorChecksum|null }} MirrorStatus
 */

/** @type {any} */
let _factory = typeof indexedDB !== 'undefined' ? indexedDB : null;
let _appVersion = '';
/** @type {'init'|'ready'|'hold'|'off'} */
let _phase = 'init';
/** @type {string|null} */
let _pendingJson = null;
let _writing = false;
let _writeFault = false;
/** @type {Promise<any>|null} */
let _dbPromise = null;
/** @type {MirrorStatus} */
let _status = { key: 'init', savedAt: null, checksum: null, previous: null };
/** @type {Promise<void>} */
let _flushPromise = Promise.resolve();

/** Nur für Tests: Modulzustand zurücksetzen und optional eine eigene IndexedDB-Fabrik setzen. @param {{factory?: any, writeFault?: boolean}} [opts] */
export function _resetMirror(opts = {}) {
  _factory = 'factory' in opts ? opts.factory : (typeof indexedDB !== 'undefined' ? indexedDB : null);
  _writeFault = !!opts.writeFault;
  _phase = 'init'; _pendingJson = null; _writing = false; _dbPromise = null;
  _status = { key: 'init', savedAt: null, checksum: null, previous: null };
  _flushPromise = Promise.resolve();
}
/** Nur für Tests: Schreibfehler simulieren. @param {boolean} on */
export function _setMirrorWriteFault(on) { _writeFault = !!on; }

/** @param {any} state @returns {boolean} */
export function stateHasData(state) {
  return !!(state && ((Array.isArray(state.entries) && state.entries.length > 0)
    || (Array.isArray(state.employers) && state.employers.length > 0)));
}

/**
 * Prüfsumme: Anzahl Einträge, Anzahl Arbeitgeber und Kunden, Summe der Minuten.
 * @param {any} state @returns {MirrorChecksum}
 */
export function mirrorChecksum(state) {
  const entries = Array.isArray(state && state.entries) ? state.entries : [];
  const employers = Array.isArray(state && state.employers) ? state.employers : [];
  let minutes = 0;
  for (const e of entries) { try { minutes += computeWorkMinutes(e) || 0; } catch (_) { /* ungültiger Eintrag */ } }
  return { entries: entries.length, employers: employers.length, minutes };
}

/** @param {string|null} json @returns {any} */
function parseOrNull(json) {
  if (!json) return null;
  try { return JSON.parse(json); } catch (_) { return null; }
}

function notify() {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(MIRROR_STATUS_EVENT));
  } catch (_) { /* ohne window (Node-Tests) */ }
}

/** @param {Partial<MirrorStatus>} patch */
function setStatus(patch) {
  _status = { ..._status, ...patch };
  notify();
}

/** @returns {MirrorStatus} */
export function getMirrorStatus() { return { ..._status }; }

/** @returns {boolean} */
export function idbAvailable() {
  return !!(_factory && typeof _factory.open === 'function');
}

/** @param {IDBRequest} req @returns {Promise<any>} */
function reqDone(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB-Fehler'));
  });
}

/** @returns {Promise<any>} */
function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = _factory.open(MIRROR_DB, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MIRROR_STORE)) db.createObjectStore(MIRROR_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB nicht verfügbar'));
    req.onblocked = () => reject(new Error('IndexedDB blockiert'));
  });
  _dbPromise.catch(() => { _dbPromise = null; });
  return _dbPromise;
}

/** @param {'readonly'|'readwrite'} mode @param {(store: IDBObjectStore) => IDBRequest} fn */
async function withStore(mode, fn) {
  const db = await openDb();
  const tx = db.transaction(MIRROR_STORE, mode);
  const result = reqDone(fn(tx.objectStore(MIRROR_STORE)));
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB-Fehler'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB abgebrochen'));
  });
  const [value] = await Promise.all([result, done]);
  return value;
}

/** @returns {Promise<MirrorRecord|null>} */
export async function readMirror() {
  if (!idbAvailable()) return null;
  const rec = await withStore('readonly', (s) => s.get(MIRROR_KEY));
  return rec && typeof rec.json === 'string' ? rec : null;
}

/** @returns {Promise<void>} */
export async function clearMirror() {
  if (!idbAvailable()) return;
  await withStore('readwrite', (s) => s.delete(MIRROR_KEY));
}

/** @param {string} json @returns {Promise<MirrorRecord>} */
async function putMirror(json) {
  if (_writeFault) throw new Error('QuotaExceededError (Test)');
  /** @type {MirrorRecord} */
  const rec = { json, savedAt: new Date().toISOString(), appVersion: _appVersion, checksum: mirrorChecksum(parseOrNull(json)) };
  await withStore('readwrite', (s) => s.put(rec, MIRROR_KEY));
  return rec;
}

function flush() {
  if (_writing || _phase !== 'ready' || _pendingJson === null) return _flushPromise;
  _writing = true;
  _flushPromise = (async () => {
    try {
      while (_pendingJson !== null && _phase === 'ready') {
        const json = _pendingJson;
        _pendingJson = null;
        try {
          const rec = await putMirror(json);
          const key = (_status.key === 'created' || _status.key === 'renewed') ? _status.key : 'current';
          setStatus({ key, savedAt: rec.savedAt, checksum: rec.checksum });
        } catch (e) {
          console.warn('Spiegelkopie konnte nicht geschrieben werden', e);
          setStatus({ key: 'error' });
        }
      }
    } finally {
      _writing = false;
    }
  })();
  return _flushPromise;
}

/**
 * Wird nach jedem erfolgreichen Schreiben in localStorage aufgerufen.
 * Läuft gerade ein Schreibvorgang, wird nur der neueste Stand nachgeschoben.
 * @param {string} json
 */
export function mirrorPersisted(json) {
  if (_phase === 'off' || typeof json !== 'string') return;
  _pendingJson = json;
  if (_phase === 'ready') flush();
}

/** Wartet, bis alle anstehenden Schreibvorgänge erledigt sind (für Tests und Wiederherstellung). */
export async function whenMirrorIdle() {
  while (_writing || (_phase === 'ready' && _pendingJson !== null)) {
    flush();
    await _flushPromise;
  }
}

/**
 * Vergleich beim Start.
 * @param {{
 *   loadedRaw: string|null,          // Inhalt von localStorage direkt nach dem Laden
 *   loadedState: any,                // geladener State
 *   corrupted?: boolean,             // localStorage war beschädigt
 *   getCurrentRaw: () => string|null, // aktueller Inhalt von localStorage
 *   appVersion?: string,
 *   onRestoreOffer?: (rec: MirrorRecord) => void,
 * }} opts
 * @returns {Promise<MirrorStatus>}
 */
export async function startMirror(opts) {
  _appVersion = opts.appVersion || '';
  if (!idbAvailable()) {
    _phase = 'off'; _pendingJson = null;
    setStatus({ key: 'unavailable' });
    return getMirrorStatus();
  }
  /** @type {MirrorRecord|null} */
  let rec = null;
  try {
    rec = await readMirror();
  } catch (e) {
    console.warn('IndexedDB nicht verfügbar', e);
    _phase = 'off'; _pendingJson = null;
    setStatus({ key: 'unavailable' });
    return getMirrorStatus();
  }
  const lsEmpty = !!opts.corrupted || !stateHasData(opts.loadedState);
  const mirrorState = rec ? parseOrNull(rec.json) : null;
  if (lsEmpty && rec && stateHasData(mirrorState)) {
    _phase = 'hold'; _pendingJson = null;
    setStatus({ key: 'restore', savedAt: rec.savedAt, checksum: mirrorChecksum(mirrorState), previous: null });
    if (typeof opts.onRestoreOffer === 'function') opts.onRestoreOffer(rec);
    return getMirrorStatus();
  }
  const current = _pendingJson !== null ? _pendingJson : opts.getCurrentRaw();
  if (!rec) {
    setStatus(current ? { key: 'created' } : { key: 'idle' });
  } else if (rec.json === opts.loadedRaw) {
    setStatus({ key: 'current', savedAt: rec.savedAt, checksum: rec.checksum || mirrorChecksum(mirrorState) });
  } else {
    setStatus({ key: 'renewed', previous: rec.checksum || mirrorChecksum(mirrorState) });
  }
  _phase = 'ready';
  _pendingJson = (current && (!rec || current !== rec.json)) ? current : null;
  await flush();
  return getMirrorStatus();
}

/**
 * Nach der Entscheidung im Wiederherstellungs-Dialog: Schreiben wieder freigeben.
 * @param {'restored'|'empty'} how
 * @param {string|null} currentRaw aktueller Inhalt von localStorage
 */
export async function releaseMirrorHold(how, currentRaw) {
  if (_phase !== 'hold') return;
  if (how === 'empty') {
    try { await clearMirror(); } catch (e) { console.warn(e); }
    setStatus({ key: currentRaw ? 'created' : 'idle', savedAt: null, checksum: null, previous: null });
  } else {
    setStatus({ key: 'current', previous: null });
  }
  _phase = 'ready';
  if (currentRaw) _pendingJson = currentRaw;
  await flush();
}

/** @param {number} n */
function num(n) { return Number(n || 0).toLocaleString('de-DE'); }

/** @param {string|null} iso */
function dateTimeText(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (/** @type {number} */ x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** @param {MirrorChecksum|null} c */
export function checksumText(c) {
  if (!c) return '';
  const h = Math.round(c.minutes / 60);
  return `${num(c.entries)} ${c.entries === 1 ? 'Eintrag' : 'Einträge'}, ${num(c.employers)} Arbeitgeber und Kunden, ${num(h)} ${h === 1 ? 'Stunde' : 'Stunden'}`;
}

/**
 * Abzeichen und Text für die Karte „Speicherstatus“.
 * @param {MirrorStatus} st
 * @returns {{ badge: string, badgeClass: string, text: string }}
 */
export function mirrorStatusInfo(st) {
  switch (st.key) {
    case 'current': {
      const when = dateTimeText(st.savedAt);
      const sums = checksumText(st.checksum);
      return { badge: 'aktuell', badgeClass: 'st-ok',
        text: 'Die Spiegelkopie in IndexedDB stimmt mit den Daten überein.'
          + (when ? ` Zuletzt geschrieben: ${when}.` : '') + (sums ? ` ${sums}.` : '') };
    }
    case 'created':
      return { badge: 'angelegt', badgeClass: 'st-ok',
        text: 'Die Spiegelkopie in IndexedDB wurde neu angelegt. Die Daten liegen weiter in localStorage.' };
    case 'renewed': {
      const prev = st.previous, cur = st.checksum;
      let detail = '';
      if (prev && cur && prev.entries !== cur.entries) detail = ` (${num(prev.entries)} statt ${num(cur.entries)} Einträge)`;
      else if (prev && cur && prev.employers !== cur.employers) detail = ` (${num(prev.employers)} statt ${num(cur.employers)} Arbeitgeber und Kunden)`;
      return { badge: 'erneuert', badgeClass: 'st-neutral',
        text: `Beim Start wich die Spiegelkopie ab${detail}. Es gelten die Daten aus localStorage, die Spiegelkopie wurde neu geschrieben.` };
    }
    case 'unavailable':
      return { badge: 'nicht verfügbar', badgeClass: 'st-neutral',
        text: 'IndexedDB ist in diesem Browser nicht verfügbar, zum Beispiel im privaten Modus. Die Daten liegen wie bisher in localStorage.' };
    case 'error':
      return { badge: 'Fehler', badgeClass: 'st-warn',
        text: 'Die Spiegelkopie konnte nicht geschrieben werden. Die Daten liegen sicher in localStorage. Bitte ein Backup sichern.' };
    case 'restore':
      return { badge: 'Entscheidung offen', badgeClass: 'st-warn',
        text: `Der normale Speicher ist leer, die Spiegelkopie enthält noch Daten (${checksumText(st.checksum)}). Bis zur Entscheidung bleibt die Spiegelkopie unverändert.` };
    case 'idle':
      return { badge: 'noch leer', badgeClass: 'st-neutral',
        text: 'Die Spiegelkopie wird beim ersten Speichern angelegt.' };
    default:
      return { badge: 'wird geprüft', badgeClass: 'st-neutral', text: 'Die Spiegelkopie wird gerade geprüft.' };
  }
}
