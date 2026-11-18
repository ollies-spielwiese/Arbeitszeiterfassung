/**
 * Zentraler Kontext (seit v3.14.1, Roadmap 3 Stufe 1).
 *
 * Ein einziges Objekt `ctx` bündelt alle Funktionen, die app.js an die Module
 * weitergibt, in festen Bereichen:
 *   ctx.state    Zustand lesen und speichern
 *   ctx.compute  Berechnungen, Berichte, Salden
 *   ctx.format   Zeit, Geld, Datum, HTML-Escaping, Dateinamen
 *   ctx.ui       Toast, Dialoge
 *   ctx.render   Neuzeichnen der Reiter
 *   ctx.exports  PDF, Word, Download
 *   ctx.data     Arbeitgeber, IDs, Datum, Modus, Wochentage
 *
 *   ctx.extra    Zusätze für einen einzelnen Aufruf (z. B. __saveAndNext), siehe withExtras()
 *
 * Seit v3.14.2 lesen die Dialog-Module unter modules/ui/ und modules/share.js
 * ihre Funktionen über toAppContext(ctx) aus den Bereichen. toAppContext
 * akzeptiert auch ein flaches Objekt (`{ getState, toast, ... }`), wie es
 * Tests und ältere Aufrufer übergeben, und ordnet es über LEGACY_MAP zu.
 * Seit v3.14.3 gibt es in app.js keine eigenen Übergabe-Objekte mehr: Alle
 * Module (auch selectors.js und render/summary.js) bekommen appCtx(). Der
 * Zustand liegt nur in modules/state.js; window.state liest über ctx.state.get().
 *
 * Seit v3.15.1 steuern die Reiter-Module unter modules/tabs/ ihre Ansicht nur
 * über diesen Kontext (Regeln und Tests: scripts/tabs-structure-tests.mjs).
 *
 * Das Modul ist reine Logik ohne DOM-Zugriff.
 */

/**
 * Zuordnung flacher Name → Pfad im Kontext. Jeder Name, den eines der
 * bisherigen Übergabe-Objekte liefert, steht hier genau einmal.
 * @type {Readonly<Record<string, string>>}
 */
