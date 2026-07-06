/// <reference path="./types.js" />
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
 *   entries: [{ id, employerId, date, type:'work'|'homeoffice'|'vacation'|'sick', start, end, breakMinutes, segments, overtimeReason, note, createdAt }],
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
import {
  STORAGE_KEY,
  DEFAULT_STATE,
  storage,
  loadState as _loadStateRaw,
  saveState as _saveState,
  getState as _getState,
  setState as _setState,
} from './modules/state.js';
import {
  pad,
  todayISO,
  currentYearMonth,
  currentYearWeek,
  formatDate,
  isoWeeksInYear,
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
  countWorkdaysInMonth as _countWorkdaysInMonthRaw,
  computeMonthReport as _computeMonthReportRaw,
  computeMonthOverview as _computeMonthOverviewRaw,
} from './modules/compute.js';
import {
  getEmployer as _getEmployerRaw,
  getCurrentReport as _getCurrentReportRaw,
  getCurrentOverview as _getCurrentOverviewRaw,
  getSummaryFields as _getSummaryFieldsRaw,
  getOverviewSummaryFields as _getOverviewSummaryFieldsRaw,
} from './modules/selectors.js';
import {
  renderSummaryHTML as _renderSummaryHTMLRaw,
  renderSummaryPdfLines as _renderSummaryPdfLinesRaw,
  renderSummaryWordParagraphs as _renderSummaryWordParagraphsRaw,
  renderSummaryPlaintext as _renderSummaryPlaintextRaw,
} from './modules/render/summary.js';
import { buildReportHTML as _buildReportHTMLRaw } from './modules/render/report.js';
import { buildOverviewHTML as _buildOverviewHTMLRaw } from './modules/render/overview.js';
import { buildEntriesHTML as _buildEntriesHTMLRaw } from './modules/render/entries.js';
import { buildWeekHTML as _buildWeekHTMLRaw } from './modules/render/week.js';
import { buildEmployerCardsHTML as _buildEmployerCardsHTMLRaw } from './modules/render/employers.js';
import { buildArchiveHTML as _buildArchiveHTMLRaw } from './modules/render/archive.js';
import {
  buildTodaySummaryHTML as _buildTodaySummaryHTMLRaw,
  buildHomeofficeSegmentsHTML as _buildHomeofficeSegmentsHTMLRaw,
} from './modules/render/tracker.js';
import { generateWordBlob as _generateWordBlobRaw } from './modules/export/word.js';
import { generatePdfBlob as _generatePdfBlobRaw } from './modules/export/pdf.js';
import { generateOverviewPdfBlob as _generateOverviewPdfBlobRaw } from './modules/export/overview-pdf.js';
import { downloadBlob } from './modules/export/download.js';
import { initServiceWorkerUpdates } from './modules/sw-update.js';
import { maybeShowWhatsNew as _maybeShowWhatsNewRaw, compareVersions } from './modules/whatsnew.js';
import { exportBackup as _exportBackupRaw, importBackup as _importBackupRaw } from './modules/backup.js';
import {
  openShareModal as _openShareModalRaw,
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
  saveEntry as _saveEntryRaw,
  deleteEntry as _deleteEntryRaw,
} from './modules/ui/entry-modal.js';
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
import { APP_VERSION, LAST_SEEN_VERSION_KEY, CHANGELOG, LABELS } from './modules/constants.js';
import { wireEvents } from './modules/bootstrap.js';


/* Storage-Abstraktion, DEFAULT_STATE, STORAGE_KEY: siehe modules/state.js. */

function getAppMode() {
  return (state && state.settings && state.settings.appMode === 'freelance') ? 'freelance' : 'employee';
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
  const cur = currency || (state && state.settings && state.settings.currency) || 'EUR';
  return _formatMoneyRaw(amount, cur);
}

/* ---------- Selectors ctx-Builder (siehe modules/selectors.js) ---------- */
function _selectorsFmtCtx() {
  return { isFreelance, minutesToHM, hoursDecimal, formatMoney };
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
  return _getSummaryFieldsRaw(input, _selectorsFmtCtx());
}

/**
 * Aggregierte Variante für Übersicht (mehrere Kunden/Arbeitgeber).
 * Nimmt totals-Objekt + Row-Array und liefert Felder für Übersicht-Summary-Grid.
 */
function getOverviewSummaryFields(ov) {
  return _getOverviewSummaryFieldsRaw(ov, _selectorsFmtCtx());
}

/* ---------- Summary-Renderer (Wrapper — siehe modules/render/summary.js) ---------- */
function _renderSummaryCtx() { return { formatMoney }; }

