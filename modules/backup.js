// modules/backup.js
// JSON-Backup Export/Import.
// Reine Funktionen mit ctx-DI - kein Modul-State, keine globalen Referenzen.
//
// ctx = {
//   getState,                    // liefert aktuellen State (fuer Export-Serialisierung)
//   setState,                    // schreibt neuen State ins State-Modul
//   saveState,                   // persistiert in localStorage
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

export function exportBackup(ctx) {
  const { getState, saveState, downloadBlob, todayISO, toast } = ctx;
  const state = getState();
  // Backup-Erinnerung (seit v3.9.47): Zeitpunkt des letzten Exports vermerken.
  if (state.settings) state.settings.lastBackupAt = new Date().toISOString();
  if (typeof saveState === 'function') saveState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `arbeitszeit-backup-${todayISO()}.json`);
  toast('Backup heruntergeladen');
}

export function importBackup(file, ctx) {
  const {
    setState,
    saveState,
    toast,
    DEFAULT_STATE,
    normalizeHolidayOverrides,
    onImport,
    runMigrations,
    uid,
    normalizeSegments,
  } = ctx;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(/** @type {string} */ (reader.result));
      if (!data.employers || !Array.isArray(data.employers)) throw new Error('Ungültiges Format');
      if (!confirm('Aktuelle Daten überschreiben?')) return;
      let imported = {
        ...DEFAULT_STATE,
        ...data,
        settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) },
      };
      imported.settings.holidayOverrides = normalizeHolidayOverrides(imported.settings.holidayOverrides);
      // Seit v3.9.49: importierte Backups können von einem anderen Gerät oder einer
      // älteren App-Version stammen (z.B. Sync-Brücke zwischen iPad/Desktop ohne
      // Cloud-Sync) und ein älteres Schema haben. Ohne diesen Migrations-Lauf würde
      // ein Backup mit altem schemaVersion-Stand unmigriert übernommen werden,
      // während loadState() beim normalen Start immer migriert — dieselbe Garantie
      // muss auch für importierte Daten gelten.
      if (typeof runMigrations === 'function') {
        const { state: migrated } = runMigrations(imported, { uid, normalizeSegments });
        imported = migrated;
      }
      setState(imported);
      saveState();
      if (typeof onImport === 'function') onImport(imported);
      toast('Backup importiert');
    } catch (e) {
      toast('Import fehlgeschlagen: ' + e.message);
    }
  };
  reader.readAsText(file);
}
