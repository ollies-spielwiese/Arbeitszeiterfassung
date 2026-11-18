/**
 * @typedef {import('./types.js').AZEmployer} AZEmployer
 * @typedef {import('./types.js').AZEntry} AZEntry
 * @typedef {import('./types.js').AZState} AZState
 * @typedef {import('./types.js').AZHoliday} AZHoliday
 * @typedef {import('./types.js').AZSummaryInput} AZSummaryInput
 * @typedef {import('./types.js').AZSummaryField} AZSummaryField
 * @typedef {import('./types.js').AZMonthReport} AZMonthReport
 * @typedef {import('./types.js').AZMonthOverview} AZMonthOverview
 * @typedef {import('./types.js').AZRunningTimer} AZRunningTimer
 */

/* Arbeitszeiterfassung – Offline-PWA v2
 *
 * Types: siehe types.js (zentrale JSDoc-übergreifende Definitionen mit AZ-Prefix).
 * VS Code / tsc erkennen die Typen automatisch über jsconfig.json.
 *
 * Datenmodell:
 * state = {
 *   employers: [{
 *     id, name, color, phone,
 *     contacts: [{ name, email }, { name, email }],
 *     hoursMode: 'week' | 'month',
 *     weeklyHours, monthlyHours,
 *     breakMode: 'legal'|'manual'|'flex'|'none',
 *     annualVacation,
 *     schedule: { mon:{enabled,start,end,break}, tue:..., wed:..., thu:..., fri:..., sat:..., sun:... },
 *     notes
 *   }],
 *   entries: [{ id, employerId, date, type:'work'|'homeoffice'|'vacation'|'education_leave'|'sick'|'overtime_reduction', start, end, breakMinutes, segments, overtimeReason, note, createdAt }],
 *   // 'work' (Präsenz): start, end, breakMinutes, overtimeReason.
 *   // 'homeoffice': segments = [{start, end}, ...]; keine Pause, kein Überstundengrund. Netto = Summe der Segmente.
 *   archives: [{ id, employerId, yearMonth, generatedAt, snapshot }],
 *   templates: [{ id, label, text }],
 *   settings: { ownEmail, state: 'HE' },
 *   activeEmployerId,
 *   runningTimer: { employerId, startISO } | null
 * }
 *
 * Modul-Grenzen (Phase 3.1):
 *   - modules/migrations.js — SCHEMA_VERSION, migrations[], runMigrations, migrateHomeofficeEntries (DI)
 *   - modules/state.js — STORAGE_KEY, storage, DEFAULT_STATE, loadState, saveState, getState, setState
 */

import { SCHEMA_VERSION, migrateHomeofficeEntries as _migrateHomeofficeEntriesRaw, runMigrations as _runMigrationsModule } from './modules/migrations.js';
import { splitAcrossMidnight } from './modules/util-time.js';
import { findEntryConflict, ENTRY_CONFLICT_MESSAGE } from './modules/entry-conflicts.js';
import {
  STORAGE_KEY,
  DEFAULT_STATE,
  storage,
  loadState as _loadStateRaw,
  saveState as _saveState,
  getState as _getState,
  replaceStateAtomically,
  wasLastLoadCorrupted,
  getCorruptedBackupKey,
  onStatePersisted,
} from './modules/state.js';
import * as MirrorModule from './modules/storage-idb.js';
const { mirrorPersisted, startMirror, MIRROR_STATUS_EVENT } = MirrorModule;
import { showMirrorRestore } from './modules/ui/mirror-restore-ui.js';
import {
  pad,
  todayISO,
  currentYearMonth,
  formatDate,
  formatDateLong,
  formatMonthYear,
  minutesToHM,
  hoursDecimal,
  timeToMinutes,
  isoDateAdd,
  dayOfWeekISO,
  dateISO,
  addDays,
  daysInMonth,
  monthDates,
  shiftYearMonth,
} from './modules/util-time.js';
import { escapeHtml, formatMoney as _formatMoneyRaw } from './modules/util-format.js';
import {
  normalizeHolidayOverrides as _normalizeHolidayOverridesRaw,
  applyHolidayOverrides as _applyHolidayOverridesRaw,
  easterSunday,
  getHolidays as _getHolidaysRaw,
  getHolidaysInRange as _getHolidaysInRangeRaw,
  isHoliday as _isHolidayRaw,
} from './modules/holidays.js';
import {
  DAY_KEYS,
  DAY_LABELS,
  DAY_LABELS_LONG,
  computeWorkMinutes as _computeWorkMinutesRaw,
  computeHomeofficeMinutes as _computeHomeofficeMinutesRaw,
  isWorkedEntry as _isWorkedEntryRaw,
  legalBreakMinutes as _legalBreakMinutesRaw,
  computeSuggestedBreak as _computeSuggestedBreakRaw,
  defaultSchedule as _defaultScheduleRaw,
  computeMonthTargetMinutes as _computeMonthTargetMinutesRaw,
  computeWeekTargetMinutes as _computeWeekTargetMinutesRaw,
  computeDayTargetMinutes as _computeDayTargetMinutesRaw,
  countWorkdaysInMonth as _countWorkdaysInMonthRaw,
  computeMonthReport as _computeMonthReportRaw,
  computeMonthOverview as _computeMonthOverviewRaw,
  computeVacationRemaining,
  computeYearlyVacationPlanning,
  computeEducationLeaveYear,
  computeVacationCalendarMonth,
  computeVacationCertificate,
  getExitPayout,
  computeGleitzeitkontoRows as _computeGleitzeitkontoRowsRaw,
  computeGleitzeitkontoAsOfToday as _computeGleitzeitkontoAsOfTodayRaw,
  computeGleitzeitkontoRollingWindow as _computeGleitzeitkontoRollingWindowRaw,
  computeElapsedMonthProgress as _computeElapsedMonthProgressRaw,
  MONTH_LABELS_LONG,
  isFormerEmployer,
  filterVisibleEmployers,
} from './modules/compute.js';
import { buildVacationPlanningHTML as _buildVacationPlanningHTMLRaw } from './modules/render/vacation-planning.js';
import { buildVacationCalendarHTML as _buildVacationCalendarHTMLRaw } from './modules/render/vacation-calendar.js';
import { buildAuditLogHTML as _buildAuditLogHTMLRaw } from './modules/render/audit-log.js';
import { buildGleitzeitkontoHTML as _buildGleitzeitkontoHTMLRaw } from './modules/render/gleitzeitkonto.js';
import {
  evaluateSollWarning as _evaluateSollWarningRaw,
  formatSollWarningTooltipText as _formatSollWarningTooltipTextRaw,
  buildBalanceWarningInfo as _buildBalanceWarningInfoRaw,
  computeActiveSollWarnings as _computeActiveSollWarningsRaw,
  MONTH_THRESHOLD_MIN_PCT,
  MIN_ABSOLUTE_DEVIATION_MIN,
  clampMonthThresholdPct,
  computeMinElapsedWorkdaysForThreshold,
} from './modules/soll-warning.js';
import { buildSollWarningListHTML as _buildSollWarningListHTMLRaw } from './modules/render/soll-warning-banner.js';
import {
  getEmployer as _getEmployerRaw,
  getCurrentReport as _getCurrentReportRaw,
  getSummaryFields as _getSummaryFieldsRaw,
  getOverviewSummaryFields as _getOverviewSummaryFieldsRaw,
  computeEntryRows as _computeEntryRowsRaw,
  computeFormFields as _computeFormFieldsRaw,
} from './modules/selectors.js';
import {
  renderSummaryHTML as _renderSummaryHTMLRaw,
  renderSummaryPdfLines as _renderSummaryPdfLinesRaw,
  renderSummaryWordParagraphs as _renderSummaryWordParagraphsRaw,
  renderSummaryPlaintext as _renderSummaryPlaintextRaw,
} from './modules/render/summary.js';
import { buildReportHTML as _buildReportHTMLRaw } from './modules/render/report.js';
import { isArbzgHintEnabled } from './modules/arbzg-hints.js';
import { buildEmployerCardsHTML as _buildEmployerCardsHTMLRaw } from './modules/render/employers.js';
import { renderArchive as _renderArchiveTab, archiveCurrentMonth as _archiveCurrentMonthTab } from './modules/tabs/archive.js';
import { renderEntries as _renderEntriesTab } from './modules/tabs/entries.js';
import { renderVacationPlanning as _renderVacationPlanningTab } from './modules/tabs/vacation.js';
import {
  renderOverview as _renderOverviewTab, getCurrentOverview as _getCurrentOverviewTab,
  exportOverviewPdf as _exportOverviewPdfTab, fileNameForOverview,
} from './modules/tabs/overview.js';
import { updateSollWarningBanner as _updateSollWarningBannerUi } from './modules/ui/soll-warning-banner-ui.js';
import { populateYearSelect as _populateYearSelectUi } from './modules/ui/year-select.js';
import { renderWeek as _renderWeekTab, installWeekInputFallback as _installWeekInputFallbackTab } from './modules/tabs/week.js';
import {
  renderGleitzeitkonto as _renderGleitzeitkontoTab, getCurrentGleitzeitkonto as _getCurrentGleitzeitkontoTab,
  exportGleitzeitkontoPdf as _exportGleitzeitkontoPdfTab,
} from './modules/tabs/gleitzeit.js';
import {
  buildTodaySummaryHTML as _buildTodaySummaryHTMLRaw,
  buildHomeofficeSegmentsHTML as _buildHomeofficeSegmentsHTMLRaw,
} from './modules/render/tracker.js';
import { generateWordBlob as _generateWordBlobRaw } from './modules/export/word.js';
import { generateCsvBlob as _generateCsvBlobRaw } from './modules/export/csv.js';
import { generatePdfBlob as _generatePdfBlobRaw } from './modules/export/pdf.js';
import { generateOverviewPdfBlob as _generateOverviewPdfBlobRaw } from './modules/export/overview-pdf.js';
import { generateGleitzeitkontoPdfBlob as _generateGleitzeitkontoPdfBlobRaw } from './modules/export/gleitzeitkonto-pdf.js';
import { generateVacationCertificatePdfBlob as _generateVacationCertificatePdfBlobRaw, buildVacationCertificateRows } from './modules/export/vacation-certificate-pdf.js';
import { ensurePdfLibs, ensureDocxLib } from './modules/lib-loader.js';
import {
  wireFieldServiceUI, renderTrackerFieldService, renderFieldServiceSettings,
  getTrackerStartFieldService, resetTrackerPick, fieldServiceFromTimer, tripsMissingKm, openKmModal,
} from './modules/ui/field-service-ui.js';
import { renderStorageStatus, maybeRequestPersist, wireStorageStatusUI } from './modules/ui/storage-status-ui.js';
import { computeBackupReminder } from './modules/storage-status.js';
import { getFieldServiceSettings, formatKm, formatEuro } from './modules/field-service.js';
import { generateKmPdfBlob as _generateKmPdfBlobRaw } from './modules/export/km-pdf.js';
import { downloadBlob } from './modules/export/download.js';
import { createAppContext, withExtras } from './modules/app-context.js';
import { initServiceWorkerUpdates } from './modules/sw-update.js';
import { maybeShowWhatsNew as _maybeShowWhatsNewRaw, compareVersions } from './modules/whatsnew.js';
import { maybeShowKindMigrationNotice as _maybeShowKindMigrationNoticeRaw } from './modules/kind-migration-notice.js';
import { exportBackup as _exportBackupRaw, importBackup as _importBackupRaw, prepareImportedState } from './modules/backup.js';
import {
  isFolderPickerSupported,
  getStoredFolderHandle,
  chooseFolder as _chooseFolderRaw,
  queryFolderPermission,
  writeBackupToFolder,
} from './modules/backupFolder.js';
import {
  openShareModal as _openShareModalRaw,
  openOverviewShareModal as _openOverviewShareModalRaw,
  showMailtoStage2 as _showMailtoStage2Raw,
  shareReport as _shareReportRaw,
  shareOverviewPdf as _shareOverviewPdfRaw,
} from './modules/share.js';
import {
  openEntryModal as _openEntryModalRaw,
  updateScheduleFillVisibility as _updateScheduleFillVisibilityRaw,
  applyScheduleToEntry as _applyScheduleToEntryRaw,
  updateEntryTypeFields as _updateEntryTypeFieldsRaw,
  updateBreakHint as _updateBreakHintRaw,
  updateEntryArbzgHint as _updateEntryArbzgHintRaw,
  saveEntry as _saveEntryRaw,
  deleteEntry as _deleteEntryRaw,
} from './modules/ui/entry-modal.js';
import {
  openRangeEntryModal as _openRangeEntryModalRaw,
  saveRangeEntry as _saveRangeEntryRaw,
  updateRangeVacationStats as _updateRangeVacationStatsRaw,
} from './modules/ui/range-entry-modal.js';
import { buildRangeEntries, formatRangeEntrySummary, removeEntriesByIds } from './modules/range-entry.js';
import { pushAuditLog, formatAuditLogLine } from './modules/audit-log.js';
import {
  openHomeofficeModal as _openHomeofficeModalRaw,
  updateHomeofficeContext as _updateHomeofficeContextRaw,
  readHomeofficeSegmentsFromDom as _readHomeofficeSegmentsFromDomRaw,
  persistHomeofficeSegmentsToState as _persistHomeofficeSegmentsToStateRaw,
  renderHomeofficeSegments as _renderHomeofficeSegmentsRaw,
  addHomeofficeSegment as _addHomeofficeSegmentRaw,
  removeHomeofficeSegment as _removeHomeofficeSegmentRaw,
  updateHomeofficeLiveTotal as _updateHomeofficeLiveTotalRaw,
  saveHomeoffice as _saveHomeofficeRaw,
  deleteHomeoffice as _deleteHomeofficeRaw,
} from './modules/ui/homeoffice-modal.js';
import {
  buildScheduleGrid as _buildScheduleGridRaw,
  readScheduleFromGrid as _readScheduleFromGridRaw,
  updateHoursModeVisibility as _updateHoursModeVisibilityRaw,
  openEmployerModal as _openEmployerModalRaw,
  saveEmployer as _saveEmployerRaw,
  deleteEmployer as _deleteEmployerRaw,
  handleEmploymentScopeChange as _handleEmploymentScopeChangeRaw,
  handlePartTimePercentInput as _handlePartTimePercentInputRaw,
  handleFullTimeReferenceInput as _handleFullTimeReferenceInputRaw,
  handleWeeklyHoursInputForModel as _handleWeeklyHoursInputForModelRaw,
  handleWorkTimeModelChange as _handleWorkTimeModelChangeRaw,
  formatEmploymentModelSummary,
} from './modules/ui/employer-modal.js';
import {
  ensureHolidayOverrides as _ensureHolidayOverridesRaw,
  getBaseHolidays as _getBaseHolidaysRaw,
  renderHolidayList as _renderHolidayListRaw,
  handleHolidayAction as _handleHolidayActionRaw,
  openHolidayModal as _openHolidayModalRaw,
  saveHoliday as _saveHolidayRaw,
} from './modules/ui/holiday-overrides.js';
import {
  templateMatchesMode as _templateMatchesModeRaw,
  populateTemplatePicker as _populateTemplatePickerRaw,
  renderTemplates as _renderTemplatesRaw,
  openTemplateModal as _openTemplateModalRaw,
  saveTemplate as _saveTemplateRaw,
  deleteTemplate as _deleteTemplateRaw,
} from './modules/ui/templates.js';
import { exportBridge } from './modules/regression-bridge.js';
import { validateEmailField } from './modules/ui/email-validation.js';
import { APP_VERSION, LAST_SEEN_VERSION_KEY, CHANGELOG, LABELS } from './modules/constants.js';
import { wireEvents } from './modules/bootstrap.js';