function renderSummaryHTML(fields) {
  return _renderSummaryHTMLRaw(fields);
}
function renderSummaryPdfLines(fields) {
  return _renderSummaryPdfLinesRaw(fields, _renderSummaryCtx());
}
function renderSummaryWordParagraphs(fields, docxCtx) {
  return _renderSummaryWordParagraphsRaw(fields, docxCtx, _renderSummaryCtx());
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
 * @returns {void}
 */
function saveState() {
  try {
    _saveState();
  } catch (e) {
    console.error('State save failed', e);
    toast('Fehler beim Speichern');
  }
}

// state wird via loadState() aus dem Modul geholt; window.state hält eine Referenz
// für Regression-Skripte, die über page.evaluate darauf zugreifen.
let state = loadState();
if (typeof window !== 'undefined') window.state = state;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- Utilities ----------
   Reine Zeit-/Format-Utilities leben in modules/util-time.js und modules/util-format.js.
   Hier bleiben nur DOM-abhängige und state-abhängige Helfer. */

/* Prüft, ob der Browser <input type="week"> nativ unterstützt.
   iOS Safari (und damit alle iPhone/iPad-Browser) fallen auf 'text' zurück. */
function supportsWeekInput() {
  const test = document.createElement('input');
  try { test.type = 'week'; } catch (e) { return false; }
  return test.type === 'week';
}

/* Ersetzt das native Woche-Input durch zwei Selects (Jahr + KW), falls der Browser
   type="week" nicht nativ rendert – vor allem iOS Safari, iPad Safari/Edge/Chrome. */
function installWeekInputFallback() {
  if (supportsWeekInput()) return;

  const original = document.getElementById('week-input');
  if (!original || original.dataset.fallback === 'true') return;

  const wrap = document.createElement('span');
  wrap.className = 'week-fallback';
  wrap.style.cssText = 'display:grid;grid-template-columns:6.5rem 1fr;gap:0.4rem;align-items:center;min-width:0;';

  const yearSel = document.createElement('select');
  const weekSel = document.createElement('select');
  yearSel.setAttribute('aria-label', 'Jahr');
  weekSel.setAttribute('aria-label', 'Kalenderwoche');
  yearSel.style.minWidth = '0';
  weekSel.style.minWidth = '0';

  // Initiale Werte aus currentYearWeek
  const initial = original.value || currentYearWeek();
  const [initYearStr, initWeekStr] = initial.split('-W');
  const initYear = parseInt(initYearStr, 10);
  const initWeek = parseInt(initWeekStr, 10);

  const thisYear = new Date().getFullYear();
  for (let y = thisYear - 3; y <= thisYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    if (y === initYear) opt.selected = true;
    yearSel.appendChild(opt);
  }

  function rebuildWeeks(selectedWeek) {
    weekSel.innerHTML = '';
    const total = isoWeeksInYear(parseInt(yearSel.value, 10));
    for (let w = 1; w <= total; w++) {
      const opt = document.createElement('option');
      opt.value = pad(w);
      opt.textContent = 'KW ' + pad(w);
      if (w === selectedWeek) opt.selected = true;
      weekSel.appendChild(opt);
    }
  }
  rebuildWeeks(initWeek);

  // Verstecktes Original beibehalten für renderWeek-Kompatibilität
  original.type = 'hidden';
  original.dataset.fallback = 'true';
  original.value = `${yearSel.value}-W${weekSel.value}`;

  function pushValue() {
    original.value = `${yearSel.value}-W${weekSel.value}`;
    original.dispatchEvent(new Event('change', { bubbles: true }));
  }
  yearSel.addEventListener('change', () => {
    rebuildWeeks(parseInt(weekSel.value, 10) || 1);
    pushValue();
  });
  weekSel.addEventListener('change', pushValue);

  wrap.appendChild(yearSel);
  wrap.appendChild(weekSel);
  original.parentNode.insertBefore(wrap, original.nextSibling);
}

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
  return (state && state.settings && state.settings.holidayOverrides) || undefined;
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

function _computeCtxHoliday() {
  return {
    stateCode: (state && state.settings && state.settings.state) || 'HE',
    holidayOverrides: _currentHolidayOverrides(),
  };
}

function computeMonthTargetMinutes(employer, ym) {
  return _computeMonthTargetMinutesRaw(employer, ym, _computeCtxHoliday());
}

function computeWeekTargetMinutes(employer, weekDates) {
  return _computeWeekTargetMinutesRaw(employer, weekDates, _computeCtxHoliday());
}

function defaultSchedule(weeklyHours = 40) {
  return _defaultScheduleRaw(weeklyHours);
}

/* ---------- Employer helpers ---------- */

function getEmployer(id) {
  return _getEmployerRaw(id, { state });
}

function ensureActiveEmployer() {
  if (state.activeEmployerId && getEmployer(state.activeEmployerId)) return;
  state.activeEmployerId = state.employers[0]?.id || null;
}

/* ---------- Views ---------- */

function switchView(name) {
  document.querySelectorAll('.tab').forEach(t => {
    const active = t.dataset.view === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active);
  });
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${name}`);
  });
  window.scrollTo(0, 0);

  if (name === 'entries') renderEntries();
  if (name === 'week') renderWeek();
  if (name === 'report') renderReport();
  if (name === 'overview') renderOverview();
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
  sel.innerHTML = state.employers.length
    ? state.employers.map(e => `<option value="${e.id}" ${e.id === state.activeEmployerId ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('')
    : `<option value="">— Bitte ${L('employer')} anlegen —</option>`;

  const hint = document.getElementById('onboarding-hint');
  if (hint) {
    hint.style.display = state.employers.length ? 'none' : '';
    if (!state.employers.length) {
      hint.innerHTML = `<strong>Willkommen 👋</strong><br>Bitte legen Sie zuerst unter <em>${L('employers')}</em> mindestens ${isFreelance() ? 'einen Kunden' : 'einen Arbeitgeber'} an. Danach können Sie hier Ihre Arbeitszeiten erfassen.`;
    }
  }

  const running = state.runningTimer;
  const hasEmployers = state.employers.length > 0;
  document.getElementById('btn-start').disabled = !!running || !hasEmployers;
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

  // Mode-Toggle beim Wechsel in den Tracker-Tab immer auf Präsenz zurücksetzen (nicht persistiert),
  // außer der laufende Timer ist bereits im Home-Office-Modus.
  if (running && running.mode === 'homeoffice') {
    setMode('homeoffice');
  } else {
    setMode('praesenz');
  }
}

function startLiveTimer() {
  stopLiveTimer();
  const update = () => {
    if (!state.runningTimer) return;
    const diff = Date.now() - new Date(state.runningTimer.startISO).getTime();
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
  const empId = state.activeEmployerId;
  const container = document.getElementById('today-summary');
  if (!empId) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  const emp = getEmployer(empId);
  const ym = currentYearMonth();
  const entries = state.entries.filter(e => e.employerId === empId && e.date.startsWith(ym));

  const workedMin = entries.filter(isWorkedEntry).reduce((s, e) => s + computeWorkMinutes(e), 0);
  const vacationDays = entries.filter(e => e.type === 'vacation').length;
  const sickDays = entries.filter(e => e.type === 'sick').length;
  const targetMin = computeMonthTargetMinutes(emp, ym);
  const dailyTargetMin = targetMin ? targetMin / countWorkdaysInMonth(ym, emp) : 0;
  const creditedAbsenceMin = Math.round((vacationDays + sickDays) * dailyTargetMin);
  const balance = workedMin + creditedAbsenceMin - targetMin;

  const summaryFields = getSummaryFields({
    workedMin,
    targetMin,
    balance,
    vacationDays,
    sickDays,
    hourlyRate: Number(emp.hourlyRate) || 0,
    currency: emp.currency || 'EUR',
  });

  container.innerHTML = _buildTodaySummaryHTMLRaw({ ym, summaryFields }, {
    formatMonthYear,
    renderSummaryHTML,
  });
}

function countWorkdaysInMonth(ym, employer) {
  return _countWorkdaysInMonthRaw(ym, employer, _computeCtxHoliday());
}

/* ---------- Start / End ---------- */

function startWork() {
  if (!state.activeEmployerId) { toast('Bitte zuerst einen Arbeitgeber anlegen'); return; }
  if (state.runningTimer) return;
  state.runningTimer = {
    employerId: state.activeEmployerId,
    startISO: new Date().toISOString(),
    mode: currentMode === 'homeoffice' ? 'homeoffice' : 'praesenz',
  };
  saveState();
  renderTracker();
  toast(currentMode === 'homeoffice' ? 'Home-Office-Block gestartet' : 'Arbeitsbeginn erfasst');
}

/**
 * Splittet ein Segment am Mitternachtsgrenze. Wenn Start und Ende am selben Tag
 * liegen, wird nur ein Eintrag zurückgegeben. Bei Über-Mitternacht wird das Segment
 * am Start-Tag um 23:59 (bzw. am Grenzwert 24:00 = 00:00 des Folgetages) geteilt.
 * Rückgabe: Array von { date, start, end } jeweils innerhalb eines Kalendertags.
 */
function splitAcrossMidnight(startJSDate, endJSDate) {
  const parts = [];
  const startDay = new Date(startJSDate.getFullYear(), startJSDate.getMonth(), startJSDate.getDate());
  const endDay = new Date(endJSDate.getFullYear(), endJSDate.getMonth(), endJSDate.getDate());
  const sameDay = startDay.getTime() === endDay.getTime();
  const startHHMM = `${pad(startJSDate.getHours())}:${pad(startJSDate.getMinutes())}`;
  const endHHMM = `${pad(endJSDate.getHours())}:${pad(endJSDate.getMinutes())}`;
  const startISO = `${startDay.getFullYear()}-${pad(startDay.getMonth()+1)}-${pad(startDay.getDate())}`;
  if (sameDay) {
    parts.push({ date: startISO, start: startHHMM, end: endHHMM });
    return parts;
  }
  // Startsegment bis 23:59 des Start-Tages
  parts.push({ date: startISO, start: startHHMM, end: '23:59' });
  // Zwischentage komplett (00:00 - 23:59) — in der Praxis bei Home-Office extrem selten,
  // aber sauber implementieren für den Fall, dass jemand über mehrere Tage läuft.
  let cursor = new Date(startDay.getTime() + 24*60*60*1000);
  while (cursor.getTime() < endDay.getTime()) {
    const iso = `${cursor.getFullYear()}-${pad(cursor.getMonth()+1)}-${pad(cursor.getDate())}`;
    parts.push({ date: iso, start: '00:00', end: '23:59' });
    cursor = new Date(cursor.getTime() + 24*60*60*1000);
  }
  // End-Segment vom Folgetag ab 00:00 bis zur Endzeit
  const endISO = `${endDay.getFullYear()}-${pad(endDay.getMonth()+1)}-${pad(endDay.getDate())}`;
  if (endHHMM !== '00:00') {
    parts.push({ date: endISO, start: '00:00', end: endHHMM });
  }
  return parts;
}

function endWork() {
  const r = state.runningTimer;
  if (!r) return;
  const startDate = new Date(r.startISO);
  const endDate = new Date();
  const parts = splitAcrossMidnight(startDate, endDate);

  if (r.mode === 'homeoffice') {
    // Für jeden Kalendertag: Segment am bestehenden HO-Entry anhängen oder neuen anlegen
    for (const p of parts) {
      const existing = state.entries.find(e =>
        e.type === 'homeoffice' && e.employerId === r.employerId && e.date === p.date
      );
      if (existing) {
        const prev = Array.isArray(existing.segments) ? existing.segments : [];
        existing.segments = normalizeSegments([...prev, { start: p.start, end: p.end }]);
      } else {
        state.entries.push({
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
    state.runningTimer = null;
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
    createdAt: new Date().toISOString(),
  };
  state.entries.push(entry);
  state.runningTimer = null;
  saveState();
  renderTracker();

  openEntryModal(entry, { justEnded: true });
}

/* ---------- Entry Modal ---------- */

function _entryCtx() {
  return {
    getState: _getState,
    saveState,
    getEmployer,
    todayISO,
    dayOfWeekISO,
    DAY_KEYS,
    DAY_LABELS_LONG,
    escapeHtml,
    populateTemplatePicker,
    computeSuggestedBreak,
    renderTracker,
    renderEntries,
    toast,
    closeModals,
    uid,
  };
}

function openEntryModal(entry, opts = {}) {
  return _openEntryModalRaw(entry, opts, _entryCtx());
}

function updateScheduleFillVisibility() {
  return _updateScheduleFillVisibilityRaw(_entryCtx());
}

function applyScheduleToEntry() {
  return _applyScheduleToEntryRaw(_entryCtx());
}

function templateMatchesMode(tpl) { return _templateMatchesModeRaw(tpl, _tplCtx()); }
function populateTemplatePicker(selectId) { return _populateTemplatePickerRaw(selectId, _tplCtx()); }

function closeModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}
function updateEntryTypeFields() {
  return _updateEntryTypeFieldsRaw();
}

function updateBreakHint() {
  return _updateBreakHintRaw(_entryCtx());
}

function saveEntry(e) {
  return _saveEntryRaw(e, _entryCtx());
}

function deleteEntry() {
  return _deleteEntryRaw(_entryCtx());
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
}

function _hoCtx() {
  return {
    getState: _getState,
    saveState,
    getEmployer,
    escapeHtml,
    todayISO,
    formatDate,
    populateTemplatePicker,
    buildHomeofficeSegmentsHTML: _buildHomeofficeSegmentsHTMLRaw,
    computeHomeofficeMinutes,
    minutesToHM,
    hhmmToMinutes,
    normalizeSegments,
    renderTracker,
    renderEntries,
    renderWeek,
    renderReport,
    closeModals,
    toast,
    uid,
  };
}

function openHomeofficeModal(entry, opts) {
  return _openHomeofficeModalRaw(entry, opts, _hoCtx());
}

function updateHomeofficeContext() {
  return _updateHomeofficeContextRaw(_hoCtx());
}

function readHomeofficeSegmentsFromDom() {
  return _readHomeofficeSegmentsFromDomRaw();
}

function persistHomeofficeSegmentsToState() {
  return _persistHomeofficeSegmentsToStateRaw();
}

function renderHomeofficeSegments() {
  return _renderHomeofficeSegmentsRaw(_hoCtx());
}

function addHomeofficeSegment() {
  return _addHomeofficeSegmentRaw(_hoCtx());
}

function removeHomeofficeSegment(idx) {
  return _removeHomeofficeSegmentRaw(idx, _hoCtx());
}

function updateHomeofficeLiveTotal() {
  return _updateHomeofficeLiveTotalRaw(_hoCtx());
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
  return _saveHomeofficeRaw(e, _hoCtx());
}

function deleteHomeoffice() {
  return _deleteHomeofficeRaw(_hoCtx());
}
function hhmmToMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(n => parseInt(n, 10) || 0);
  return h * 60 + m;
}

/* ---------- Entries View ---------- */

function renderEntries() {
  const filterSel = document.getElementById('filter-employer');
  const monthInput = document.getElementById('filter-month');

  const currentEmpFilter = filterSel.value;
  filterSel.innerHTML =
    `<option value="">Alle Arbeitgeber</option>` +
    state.employers.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
  filterSel.value = currentEmpFilter || '';

  if (!monthInput.value) monthInput.value = currentYearMonth();

  const empFilter = filterSel.value;
  const monthFilter = monthInput.value;

  let list = [...state.entries];
  if (empFilter) list = list.filter(e => e.employerId === empFilter);
  if (monthFilter) list = list.filter(e => e.date.startsWith(monthFilter));

  list.sort((a, b) => b.date.localeCompare(a.date) || (b.start || '').localeCompare(a.start || ''));

  const container = document.getElementById('entries-list');
  if (!list.length) {
    container.innerHTML = '<div class="empty-state">Keine Einträge in diesem Zeitraum.</div>';
    return;
  }

  container.innerHTML = _buildEntriesHTMLRaw(list, {
    escapeHtml,
    formatDateLong,
    minutesToHM,
    getEmployer,
    computeWorkMinutes,
    computeHomeofficeMinutes,
    computeMonthTargetMinutes,
    countWorkdaysInMonth,
  });

  container.querySelectorAll('.entry-card').forEach(card => {
    card.addEventListener('click', () => {
      const entry = state.entries.find(e => e.id === card.dataset.id);
      if (!entry) return;
      if (entry.type === 'homeoffice') openHomeofficeModal(entry);
      else openEntryModal(entry);
    });
  });
}

/* ---------- Week View ---------- */

function isoWeekToDates(isoWeek) {
  // "2026-W27" → array of 7 date ISOs (Mon..Sun)
  const [yStr, wStr] = isoWeek.split('-W');
  const year = Number(yStr);
  const week = Number(wStr);
  // Jan 4 is always in week 1
  const jan4 = new Date(year, 0, 4);
  const jan4Dow = (jan4.getDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4Dow);
  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + (week - 1) * 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    dates.push(`${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`);
  }
  return dates;
}

function renderWeek() {
  const sel = document.getElementById('week-employer');
  const wkInput = document.getElementById('week-input');

  const currentEmp = sel.value;
  sel.innerHTML = state.employers.length
    ? state.employers.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('')
    : '<option value="">— Kein Arbeitgeber —</option>';
  sel.value = currentEmp || state.activeEmployerId || state.employers[0]?.id || '';

  if (!wkInput.value) wkInput.value = currentYearWeek();

  const empId = sel.value;
  const isoWeek = wkInput.value;
  const container = document.getElementById('week-content');

  if (!empId || !isoWeek) { container.innerHTML = '<div class="empty-state">Bitte Arbeitgeber und Woche wählen.</div>'; return; }

  const emp = getEmployer(empId);
  const dates = isoWeekToDates(isoWeek);
  const stateCode = state.settings.state || 'HE';
  const today = todayISO();

  let totalMin = 0;
  const dayModels = dates.map((d) => {
    const holiday = isHoliday(d, stateCode);
    const dayEntries = state.entries.filter(e => e.employerId === empId && e.date === d);
    const workMin = dayEntries.filter(isWorkedEntry).reduce((s, e) => s + computeWorkMinutes(e), 0);
    totalMin += workMin;
    const hasVacation = dayEntries.some(e => e.type === 'vacation');
    const hasSick = dayEntries.some(e => e.type === 'sick');
    const hasHomeoffice = dayEntries.some(e => e.type === 'homeoffice');

    const hoursDisplay = workMin ? minutesToHM(workMin) : '–';
    let detail = '';
    if (hasVacation) detail = 'Urlaub';
    else if (hasSick) detail = 'Krank';
    else if (hasHomeoffice && !dayEntries.some(e => e.type === 'work')) {
      // Reine Home-Office-Tage: Segmente bleiben privat, nur Label anzeigen
      detail = 'Home-Office';
    } else if (dayEntries.length) {
      const parts = [];
      for (const e of dayEntries.filter(e => e.type === 'work')) parts.push(`${e.start}–${e.end}`);
      if (hasHomeoffice) parts.push('Home-Office');
      detail = parts.join(', ');
    }

    return { workMin, hoursDisplay, detail, isToday: d === today, holiday };
  });

  const targetMin = computeWeekTargetMinutes(emp, dates);
  const balance = totalMin - targetMin;
  const holidaysInWeek = getHolidaysInRange(dates[0], dates[6], stateCode);

  const weekFields = getSummaryFields({
    workedMin: totalMin,
    targetMin,
    balance,
    hourlyRate: Number(emp.hourlyRate) || 0,
    currency: emp.currency || 'EUR',
    includeAbsences: false, // Woche zeigt keine Urlaub/Krank-Zähler
    includeHolidays: true,
    holidayCount: holidaysInWeek.length,
  });

  container.innerHTML = _buildWeekHTMLRaw(
    { emp, isoWeek, dates, dayModels, weekFields },
    { escapeHtml, formatDate, renderSummaryHTML, DAY_LABELS_LONG },
  );
}

/* ---------- Monthly Report ---------- */

/**
 * Zentraler Monatsbericht für einen Arbeitgeber (siehe modules/compute.js).
 * Wrapper reicht state als ctx durch.
 * @param {string} employerId
 * @param {string} ym 'YYYY-MM'
 * @returns {AZMonthReport|null}
 */
function computeMonthReport(employerId, ym) {
  return _computeMonthReportRaw(employerId, ym, { state });
}

function renderReport() {
  const empSel = document.getElementById('report-employer');
  const monthInput = document.getElementById('report-month');

  const currentEmp = empSel.value;
  empSel.innerHTML = state.employers.length
    ? state.employers.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('')
    : '<option value="">— Kein Arbeitgeber —</option>';
  empSel.value = currentEmp || state.activeEmployerId || state.employers[0]?.id || '';

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
  });
}

/* ---------- Word Export (.docx) ---------- */

async function generateWordBlob(report) {
  return _generateWordBlobRaw(report, {
    docx, state,
    formatDate, formatDateLong, formatMonthYear, minutesToHM,
    computeWorkMinutes, computeHomeofficeMinutes,
    getSummaryFields, renderSummaryWordParagraphs,
  });
}

/* ---------- PDF Export (jsPDF) ---------- */

function generatePdfBlob(report) {
  const { jsPDF } = window.jspdf;
  return _generatePdfBlobRaw(report, {
    jsPDF, state,
    formatDate, formatDateLong, formatMonthYear, minutesToHM,
    computeWorkMinutes, computeHomeofficeMinutes,
    getSummaryFields, renderSummaryPdfLines, isFreelance,
  });
}

// wrapText wurde nach modules/export/pdf.js + overview-pdf.js verschoben (Phase 3.7).

/* ---------- Overview: Monatsauswertung über alle Arbeitgeber ---------- */

/**
 * Monats-Übersicht über ALLE Arbeitgeber (siehe modules/compute.js).
 * @param {string} ym 'YYYY-MM'
 * @returns {AZMonthOverview}
 */
function computeMonthOverview(ym) {
  return _computeMonthOverviewRaw(ym, { state });
}

function renderOverview() {
  const monthInput = document.getElementById('overview-month');
  if (!monthInput.value) monthInput.value = currentYearMonth();
  const ym = monthInput.value;
  const container = document.getElementById('overview-content');

  if (!state.employers.length) {
    container.innerHTML = '<div class="empty-state">Bitte zuerst einen Arbeitgeber anlegen.</div>';
    return;
  }

  const ov = computeMonthOverview(ym);

  if (!ov.rows.length) {
    container.innerHTML = '<div class="empty-state">Keine Daten für diesen Monat.</div>';
    return;
  }

  container.innerHTML = _buildOverviewHTMLRaw(ov, ym, {
    escapeHtml,
    formatMonthYear,
    minutesToHM,
    formatMoney,
    isFreelance,
    getOverviewSummaryFields,
    renderSummaryHTML,
  });
}

function generateOverviewPdfBlob(ov) {
  const { jsPDF } = window.jspdf;
  return _generateOverviewPdfBlobRaw(ov, {
    jsPDF, state,
    formatMonthYear, minutesToHM, formatMoney, isFreelance,
  });
}

function fileNameForOverview(ov, ext) {
  return `Arbeitszeit_Übersicht_${ov.ym}.${ext}`;
}

function getCurrentOverview() {
  return _getCurrentOverviewRaw({
    state,
    computeMonthOverview,
    toast,
    getYm: () => document.getElementById('overview-month').value,
  });
}

async function exportOverviewPdf() {
  const ov = getCurrentOverview();
  if (!ov) return;
  try {
    const blob = generateOverviewPdfBlob(ov);
    downloadBlob(blob, fileNameForOverview(ov, 'pdf'));
    toast('Übersicht als PDF heruntergeladen');
  } catch (err) {
    console.error(err);
    toast('PDF-Export fehlgeschlagen: ' + err.message);
  }
}

async function shareOverviewPdf() {
  return _shareOverviewPdfRaw({
    getCurrentOverview,
    generateOverviewPdfBlob,
    fileNameForOverview,
    formatMonthYear,
    downloadBlob,
    toast,
  });
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
    const blob = generatePdfBlob(r);
    downloadBlob(blob, fileNameForReport(r, 'pdf'));
    toast('PDF heruntergeladen');
  } catch (err) {
    console.error(err);
    toast('PDF-Export fehlgeschlagen: ' + err.message);
  }
}

