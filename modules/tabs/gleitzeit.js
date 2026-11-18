// @ts-check
/**
 * modules/tabs/gleitzeit.js (seit v3.15.2, Roadmap 3 Stufe 2)
 *
 * Reiter „Gleitzeitkonto“: Jahresauswahl, Monatszeilen mit kumuliertem Saldo,
 * Kachel mit Stand heute und Warnrahmen, Knopf „PDF“. Die HTML-Bausteine liegen
 * in modules/render/gleitzeitkonto.js. Die Rechnungen (Zeilen, Stand heute,
 * 3-Monats-Fenster, Warnung) nutzt auch die Übersicht; sie kommen über den Kontext.
 *
 * Regeln für modules/tabs/: kein Import von app.js, kein window.state,
 * alles Zustandsabhängige über toAppContext(ctx).
 */
import { toAppContext } from '../app-context.js';
import { buildGleitzeitkontoHTML } from '../render/gleitzeitkonto.js';
import { renderSummaryHTML } from '../render/summary.js';
import { buildBalanceTooltipText } from '../selectors.js';

/** @returns {number} Jahr aus der Auswahl, begrenzt auf 1900–2100 */
function selectedYear() {
  const yearInput = /** @type {HTMLSelectElement} */ (document.getElementById('gleitzeitkonto-year'));
  return Math.max(1900, Math.min(2100, parseInt(yearInput.value, 10) || new Date().getFullYear()));
}

/**
 * Zeichnet den Reiter Gleitzeitkonto.
 * @param {any} ctx
 */
export function renderGleitzeitkonto(ctx) {
  const cx = toAppContext(ctx);
  const yearInput = /** @type {HTMLSelectElement} */ (document.getElementById('gleitzeitkonto-year'));
  const formerCb = /** @type {HTMLInputElement|null} */ (document.getElementById('show-former-employers-gleitzeitkonto'));
  if (formerCb) formerCb.checked = !!cx.ui.showFormerEmployers();
  const year = selectedYear();
  cx.ui.populateYearSelect(yearInput, year);
  const container = /** @type {HTMLElement} */ (document.getElementById('gleitzeitkonto-content'));

  cx.data.ensureActiveEmployer();
  const emp = cx.data.employer(cx.state.get().activeEmployerId);
  if (!emp) {
    container.innerHTML = `<div class="empty-state">Bitte zuerst einen ${cx.format.label('employer')} anlegen.</div>`;
    return;
  }

  // Kalenderjahr (Jan–Dez), seit v3.9.48: der kumulierte Saldo läuft über
  // Jahresgrenzen durch, startet aber nie vor „Angestellt seit“.
  const { rows, effectiveStartYm, effectiveEndYm, hiredAfterYear, endedBeforeYear, payout } = cx.compute.gleitzeitRows(emp, year);

  // Seit v3.9.81: Kachel zeigt den Saldo bis heute, der Warnrahmen nutzt das
  // rollierende 3-Monats-Fenster (dieselbe Basis wie das Banner).
  const today = cx.data.todayISO();
  const asOf = cx.compute.gleitzeitAsOf(emp, year, today);
  const windowResult = cx.compute.gleitzeitWindow(emp, today);
  const balanceWarning = cx.compute.balanceWarning(windowResult.balance, windowResult.targetMin, 'gleitzeitkonto');

  container.innerHTML = buildGleitzeitkontoHTML(rows, emp, {
    escapeHtml: cx.format.escapeHtml,
    minutesToHM: cx.format.minutesToHM,
    formatMonthYear: cx.format.monthYear,
    renderSummaryHTML,
    buildBalanceTooltipText,
    balanceWarning,
    asOf,
  }, { year, effectiveStartYm, effectiveEndYm, hiredAfterYear, endedBeforeYear, payout });
}

/**
 * Daten des angezeigten Gleitzeitkontos (für PDF und Berichts-Schnappschuss).
 * @param {any} ctx
 * @returns {{ rows: any[], emp: any, meta: any } | null}
 */
export function getCurrentGleitzeitkonto(ctx) {
  const cx = toAppContext(ctx);
  const year = selectedYear();
  cx.data.ensureActiveEmployer();
  const emp = cx.data.employer(cx.state.get().activeEmployerId);
  if (!emp) {
    cx.ui.toast(`Bitte zuerst einen ${cx.format.label('employer')} anlegen`);
    return null;
  }
  const { rows, effectiveStartYm, effectiveEndYm, hiredAfterYear, endedBeforeYear, payout } = cx.compute.gleitzeitRows(emp, year);
  const asOf = cx.compute.gleitzeitAsOf(emp, year, cx.data.todayISO());
  return { rows, emp, meta: { year, effectiveStartYm, effectiveEndYm, hiredAfterYear, endedBeforeYear, asOf, payout } };
}

/**
 * @param {any} emp
 * @param {{ year: number }} meta
 * @param {string} ext
 */
export function fileNameForGleitzeitkonto(emp, meta, ext) {
  const empSlug = (emp.name || 'Arbeitgeber').replace(/[^\p{L}\p{N}]+/gu, '_');
  return `Arbeitszeit_Gleitzeitkonto_${empSlug}_${meta.year}.${ext}`;
}

/**
 * Knopf „PDF“ im Reiter Gleitzeitkonto.
 * @param {any} ctx
 */
export async function exportGleitzeitkontoPdf(ctx) {
  const cx = toAppContext(ctx);
  const current = getCurrentGleitzeitkonto(cx);
  if (!current) return;
  const { rows, emp, meta } = current;
  try {
    const blob = await cx.exports.gleitzeitPdf(rows, emp, meta);
    cx.exports.download(blob, fileNameForGleitzeitkonto(emp, meta, 'pdf'));
    cx.ui.toast('Gleitzeitkonto als PDF heruntergeladen');
  } catch (err) {
    console.error(err);
    cx.ui.toast('PDF-Export fehlgeschlagen: ' + (/** @type {any} */ (err)).message);
  }
}
