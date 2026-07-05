// @ts-check
/// <reference path="../types.js" />

/**
 * State-Modul: Persistenz-Layer, Default-State, Load/Save-Kontrakt.
 *
 * Kontrakt:
 *   - loadState(helpers) liest, mergt Defaults, führt runMigrations aus,
 *     setzt intern _currentState, persistiert bei changed=true, gibt State zurück.
 *   - saveState() persistiert _currentState (schemaVersion wird sichergestellt).
 *   - getState()/setState(s) sind für Konsumenten, die einen einzelnen Reassign
 *     brauchen (z. B. Backup-Import). Der Aufrufer muss danach sein lokales
 *     `state` und `window.state` synchron halten.
 *   - Storage-Abstraktion unverändert aus app.js übernommen (Sandbox-Fallback
 *     auf In-Memory, wenn localStorage geblockt ist).
 */

import { SCHEMA_VERSION, runMigrations } from './migrations.js';

export const STORAGE_KEY = 'arbeitszeit_v1';

/* ---------- Storage Abstraction ----------
   Uses the browser's persistent key/value store when available (installed PWA, direct access).
   Falls back to in-memory storage in sandboxed environments where the API is blocked.
   The user is warned once when persistence is not available. */

export const storage = (() => {
  let backend = null;
  const memoryStore = {};
  try {
    const key = ['local', 'Storage'].join('');
    const candidate = window[key];
    const testKey = '__az_test__';
    candidate.setItem(testKey, '1');
    candidate.removeItem(testKey);
    backend = candidate;
  } catch (e) {
    console.warn('Persistent storage not available, using in-memory fallback');
  }
  return {
    isPersistent: !!backend,
    get(key) {
      try {
        return backend ? backend.getItem(key) : (memoryStore[key] ?? null);
      } catch (e) { return memoryStore[key] ?? null; }
    },
    set(key, val) {
      try {
        if (backend) backend.setItem(key, val);
        else memoryStore[key] = val;
      } catch (e) { memoryStore[key] = val; }
    },
  };
})();

/* ---------- Default State ---------- */

export const DEFAULT_STATE = {
  employers: [],
  entries: [],
  archives: [],
  templates: [
    { id: 'tpl-1', label: 'Projektabschluss', text: 'Zeitkritischer Projektabschluss.', scope: 'both' },
    { id: 'tpl-2', label: 'Krankheitsvertretung', text: 'Vertretung wegen krankheitsbedingter Abwesenheit einer Kollegin / eines Kollegen.', scope: 'employee' },
    { id: 'tpl-3', label: 'Kundentermin', text: 'Kundentermin außerhalb der regulären Arbeitszeit.', scope: 'both' },
    { id: 'tpl-4', label: 'Notfall', text: 'Betrieblich notwendiger Einsatz aufgrund eines Notfalls.', scope: 'both' },
  ],
  settings: { employeeName: '', ownEmail: '', state: 'HE', holidayOverrides: { add: [], disable: [], rename: {} }, appMode: 'employee', currency: 'EUR' },
  activeEmployerId: null,
  runningTimer: null,
};

/* ---------- State-Handle ---------- */

let _currentState = null;

/**
 * Lädt State aus persistentem Storage, mergt Defaults und führt Migrationen aus.
 * helpers.uid und helpers.normalizeSegments werden an runMigrations weitergereicht
 * (Dependency-Injection), helpers.normalizeHolidayOverrides normalisiert das
 * settings.holidayOverrides-Feld nach dem Merge.
 *
 * @param {{
 *   uid: () => string,
 *   normalizeSegments: (segs: Array<{start:string,end:string}>) => Array<{start:string,end:string}>,
 *   normalizeHolidayOverrides: (v: any) => any,
 * }} helpers
 * @returns {any}
 */
export function loadState(helpers) {
  const { normalizeHolidayOverrides } = helpers;
  try {
    const raw = storage.get(STORAGE_KEY);
    if (raw) {
      const loaded = JSON.parse(raw);
      const mergedSettings = { ...DEFAULT_STATE.settings, ...(loaded.settings || {}) };
      mergedSettings.holidayOverrides = normalizeHolidayOverrides(mergedSettings.holidayOverrides);
      const merged = {
        ...DEFAULT_STATE,
        ...loaded,
        settings: mergedSettings,
        templates: loaded.templates && loaded.templates.length ? loaded.templates : DEFAULT_STATE.templates,
      };
      const { state: migrated, changed } = runMigrations(merged, {
        uid: helpers.uid,
        normalizeSegments: helpers.normalizeSegments,
      });
      if (changed) {
        try { storage.set(STORAGE_KEY, JSON.stringify(migrated)); } catch (e) { /* ignore */ }
      }
      _currentState = migrated;
      return migrated;
    }
  } catch (e) {
    console.error('State load failed', e);
  }
  const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
  fresh.schemaVersion = SCHEMA_VERSION;
  _currentState = fresh;
  return fresh;
}

/**
 * Persistiert den internen State. schemaVersion wird auf SCHEMA_VERSION gezwungen.
 * @returns {void}
 */
export function saveState() {
  if (!_currentState) return;
  try {
    _currentState.schemaVersion = SCHEMA_VERSION;
    storage.set(STORAGE_KEY, JSON.stringify(_currentState));
  } catch (e) {
    console.error('State save failed', e);
  }
}

/**
 * @returns {any}
 */
export function getState() { return _currentState; }

/**
 * @param {any} s
 * @returns {void}
 */
export function setState(s) { _currentState = s; }
