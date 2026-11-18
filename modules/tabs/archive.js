// @ts-check
/**
 * modules/tabs/archive.js (seit v3.15.1, Roadmap 3 Stufe 2)
 *
 * Reiter „Archiv“: Liste der archivierten Monate (löschen, Word, PDF) und
 * „Monat archivieren“ aus dem Reiter Monat. Die HTML-Bausteine liegen in
 * modules/render/archive.js.
 *
 * Regeln für modules/tabs/: kein Import von app.js, kein window.state,
 * alles Zustandsabhängige über toAppContext(ctx).
 */
import { toAppContext } from '../app-context.js';
import { buildArchiveHTML } from '../render/archive.js';
import { restoreArchiveReport } from '../archive-report.js';

/** @param {string} msg @returns {boolean} */
function ask(msg) { return typeof confirm === 'function' ? confirm(msg) : false; }

/**
 * Archiviert den im Reiter Monat gewählten Monat (überschreibt nach Rückfrage).
 * @param {any} ctx
 */
export function archiveCurrentMonth(ctx) {
  const cx = toAppContext(ctx);
  const r = cx.compute.currentReport();
  if (!r) return;
  const state = cx.state.get();
  const empId = r.employer.id;
  const ym = r.ym;

  const exists = state.archives.find((/** @type {any} */ a) => a.employerId === empId && a.yearMonth === ym);
  if (exists && !ask('Für diesen Monat existiert bereits ein Archiv. Überschreiben?')) return;

  const snapshot = {
    employer: JSON.parse(JSON.stringify(r.employer)),
    entries: JSON.parse(JSON.stringify(r.entries)),
    workedMin: r.workedMin, targetMin: r.targetMin, balance: r.balance,
    creditedAbsenceMin: r.creditedAbsenceMin,
    vacationRemaining: r.vacationRemaining,
    vacationDays: r.vacationEntries.length, sickDays: r.sickEntries.length, educationLeaveDays: (r.educationLeaveEntries || []).length,
    overtimeReductionDays: r.overtimeReductionEntries.length,
    holidays: r.holidays,
  };

  if (exists) {
    exists.snapshot = snapshot; exists.generatedAt = new Date().toISOString();
  } else {
    state.archives.push({ id: cx.data.uid(), employerId: empId, yearMonth: ym, generatedAt: new Date().toISOString(), snapshot });
  }
  cx.state.save();
  cx.render.archive();
  cx.ui.toast('Monat archiviert');
}

/**
 * Zeichnet die Archivliste und verdrahtet Löschen, Word und PDF.
 * @param {any} ctx
 */
export function renderArchive(ctx) {
  const cx = toAppContext(ctx);
  const container = document.getElementById('archive-list');
  if (!container) return;
  const state = cx.state.get();
  if (!state.archives.length) {
    container.innerHTML = '<div class="empty-state">Noch keine archivierten Monate.<br><br>Sie können abgeschlossene Monate in der Monatsauswertung archivieren.</div>';
    return;
  }
  container.innerHTML = buildArchiveHTML(state.archives, {
    escapeHtml: cx.format.escapeHtml,
    formatMonthYear: cx.format.monthYear,
    minutesToHM: cx.format.minutesToHM,
  });

  container.querySelectorAll('button[data-action]').forEach((btn) => {
    const el = /** @type {HTMLElement} */ (btn);
    el.addEventListener('click', async () => {
      const st = cx.state.get();
      const archive = st.archives.find((/** @type {any} */ a) => a.id === el.dataset.id);
      if (!archive) return;
      const action = el.dataset.action;
      if (action === 'delete') {
        if (!ask('Archiv löschen?')) return;
        st.archives = st.archives.filter((/** @type {any} */ a) => a.id !== archive.id);
        cx.state.save(); cx.render.archive(); cx.ui.toast('Archiv gelöscht');
      } else if (action === 'word' || action === 'pdf') {
        const report = restoreArchiveReport(archive);
        // Seit v3.9.49: Ladefehler der Export-Bibliotheken (Netzwerk, SRI) sichtbar als Toast.
        try {
          const blob = action === 'word' ? await cx.exports.word(report) : await cx.exports.pdf(report);
          cx.exports.download(blob, cx.format.fileNameForReport(report, action === 'word' ? 'docx' : 'pdf'));
          cx.ui.toast('Datei heruntergeladen');
        } catch (err) {
          console.error(err);
          cx.ui.toast((action === 'word' ? 'Word' : 'PDF') + '-Export fehlgeschlagen: ' + /** @type {any} */ (err).message);
        }
      }
    });
  });
}
