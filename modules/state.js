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
 *   - Schreibfehler werden weitergereicht, nicht als Persistenzerfolg behandelt.
 *     Ohne localStorage bleibt nur RAM; storage.isPersistent ist dann false.
 *   - replaceStateAtomically() schützt Import und bestehende Zustandsreferenzen.
 */

import { SCHEMA_VERSION, runMigrations } from './migrations.js';

export const STORAGE_KEY = 'arbeitszeit_v1';

/* ---------- Storage Abstraction ----------
   Uses the browser's persistent key/value store when available (installed PWA, direct access).
   Falls back to in-memory storage in sandboxed environments where the API is blocked.
   Failure status stays visible until a complete state write succeeds. */

export const storage = (() => {
  let backend = null;
  const memoryStore = Object.create(null);
  let lastError = null;
  function notify(error) {
    lastError = error;
    window.dispatchEvent(new Event('arbeitszeit-storage-status'));
  }
  try {
    const key = ['local', 'Storage'].join('');
    const candidate = window[key];
    // Read access can still work when storage is full. Keep that backend so a
    // failed write probe never hides the last successfully saved data at startup.
    candidate.getItem(STORAGE_KEY);
    backend = candidate;
    const testKey = '__az_test__';
    candidate.setItem(testKey, '1');
    candidate.removeItem(testKey);
  } catch (e) {
    lastError = e;
    console.warn(backend ? 'Persistent storage is readable but not writable' :
      'Persistent storage not available, using in-memory fallback');
  }
  return {
    get isPersistent() { return !!backend && !lastError; },
    get canPersist() { return !!backend; },
    get(key) {
      try {
        return backend ? backend.getItem(key) : (memoryStore[key] ?? null);
      } catch (e) { return memoryStore[key] ?? null; }
    },
    set(key, val) {
      try {
        if (backend) backend.setItem(key, val);
        else {
          memoryStore[key] = val;
          throw new Error('Dauerhafter Speicher ist nicht verfügbar');
        }
        if (key === STORAGE_KEY) notify(null);
      } catch (e) {
        if (key === STORAGE_KEY) notify(e);
        throw e;
      }
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
    backupReminderFirstSeenAt: null,
    // Sollstunden-Warnung (seit v3.9.78) — additive Settings-Felder, kein Migrations-Eintrag
    // nötig. Siehe modules/soll-warning.js. Seit v3.9.81 unterschiedliche Standard-Schwellen für
    // Monats- und Gleitzeitkonto-Baustein (empfohlene, getestete Kombination — siehe
    // Entscheidungsvorlage Warnschwelle 10 % vs. 20 %): die Monats-Warnung bleibt bei 20 % für
    // zeitnahe Rückmeldung ohne die längere Guard-Wartezeit von 10 %, während die
    // Gleitzeitkonto-Warnung (bewertet ein rollierendes 3-Monats-Fenster statt des vollen
    // Kalenderjahres, siehe computeGleitzeitkontoRollingWindow) bei 10 % empfindlicher auf
    // anhaltende, aber moderate Trends reagiert.
    sollWarningMonthEnabled: false,
    sollWarningMonthThresholdPct: 20,
    sollWarningGleitzeitEnabled: false,
    sollWarningGleitzeitThresholdPct: 10,
    sollWarningSnoozeUntil: null,
  },
  activeEmployerId: null,
  runningTimer: null,
  // Einmal-Hinweis (seit v3.9.59), wird von der kind-Migration (Schema 6→7) gesetzt, wenn
  // Arbeitgeber/Kunde-Zuordnung automatisch anhand des aktiven Modus vorgenommen wurde.
  // Additives Feld, kein eigener Migrations-Eintrag nötig — siehe modules/kind-migration-notice.js.
  pendingMigrationNotice: null,
};

/* ---------- State-Handle ---------- */

let _currentState = null;
let _replacingState = false;

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
        templates: Array.isArray(loaded.templates) ? loaded.templates : DEFAULT_STATE.templates,
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
  if (!_currentState || _replacingState) return;
  _currentState.schemaVersion = SCHEMA_VERSION;
  storage.set(STORAGE_KEY, JSON.stringify(_currentState));
}

/**
 * Import transaction: render/synchronize first, then one atomic localStorage write.
 * Rendering may call saveState(); these intermediate writes are suppressed.
 * On any error both state references and UI are restored; persisted bytes never changed.
 * @param {any} candidate
 * @param {(state:any)=>void} apply
 */
export function replaceStateAtomically(candidate, apply) {
  if (_replacingState) throw new Error('Ein Import läuft bereits');
  if (!storage.canPersist) throw new Error('Import benötigt dauerhaften Speicher. Bisherige Daten bleiben erhalten.');
  const previous = _currentState;
  _replacingState = true;
  try {
    _currentState = candidate;
    apply(candidate);
    candidate.schemaVersion = SCHEMA_VERSION;
    storage.set(STORAGE_KEY, JSON.stringify(candidate));
  } catch (error) {
    _currentState = previous;
    try { apply(previous); } catch (_) { /* Preserve the original error; state/storage are restored. */ }
    throw error;
  } finally {
    _replacingState = false;
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
