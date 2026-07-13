/**
 * modules/regression-bridge.js
 *
 * Compatibility-Bridge (Phase 3.9i, aus app.js extrahiert).
 *
 * Da app.js als type=module lädt, sind Top-Level-Deklarationen NICHT
 * automatisch am window. Damit Regression-Skripte (page.evaluate) und alle
 * Legacy-Inline-Handler in index.html weiterhin funktionieren, exponieren
 * wir die relevanten Symbole explizit.
 *
 * Verwendung in app.js:
 *   import { exportBridge } from './modules/regression-bridge.js';
 *   exportBridge(window, { state, saveState, loadState, ..., _runMigrationsModule });
 */

export function exportBridge(target, refs) {
  if (!target || typeof target !== 'object') return;
  if (!refs || typeof refs !== 'object') return;

  const {
    // State + Persistenz
    state, saveState, loadState, SCHEMA_VERSION, DEFAULT_STATE, STORAGE_KEY,
    // Migrations
    _runMigrationsModule, migrateHomeofficeEntries,
    // Selectors + Utilities
    getSummaryFields, getOverviewSummaryFields,
    renderSummaryHTML, renderSummaryPdfLines, renderSummaryWordParagraphs, renderSummaryPlaintext,
    getEmployer, getCurrentReport, getCurrentOverview,
    uid, normalizeSegments, normalizeHolidayOverrides,
    // Holidays
    getHolidays, getHolidaysInRange, isHoliday, easterSunday, applyHolidayOverrides,
    // Rendering + Views
    switchView, renderReport, renderTracker, renderEntries, renderEmployers, renderArchive, renderSettings,
    // Compute + Export
    DAY_KEYS, DAY_LABELS, DAY_LABELS_LONG,
    computeWorkMinutes, computeHomeofficeMinutes, isWorkedEntry,
    legalBreakMinutes, computeSuggestedBreak, defaultSchedule,
    computeMonthTargetMinutes, computeWeekTargetMinutes, countWorkdaysInMonth,
    computeMonthReport, computeMonthOverview, computeVacationRemaining,
    generatePdfBlob, generateOverviewPdfBlob, generateWordBlob,
  } = refs;

  // State + Persistenz
  target.state = state;
  target.saveState = saveState;
  target.loadState = loadState;
  target.SCHEMA_VERSION = SCHEMA_VERSION;
  target.DEFAULT_STATE = DEFAULT_STATE;
  target.STORAGE_KEY = STORAGE_KEY;

  // Migrations (für Regression-Unit-Tests)
  // Regression ruft runMigrations(s) ohne helpers auf — helpers hier injizieren
  // (funktioniert wie in der alten Bundle-Welt, wo migrations[] uid/normalizeSegments
  // aus dem umschließenden Scope zog).
  if (typeof _runMigrationsModule === 'function') {
    target.runMigrations = (s) => _runMigrationsModule(s, { uid, normalizeSegments });
  }
  if (typeof migrateHomeofficeEntries === 'function') target.migrateHomeofficeEntries = migrateHomeofficeEntries;

  // Selectors + Utilities für Regression
  if (typeof getSummaryFields === 'function') target.getSummaryFields = getSummaryFields;
  if (typeof getOverviewSummaryFields === 'function') target.getOverviewSummaryFields = getOverviewSummaryFields;
  if (typeof renderSummaryHTML === 'function') target.renderSummaryHTML = renderSummaryHTML;
  if (typeof renderSummaryPdfLines === 'function') target.renderSummaryPdfLines = renderSummaryPdfLines;
  if (typeof renderSummaryWordParagraphs === 'function') target.renderSummaryWordParagraphs = renderSummaryWordParagraphs;
  if (typeof renderSummaryPlaintext === 'function') target.renderSummaryPlaintext = renderSummaryPlaintext;
  if (typeof getEmployer === 'function') target.getEmployer = getEmployer;
  if (typeof getCurrentReport === 'function') target.getCurrentReport = getCurrentReport;
  if (typeof getCurrentOverview === 'function') target.getCurrentOverview = getCurrentOverview;
  if (typeof uid === 'function') target.uid = uid;
  if (typeof normalizeSegments === 'function') target.normalizeSegments = normalizeSegments;
  if (typeof normalizeHolidayOverrides === 'function') target.normalizeHolidayOverrides = normalizeHolidayOverrides;
  if (typeof getHolidays === 'function') target.getHolidays = getHolidays;
  if (typeof getHolidaysInRange === 'function') target.getHolidaysInRange = getHolidaysInRange;
  if (typeof isHoliday === 'function') target.isHoliday = isHoliday;
  if (typeof easterSunday === 'function') target.easterSunday = easterSunday;
  if (typeof applyHolidayOverrides === 'function') target.applyHolidayOverrides = applyHolidayOverrides;

  // Rendering + Views
  if (typeof switchView === 'function') target.switchView = switchView;
  if (typeof renderReport === 'function') target.renderReport = renderReport;
  if (typeof renderTracker === 'function') target.renderTracker = renderTracker;
  if (typeof renderEntries === 'function') target.renderEntries = renderEntries;
  if (typeof renderEmployers === 'function') target.renderEmployers = renderEmployers;
  if (typeof renderArchive === 'function') target.renderArchive = renderArchive;
  if (typeof renderSettings === 'function') target.renderSettings = renderSettings;

  // Compute + Export für Regression
  if (typeof DAY_KEYS !== 'undefined') target.DAY_KEYS = DAY_KEYS;
  if (typeof DAY_LABELS !== 'undefined') target.DAY_LABELS = DAY_LABELS;
  if (typeof DAY_LABELS_LONG !== 'undefined') target.DAY_LABELS_LONG = DAY_LABELS_LONG;
  if (typeof computeWorkMinutes === 'function') target.computeWorkMinutes = computeWorkMinutes;
  if (typeof computeHomeofficeMinutes === 'function') target.computeHomeofficeMinutes = computeHomeofficeMinutes;
  if (typeof isWorkedEntry === 'function') target.isWorkedEntry = isWorkedEntry;
  if (typeof legalBreakMinutes === 'function') target.legalBreakMinutes = legalBreakMinutes;
  if (typeof computeSuggestedBreak === 'function') target.computeSuggestedBreak = computeSuggestedBreak;
  if (typeof defaultSchedule === 'function') target.defaultSchedule = defaultSchedule;
  if (typeof computeMonthTargetMinutes === 'function') target.computeMonthTargetMinutes = computeMonthTargetMinutes;
  if (typeof computeWeekTargetMinutes === 'function') target.computeWeekTargetMinutes = computeWeekTargetMinutes;
  if (typeof countWorkdaysInMonth === 'function') target.countWorkdaysInMonth = countWorkdaysInMonth;
  if (typeof computeMonthReport === 'function') target.computeMonthReport = computeMonthReport;
  if (typeof computeMonthOverview === 'function') target.computeMonthOverview = computeMonthOverview;
  if (typeof computeVacationRemaining === 'function') target.computeVacationRemaining = computeVacationRemaining;
  if (typeof generatePdfBlob === 'function') target.generatePdfBlob = generatePdfBlob;
  if (typeof generateOverviewPdfBlob === 'function') target.generateOverviewPdfBlob = generateOverviewPdfBlob;
  if (typeof generateWordBlob === 'function') target.generateWordBlob = generateWordBlob;
}