function getCurrentReport() {
  return _getCurrentReportRaw({
    state,
    computeMonthReport,
    toast,
    getEmployerId: () => document.getElementById('report-employer').value,
    getYm: () => document.getElementById('report-month').value,
  });
}

/* ---------- Share (Web Share API + Fallback) ---------- */

function _shareCtx() {
  return {
    getCurrentReport,
    getState: _getState,
    escapeHtml,
    fileNameForReport,
    formatMonthYear,
    renderSummaryPlaintext,
    getSummaryFields,
    generateWordBlob,
    generatePdfBlob,
    downloadBlob,
    toast,
    closeModals,
  };
}

function openShareModal() {
  return _openShareModalRaw(_shareCtx());
}

function showMailtoStage2(mailto, count, filename) {
  return _showMailtoStage2Raw(mailto, count, filename, { closeModals });
}

async function shareReport(format, recipientEmails) {
  return _shareReportRaw(format, recipientEmails, _shareCtx());
}

// downloadBlob wurde nach modules/export/download.js verschoben (Phase 3.7).

/* ---------- Archive ---------- */

function archiveCurrentMonth() {
  const r = getCurrentReport();
  if (!r) return;
  const empId = r.employer.id;
  const ym = r.ym;

  const exists = state.archives.find(a => a.employerId === empId && a.yearMonth === ym);
  if (exists && !confirm('Für diesen Monat existiert bereits ein Archiv. Überschreiben?')) return;

  const snapshot = {
    employer: { ...r.employer },
    entries: r.entries.map(e => ({ ...e })),
    workedMin: r.workedMin, targetMin: r.targetMin, balance: r.balance,
    vacationDays: r.vacationEntries.length, sickDays: r.sickEntries.length,
    holidays: r.holidays,
  };

  if (exists) {
    exists.snapshot = snapshot; exists.generatedAt = new Date().toISOString();
  } else {
    state.archives.push({ id: uid(), employerId: empId, yearMonth: ym, generatedAt: new Date().toISOString(), snapshot });
  }
  saveState();
  renderArchive();
  toast('Monat archiviert');
}

