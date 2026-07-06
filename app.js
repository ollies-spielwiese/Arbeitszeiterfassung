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

const APP_VERSION = '3.9.7';
const LAST_SEEN_VERSION_KEY = 'arbeitszeit_last_seen_version';

/* Changelog: keep newest on top. Shown once per new version. */
const CHANGELOG = [
  { version: '3.9.7', items: [
      'Modul-Split Phase 3.6c: modules/render/entries.js, week.js, employers.js, archive.js, tracker.js',
      'buildEntriesHTML, buildWeekHTML, buildEmployerCardsHTML, buildArchiveHTML, buildTodaySummaryHTML, buildHomeofficeSegmentsHTML sind pure HTML-Builder mit ctx-DI',
      'app.js: renderEntries/renderWeek/renderEmployers/renderArchive/renderTodaySummary/renderHomeofficeSegments auf DOM-Wiring und Builder-Aufruf reduziert',
      'Keine Verhaltensaenderung, 51/51 Regression-Checks gruen',
  ]},
  { version: '3.9.6', items: [
      'Modul-Split Phase 3.6b: modules/render/report.js + modules/render/overview.js',
      'buildReportHTML und buildOverviewHTML sind pure HTML-Builder mit ctx-DI',
      'app.js: renderReport/renderOverview auf DOM-Wiring und Builder-Aufruf reduziert',
      'Keine Verhaltensaenderung, 51/51 Regression-Checks gruen',
  ]},
  { version: '3.9.5', items: [
      'Modul-Split Phase 3.6a: modules/render/summary.js — Summary-Renderer ausgelagert',
      'renderSummaryHTML, renderSummaryPdfLines, renderSummaryWordParagraphs, renderSummaryPlaintext sind jetzt pure ES-Exports',
      'docx-Konstruktoren bleiben Argument, formatMoney via ctx-DI',
      'Regression-Skript robuster gegen Datumsdrift: freelance week/report kalenderwochen-tolerant',
      'Keine Verhaltensaenderung, 51/51 Regression-Checks gruen',
  ]},
  { version: '3.9.4', items: [
      'Modul-Split Phase 3.5: modules/selectors.js — State-lesende Selectors ausgelagert',
      'getEmployer, getCurrentReport, getCurrentOverview, getSummaryFields, getOverviewSummaryFields sind jetzt pure ES-Exports mit ctx-DI',
      'app.js haelt schlanke Wrapper, die state/toast/compute-Referenzen automatisch reinreichen',
      'Keine Verhaltensaenderung, 51/51 Regression-Checks unveraendert',
  ]},
  { version: '3.9.3', items: [
      'Modul-Split Phase 3.4: modules/compute.js — Rechenlogik komplett ausgelagert',
      'computeWorkMinutes, computeHomeofficeMinutes, isWorkedEntry, legalBreakMinutes, computeSuggestedBreak, defaultSchedule ausgelagert',
      'computeMonthTargetMinutes, computeWeekTargetMinutes, countWorkdaysInMonth ausgelagert',
      'computeMonthReport, computeMonthOverview ausgelagert (mit ctx.state Dependency Injection)',
      'DAY_KEYS/DAY_LABELS/DAY_LABELS_LONG jetzt Single-Source-of-Truth in compute.js',
      'app.js haelt schlanke Wrapper mit unveraenderten Signaturen',
      'Keine Verhaltensaenderung, 51/51 Regression-Checks unveraendert',
  ]},
  { version: '3.9.2', items: [
      'Modul-Split Phase 3.3: modules/holidays.js — Feiertagslogik komplett ausgelagert',
      'easterSunday, getHolidays, getHolidaysInRange, isHoliday, applyHolidayOverrides, normalizeHolidayOverrides sind jetzt pure ES-Exports',
      'app.js haelt schlanke Wrapper, die state.settings.holidayOverrides automatisch reinreichen',
      'Keine Verhaltensaenderung, 51/51 Regression-Checks unveraendert',
  ]},
  { version: '3.9.1', items: [
      'Modul-Split Phase 3.2: util-time.js und util-format.js als eigene ES-Module',
      'pad, todayISO, currentYearMonth, currentYearWeek, formatDate, isoWeeksInYear, formatDateLong, formatMonthYear, minutesToHM, hoursDecimal, timeToMinutes, isoDateAdd, dayOfWeekISO, dateISO, addDays, daysInMonth, monthDates ausgelagert',
      'escapeHtml und formatMoney (Pure) ausgelagert; formatMoney bleibt als state-lesender Wrapper in app.js',
      'Keine Verhaltensaenderung, 51/51 Regression-Checks unveraendert',
  ]},
  { version: '3.9.0', items: [
      'Modul-Split Phase 3.1: state und migrations sind eigene ES-Module (modules/state.js, modules/migrations.js)',
      'app.js lädt jetzt als type=module; docx/jspdf UMD-Scripts bleiben davor',
      'Kein Verhaltens-Delta: 51/51 Regression-Checks unverändert, Backup-Import und Persistenz identisch',
      'window.state bleibt für Regression-Skripte und Legacy-Consumer verfügbar',
  ]},
  { version: '3.8.5', items: [
      'GitHub Actions CI: Regression läuft automatisch bei jedem Push auf main',
      'Pages-Deployment läuft über Actions und ist gated — rote Regression blockt den Deploy',
      'Playwright und Chromium in CI installiert, statischer Server hochgefahren, 51 Checks pro Run',
      'Kein manueller Trigger-Commit für Pages-Rebuild mehr nötig',
  ]},
  { version: '3.8.4', items: [
      'Regression prüft jetzt PDF- und Word-Inhalt inhaltlich (pdf-parse + mammoth in Node)',
      'Freelance: 595,00 €, Kunde Alpha, 7:00 Ist müssen in PDF/Word auftauchen',
      'Employee: Ist/Soll/Saldo/Arbeitgeber A müssen in PDF/Word auftauchen',
      'Overview-PDF wird ebenfalls textuell gegen erwartete Werte geprüft (51/51 Checks)',
  ]},
  { version: '3.8.3', items: [
      'Interner State-Migrations-Layer: SCHEMA_VERSION + migrations[]-Array in loadState',
      'Bisherige Ad-hoc-Migrationen (v3.5 Home-Office-Merge, v3.7.1 Template-Scope) formalisiert',
      'Regression um Migrations-Unit-Tests erweitert (33/33 Checks)',
      'Keine Verhaltensänderung für Bestandsdaten',
  ]},
  { version: '3.8.2', items: [
      'Interne Codehygiene: zentrale JSDoc-Typen in types.js (AZState, AZEntry, AZEmployer, AZMonthReport, AZSummaryField)',
      'Kernfunktionen mit @param/@returns annotiert (loadState, saveState, getSummaryFields, computeMonthReport, computeMonthOverview, computeWorkMinutes, getHolidays, isHoliday)',
      'jsconfig.json für VS Code Autocomplete; keine Verhaltensänderung, keine neuen Features',
  ]},
  { version: '3.8.1', items: [
      'Neu im Repo: scripts/regression.mjs — reproduzierbares Playwright-Skript für QA vor jedem Version-Bump',
      'Deckt Selector-Unit-Tests, E2E Freelance und E2E Employee ab (24 Checks, ~2 s)',
      'Aufruf: node scripts/regression.mjs — kein npm install nötig',
  ]},
  { version: '3.8.0', items: [
      'Interner Refactor: zentraler getSummaryFields-Selector als Single Source of Truth für alle Zusammenfassungen',
      'Screen, PDF, Word und E-Mail nutzen jetzt dieselben Feld-Definitionen und Renderer',
      'Änderungen an Feld-Sichtbarkeit oder Formatierung finden nur noch an einer Stelle statt',
  ]},
  { version: '3.7.3', items: [
      'Freelance-Modus: Zusammenfassung zeigt jetzt nur Ist-Stunden und Rechnungsbetrag (kein Soll/Saldo, kein Urlaub/Krank)',
      'Betrifft Bildschirm-Bericht (Tag/Woche/Monat), Übersicht-Tab, PDF-, Word- und E-Mail-Zusammenfassung',
      'Übersicht heißt im Freelance-Modus jetzt „alle Kunden“ (statt Arbeitgeber)',
  ]},
  { version: '3.7.2', items: [
      'Home-Office-Editor: Notizvorlagen-Picker bei Bemerkung ergänzt (fehlte bisher)',
      'Filter nach App-Modus greift jetzt auch im Home-Office-Modal',
  ]},
  { version: '3.7.1', items: [
      'Notizvorlagen können jetzt pro Modus (Beide / Nur Angestellt / Nur Freiberuflich) sichtbar geschaltet werden',
      'Vorlagen-Editor mit neuem Sichtbarkeits-Dropdown; Karten zeigen Scope-Badge',
      'Notiz-Auswahl im Eintrag-Modal filtert automatisch nach aktivem App-Modus',
  ]},
  { version: '3.7', items: [
      'Neu: Freiberufler-Modus – in den Einstellungen zwischen „Angestellt“ und „Freiberuflich“ umschalten',
      'Im Freiberufler-Modus heißen Arbeitgeber jetzt Kunden; Feiertage und Urlaub sind ausgeblendet',
      'Optionaler Stundensatz pro Kunde; Netto-Summe erscheint automatisch in PDF- und Word-Berichten',
      'Anleitung um Word-Hinweis und Freiberufler-Abschnitt erweitert',
  ]},
  { version: '3.6', items: [
      'Home-Office-Timer über Mitternacht wird korrekt gespeichert und auf beide Kalendertage verteilt',
      'Update-Prompt erscheint zuverlässig auch nach „Später“ beim nächsten App-Start',
      'Kein unerwarteter Neustart mehr beim Zurückkehren aus dem Hintergrund',
  ]},
  { version: '3.5', items: [
      'Home-Office-Tag: alle Blöcke landen automatisch im gleichen Eintrag — egal ob per Timer oder manuell',
      'Bestehende doppelte Home-Office-Einträge werden beim Start automatisch zusammengeführt',
      'Home-Office-Editor: Modal-Kopf zeigt Datum und Arbeitgeber; kürzerer Anleitungstext',
  ]},
  { version: '3.4', items: [
      'Neuer Home-Office-Modus: Multi-Segment-Erfassung für Arbeit mit privaten Unterbrechungen (Einkaufen, Kinder abholen, Pause)',
      'Präsenz/Home-Office-Umschalter im Erfassen-Tab; startet immer auf Präsenz',
      'Home-Office-Tage im Monatsbericht als Netto-Summe ausgewiesen, Segmente bleiben privat',
      'Neuer Footer im Monatsbericht: „davon Home-Office: X Tage · Y:ZZ“',
      'Versionsnummer im Kopf sichtbar',
  ]},
  { version: '3.3', items: [
      'Was-ist-neu-Hinweis nach jedem Update',
      'Aktualisierungs-Prompt, wenn eine neue Version bereitsteht',
      'Kleinere Fehlerbereinigungen',
  ]},
  { version: '3.2', items: [
      'Feiertage anpassbar: zusätzliche ergänzen, einzelne deaktivieren oder umbenennen',
      'Alle Anpassungen bleiben offline auf dem Gerät und wandern ins Backup',
  ]},
  { version: '3.1', items: [
      'Neuer Tab „Übersicht“: alle Arbeitgeber im Monatsvergleich',
      'PDF-Export der Monatsübersicht',
  ]},
  { version: '3.0', items: [
      'Unterschriften-Zeile Arbeitgeber im PDF',
      'Anleitungsabschnitt zu Copyright und Datenschutz',
  ]},
];

/* Storage-Abstraktion, DEFAULT_STATE, STORAGE_KEY: siehe modules/state.js. */

/* ---------- State & Persistence ---------- */

/* Label-Mapping für Angestellten- vs. Freiberufler-Modus.
 * Zentraler Anlaufpunkt: Alle UI-Texte, die vom Modus abhängen, holen ihren
 * String über L() bzw. das Alias t(). So bleibt die Terminologie konsistent.
 */