/* Storage-Abstraktion, DEFAULT_STATE, STORAGE_KEY: siehe modules/state.js. */

function getAppMode() {
  return (_getState() && _getState().settings && _getState().settings.appMode === 'freelance') ? 'freelance' : 'employee';
}
function L(key) {
  const m = getAppMode();
  return (LABELS[m] && LABELS[m][key]) || (LABELS.employee[key] || key);
}
function isFreelance() { return getAppMode() === 'freelance'; }
/**
 * formatMoney-Adapter: zieht den Currency-Default aus state.settings, wenn
 * kein currency-Parameter angegeben ist. Die pure Format-Logik liegt in
 * modules/util-format.js.
 * @param {number} amount
 * @param {string} [currency]
 * @returns {string}
 */
function formatMoney(amount, currency) {
  const cur = currency || (_getState() && _getState().settings && _getState().settings.currency) || 'EUR';
  return _formatMoneyRaw(amount, cur);
}

/* ========================================================================
 * SUMMARY SELECTOR — Single Source of Truth
 * ------------------------------------------------------------------------
 * Alle Zusammenfassungs-Konsumenten (Screen/HTML, PDF, Word, E-Mail) rufen
 * NUR noch getSummaryFields() auf und rendern die zurückgegebenen Felder
 * mit dem passenden format-spezifischen Renderer. Änderungen an Mode-Regeln,
 * Feld-Sichtbarkeit oder Formatierung passieren AUSSCHLIESSLICH hier.
 *
 * Regel-Logik (in getSummaryFields intern):
 *   - Freelance-Mode: nur worked (immer) + net (falls hourlyRate>0) + holidays (falls includeHolidays)
 *   - Employee-Mode:  worked + target + balance + optional net + absences (falls includeAbsences) + holidays
 * ======================================================================== */

/**
 * Single Source of Truth für alle Zusammenfassungs-Konsumenten
 * (Screen/HTML, PDF, Word, E-Mail).
 *
 * Regel-Logik:
 *   - Freelance: nur worked (immer) + net (falls hourlyRate>0) + holidays (falls includeHolidays)
 *   - Employee:  worked + target + balance + optional net + absences (falls includeAbsences) + holidays
 *
 * @param {AZSummaryInput} input
 * @returns {AZSummaryField[]} Felder in Anzeigereihenfolge
 */
function getSummaryFields(input) {
  return _getSummaryFieldsRaw(input, appCtx());
}

/**
 * Aggregierte Variante für Übersicht (mehrere Kunden/Arbeitgeber).
 * Nimmt totals-Objekt + Row-Array und liefert Felder für Übersicht-Summary-Grid.
 */
function getOverviewSummaryFields(ov) {
  return _getOverviewSummaryFieldsRaw(ov, appCtx());
}

/* ---------- Summary-Renderer (Wrapper — siehe modules/render/summary.js) ---------- */
function renderSummaryHTML(fields) {
  return _renderSummaryHTMLRaw(fields);
}
function renderSummaryPdfLines(fields) {
  return _renderSummaryPdfLinesRaw(fields, appCtx());
}
function renderSummaryWordParagraphs(fields, docxCtx) {
  return _renderSummaryWordParagraphsRaw(fields, docxCtx, appCtx());
}
function renderSummaryPlaintext(fields) {
  return _renderSummaryPlaintextRaw(fields);
}

/**
 * v3.5-Migration-Adapter: reicht normalizeSegments und uid an das reine
 * Modul-Migrations-Layer weiter. Bleibt hier für Regression-Selectors, die
 * migrateHomeofficeEntries als globales Symbol prüfen.
 * @param {Array<any>} entries
 * @returns {Array<any>}
 */
function migrateHomeofficeEntries(entries) {
  return _migrateHomeofficeEntriesRaw(entries, { uid, normalizeSegments });
}

/**
 * Lädt State über modules/state.js und synchronisiert das window-Symbol.
 * @returns {AZState}
 */
function loadState() {
  const s = _loadStateRaw({ uid, normalizeSegments, normalizeHolidayOverrides });
  // Globaler window.state wird in der App-Init nach dem ersten loadState() gesetzt.
  return s;
}

/**
 * Persistiert den internen State. Fehler werden zusätzlich per Toast gemeldet.
 * @returns {boolean}
 */
function saveState() {
  try {
    _saveState();
    return true;
  } catch (e) {
    toast('Nicht dauerhaft gespeichert. Bitte jetzt ein Backup sichern.');
    return false;
  }
}

// Seit v3.14.3 gibt es in app.js keine eigene Variable `state` mehr: Der Zustand
// liegt nur in modules/state.js und wird über _getState() gelesen. window.state
// liefert für Regression-Skripte immer den aktuellen Zustand (siehe regression-bridge.js).
// v3.15.0: Jeder erfolgreiche Schreibvorgang geht zusätzlich in die Spiegelkopie (IndexedDB).
onStatePersisted(mirrorPersisted);
loadState();
// Stand direkt nach dem Laden, für den Vergleich mit der Spiegelkopie beim Start.
const loadedRawForMirror = storage.get(STORAGE_KEY);

// Seit v3.9.55: gemeinsames, nicht-persistiertes Flag "Ehemalige Arbeitgeber anzeigen".
// Steuert alle aktiven/Live-Dropdowns (active-employer, filter-employer, week-employer,
// report-employer) sowie die Entries-/Uebersicht-/Gleitzeitkonto-Listen. Erstell-Dropdowns
// (entry-employer, range-employer, ho-employer) ignorieren dieses Flag bewusst (siehe RELEASE.md).
let showFormerEmployers = false;
// Seit v3.9.49: unmittelbar nach dem Laden festhalten, ob der Speicher defekt war —
// wireEvents() zeigt in diesem Fall einen sichtbaren Warn-Banner (siehe modules/bootstrap.js).
const stateWasCorrupted = wasLastLoadCorrupted();
const corruptedBackupKey = getCorruptedBackupKey();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- Utilities ----------
   Reine Zeit-/Format-Utilities leben in modules/util-time.js und modules/util-format.js.
   Hier bleiben nur DOM-abhängige und state-abhängige Helfer. */

/** Ersatzauswahl Jahr und KW (iPhone, iPad), siehe modules/tabs/week.js (seit v3.15.2). */
function installWeekInputFallback() { return _installWeekInputFallbackTab(appCtx()); }

