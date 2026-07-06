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
// }

export function exportBackup(ctx) {
  const { getState, downloadBlob, todayISO, toast } = ctx;
  const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' });
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
  } = ctx;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.employers || !Array.isArray(data.employers)) throw new Error('Ungültiges Format');
      if (!confirm('Aktuelle Daten überschreiben?')) return;
      const imported = {
        ...DEFAULT_STATE,
        ...data,
        settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) },
      };
      imported.settings.holidayOverrides = normalizeHolidayOverrides(imported.settings.holidayOverrides);
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
