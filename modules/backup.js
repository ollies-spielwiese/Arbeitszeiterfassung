// modules/backup.js
// JSON-Backup Export/Import.
// Reine Funktionen mit ctx-DI - kein Modul-State, keine globalen Referenzen.
//
// ctx = {
//   getState,                    // liefert aktuellen State (fuer Export-Serialisierung)
//   saveState,                   // persistiert beim Export (optional)
//   commitImport,                // transaktionale Übernahme + onImport, wirft bei Fehler
//   downloadBlob,                // Blob-Download
//   todayISO,                    // Datum fuer Dateiname
//   toast,                       // User-Feedback
//   DEFAULT_STATE,               // Merge-Basis fuer Legacy-Backups
//   normalizeHolidayOverrides,   // Konsistenz nach Import
//   onImport,                    // Callback (newState) -> void, fuer Re-Renders
//   runMigrations,               // seit v3.9.49: hebt importierte Backups auf SCHEMA_VERSION (DI)
//   uid,                         // an runMigrations weitergereicht
//   normalizeSegments,           // an runMigrations weitergereicht
// }
import { validateBackup } from './backup-validation.js';

export function exportBackup(ctx) {
  const { getState, saveState, downloadBlob, todayISO, toast } = ctx;
  const state = getState();
  // Backup-Erinnerung (seit v3.9.47): Zeitpunkt des letzten Exports vermerken.
  if (state.settings) { state.settings.lastBackupAt = new Date().toISOString(); state.settings.changesSinceBackup = 0; }
  if (typeof saveState === 'function') saveState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `arbeitszeit-backup-${todayISO()}.json`);
  toast('Backup heruntergeladen');
}

/**
 * Prüft Backup-Daten, ergänzt Standardwerte und migriert auf das aktuelle Schema.
 * Wirft bei ungültigen Daten. Seit v3.15.0 auch für die Wiederherstellung aus der
 * Spiegelkopie (modules/ui/mirror-restore-ui.js) genutzt.
 * @param {any} data
 * @param {any} ctx
 */
export function prepareImportedState(data, ctx) {
  const { DEFAULT_STATE, normalizeHolidayOverrides, runMigrations, uid, normalizeSegments } = ctx;
  validateBackup(data);
  let imported = {
    ...JSON.parse(JSON.stringify(DEFAULT_STATE)),
    ...data,
    settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) },
  };
  imported.settings.holidayOverrides = normalizeHolidayOverrides(imported.settings.holidayOverrides);
  // Seit v3.9.49: importierte Backups können von einem anderen Gerät oder einer
  // älteren App-Version stammen und ein älteres Schema haben. Dieselbe
  // Migrations-Garantie wie beim normalen Start (loadState) gilt auch hier.
  if (typeof runMigrations === 'function') {
    const { state: migrated } = runMigrations(imported, { uid, normalizeSegments });
    imported = migrated;
  }
  validateBackup(imported);
  return imported;
}

export function importBackup(file, ctx) {
  const { commitImport, toast, onImport } = ctx;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = prepareImportedState(JSON.parse(/** @type {string} */ (reader.result)), ctx);
      if (!confirm('Aktuelle Daten überschreiben?')) return;
      commitImport(imported, onImport);
      toast('Backup importiert');
    } catch (e) {
      toast('Import fehlgeschlagen: ' + e.message);
    }
  };
  reader.onerror = () => toast('Import fehlgeschlagen: Datei konnte nicht gelesen werden');
  reader.onabort = () => toast('Import abgebrochen: Bisherige Daten bleiben erhalten');
  reader.readAsText(file);
}
