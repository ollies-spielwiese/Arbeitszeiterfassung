// @ts-check
/**
 * modules/tabs/overview.js (seit v3.15.3, Roadmap 3 Stufe 2)
 *
 * Reiter „Übersicht“: Monatsauswahl, Summen über alle Arbeitgeber, Zeilen je
 * Arbeitgeber, Hinweise Arbeitszeitgesetz und Knopf „PDF“. Die Monatsübersicht
 * selbst (Kontext: compute.monthOverview) bleibt in app.js, weil Teilen und PDF
 * denselben Stand von „Ehemalige anzeigen“ brauchen. Das HTML liegt in
 * modules/render/overview.js, das PDF in modules/export/overview-pdf.js.
 *
 * Regeln für modules/tabs/: kein Import von app.js, kein window.state,
 * alles Zustandsabhängige über toAppContext(ctx).
 */
import { toAppContext } from '../app-context.js';
import { buildOverviewHTML } from '../render/overview.js';
import { renderSummaryHTML } from '../render/summary.js';
import { getCurrentOverview as selectOverview } from '../selectors.js';
import { computeArbzgHints, buildArbzgOverviewHTML, isArbzgHintEnabled } from '../arbzg-hints.js';
import { updateSollWarningBanner } from '../ui/soll-warning-banner-ui.js';
import { currentYearMonth } from '../util-time.js';

/** @returns {HTMLInputElement} */
const monthInput = () => /** @type {HTMLInputElement} */ (document.getElementById('overview-month'));

/**
 * Dateiname für PDF und Teilen (auch modules/share.js über den Kontext: format.fileNameForOverview).
 * @param {{ym:string}} ov
 * @param {string} ext
 */
export function fileNameForOverview(ov, ext) {
  return `Arbeitszeit_Übersicht_${ov.ym}.${ext}`;
}

/**
 * Zeichnet den Reiter Übersicht.
 * @param {any} ctx
 */
export function renderOverview(ctx) {
  const cx = toAppContext(ctx);
  updateSollWarningBanner(cx);
  const input = monthInput();
  const formerCb = /** @type {HTMLInputElement|null} */ (document.getElementById('show-former-employers-overview'));
  if (formerCb) formerCb.checked = !!cx.ui.showFormerEmployers();
  if (!input.value) input.value = currentYearMonth();
  const ym = input.value;
  const container = /** @type {HTMLElement} */ (document.getElementById('overview-content'));
  const st = cx.state.get();

  if (!st.employers.length) {
    container.innerHTML = '<div class="empty-state">Bitte zuerst einen Arbeitgeber anlegen.</div>';
    return;
  }

  const ov = cx.compute.monthOverview(ym);
  if (!ov.rows.length) {
    container.innerHTML = '<div class="empty-state">Keine Daten für diesen Monat.</div>';
    return;
  }

  container.innerHTML = buildOverviewHTML(ov, ym, {
    escapeHtml: cx.format.escapeHtml,
    formatMonthYear: cx.format.monthYear,
    minutesToHM: cx.format.minutesToHM,
    formatMoney: cx.format.money,
    isFreelance: cx.data.isFreelance,
    getOverviewSummaryFields: cx.compute.overviewSummaryFields,
    renderSummaryHTML,
  });
  // v3.12.0: Hinweise Arbeitszeitgesetz des Monats (alle Arbeitgeber zusammen).
  if (isArbzgHintEnabled(st.settings)) {
    const lastDay = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
    const hints = computeArbzgHints(st.entries, st.employers, `${ym}-01`, `${ym}-${String(lastDay).padStart(2, '0')}`);
    container.insertAdjacentHTML('beforeend', buildArbzgOverviewHTML(hints, cx.format.monthYear(ym), cx.format.escapeHtml));
  }
}

/**
 * Aktuelle Übersicht laut Monatsauswahl, oder null (mit Hinweis), wenn etwas fehlt.
 * @param {any} ctx
 */
export function getCurrentOverview(ctx) {
  const cx = toAppContext(ctx);
  return selectOverview({
    state: cx.state.get(),
    computeMonthOverview: cx.compute.monthOverview,
    toast: cx.ui.toast,
    getYm: () => monthInput().value,
  });
}

/**
 * Knopf „PDF“ der Übersicht.
 * @param {any} ctx
 */
export async function exportOverviewPdf(ctx) {
  const cx = toAppContext(ctx);
  const ov = getCurrentOverview(cx);
  if (!ov) return;
  try {
    const blob = await cx.exports.overviewPdf(ov);
    cx.exports.download(blob, fileNameForOverview(ov, 'pdf'));
    cx.ui.toast('Übersicht als PDF heruntergeladen');
  } catch (err) {
    console.error(err);
    cx.ui.toast('PDF-Export fehlgeschlagen: ' + (/** @type {Error} */ (err)).message);
  }
}