/* formatDateLong, formatMonthYear, minutesToHM, hoursDecimal, timeToMinutes,
   isoDateAdd, dayOfWeekISO: siehe modules/util-time.js */

/* DAY_KEYS/DAY_LABELS/DAY_LABELS_LONG: siehe modules/compute.js (Import oben) */

/* ---------- Arbeitszeit-Berechnung (siehe modules/compute.js) ----------
 * Alle Funktionen sind pure Exports in compute.js.
 * Die folgenden Wrapper behalten die urspruenglichen Signaturen.
 */

function computeWorkMinutes(entry) { return _computeWorkMinutesRaw(entry); }
function computeHomeofficeMinutes(entry) { return _computeHomeofficeMinutesRaw(entry); }
function isWorkedEntry(entry) { return _isWorkedEntryRaw(entry); }
function legalBreakMinutes(min) { return _legalBreakMinutesRaw(min); }
function computeSuggestedBreak(startHHMM, endHHMM, breakMode) { return _computeSuggestedBreakRaw(startHHMM, endHHMM, breakMode); }

/* ---------- Holiday Overrides + Feiertage (siehe modules/holidays.js) ----------
 * Die Feiertagslogik lebt komplett in modules/holidays.js.
 * Die folgenden Wrapper reichen state.settings.holidayOverrides automatisch rein,
 * damit alle bestehenden Aufrufer die 2-arg-Signatur (year, stateCode) beibehalten koennen.
 */

function _currentHolidayOverrides() {
  return (_getState() && _getState().settings && _getState().settings.holidayOverrides) || undefined;
}

function normalizeHolidayOverrides(ov) {
  return _normalizeHolidayOverridesRaw(ov);
}

function applyHolidayOverrides(list, stateCode) {
  return _applyHolidayOverridesRaw(list, stateCode, _currentHolidayOverrides());
}

/**
 * Liefert alle Feiertage für Jahr + Bundesland (16 BL unterstützt).
 * @param {number} year z.B. 2026
 * @param {string} stateCode ISO-Code, z.B. 'HE'
 * @returns {AZHoliday[]}
 */
function getHolidays(year, stateCode) {
  return _getHolidaysRaw(year, stateCode, _currentHolidayOverrides());
}

function getHolidaysInRange(startISO, endISO, stateCode) {
  return _getHolidaysInRangeRaw(startISO, endISO, stateCode, _currentHolidayOverrides());
}

/**
 * Prüft, ob ein Datum ein Feiertag im Bundesland ist.
 * @param {string} iso 'YYYY-MM-DD'
 * @param {string} stateCode z.B. 'HE'
 * @returns {AZHoliday|null}
 */
function isHoliday(iso, stateCode) {
  return _isHolidayRaw(iso, stateCode, _currentHolidayOverrides());
}

/* ---------- Target Hours Calculation (siehe modules/compute.js) ----------
 * Wrapper reichen stateCode + holidayOverrides automatisch aus state rein.
 */

/**
 * @param {string} [employerId] Wenn gesetzt, werden 'off_day'-Daten dieses Employers aus
 *   state.entries als ctx.offDayDates mitgegeben (seit v3.9.47, "Freier Tag") — dadurch greift
 *   der Soll-Ausschluss automatisch fuer alle Aufrufer, ohne dass jede Aufrufstelle einzeln
 *   angepasst werden muss (siehe modules/compute.js mergeOffDayDates()).
 */
function _computeCtxHoliday(employerId) {
  const ctx = {
    stateCode: (_getState() && _getState().settings && _getState().settings.state) || 'HE',
    holidayOverrides: _currentHolidayOverrides(),
  };
  if (employerId) {
    ctx.offDayDates = new Set(
      _getState().entries.filter(e => e.employerId === employerId && e.type === 'off_day').map(e => e.date)
    );
  }
  return ctx;
}

function computeMonthTargetMinutes(employer, ym) {
  return _computeMonthTargetMinutesRaw(employer, ym, _computeCtxHoliday(employer && employer.id));
}

function computeWeekTargetMinutes(employer, weekDates) {
  return _computeWeekTargetMinutesRaw(employer, weekDates, _computeCtxHoliday(employer && employer.id));
}

function computeDayTargetMinutes(employer, dateISO) {
  return _computeDayTargetMinutesRaw(employer, dateISO, _computeCtxHoliday(employer && employer.id));
}

function defaultSchedule(weeklyHours = 40) {
  return _defaultScheduleRaw(weeklyHours);
}

/* ---------- Employer helpers ---------- */

/** @returns {AZEmployer|undefined} */
function getEmployer(id) {
  return _getEmployerRaw(id, { state: _getState() });
}

function ensureActiveEmployer() {
  if (_getState().activeEmployerId && getEmployer(_getState().activeEmployerId)) return;
  _getState().activeEmployerId = _getState().employers[0]?.id || null;
}

/* ---------- Views ---------- */

