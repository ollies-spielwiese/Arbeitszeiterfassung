// @ts-check
/**
 * modules/ui/soll-warning-banner-ui.js (seit v3.15.3, Roadmap 3 Stufe 2)
 *
 * Banner „Sollstunden-Warnung“ in den Reitern Erfassen und Übersicht (seit
 * v3.9.78/v3.9.79). Fasst alle aktiven Warnungen (Monats-Saldo und
 * Gleitzeitkonto-Saldo über alle nicht-ehemaligen Arbeitgeber) zusammen. Beide
 * Banner zeigen denselben Inhalt; die Warnliste gilt global für den aktuellen
 * Monat und das aktuelle Jahr, unabhängig vom Filter des jeweiligen Reiters.
 * Die Berechnung steckt in modules/soll-warning.js, das HTML in
 * modules/render/soll-warning-banner.js.
 */
import { toAppContext } from '../app-context.js';
import { computeActiveSollWarnings } from '../soll-warning.js';
import { buildSollWarningListHTML } from '../render/soll-warning-banner.js';
import { isFormerEmployer } from '../compute.js';
import { currentYearMonth } from '../util-time.js';

/** DOM-Ziele des Banners (Erfassen, Übersicht). */
export const SOLL_WARNING_BANNER_TARGETS = Object.freeze([
  Object.freeze({ bannerId: 'sollstunden-warning-banner', listId: 'sollstunden-warning-list' }),
  Object.freeze({ bannerId: 'sollstunden-warning-banner-overview', listId: 'sollstunden-warning-list-overview' }),
]);

/**
 * Aktualisiert beide Banner.
 * `overridePeriod` ({ym, year, today}) ist nur für Regressionstests gedacht, damit
 * sie unabhängig vom echten Kalendertag bleiben. Die App übergibt nichts.
 * @param {any} ctx
 * @param {{ym:string, year:number, today:string}} [overridePeriod]
 */
export function updateSollWarningBanner(ctx, overridePeriod) {
  const cx = toAppContext(ctx);
  const targets = SOLL_WARNING_BANNER_TARGETS
    .map(({ bannerId, listId }) => ({ banner: document.getElementById(bannerId), listEl: document.getElementById(listId) }))
    .filter(({ banner, listEl }) => banner && listEl);
  if (!targets.length) return;
  const state = cx.state.get();
  const settings = /** @type {import('../../types.js').AZSettings} */ (state.settings || {});
  const now = Date.now();

  if (settings.sollWarningSnoozeUntil && new Date(settings.sollWarningSnoozeUntil).getTime() > now) {
    targets.forEach(({ banner }) => /** @type {HTMLElement} */ (banner).classList.add('hidden'));
    return;
  }

  const warnings = computeActiveSollWarnings(
    {
      state,
      computeMonthReport: cx.compute.monthReport,
      computeGleitzeitkontoRows: cx.compute.gleitzeitRows,
      computeGleitzeitkontoWindow: cx.compute.gleitzeitWindow,
      computeElapsedMonthProgress: cx.compute.elapsedMonthProgress,
      isFormerEmployer,
    },
    overridePeriod || { ym: currentYearMonth(), year: new Date().getFullYear(), today: cx.data.todayISO() }
  );

  if (!warnings.length) {
    targets.forEach(({ banner }) => /** @type {HTMLElement} */ (banner).classList.add('hidden'));
    return;
  }
  const listHTML = buildSollWarningListHTML(warnings, { escapeHtml: cx.format.escapeHtml, minutesToHM: cx.format.minutesToHM, formatMonthYear: cx.format.monthYear });
  targets.forEach(({ banner, listEl }) => {
    /** @type {HTMLElement} */ (listEl).innerHTML = listHTML;
    /** @type {HTMLElement} */ (banner).classList.remove('hidden');
  });
}