function renderArchive() {
  const container = document.getElementById('archive-list');
  if (!state.archives.length) {
    container.innerHTML = '<div class="empty-state">Noch keine archivierten Monate.<br><br>Sie können abgeschlossene Monate in der Monatsauswertung archivieren.</div>';
    return;
  }
  container.innerHTML = _buildArchiveHTMLRaw(state.archives, {
    escapeHtml,
    formatMonthYear,
    minutesToHM,
  });

  container.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const archive = state.archives.find(a => a.id === btn.dataset.id);
      if (!archive) return;
      const action = btn.dataset.action;
      if (action === 'delete') {
        if (!confirm('Archiv löschen?')) return;
        state.archives = state.archives.filter(a => a.id !== archive.id);
        saveState(); renderArchive(); toast('Archiv gelöscht');
      } else if (action === 'word' || action === 'pdf') {
        const s = archive.snapshot;
        const report = {
          employer: s.employer, ym: archive.yearMonth,
          entries: s.entries,
          workEntries: s.entries.filter(e => e.type === 'work'),
          vacationEntries: s.entries.filter(e => e.type === 'vacation'),
          sickEntries: s.entries.filter(e => e.type === 'sick'),
          overtimeEntries: s.entries.filter(e => e.type === 'work' && e.overtimeReason),
          workedMin: s.workedMin, targetMin: s.targetMin, balance: s.balance,
          holidays: s.holidays || [], creditedAbsenceMin: 0,
        };
        const blob = action === 'word' ? await generateWordBlob(report) : generatePdfBlob(report);
        downloadBlob(blob, fileNameForReport(report, action === 'word' ? 'docx' : 'pdf'));
        toast('Datei heruntergeladen');
      }
    });
  });
}