function switchView(name) {
  document.querySelectorAll('.tab').forEach(t => {
    const active = t.dataset.view === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${name}`);
  });
  window.scrollTo(0, 0);

  if (name === 'entries') renderEntries();
  if (name === 'week') renderWeek();
  if (name === 'report') renderReport();
  if (name === 'overview') renderOverview();
  if (name === 'vacation-planning') renderVacationPlanning();
  if (name === 'gleitzeitkonto') renderGleitzeitkonto();
  if (name === 'employers') renderEmployers();
  if (name === 'archive') renderArchive();
  if (name === 'settings') renderSettings();
  if (name === 'tracker') renderTracker();
}

/* ---------- Tracker ---------- */

let liveTimerInterval = null;

function renderTracker() {
  ensureActiveEmployer();
  const sel = document.getElementById('active-employer');
  const activeEmployerLabel = document.getElementById('active-employer-label');
  if (activeEmployerLabel) activeEmployerLabel.textContent = L('activeEmployer');
  const formerCb = document.getElementById('show-former-employers-tracker');
  if (formerCb) formerCb.checked = showFormerEmployers;
  const formerEmployersLabel = document.getElementById('former-employers-tracker-label');
  if (formerEmployersLabel) formerEmployersLabel.textContent = L('formerEmployers');
  const today = todayISO();
  const visibleEmployers = filterVisibleEmployers(_getState().employers, today, {
    showAll: showFormerEmployers,
    includeIds: [_getState().activeEmployerId],
  });
  sel.innerHTML = _getState().employers.length
    ? visibleEmployers.map(e => `<option value="${escapeHtml(e.id)}" ${e.id === _getState().activeEmployerId ? 'selected' : ''}>${escapeHtml(e.name)}${isFormerEmployer(e, today) ? ' (ehemalig)' : ''}</option>`).join('')
    : `<option value="">— Bitte ${L('employer')} anlegen —</option>`;

  const hint = document.getElementById('onboarding-hint');
  if (hint) {
    hint.style.display = _getState().employers.length ? 'none' : '';
    if (!_getState().employers.length) {
      hint.innerHTML = `<strong>Willkommen 👋</strong><br>Bitte legen Sie zuerst unter <em>${L('employers')}</em> mindestens ${isFreelance() ? 'einen Kunden' : 'einen Arbeitgeber'} an. Danach können Sie hier Ihre Arbeitszeiten erfassen.`;
    }
  }

  const running = _getState().runningTimer;
  const hasEmployers = _getState().employers.length > 0;
  const activeEmp = getEmployer(_getState().activeEmployerId);
  const activeIsFormer = isFormerEmployer(activeEmp, today);
  document.getElementById('btn-start').disabled = !!running || !hasEmployers || activeIsFormer;
  document.getElementById('btn-end').disabled = !running;

  const liveEl = document.getElementById('live-status');
  if (running) {
    const emp = getEmployer(running.employerId);
    document.getElementById('live-time').textContent =
      `${emp ? emp.name + ' • ' : ''}${new Date(running.startISO).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}`;
    liveEl.classList.remove('hidden');
    startLiveTimer();
  } else {
    liveEl.classList.add('hidden');
    stopLiveTimer();
  }

  renderTodaySummary();
  updateSollWarningBanner();

  // Mode-Toggle beim Wechsel in den Tracker-Tab immer auf Präsenz zurücksetzen (nicht persistiert),
  // außer der laufende Timer ist bereits im Home-Office-Modus.
  if (running && running.type === 'homeoffice') {
    setMode('homeoffice');
  } else {
    setMode('praesenz');
  }
}

/* ---------- Außendienst-Nachweis (seit v3.13.0) ---------- */
/* ---------- Zentraler Kontext (seit v3.14.1) ---------- */

let _appCtxInstance = null;
/**
 * Liefert den zentralen Kontext (modules/app-context.js). Wird beim ersten
 * Aufruf gebaut, damit alle Funktionen von app.js bereits definiert sind.
 * Der Zustand wird ausschließlich über getState() aus modules/state.js gelesen.
 * @returns {any}
 */
function appCtx() {
  if (_appCtxInstance) return _appCtxInstance;
  _appCtxInstance = createAppContext({
    getState: _getState, saveState,
    computeWorkMinutes, computeHomeofficeMinutes, computeSuggestedBreak,
    holidayOf: (iso) => {
      const st = _getState();
      return isHoliday(iso, (st && st.settings && st.settings.state) || 'HE');
    },
    normalizeSegments, normalizeHolidayOverrides, hhmmToMinutes, defaultSchedule,
    getSummaryFields, getOverviewSummaryFields, getCurrentReport, getCurrentOverview,
    formatDate, formatMonthYear, formatMoney, minutesToHM, hoursDecimal, escapeHtml,
    renderSummaryPlaintext, fileNameForReport, fileNameForOverview,
    buildHomeofficeSegmentsHTML: _buildHomeofficeSegmentsHTMLRaw, L,
    toast, closeModals,
    openEntryModal: (entry, opts) => openEntryModal(entry, opts),
    populateTemplatePicker,
    renderTracker, renderEntries, renderWeek, renderReport, renderOverview, renderEmployers, refreshAll,
    renderArchive, renderGleitzeitkonto, renderVacationPlanning, renderSettings, renderAuditLog,
    generatePdfBlob, generateWordBlob, generateOverviewPdfBlob, downloadBlob,
    generateKmPdfBlob, generateGleitzeitkontoPdfBlob, generateVacationCertificatePdfBlob,
    // seit v3.15.1 für die Reiter-Module unter modules/tabs/
    computeMonthTargetMinutes, countWorkdaysInMonth,
    openHomeofficeModal: (entry, opts) => openHomeofficeModal(entry, opts),
    getShowFormerEmployers: () => showFormerEmployers,
    setShowFormerEmployers: (v) => setShowFormerEmployers(v),
    // seit v3.15.2 (Woche, Gleitzeitkonto)
    computeWeekTargetMinutes, computeDayTargetMinutes, isHoliday, getHolidaysInRange,
    computeGleitzeitkontoRowsForEmployer: (emp, year) => _computeGleitzeitkontoRowsRaw(emp, year, { state: _getState() }),
    computeGleitzeitkontoAsOfTodayForEmployer, computeGleitzeitkontoWindowForEmployer, computeBalanceWarningInfo,
    ensureActiveEmployer,
    populateYearSelect: (selectEl, year) => _populateYearSelectUi(selectEl, year, _getState()),
    // seit v3.15.3 (Urlaubsplanung, Übersicht, Sollstunden-Banner)
    computeMonthReport, computeMonthOverview, computeElapsedMonthProgressForEmployer,
    getEmployer, uid, todayISO, dayOfWeekISO, isFreelance, getAppMode, DAY_KEYS, DAY_LABELS_LONG,
    // Feld-Definitionen des Erfassen-Dialogs (Phase 4.8, seit v3.14.3 im Kontext)
    computeFormFields: (entry, opts) => _computeFormFieldsRaw(entry, opts, {
      state: _getState(), todayISO, getEmployer, DAY_KEYS, DAY_LABELS_LONG, dayOfWeekISO,
    }),
    // „Speichern und nächster Tag“ aus dem Außendienst-Dialog (seit v3.14.3 im Kontext)
    saveEntryAndNext: (e) => _saveEntryRaw(e, withExtras(appCtx(), { __saveAndNext: true })),
  });
  return _appCtxInstance;
}

function startLiveTimer() {
  stopLiveTimer();
  const update = () => {
    if (!_getState().runningTimer) return;
    const diff = Date.now() - new Date(_getState().runningTimer.startISO).getTime();
    const s = Math.floor(diff / 1000);
    document.getElementById('live-duration').textContent =
      `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };
  update();
  liveTimerInterval = setInterval(update, 1000);
}

function stopLiveTimer() {
  if (liveTimerInterval) { clearInterval(liveTimerInterval); liveTimerInterval = null; }
}

function renderTodaySummary() {
  const empId = _getState().activeEmployerId;
  const container = document.getElementById('today-summary');
  if (!empId) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  const emp = getEmployer(empId);
  const ym = currentYearMonth();
  const report = computeMonthReport(empId, ym);
  const { workedMin, targetMin, balance } = report;
  const vacationDays = report.vacationEntries.length;
  const sickDays = report.sickEntries.length;
  const overtimeReductionDays = report.overtimeReductionEntries.length;

  const summaryFields = getSummaryFields({
    workedMin,
    targetMin,
    balance,
    vacationDays,
    sickDays,
    educationLeaveDays: (report.educationLeaveEntries || []).length,
    overtimeReductionDays,
    hourlyRate: Number(emp.hourlyRate) || 0,
    currency: emp.currency || 'EUR',
  });

  // Außendienst-Nachweis (seit v3.13.0): zusätzliche Kacheln, nur wenn aktiv und Daten vorhanden.
  const fsm = report.fieldService;
  if (fsm && (fsm.tripMin > 0 || fsm.km > 0)) {
    if (fsm.tripMin > 0) summaryFields.push({ kind: 'time', key: 'fsTrip', label: 'davon Fahrt', valueHM: minutesToHM(fsm.tripMin) });
    if (fsm.km > 0) summaryFields.push({ kind: 'text', key: 'fsKm', label: 'Kilometer', value: `${formatKm(fsm.km)} km` });
    if (fsm.amount > 0) summaryFields.push({ kind: 'text', key: 'fsAmount', label: 'Kilometer-Betrag', value: formatEuro(fsm.amount) });
  }

  container.innerHTML = _buildTodaySummaryHTMLRaw({ ym, summaryFields }, {
    formatMonthYear,
    renderSummaryHTML,
  });
}

function countWorkdaysInMonth(ym, employer) {
  return _countWorkdaysInMonthRaw(ym, employer, _computeCtxHoliday(employer && employer.id));
}

/* ---------- Start / End ---------- */

function startWork() {
  if (!_getState().activeEmployerId) { toast('Bitte zuerst einen Arbeitgeber anlegen'); return; }
  if (_getState().runningTimer) return;
  if (findEntryConflict(_getState().entries, { employerId: _getState().activeEmployerId, date: todayISO(), type: 'work' })) {
    toast(ENTRY_CONFLICT_MESSAGE); return;
  }
  _getState().runningTimer = {
    employerId: _getState().activeEmployerId,
    startISO: new Date().toISOString(),
    type: currentMode === 'homeoffice' ? 'homeoffice' : 'work',
    // Außendienst-Nachweis (seit v3.13.0): Tätigkeit und Einsatzort des ersten Blocks.
    ...getTrackerStartFieldService(_getState(), _getState().activeEmployerId, currentMode),
  };
  resetTrackerPick();
  saveState();
  renderTracker();
  toast(currentMode === 'homeoffice' ? 'Home-Office-Block gestartet' : 'Arbeitsbeginn erfasst');
}

function endWork() {
  const r = _getState().runningTimer;
  if (!r) return;
  const startDate = new Date(r.startISO);
  const endDate = new Date();
  const parts = splitAcrossMidnight(startDate, endDate);
  if (!parts.length) { toast('Bitte mindestens eine Minute erfassen.'); return; }
  if (parts.some(p => findEntryConflict(_getState().entries, { employerId: r.employerId, date: p.date, type: r.type || 'work' }))) {
    toast(ENTRY_CONFLICT_MESSAGE + ' Der Timer bleibt erhalten.'); return;
  }

  if (r.type === 'homeoffice') {
    // Für jeden Kalendertag: Segment am bestehenden HO-Entry anhängen oder neuen anlegen
    for (const p of parts) {
      const existing = _getState().entries.find(e =>
        e.type === 'homeoffice' && e.employerId === r.employerId && e.date === p.date
      );
      if (existing) {
        const prev = Array.isArray(existing.segments) ? existing.segments : [];
        existing.segments = normalizeSegments([...prev, { start: p.start, end: p.end }]);
      } else {
        _getState().entries.push({
          id: uid(),
          employerId: r.employerId,
          date: p.date,
          type: 'homeoffice',
          segments: [{ start: p.start, end: p.end }],
          note: '',
          createdAt: new Date().toISOString(),
        });
      }
    }
    _getState().runningTimer = null;
    saveState();
    renderTracker();
    renderEntries();
    renderWeek();
    renderReport();
    toast(parts.length > 1
      ? `Home-Office-Block auf ${parts.length} Tage verteilt gespeichert`
      : 'Home-Office-Block gespeichert');
    return;
  }

  // Präsenz: bei Über-Mitternacht das Ende einfach als HH:MM stehen lassen —
  // computeWorkMinutes rechnet bereits +24h wenn end < start.
  // (Bewusste Entscheidung: Präsenz-Übernachtungen sind arbeitsrechtlich sinnvoller
  // als ein Eintrag am Start-Tag mit Endzeit über Mitternacht abgebildet.)
  const dateISO = parts[0].date;
  const startHHMM = parts[0].start;
  const endHHMM = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;

  const emp = getEmployer(r.employerId);
  const suggestedBreak = computeSuggestedBreak(startHHMM, endHHMM, emp?.breakMode);

  /** @type {AZEntry} */
  const entry = {
    id: uid(),
    employerId: r.employerId,
    date: dateISO,
    type: 'work',
    start: startHHMM,
    end: endHHMM,
    breakMinutes: suggestedBreak || 0,
    overtimeReason: '',
    note: '',
    ...fieldServiceFromTimer(_getState(), r),
    createdAt: new Date().toISOString(),
  };
  _getState().entries.push(entry);
  _getState().runningTimer = null;
  saveState();
  renderTracker();

  openEntryModal(entry, { justEnded: true });
  // Außendienst (seit v3.13.0): bei „erst bei Arbeitsende“ fehlende Kilometer der Fahrten von heute abfragen.
  const fsSettings = getFieldServiceSettings(_getState().settings);
  if (fsSettings.kmPrompt === 'end') {
    const missing = tripsMissingKm(_getState(), r.employerId, dateISO, entry.id);
    if (missing.length) openKmModal(missing, appCtx());
  }
}

/* ---------- Entry Modal ---------- */

function openEntryModal(entry, opts = {}) {
  return _openEntryModalRaw(entry, opts, appCtx());
}

function updateScheduleFillVisibility() {
  return _updateScheduleFillVisibilityRaw(appCtx());
}

function applyScheduleToEntry() {
  return _applyScheduleToEntryRaw(appCtx());
}

function templateMatchesMode(tpl) { return _templateMatchesModeRaw(tpl, appCtx()); }
function populateTemplatePicker(selectId) { return _populateTemplatePickerRaw(selectId, appCtx()); }

function closeModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

// Zentraler Refresh nach Datenmutationen. Rendert nur Views die aktuell im DOM
// existieren und aktiv sind — nicht-aktive Tabs werden bei switchView neu
// gerechnet. Dadurch bleibt Monat/Übersicht/Woche/Bericht auf aktuellem Stand,
// wenn der User im gerade sichtbaren Tab editiert.
function refreshAll() {
  try { if (typeof renderTracker === 'function')  renderTracker(); }  catch(e){}
  try { if (typeof renderEntries === 'function')  renderEntries(); }  catch(e){}
  try { if (typeof renderWeek === 'function')     renderWeek(); }     catch(e){}
  try { if (typeof renderReport === 'function')   renderReport(); }   catch(e){}
  try { if (typeof renderOverview === 'function') renderOverview(); } catch(e){}
}
function updateEntryTypeFields() {
  return _updateEntryTypeFieldsRaw();
}

function updateBreakHint() {
  return _updateBreakHintRaw(appCtx());
}

function updateEntryArbzgHint() {
  return _updateEntryArbzgHintRaw(appCtx());
}

function saveEntry(e) {
  return _saveEntryRaw(e, appCtx());
}

function deleteEntry() {
  return _deleteEntryRaw(appCtx());
}

/* ---------- Range-Entry Modal (Zeitraum erfassen, Option B) ---------- */
function openRangeEntryModal() {
  return _openRangeEntryModalRaw(appCtx());
}

function saveRangeEntry(e) {
  return _saveRangeEntryRaw(e, appCtx());
}

function updateRangeVacationStats() {
  return _updateRangeVacationStatsRaw(appCtx());
}

/* ---------- Home-Office Mode & Modal ---------- */

let currentMode = 'praesenz';

function setMode(mode) {
  currentMode = mode === 'homeoffice' ? 'homeoffice' : 'praesenz';
  const btnP = document.getElementById('mode-praesenz');
  const btnH = document.getElementById('mode-homeoffice');
  if (!btnP || !btnH) return;
  const isHO = currentMode === 'homeoffice';
  btnP.classList.toggle('active', !isHO);
  btnH.classList.toggle('active', isHO);
  btnP.setAttribute('aria-checked', String(!isHO));
  btnH.setAttribute('aria-checked', String(isHO));
  try { renderTrackerFieldService(appCtx(), currentMode); } catch (err) { console.error(err); }
}

function openHomeofficeModal(entry, opts) {
  return _openHomeofficeModalRaw(entry, opts, appCtx());
}

function updateHomeofficeContext() {
  return _updateHomeofficeContextRaw(appCtx());
}

function readHomeofficeSegmentsFromDom() {
  return _readHomeofficeSegmentsFromDomRaw();
}

function persistHomeofficeSegmentsToState() {
  return _persistHomeofficeSegmentsToStateRaw();
}

function renderHomeofficeSegments() {
  return _renderHomeofficeSegmentsRaw(appCtx());
}

function addHomeofficeSegment() {
  return _addHomeofficeSegmentRaw(appCtx());
}

function removeHomeofficeSegment(idx) {
  return _removeHomeofficeSegmentRaw(idx, appCtx());
}

function updateHomeofficeLiveTotal() {
  return _updateHomeofficeLiveTotalRaw(appCtx());
}
/**
 * Normalisiert Segmente: sortiert nach Startzeit, mergt überlappende oder
 * unmittelbar angrenzende Blöcke. Ergebnis ist eine minimale, sortierte Liste.
 */
function normalizeSegments(segments) {
  const clean = (segments || [])
    .filter(s => s && s.start && s.end)
    .map(s => ({ start: s.start, end: s.end }))
    .filter(s => hhmmToMinutes(s.end) > hhmmToMinutes(s.start))
    .sort((a, b) => hhmmToMinutes(a.start) - hhmmToMinutes(b.start));
  const out = [];
  for (const s of clean) {
    const last = out[out.length - 1];
    if (last && hhmmToMinutes(s.start) <= hhmmToMinutes(last.end)) {
      // Überlappt oder grenzt an — mergen
      if (hhmmToMinutes(s.end) > hhmmToMinutes(last.end)) last.end = s.end;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

function saveHomeoffice(e) {
  return _saveHomeofficeRaw(e, appCtx());
}

function deleteHomeoffice() {
  return _deleteHomeofficeRaw(appCtx());
}
function hhmmToMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(n => parseInt(n, 10) || 0);
  return h * 60 + m;
}

/* ---------- Entries View ---------- */

/** Reiter Einträge, siehe modules/tabs/entries.js (seit v3.15.1). */
function renderEntries() { return _renderEntriesTab(appCtx()); }

/* ---------- Week View ---------- */

/** Reiter Woche, siehe modules/tabs/week.js (seit v3.15.2). */
function renderWeek() { return _renderWeekTab(appCtx()); }

/* ---------- Monthly Report ---------- */

/**
 * Zentraler Monatsbericht für einen Arbeitgeber (siehe modules/compute.js).
 * Wrapper reicht state als ctx durch.
 * @param {string} employerId
 * @param {string} ym 'YYYY-MM'
 * @returns {AZMonthReport|null}
 */
function computeMonthReport(employerId, ym) {
  return _computeMonthReportRaw(employerId, ym, { state: _getState() });
}

// Sollstunden-Warnung (seit v3.9.80): liefert den Monats-Fortschritt (vergangene Arbeitstage,
// anteiliges Soll) fuer den Mindest-Arbeitstage-Schutz in computeActiveSollWarnings. Baut denselben
// inneren ctx (stateCode/holidayOverrides/offDayDates) wie computeMonthReport weiter oben, damit
// das anteilige Soll exakt zum vollen Monats-Soll aus computeMonthReport passt.
function computeElapsedMonthProgressForEmployer(emp, ym, today) {
  const stateCode = _getState().settings?.state || 'HE';
  const holidayOverrides = _getState().settings?.holidayOverrides;
  const offDayDates = new Set(
    _getState().entries
      .filter((e) => e.employerId === emp.id && e.date && e.date.startsWith(ym) && e.type === 'off_day')
      .map((e) => e.date)
  );
  return _computeElapsedMonthProgressRaw(emp, ym, today, { stateCode, holidayOverrides, offDayDates });
}

// Gleitzeitkonto-Warnung (seit v3.9.81) - Kachel-ANZEIGE: voller Jahres-Saldo, aber nur bis heute
// (asOfToday) statt bis Dezember, damit noch nicht begonnene Zukunftsmonate den Wert nicht
// kuenstlich ins Minus ziehen. Siehe modules/compute.js#computeGleitzeitkontoAsOfToday.
function computeGleitzeitkontoAsOfTodayForEmployer(emp, year, today) {
  return _computeGleitzeitkontoAsOfTodayRaw(emp, year, today, { state: _getState() });
}

// Gleitzeitkonto-Warnung (seit v3.9.81) - rollierendes 3-Monats-Fenster als Grundlage fuer die
// WARNUNG (Banner + Kachel-Rahmen), entkoppelt von der Kachel-ANZEIGE oben. Siehe
// modules/compute.js#computeGleitzeitkontoRollingWindow.
function computeGleitzeitkontoWindowForEmployer(emp, today) {
  return _computeGleitzeitkontoRollingWindowRaw(emp, today, { state: _getState() });
}

// Sollstunden-Warnung (seit v3.9.78): liefert die Kachel-Warnung fuer EINEN Saldo/Soll-Wert,
// unter Beruecksichtigung von Freiberufler-Modus und dem jeweiligen Enabled-Toggle. Siehe
// modules/soll-warning.js fuer die reine Berechnung.
function computeBalanceWarningInfo(balance, targetMin, basis) {
  if (isFreelance()) return null;
  const settings = /** @type {import('./types.js').AZSettings} */ (_getState().settings || {});
  const enabled = basis === 'month' ? settings.sollWarningMonthEnabled : settings.sollWarningGleitzeitEnabled;
  if (!enabled) return null;
  const thresholdPct = basis === 'month' ? settings.sollWarningMonthThresholdPct : settings.sollWarningGleitzeitThresholdPct;
  return _buildBalanceWarningInfoRaw(balance, targetMin, thresholdPct, basis);
}

function renderReport() {
  const empSel = document.getElementById('report-employer');
  const monthInput = document.getElementById('report-month');

  const currentEmp = empSel.value;
  const today = todayISO();
  const visibleEmployers = filterVisibleEmployers(_getState().employers, today, {
    showAll: showFormerEmployers,
    includeIds: [currentEmp, _getState().activeEmployerId],
  });
  empSel.innerHTML = _getState().employers.length
    ? visibleEmployers.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)}${isFormerEmployer(e, today) ? ' (ehemalig)' : ''}</option>`).join('')
    : '<option value="">— Kein Arbeitgeber —</option>';
  empSel.value = currentEmp || _getState().activeEmployerId || visibleEmployers[0]?.id || '';

  if (!monthInput.value) monthInput.value = currentYearMonth();

  const empId = empSel.value;
  const ym = monthInput.value;
  const container = document.getElementById('report-content');

  if (!empId || !ym) {
    container.innerHTML = '<div class="empty-state">Bitte Arbeitgeber und Monat wählen.</div>';
    return;
  }

  const r = computeMonthReport(empId, ym);
  if (!r) { container.innerHTML = '<div class="empty-state">Keine Daten.</div>'; return; }

  container.innerHTML = _buildReportHTMLRaw(r, {
    escapeHtml,
    formatDateLong,
    formatDate,
    formatMonthYear,
    minutesToHM,
    computeWorkMinutes,
    computeHomeofficeMinutes,
    getSummaryFields,
    renderSummaryHTML,
    balanceWarning: computeBalanceWarningInfo(r.balance, r.targetMin, 'month'),
  });
  const kmBtn = document.getElementById('btn-export-km-pdf');
  if (kmBtn) kmBtn.classList.toggle('hidden', !(r.fieldService && r.fieldService.km > 0));
}

/* ---------- Kilometer-Aufstellung (seit v3.13.0) ---------- */

async function generateKmPdfBlob(report) {
  await ensurePdfLibs();
  const { jsPDF } = window.jspdf;
  return _generateKmPdfBlobRaw(report, { jsPDF, state: _getState(), formatDateLong, formatMonthYear });
}

async function exportKmPdf() {
  const r = getCurrentReport();
  if (!r) return;
  if (!(r.fieldService && r.fieldService.km > 0)) { toast('Keine Fahrten mit Kilometern in diesem Monat'); return; }
  try {
    const blob = await generateKmPdfBlob(r);
    downloadBlob(blob, fileNameForReport(r, 'pdf').replace(/\.pdf$/, '-kilometer.pdf'));
    toast('Kilometer-PDF heruntergeladen');
  } catch (err) {
    console.error(err);
    toast('Kilometer-PDF fehlgeschlagen: ' + err.message);
  }
}

/* ---------- Word Export (.docx) ---------- */

async function generateWordBlob(report) {
  await ensureDocxLib();
  return _generateWordBlobRaw(report, {
    docx, state: _getState(),
    formatDate, formatDateLong, formatMonthYear, minutesToHM,
    computeWorkMinutes, computeHomeofficeMinutes,
    getSummaryFields, renderSummaryWordParagraphs,
    isFreelance, formatEmploymentModelSummary,
  });
}

/* ---------- PDF Export (jsPDF) ---------- */

async function generatePdfBlob(report) {
  await ensurePdfLibs();
  const { jsPDF } = window.jspdf;
  return _generatePdfBlobRaw(report, {
    jsPDF, state: _getState(),
    formatDate, formatDateLong, formatMonthYear, minutesToHM,
    computeWorkMinutes, computeHomeofficeMinutes,
    getSummaryFields, renderSummaryPdfLines, isFreelance, formatEmploymentModelSummary,
  });
}

// wrapText wurde nach modules/export/pdf.js + overview-pdf.js verschoben (Phase 3.7).

/* ---------- Overview: Monatsauswertung über alle Arbeitgeber ---------- */

/**
 * Monats-Übersicht über ALLE Arbeitgeber (siehe modules/compute.js).
 * @param {string} ym 'YYYY-MM'
 * @param {Array<any>} [employers] optionale explizite Employer-Liste (sonst aktueller
 *   "Ehemalige anzeigen"-Zustand via filterVisibleEmployers, seit v3.9.55)
 * @returns {AZMonthOverview}
 */
function computeMonthOverview(ym, employers) {
  // Ohne explizite Liste: aktuellen Stand des "Ehemalige anzeigen"-Flags anwenden, damit
  // auch der PDF-Export (getCurrentOverview → selectors.js) die Bildschirmansicht widerspiegelt.
  const emp = employers || filterVisibleEmployers(_getState().employers, todayISO(), { showAll: showFormerEmployers });
  return _computeMonthOverviewRaw(ym, { state: _getState(), employers: emp });
}

/**
 * Setzt das gemeinsame "Ehemalige Arbeitgeber anzeigen"-Flag (seit v3.9.55) und aktualisiert
 * alle davon betroffenen Ansichten, damit die vier Checkboxen (Tracker, Einträge, Übersicht,
 * Gleitzeitkonto) konsistent denselben Zustand widerspiegeln.
 * @param {boolean} value
 */
function setShowFormerEmployers(value) {
  showFormerEmployers = !!value;
  renderTracker();
  renderEntries();
  renderWeek();
  renderReport();
  renderOverview();
  renderGleitzeitkonto();
}

/** Reiter Übersicht, siehe modules/tabs/overview.js (seit v3.15.3). */
function renderOverview() { return _renderOverviewTab(appCtx()); }

function renderAuditLog() {
  const container = document.getElementById('audit-log-list');
  if (!container) return;
  container.innerHTML = _buildAuditLogHTMLRaw(_getState().auditLog, {
    escapeHtml,
    getEmployer,
    formatDateLong,
  });
}

// Backup-Erinnerung (seit v3.9.47, Kadenz überarbeitet in v3.9.68): zeigt einen
// Hinweis-Banner in den Einstellungen.
//   - Wurde noch NIE ein Backup erstellt: die allererste Erinnerung erscheint erst
//     am Folgetag (BACKUP_REMINDER_FIRST_DELAY_DAYS), nicht schon am selben Tag,
//     an dem die ersten Daten angelegt wurden. Der Referenzzeitpunkt dafür wird
//     einmalig in settings.backupReminderFirstSeenAt festgehalten (additives Feld,
//     kein Migrations-Eintrag nötig).
//   - Danach (und sobald mindestens einmal gesichert wurde) gilt ein fester
//     Rhythmus von BACKUP_REMINDER_INTERVAL_DAYS Tagen seit dem letzten Backup.
// Seit v3.14.0 steckt die Entscheidung in modules/storage-status.js (computeBackupReminder):
// zusätzlich zur 7-Tage-Regel nur, wenn es seit dem letzten Backup Änderungen gibt. Der Banner
// erscheint in den Einstellungen und im Reiter Erfassen mit identischem Inhalt.
const BACKUP_REMINDER_TARGETS = [
  { bannerId: 'backup-reminder-banner', textId: 'backup-reminder-text' },
  { bannerId: 'backup-reminder-banner-tracker', textId: 'backup-reminder-text-tracker' },
];

function updateBackupReminderBanner() {
  const settings = /** @type {import('./types.js').AZSettings} */ (_getState().settings || {});
  const now = Date.now();
  const hasData = Array.isArray(_getState().entries) && _getState().entries.length > 0;
  // Referenzzeitpunkt für die Ein-Tag-Schonfrist einmalig festhalten.
  if (hasData && !settings.lastBackupAt && !settings.backupReminderFirstSeenAt
      && !(settings.backupReminderSnoozeUntil && new Date(settings.backupReminderSnoozeUntil).getTime() > now)) {
    settings.backupReminderFirstSeenAt = new Date(now).toISOString();
    saveState();
  }
  const res = computeBackupReminder({
    hasData,
    lastBackupAt: settings.lastBackupAt,
    firstSeenAt: settings.backupReminderFirstSeenAt,
    changesSinceBackup: settings.changesSinceBackup,
    snoozeUntil: settings.backupReminderSnoozeUntil,
    now,
  });
  for (const t of BACKUP_REMINDER_TARGETS) {
    const banner = document.getElementById(t.bannerId);
    const textEl = document.getElementById(t.textId);
    if (!banner || !textEl) continue;
    banner.classList.toggle('hidden', !res.show);
    if (res.show) textEl.textContent = res.text;
  }
  try { maybeRequestPersist(appCtx()).catch((err) => console.error(err)); } catch (err) { console.error(err); }
}

/** Banner Sollstunden-Warnung (Erfassen, Übersicht), siehe modules/ui/soll-warning-banner-ui.js (seit v3.15.3). */
function updateSollWarningBanner(overridePeriod) { return _updateSollWarningBannerUi(appCtx(), overridePeriod); }

/** Reiter Urlaubsplanung, siehe modules/tabs/vacation.js (seit v3.15.3). */
function renderVacationPlanning() { return _renderVacationPlanningTab(appCtx()); }

/* ---------- Urlaubsbescheinigung (§ 6 Abs. 2 BUrlG, seit v3.9.99) ---------- */

async function generateVacationCertificatePdfBlob(emp) {
  const cert = computeVacationCertificate(emp, _getState().entries);
  if (!cert) throw new Error('Kein Beschäftigungsende hinterlegt');
  await ensurePdfLibs();
  const { jsPDF } = window.jspdf;
  return _generateVacationCertificatePdfBlobRaw(cert, emp, { employeeName: _getState().settings?.employeeName || '' }, { jsPDF, formatDate, todayISO });
}

/** Reiter Gleitzeitkonto, siehe modules/tabs/gleitzeit.js (seit v3.15.2). */
function renderGleitzeitkonto() { return _renderGleitzeitkontoTab(appCtx()); }

function getCurrentGleitzeitkonto() { return _getCurrentGleitzeitkontoTab(appCtx()); }

async function generateGleitzeitkontoPdfBlob(rows, emp, meta) {
  await ensurePdfLibs();
  const { jsPDF } = window.jspdf;
  return _generateGleitzeitkontoPdfBlobRaw(rows, emp, meta, { jsPDF, minutesToHM, formatMonthYear });
}

function exportGleitzeitkontoPdf() { return _exportGleitzeitkontoPdfTab(appCtx()); }

async function generateOverviewPdfBlob(ov) {
  await ensurePdfLibs();
  const { jsPDF } = window.jspdf;
  return _generateOverviewPdfBlobRaw(ov, {
    jsPDF, state: _getState(),
    formatMonthYear, minutesToHM, formatMoney, isFreelance, formatEmploymentModelSummary,
  });
}

function getCurrentOverview() { return _getCurrentOverviewTab(appCtx()); }

function exportOverviewPdf() { return _exportOverviewPdfTab(appCtx()); }

async function shareOverviewPdf() {
  return _shareOverviewPdfRaw(appCtx());
}

function openOverviewShareModal() {
  return _openOverviewShareModalRaw(appCtx());
}

/* ---------- Export UI ---------- */

function fileNameForReport(report, ext) {
  return `Arbeitszeit_${report.employer.name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, '_')}_${report.ym}.${ext}`;
}

async function exportWord() {
  const r = getCurrentReport();
  if (!r) return;
  try {
    const blob = await generateWordBlob(r);
    downloadBlob(blob, fileNameForReport(r, 'docx'));
    toast('Word-Datei heruntergeladen');
  } catch (err) {
    console.error(err);
    toast('Word-Export fehlgeschlagen: ' + err.message);
  }
}

async function exportPdf() {
  const r = getCurrentReport();
  if (!r) return;
  try {
    const blob = await generatePdfBlob(r);
    downloadBlob(blob, fileNameForReport(r, 'pdf'));
    toast('PDF heruntergeladen');
  } catch (err) {
    console.error(err);
    toast('PDF-Export fehlgeschlagen: ' + err.message);
  }
}

function generateCsvBlob(report) {
  return _generateCsvBlobRaw(report, {
    formatDate, minutesToHM, computeWorkMinutes, computeHomeofficeMinutes,
    employeeName: (_getState().settings.employeeName || '').trim(),
    isFreelance, formatEmploymentModelSummary,
  });
}

async function exportCsv() {
  const r = getCurrentReport();
  if (!r) return;
  try {
    const blob = generateCsvBlob(r);
    downloadBlob(blob, fileNameForReport(r, 'csv'));
    toast('CSV-Datei heruntergeladen');
  } catch (err) {
    console.error(err);
    toast('CSV-Export fehlgeschlagen: ' + err.message);
  }
}

function getCurrentReport() {
  return _getCurrentReportRaw({
    state: _getState(),
    computeMonthReport,
    toast,
    getEmployerId: () => document.getElementById('report-employer').value,
    getYm: () => document.getElementById('report-month').value,
  });
}

/* ---------- Share (Web Share API + Fallback) ---------- */

function openShareModal() {
  return _openShareModalRaw(appCtx());
}

function showMailtoStage2(mailto, count, filename) {
  return _showMailtoStage2Raw(mailto, count, filename, { closeModals });
}

async function shareReport(format, recipientEmails) {
  return _shareReportRaw(format, recipientEmails, appCtx());
}

// downloadBlob wurde nach modules/export/download.js verschoben (Phase 3.7).

/* ---------- Archive ---------- */

/** Monat archivieren, siehe modules/tabs/archive.js (seit v3.15.1). */
function archiveCurrentMonth() { return _archiveCurrentMonthTab(appCtx()); }

/** Reiter Archiv, siehe modules/tabs/archive.js (seit v3.15.1). */
function renderArchive() { return _renderArchiveTab(appCtx()); }

/* ---------- Employers ---------- */

function renderEmployers() {
  const container = document.getElementById('employers-list');
  // Tab-Beschriftung an Modus anpassen
  const empTabBtn = document.querySelector('.tab[data-view="employers"]');
  if (empTabBtn) empTabBtn.textContent = L('employers');
  const empViewTitle = document.getElementById('employers-view-title');
  if (empViewTitle) empViewTitle.textContent = `${L('employers')} verwalten`;
  // Seit v3.9.58: Arbeitgeber (Modus "Angestellt") und Kunden (Modus "Freiberuflich") sind zwar in
  // derselben Liste gespeichert, werden hier aber nach ihrem festen `kind`-Feld getrennt angezeigt —
  // eine Person kann parallel angestellt UND freiberuflich taetig sein, ohne dass sich die beiden
  // Listen im jeweils falschen Reiter mischen.
  const wantedKind = isFreelance() ? 'client' : 'employer';
  const relevantEmployers = _getState().employers.filter(e => (e.kind === 'employer' || e.kind === 'client') ? e.kind === wantedKind : true);
  if (!relevantEmployers.length) {
    container.innerHTML = `<div class="empty-state">Noch kein ${escapeHtml(L('employer'))} angelegt.<br><br>Klicken Sie oben auf „+ Neu", um zu starten.</div>`;
    return;
  }
  container.innerHTML = _buildEmployerCardsHTMLRaw(relevantEmployers, {
    escapeHtml,
    formatMoney,
    breakModeLabel,
    isFreelance,
    isFormerEmployer,
    todayISO,
    formatDate,
  });

  container.querySelectorAll('.employer-card').forEach(card => {
    card.addEventListener('click', () => {
      const emp = getEmployer(card.dataset.id);
      if (emp) openEmployerModal(emp);
    });
  });
}

