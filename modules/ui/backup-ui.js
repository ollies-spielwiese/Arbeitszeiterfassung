// @ts-check
/**
 * modules/ui/backup-ui.js (seit v3.15.5, Roadmap 3 Stufe 2)
 *
 * Backup erstellen und einlesen, Karte „Backup-Ordner“ in den Einstellungen
 * und Wiederherstellung aus der Spiegelkopie. Backup erstellen wird auch aus
 * der Erinnerung im Reiter Erfassen aufgerufen, die Wiederherstellung aus dem
 * Hinweis beim Start; deshalb ist das ein gemeinsamer Baustein und kein Teil
 * von modules/tabs/settings.js.
 *
 * Backup-Ordner (File System Access API, seit v3.9.69): Chrome und Edge
 * merken sich den gewählten Ordner dauerhaft (IndexedDB) und schreiben
 * künftige Backups ohne erneuten Auswahldialog dorthin. Safari, iOS und
 * Firefox haben die Schnittstelle nicht; dort steht ein Hinweis auf die
 * gleichwertige Bordfunktion. Die reinen Funktionen liegen in
 * modules/backup.js und modules/backupFolder.js.
 */
import { toAppContext } from '../app-context.js';
import { exportBackup as exportBackupDownload, importBackup as importBackupFile, prepareImportedState } from '../backup.js';
import {
  isFolderPickerSupported,
  getStoredFolderHandle,
  chooseFolder,
  queryFolderPermission,
  writeBackupToFolder,
} from '../backupFolder.js';
import { updateBackupReminderBanner } from './backup-reminder-banner-ui.js';

/**
 * Liefert einen nutzbaren Ordner nur dann, wenn die Schnittstelle unterstützt
 * wird, ein Ordner gespeichert ist und die Schreibberechtigung schon erteilt
 * ist (stille Prüfung ohne Dialog). Sonst null, dann gilt der Download-Weg.
 * @returns {Promise<any>}
 */
async function getUsableBackupFolderHandle() {
  if (!isFolderPickerSupported()) return null;
  const handle = await getStoredFolderHandle();
  if (!handle) return null;
  const perm = await queryFolderPermission(handle, { request: false });
  return perm === 'granted' ? handle : null;
}

/**
 * Backup erstellen: in den gewählten Ordner oder als Download.
 * @param {any} ctx
 */
export async function exportBackup(ctx) {
  const cx = toAppContext(ctx);
  const toast = cx.ui.toast;
  const folderHandle = await getUsableBackupFolderHandle();
  if (folderHandle) {
    try {
      const st = cx.state.get();
      if (st.settings) { st.settings.lastBackupAt = new Date().toISOString(); st.settings.changesSinceBackup = 0; }
      cx.state.save();
      const filename = `arbeitszeit-backup-${cx.data.todayISO()}.json`;
      await writeBackupToFolder(folderHandle, filename, JSON.stringify(cx.state.get(), null, 2));
      toast(`Backup gespeichert in „${folderHandle.name}“`);
      updateBackupReminderBanner(cx);
      return;
    } catch (e) {
      // Ordner nicht mehr erreichbar (z. B. gelöscht, externes Laufwerk getrennt):
      // regulärer Download als Rückfall, damit das Backup nicht verloren geht.
      toast('Backup-Ordner nicht verfügbar — Backup wird stattdessen heruntergeladen');
    }
  }
  exportBackupDownload({
    getState: cx.state.get,
    saveState: cx.state.save,
    downloadBlob: cx.exports.download,
    todayISO: cx.data.todayISO,
    toast,
  });
  updateBackupReminderBanner(cx);
}

/**
 * Zeichnet die Karte Backup-Ordner in den Einstellungen.
 * @param {any} ctx
 */
