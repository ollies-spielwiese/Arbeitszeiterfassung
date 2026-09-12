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
    getEmployer, getCurrentReport, getCurrentOverview, computeEntryRows,
    uid, normalizeSegments, normalizeHolidayOverrides, shiftYearMonth,
    // Holidays
    getHolidays, getHolidaysInRange, isHoliday, easterSunday, applyHolidayOverrides,
    // Range-Entry (Option B — Bulk-Erfassung Zeitraum)
    buildRangeEntries, formatRangeEntrySummary, removeEntriesByIds,
    // Rendering + Views
    switchView, renderReport, renderTracker, renderWeek, renderEntries, renderEmployers, renderArchive, renderSettings,
    // Compute + Export
    DAY_KEYS, DAY_LABELS, DAY_LABELS_LONG,
    computeWorkMinutes, computeHomeofficeMinutes, isWorkedEntry,
    legalBreakMinutes, computeSuggestedBreak, defaultSchedule,
    computeMonthTargetMinutes, computeWeekTargetMinutes, computeDayTargetMinutes, countWorkdaysInMonth,
    computeMonthReport, computeMonthOverview, computeVacationRemaining,
    computeYearlyVacationPlanning, MONTH_LABELS_LONG, buildVacationPlanningHTML,
    generatePdfBlob, generateOverviewPdfBlob, generateWordBlob,
    // Änderungsprotokoll / Backup-Erinnerung (seit v3.9.47)
    pushAuditLog, formatAuditLogLine, buildAuditLogHTML, renderAuditLog, updateBackupReminderBanner,
    // CSV-Export (seit v3.9.47)
    generateCsvBlob,
    // Gleitzeitkonto-Ansicht (seit v3.9.47, Kalenderjahr-Logik seit v3.9.48)
    buildGleitzeitkontoHTML, renderGleitzeitkonto, computeGleitzeitkontoRows,
    // Arbeitgeberwechsel / "Beschäftigt bis" (seit v3.9.55)
    isFormerEmployer, filterVisibleEmployers, setShowFormerEmployers, todayISO, buildEmployerCardsHTML,
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
  if (typeof computeEntryRows === 'function') target.computeEntryRows = computeEntryRows;
  if (typeof shiftYearMonth === 'function') target.shiftYearMonth = shiftYearMonth;
  if (typeof uid === 'function') target.uid = uid;
  if (typeof normalizeSegments === 'function') target.normalizeSegments = normalizeSegments;
  if (typeof normalizeHolidayOverrides === 'function') target.normalizeHolidayOverrides = normalizeHolidayOverrides;
  if (typeof getHolidays === 'function') target.getHolidays = getHolidays;
  if (typeof getHolidaysInRange === 'function') target.getHolidaysInRange = getHolidaysInRange;
  if (typeof isHoliday === 'function') target.isHoliday = isHoliday;
  if (typeof easterSunday === 'function') target.easterSunday = easterSunday;
  if (typeof applyHolidayOverrides === 'function') target.applyHolidayOverrides = applyHolidayOverrides;
  if (typeof buildRangeEntries === 'function') target.buildRangeEntries = buildRangeEntries;
  if (typeof formatRangeEntrySummary === 'function') target.formatRangeEntrySummary = formatRangeEntrySummary;
  if (typeof removeEntriesByIds === 'function') target.removeEntriesByIds = removeEntriesByIds;

  // Rendering + Views
  if (typeof switchView === 'function') target.switchView = switchView;
  if (typeof renderReport === 'function') target.renderReport = renderReport;
  if (typeof renderTracker === 'function') target.renderTracker = renderTracker;
  if (typeof renderWeek === 'function') target.renderWeek = renderWeek;
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
  if (typeof computeDayTargetMinutes === 'function') target.computeDayTargetMinutes = computeDayTargetMinutes;
  if (typeof countWorkdaysInMonth === 'function') target.countWorkdaysInMonth = countWorkdaysInMonth;
  if (typeof computeMonthReport === 'function') target.computeMonthReport = computeMonthReport;
  if (typeof computeMonthOverview === 'function') target.computeMonthOverview = computeMonthOverview;
  if (typeof computeVacationRemaining === 'function') target.computeVacationRemaining = computeVacationRemaining;
  if (typeof computeYearlyVacationPlanning === 'function') target.computeYearlyVacationPlanning = computeYearlyVacationPlanning;
  if (typeof MONTH_LABELS_LONG !== 'undefined') target.MONTH_LABELS_LONG = MONTH_LABELS_LONG;
  if (typeof buildVacationPlanningHTML === 'function') target.buildVacationPlanningHTML = buildVacationPlanningHTML;
  if (typeof generatePdfBlob === 'function') target.generatePdfBlob = generatePdfBlob;
  if (typeof generateOverviewPdfBlob === 'function') target.generateOverviewPdfBlob = generateOverviewPdfBlob;
  if (typeof generateWordBlob === 'function') target.generateWordBlob = generateWordBlob;

  // Änderungsprotokoll / Backup-Erinnerung (seit v3.9.47)
  if (typeof pushAuditLog === 'function') target.pushAuditLog = pushAuditLog;
  if (typeof formatAuditLogLine === 'function') target.formatAuditLogLine = formatAuditLogLine;
  if (typeof buildAuditLogHTML === 'function') target.buildAuditLogHTML = buildAuditLogHTML;
  if (typeof renderAuditLog === 'function') target.renderAuditLog = renderAuditLog;
  if (typeof updateBackupReminderBanner === 'function') target.updateBackupReminderBanner = updateBackupReminderBanner;

  // CSV-Export (seit v3.9.47)
  if (typeof generateCsvBlob === 'function') target.generateCsvBlob = generateCsvBlob;

  // Gleitzeitkonto-Ansicht (seit v3.9.47)
  if (typeof buildGleitzeitkontoHTML === 'function') target.buildGleitzeitkontoHTML = buildGleitzeitkontoHTML;
  if (typeof renderGleitzeitkonto === 'function') target.renderGleitzeitkonto = renderGleitzeitkonto;
  if (typeof computeGleitzeitkontoRows === 'function') target.computeGleitzeitkontoRows = computeGleitzeitkontoRows;

  // Arbeitgeberwechsel / "Beschäftigt bis" (seit v3.9.55, für Regression-Unit-Tests)
  if (typeof isFormerEmployer === 'function') target.isFormerEmployer = isFormerEmployer;
  if (typeof filterVisibleEmployers === 'function') target.filterVisibleEmployers = filterVisibleEmployers;
  if (typeof setShowFormerEmployers === 'function') target.setShowFormerEmployers = setShowFormerEmployers;
  if (typeof todayISO === 'function') target.todayISO = todayISO;
  if (typeof buildEmployerCardsHTML === 'function') target.buildEmployerCardsHTML = buildEmployerCardsHTML;
}