function breakModeLabel(mode) {
  return ({
    legal: 'Pause gesetzlich', manual: 'Pause manuell',
    flex: 'Gleitzeit', none: 'Ohne Pause',
  })[mode] || mode;
}

/* ---------- Employer-Modal via modules/ui/employer-modal.js (Phase 3.9f) ---------- */

function buildScheduleGrid(schedule) { return _buildScheduleGridRaw(schedule); }
function readScheduleFromGrid() { return _readScheduleFromGridRaw(); }
function updateHoursModeVisibility() { return _updateHoursModeVisibilityRaw(); }
function openEmployerModal(emp) { return _openEmployerModalRaw(emp, appCtx()); }
function saveEmployer(ev) { return _saveEmployerRaw(ev, appCtx()); }
function deleteEmployer() { return _deleteEmployerRaw(appCtx()); }
function handleEmploymentScopeChange() { return _handleEmploymentScopeChangeRaw(); }
function handlePartTimePercentInput() { return _handlePartTimePercentInputRaw(); }
function handleFullTimeReferenceInput() { return _handleFullTimeReferenceInputRaw(); }
function handleWeeklyHoursInputForModel() { return _handleWeeklyHoursInputForModelRaw(); }
function handleWorkTimeModelChange() { return _handleWorkTimeModelChangeRaw(); }

