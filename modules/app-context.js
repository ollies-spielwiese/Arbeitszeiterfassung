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
 * Übergang: Die bisherigen `_xyzCtx()`-Funktionen in app.js liefern weiterhin
 * die gewohnten flachen Namen (`getState`, `toast`, ...). Sie holen die Werte
 * über `legacyView()` aus `ctx`. Ab v3.14.2 lesen die Module direkt
 * `ctx.bereich.funktion`, in v3.14.3 entfallen die Übergabe-Objekte.
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
  // Neuzeichnen
  renderTracker: 'render.tracker',
  renderEntries: 'render.entries',
  renderWeek: 'render.week',
  renderReport: 'render.report',
  renderOverview: 'render.overview',
  renderEmployers: 'render.employers',
  refreshAll: 'render.all',
  // Exporte
  generatePdfBlob: 'exports.pdf',
  generateWordBlob: 'exports.word',
  generateOverviewPdfBlob: 'exports.overviewPdf',
  downloadBlob: 'exports.download',
  // Stammdaten und Hilfen
  getEmployer: 'data.employer',
  uid: 'data.uid',
  todayISO: 'data.todayISO',
  dayOfWeekISO: 'data.dayOfWeekISO',
  isFreelance: 'data.isFreelance',
  getAppMode: 'data.appMode',
  DAY_KEYS: 'data.dayKeys',
  DAY_LABELS_LONG: 'data.dayLabelsLong',
});

/** Bereiche des Kontexts in fester Reihenfolge. */
export const CONTEXT_AREAS = Object.freeze(['state', 'compute', 'format', 'ui', 'render', 'exports', 'data']);

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
  /** @type {Record<string, any>} */
  const ctx = {};
  for (const a of CONTEXT_AREAS) ctx[a] = Object.freeze(areas[a]);
  return Object.freeze(ctx);
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