const LABELS = {
  employee: {
    employer: 'Arbeitgeber',
    employers: 'Arbeitgeber',
    activeEmployer: 'Aktueller Arbeitgeber',
    newEmployer: 'Neuer Arbeitgeber',
    editEmployer: 'Arbeitgeber bearbeiten',
    employerName: 'Name des Arbeitgebers',
    noEmployer: 'Bitte legen Sie zuerst unter Arbeitgeber mindestens einen Arbeitgeber an.',
    modeName: 'Angestellt',
  },
  freelance: {
    employer: 'Kunde',
    employers: 'Kunden',
    activeEmployer: 'Aktueller Kunde',
    newEmployer: 'Neuer Kunde',
    editEmployer: 'Kunde bearbeiten',
    employerName: 'Name des Kunden',
    noEmployer: 'Bitte legen Sie zuerst unter Kunden mindestens einen Kunden an.',
    modeName: 'Freiberuflich',
  },
};
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

function openEntryModal(entry, opts = {}) {
  const modal = document.getElementById('modal-entry');
  const form = document.getElementById('form-entry');
  const isNew = !entry;

  document.getElementById('modal-entry-title').textContent =
    opts.justEnded ? 'Zeit prüfen und speichern' : (isNew ? 'Zeit erfassen' : 'Zeit bearbeiten');

  const empSel = document.getElementById('entry-employer');
  empSel.innerHTML = state.employers.map(e =>
    `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');

  const e = entry || {
    id: '',
    employerId: state.activeEmployerId,
    date: todayISO(),
    type: opts.presetType || 'work',
    start: '',
    end: '',
    breakMinutes: 0,
    overtimeReason: '',
    note: '',
  };

  form.querySelector('#entry-id').value = e.id;
  empSel.value = e.employerId || state.activeEmployerId;
  form.querySelector('#entry-date').value = e.date;
  form.querySelector('#entry-type').value = e.type;
  form.querySelector('#entry-start').value = e.start || '';
  form.querySelector('#entry-end').value = e.end || '';
  form.querySelector('#entry-break').value = e.breakMinutes || 0;
  form.querySelector('#entry-overtime-reason').value = e.overtimeReason || '';
  form.querySelector('#entry-note').value = e.note || '';

  document.getElementById('btn-delete-entry').classList.toggle('hidden', isNew);

  populateTemplatePicker('entry-overtime-tpl');
  populateTemplatePicker('entry-note-tpl');
  updateEntryTypeFields();
  updateBreakHint();
  updateScheduleFillVisibility();

  modal.classList.remove('hidden');
}

function updateScheduleFillVisibility() {
  const empId = document.getElementById('entry-employer').value;
  const emp = getEmployer(empId);
  const dateVal = document.getElementById('entry-date').value;
  const type = document.getElementById('entry-type').value;
  const row = document.getElementById('schedule-fill-row');
  if (!row) return;
  if (type !== 'work' || !emp || !dateVal || !emp.schedule) { row.classList.add('hidden'); return; }
  const key = DAY_KEYS[dayOfWeekISO(dateVal)];
  const day = emp.schedule[key];
  if (day?.enabled && day.start && day.end) {
    row.classList.remove('hidden');
    const btn = document.getElementById('btn-apply-schedule');
    btn.textContent = `📅 Vorschlag: ${DAY_LABELS_LONG[DAY_KEYS.indexOf(key)]} ${day.start}–${day.end}${day.break ? ` (${day.break} Min Pause)` : ''}`;
  } else {
    row.classList.add('hidden');
  }
}

function applyScheduleToEntry() {
  const empId = document.getElementById('entry-employer').value;
  const emp = getEmployer(empId);
  const dateVal = document.getElementById('entry-date').value;
  if (!emp || !emp.schedule || !dateVal) return;
  const key = DAY_KEYS[dayOfWeekISO(dateVal)];
  const day = emp.schedule[key];
  if (!day?.enabled || !day.start || !day.end) return;
  document.getElementById('entry-start').value = day.start;
  document.getElementById('entry-end').value = day.end;
  document.getElementById('entry-break').value = day.break || 0;
  updateBreakHint();
  toast('Wochenschema übernommen');
}

/**
 * Liefert true, wenn die Vorlage im aktuellen App-Modus verwendbar ist.
 * scope 'both' ist immer sichtbar, 'employee' nur im Angestellt-Modus, 'freelance' nur im Freelance-Modus.
 * Vorlagen ohne scope werden als 'both' behandelt (defensive Vorsichtsmaßnahme).
 */
function templateMatchesMode(tpl) {
  const s = tpl && tpl.scope;
  if (!s || s === 'both') return true;
  return s === getAppMode();
}

function populateTemplatePicker(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const visible = state.templates.filter(templateMatchesMode);
  sel.innerHTML = '<option value="">Vorlage einfügen …</option>' +
    visible.map(t => `<option value="${escapeHtml(t.text)}">${escapeHtml(t.label)}</option>`).join('');
  sel.value = '';
}

function closeModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function updateEntryTypeFields() {
  const type = document.getElementById('entry-type').value;
  document.getElementById('work-fields').style.display = type === 'work' ? 'block' : 'none';
}

function updateBreakHint() {
  const empId = document.getElementById('entry-employer').value;
  const emp = getEmployer(empId);
  const start = document.getElementById('entry-start').value;
  const end = document.getElementById('entry-end').value;
  const hintEl = document.getElementById('break-hint');
  if (!emp || !start || !end) { hintEl.textContent = ''; return; }
  const suggested = computeSuggestedBreak(start, end, emp.breakMode);
  const labels = { legal: 'Gesetzlich', flex: 'Gleitzeit', manual: 'Manuell', none: 'Ohne Pause' };
  const modeLabel = labels[emp.breakMode] || '';
  if (emp.breakMode === 'none') {
    hintEl.textContent = `Modell: ${modeLabel}`;
  } else if (suggested !== null && suggested > 0) {
    hintEl.textContent = `Modell ${modeLabel} • Empfehlung: ${suggested} Min`;
  } else {
    hintEl.textContent = `Modell: ${modeLabel}`;
  }
}

function saveEntry(e) {
  e.preventDefault();
  const id = document.getElementById('entry-id').value;
  const type = document.getElementById('entry-type').value;
  const employerId = document.getElementById('entry-employer').value;
  const date = document.getElementById('entry-date').value;

  if (!employerId) { toast('Bitte Arbeitgeber wählen'); return; }
  if (!date) { toast('Bitte Datum wählen'); return; }

  const entryData = {
    employerId,
    date,
    type,
    start: type === 'work' ? document.getElementById('entry-start').value : '',
    end: type === 'work' ? document.getElementById('entry-end').value : '',
    breakMinutes: type === 'work' ? (parseInt(document.getElementById('entry-break').value) || 0) : 0,
    overtimeReason: type === 'work' ? document.getElementById('entry-overtime-reason').value.trim() : '',
    note: document.getElementById('entry-note').value.trim(),
  };

  if (type === 'work' && (!entryData.start || !entryData.end)) {
    toast('Bitte Beginn und Ende angeben');
    return;
  }

  if (id) {
    const idx = state.entries.findIndex(x => x.id === id);
    if (idx >= 0) state.entries[idx] = { ...state.entries[idx], ...entryData };
  } else {
    state.entries.push({ id: uid(), createdAt: new Date().toISOString(), ...entryData });
  }
  saveState();
  closeModals();
  renderTracker();
  renderEntries();
  toast('Gespeichert');
}

function deleteEntry() {
  const id = document.getElementById('entry-id').value;
  if (!id) return;
  if (!confirm('Diesen Eintrag wirklich löschen?')) return;
  state.entries = state.entries.filter(e => e.id !== id);
  saveState();
  closeModals();
  renderTracker();
  renderEntries();
  toast('Gelöscht');
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

function openHomeofficeModal(entry, opts) {
  opts = opts || {};
  const modal = document.getElementById('modal-homeoffice');
  const title = document.getElementById('modal-homeoffice-title');
  const empSel = document.getElementById('ho-employer');
  const dateInput = document.getElementById('ho-date');
  const noteInput = document.getElementById('ho-note');
  const idInput = document.getElementById('ho-id');
  const delBtn = document.getElementById('btn-delete-homeoffice');

  empSel.innerHTML = state.employers
    .map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');

  if (entry && entry.id) {
    title.textContent = 'Home-Office-Tag bearbeiten';
    idInput.value = entry.id;
    empSel.value = entry.employerId || state.activeEmployerId || '';
    dateInput.value = entry.date || todayISO();
    noteInput.value = entry.note || '';
    const segs = Array.isArray(entry.segments) && entry.segments.length
      ? entry.segments.map(s => ({ start: s.start || '', end: s.end || '' }))
      : (entry.start && entry.end ? [{ start: entry.start, end: entry.end }] : [{ start: '', end: '' }]);
    modal.dataset.segments = JSON.stringify(segs);
    delBtn.classList.remove('hidden');
  } else {
    title.textContent = 'Home-Office-Tag';
    idInput.value = '';
    const preferredEmp = opts.employerId || state.activeEmployerId || state.employers[0]?.id || '';
    empSel.value = preferredEmp;
    dateInput.value = opts.date || todayISO();
    noteInput.value = '';
    // Wenn für (employer, date) schon ein Eintrag existiert: dessen Segmente vorbelegen,
    // damit man ergibige Kontext bekommt und weitere Blöcke direkt ergänzt.
    const existing = state.entries.find(x =>
      x.type === 'homeoffice' && x.employerId === empSel.value && x.date === dateInput.value
    );
    if (existing) {
      title.textContent = 'Home-Office-Tag bearbeiten';
      idInput.value = existing.id;
      noteInput.value = existing.note || '';
      const segs = Array.isArray(existing.segments) && existing.segments.length
        ? existing.segments.map(s => ({ start: s.start || '', end: s.end || '' }))
        : [{ start: '', end: '' }];
      // Neuen Leer-Block anhängen, damit der User direkt weiter erfassen kann
      segs.push({ start: '', end: '' });
      modal.dataset.segments = JSON.stringify(segs);
      delBtn.classList.remove('hidden');
    } else {
      modal.dataset.segments = JSON.stringify([{ start: '', end: '' }]);
      delBtn.classList.add('hidden');
    }
  }

  updateHomeofficeContext();
  renderHomeofficeSegments();
  populateTemplatePicker('ho-note-tpl');
  modal.classList.remove('hidden');
}

/**
 * Aktualisiert die Kontext-Zeile im HO-Modal-Header: Wochentag · Datum · Arbeitgeber
 * plus Hinweis, ob dieser Tag bereits einen Eintrag hat.
 */
function updateHomeofficeContext() {
  const el = document.getElementById('ho-context');
  if (!el) return;
  const empId = document.getElementById('ho-employer').value;
  const dateISO = document.getElementById('ho-date').value;
  const currentId = document.getElementById('ho-id').value;
  const emp = getEmployer(empId);
  const empName = emp ? emp.name : '—';
  let dateLabel = '—';
  if (dateISO) {
    try {
      const d = new Date(dateISO + 'T00:00:00');
      const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()];
      dateLabel = `${wd}. ${formatDate(dateISO)}`;
    } catch (e) { dateLabel = formatDate(dateISO); }
  }
  const existing = state.entries.find(x =>
    x.type === 'homeoffice' && x.employerId === empId && x.date === dateISO && x.id !== currentId
  );
  const hint = (currentId || existing)
    ? 'Weitere Blöcke werden zu diesem Tag hinzugefügt.'
    : 'Neuer Eintrag — spätere Blöcke landen automatisch im selben Eintrag.';
  el.innerHTML = `
    <div class="ho-context-line">${escapeHtml(dateLabel)} · ${escapeHtml(empName)}</div>
    <div class="ho-context-hint">${hint}</div>
  `;
}

function readHomeofficeSegmentsFromDom() {
  const container = document.getElementById('ho-segments');
  const rows = container.querySelectorAll('.ho-segment-row');
  const segs = [];
  rows.forEach(row => {
    const start = row.querySelector('input[data-seg-start]').value || '';
    const end = row.querySelector('input[data-seg-end]').value || '';
    segs.push({ start, end });
  });
  return segs;
}

function persistHomeofficeSegmentsToState() {
  const modal = document.getElementById('modal-homeoffice');
  modal.dataset.segments = JSON.stringify(readHomeofficeSegmentsFromDom());
}

function renderHomeofficeSegments() {
  const modal = document.getElementById('modal-homeoffice');
  const container = document.getElementById('ho-segments');
  let segs;
  try { segs = JSON.parse(modal.dataset.segments || '[]'); } catch (e) { segs = []; }
  container.innerHTML = _buildHomeofficeSegmentsHTMLRaw(segs);
  updateHomeofficeLiveTotal();
}

function addHomeofficeSegment() {
  persistHomeofficeSegmentsToState();
  const modal = document.getElementById('modal-homeoffice');
  const segs = JSON.parse(modal.dataset.segments || '[]');
  segs.push({ start: '', end: '' });
  modal.dataset.segments = JSON.stringify(segs);
  renderHomeofficeSegments();
}

function removeHomeofficeSegment(idx) {
  persistHomeofficeSegmentsToState();
  const modal = document.getElementById('modal-homeoffice');
  const segs = JSON.parse(modal.dataset.segments || '[]');
  segs.splice(idx, 1);
  if (!segs.length) segs.push({ start: '', end: '' });
  modal.dataset.segments = JSON.stringify(segs);
  renderHomeofficeSegments();
}

function updateHomeofficeLiveTotal() {
  const el = document.getElementById('ho-live-total');
  if (!el) return;
  const segs = readHomeofficeSegmentsFromDom();
  const totalMin = computeHomeofficeMinutes({ segments: segs });
  el.textContent = minutesToHM(totalMin);
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
  if (e && e.preventDefault) e.preventDefault();
  const id = document.getElementById('ho-id').value;
  const employerId = document.getElementById('ho-employer').value;
  const date = document.getElementById('ho-date').value;
  const note = document.getElementById('ho-note').value.trim();
  const rawSegs = readHomeofficeSegmentsFromDom();
  const segments = rawSegs
    .filter(s => s.start && s.end)
    .map(s => ({ start: s.start, end: s.end }));

  if (!employerId) { toast('Bitte Arbeitgeber wählen'); return; }
  if (!date) { toast('Bitte Datum wählen'); return; }
  if (!segments.length) { toast('Bitte mindestens einen Arbeitsblock erfassen'); return; }

  // Validate each segment: end > start
  for (const s of segments) {
    const sm = hhmmToMinutes(s.start);
    const em = hhmmToMinutes(s.end);
    if (em <= sm) {
      toast(`Ungültiger Block ${s.start}–${s.end}: Ende muss nach Beginn liegen. Für Über-Mitternacht bitte zwei Blöcke erfassen (bis 23:59 und ab 00:00 am Folgetag).`);
      return;
    }
  }

  // Aggregations-Prinzip: pro (employerId, date) existiert höchstens ein HO-Entry.
  // Beim Speichern immer den Ziel-Entry (für den aktuellen employer/date) suchen und dort hineinschreiben.
  // Wenn wir einen bestehenden Entry bearbeiten (id gesetzt) und das Ziel ein *anderer* Entry ist,
  // dann die Segmente in den Ziel-Entry übernehmen und den ursprünglichen Entry entfernen.

  const targetIdx = state.entries.findIndex(x =>
    x.type === 'homeoffice' && x.employerId === employerId && x.date === date && x.id !== id
  );
  const editingIdx = id ? state.entries.findIndex(x => x.id === id) : -1;

  if (id && editingIdx >= 0 && targetIdx < 0) {
    // Reiner Edit ohne Kollision: eigenen Entry aktualisieren
    state.entries[editingIdx] = {
      ...state.entries[editingIdx],
      employerId, date, type: 'homeoffice',
      segments: normalizeSegments(segments),
      note,
      start: undefined, end: undefined, breakMinutes: undefined, overtimeReason: undefined,
    };
  } else if (targetIdx >= 0) {
    // Ziel-Entry existiert: mergen (existierende Segmente + neue Segmente), Note ergänzen falls leer
    const target = state.entries[targetIdx];
    const existingSegs = Array.isArray(target.segments) ? target.segments
      : (target.start && target.end ? [{ start: target.start, end: target.end }] : []);
    target.segments = normalizeSegments([...existingSegs, ...segments]);
    target.type = 'homeoffice';
    target.start = undefined; target.end = undefined;
    target.breakMinutes = undefined; target.overtimeReason = undefined;
    if (note && !target.note) target.note = note;
    else if (note && target.note && !target.note.includes(note)) target.note = `${target.note} · ${note}`;
    // Falls wir gerade einen anderen Entry bearbeitet haben, den entfernen
    if (editingIdx >= 0 && editingIdx !== targetIdx) {
      state.entries.splice(editingIdx, 1);
    }
  } else {
    // Neu anlegen
    state.entries.push({
      id: uid(),
      employerId, date, type: 'homeoffice',
      segments: normalizeSegments(segments),
      note,
      createdAt: new Date().toISOString(),
    });
  }
  saveState();
  closeModals();
  renderTracker();
  renderEntries();
  renderWeek();
  renderReport();
  toast('Gespeichert');
}

function deleteHomeoffice() {
  const id = document.getElementById('ho-id').value;
  if (!id) return;
  if (!confirm('Diesen Home-Office-Tag wirklich löschen?')) return;
  state.entries = state.entries.filter(e => e.id !== id);
  saveState();
  closeModals();
  renderTracker();
  renderEntries();
  renderWeek();
  renderReport();
  toast('Gelöscht');
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
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType, BorderStyle } = docx;

  const border = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' };
  const cellBorders = { top: border, bottom: border, left: border, right: border };

  // Fixed column widths in DXA (1440 dxa = 1 inch). Page width A4 minus margins ≈ 9000 dxa.
  // Widths: Datum 1700, Zeit 1400, Pause 900, Std. 900, Grund 2100, Bemerkung 2000 = 9000 total
  const colWidths = [1700, 1400, 900, 900, 2100, 2000];
  const headerCellW = (text, w) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: cellBorders,
    shading: { fill: 'F1F5F9' },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20 })] })],
  });
  const cellW = (text, w, align = AlignmentType.LEFT) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: cellBorders,
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text: String(text || ''), size: 20 })] })],
  });

  const combinedRows = [
    ...report.workEntries.map(e => ({ e, isHO: false })),
    ...(report.homeofficeEntries || []).map(e => ({ e, isHO: true })),
  ].sort((a, b) => a.e.date.localeCompare(b.e.date));

  const workRowsFixed = combinedRows.map(({ e, isHO }) => {
    if (isHO) {
      const mins = computeHomeofficeMinutes(e);
      return new TableRow({
        children: [
          cellW(formatDateLong(e.date), colWidths[0]),
          cellW('Home-Office', colWidths[1]),
          cellW('—', colWidths[2], AlignmentType.RIGHT),
          cellW(minutesToHM(mins), colWidths[3], AlignmentType.RIGHT),
          cellW('', colWidths[4]),
          cellW(e.note || '', colWidths[5]),
        ],
      });
    }
    const mins = computeWorkMinutes(e);
    return new TableRow({
      children: [
        cellW(formatDateLong(e.date), colWidths[0]),
        cellW(`${e.start}–${e.end}`, colWidths[1]),
        cellW(e.breakMinutes || 0, colWidths[2], AlignmentType.RIGHT),
        cellW(minutesToHM(mins), colWidths[3], AlignmentType.RIGHT),
        cellW(e.overtimeReason || '', colWidths[4]),
        cellW(e.note || '', colWidths[5]),
      ],
    });
  });

  const workTable = combinedRows.length ? new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: colWidths,
    layout: 'fixed',
    rows: [
      new TableRow({ tableHeader: true, children: [
        headerCellW('Datum', colWidths[0]),
        headerCellW('Zeit', colWidths[1]),
        headerCellW('Pause (Min)', colWidths[2]),
        headerCellW('Std.', colWidths[3]),
        headerCellW('Grund Überstunden', colWidths[4]),
        headerCellW('Bemerkung', colWidths[5]),
      ]}),
      ...workRowsFixed,
    ],
  }) : null;

  const absenceLines = [];
  if (report.vacationEntries.length) {
    absenceLines.push(new Paragraph({ children: [
      new TextRun({ text: 'Urlaub: ', bold: true }),
      new TextRun({ text: report.vacationEntries.map(e => formatDate(e.date)).join(', ') }),
    ]}));
  }
  if (report.sickEntries.length) {
    absenceLines.push(new Paragraph({ children: [
      new TextRun({ text: 'Krankheit: ', bold: true }),
      new TextRun({ text: report.sickEntries.map(e => formatDate(e.date)).join(', ') }),
    ]}));
  }
  if (report.holidays && report.holidays.length) {
    absenceLines.push(new Paragraph({ children: [
      new TextRun({ text: 'Feiertage: ', bold: true }),
      new TextRun({ text: report.holidays.map(h => `${formatDate(h.date)} ${h.name}`).join(', ') }),
    ]}));
  }

  const overtimeSection = report.overtimeEntries.length ? [
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Überstunden – Begründung', bold: true })] }),
    ...report.overtimeEntries.map(e => new Paragraph({ children: [
      new TextRun({ text: `${formatDate(e.date)}: `, bold: true }),
      new TextRun({ text: e.overtimeReason }),
    ]})),
  ] : [];

  const empName = (state.settings.employeeName || '').trim();
  const headerLines = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Arbeitszeitnachweis', bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: `${report.employer.name} – ${formatMonthYear(report.ym)}`, size: 24 })] }),
  ];
  if (empName) {
    headerLines.push(new Paragraph({ children: [
      new TextRun({ text: 'Arbeitnehmer/in: ', bold: true }),
      new TextRun({ text: empName }),
    ] }));
  }
  headerLines.push(new Paragraph({ children: [new TextRun({ text: `Erstellt am ${new Date().toLocaleDateString('de-DE')}`, italics: true, color: '64748B' })] }));
  headerLines.push(new Paragraph({ text: '' }));

  const wordSummaryFields = getSummaryFields({
    workedMin: report.workedMin,
    targetMin: report.targetMin,
    balance: report.balance,
    vacationDays: report.vacationEntries.length,
    sickDays: report.sickEntries.length,
    hourlyRate: Number(report.employer.hourlyRate) || 0,
    currency: report.employer.currency || 'EUR',
  });
  const wordSummaryParagraphs = renderSummaryWordParagraphs(wordSummaryFields, { Paragraph, TextRun });

  const children = [
    ...headerLines,

    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Zusammenfassung', bold: true })] }),
    ...wordSummaryParagraphs,
    ...absenceLines,
    new Paragraph({ text: '' }),

    ...(workTable ? [
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Einzelnachweis', bold: true })] }),
      workTable,
      ...((report.homeofficeEntries && report.homeofficeEntries.length) ? [new Paragraph({ children: [
        new TextRun({ text: `davon Home-Office: ${report.homeofficeEntries.length} ${report.homeofficeEntries.length === 1 ? 'Tag' : 'Tage'} · ${minutesToHM(report.homeofficeMin || 0)}`, italics: true, color: '64748B', size: 18 }),
      ]})] : []),
      new Paragraph({ text: '' }),
    ] : []),

    ...overtimeSection,

    new Paragraph({ text: '' }),
    new Paragraph({ text: '' }),
    new Table({
      width: { size: 9000, type: WidthType.DXA },
      columnWidths: [4200, 600, 4200],
      layout: 'fixed',
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      rows: [
        new TableRow({ children: [
          new TableCell({ width: { size: 4200, type: WidthType.DXA }, borders: { top: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } }, children: [ new Paragraph({ children: [new TextRun({ text: empName ? `${empName} – Unterschrift / Datum` : 'Unterschrift Arbeitnehmer / Datum', size: 18, color: '64748B' })] }) ] }),
          new TableCell({ width: { size: 600, type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } }, children: [new Paragraph({ text: '' })] }),
          new TableCell({ width: { size: 4200, type: WidthType.DXA }, borders: { top: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } }, children: [ new Paragraph({ children: [new TextRun({ text: 'Unterschrift Arbeitgeber / Datum', size: 18, color: '64748B' })] }) ] }),
        ]}),
      ],
    }),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });

  return await Packer.toBlob(doc);
}

/* ---------- PDF Export (jsPDF) ---------- */

function generatePdfBlob(report) {
  // jsPDF is loaded as window.jspdf.jsPDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 15;
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Arbeitszeitnachweis', marginX, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(`${report.employer.name} – ${formatMonthYear(report.ym)}`, marginX, y);
  y += 6;

  const empName = (state.settings.employeeName || '').trim();
  if (empName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const label = 'Arbeitnehmer/in: ';
    doc.setFont('helvetica', 'bold');
    const labelWidth = doc.getTextWidth(label);
    doc.text(label, marginX, y);
    doc.setFont('helvetica', 'normal');
    doc.text(empName, marginX + labelWidth + 1, y);
    y += 6;
  }

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, marginX, y);
  doc.setTextColor(0);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Zusammenfassung', marginX, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const pdfSummaryFields = getSummaryFields({
    workedMin: report.workedMin,
    targetMin: report.targetMin,
    balance: report.balance,
    vacationDays: report.vacationEntries.length,
    sickDays: report.sickEntries.length,
    hourlyRate: Number(report.employer.hourlyRate) || 0,
    currency: report.employer.currency || 'EUR',
  });
  const lines = renderSummaryPdfLines(pdfSummaryFields);
  for (const line of lines) { doc.text(line, marginX, y); y += 5; }

  if (!isFreelance()) {
    if (report.vacationEntries.length) {
      y += 1;
      const t = 'Urlaub: ' + report.vacationEntries.map(e => formatDate(e.date)).join(', ');
      y = wrapText(doc, t, marginX, y, 180);
    }
    if (report.sickEntries.length) {
      const t = 'Krankheit: ' + report.sickEntries.map(e => formatDate(e.date)).join(', ');
      y = wrapText(doc, t, marginX, y, 180);
    }
    if (report.holidays && report.holidays.length) {
      const t = 'Feiertage: ' + report.holidays.map(h => `${formatDate(h.date)} ${h.name}`).join(', ');
      y = wrapText(doc, t, marginX, y, 180);
    }
  }

  y += 4;

  const homeofficeEntries = report.homeofficeEntries || [];
  if (report.workEntries.length || homeofficeEntries.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Einzelnachweis', marginX, y);
    y += 3;

    const combinedRows = [
      ...report.workEntries.map(e => ({ e, isHO: false })),
      ...homeofficeEntries.map(e => ({ e, isHO: true })),
    ].sort((a, b) => a.e.date.localeCompare(b.e.date));

    const body = combinedRows.map(({ e, isHO }) => {
      if (isHO) {
        return [
          formatDateLong(e.date),
          'Home-Office',
          '—',
          minutesToHM(computeHomeofficeMinutes(e)),
          '',
          e.note || '',
        ];
      }
      return [
        formatDateLong(e.date),
        `${e.start}-${e.end}`,
        String(e.breakMinutes || 0),
        minutesToHM(computeWorkMinutes(e)),
        e.overtimeReason || '',
        e.note || '',
      ];
    });
    doc.autoTable({
      startY: y + 2,
      head: [['Datum', 'Zeit', 'Pause (Min)', 'Std.', 'Grund Überstunden', 'Bemerkung']],
      body,
      styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak', halign: 'left' },
      headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: 'bold', halign: 'left' },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 22 },
        2: { cellWidth: 16 },
        3: { cellWidth: 16 },
        4: { cellWidth: 45 },
        5: { cellWidth: 45 },
      },
      margin: { left: marginX, right: marginX },
    });
    y = doc.lastAutoTable.finalY + 6;

    if (homeofficeEntries.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`davon Home-Office: ${homeofficeEntries.length} ${homeofficeEntries.length === 1 ? 'Tag' : 'Tage'} · ${minutesToHM(report.homeofficeMin || 0)}`, marginX, y);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      y += 6;
    }
  }

  if (report.overtimeEntries.length) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Überstunden – Begründung', marginX, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    for (const e of report.overtimeEntries) {
      const t = `${formatDate(e.date)}: ${e.overtimeReason}`;
      y = wrapText(doc, t, marginX, y, 180);
      if (y > 270) { doc.addPage(); y = 20; }
    }
  }

  if (y > 250) { doc.addPage(); y = 20; }
  y += 15;
  const pageW = doc.internal.pageSize.getWidth();
  const usableW = pageW - marginX * 2;
  const sigLineW = 70;
  const leftX = marginX;
  const rightX = pageW - marginX - sigLineW;
  doc.setDrawColor(150);
  doc.line(leftX, y, leftX + sigLineW, y);
  doc.line(rightX, y, rightX + sigLineW, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(empName ? `${empName} – Unterschrift / Datum` : 'Unterschrift Arbeitnehmer / Datum', leftX, y);
  doc.text('Unterschrift Arbeitgeber / Datum', rightX, y);

  return doc.output('blob');
}

function wrapText(doc, text, x, y, maxWidth) {
  const split = doc.splitTextToSize(text, maxWidth);
  doc.text(split, x, y);
  return y + split.length * 5;
}

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
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 15;
  let y = 20;

  const ovFreelance = isFreelance();
  const ovEmpLabel = ovFreelance ? 'Kunde' : 'Arbeitgeber';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(ovFreelance ? 'Monatsübersicht – alle Kunden' : 'Monatsübersicht – alle Arbeitgeber', marginX, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(formatMonthYear(ov.ym), marginX, y);
  y += 6;

  const empName = (state.settings.employeeName || '').trim();
  if (empName) {
    doc.setFontSize(10);
    const label = 'Arbeitnehmer/in: ';
    doc.setFont('helvetica', 'bold');
    const labelWidth = doc.getTextWidth(label);
    doc.text(label, marginX, y);
    doc.setFont('helvetica', 'normal');
    doc.text(empName, marginX + labelWidth + 1, y);
    y += 6;
  }

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, marginX, y);
  doc.setTextColor(0);
  y += 8;

  if (!ov.rows.length) {
    doc.setFontSize(11);
    doc.text('Keine Einträge für diesen Monat.', marginX, y);
    return doc.output('blob');
  }

  let body, totalsRow, head, columnStyles, legend;
  if (ovFreelance) {
    const rowNet = (row) => {
      const rate = Number(row.employer.hourlyRate) || 0;
      if (rate <= 0) return '—';
      return formatMoney((row.workedMin / 60) * rate, row.employer.currency || 'EUR');
    };
    const totalsNet = ov.rows.reduce((acc, row) => {
      const rate = Number(row.employer.hourlyRate) || 0;
      if (rate <= 0) return acc;
      const cur = row.employer.currency || 'EUR';
      acc[cur] = (acc[cur] || 0) + (row.workedMin / 60) * rate;
      return acc;
    }, {});
    const totalsNetStr = Object.keys(totalsNet).length
      ? Object.entries(totalsNet).map(([cur, amt]) => formatMoney(amt, cur)).join(' · ')
      : '—';
    body = ov.rows.map(row => [
      row.employer.name,
      String(row.workEntriesCount),
      minutesToHM(row.workedMin),
      rowNet(row),
    ]);
    totalsRow = [
      'Gesamt',
      String(ov.totals.workEntriesCount),
      minutesToHM(ov.totals.workedMin),
      totalsNetStr,
    ];
    head = [[ovEmpLabel, 'Tage', 'Ist', 'Rechnungsbetrag']];
    columnStyles = {
      0: { cellWidth: 70 },
      1: { cellWidth: 20 },
      2: { cellWidth: 30 },
      3: { cellWidth: 60 },
    };
    legend = 'Ist = geleistete Arbeitszeit. Rechnungsbetrag = Ist × Stundensatz. Freelance-Modus: kein Soll/Saldo.';
  } else {
    body = ov.rows.map(row => [
      row.employer.name,
      String(row.workEntriesCount),
      minutesToHM(row.workedMin),
      minutesToHM(row.targetMin),
      `${row.balance >= 0 ? '+' : ''}${minutesToHM(row.balance)}`,
      String(row.vacationDays),
      String(row.sickDays),
    ]);
    totalsRow = [
      'Gesamt',
      String(ov.totals.workEntriesCount),
      minutesToHM(ov.totals.workedMin),
      minutesToHM(ov.totals.targetMin),
      `${ov.totals.balance >= 0 ? '+' : ''}${minutesToHM(ov.totals.balance)}`,
      String(ov.totals.vacationDays),
      String(ov.totals.sickDays),
    ];
    head = [[ovEmpLabel, 'Tage', 'Ist', 'Soll', 'Saldo', 'Urlaub', 'Krank']];
    columnStyles = {
      0: { cellWidth: 60 },
      1: { cellWidth: 16 },
      2: { cellWidth: 22 },
      3: { cellWidth: 22 },
      4: { cellWidth: 22 },
      5: { cellWidth: 18 },
      6: { cellWidth: 18 },
    };
    legend = 'Ist = geleistete Arbeitszeit. Soll = vertragliche Sollstunden inkl. Werktags- und Feiertagsberechnung. Saldo = Ist + gutgeschriebene Abwesenheiten - Soll.';
  }

  doc.autoTable({
    startY: y,
    head,
    body,
    foot: [totalsRow],
    styles: { fontSize: 10, cellPadding: 2.5, overflow: 'linebreak', halign: 'left' },
    headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: 'bold', halign: 'left' },
    footStyles: { fillColor: [226, 232, 240], textColor: 30, fontStyle: 'bold', halign: 'left' },
    columnStyles,
    margin: { left: marginX, right: marginX },
  });

  y = doc.lastAutoTable.finalY + 10;

  doc.setFontSize(9);
  doc.setTextColor(90);
  y = wrapText(doc, legend, marginX, y, 180);
  doc.setTextColor(0);

  return doc.output('blob');
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
  const ov = getCurrentOverview();
  if (!ov) return;
  try {
    const blob = generateOverviewPdfBlob(ov);
    const filename = fileNameForOverview(ov, 'pdf');
    const file = new File([blob], filename, { type: 'application/pdf' });
    const shareData = {
      title: `Arbeitszeit-Übersicht ${formatMonthYear(ov.ym)}`,
      text: `Monatsübersicht – alle Arbeitgeber – ${formatMonthYear(ov.ym)}`,
      files: [file],
    };
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share(shareData);
    } else {
      downloadBlob(blob, filename);
      toast('Datei heruntergeladen (Teilen wird nicht unterstützt)');
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error(err);
    toast('Teilen fehlgeschlagen: ' + err.message);
  }
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

function openShareModal() {
  const r = getCurrentReport();
  if (!r) return;
  const modal = document.getElementById('modal-share');
  const recipientList = document.getElementById('share-recipients');

  const emp = r.employer;
  const emailRecipients = [];
  const own = state.settings.ownEmail;
  if (own) emailRecipients.push({ label: 'An mich selbst', email: own, icon: '👤' });
  const contacts = (emp.contacts || []).filter(c => c.email);
  contacts.forEach(c => emailRecipients.push({ label: c.name || 'Ansprechpartner', email: c.email, icon: '📧' }));

  const cards = [];
  cards.push(`
    <div class="share-hint">Mehrere Empfänger möglich – die E-Mail-App öffnet sich mit allen Adressen im An-Feld.</div>
  `);
  cards.push(...emailRecipients.map((rc) => `
    <label class="recipient-card">
      <input type="checkbox" class="recipient-check" data-email="${escapeHtml(rc.email)}" />
      <div class="recipient-icon">${rc.icon}</div>
      <div class="recipient-info">
        <div class="recipient-name">${escapeHtml(rc.label)}</div>
        <div class="recipient-email">${escapeHtml(rc.email)}</div>
      </div>
    </label>
  `));

  cards.push(`
    <div class="recipient-manual">
      <label for="share-manual-emails" class="recipient-manual-label">Weitere E-Mail-Adressen (durch Komma getrennt)</label>
      <input type="text" id="share-manual-emails" placeholder="z. B. buero@firma.de, chef@firma.de" autocomplete="off" />
    </div>
  `);

  cards.push(`
    <label class="recipient-card recipient-system">
      <input type="radio" name="share-mode" id="share-mode-system" />
      <div class="recipient-icon">📤</div>
      <div class="recipient-info">
        <div class="recipient-name">Nur teilen (System-Dialog)</div>
        <div class="recipient-email">iOS/Android Teilen-Dialog – ohne E-Mail-Empfänger</div>
      </div>
    </label>
  `);

  recipientList.innerHTML = cards.join('');

  const systemRadio = document.getElementById('share-mode-system');
  const checks = recipientList.querySelectorAll('.recipient-check');
  if (systemRadio) {
    systemRadio.addEventListener('change', () => {
      if (systemRadio.checked) {
        checks.forEach(cb => cb.checked = false);
        const manual = document.getElementById('share-manual-emails');
        if (manual) manual.value = '';
      }
    });
  }
  checks.forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked && systemRadio) systemRadio.checked = false;
  }));
  const manualInput = document.getElementById('share-manual-emails');
  if (manualInput) manualInput.addEventListener('input', () => {
    if (manualInput.value.trim() && systemRadio) systemRadio.checked = false;
  });

  // Wire up the send button (replace to reset any previous listener)
  const sendBtn = document.getElementById('share-send-btn');
  if (sendBtn) {
    const clone = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(clone, sendBtn);
    clone.addEventListener('click', (evt) => {
      const useSystem = document.getElementById('share-mode-system')?.checked;
      const picked = Array.from(recipientList.querySelectorAll('.recipient-check:checked'))
        .map(cb => cb.dataset.email).filter(Boolean);
      const manualRaw = (document.getElementById('share-manual-emails')?.value || '').trim();
      const manual = manualRaw ? manualRaw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean) : [];
      const emails = Array.from(new Set([...picked, ...manual]));

      const format = document.querySelector('input[name="share-format"]:checked').value;

      if (!useSystem && emails.length === 0) {
        toast('Bitte mindestens einen Empfänger wählen oder „Nur teilen“ anklicken');
        return;
      }

      // iOS / iPadOS (any browser – all use WebKit) needs a TWO-STAGE flow.
      // Reason: WebKit has no sticky user activation, and combining a blob
      // download with a mailto: navigation in one click reliably breaks the
      // mailto call. We split it: first the user gets the file, THEN a second
      // click opens the mail app.
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        || /iPad|iPhone|iPod/i.test(navigator.userAgentData?.platform || '');

      if (!useSystem && emails.length > 0) {
        const r = getCurrentReport();
        if (!r) return;
        const filename = fileNameForReport(r, format);
        const subject = `Arbeitszeitnachweis ${formatMonthYear(r.ym)} – ${r.employer.name}`;
        const summaryLines = renderSummaryPlaintext(getSummaryFields({
          workedMin: r.workedMin,
          targetMin: r.targetMin,
          balance: r.balance,
          vacationDays: r.vacationEntries.length,
          sickDays: r.sickEntries.length,
          hourlyRate: Number(r.employer.hourlyRate) || 0,
          currency: r.employer.currency || 'EUR',
        }));
        const body =
`Sehr geehrte Damen und Herren,

anbei der Arbeitszeitnachweis für ${formatMonthYear(r.ym)}.

Zusammenfassung:
${summaryLines.join('\n')}

Mit freundlichen Grüßen`;
        const to = emails.map(encodeURIComponent).join(',');
        const mailto = `mailto:${to}`
          + `?subject=${encodeURIComponent(subject)}`
          + `&body=${encodeURIComponent(body + '\n\nBitte den Anhang „' + filename + '“ hinzufügen.')}`;

        if (isIOS) {
          // Two-stage flow: this click generates the file only. A second click
          // (on the newly-shown "E-Mail-App öffnen" button) navigates to mailto.
          (async () => {
            try {
              const blob = format === 'docx' ? await generateWordBlob(r) : generatePdfBlob(r);
              downloadBlob(blob, filename);
              // Swap the modal into stage 2
              showMailtoStage2(mailto, emails.length, filename);
            } catch (err) {
              console.error(err);
              toast('Datei-Erstellung fehlgeschlagen: ' + err.message);
            }
          })();
          return;
        }

        // Desktop / Android: one-stage flow. Mailto FIRST (synchronously in the
        // click handler), then blob generation + download afterwards.
        try { window.location.href = mailto; } catch (e) { console.warn('mailto failed', e); }
        (async () => {
          try {
            const blob = format === 'docx' ? await generateWordBlob(r) : generatePdfBlob(r);
            downloadBlob(blob, filename);
            toast(emails.length === 1
              ? 'E-Mail-App geöffnet – Datei heruntergeladen, bitte anhängen'
              : `E-Mail-App geöffnet mit ${emails.length} Empfängern – Datei heruntergeladen`);
          } catch (err) {
            console.error(err);
            toast('Datei-Erstellung fehlgeschlagen: ' + err.message);
          }
        })();
        closeModals();
        return;
      }

      // System-share path (no recipient): route through the existing async flow.
      closeModals();
      shareReport(format, []);
    });
  }

  modal.classList.remove('hidden');
}


function showMailtoStage2(mailto, count, filename) {
  const modal = document.getElementById('modal-share');
  const content = modal.querySelector('.modal-content');
  if (!content) return;
  const label = count === 1
    ? `Datei „${filename}“ heruntergeladen. Jetzt E-Mail-App öffnen und die Datei anhängen.`
    : `Datei „${filename}“ heruntergeladen. Jetzt öffnet sich die E-Mail-App mit ${count} Empfängern – bitte die Datei anhängen.`;
  content.innerHTML = `
    <div class="modal-header">
      <h3>Fast fertig</h3>
      <button class="modal-close" data-close-modal>✕</button>
    </div>
    <div class="mailto-stage2">
      <div class="mailto-stage2-icon">✉️</div>
      <p class="mailto-stage2-text">${label}</p>
      <a class="btn-primary mailto-stage2-btn" id="mailto-open-btn" href="${mailto.replace(/"/g, '&quot;')}">E-Mail-App öffnen</a>
      <button type="button" class="btn-secondary" data-close-modal>Fertig / Abbrechen</button>
    </div>
  `;
  // Re-bind close buttons (they were replaced)
  content.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModals());
  });
  // Ensure the anchor closes the modal after the click too
  const a = content.querySelector('#mailto-open-btn');
  if (a) {
    a.addEventListener('click', () => {
      // Give iOS a moment to launch Mail, then close
      setTimeout(() => closeModals(), 300);
    });
  }
}

async function shareReport(format, recipientEmails) {
  const r = getCurrentReport();
  if (!r) return;

  // Normalize: accept array, string, or empty
  const emails = Array.isArray(recipientEmails)
    ? recipientEmails.filter(Boolean)
    : (recipientEmails ? [recipientEmails] : []);

  let blob, filename, mimeType;
  try {
    if (format === 'docx') {
      blob = await generateWordBlob(r);
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      filename = fileNameForReport(r, 'docx');
    } else {
      blob = generatePdfBlob(r);
      mimeType = 'application/pdf';
      filename = fileNameForReport(r, 'pdf');
    }
  } catch (err) {
    console.error(err); toast('Erstellung fehlgeschlagen: ' + err.message); return;
  }

  const subject = `Arbeitszeitnachweis ${formatMonthYear(r.ym)} – ${r.employer.name}`;
  const summaryLines2 = renderSummaryPlaintext(getSummaryFields({
    workedMin: r.workedMin,
    targetMin: r.targetMin,
    balance: r.balance,
    vacationDays: r.vacationEntries.length,
    sickDays: r.sickEntries.length,
    hourlyRate: Number(r.employer.hourlyRate) || 0,
    currency: r.employer.currency || 'EUR',
  }));
  const body =
`Sehr geehrte Damen und Herren,