/* ---------- Templates (Notizvorlagen) ---------- */

function renderSettings() {
  document.getElementById('setting-employee-name').value = _getState().settings.employeeName || '';
  document.getElementById('setting-own-email').value = _getState().settings.ownEmail || '';
  validateEmailField(document.getElementById('setting-own-email'));
  document.getElementById('setting-state').value = _getState().settings.state || 'HE';
  const arbzgCb = document.getElementById('setting-arbzg-hints');
  if (arbzgCb) arbzgCb.checked = isArbzgHintEnabled(_getState().settings);
  try { renderFieldServiceSettings(appCtx()); } catch (err) { console.error(err); }
  try { renderStorageStatus(appCtx()).catch((err) => console.error(err)); } catch (err) { console.error(err); }
  // Modus-Radios
  const mode = getAppMode();
  document.querySelectorAll('input[name="setting-app-mode"]').forEach((r) => {
    r.checked = (r.value === mode);
  });
  const yearInput = document.getElementById('holiday-year');
  if (yearInput && !yearInput.value) {
    yearInput.value = String(new Date().getFullYear());
  }
  renderHolidayList();
  renderTemplates();
  updateModeVisibility();
  renderAuditLog();
  updateBackupReminderBanner();
  renderBackupFolderSection();
  syncSollWarningSettingsUI();
}