/* ---------- Employers ---------- */

function renderEmployers() {
  const container = document.getElementById('employers-list');
  // Tab-Beschriftung an Modus anpassen
  const empTabBtn = document.querySelector('.tab[data-view="employers"]');
  if (empTabBtn) empTabBtn.textContent = L('employers');
  const empViewTitle = document.getElementById('employers-view-title');
  if (empViewTitle) empViewTitle.textContent = `${L('employers')} verwalten`;
  if (!state.employers.length) {
    container.innerHTML = `<div class="empty-state">Noch kein ${escapeHtml(L('employer'))} angelegt.<br><br>Klicken Sie oben auf „+ Neu", um zu starten.</div>`;
    return;
  }
  container.innerHTML = _buildEmployerCardsHTMLRaw(state.employers, {
    escapeHtml,
    formatMoney,
    breakModeLabel,
    isFreelance,
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

function _emCtx() {
  return {
    getState: () => state,
    saveState,
    getEmployer,
    defaultSchedule,
    L,
    isFreelance,
    uid,
    closeModals,
    renderEmployers,
    renderTracker,
    toast,
  };
}

function buildScheduleGrid(schedule) { return _buildScheduleGridRaw(schedule); }
function readScheduleFromGrid() { return _readScheduleFromGridRaw(); }
function updateHoursModeVisibility() { return _updateHoursModeVisibilityRaw(); }
function openEmployerModal(emp) { return _openEmployerModalRaw(emp, _emCtx()); }
function saveEmployer(ev) { return _saveEmployerRaw(ev, _emCtx()); }
function deleteEmployer() { return _deleteEmployerRaw(_emCtx()); }

/* ---------- Templates (Notizvorlagen) ---------- */

function renderSettings() {
  document.getElementById('setting-employee-name').value = state.settings.employeeName || '';
  document.getElementById('setting-own-email').value = state.settings.ownEmail || '';
  document.getElementById('setting-state').value = state.settings.state || 'HE';
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
  if (blockState) blockState.classList.toggle('hidden', freelance);
  if (blockHolidays) blockHolidays.classList.toggle('hidden', freelance);
  // Tracker: "+ Urlaub / Krankheit"-Button im Freelance-Modus verstecken
  const btnAbsence = document.getElementById('btn-add-absence');
  if (btnAbsence) btnAbsence.style.display = freelance ? 'none' : '';
  // Employer-Modal: Urlaubsanspruch-Zeile ausblenden
  const vacRow = document.getElementById('employer-vacation-row');
  if (vacRow) vacRow.classList.toggle('hidden', freelance);
  // Tab-Beschriftung Arbeitgeber ↔ Kunden anpassen
  const tabEmployers = document.querySelector('[data-view="employers"]');
  if (tabEmployers) tabEmployers.textContent = L('employers');
}

/* ---------- Holiday-Overrides via modules/ui/holiday-overrides.js (Phase 3.9g) ---------- */

function _holCtx() {
  return {
    getState: () => state,
    saveState,
    normalizeHolidayOverrides,
    escapeHtml,
    formatDate,
    closeModals,
    toast,
  };
}

function ensureHolidayOverrides() { return _ensureHolidayOverridesRaw(_holCtx()); }
function getBaseHolidays(year, stateCode) { return _getBaseHolidaysRaw(year, stateCode); }
function renderHolidayList() { return _renderHolidayListRaw(_holCtx()); }
function handleHolidayAction(action, date) { return _handleHolidayActionRaw(action, date, _holCtx()); }
function openHolidayModal(existing) { return _openHolidayModalRaw(existing, _holCtx()); }
function saveHoliday(ev) { return _saveHolidayRaw(ev, _holCtx()); }

/* ---------- Templates via modules/ui/templates.js (Phase 3.9h) ---------- */

function _tplCtx() {
  return {
    getState: () => state,
    saveState,
    getAppMode,
    isFreelance,
    escapeHtml,
    uid,
    closeModals,
    toast,
  };
}

function renderTemplates() { return _renderTemplatesRaw(_tplCtx()); }
function openTemplateModal(tpl) { return _openTemplateModalRaw(tpl, _tplCtx()); }
function saveTemplate(ev) { return _saveTemplateRaw(ev, _tplCtx()); }
function deleteTemplate() { return _deleteTemplateRaw(_tplCtx()); }

/* ---------- Backup ---------- */

function exportBackup() {
  _exportBackupRaw({
    getState: _getState,
    downloadBlob,
    todayISO,
    toast,
  });
}

function importBackup(file) {
  _importBackupRaw(file, {
    setState: _setState,
    saveState,
    toast,
    DEFAULT_STATE,
    normalizeHolidayOverrides,
    onImport: (imported) => {
      state = _getState();
      if (typeof window !== 'undefined') window.state = state;
      renderTracker(); renderEntries(); renderEmployers(); renderArchive(); renderSettings();
    },
  });
}

/* ---------- Helpers ---------- */

/* escapeHtml: siehe modules/util-format.js */

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
}

/* ---------- Event Wiring ---------- */
// Siehe modules/bootstrap.js (extrahiert in Phase 3.10b).
// DOMContentLoaded-Wrapper bleibt hier, damit type=module (defer) das Event nicht verpasst.
document.addEventListener('DOMContentLoaded', () => wireEvents({
  state, saveState, storage,
  switchView, renderTracker, renderEntries, renderEmployers, renderReport,
  renderTemplates, renderWeek, renderOverview, renderHolidayList,
  startWork, endWork, setMode, updateModeVisibility,
  openEntryModal, saveEntry, deleteEntry,
  updateEntryTypeFields, updateScheduleFillVisibility, updateBreakHint,
  applyScheduleToEntry,
  openHomeofficeModal, saveHomeoffice, deleteHomeoffice,
  addHomeofficeSegment, updateHomeofficeContext,
  removeHomeofficeSegment, updateHomeofficeLiveTotal,
  openEmployerModal, saveEmployer, deleteEmployer,
  updateHoursModeVisibility,
  openTemplateModal, saveTemplate, deleteTemplate,
  openHolidayModal, saveHoliday,
  exportWord, exportPdf, exportOverviewPdf,
  openShareModal, shareOverviewPdf, archiveCurrentMonth,
  exportBackup, importBackup,
  toast, closeModals, escapeHtml,
  getEmployer, computeSuggestedBreak,
  installWeekInputFallback,
  maybeShowWhatsNew, initServiceWorkerUpdates,
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

/* ---------- Service Worker with Update Prompt ---------- */
// Siehe modules/sw-update.js (extrahiert in Phase 3.8).

/* ---------- Module-Scope Compatibility Bridge ----------
   Siehe modules/regression-bridge.js (extrahiert in Phase 3.9i). */
if (typeof window !== 'undefined') {
  exportBridge(window, {
    state, saveState, loadState, SCHEMA_VERSION, DEFAULT_STATE, STORAGE_KEY,
    _runMigrationsModule, migrateHomeofficeEntries,
    getSummaryFields, getOverviewSummaryFields,
    renderSummaryHTML, renderSummaryPdfLines, renderSummaryWordParagraphs, renderSummaryPlaintext,
    getEmployer, getCurrentReport, getCurrentOverview,
    uid, normalizeSegments, normalizeHolidayOverrides,
    getHolidays, getHolidaysInRange, isHoliday, easterSunday, applyHolidayOverrides,
    switchView, renderReport, renderTracker, renderEntries, renderEmployers, renderArchive, renderSettings,
    DAY_KEYS, DAY_LABELS, DAY_LABELS_LONG,
    computeWorkMinutes, computeHomeofficeMinutes, isWorkedEntry,
    legalBreakMinutes, computeSuggestedBreak, defaultSchedule,
    computeMonthTargetMinutes, computeWeekTargetMinutes, countWorkdaysInMonth,
    computeMonthReport, computeMonthOverview,
    generatePdfBlob, generateOverviewPdfBlob, generateWordBlob,
  });
}