anbei der Arbeitszeitnachweis für ${formatMonthYear(r.ym)}.

Zusammenfassung:
${summaryLines2.join('\n')}

Mit freundlichen Grüßen`;

  // With recipients: open the mail program in the SAME user gesture, then download.
  // Doing download-first + setTimeout(location) was silently blocked on Chrome/Edge/iOS.
  if (emails.length > 0) {
    const to = emails.map(encodeURIComponent).join(',');
    const mailto = `mailto:${to}`
      + `?subject=${encodeURIComponent(subject)}`
      + `&body=${encodeURIComponent(body + '\n\nBitte den Anhang „' + filename + '“ hinzufügen.')}`;

    // Anchor click is more reliable than location.href for mailto on iOS + desktop
    const a = document.createElement('a');
    a.href = mailto;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Then trigger the download in the same synchronous tick
    downloadBlob(blob, filename);

    toast(emails.length === 1
      ? 'E-Mail-App öffnet sich – Datei heruntergeladen, bitte anhängen'
      : `E-Mail-App öffnet mit ${emails.length} Empfängern – Datei heruntergeladen`);
    return;
  }

  // No recipient → Web Share API (system share sheet on iOS/Android)
  const file = new File([blob], filename, { type: mimeType });
  const shareData = { title: subject, text: body, files: [file] };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share(shareData);
      toast('Geteilt');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('Web Share failed, falling back', err);
    }
  }

  // Last-resort fallback: plain download
  downloadBlob(blob, filename);
  toast(`Datei „${filename}“ heruntergeladen`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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

function buildScheduleGrid(schedule) {
  const container = document.getElementById('schedule-grid');
  container.innerHTML = DAY_KEYS.map((k, i) => {
    const s = schedule[k] || { enabled: false, start: '', end: '', break: 0 };
    return `
      <div class="schedule-day" data-day="${k}">
        <div class="day-label">
          <label style="display:flex;align-items:center;gap:0.35rem;font-weight:600;">
            <input type="checkbox" class="day-toggle" ${s.enabled ? 'checked' : ''} />
            ${DAY_LABELS[i]}
          </label>
        </div>
        <input type="time" class="day-start" value="${s.start || ''}" ${s.enabled ? '' : 'disabled'} />
        <input type="time" class="day-end" value="${s.end || ''}" ${s.enabled ? '' : 'disabled'} />
        <input type="number" class="day-break" min="0" value="${s.break || 0}" style="width: 4rem;" placeholder="Pause" title="Pause in Minuten" ${s.enabled ? '' : 'disabled'} />
      </div>
    `;
  }).join('');

  container.querySelectorAll('.schedule-day').forEach(row => {
    const toggle = row.querySelector('.day-toggle');
    toggle.addEventListener('change', () => {
      row.querySelectorAll('input[type="time"], input[type="number"]').forEach(inp => inp.disabled = !toggle.checked);
    });
  });
}

function readScheduleFromGrid() {
  const rows = document.querySelectorAll('#schedule-grid .schedule-day');
  const schedule = {};
  rows.forEach(row => {
    const k = row.dataset.day;
    schedule[k] = {
      enabled: row.querySelector('.day-toggle').checked,
      start: row.querySelector('.day-start').value,
      end: row.querySelector('.day-end').value,
      break: parseInt(row.querySelector('.day-break').value) || 0,
    };
  });
  return schedule;
}

function openEmployerModal(emp) {
  const modal = document.getElementById('modal-employer');
  const isNew = !emp;
  document.getElementById('modal-employer-title').textContent = isNew ? L('newEmployer') : L('editEmployer');
  const e = emp || {
    id: '', name: '', color: '#3b82f6', phone: '',
    contacts: [{ name:'', email:'' }, { name:'', email:'' }],
    hoursMode: 'week', weeklyHours: 40, monthlyHours: 160,
    breakMode: 'legal', annualVacation: 0,
    hourlyRate: 0, currency: (state.settings && state.settings.currency) || 'EUR',
    schedule: defaultSchedule(40),
    notes: '',
  };
  document.getElementById('employer-id').value = e.id;
  document.getElementById('employer-name').value = e.name;
  document.getElementById('employer-color').value = e.color;
  document.getElementById('employer-phone').value = e.phone || '';
  const contacts = e.contacts || [];
  document.getElementById('employer-contact1-name').value = contacts[0]?.name || '';
  document.getElementById('employer-contact1-email').value = contacts[0]?.email || '';
  document.getElementById('employer-contact2-name').value = contacts[1]?.name || '';
  document.getElementById('employer-contact2-email').value = contacts[1]?.email || '';
  document.getElementById('employer-hours-mode').value = e.hoursMode || 'week';
  document.getElementById('employer-weekly-hours').value = e.weeklyHours || 40;
  document.getElementById('employer-monthly-hours').value = e.monthlyHours || 160;
  document.getElementById('employer-break-mode').value = e.breakMode || 'legal';
  document.getElementById('employer-annual-vacation').value = e.annualVacation || 0;
  document.getElementById('employer-notes').value = e.notes || '';
  const rateEl = document.getElementById('employer-hourly-rate');
  if (rateEl) rateEl.value = e.hourlyRate ? String(e.hourlyRate) : '';
  const curEl = document.getElementById('employer-currency');
  if (curEl) curEl.value = e.currency || (state.settings && state.settings.currency) || 'EUR';
  // Namens-Label und Abrechnungs-Sichtbarkeit dem aktuellen Modus anpassen
  const nameLbl = document.querySelector('label[for="employer-name"]');
  if (nameLbl) nameLbl.textContent = L('employerName');
  document.getElementById('fs-employer-billing').classList.toggle('hidden', !isFreelance());
  buildScheduleGrid(e.schedule || defaultSchedule(e.weeklyHours || 40));
  updateHoursModeVisibility();
  document.getElementById('btn-delete-employer').classList.toggle('hidden', isNew);
  modal.classList.remove('hidden');
}

function updateHoursModeVisibility() {
  const mode = document.getElementById('employer-hours-mode').value;
  document.getElementById('row-weekly-hours').style.display = mode === 'week' ? '' : 'none';
  document.getElementById('row-monthly-hours').style.display = mode === 'month' ? '' : 'none';
}

function saveEmployer(ev) {
  ev.preventDefault();
  const id = document.getElementById('employer-id').value;
  const data = {
    name: document.getElementById('employer-name').value.trim(),
    color: document.getElementById('employer-color').value,
    phone: document.getElementById('employer-phone').value.trim(),
    contacts: [
      {
        name: document.getElementById('employer-contact1-name').value.trim(),
        email: document.getElementById('employer-contact1-email').value.trim(),
      },
      {
        name: document.getElementById('employer-contact2-name').value.trim(),
        email: document.getElementById('employer-contact2-email').value.trim(),
      },
    ],
    hoursMode: document.getElementById('employer-hours-mode').value,
    weeklyHours: parseFloat(document.getElementById('employer-weekly-hours').value) || 0,
    monthlyHours: parseFloat(document.getElementById('employer-monthly-hours').value) || 0,
    breakMode: document.getElementById('employer-break-mode').value,
    annualVacation: parseInt(document.getElementById('employer-annual-vacation').value) || 0,
    hourlyRate: parseFloat(document.getElementById('employer-hourly-rate')?.value) || 0,
    currency: document.getElementById('employer-currency')?.value || 'EUR',
    schedule: readScheduleFromGrid(),
    notes: document.getElementById('employer-notes').value.trim(),
  };
  if (!data.name) { toast('Bitte Namen eingeben'); return; }
  if (id) {
    const idx = state.employers.findIndex(e => e.id === id);
    if (idx >= 0) state.employers[idx] = { ...state.employers[idx], ...data };
  } else {
    const newEmp = { id: uid(), ...data };
    state.employers.push(newEmp);
    if (!state.activeEmployerId) state.activeEmployerId = newEmp.id;
  }
  saveState();
  closeModals();
  renderEmployers();
  renderTracker();
  toast('Gespeichert');
}

function deleteEmployer() {
  const id = document.getElementById('employer-id').value;
  if (!id) return;
  const emp = getEmployer(id);
  const hasEntries = state.entries.some(e => e.employerId === id);
  const msg = hasEntries
    ? `„${emp.name}" hat bereits Zeiteinträge. Diese werden mit gelöscht. Fortfahren?`
    : `Arbeitgeber „${emp.name}" wirklich löschen?`;
  if (!confirm(msg)) return;
  state.employers = state.employers.filter(e => e.id !== id);
  state.entries = state.entries.filter(e => e.employerId !== id);
  if (state.activeEmployerId === id) state.activeEmployerId = state.employers[0]?.id || null;
  if (state.runningTimer?.employerId === id) state.runningTimer = null;
  saveState();
  closeModals();
  renderEmployers();
  renderTracker();
  toast('Gelöscht');
}

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