// Spiegelt state.settings (sollWarning*) in die Checkbox-/Chip-UI — wird bei
// jedem Öffnen der Einstellungen sowie initial beim Wiring aufgerufen.
function syncSollWarningSettingsUI() {
  ['month', 'gleitzeit'].forEach((basis) => {
    const enabledKey = basis === 'month' ? 'sollWarningMonthEnabled' : 'sollWarningGleitzeitEnabled';
    const thresholdKey = basis === 'month' ? 'sollWarningMonthThresholdPct' : 'sollWarningGleitzeitThresholdPct';
    const enabledCb = document.getElementById(`setting-sw-${basis}-enabled`);
    if (enabledCb) enabledCb.checked = !!_getState().settings[enabledKey];
    const current = Number(_getState().settings[thresholdKey]) || 0;
    document.querySelectorAll(`.sw-chip[data-target="${basis}"]`).forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.value) === current);
    });
    const customInput = document.getElementById(`setting-sw-${basis}-threshold-custom`);
    if (customInput) customInput.value = current || '';
  });
}

/**
 * Zentraler Sichtbarkeits-Toggle für modusabhängige UI-Bereiche.
 * Wird bei renderSettings() und bei Modus-Wechsel aufgerufen.
 */
function updateModeVisibility() {
  const freelance = isFreelance();
  // Settings: Bundesland + Feiertage im Freelance-Modus ausblenden
  const blockState = document.getElementById('settings-block-state');
  const blockHolidays = document.getElementById('settings-block-holidays');
  const blockSollWarning = document.getElementById('settings-block-sw');
  if (blockState) blockState.classList.toggle('hidden', freelance);
  if (blockHolidays) blockHolidays.classList.toggle('hidden', freelance);
  if (blockSollWarning) blockSollWarning.classList.toggle('hidden', freelance);
  // Tracker: "+ Urlaub / Krankheit"-Button im Freelance-Modus verstecken
  const btnAbsence = document.getElementById('btn-add-absence');
  if (btnAbsence) btnAbsence.style.display = freelance ? 'none' : '';
  // Employer-Modal: Urlaubsanspruch-Zeile ausblenden
  const vacRow = document.getElementById('employer-vacation-row');
  if (vacRow) vacRow.classList.toggle('hidden', freelance);
  const eduRow = document.getElementById('employer-education-leave-row');
  if (eduRow) eduRow.classList.toggle('hidden', freelance);
  // Employer-Modal: Arbeitszeitmodell (Beschäftigungsart/-organisation) gilt nur für
  // angestellte Arbeitsverhältnisse, nicht für Freiberufler-Kunden.
  const employmentModelFs = document.getElementById('fs-employer-employment-model');
  if (employmentModelFs) employmentModelFs.classList.toggle('hidden', freelance);
  // Tab-Beschriftung Arbeitgeber ↔ Kunden anpassen
  const tabEmployers = document.querySelector('[data-view="employers"]');
  if (tabEmployers) tabEmployers.textContent = L('employers');
  // Settings: Namensfeld-Bezeichnung dem Hauptmodus anpassen (Freiberuflich/Nebenerwerb → "Freiberufler/in").
  const empNameLabel = document.getElementById('settings-employee-name-label');
  if (empNameLabel) empNameLabel.textContent = freelance ? 'Freiberufler/in – Name' : 'Arbeitnehmer/in – Name';
  // Eintragstyp-Option "Arbeitgeber" nur im Freiberuflich/Nebenerwerb-Hauptmodus als "Nebenerwerb" bezeichnen —
  // im Hauptmodus Angestellt bleibt es die primäre Anstellung, nicht der Nebenerwerb.
  const employerKindOption = document.getElementById('employer-kind-option-employer');
  if (employerKindOption) employerKindOption.textContent = freelance ? 'Arbeitgeber (Modus „Nebenerwerb“)' : 'Arbeitgeber (Modus „Angestellt“)';
}

/* ---------- Holiday-Overrides via modules/ui/holiday-overrides.js (Phase 3.9g) ---------- */

function ensureHolidayOverrides() { return _ensureHolidayOverridesRaw(appCtx()); }
function getBaseHolidays(year, stateCode) { return _getBaseHolidaysRaw(year, stateCode); }
function renderHolidayList() { return _renderHolidayListRaw(appCtx()); }
function handleHolidayAction(action, date) { return _handleHolidayActionRaw(action, date, appCtx()); }
function openHolidayModal(existing) { return _openHolidayModalRaw(existing, appCtx()); }
function saveHoliday(ev) { return _saveHolidayRaw(ev, appCtx()); }

/* ---------- Templates via modules/ui/templates.js (Phase 3.9h) ---------- */

function renderTemplates() { return _renderTemplatesRaw(appCtx()); }
function openTemplateModal(tpl) { return _openTemplateModalRaw(tpl, appCtx()); }
function saveTemplate(ev) { return _saveTemplateRaw(ev, appCtx()); }
function deleteTemplate() { return _deleteTemplateRaw(appCtx()); }

/* ---------- Backup ---------- */

/**
 * Liefert einen nutzbaren Backup-Ordner-Handle nur dann, wenn die API
 * unterstützt wird, ein Ordner gespeichert ist UND die Schreibberechtigung
 * bereits erteilt ist (stille Prüfung ohne Dialog) — sonst null, damit der
 * Aufrufer auf den normalen Download-Weg zurückfällt.
 */
async function getUsableBackupFolderHandle() {
  if (!isFolderPickerSupported()) return null;
  const handle = await getStoredFolderHandle();
  if (!handle) return null;
  const perm = await queryFolderPermission(handle, { request: false });
  return perm === 'granted' ? handle : null;
}

async function exportBackup() {
  const folderHandle = await getUsableBackupFolderHandle();
  if (folderHandle) {
    try {
      if (_getState().settings) { _getState().settings.lastBackupAt = new Date().toISOString(); _getState().settings.changesSinceBackup = 0; }
      saveState();
      const filename = `arbeitszeit-backup-${todayISO()}.json`;
      await writeBackupToFolder(folderHandle, filename, JSON.stringify(_getState(), null, 2));
      toast(`Backup gespeichert in „${folderHandle.name}“`);
      updateBackupReminderBanner();
      return;
    } catch (e) {
      // Ordner nicht mehr erreichbar (z.B. gelöscht, externes Laufwerk getrennt) —
      // regulärer Download-Weg als Fallback, damit das Backup nicht verloren geht.
      toast('Backup-Ordner nicht verfügbar — Backup wird stattdessen heruntergeladen');
    }
  }
  _exportBackupRaw({
    getState: _getState,
    saveState,
    downloadBlob,
    todayISO,
    toast,
  });
  updateBackupReminderBanner();
}

/* ---------- Backup-Ordner (File System Access API, seit v3.9.69) ---------- */
// Chrome/Edge: Ordner einmalig wählen, App merkt sich ihn dauerhaft (IndexedDB)
// und schreibt künftige Backups ohne erneuten Auswahldialog dorthin.
// Safari/iOS/Firefox: API nicht verfügbar — stattdessen Hinweis auf die
// gleichwertige iOS-Bordfunktion (Einstellungen → Safari → Downloads).

async function renderBackupFolderSection() {
  const content = document.getElementById('backup-folder-content');
  if (!content) return;

  if (!isFolderPickerSupported()) {
    content.innerHTML = `
      <p class="hint">Ein fester Backup-Ordner lässt sich in Safari aus Sicherheitsgründen nicht direkt in der App festlegen.</p>
      <p class="hint">Beim Export zeigt Safari stattdessen eine Dateivorschau. Tippe dort auf <strong>Mehr …</strong> (oder das Teilen-Symbol) und wähle <strong>In „Dateien“ sichern</strong>, um das Backup manuell im gewünschten Ordner abzulegen, z. B. „Auf meinem iPhone“ bzw. „Auf meinem iPad“.</p>
    `;
    return;
  }

  const handle = await getStoredFolderHandle();
  if (!handle) {
    content.innerHTML = `
      <p class="hint">Noch kein fester Ordner ausgewählt. Backups werden bei jedem Export einzeln gespeichert.</p>
      <div class="data-actions">
        <button type="button" id="btn-choose-backup-folder" class="btn-primary btn-small" data-testid="button-choose-backup-folder">📁 Ordner auswählen</button>
      </div>
    `;
    wireBackupFolderButtons();
    return;
  }

  const perm = await queryFolderPermission(handle, { request: false });
  if (perm !== 'granted') {
    content.innerHTML = `
      <p class="hint">Zugriff auf „${escapeHtml(handle.name)}“ muss erneut bestätigt werden (z. B. nach einem Browser-Neustart).</p>
      <div class="data-actions">
        <button type="button" id="btn-confirm-backup-folder" class="btn-primary btn-small" data-testid="button-confirm-backup-folder">Zugriff bestätigen</button>
        <button type="button" id="btn-change-backup-folder" class="btn-secondary btn-small" data-testid="button-change-backup-folder">Anderen Ordner wählen</button>
      </div>
    `;
    wireBackupFolderButtons();
    return;
  }

  content.innerHTML = `
    <p class="hint">Aktueller Ordner: <strong>📁 ${escapeHtml(handle.name)}</strong></p>
    <div class="data-actions">
      <button type="button" id="btn-change-backup-folder" class="btn-secondary btn-small" data-testid="button-change-backup-folder">Ordner ändern</button>
    </div>
    <p class="hint">Backups werden ab jetzt automatisch in diesem Ordner gespeichert — ohne erneute Ordnerauswahl, nur noch mit kurzer Bestätigung.</p>
  `;
  wireBackupFolderButtons();
}

function wireBackupFolderButtons() {
  const btnChoose = document.getElementById('btn-choose-backup-folder');
  if (btnChoose) btnChoose.addEventListener('click', handleChooseBackupFolder);
  const btnChange = document.getElementById('btn-change-backup-folder');
  if (btnChange) btnChange.addEventListener('click', handleChooseBackupFolder);
  const btnConfirm = document.getElementById('btn-confirm-backup-folder');
  if (btnConfirm) btnConfirm.addEventListener('click', handleConfirmBackupFolderAccess);
}