export async function renderBackupFolderSection(ctx) {
  const cx = toAppContext(ctx);
  const escapeHtml = cx.format.escapeHtml;
  const content = document.getElementById('backup-folder-content');
  if (!content) return;

  if (!isFolderPickerSupported()) {
    content.innerHTML = `
      <p class="hint">Ein fester Backup-Ordner lässt sich in Safari aus Sicherheitsgründen nicht direkt in der App festlegen.</p>
      <p class="hint">Beim Export zeigt Safari stattdessen eine Dateivorschau. Tippe dort auf <strong>Mehr …</strong> (oder das Teilen-Symbol) und wähle <strong>In „Dateien“ sichern</strong>, um das Backup manuell im gewünschten Ordner abzulegen, z. B. „Auf meinem iPhone“ bzw. „Auf meinem iPad“.</p>
    `;
    return;
  }

  const handle = await getStoredFolderHandle();
  if (!handle) {
    content.innerHTML = `
      <p class="hint">Noch kein fester Ordner ausgewählt. Backups werden bei jedem Export einzeln gespeichert.</p>
      <div class="data-actions">
        <button type="button" id="btn-choose-backup-folder" class="btn-primary btn-small" data-testid="button-choose-backup-folder">📁 Ordner auswählen</button>
      </div>
    `;
    wireBackupFolderButtons(cx);
    return;
  }

  const perm = await queryFolderPermission(handle, { request: false });
  if (perm !== 'granted') {
    content.innerHTML = `
      <p class="hint">Zugriff auf „${escapeHtml(handle.name)}“ muss erneut bestätigt werden (z. B. nach einem Browser-Neustart).</p>
      <div class="data-actions">
        <button type="button" id="btn-confirm-backup-folder" class="btn-primary btn-small" data-testid="button-confirm-backup-folder">Zugriff bestätigen</button>
        <button type="button" id="btn-change-backup-folder" class="btn-secondary btn-small" data-testid="button-change-backup-folder">Anderen Ordner wählen</button>
      </div>
    `;
    wireBackupFolderButtons(cx);
    return;
  }

  content.innerHTML = `
    <p class="hint">Aktueller Ordner: <strong>📁 ${escapeHtml(handle.name)}</strong></p>
    <div class="data-actions">
      <button type="button" id="btn-change-backup-folder" class="btn-secondary btn-small" data-testid="button-change-backup-folder">Ordner ändern</button>
    </div>
    <p class="hint">Backups werden ab jetzt automatisch in diesem Ordner gespeichert — ohne erneute Ordnerauswahl, nur noch mit kurzer Bestätigung.</p>
  `;
  wireBackupFolderButtons(cx);
}

/** @param {any} cx gebauter Kontext */
function wireBackupFolderButtons(cx) {
  const choose = () => handleChooseBackupFolder(cx);
  const btnChoose = document.getElementById('btn-choose-backup-folder');
  if (btnChoose) btnChoose.addEventListener('click', choose);
  const btnChange = document.getElementById('btn-change-backup-folder');
  if (btnChange) btnChange.addEventListener('click', choose);
  const btnConfirm = document.getElementById('btn-confirm-backup-folder');
  if (btnConfirm) btnConfirm.addEventListener('click', () => handleConfirmBackupFolderAccess(cx));
}

/** @param {any} cx gebauter Kontext */
async function handleChooseBackupFolder(cx) {
  try {
    await chooseFolder();
    cx.ui.toast('Backup-Ordner gespeichert');
  } catch (e) {
    if (e && e.name === 'AbortError') { return; } // Dialog abgebrochen, kein Fehler
    cx.ui.toast('Ordner konnte nicht gespeichert werden: ' + e.message);
  }
  renderBackupFolderSection(cx);
}

/** @param {any} cx gebauter Kontext */
async function handleConfirmBackupFolderAccess(cx) {
  const handle = await getStoredFolderHandle();
  if (!handle) { renderBackupFolderSection(cx); return; }
  const perm = await queryFolderPermission(handle, { request: true });
  cx.ui.toast(perm === 'granted' ? 'Zugriff bestätigt' : 'Zugriff nicht erteilt');
  renderBackupFolderSection(cx);
}

/**
 * Gemeinsame Abhängigkeiten für Backup-Import und Wiederherstellung aus der
 * Spiegelkopie.
 * @param {any} cx gebauter Kontext
 */
function importDeps(cx) {
  return {
    commitImport: cx.state.replace,
    toast: cx.ui.toast,
    DEFAULT_STATE: cx.data.defaultState,
    normalizeHolidayOverrides: cx.compute.normalizeHolidayOverrides,
    runMigrations: cx.state.migrate,
    uid: cx.data.uid,
    normalizeSegments: cx.compute.normalizeSegments,
    onImport: () => {
      cx.render.modeVisibility();
      cx.render.tracker(); cx.render.entries(); cx.render.employers(); cx.render.archive(); cx.render.settings();
    },
  };
}

/**
 * v3.15.0: Daten aus der Spiegelkopie übernehmen (gleicher geprüfter Weg wie
 * ein Backup-Import).
 * @param {any} ctx
 * @param {any} data
 */
export function restoreFromMirror(ctx, data) {
  const deps = importDeps(toAppContext(ctx));
  deps.commitImport(prepareImportedState(data, deps), deps.onImport);
}

/**
 * Backup-Datei einlesen.
 * @param {any} ctx
 * @param {File} file
 */
export function importBackup(ctx, file) {
  importBackupFile(file, importDeps(toAppContext(ctx)));
}