/* ---------- Holiday Overrides UI ---------- */

function ensureHolidayOverrides() {
  state.settings.holidayOverrides = normalizeHolidayOverrides(state.settings.holidayOverrides);
  return state.settings.holidayOverrides;
}

/* Compute the plain (non-overridden) holidays for a year and stateCode. */
function getBaseHolidays(year, stateCode) {
  const list = [];
  const easter = easterSunday(year);
  list.push({ date: `${year}-01-01`, name: 'Neujahr' });
  list.push({ date: dateISO(addDays(easter, -2)), name: 'Karfreitag' });
  list.push({ date: dateISO(addDays(easter, 1)),  name: 'Ostermontag' });
  list.push({ date: `${year}-05-01`, name: 'Tag der Arbeit' });
  list.push({ date: dateISO(addDays(easter, 39)), name: 'Christi Himmelfahrt' });
  list.push({ date: dateISO(addDays(easter, 50)), name: 'Pfingstmontag' });
  list.push({ date: `${year}-10-03`, name: 'Tag der Deutschen Einheit' });
  list.push({ date: `${year}-12-25`, name: '1. Weihnachtsfeiertag' });
  list.push({ date: `${year}-12-26`, name: '2. Weihnachtsfeiertag' });
  if (['BW','BY','ST'].includes(stateCode)) list.push({ date: `${year}-01-06`, name: 'Heilige Drei Könige' });
  if (stateCode === 'BE' && year >= 2019) list.push({ date: `${year}-03-08`, name: 'Internationaler Frauentag' });
  if (stateCode === 'MV' && year >= 2023) list.push({ date: `${year}-03-08`, name: 'Internationaler Frauentag' });
  if (['BW','BY','HE','NW','RP','SL','SN','TH'].includes(stateCode)) list.push({ date: dateISO(addDays(easter, 60)), name: 'Fronleichnam' });
  if (['SL','BY'].includes(stateCode)) list.push({ date: `${year}-08-15`, name: 'Mariä Himmelfahrt' });
  if (stateCode === 'TH' && year >= 2019) list.push({ date: `${year}-09-20`, name: 'Weltkindertag' });
  if (year === 2017) {
    list.push({ date: `${year}-10-31`, name: 'Reformationstag' });
  } else {
    const refStates = ['BB','MV','SN','ST','TH','HB','HH','NI','SH'];
    if (refStates.includes(stateCode)) list.push({ date: `${year}-10-31`, name: 'Reformationstag' });
  }
  if (['BW','BY','NW','RP','SL'].includes(stateCode)) list.push({ date: `${year}-11-01`, name: 'Allerheiligen' });
  if (stateCode === 'SN') {
    const nov23 = new Date(year, 10, 23);
    const dow = nov23.getDay();
    const diff = ((dow - 3 + 7) % 7) || 7;
    list.push({ date: dateISO(addDays(nov23, -diff)), name: 'Buß- und Bettag' });
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

function renderHolidayList() {
  const container = document.getElementById('holiday-list');
  if (!container) return;
  const stateCode = state.settings.state || 'HE';
  const yearInput = document.getElementById('holiday-year');
  const year = Math.max(1900, Math.min(2100, parseInt(yearInput?.value || new Date().getFullYear(), 10) || new Date().getFullYear()));
  const ov = ensureHolidayOverrides();

  const base = getBaseHolidays(year, stateCode);
  const rows = base.map(h => {
    const disabled = ov.disable.includes(h.date);
    const renamedTo = ov.rename[h.date] || null;
    return {
      kind: 'base',
      date: h.date,
      original: h.name,
      display: disabled ? h.name : (renamedTo || h.name),
      disabled,
      renamed: !!renamedTo,
    };
  });
  const yearPrefix = `${year}-`;
  ov.add
    .filter(x => x.date.startsWith(yearPrefix) && (!x.stateCode || x.stateCode === stateCode))
    .forEach(x => rows.push({ kind: 'custom', date: x.date, display: x.name, stateCode: x.stateCode || '' }));
  rows.sort((a, b) => a.date.localeCompare(b.date));

  if (!rows.length) {
    container.innerHTML = '<div class="empty-state" style="padding:1rem;">Keine Feiertage in diesem Jahr.</div>';
    return;
  }

  container.innerHTML = rows.map(r => {
    const dateLabel = formatDate(r.date);
    if (r.kind === 'base') {
      const badges = [];
      if (r.disabled) badges.push('<span class="holiday-tag holiday-tag-disabled">deaktiviert</span>');
      if (r.renamed && !r.disabled) badges.push('<span class="holiday-tag holiday-tag-renamed">umbenannt</span>');
      const actions = r.disabled
        ? `<button type="button" class="btn-secondary btn-small" data-holiday-action="enable" data-date="${r.date}">Aktivieren</button>`
        : `<button type="button" class="btn-secondary btn-small" data-holiday-action="rename" data-date="${r.date}">Umbenennen</button>
           <button type="button" class="btn-secondary btn-small" data-holiday-action="disable" data-date="${r.date}">Deaktivieren</button>`;
      const resetBtn = (r.renamed || r.disabled)
        ? `<button type="button" class="btn-secondary btn-small" data-holiday-action="reset" data-date="${r.date}">Zurücksetzen</button>`
        : '';
      return `
        <div class="holiday-row ${r.disabled ? 'is-disabled' : ''}">
          <div class="holiday-main">
            <div class="holiday-date">${dateLabel}</div>
            <div class="holiday-name">${escapeHtml(r.display)} ${badges.join(' ')}</div>
          </div>
          <div class="holiday-actions">${actions} ${resetBtn}</div>
        </div>`;
    }
    return `
      <div class="holiday-row is-custom">
        <div class="holiday-main">
          <div class="holiday-date">${dateLabel}</div>
          <div class="holiday-name">${escapeHtml(r.display)} <span class="holiday-tag holiday-tag-custom">${r.stateCode ? escapeHtml(r.stateCode) : 'eigener'}</span></div>
        </div>
        <div class="holiday-actions">
          <button type="button" class="btn-secondary btn-small" data-holiday-action="edit-custom" data-date="${r.date}">Bearbeiten</button>
          <button type="button" class="btn-secondary btn-small" data-holiday-action="delete-custom" data-date="${r.date}">Löschen</button>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('[data-holiday-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-holiday-action');
      const date = btn.getAttribute('data-date');
      handleHolidayAction(action, date);
    });
  });
}

function handleHolidayAction(action, date) {
  const ov = ensureHolidayOverrides();
  if (action === 'disable') {
    if (!ov.disable.includes(date)) ov.disable.push(date);
    saveState(); renderHolidayList();
    toast('Feiertag deaktiviert');
  } else if (action === 'enable') {
    ov.disable = ov.disable.filter(d => d !== date);
    saveState(); renderHolidayList();
    toast('Feiertag wieder aktiv');
  } else if (action === 'reset') {
    ov.disable = ov.disable.filter(d => d !== date);
    delete ov.rename[date];
    saveState(); renderHolidayList();
    toast('Zurückgesetzt');
  } else if (action === 'rename') {
    const current = ov.rename[date] || (getBaseHolidays(Number(date.slice(0,4)), state.settings.state || 'HE').find(h => h.date === date)?.name || '');
    const next = prompt('Neue Bezeichnung:', current);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) { delete ov.rename[date]; } else { ov.rename[date] = trimmed.slice(0, 60); }
    saveState(); renderHolidayList();
    toast('Umbenannt');
  } else if (action === 'delete-custom') {
    if (!confirm('Diesen Feiertag löschen?')) return;
    ov.add = ov.add.filter(x => x.date !== date);
    saveState(); renderHolidayList();
    toast('Gelöscht');
  } else if (action === 'edit-custom') {
    const existing = ov.add.find(x => x.date === date);
    if (existing) openHolidayModal(existing);
  }
}

function openHolidayModal(existing) {
  const modal = document.getElementById('modal-holiday');
  document.getElementById('modal-holiday-title').textContent = existing ? 'Feiertag bearbeiten' : 'Feiertag hinzufügen';
  document.getElementById('holiday-original-date').value = existing?.date || '';
  document.getElementById('holiday-date').value = existing?.date || `${document.getElementById('holiday-year').value}-01-01`;
  document.getElementById('holiday-name').value = existing?.name || '';
  document.getElementById('holiday-state').value = existing?.stateCode || '';
  modal.classList.remove('hidden');
}

function saveHoliday(ev) {
  ev.preventDefault();
  const originalDate = document.getElementById('holiday-original-date').value;
  const date = document.getElementById('holiday-date').value;
  const name = document.getElementById('holiday-name').value.trim();
  const stateCode = document.getElementById('holiday-state').value || '';
  if (!date || !name) { toast('Datum und Bezeichnung angeben'); return; }
  const ov = ensureHolidayOverrides();
  if (originalDate) {
    const idx = ov.add.findIndex(x => x.date === originalDate);
    if (idx >= 0) ov.add[idx] = { date, name: name.slice(0, 60), stateCode };
    else ov.add.push({ date, name: name.slice(0, 60), stateCode });
  } else {
    if (ov.add.some(x => x.date === date && (x.stateCode || '') === stateCode)) {
      toast('Existiert bereits');
      return;
    }
    ov.add.push({ date, name: name.slice(0, 60), stateCode });
  }
  saveState();
  closeModals();
  renderHolidayList();
  toast('Gespeichert');
}

function renderTemplates() {
  const container = document.getElementById('templates-list');
  if (!state.templates.length) {
    container.innerHTML = '<div class="empty-state" style="padding:1rem;">Keine Vorlagen.</div>';
    return;
  }
  container.innerHTML = state.templates.map(t => {
    const scope = t.scope || 'both';
    const scopeLabel = scope === 'employee' ? 'Nur Angestellt' : scope === 'freelance' ? 'Nur Freiberuflich' : 'Beide Modi';
    const scopeCls = `tpl-scope tpl-scope-${scope}`;
    return `
    <div class="template-card" data-id="${t.id}">
      <div class="template-body" data-role="edit">
        <div class="label">${escapeHtml(t.label)} <span class="${scopeCls}">${scopeLabel}</span></div>
        <div class="preview">${escapeHtml(t.text)}</div>
      </div>
      <button type="button" class="template-delete" data-role="delete" aria-label="Vorlage löschen" title="Vorlage löschen">✕</button>
    </div>
  `;
  }).join('');
  container.querySelectorAll('.template-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('[data-role="edit"]').addEventListener('click', () => {
      openTemplateModal(state.templates.find(t => t.id === id));
    });
    card.querySelector('[data-role="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      const tpl = state.templates.find(t => t.id === id);
      if (!tpl) return;
      if (!confirm(`Vorlage „${tpl.label}“ wirklich löschen?`)) return;
      state.templates = state.templates.filter(t => t.id !== id);
      saveState();
      renderTemplates();
      toast('Vorlage gelöscht');
    });
  });
}

function openTemplateModal(tpl) {
  const modal = document.getElementById('modal-template');
  const isNew = !tpl;
  document.getElementById('modal-template-title').textContent = isNew ? 'Neue Vorlage' : 'Vorlage bearbeiten';
  document.getElementById('template-id').value = tpl?.id || '';
  document.getElementById('template-label').value = tpl?.label || '';
  document.getElementById('template-text').value = tpl?.text || '';
  // Vor-Belegung des Scope-Feldes: bestehende Vorlage übernehmen; bei neuer Vorlage sinnvoller Default
  const scopeSel = document.getElementById('template-scope');
  if (scopeSel) {
    if (isNew) {
      // Beim Neuanlegen im Freelance-Modus 'freelance' vorschlagen, sonst 'both'
      scopeSel.value = isFreelance() ? 'freelance' : 'both';
    } else {
      const s = tpl.scope;
      scopeSel.value = (s === 'employee' || s === 'freelance') ? s : 'both';
    }
  }
  document.getElementById('btn-delete-template').classList.toggle('hidden', isNew);
  modal.classList.remove('hidden');
}

function saveTemplate(ev) {
  ev.preventDefault();
  const id = document.getElementById('template-id').value;
  const scopeVal = document.getElementById('template-scope')?.value;
  const scope = (scopeVal === 'employee' || scopeVal === 'freelance') ? scopeVal : 'both';
  const data = {
    label: document.getElementById('template-label').value.trim(),
    text: document.getElementById('template-text').value.trim(),
    scope,
  };
  if (!data.label || !data.text) { toast('Bitte Bezeichnung und Text angeben'); return; }
  if (id) {
    const idx = state.templates.findIndex(t => t.id === id);
    if (idx >= 0) state.templates[idx] = { ...state.templates[idx], ...data };
  } else {
    state.templates.push({ id: uid(), ...data });
  }
  saveState();
  closeModals();
  renderTemplates();
  toast('Gespeichert');
}

function deleteTemplate() {
  const id = document.getElementById('template-id').value;
  if (!id) return;
  if (!confirm('Vorlage löschen?')) return;
  state.templates = state.templates.filter(t => t.id !== id);
  saveState();
  closeModals();
  renderTemplates();
  toast('Gelöscht');
}

/* ---------- Backup ---------- */

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `arbeitszeit-backup-${todayISO()}.json`);
  toast('Backup heruntergeladen');
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.employers || !Array.isArray(data.employers)) throw new Error('Ungültiges Format');
      if (!confirm('Aktuelle Daten überschreiben?')) return;
      const imported = {
        ...DEFAULT_STATE,
        ...data,
        settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) },
      };
      imported.settings.holidayOverrides = normalizeHolidayOverrides(imported.settings.holidayOverrides);
      _setState(imported);
      state = _getState();
      if (typeof window !== 'undefined') window.state = state;
      saveState();
      renderTracker(); renderEntries(); renderEmployers(); renderArchive(); renderSettings();
      toast('Backup importiert');
    } catch (e) {
      toast('Import fehlgeschlagen: ' + e.message);
    }
  };
  reader.readAsText(file);
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

document.addEventListener('DOMContentLoaded', () => {
  // Tab nav
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

  // Tracker
  document.getElementById('active-employer').addEventListener('change', (e) => {
    if (state.runningTimer) { toast('Nicht möglich während laufender Zeiterfassung'); e.target.value = state.activeEmployerId; return; }
    state.activeEmployerId = e.target.value;
    saveState();
    renderTracker();
  });
  document.getElementById('btn-start').addEventListener('click', startWork);
  document.getElementById('btn-end').addEventListener('click', endWork);
  document.getElementById('btn-add-manual').addEventListener('click', () => openEntryModal(null, { presetType: 'work' }));
  document.getElementById('btn-add-absence').addEventListener('click', () => openEntryModal(null, { presetType: 'vacation' }));

  // Mode-Toggle (Präsenz / Home-Office)
  const modeP = document.getElementById('mode-praesenz');
  const modeH = document.getElementById('mode-homeoffice');
  if (modeP) modeP.addEventListener('click', () => {
    if (state.runningTimer) { toast('Nicht möglich während laufender Zeiterfassung'); return; }
    setMode('praesenz');
  });
  if (modeH) modeH.addEventListener('click', () => {
    if (state.runningTimer) { toast('Nicht möglich während laufender Zeiterfassung'); return; }
    setMode('homeoffice');
  });

  // Home-Office Modal
  const btnAddHO = document.getElementById('btn-add-homeoffice');
  if (btnAddHO) btnAddHO.addEventListener('click', () => openHomeofficeModal(null, {}));
  const formHO = document.getElementById('form-homeoffice');
  if (formHO) formHO.addEventListener('submit', saveHomeoffice);
  const btnDelHO = document.getElementById('btn-delete-homeoffice');
  if (btnDelHO) btnDelHO.addEventListener('click', deleteHomeoffice);
  const btnHoAdd = document.getElementById('btn-ho-add-segment');
  if (btnHoAdd) btnHoAdd.addEventListener('click', addHomeofficeSegment);
  const hoEmpSel = document.getElementById('ho-employer');
  const hoDateInput = document.getElementById('ho-date');
  if (hoEmpSel) hoEmpSel.addEventListener('change', updateHomeofficeContext);
  if (hoDateInput) hoDateInput.addEventListener('change', updateHomeofficeContext);
  const hoSegments = document.getElementById('ho-segments');
  if (hoSegments) {
    // Delegation: Segment entfernen
    hoSegments.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-segment]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.removeSegment, 10);
      if (!Number.isNaN(idx)) removeHomeofficeSegment(idx);
    });
    // Delegation: Live-Total bei Input-Änderung
    hoSegments.addEventListener('input', (e) => {
      if (e.target.matches('input[type="time"]')) updateHomeofficeLiveTotal();
    });
    hoSegments.addEventListener('change', (e) => {
      if (e.target.matches('input[type="time"]')) updateHomeofficeLiveTotal();
    });
  }

  // Entry modal
  document.getElementById('form-entry').addEventListener('submit', saveEntry);
  document.getElementById('btn-delete-entry').addEventListener('click', deleteEntry);
  document.getElementById('entry-type').addEventListener('change', updateEntryTypeFields);
  document.getElementById('entry-employer').addEventListener('change', () => { updateScheduleFillVisibility(); updateBreakHint(); });
  document.getElementById('entry-date').addEventListener('change', updateScheduleFillVisibility);
  document.getElementById('btn-apply-schedule').addEventListener('click', applyScheduleToEntry);
  ['entry-start', 'entry-end'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      const empId = document.getElementById('entry-employer').value;
      const emp = getEmployer(empId);
      const start = document.getElementById('entry-start').value;
      const end = document.getElementById('entry-end').value;
      if (emp && start && end && emp.breakMode !== 'manual' && emp.breakMode !== 'none') {
        const suggested = computeSuggestedBreak(start, end, emp.breakMode);
        if (suggested !== null && (emp.breakMode === 'legal' || parseInt(document.getElementById('entry-break').value) === 0)) {
          document.getElementById('entry-break').value = suggested;
        }
      }
      updateBreakHint();
    });
  });

  // Template pickers in entry form
  document.querySelectorAll('.template-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const val = e.target.value;
      if (!val) return;
      const targetId = e.target.dataset.target;
      const targetEl = document.getElementById(targetId);
      const current = targetEl.value.trim();
      targetEl.value = current ? `${current}\n${val}` : val;
      e.target.value = '';
      targetEl.focus();
    });
  });

  // Employer modal
  document.getElementById('btn-add-employer').addEventListener('click', () => openEmployerModal(null));
  document.getElementById('form-employer').addEventListener('submit', saveEmployer);
  document.getElementById('btn-delete-employer').addEventListener('click', deleteEmployer);
  document.getElementById('employer-hours-mode').addEventListener('change', updateHoursModeVisibility);

  // Template modal
  document.getElementById('btn-add-template').addEventListener('click', () => openTemplateModal(null));
  document.getElementById('form-template').addEventListener('submit', saveTemplate);
  document.getElementById('btn-delete-template').addEventListener('click', deleteTemplate);

  // Filters
  document.getElementById('filter-employer').addEventListener('change', renderEntries);
  document.getElementById('filter-month').addEventListener('change', renderEntries);
  document.getElementById('week-employer').addEventListener('change', renderWeek);
  installWeekInputFallback(); // iOS Safari has no native week picker
  document.getElementById('week-input').addEventListener('change', renderWeek);
  document.getElementById('report-employer').addEventListener('change', renderReport);
  document.getElementById('report-month').addEventListener('change', renderReport);
  document.getElementById('overview-month').addEventListener('change', renderOverview);

  // Report actions
  document.getElementById('btn-export-word').addEventListener('click', exportWord);
  document.getElementById('btn-export-pdf').addEventListener('click', exportPdf);
  document.getElementById('btn-share').addEventListener('click', openShareModal);
  document.getElementById('btn-archive-month').addEventListener('click', archiveCurrentMonth);

  // Overview actions
  document.getElementById('btn-export-overview-pdf').addEventListener('click', exportOverviewPdf);
  document.getElementById('btn-share-overview').addEventListener('click', shareOverviewPdf);

  // Settings
  document.getElementById('setting-employee-name').addEventListener('change', (e) => {
    state.settings.employeeName = e.target.value.trim(); saveState();
  });
  document.getElementById('setting-own-email').addEventListener('change', (e) => {
    state.settings.ownEmail = e.target.value.trim(); saveState();
  });
  document.getElementById('setting-state').addEventListener('change', (e) => {
    state.settings.state = e.target.value; saveState();
    // Recompute if any view depends on it
    renderTracker();
    renderHolidayList();
  });

  // Modus-Umschalter
  document.querySelectorAll('input[name="setting-app-mode"]').forEach((r) => {
    r.addEventListener('change', (e) => {
      if (!e.target.checked) return;
      state.settings.appMode = e.target.value === 'freelance' ? 'freelance' : 'employee';
      saveState();
      updateModeVisibility();
      // Views neu rendern, da Labels sich ändern können
      renderTracker();
      renderEmployers();
      renderEntries();
      renderTemplates();
      if (typeof renderOverview === 'function') { try { renderOverview(); } catch (err) {} }
    });
  });

  // Holiday overrides
  const holidayYear = document.getElementById('holiday-year');
  if (holidayYear) holidayYear.addEventListener('change', renderHolidayList);
  const addHolidayBtn = document.getElementById('btn-add-holiday-override');
  if (addHolidayBtn) addHolidayBtn.addEventListener('click', () => openHolidayModal(null));
  const formHoliday = document.getElementById('form-holiday');
  if (formHoliday) formHoliday.addEventListener('submit', saveHoliday);

  // Backup
  document.getElementById('btn-export-backup').addEventListener('click', exportBackup);
  document.getElementById('btn-import-backup').addEventListener('click', () => document.getElementById('input-backup-file').click());
  document.getElementById('input-backup-file').addEventListener('change', (e) => {
    if (e.target.files[0]) importBackup(e.target.files[0]);
    e.target.value = '';
  });

  // Close modal
  document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeModals));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', (e) => {
    if (e.target === m) closeModals();
  }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

  // Warn if not persistent
  if (!storage.isPersistent) {
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#fef3c7;color:#92400e;padding:0.65rem 1rem;font-size:0.85rem;text-align:center;border-bottom:1px solid #fbbf24;';
    banner.innerHTML = '⚠️ Vorschaumodus – Daten werden nur während der Sitzung behalten. Auf dem Handy/Tablet installiert bleiben Daten dauerhaft gespeichert.';
    document.body.insertBefore(banner, document.body.firstChild);
  }

  renderTracker();
  updateModeVisibility();

  // Show what's new on first start of a new version
  maybeShowWhatsNew();

  registerServiceWorkerWithUpdatePrompt();

  // Update banner buttons
  const btnLater = document.getElementById('btn-update-later');
  const btnNow = document.getElementById('btn-update-now');
  if (btnLater) btnLater.addEventListener('click', hideUpdateBanner);
  if (btnNow) btnNow.addEventListener('click', activateWaitingServiceWorker);
});

/* ---------- What's New ---------- */

function maybeShowWhatsNew() {
  let lastSeen = null;
  try { lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY); } catch (e) { /* ignore */ }
  if (lastSeen === APP_VERSION) return;
  const container = document.getElementById('whatsnew-content');
  const modal = document.getElementById('modal-whatsnew');
  if (!container || !modal) return;
  // Show entries up to and including the new version, since last seen
  const entries = lastSeen
    ? CHANGELOG.filter(c => compareVersions(c.version, lastSeen) > 0)
    : CHANGELOG.slice(0, 1); // First install: only current version
  if (!entries.length) {
    try { localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION); } catch (e) {}
    return;
  }
  container.innerHTML = entries.map(e => `
    <div class="whatsnew-block">
      <div class="whatsnew-version">Version ${escapeHtml(e.version)}</div>
      <ul class="whatsnew-list">
        ${e.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
      </ul>
    </div>
  `).join('');
  modal.classList.remove('hidden');
  const markSeen = () => {
    try { localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION); } catch (e) {}
  };
  // Mark seen on any close action
  modal.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', markSeen, { once: true }));
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0, db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

/* ---------- Service Worker with Update Prompt ----------
 *
 * Update-Strategie:
 * 1. SW registrieren. Wenn beim Load bereits ein waiting-Worker vorhanden ist,
 *    Banner zeigen.
 * 2. "Später" versteckt nur den Banner — keinen Reload. Beim nächsten
 *    App-Start greift entweder erneut der waiting-Check oder das What's-New-
 *    Modal (Version-Vergleich über APP_VERSION vs. lastSeenVersion).
 * 3. Der reg.update()-Aufruf auf visibilitychange löst KEIN automatisches Reload
 *    mehr aus — der controllerchange-Reload wird nur getriggert, wenn der User
 *    explizit "Jetzt aktualisieren" gedrückt hat. Damit gibt es keinen
 *    unerwarteten Neustart mit Blackscreen, wenn die App aus dem Hintergrund
 *    zurückkommt.
 * 4. Wenn beim Zurückkommen aus dem Hintergrund ein neuer waiting-SW
 *    installiert wird, zeigen wir den Banner — nicht mehr, nicht weniger.
 */

let __swWaitingRegistration = null;
let __swUserRequestedActivation = false;

function registerServiceWorkerWithUpdatePrompt() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    // A waiting worker is already available at load time
    if (reg.waiting && navigator.serviceWorker.controller) {
      __swWaitingRegistration = reg;
      showUpdateBanner();
    }
    // A new worker starts installing (kann auch nach visibilitychange->reg.update() passieren)
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          __swWaitingRegistration = reg;
          showUpdateBanner();
        }
      });
    });
    // Poll for updates on visibility change (helps on iOS PWA)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        reg.update().catch(() => {});
      }
    });
  }).catch(err => console.warn('SW registration failed:', err));

  // Reload NUR wenn der User explizit "Jetzt aktualisieren" gedrückt hat.
  // Ohne diese Bedingung entstehen unerwartete Reloads beim App-Wechsel auf iOS.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    if (!__swUserRequestedActivation) return;
    reloading = true;
    window.location.reload();
  });
}

function showUpdateBanner() {
  const el = document.getElementById('update-banner');
  if (el) el.classList.remove('hidden');
}

function hideUpdateBanner() {
  const el = document.getElementById('update-banner');
  if (el) el.classList.add('hidden');
}

function activateWaitingServiceWorker() {
  __swUserRequestedActivation = true;
  const reg = __swWaitingRegistration;
  if (!reg || !reg.waiting) {
    // Kein waiting mehr — kann passieren, wenn iOS den SW zwischenzeitlich selbst aktiviert hat.
    // In diesem Fall: einfach neu laden, damit die neueste Version aus dem SW-Cache greift.
    hideUpdateBanner();
    window.location.reload();
    return;
  }
  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
}

/* ---------- Module-Scope Compatibility Bridge (Phase 3.1) ----------
   Da app.js jetzt als type=module lädt, sind Top-Level-Deklarationen NICHT mehr
   automatisch am window. Damit Regression-Skripte (page.evaluate) und alle
   Legacy-Inline-Handler in index.html weiterhin funktionieren, exponieren
   wir die relevanten Symbole explizit. Dieser Block wird in Phase 3.8
   (app.js als reiner Einstiegspunkt) durch saubere Modul-Exporte ersetzt. */
if (typeof window !== 'undefined') {
  // State + Persistenz
  window.state = state;
  window.saveState = saveState;
  window.loadState = loadState;
  window.SCHEMA_VERSION = SCHEMA_VERSION;
  window.DEFAULT_STATE = DEFAULT_STATE;
  window.STORAGE_KEY = STORAGE_KEY;

  // Migrations (für Regression-Unit-Tests)
  window.runMigrations = (s) => {
    // Regression ruft runMigrations(s) ohne helpers auf — helpers hier injizieren
    // (funktioniert wie in der alten Bundle-Welt, wo migrations[] uid/normalizeSegments
    // aus dem umschließenden Scope zog).
    // eslint-disable-next-line no-undef
    return _runMigrationsWithHelpers(s);
  };
  window.migrateHomeofficeEntries = migrateHomeofficeEntries;

  // Selectors + Utilities für Regression
  if (typeof getSummaryFields === 'function') window.getSummaryFields = getSummaryFields;
  if (typeof getOverviewSummaryFields === 'function') window.getOverviewSummaryFields = getOverviewSummaryFields;
  if (typeof renderSummaryHTML === 'function') window.renderSummaryHTML = renderSummaryHTML;
  if (typeof renderSummaryPdfLines === 'function') window.renderSummaryPdfLines = renderSummaryPdfLines;
  if (typeof renderSummaryWordParagraphs === 'function') window.renderSummaryWordParagraphs = renderSummaryWordParagraphs;
  if (typeof renderSummaryPlaintext === 'function') window.renderSummaryPlaintext = renderSummaryPlaintext;
  if (typeof getEmployer === 'function') window.getEmployer = getEmployer;
  if (typeof getCurrentReport === 'function') window.getCurrentReport = getCurrentReport;
  if (typeof getCurrentOverview === 'function') window.getCurrentOverview = getCurrentOverview;
  if (typeof uid === 'function') window.uid = uid;
  if (typeof normalizeSegments === 'function') window.normalizeSegments = normalizeSegments;
  if (typeof normalizeHolidayOverrides === 'function') window.normalizeHolidayOverrides = normalizeHolidayOverrides;
  if (typeof getHolidays === 'function') window.getHolidays = getHolidays;
  if (typeof getHolidaysInRange === 'function') window.getHolidaysInRange = getHolidaysInRange;
  if (typeof isHoliday === 'function') window.isHoliday = isHoliday;
  if (typeof easterSunday === 'function') window.easterSunday = easterSunday;
  if (typeof applyHolidayOverrides === 'function') window.applyHolidayOverrides = applyHolidayOverrides;

  // Rendering + Views
  if (typeof switchView === 'function') window.switchView = switchView;
  if (typeof renderReport === 'function') window.renderReport = renderReport;
  if (typeof renderTracker === 'function') window.renderTracker = renderTracker;
  if (typeof renderEntries === 'function') window.renderEntries = renderEntries;
  if (typeof renderEmployers === 'function') window.renderEmployers = renderEmployers;
  if (typeof renderArchive === 'function') window.renderArchive = renderArchive;
  if (typeof renderSettings === 'function') window.renderSettings = renderSettings;

  // Compute + Export für Regression
  if (typeof DAY_KEYS !== 'undefined') window.DAY_KEYS = DAY_KEYS;
  if (typeof DAY_LABELS !== 'undefined') window.DAY_LABELS = DAY_LABELS;
  if (typeof DAY_LABELS_LONG !== 'undefined') window.DAY_LABELS_LONG = DAY_LABELS_LONG;
  if (typeof computeWorkMinutes === 'function') window.computeWorkMinutes = computeWorkMinutes;
  if (typeof computeHomeofficeMinutes === 'function') window.computeHomeofficeMinutes = computeHomeofficeMinutes;
  if (typeof isWorkedEntry === 'function') window.isWorkedEntry = isWorkedEntry;
  if (typeof legalBreakMinutes === 'function') window.legalBreakMinutes = legalBreakMinutes;
  if (typeof computeSuggestedBreak === 'function') window.computeSuggestedBreak = computeSuggestedBreak;
  if (typeof defaultSchedule === 'function') window.defaultSchedule = defaultSchedule;
  if (typeof computeMonthTargetMinutes === 'function') window.computeMonthTargetMinutes = computeMonthTargetMinutes;
  if (typeof computeWeekTargetMinutes === 'function') window.computeWeekTargetMinutes = computeWeekTargetMinutes;
  if (typeof countWorkdaysInMonth === 'function') window.countWorkdaysInMonth = countWorkdaysInMonth;
  if (typeof computeMonthReport === 'function') window.computeMonthReport = computeMonthReport;
  if (typeof computeMonthOverview === 'function') window.computeMonthOverview = computeMonthOverview;
  if (typeof generatePdfBlob === 'function') window.generatePdfBlob = generatePdfBlob;
  if (typeof generateOverviewPdfBlob === 'function') window.generateOverviewPdfBlob = generateOverviewPdfBlob;
  if (typeof generateWordBlob === 'function') window.generateWordBlob = generateWordBlob;
}

// Interne Version von runMigrations, die uid+normalizeSegments injiziert.
// Wird vom window.runMigrations-Adapter oben aufgerufen.
function _runMigrationsWithHelpers(s) {
  // Import ist am Modul-Kopf; hier nur den Aufruf durchreichen
  // (dynamischer Import würde eine Promise liefern — deshalb der Named-Import).
  return _runMigrationsModule(s, { uid, normalizeSegments });
}
