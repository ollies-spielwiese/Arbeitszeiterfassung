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
  // Änderungsprotokoll pro Eintrag (Audit-Log, seit v3.9.47) — additives Feld, kein
  // Migrations-Eintrag nötig. Wird von modules/audit-log.js pushAuditLog() befüllt.
  auditLog: [],
  templates: [
    { id: 'tpl-1', label: 'Projektabschluss', text: 'Zeitkritischer Projektabschluss.', scope: 'both' },
    { id: 'tpl-2', label: 'Krankheitsvertretung', text: 'Vertretung wegen krankheitsbedingter Abwesenheit einer Kollegin / eines Kollegen.', scope: 'employee' },
    { id: 'tpl-3', label: 'Kundentermin', text: 'Kundentermin außerhalb der regulären Arbeitszeit.', scope: 'both' },
    { id: 'tpl-4', label: 'Notfall', text: 'Betrieblich notwendiger Einsatz aufgrund eines Notfalls.', scope: 'both' },
  ],
  settings: {
    employeeName: '', ownEmail: '', state: 'HE', holidayOverrides: { add: [], disable: [], rename: {} }, appMode: 'employee', currency: 'EUR',
    // Backup-Erinnerung (seit v3.9.47) — additive Settings-Felder, kein Migrations-Eintrag nötig.
    lastBackupAt: null,
    backupReminderSnoozeUntil: null,
  },
  activeEmployerId: null,
  runningTimer: null,
};

/* ---------- State-Handle ---------- */

let _currentState = null;

// Seit v3.9.49: Sichtbarkeit statt stillem Reset bei defektem localStorage.
// Ohne diese beiden Flags fiel ein kaputter Speicherinhalt (z.B. durch einen
// abgebrochenen Schreibvorgang) unbemerkt auf einen leeren DEFAULT_STATE zurück
// — die App sah normal aus, war aber leer. wasLastLoadCorrupted()/
// getCorruptedBackupKey() erlauben dem UI-Layer (siehe modules/bootstrap.js),
// den Nutzer sichtbar zu warnen und auf die gerettete Rohkopie zu verweisen.
let _lastLoadCorrupted = false;
let _corruptedBackupKey = null;

/** @returns {boolean} true, wenn der letzte loadState()-Aufruf auf einen defekten
 *  Speicherinhalt gestossen ist (JSON-Parse-Fehler o.ä.) und auf DEFAULT_STATE
 *  zurückgefallen ist. */
export function wasLastLoadCorrupted() {
  return _lastLoadCorrupted;
}

/** @returns {string|null} Storage-Key, unter dem die defekte Rohkopie gerettet
 *  wurde (null, wenn keine Rettung nötig war oder die Rettung selbst fehlschlug). */
export function getCorruptedBackupKey() {
  return _corruptedBackupKey;
}

/**
 * Lädt State aus persistentem Storage, mergt Defaults und führt Migrationen aus.
 * helpers.uid und helpers.normalizeSegments werden an runMigrations weitergereicht
 * (Dependency-Injection), helpers.normalizeHolidayOverrides normalisiert das
 * settings.holidayOverrides-Feld nach dem Merge.
 *
 * Wenn unter STORAGE_KEY zwar Daten liegen, diese aber nicht gelesen werden
 * können (kaputtes JSON), wird NICHT stillschweigend auf einen leeren State
 * zurückgefallen: die Rohdaten werden zuerst unter einem Zeitstempel-Schlüssel
 * gerettet, und wasLastLoadCorrupted() liefert danach true, damit der UI-Layer
 * einen sichtbaren Hinweis zeigen kann (siehe modules/bootstrap.js).
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
  _lastLoadCorrupted = false;
  _corruptedBackupKey = null;

  let raw = null;
  try {
    raw = storage.get(STORAGE_KEY);
  } catch (e) {
    raw = null;
  }

  if (raw) {
    try {
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
    } catch (e) {
      console.error('State load failed — gespeicherte Daten sind beschädigt, rette Rohkopie', e);
      _lastLoadCorrupted = true;
      try {
        const rescueKey = `${STORAGE_KEY}_corrupted_${Date.now()}`;
        storage.set(rescueKey, raw);
        _corruptedBackupKey = rescueKey;
      } catch (e2) {
        // Rettung ist Best-Effort: schlägt sie fehl, bleibt wasLastLoadCorrupted()
        // trotzdem true, damit der Nutzer zumindest gewarnt wird.
      }
    }
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
