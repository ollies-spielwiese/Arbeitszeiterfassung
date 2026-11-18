// @ts-check
/**
 * modules/ui/mirror-restore-ui.js (seit v3.15.0)
 *
 * Dialog „Daten in der Spiegelkopie gefunden“. Erscheint, wenn localStorage beim
 * Start leer oder beschädigt ist, die Spiegelkopie in IndexedDB aber noch Daten
 * enthält. Bis zur Entscheidung schreibt modules/storage-idb.js nichts in die
 * Spiegelkopie.
 *
 * deps: {
 *   restore: (data: any) => void,   // prüft, migriert und übernimmt die Daten (wirft bei Fehler)
 *   getRaw: () => string|null,      // aktueller Inhalt von localStorage
 *   toast: (msg: string) => void,
 *   confirm?: (msg: string) => boolean,
 * }
 */
import { releaseMirrorHold, mirrorChecksum } from '../storage-idb.js';

/** @param {string|null} iso */
function whenText(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return '';
  const p = (/** @type {number} */ x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * @param {{ json: string, savedAt: string }} rec
 * @param {{ restore: (data: any) => void, getRaw: () => string|null, toast: (msg: string) => void, confirm?: (msg: string) => boolean, corrupted?: boolean }} deps
 */
export function showMirrorRestore(rec, deps) {
  const modal = document.getElementById('modal-mirror-restore');
  const text = document.getElementById('mirror-restore-text');
  const sums = document.getElementById('mirror-restore-sums');
  const btnRestore = document.getElementById('btn-mirror-restore');
  const btnEmpty = document.getElementById('btn-mirror-empty');
  if (!modal || !text || !sums || !btnRestore || !btnEmpty) return;
  /** @type {any} */
  let data = null;
  try { data = JSON.parse(rec.json); } catch (_) { return; }
  const sum = mirrorChecksum(data);
  const when = whenText(rec.savedAt);
  text.textContent = `Der normale Speicher ist leer${deps.corrupted ? ' oder nicht lesbar' : ''}. In der Spiegelkopie liegen Daten${when ? ` vom ${when}` : ''}:`;
  sums.textContent = `${sum.entries.toLocaleString('de-DE')} ${sum.entries === 1 ? 'Eintrag' : 'Einträge'}, ${sum.employers.toLocaleString('de-DE')} Arbeitgeber und Kunden`;
  const ask = deps.confirm || ((/** @type {string} */ m) => window.confirm(m));
  let busy = false;

  btnRestore.onclick = async () => {
    if (busy) return;
    busy = true;
    try {
      deps.restore(data);
      modal.classList.add('hidden');
      await releaseMirrorHold('restored', deps.getRaw());
      deps.toast('Daten aus der Spiegelkopie wiederhergestellt');
    } catch (e) {
      deps.toast('Wiederherstellung fehlgeschlagen: ' + (e && /** @type {any} */ (e).message || e));
    } finally { busy = false; }
  };
  btnEmpty.onclick = async () => {
    if (busy) return;
    if (!ask(`Spiegelkopie mit ${sum.entries.toLocaleString('de-DE')} Einträgen endgültig löschen? Eine spätere Wiederherstellung ist dann nicht mehr möglich.`)) return;
    busy = true;
    try {
      modal.classList.add('hidden');
      await releaseMirrorHold('empty', deps.getRaw());
      deps.toast('Spiegelkopie gelöscht');
    } finally { busy = false; }
  };
  modal.classList.remove('hidden');
  btnRestore.focus();
}