export const LEGACY_MAP = Object.freeze({
  // Zustand
  getState: 'state.get',
  saveState: 'state.save',
  // Berechnung
  computeWorkMinutes: 'compute.workMinutes',
  computeHomeofficeMinutes: 'compute.homeofficeMinutes',
  computeSuggestedBreak: 'compute.suggestedBreak',
  holidayOf: 'compute.holidayOf',
  normalizeSegments: 'compute.normalizeSegments',
  normalizeHolidayOverrides: 'compute.normalizeHolidayOverrides',
  hhmmToMinutes: 'compute.hhmmToMinutes',
  defaultSchedule: 'compute.defaultSchedule',
  getSummaryFields: 'compute.summaryFields',
  getOverviewSummaryFields: 'compute.overviewSummaryFields',
  getCurrentReport: 'compute.currentReport',
  getCurrentOverview: 'compute.currentOverview',
  computeFormFields: 'compute.formFields',
  // seit v3.15.1 (Reiter-Module unter modules/tabs/)
  computeMonthTargetMinutes: 'compute.monthTargetMinutes',
  countWorkdaysInMonth: 'compute.workdaysInMonth',
  // seit v3.15.2 (Woche, Gleitzeitkonto)
  computeWeekTargetMinutes: 'compute.weekTargetMinutes',
  computeDayTargetMinutes: 'compute.dayTargetMinutes',
  isHoliday: 'compute.isHoliday',
  getHolidaysInRange: 'compute.holidaysInRange',
  computeGleitzeitkontoRowsForEmployer: 'compute.gleitzeitRows',
  computeGleitzeitkontoAsOfTodayForEmployer: 'compute.gleitzeitAsOf',
  computeGleitzeitkontoWindowForEmployer: 'compute.gleitzeitWindow',
  computeBalanceWarningInfo: 'compute.balanceWarning',
  // seit v3.15.3 (Urlaubsplanung, Übersicht, Sollstunden-Banner)
  computeMonthReport: 'compute.monthReport',
  computeMonthOverview: 'compute.monthOverview',
  computeElapsedMonthProgressForEmployer: 'compute.elapsedMonthProgress',
  // Formate
  formatDate: 'format.date',
  formatMonthYear: 'format.monthYear',
  formatMoney: 'format.money',
  minutesToHM: 'format.minutesToHM',
  hoursDecimal: 'format.hoursDecimal',
  escapeHtml: 'format.escapeHtml',
  renderSummaryPlaintext: 'format.summaryPlaintext',
  fileNameForReport: 'format.fileNameForReport',
  fileNameForOverview: 'format.fileNameForOverview',
  buildHomeofficeSegmentsHTML: 'format.homeofficeSegmentsHTML',
  L: 'format.label',
  // Oberfläche
  toast: 'ui.toast',
  closeModals: 'ui.closeModals',
  openEntryModal: 'ui.openEntryModal',
  populateTemplatePicker: 'ui.populateTemplatePicker',
  saveEntryAndNext: 'ui.saveEntryAndNext',
  openHomeofficeModal: 'ui.openHomeofficeModal',
  getShowFormerEmployers: 'ui.showFormerEmployers',
  setShowFormerEmployers: 'ui.setShowFormerEmployers',
  populateYearSelect: 'ui.populateYearSelect',
  // Neuzeichnen
  renderTracker: 'render.tracker',
  renderEntries: 'render.entries',
  renderWeek: 'render.week',
  renderReport: 'render.report',
  renderOverview: 'render.overview',
  renderEmployers: 'render.employers',
  refreshAll: 'render.all',
  renderArchive: 'render.archive',
  renderGleitzeitkonto: 'render.gleitzeit',
  renderVacationPlanning: 'render.vacation',
  renderSettings: 'render.settings',
  renderAuditLog: 'render.auditLog',
  // Exporte
  generatePdfBlob: 'exports.pdf',
  generateWordBlob: 'exports.word',
  generateOverviewPdfBlob: 'exports.overviewPdf',
  downloadBlob: 'exports.download',
  generateKmPdfBlob: 'exports.kmPdf',
  generateGleitzeitkontoPdfBlob: 'exports.gleitzeitPdf',
  generateVacationCertificatePdfBlob: 'exports.vacationCertificatePdf',
  // Stammdaten und Hilfen
  getEmployer: 'data.employer',
  uid: 'data.uid',
  todayISO: 'data.todayISO',
  ensureActiveEmployer: 'data.ensureActiveEmployer',
  dayOfWeekISO: 'data.dayOfWeekISO',
  isFreelance: 'data.isFreelance',
  getAppMode: 'data.appMode',
  DAY_KEYS: 'data.dayKeys',
  DAY_LABELS_LONG: 'data.dayLabelsLong',
});

/** Bereiche des Kontexts in fester Reihenfolge. */
export const CONTEXT_AREAS = Object.freeze(['state', 'compute', 'format', 'ui', 'render', 'exports', 'data']);

/** Kennzeichen eines gebauten Kontexts (nicht aufzählbar). */
const APP_CONTEXT = Symbol.for('az.appContext');

/**
 * @param {Record<string, Record<string, any>>} areas
 * @param {Record<string, any>} extra
 * @returns {any}
 */
function freezeContext(areas, extra) {
  /** @type {Record<string, any>} */
  const ctx = {};
  for (const a of CONTEXT_AREAS) ctx[a] = Object.freeze({ ...(areas[a] || {}) });
  ctx.extra = Object.freeze({ ...(extra || {}) });
  Object.defineProperty(ctx, APP_CONTEXT, { value: true });
  return Object.freeze(ctx);
}

/**
 * @param {any} ctx
 * @returns {boolean} true, wenn ctx mit createAppContext/withExtras/toAppContext gebaut wurde
 */
export function isAppContext(ctx) {
  return !!(ctx && ctx[APP_CONTEXT] === true);
}

