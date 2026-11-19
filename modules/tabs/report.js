// @ts-check
/**
 * modules/tabs/report.js (seit v3.15.4, Roadmap 3 Stufe 2)
 *
 * Reiter „Monat“: Auswahl Arbeitgeber und Monat, Monatsbericht und die Knöpfe
 * PDF, Word, CSV und Kilometer-PDF. Die Datei-Erzeuger (Kontext: exports.pdf,
 * exports.word, exports.csv, exports.kmPdf) und der Monatsbericht selbst
 * (Kontext: compute.monthReport) bleiben in app.js. Das HTML liegt in
 * modules/render/report.js.
 *
 * Regeln für modules/tabs/: kein Import von app.js, kein window.state,
 * alles Zustandsabhängige über toAppContext(ctx).
 */
import { toAppContext } from '../app-context.js';
import { filterVisibleEmployers, isFormerEmployer } from '../compute.js';
import { buildReportHTML } from '../render/report.js';
import { renderSummaryHTML } from '../render/summary.js';
import { getCurrentReport as selectReport } from '../selectors.js';
import { currentYearMonth, formatDateLong } from '../util-time.js';

/** @returns {HTMLSelectElement} */
const employerSelect = () => /** @type {HTMLSelectElement} */ (document.getElementById('report-employer'));
/** @returns {HTMLInputElement} */
const monthInput = () => /** @type {HTMLInputElement} */ (document.getElementById('report-month'));

/**
 * Dateiname für PDF, Word, CSV und Teilen (auch modules/share.js und das Archiv
 * über den Kontext: format.fileNameForReport).
 * @param {{employer:{name:string}, ym:string}} report
 * @param {string} ext
 */
export function fileNameForReport(report, ext) {
  return `Arbeitszeit_${report.employer.name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, '_')}_${report.ym}.${ext}`;
}

/**
 * Zeichnet den Reiter Monat.
 * @param {any} ctx
 */
export function renderReport(ctx) {
  const cx = toAppContext(ctx);
  const st = cx.state.get();
  const escapeHtml = cx.format.escapeHtml;
  const empSel = employerSelect();
  const input = monthInput();

  const currentEmp = empSel.value;
  const today = cx.data.todayISO();
  const visibleEmployers = filterVisibleEmployers(st.employers, today, {
    showAll: !!cx.ui.showFormerEmployers(),
    includeIds: [currentEmp, st.activeEmployerId],
  });
  empSel.innerHTML = st.employers.length
    ? visibleEmployers.map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)}${isFormerEmployer(e, today) ? ' (ehemalig)' : ''}</option>`).join('')
    : '<option value="">— Kein Arbeitgeber —</option>';
  empSel.value = currentEmp || st.activeEmployerId || visibleEmployers[0]?.id || '';

  if (!input.value) input.value = currentYearMonth();

  const empId = empSel.value;
  const ym = input.value;
  const container = /** @type {HTMLElement} */ (document.getElementById('report-content'));

  if (!empId || !ym) {
    container.innerHTML = '<div class="empty-state">Bitte Arbeitgeber und Monat wählen.</div>';
    return;
  }

  const r = cx.compute.monthReport(empId, ym);
  if (!r) { container.innerHTML = '<div class="empty-state">Keine Daten.</div>'; return; }

  container.innerHTML = buildReportHTML(r, {
    escapeHtml,
    formatDateLong,
    formatDate: cx.format.date,
    formatMonthYear: cx.format.monthYear,
    minutesToHM: cx.format.minutesToHM,
    computeWorkMinutes: cx.compute.workMinutes,
    computeHomeofficeMinutes: cx.compute.homeofficeMinutes,
    getSummaryFields: cx.compute.summaryFields,
    renderSummaryHTML,
    balanceWarning: cx.compute.balanceWarning(r.balance, r.targetMin, 'month'),
  });
  const kmBtn = document.getElementById('btn-export-km-pdf');
  if (kmBtn) kmBtn.classList.toggle('hidden', !(r.fieldService && r.fieldService.km > 0));
}

/**
 * Aktueller Monatsbericht laut Auswahl, oder null (mit Hinweis), wenn etwas fehlt.
 * Auch für Teilen und Archiv (Kontext: compute.currentReport).
 * @param {any} ctx
 */
export function getCurrentReport(ctx) {
  const cx = toAppContext(ctx);
  return selectReport({
    state: cx.state.get(),
    computeMonthReport: cx.compute.monthReport,
    toast: cx.ui.toast,
    getEmployerId: () => employerSelect().value,
    getYm: () => monthInput().value,
  });
}

/**
 * Gemeinsamer Ablauf der Knöpfe: Bericht holen, Datei erzeugen, herunterladen, Hinweis.
 * @param {any} cx gebauter Kontext
 * @param {(r:any)=>Promise<Blob>|Blob} make
 * @param {(r:any)=>string} name
 * @param {string} ok
 * @param {string} fail
 */
async function runExport(cx, make, name, ok, fail) {
  const r = getCurrentReport(cx);
  if (!r) return;
  try {
    const blob = await make(r);
    cx.exports.download(blob, name(r));
    cx.ui.toast(ok);
  } catch (err) {
    console.error(err);
    cx.ui.toast(fail + (/** @type {Error} */ (err)).message);
  }
}

/**
 * Knopf „Word“.
 * @param {any} ctx
 */
export async function exportWord(ctx) {
  const cx = toAppContext(ctx);
  return runExport(cx, cx.exports.word, (r) => fileNameForReport(r, 'docx'), 'Word-Datei heruntergeladen', 'Word-Export fehlgeschlagen: ');
}

/**
 * Knopf „PDF“.
 * @param {any} ctx
 */
export async function exportPdf(ctx) {
  const cx = toAppContext(ctx);
  return runExport(cx, cx.exports.pdf, (r) => fileNameForReport(r, 'pdf'), 'PDF heruntergeladen', 'PDF-Export fehlgeschlagen: ');
}

/**
 * Knopf „CSV“.
 * @param {any} ctx
 */
export async function exportCsv(ctx) {
  const cx = toAppContext(ctx);
  return runExport(cx, cx.exports.csv, (r) => fileNameForReport(r, 'csv'), 'CSV-Datei heruntergeladen', 'CSV-Export fehlgeschlagen: ');
}

/**
 * Knopf „Kilometer-PDF“ (seit v3.13.0).
 * @param {any} ctx
 */
export async function exportKmPdf(ctx) {
  const cx = toAppContext(ctx);
  const r = getCurrentReport(cx);
  if (!r) return;
  if (!(r.fieldService && r.fieldService.km > 0)) { cx.ui.toast('Keine Fahrten mit Kilometern in diesem Monat'); return; }
  try {
    const blob = await cx.exports.kmPdf(r);
    cx.exports.download(blob, fileNameForReport(r, 'pdf').replace(/\.pdf$/, '-kilometer.pdf'));
    cx.ui.toast('Kilometer-PDF heruntergeladen');
  } catch (err) {
    console.error(err);
    cx.ui.toast('Kilometer-PDF fehlgeschlagen: ' + (/** @type {Error} */ (err)).message);
  }
}
