/**
 * modules/constants.js
 *
 * App-weite Konstanten (Phase 3.10a, aus app.js extrahiert).
 *
 * - APP_VERSION: aktuelle Version, wird im Header-Badge angezeigt und für
 *   das What's-New-Modal genutzt (compareVersions gegen LAST_SEEN_VERSION_KEY).
 * - LAST_SEEN_VERSION_KEY: localStorage-Schlüssel für die zuletzt gesehene Version.
 * - CHANGELOG: chronologische Liste (neueste oben) für What's-New und Info-Modal.
 * - LABELS: Terminologie-Mapping employee/freelance (Arbeitgeber vs. Kunde etc.).
 *   Wird von L() in app.js über getAppMode() gelesen.
 */

export const APP_VERSION = '3.9.21';
export const LAST_SEEN_VERSION_KEY = 'arbeitszeit_last_seen_version';

/* Changelog: keep newest on top. Shown once per new version. */
export const CHANGELOG = [
  { version: '3.9.21', items: [
      'Phase 4.8: Selector-Prinzip komplettiert',
      'computeEntryRows in modules/selectors.js — Row-Compute raus aus render/entries.js',
      'computeFormFields in modules/selectors.js — Modal-Feld-Regeln als pure Funktion',
      'render/entries.js ist reiner HTML-Builder; ui/entry-modal.js liest nur noch Feld-Definitionen',
      'Kein Verhaltens-Unterschied, 51/51 Regression grün',
    ] },
  { version: '3.9.20', items: [
      'Modul-Split Phase 3.10b: modules/bootstrap.js',
      'wireEvents(ctx) kapselt alle ~200 Zeilen addEventListener-Wiring',
      'DOMContentLoaded-Registrar bleibt in app.js (defer-Semantik von type=module)',
      'app.js: 171 Zeilen weniger — jetzt unter 1400 Zeilen',
    ] },
  { version: '3.9.19', items: [
      'Modul-Split Phase 3.10a: modules/constants.js',
      'APP_VERSION, LAST_SEEN_VERSION_KEY, CHANGELOG und LABELS in eigenes Modul',
      'app.js: 219 Zeilen weniger',
    ] },
  { version: '3.9.18', items: [
      'Modul-Split Phase 3.9i: modules/regression-bridge.js',
      'exportBridge(target, refs) kapselt alle window.*-Assignments für Regression und Legacy-Inline-Handler',
      'Modul-Split-Roadmap komplett: 20 Module extrahiert, app.js von ~2900 auf 1963 Zeilen (−32%)',
    ] },
  { version: '3.9.17', items: [
      'Modul-Split Phase 3.9h: modules/ui/templates.js',
      'templateMatchesMode, populateTemplatePicker, renderTemplates, openTemplateModal, saveTemplate, deleteTemplate als pure Funktionen mit ctx-DI',
    ] },
  { version: '3.9.16', items: [
      'Modul-Split Phase 3.9g: modules/ui/holiday-overrides.js',
      'ensureHolidayOverrides, getBaseHolidays, renderHolidayList, handleHolidayAction, openHolidayModal, saveHoliday als pure Funktionen mit ctx-DI',
    ] },
  { version: '3.9.15', items: [
      'Modul-Split Phase 3.9f: modules/ui/employer-modal.js',
      'openEmployerModal, saveEmployer, deleteEmployer sowie Wochenplan-Grid (build/read) und updateHoursModeVisibility als pure Funktionen mit ctx-DI',
    ] },
  { version: '3.9.14', items: [
      'Modul-Split Phase 3.9e: modules/ui/homeoffice-modal.js',
      'openHomeofficeModal, saveHomeoffice, deleteHomeoffice und alle Segment-Helfer als pure Funktionen mit ctx-DI',
    ] },
  { version: '3.9.13', items: [
      'Modul-Split Phase 3.9d: modules/ui/entry-modal.js',
      'openEntryModal, saveEntry, deleteEntry und Helfer als pure Funktionen mit ctx-DI',
    ] },
  { version: '3.9.12', items: [
      'Modul-Split Phase 3.9c: modules/share.js',
      'openShareModal, showMailtoStage2, shareReport, shareOverviewPdf als pure Funktionen mit ctx-DI',
    ] },
  { version: '3.9.11', items: [
      'Modul-Split Phase 3.9b: modules/backup.js',
      'JSON-Backup Export/Import in eigenes Modul mit ctx-DI + onImport-Callback',
    ] },
  { version: '3.9.10', items: [
      'Modul-Split Phase 3.9a: modules/whatsnew.js',
      'maybeShowWhatsNew + compareVersions als pure Funktionen mit ctx-DI extrahiert',
      'app.js: What\'s-New-Block auf duennen Wrapper reduziert',
      'Keine Verhaltensaenderung, 51/51 Regression-Checks gruen',
    ] },
  { version: '3.9.9', items: [
      'Modul-Split Phase 3.8: modules/sw-update.js',
      'Service-Worker-Registration + Update-Banner + Activation gekapselt in initServiceWorkerUpdates',
      'app.js: SW-Block auf einen Modul-Import und einen Setup-Aufruf reduziert',
      'Keine Verhaltensaenderung, 51/51 Regression-Checks gruen',
    ] },
  { version: '3.9.8', items: [
      'Modul-Split Phase 3.7: modules/export/word.js, pdf.js, overview-pdf.js, download.js',
      'generateWordBlob, generatePdfBlob, generateOverviewPdfBlob sind pure Funktionen mit ctx-DI',
      'downloadBlob als Re-Export aus modules/export/download.js',
      'app.js: Exporter auf duenne Wrapper reduziert',
      'Keine Verhaltensaenderung, 51/51 Regression-Checks gruen',
    ] },
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

/* Label-Mapping für Angestellten- vs. Freiberufler-Modus. */
export const LABELS = {
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