async function handleChooseBackupFolder() {
  try {
    await _chooseFolderRaw();
    toast('Backup-Ordner gespeichert');
  } catch (e) {
    if (e && e.name === 'AbortError') { return; } // Dialog abgebrochen — kein Fehler
    toast('Ordner konnte nicht gespeichert werden: ' + e.message);
  }
  renderBackupFolderSection();
}

async function handleConfirmBackupFolderAccess() {
  const handle = await getStoredFolderHandle();
  if (!handle) { renderBackupFolderSection(); return; }
  const perm = await queryFolderPermission(handle, { request: true });
  toast(perm === 'granted' ? 'Zugriff bestätigt' : 'Zugriff nicht erteilt');
  renderBackupFolderSection();
}

/** Gemeinsame Abhängigkeiten für Backup-Import und Wiederherstellung aus der Spiegelkopie. */
function importDeps() {
  return {
    commitImport: replaceStateAtomically,
    toast,
    DEFAULT_STATE,
    normalizeHolidayOverrides,
    runMigrations: _runMigrationsModule,
    uid,
    normalizeSegments,
    onImport: () => {
      updateModeVisibility();
      renderTracker(); renderEntries(); renderEmployers(); renderArchive(); renderSettings();
    },
  };
}

/**
 * v3.15.0: Daten aus der Spiegelkopie übernehmen (gleicher geprüfter Weg wie ein Backup-Import).
 * @param {any} data
 */
function restoreFromMirror(data) {
  const deps = importDeps();
  replaceStateAtomically(prepareImportedState(data, deps), deps.onImport);
}

function importBackup(file) {
  _importBackupRaw(file, importDeps());
}

/* ---------- Helpers ---------- */

/* escapeHtml: siehe modules/util-format.js */

let toastTimer;
/**
 * @param {string} msg
 * @param {{actionLabel?: string, onAction?: () => void}} [opts] Optionaler Aktions-Button
 *   (z.B. "Rückgängig" nach einer Zeitraum-Erfassung, seit v3.9.47) — länger eingeblendet als
 *   ein reiner Info-Toast, damit genug Zeit zum Klicken bleibt.
 */
function toast(msg, opts) {
  const el = document.getElementById('toast');
  el.innerHTML = '';
  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-msg';
  msgSpan.textContent = msg;
  el.appendChild(msgSpan);

  if (opts && opts.actionLabel && typeof opts.onAction === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = opts.actionLabel;
    btn.addEventListener('click', () => {
      clearTimeout(toastTimer);
      el.classList.add('hidden');
      opts.onAction();
    });
    el.appendChild(btn);
  }

  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  const duration = (opts && opts.actionLabel) ? 6000 : 2800;
  toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

/* ---------- Event Wiring ---------- */
// Siehe modules/bootstrap.js (extrahiert in Phase 3.10b).
// DOMContentLoaded-Wrapper bleibt hier, damit type=module (defer) das Event nicht verpasst.
document.addEventListener('DOMContentLoaded', () => {
  wireFieldServiceUI(appCtx());
  wireStorageStatusUI(appCtx());
  // v3.15.0: Spiegelkopie in IndexedDB prüfen; Fehler unterbrechen den Start nie.
  window.addEventListener(MIRROR_STATUS_EVENT, () => {
    try { renderStorageStatus(appCtx()).catch(() => {}); } catch (_) { /* Karte fehlt */ }
  });
  startMirror({
    loadedRaw: loadedRawForMirror,
    loadedState: _getState(),
    corrupted: stateWasCorrupted,
    getCurrentRaw: () => storage.get(STORAGE_KEY),
    appVersion: APP_VERSION,
    onRestoreOffer: (rec) => showMirrorRestore(rec, {
      restore: restoreFromMirror,
      getRaw: () => storage.get(STORAGE_KEY),
      toast,
      corrupted: stateWasCorrupted,
    }),
  }).catch((err) => console.warn('Spiegelkopie: Start fehlgeschlagen', err));
  const kmBtn = document.getElementById('btn-export-km-pdf');
  if (kmBtn) kmBtn.addEventListener('click', exportKmPdf);
  const arbzgCbFs = document.getElementById('setting-arbzg-hints');
  if (arbzgCbFs) arbzgCbFs.addEventListener('change', () => { try { renderFieldServiceSettings(appCtx()); renderTracker(); } catch (err) {} });
});
document.addEventListener('DOMContentLoaded', () => wireEvents({
  getState: _getState, saveState, storage,
  exportEmergencyBackup: () => {
    downloadBlob(new Blob([JSON.stringify(_getState(), null, 2)], { type: 'application/json' }),
      `arbeitszeit-notfall-backup-${todayISO()}.json`);
    toast('Backup heruntergeladen. Bitte die Datei sicher aufbewahren.');
  },
  stateWasCorrupted, corruptedBackupKey,
  switchView, renderTracker, renderEntries, renderEmployers, renderReport,
  renderTemplates, renderWeek, renderOverview, renderHolidayList, renderVacationPlanning, renderGleitzeitkonto,
  setShowFormerEmployers,
  startWork, endWork, setMode, updateModeVisibility,
  openEntryModal, saveEntry, deleteEntry,
  updateEntryTypeFields, updateScheduleFillVisibility, updateBreakHint, updateEntryArbzgHint,
  applyScheduleToEntry,
  openRangeEntryModal, saveRangeEntry, updateRangeVacationStats,
  openHomeofficeModal, saveHomeoffice, deleteHomeoffice,
  addHomeofficeSegment, updateHomeofficeContext,
  removeHomeofficeSegment, updateHomeofficeLiveTotal,
  openEmployerModal, saveEmployer, deleteEmployer,
  updateHoursModeVisibility,
  handleEmploymentScopeChange, handlePartTimePercentInput, handleFullTimeReferenceInput,
  handleWeeklyHoursInputForModel, handleWorkTimeModelChange,
  openTemplateModal, saveTemplate, deleteTemplate,
  openHolidayModal, saveHoliday,
  exportWord, exportPdf, exportCsv, exportOverviewPdf, exportGleitzeitkontoPdf,
  openShareModal, openOverviewShareModal, shareOverviewPdf, archiveCurrentMonth,
  exportBackup, importBackup, updateBackupReminderBanner,
  updateSollWarningBanner, MONTH_THRESHOLD_MIN_PCT,
  toast, closeModals, escapeHtml,
  getEmployer, computeSuggestedBreak,
  installWeekInputFallback,
  maybeShowWhatsNew, maybeShowKindMigrationNotice, initServiceWorkerUpdates,
}));

/* ---------- What's New ---------- */
// Siehe modules/whatsnew.js (extrahiert in Phase 3.9a).
function maybeShowWhatsNew() {
  return _maybeShowWhatsNewRaw({
    appVersion: APP_VERSION,
    lastSeenVersionKey: LAST_SEEN_VERSION_KEY,
    changelog: CHANGELOG,
    escapeHtml,
  });
}

function maybeShowKindMigrationNotice() {
  return _maybeShowKindMigrationNoticeRaw({ state: _getState(), saveState, escapeHtml });
}

/* ---------- Service Worker with Update Prompt ---------- */
// Siehe modules/sw-update.js (extrahiert in Phase 3.8).

/* ---------- Module-Scope Compatibility Bridge ----------
   Siehe modules/regression-bridge.js (extrahiert in Phase 3.9i). */
if (typeof window !== 'undefined') {
  // v3.15.0: Spiegelkopie für Regression-Skripte (gleiche Modul-Instanz wie die App).
  /** @type {any} */ (window).__azMirror = MirrorModule;
  exportBridge(window, {
    appCtx,
    getState: _getState, saveState, loadState, SCHEMA_VERSION, DEFAULT_STATE, STORAGE_KEY,
    _runMigrationsModule, migrateHomeofficeEntries,
    wasLastLoadCorrupted, getCorruptedBackupKey,
    getSummaryFields, getOverviewSummaryFields,
    renderSummaryHTML, renderSummaryPdfLines, renderSummaryWordParagraphs, renderSummaryPlaintext,
    getEmployer, getCurrentReport, getCurrentOverview,
    computeEntryRows: _computeEntryRowsRaw,
    uid, normalizeSegments, normalizeHolidayOverrides, shiftYearMonth,
    getHolidays, getHolidaysInRange, isHoliday, easterSunday, applyHolidayOverrides,
    buildRangeEntries, formatRangeEntrySummary, removeEntriesByIds,
    switchView, renderReport, renderTracker, renderWeek, renderEntries, renderEmployers, renderArchive, renderSettings,
    pushAuditLog, formatAuditLogLine, buildAuditLogHTML: _buildAuditLogHTMLRaw, renderAuditLog, updateBackupReminderBanner,
    updateSollWarningBanner, computeBalanceWarningInfo,
    evaluateSollWarning: _evaluateSollWarningRaw, formatSollWarningTooltipText: _formatSollWarningTooltipTextRaw,
    buildBalanceWarningInfo: _buildBalanceWarningInfoRaw, computeActiveSollWarnings: _computeActiveSollWarningsRaw,
    buildSollWarningListHTML: _buildSollWarningListHTMLRaw,
    computeElapsedMonthProgress: computeElapsedMonthProgressForEmployer,
    MONTH_THRESHOLD_MIN_PCT, MIN_ABSOLUTE_DEVIATION_MIN, clampMonthThresholdPct, computeMinElapsedWorkdaysForThreshold,
    generateCsvBlob,
    buildGleitzeitkontoHTML: _buildGleitzeitkontoHTMLRaw, renderGleitzeitkonto,
    getCurrentGleitzeitkonto, generateGleitzeitkontoPdfBlob,
    DAY_KEYS, DAY_LABELS, DAY_LABELS_LONG,
    computeWorkMinutes, computeHomeofficeMinutes, isWorkedEntry,
    legalBreakMinutes, computeSuggestedBreak, defaultSchedule,
    computeMonthTargetMinutes, computeWeekTargetMinutes, computeDayTargetMinutes, countWorkdaysInMonth,
    computeMonthReport, computeMonthOverview, computeVacationRemaining,
    computeYearlyVacationPlanning, computeEducationLeaveYear, computeVacationCalendarMonth, MONTH_LABELS_LONG,
    computeVacationCertificate, getExitPayout, buildVacationCertificateRows, generateVacationCertificatePdfBlob,
    computeGleitzeitkontoRows: _computeGleitzeitkontoRowsRaw,
    buildVacationPlanningHTML: _buildVacationPlanningHTMLRaw,
    buildVacationCalendarHTML: _buildVacationCalendarHTMLRaw,
    generatePdfBlob, generateOverviewPdfBlob, generateWordBlob,
    isFormerEmployer, filterVisibleEmployers, setShowFormerEmployers, todayISO,
    buildEmployerCardsHTML: _buildEmployerCardsHTMLRaw,
    exportBackup, renderBackupFolderSection,
    generateKmPdfBlob, openEntryModal, openEmployerModal,
  });
}