/** Einträge, die keine Funktion sind (Konstanten). */
const NON_FUNCTION_NAMES = new Set(['DAY_KEYS', 'DAY_LABELS_LONG']);

/**
 * Baut den Kontext aus den flachen Abhängigkeiten von app.js.
 * Fehlt eine Abhängigkeit oder hat sie den falschen Typ, wird sofort ein
 * Fehler geworfen, damit Tippfehler nicht erst im Dialog auffallen.
 *
 * @param {Record<string, any>} deps Objekt mit allen Namen aus LEGACY_MAP
 * @returns {any} eingefrorenes Kontext-Objekt
 */
export function createAppContext(deps) {
  if (!deps || typeof deps !== 'object') throw new TypeError('createAppContext: deps fehlt');
  const missing = [];
  /** @type {Record<string, Record<string, any>>} */
  const areas = {};
  for (const a of CONTEXT_AREAS) areas[a] = {};
  for (const [name, path] of Object.entries(LEGACY_MAP)) {
    const value = deps[name];
    const ok = NON_FUNCTION_NAMES.has(name) ? value != null : typeof value === 'function';
    if (!ok) { missing.push(name); continue; }
    const [area, key] = path.split('.');
    areas[area][key] = value;
  }
  if (missing.length) throw new TypeError('createAppContext: fehlende Abhängigkeiten: ' + missing.join(', '));
  return freezeContext(areas, {});
}

/**
 * Neuer Kontext mit zusätzlichen modulspezifischen Einträgen unter ctx.extra.
 * Der Ausgangskontext bleibt unverändert.
 * @param {any} ctx gebauter Kontext
 * @param {Record<string, any>} extras
 * @returns {any}
 */
export function withExtras(ctx, extras) {
  const base = toAppContext(ctx);
  /** @type {Record<string, Record<string, any>>} */
  const areas = {};
  for (const a of CONTEXT_AREAS) areas[a] = base[a];
  return freezeContext(areas, { ...base.extra, ...(extras || {}) });
}

/**
 * Liefert immer einen gebauten Kontext. Ein bereits gebauter Kontext wird
 * unverändert zurückgegeben. Ein flaches Objekt wird über LEGACY_MAP auf die
 * Bereiche verteilt; unbekannte Namen landen unter ctx.extra. Fehlende
 * Einträge bleiben undefined (wie bisher beim flachen Objekt).
 * @param {any} ctx
 * @returns {any}
 */
export function toAppContext(ctx) {
  if (isAppContext(ctx)) return ctx;
  /** @type {Record<string, Record<string, any>>} */
  const areas = {};
  for (const a of CONTEXT_AREAS) areas[a] = {};
  /** @type {Record<string, any>} */
  const extra = {};
  if (ctx && typeof ctx === 'object') {
    for (const [name, value] of Object.entries(ctx)) {
      const path = LEGACY_MAP[name];
      if (path) {
        const [area, key] = path.split('.');
        areas[area][key] = value;
      } else {
        extra[name] = value;
      }
    }
  }
  return freezeContext(areas, extra);
}

/**
 * Liest einen Pfad wie "ui.toast" aus dem Kontext.
 * @param {any} ctx
 * @param {string} path
 * @returns {any}
 */
export function resolvePath(ctx, path) {
  const [area, key] = String(path).split('.');
  const bucket = ctx && ctx[area];
  if (!bucket || !(key in bucket)) throw new Error('Kontext: unbekannter Pfad ' + path);
  return bucket[key];
}

/**
 * Flache Sicht auf den Kontext für die bisherigen Übergabe-Objekte.
 * Beispiel: legacyView(ctx, ['getState', 'toast']) → { getState, toast }
 *
 * @param {any} ctx
 * @param {string[]} names
 * @returns {any}
 */
export function legacyView(ctx, names) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const name of names) {
    const path = LEGACY_MAP[name];
    if (!path) throw new Error('Kontext: unbekannter Name ' + name);
    out[name] = resolvePath(ctx, path);
  }
  return out;
}
