// v3.15.x: Ein Modul je Reiter (Roadmap 3 Stufe 2).
//   TAB1  Module in modules/tabs/: kein Import von app.js, kein window.state,
//         Zugriff nur über toAppContext(ctx)
//   TAB2  Verschobene Funktionen sind in app.js nur noch Einzeiler
//   TAB3  window.renderXyz der Testbrücke zeichnet über das neue Modul
//   TAB4  app.js bleibt unter der Obergrenze des Releases
//   TAB5  Jedes Reiter-Modul steht in der ASSETS-Liste von sw.js
// Dazu Funktionsprüfungen der verschobenen Reiter mit den Testdaten von
// Max Mustermann (scripts/fixtures/test-backup-muster.json):
//   v3.15.1  E1–E5 Einträge, A1–A6 Archiv
//   v3.15.2  W1–W7 Woche, G1–G5 Gleitzeitkonto, KW1 isoWeekToDates
//   v3.15.3  U1–U5 Urlaubsplanung, Ü1–Ü6 Übersicht, B1 Sollstunden-Banner,
//            J1 Jahresauswahl (modules/ui/year-select.js)
//   v3.15.4  T1–T7 Erfassen, M1–M6 Monat, R1 Backup-Erinnerung
//            (modules/ui/backup-reminder-banner-ui.js)
//   v3.15.5  AG1–AG4 Arbeitgeber, ES1–ES5 Einstellungen, BK1–BK4 Backup
//            (modules/ui/backup-ui.js)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(REPO_ROOT, 'scripts', 'fixtures', 'test-backup-muster.json');

/** Obergrenze für app.js (Zeilen), sinkt je Release: 2.350 / 2.150 / 1.900 / 1.550 / 1.300. */
/** Maskiert alle Sonderzeichen für new RegExp (seit v3.15.10, CodeQL js/incomplete-sanitization). */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const APP_JS_MAX_LINES = 1300;

/** Verschobene Funktionen: Name in app.js → [Modul, Name des Exports]. */
export const MOVED = {
  renderArchive: ['modules/tabs/archive.js', 'renderArchive'],
  archiveCurrentMonth: ['modules/tabs/archive.js', 'archiveCurrentMonth'],
  renderEntries: ['modules/tabs/entries.js', 'renderEntries'],
  renderWeek: ['modules/tabs/week.js', 'renderWeek'],
  installWeekInputFallback: ['modules/tabs/week.js', 'installWeekInputFallback'],
  renderGleitzeitkonto: ['modules/tabs/gleitzeit.js', 'renderGleitzeitkonto'],
  getCurrentGleitzeitkonto: ['modules/tabs/gleitzeit.js', 'getCurrentGleitzeitkonto'],
  exportGleitzeitkontoPdf: ['modules/tabs/gleitzeit.js', 'exportGleitzeitkontoPdf'],
  renderVacationPlanning: ['modules/tabs/vacation.js', 'renderVacationPlanning'],
  renderOverview: ['modules/tabs/overview.js', 'renderOverview'],
  getCurrentOverview: ['modules/tabs/overview.js', 'getCurrentOverview'],
  exportOverviewPdf: ['modules/tabs/overview.js', 'exportOverviewPdf'],
  updateSollWarningBanner: ['modules/ui/soll-warning-banner-ui.js', 'updateSollWarningBanner'],
  renderTracker: ['modules/tabs/tracker.js', 'renderTracker'],
  startWork: ['modules/tabs/tracker.js', 'startWork'],
  endWork: ['modules/tabs/tracker.js', 'endWork'],
  setMode: ['modules/tabs/tracker.js', 'setMode'],
  renderReport: ['modules/tabs/report.js', 'renderReport'],
  getCurrentReport: ['modules/tabs/report.js', 'getCurrentReport'],
  exportPdf: ['modules/tabs/report.js', 'exportPdf'],
  exportWord: ['modules/tabs/report.js', 'exportWord'],
  exportCsv: ['modules/tabs/report.js', 'exportCsv'],
  exportKmPdf: ['modules/tabs/report.js', 'exportKmPdf'],
  updateBackupReminderBanner: ['modules/ui/backup-reminder-banner-ui.js', 'updateBackupReminderBanner'],
  renderEmployers: ['modules/tabs/employers.js', 'renderEmployers'],
  renderSettings: ['modules/tabs/settings.js', 'renderSettings'],
  updateModeVisibility: ['modules/tabs/settings.js', 'updateModeVisibility'],
  renderAuditLog: ['modules/tabs/settings.js', 'renderAuditLog'],
  exportBackup: ['modules/ui/backup-ui.js', 'exportBackup'],
  importBackup: ['modules/ui/backup-ui.js', 'importBackup'],
  restoreFromMirror: ['modules/ui/backup-ui.js', 'restoreFromMirror'],
  renderBackupFolderSection: ['modules/ui/backup-ui.js', 'renderBackupFolderSection'],
};

/** Funktionen, die ganz aus app.js verschwinden (jetzt in Modulen ohne Einzeiler). */
export const REMOVED = ['isoWeekToDates', 'supportsWeekInput', 'fileNameForGleitzeitkonto',
  'fileNameForOverview', 'computeSelectableYears', 'populateYearSelect', 'exportVacationCertificatePdf',
  'stepVacationCalendarMonth', 'wireVacationCalendarNav', 'renderVacationCalendarOnly',
  'startLiveTimer', 'stopLiveTimer', 'renderTodaySummary', 'fileNameForReport',
  'breakModeLabel', 'syncSollWarningSettingsUI', 'getUsableBackupFolderHandle', 'wireBackupFolderButtons',
  'handleChooseBackupFolder', 'handleConfirmBackupFolderAccess', 'importDeps'];

/** Variablen und Konstanten, die nur noch in Modulen liegen. */
export const REMOVED_NAMES = ['vacationCalendarYm', 'SOLL_WARNING_BANNER_TARGETS', 'liveTimerInterval', 'currentMode', 'BACKUP_REMINDER_TARGETS'];

const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function runSourceChecks(check) {
  const tabFiles = fs.readdirSync(path.join(REPO_ROOT, 'modules', 'tabs')).filter((f) => f.endsWith('.js')).map((f) => `modules/tabs/${f}`);
  check('TAB1 Reiter-Module vorhanden', tabFiles.length >= new Set(Object.values(MOVED).map(([m]) => m).filter((m) => m.startsWith('modules/tabs/'))).size, true);
  for (const rel of tabFiles) {
    const src = stripComments(read(rel));
    check(`TAB1 ${rel} ohne Import von app.js`, /from\s+['"][./]*app\.js['"]/.test(src), false);
    check(`TAB1 ${rel} ohne window.state`, /window\.state\b/.test(src), false);
    check(`TAB1 ${rel} nutzt toAppContext`, /import \{ toAppContext \} from '\.\.\/app-context\.js';/.test(src), true);
    check(`TAB1 ${rel} ohne flachen Zugriff ctx.name`, (src.match(/(?<![\w$.])ctx\.[A-Za-z_$]/g) || []).length, 0);
    check(`TAB1 ${rel} ohne flaches Auspacken von ctx`, (src.match(/\}\s*=\s*ctx\s*;/g) || []).length, 0);
  }
  const app = read('app.js');
  for (const [name, [rel, exp]] of Object.entries(MOVED)) {
    const m = app.match(new RegExp(`^function ${name}\\((\\w*)\\) \\{ return (_\\w+)\\(appCtx\\(\\)(?:, \\1)?\\); \\}$`, 'm'));
    check(`TAB2 ${name} in app.js nur Einzeiler`, !!m, true);
    const count = (app.match(new RegExp(`function ${name}\\s*\\(`, 'g')) || []).length;
    check(`TAB2 ${name} nur einmal in app.js`, count, 1);
    if (m) {
      const imp = new RegExp(`import \\{[^}]*\\b${exp} as ${m[2]}\\b[^}]*\\} from '\\./${escapeRegExp(rel)}';`);
      check(`TAB2 ${name} bindet ${rel} an`, imp.test(app), true);
    }
    check(`TAB2 ${rel} exportiert ${exp}`, new RegExp(`export (async )?function ${exp}\\(ctx[,)]`).test(read(rel)), true);
  }
  for (const name of REMOVED) check(`TAB2 ${name} nicht mehr in app.js`, new RegExp(`function ${name}\\s*\\(`).test(app), false);
  for (const name of REMOVED_NAMES) check(`TAB2 ${name} nicht mehr in app.js`, new RegExp(`\\b${name}\\b`).test(app), false);
  check('TAB2 fileNameForOverview kommt aus tabs/overview.js', /import \{[^}]*\bfileNameForOverview\b[^}]*\} from '\.\/modules\/tabs\/overview\.js';/.test(app), true);
  check('TAB2 fileNameForReport kommt aus tabs/report.js', /import \{[^}]*\bfileNameForReport\b[^}]*\} from '\.\/modules\/tabs\/report\.js';/.test(app), true);
  check('TAB2 CSV-Erzeuger bleibt in app.js und steht im Kontext', [/^function generateCsvBlob\(report\) \{$/m.test(app), /generatePdfBlob, generateWordBlob, generateCsvBlob,/.test(app)], [true, true]);
  check('TAB2 Jahresauswahl kommt aus ui/year-select.js', /populateYearSelect: \(selectEl, year\) => _populateYearSelectUi\(selectEl, year, _getState\(\)\)/.test(app), true);
  for (const rel of ['modules/ui/soll-warning-banner-ui.js', 'modules/ui/backup-reminder-banner-ui.js', 'modules/ui/backup-ui.js']) {
    const banner = stripComments(read(rel));
    check(`TAB1 ${rel} ohne Import von app.js und window.state`, [/from\s+['"][./]*app\.js['"]/.test(banner), /window\.state\b/.test(banner)], [false, false]);
  }
  check('TAB2 app.js ohne DOM-Ziele der verschobenen Reiter', ['archive-list', 'entries-list', 'filter-month', 'week-content', 'week-input', 'week-employer', 'gleitzeitkonto-content', 'gleitzeitkonto-year',
    'vacation-planning-content', 'vacation-planning-year', 'overview-content', 'overview-month', 'sollstunden-warning-list', 'sollstunden-warning-banner-overview',
    'today-summary', 'live-duration', 'btn-start', 'report-content', 'report-employer', 'backup-reminder-banner-tracker',
    'employers-list', 'employers-view-title', 'setting-employee-name', 'setting-own-email', 'audit-log-list', 'backup-folder-content', 'settings-block-state'].filter((id) => app.includes(`'${id}'`)), []);
  const lines = app.split('\n').length;
  check(`TAB4 app.js höchstens ${APP_JS_MAX_LINES} Zeilen (aktuell ${lines})`, lines <= APP_JS_MAX_LINES, true);
  const sw = read('sw.js');
  for (const rel of ['modules/ui/soll-warning-banner-ui.js', 'modules/ui/year-select.js', 'modules/ui/backup-reminder-banner-ui.js', 'modules/ui/backup-ui.js']) check(`TAB5 ${rel} in sw.js ASSETS`, sw.includes(`'./${rel}'`), true);
  for (const rel of tabFiles) check(`TAB5 ${rel} in sw.js ASSETS`, sw.includes(`'./${rel}'`), true);
}

export async function runTabsStructureTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.15.x: Ein Modul je Reiter ===');
  const check = (name, value, expected) => assertEq(`Reiter ${name}`, JSON.stringify(value), JSON.stringify(expected));
  runSourceChecks(check);

  // ---------- KW1: isoWeekToDates (seit v3.15.2 in util-time.js) ----------
  const T = await import('../modules/util-time.js');
  const span = (w) => { const d = T.isoWeekToDates(w); return [d.length, d[0], d[6]]; };
  check('KW1 2026-W15', span('2026-W15'), [7, '2026-04-06', '2026-04-12']);
  check('KW1 2026-W53 über den Jahreswechsel', span('2026-W53'), [7, '2026-12-28', '2027-01-03']);
  check('KW1 2027-W01 beginnt nach 2026-W53', span('2027-W01'), [7, '2027-01-04', '2027-01-10']);
  check('KW1 2020-W53 und 2021-W01', [span('2020-W53')[2], span('2021-W01')[1]], ['2021-01-03', '2021-01-04']);
  check('KW1 2025-W01 beginnt im Vorjahr', span('2025-W01')[1], '2024-12-30');
  const Y = await import('../modules/ui/year-select.js');
  check('J1 rein: laufendes und kommendes Jahr', Y.computeSelectableYears({}, 2026), [2027, 2026]);
  check('J1 rein: Beginn, Ende, Einträge, ohne Unsinn', Y.computeSelectableYears({ employers: [{ hiredSince: '2019-04-01', employmentEndDate: '2021-12-31' }, { hiredSince: 'x' }], entries: [{ date: '2023-05-02' }, { date: '1850-01-01' }, {}] }, 2026), [2027, 2026, 2023, 2021, 2019]);
  check('KW1 Wochenzahl 2026 und 2027', [T.isoWeeksInYear(2026), T.isoWeeksInYear(2027)], [53, 52]);

  const fixture = fs.readFileSync(FIXTURE, 'utf8');
  const context = await browser.newContext({ timezoneId: 'Europe/Berlin', locale: 'de-DE', serviceWorkers: 'block', acceptDownloads: true });
  await context.addInitScript((seed) => {
    localStorage.setItem('arbeitszeit_last_seen_version', '9.9.9');
    if (!sessionStorage.getItem('__tabs_seeded')) { sessionStorage.setItem('__tabs_seeded', '1'); localStorage.setItem('arbeitszeit_v1', seed); }
  }, fixture);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  page.on('pageerror', (e) => check(`Browserfehler: ${e.message}`, true, false));
  await page.clock.setFixedTime(new Date('2026-11-18T12:00:00+01:00'));
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => typeof window.renderTracker === 'function' && typeof window.__appCtx === 'function');
    await page.evaluate(() => document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')));

    // ---------- TAB3: Testbrücke zeichnet über die Module ----------
    const bridge = await page.evaluate(async () => {
      const A = await import('/modules/tabs/archive.js');
      const E = await import('/modules/tabs/entries.js');
      const ctx = window.__appCtx();
      return {
        render: [typeof ctx.render.archive, typeof ctx.render.gleitzeit, typeof ctx.render.vacation, typeof ctx.render.settings, typeof ctx.render.auditLog, typeof ctx.render.modeVisibility],
        backup: [typeof ctx.state.replace, typeof ctx.state.migrate, typeof ctx.data.defaultState],
        ui: [typeof ctx.ui.openHomeofficeModal, typeof ctx.ui.showFormerEmployers, typeof ctx.ui.setShowFormerEmployers],
        compute: [typeof ctx.compute.monthTargetMinutes, typeof ctx.compute.workdaysInMonth],
        exports: [typeof ctx.exports.kmPdf, typeof ctx.exports.gleitzeitPdf, typeof ctx.exports.vacationCertificatePdf],
        modules: [typeof A.renderArchive, typeof A.archiveCurrentMonth, typeof E.renderEntries],
        former: ctx.ui.showFormerEmployers(),
      };
    });
    check('TAB3 Kontext render', bridge.render, Array(6).fill('function'));
    check('TAB3 Kontext Backup-Import', bridge.backup, ['function', 'function', 'object']);
    check('TAB3 Kontext ui', bridge.ui, Array(3).fill('function'));
    check('TAB3 Kontext compute', bridge.compute, Array(2).fill('function'));
    check('TAB3 Kontext exports', bridge.exports, Array(3).fill('function'));
    check('TAB3 Module exportieren', bridge.modules, Array(3).fill('function'));
    check('TAB3 Ehemalige anzeigen anfangs aus', bridge.former, false);

    // ---------- Einträge ----------
    const expected = await page.evaluate(async () => {
      const C = await import('/modules/compute.js');
      const s = window.state; const today = '2026-11-18';
      const emp = s.employers[0];
      const former = s.employers.filter((e) => C.isFormerEmployer(e, today)).map((e) => e.id);
      const inMonth = (ym) => s.entries.filter((e) => e.date.startsWith(ym));
      return {
        empId: emp.id,
        empOct: inMonth('2026-10').filter((e) => e.employerId === emp.id).length,
        allOct: inMonth('2026-10').filter((e) => !former.includes(e.employerId)).length,
        allOctWithFormer: inMonth('2026-10').length,
        formerCount: former.length,
        firstHo: s.entries.find((e) => e.type === 'homeoffice' && e.date.startsWith('2026-10')),
      };
    });
    await page.evaluate(() => window.switchView('entries'));
    const cards = (sel) => page.evaluate((sel) => document.querySelectorAll(sel).length, sel);
    await page.evaluate(() => { document.getElementById('filter-month').value = '2026-10'; document.getElementById('filter-employer').value = ''; window.renderEntries(); });
    check('E1 Oktober alle aktiven Arbeitgeber', await cards('#entries-list .entry-card'), expected.allOct);
    await page.evaluate((id) => { document.getElementById('filter-employer').value = id; window.renderEntries(); }, expected.empId);
    check('E2 Oktober ein Arbeitgeber', await cards('#entries-list .entry-card'), expected.empOct);
    await page.evaluate(() => { document.getElementById('filter-employer').value = ''; window.setShowFormerEmployers(true); });
    check('E3 Ehemalige anzeigen über Kontext', [await page.evaluate(() => window.__appCtx().ui.showFormerEmployers()),
      await page.isChecked('#show-former-employers-entries'), await cards('#entries-list .entry-card')], [true, true, expected.allOctWithFormer]);
    check('E3 Testdaten enthalten ehemalige Arbeitgeber', expected.formerCount > 0, true);
    await page.evaluate(() => window.setShowFormerEmployers(false));
    check('E3 wieder aus', await page.isChecked('#show-former-employers-entries'), false);
    await page.evaluate(() => { document.getElementById('filter-month').value = '1999-01'; window.renderEntries(); });
    check('E4 leerer Zeitraum', (await page.textContent('#entries-list')).trim(), 'Keine Einträge in diesem Zeitraum.');
    if (expected.firstHo) {
      await page.evaluate(() => { document.getElementById('filter-month').value = '2026-10'; window.setShowFormerEmployers(true); });
      await page.click(`#entries-list .entry-card[data-id="${expected.firstHo.id}"]`);
      check('E5 Klick auf Home-Office öffnet Home-Office-Dialog', await page.isVisible('#modal-homeoffice'), true);
      await page.evaluate(() => { document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')); window.setShowFormerEmployers(false); });
    }
    const workId = await page.evaluate(() => {
      const w = window.state.entries.find((e) => e.type !== 'homeoffice');
      document.getElementById('filter-month').value = w.date.slice(0, 7);
      window.setShowFormerEmployers(true);
      document.getElementById('filter-employer').value = w.employerId;
      window.renderEntries();
      return w.id;
    });
    await page.click(`#entries-list .entry-card[data-id="${workId}"]`);
    const opened = await page.evaluate(() => ['modal-entry', 'modal-homeoffice'].filter((id) => !document.getElementById(id).classList.contains('hidden')));
    check('E5 Klick auf Arbeitszeit öffnet Erfassen-Dialog', opened, ['modal-entry']);
    await page.evaluate(() => { document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')); window.setShowFormerEmployers(false); });

    // ---------- Archiv ----------
    const before = await page.evaluate(() => window.state.archives.length);
    await page.evaluate((id) => {
      window.switchView('report');
      document.getElementById('report-employer').value = id;
      document.getElementById('report-month').value = '2026-10';
      window.renderReport();
    }, expected.empId);
    const ctxArchive = () => page.evaluate(async () => (await import('/modules/tabs/archive.js')).archiveCurrentMonth(window.__appCtx()));
    await ctxArchive();
    const a1 = await page.evaluate((id) => {
      const a = window.state.archives.filter((x) => x.employerId === id && x.yearMonth === '2026-10');
      return { n: window.state.archives.length, match: a.length, entries: a[0] && a[0].snapshot.entries.length, toast: document.getElementById('toast').textContent };
    }, expected.empId);
    check('A1 Monat archiviert', [a1.n, a1.match, a1.entries, a1.toast], [before + 1, 1, expected.empOct, 'Monat archiviert']);
    await ctxArchive();
    check('A2 erneut archivieren fragt und überschreibt', [dialogs.some((m) => m.includes('bereits ein Archiv')), await page.evaluate(() => window.state.archives.length)], [true, before + 1]);
    await page.evaluate(() => window.switchView('archive'));
    check('A3 Archivliste zeigt Monat', await cards('#archive-list button[data-action="pdf"]'), before + 1);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#archive-list button[data-action="pdf"]'),
    ]);
    check('A4 PDF aus dem Archiv', /\.pdf$/.test(download.suggestedFilename()), true);
    const archId = await page.evaluate((id) => window.state.archives.find((x) => x.employerId === id && x.yearMonth === '2026-10').id, expected.empId);
    await page.click(`#archive-list button[data-action="delete"][data-id="${archId}"]`);
    await page.waitForFunction((n) => window.state.archives.length === n, before);
    check('A5 Archiv gelöscht', [await page.evaluate(() => document.getElementById('toast').textContent), dialogs.includes('Archiv löschen?')], ['Archiv gelöscht', true]);
    if (before === 0) check('A6 leere Archivliste', (await page.textContent('#archive-list')).includes('Noch keine archivierten Monate.'), true);

    // ---------- Woche (v3.15.2) ----------
    const week = (w, emp) => page.evaluate(({ w, emp }) => {
      window.switchView('week');
      if (emp !== undefined) document.getElementById('week-employer').value = emp;
      document.getElementById('week-input').value = w;
      window.renderWeek();
      const box = document.getElementById('week-content');
      return {
        values: [...box.querySelectorAll('.summary-grid .summary-item .value')].map((v) => v.textContent.trim()),
        holidays: [...box.querySelectorAll('.holiday-badge')].map((b) => b.textContent),
        details: [...box.querySelectorAll('.day-detail')].map((d) => d.textContent),
        arbzg: box.querySelectorAll('.arbzg-week').length,
        text: box.textContent.replace(/\s+/g, ' ').trim(),
      };
    }, { w, emp });
    const active = await page.evaluate(() => window.state.activeEmployerId);
    const w15 = await week('2026-W15', active);
    check('W1 KW 15 Ist, Soll, Saldo, Feiertage', w15.values.slice(0, 4), ['31:58', '32:00', '-0:02', '1']);
    check('W1 KW 15 Ostermontag', w15.holidays, ['Ostermontag']);
    check('W1 KW 15 Home-Office am Dienstag', w15.details[1], 'Home-Office');
    const w22 = await week('2026-W22', active);
    check('W2 KW 22 Saldo mit Urlaub, ohne Gutschrift für Überstundenabbau', w22.values.slice(0, 3), ['24:11', '32:00', '+0:11']);
    check('W2 KW 22 Tageszeilen', [w22.details[1], w22.details[2]], ['Urlaub', 'Überstundenabbau']);
    check('W3 KW 36 Hinweise Arbeitszeitgesetz', (await week('2026-W36', active)).arbzg, 3);
    await page.evaluate(() => { window.state.settings.arbzgHintsEnabled = false; });
    check('W3 KW 36 Hinweise ausgeschaltet', (await week('2026-W36', active)).arbzg, 0);
    await page.evaluate(() => { delete window.state.settings.arbzgHintsEnabled; });
    const kmId = await page.evaluate((emp) => {
      const e = window.state.entries.find((x) => x.employerId === emp && x.date === '2026-09-01' && x.type === 'work');
      e.km = 42.5;
      return e.id;
    }, active);
    check('W4 ohne Außendienst keine Kilometer', (await week('2026-W36', active)).details[1].includes('km'), false);
    await page.evaluate((emp) => { window.state.settings.fieldService = { enabled: true, employerIds: [emp] }; }, active);
    check('W4 mit Außendienst Kilometer am Dienstag', (await week('2026-W36', active)).details[1], '08:05–16:36 · 42,5 km');
    await page.evaluate((id) => { delete window.state.settings.fieldService; delete window.state.entries.find((x) => x.id === id).km; }, kmId);
    const w5 = await page.evaluate(() => {
      const inp = document.getElementById('week-input'); const v = inp.value;
      const saved = window.state.employers; window.state.employers = [];
      document.getElementById('week-employer').value = ''; window.renderWeek();
      const t = document.getElementById('week-content').textContent.trim();
      window.state.employers = saved; inp.value = v; return t;
    });
    check('W5 ohne Arbeitgeber', w5, 'Bitte Arbeitgeber und Woche wählen.');
    const opts = () => page.evaluate(() => [...document.querySelectorAll('#week-employer option')].map((o) => o.textContent));
    await page.evaluate(() => { window.setShowFormerEmployers(false); });
    await week('2026-W36', active);
    const withoutFormer = await opts();
    await page.evaluate(() => { window.setShowFormerEmployers(true); });
    const withFormer = await opts();
    await page.evaluate(() => { window.setShowFormerEmployers(false); });
    check('W6 Ehemalige nur mit „Ehemalige anzeigen“',
      [withoutFormer.some((t) => t.includes('(ehemalig)')), withFormer.filter((t) => t.includes('(ehemalig)')).length], [false, expected.formerCount]);
    const fb = await page.evaluate(async () => {
      const W = await import('/modules/tabs/week.js');
      const inp = document.getElementById('week-input');
      const native = W.supportsWeekInput();
      const atStart = inp.dataset.fallback === 'true';
      W.installWeekInputFallback(window.__appCtx(), { force: true });
      W.installWeekInputFallback(window.__appCtx(), { force: true });
      const [y, w] = document.querySelector('.week-fallback').querySelectorAll('select');
      y.value = '2026'; y.dispatchEvent(new Event('change'));
      w.value = '15'; w.dispatchEvent(new Event('change'));
      const res = { native, atStart, type: inp.type, selects: document.querySelectorAll('.week-fallback').length, weeks2026: w.options.length, first: inp.value };
      w.value = '22'; w.dispatchEvent(new Event('change'));
      res.after = [inp.value, document.querySelector('#week-content .subtitle').textContent];
      return res;
    });
    check('W7 Ersatzauswahl beim Start genau dann, wenn kein Wochenfeld', fb.atStart, !fb.native);
    check('W7 Ersatzauswahl Jahr und KW', [fb.type, fb.selects, fb.weeks2026, fb.first], ['hidden', 1, 53, '2026-W15']);
    check('W7 Wechsel der KW zeichnet neu', fb.after, ['2026-W22', '2026-W22 • 25.05.2026 – 31.05.2026']);

    // ---------- Gleitzeitkonto (v3.15.2) ----------
    const gleit = (year) => page.evaluate((year) => {
      window.switchView('gleitzeitkonto');
      const sel = document.getElementById('gleitzeitkonto-year');
      if (year) { if (![...sel.options].some((o) => o.value === String(year))) sel.add(new Option(String(year), String(year))); sel.value = String(year); }
      window.renderGleitzeitkonto();
      const box = document.getElementById('gleitzeitkonto-content');
      const firstRow = box.querySelector('tbody tr');
      return {
        values: [...box.querySelectorAll('.summary-grid .summary-item .value')].map((v) => v.textContent.trim()),
        flagged: box.querySelectorAll('.sw-flagged').length,
        first: firstRow ? [...firstRow.querySelectorAll('td')].map((td) => td.textContent.trim()) : [],
        text: box.textContent.replace(/\s+/g, ' ').trim(),
      };
    }, year);
    const g26 = await gleit(2026);
    check('G1 Gleitzeitkonto 2026', [g26.values.includes('-3302:17'), g26.values.includes('1280:25'), g26.values.includes('2000:00')], [true, true, true]);
    check('G1 Januar 2026', g26.first, ['Januar 2026', '161:45', '168:00', '1:45', '-2940:57']);
    check('G2 Jahr 2023 beginnt im März', (await gleit(2023)).first[0], 'März 2023');
    check('G3 Warnung aus: kein Rahmen', (await gleit(2026)).flagged, 0);
    await page.evaluate(() => { window.state.settings.sollWarningGleitzeitEnabled = true; });
    check('G3 Warnung an: Rahmen an der Kachel', (await gleit(2026)).flagged, 1);
    await page.evaluate(() => { window.state.settings.sollWarningGleitzeitEnabled = false; });
    const cur = await page.evaluate(() => { const g = window.getCurrentGleitzeitkonto(); return [g.emp.name, g.meta.year, g.rows.length, g.meta.asOf.cumulativeBalance]; });
    check('G4 getCurrentGleitzeitkonto', cur, ['Musterfirma GmbH', 2026, 12, -198137]);
    const [gdl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-gleitzeitkonto-pdf')]);
    await page.waitForFunction(() => document.getElementById('toast').textContent === 'Gleitzeitkonto als PDF heruntergeladen');
    check('G4 Knopf PDF', gdl.suggestedFilename(), 'Arbeitszeit_Gleitzeitkonto_Musterfirma_GmbH_2026.pdf');
    const g5 = await page.evaluate(() => {
      const saved = [window.state.employers, window.state.activeEmployerId];
      window.state.employers = []; window.state.activeEmployerId = null;
      window.renderGleitzeitkonto();
      const t = document.getElementById('gleitzeitkonto-content').textContent.trim();
      [window.state.employers, window.state.activeEmployerId] = saved;
      window.renderGleitzeitkonto();
      return t;
    });
    check('G5 ohne Arbeitgeber', g5, 'Bitte zuerst einen Arbeitgeber anlegen.');

    // ---------- Urlaubsplanung (v3.15.3) ----------
    const vac = (year) => page.evaluate((year) => {
      window.switchView('vacation-planning');
      const sel = document.getElementById('vacation-planning-year');
      if (year) { if (![...sel.options].some((o) => o.value === String(year))) sel.add(new Option(String(year), String(year))); sel.value = String(year); }
      window.__appCtx().render.vacation();
      const box = document.getElementById('vacation-planning-content');
      const grids = [...box.querySelectorAll('.summary-grid')].map((g) => [...g.querySelectorAll('.summary-item .value')].map((v) => v.textContent.trim()));
      return {
        grids,
        month: (box.querySelector('.vac-cal-month-label') || {}).textContent,
        rows: [...box.querySelectorAll('table tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((t) => t.textContent.trim()).slice(0, 2).join(' ')),
        cert: !!document.getElementById('btn-export-vacation-certificate'),
        text: box.textContent.trim(),
      };
    }, year);
    const calLabel = () => page.textContent('#vacation-planning-content .vac-cal-month-label');
    const v26 = await vac(2026);
    check('U1 Urlaubsplanung 2026 Kacheln', v26.grids[0], ['28 Tage', '9 Tage', '0 Tage', '19 Tage']);
    check('U1 Bildungsurlaub 2026', [v26.grids[1][0], v26.grids[1][1], v26.grids[1][3]], ['5 Tage', '0 Tage', '5 Tage']);
    check('U1 Monatstabelle', v26.rows.filter((r) => !/ 0$/.test(r)), ['Januar 1', 'April 2', 'Mai 2', 'Juni 2', 'Juli 1', 'August 1', 'Gesamt 9']);
    check('U2 Kalender startet im November 2026', v26.month, 'November 2026');
    await page.click('#btn-vacation-calendar-prev');
    check('U2 ‹ zeigt Oktober', await calLabel(), 'Oktober 2026');
    check('U2 Kacheln bleiben stehen', (await vac()).grids[0][3], '19 Tage');
    for (let i = 0; i < 3; i++) await page.click('#btn-vacation-calendar-next');
    check('U2 › endet im Dezember', await calLabel(), 'Dezember 2026');
    for (let i = 0; i < 12; i++) await page.click('#btn-vacation-calendar-prev');
    check('U2 ‹ endet im Januar', await calLabel(), 'Januar 2026');
    check('U3 Jahr 2025 öffnet im Januar', (await vac(2025)).month, 'Januar 2025');
    check('U3 zurück zu 2026 öffnet im November', (await vac(2026)).month, 'November 2026');
    check('U4 ohne Beschäftigungsende kein Knopf', v26.cert, false);
    const formerId = await page.evaluate(() => {
      const e = window.state.employers.find((x) => x.name === 'Alte Softwareschmiede AG');
      window.state.activeEmployerId = e.id;
      return e.id;
    });
    check('U4 Knopf bei Beschäftigungsende', (await vac(2025)).cert, true);
    const [vdl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-vacation-certificate')]);
    await page.waitForFunction(() => document.getElementById('toast').textContent === 'Urlaubsbescheinigung als PDF heruntergeladen');
    check('U4 Urlaubsbescheinigung', [vdl.suggestedFilename(), formerId.length > 0], ['Urlaubsbescheinigung_Alte_Softwareschmiede_AG_2025.pdf', true]);
    await page.evaluate((id) => { window.state.activeEmployerId = id; }, expected.empId);
    const u5 = await page.evaluate(() => {
      const saved = [window.state.employers, window.state.activeEmployerId];
      window.state.employers = []; window.state.activeEmployerId = null;
      window.__appCtx().render.vacation();
      const t = document.getElementById('vacation-planning-content').textContent.trim();
      [window.state.employers, window.state.activeEmployerId] = saved;
      return t;
    });
    check('U5 ohne Arbeitgeber', u5, 'Bitte zuerst einen Arbeitgeber anlegen.');
    await vac(2026);

    // ---------- Übersicht (v3.15.3) ----------
    const ov = (ym) => page.evaluate((ym) => {
      window.switchView('overview');
      if (ym) document.getElementById('overview-month').value = ym;
      window.__appCtx().render.overview();
      const box = document.getElementById('overview-content');
      const h = box.querySelector('[data-testid="arbzg-overview"] h4');
      return {
        values: [...box.querySelectorAll('.summary-grid .summary-item .value')].map((v) => v.textContent.trim().replace(/\u00a0/g, ' ')),
        tips: [...box.querySelectorAll('.info-tooltip-content')].map((t) => t.textContent),
        rows: [...box.querySelectorAll('.overview-table > tbody > tr:not(.totals-row)')].map((tr) => tr.querySelector('td').textContent.trim()),
        arbzg: h ? h.textContent : null,
        text: box.textContent.trim(),
      };
    }, ym);
    const o9 = await ov('2026-09');
    check('Ü1 September 2026', o9.values.slice(0, 4), ['118:47', '287:45', '-168:58', '956,25 € · 476,67 CHF']);
    check('Ü1 Arbeitgeber September', o9.rows, ['Musterfirma GmbH', 'Teilzeit Logistik Nord', 'Studio Nordlicht', 'Alpine Design SA']);
    const o4 = await ov('2026-04');
    check('Ü2 April 2026', o4.values.slice(0, 4), ['230:47', '257:15', '+17:47', '1.618,75 € · 979,00 CHF']);
    check('Ü2 Erklärung Saldo', o4.tips.some((t) => t.includes('44:15 Std. Gutschrift für 3 Urlaubstage und 4 Krankheitstage')), true);
    check('Ü3 Hinweise Arbeitszeitgesetz', [o9.arbzg, o4.arbzg], ['Arbeitszeitgesetz: 5 Hinweise im September 2026', 'Arbeitszeitgesetz: 9 Hinweise im April 2026']);
    await page.evaluate(() => { window.state.settings.arbzgHintsEnabled = false; });
    check('Ü3 Hinweise ausgeschaltet', (await ov('2026-09')).arbzg, null);
    await page.evaluate(() => { delete window.state.settings.arbzgHintsEnabled; });
    const sharedOv = await page.evaluate(() => window.__appCtx().compute.currentOverview().rows.length);
    await page.evaluate(() => window.setShowFormerEmployers(true));
    const withFormerOv = await ov('2026-09');
    const sharedOvFormer = await page.evaluate(() => [window.__appCtx().compute.currentOverview().rows.length, document.getElementById('show-former-employers-overview').checked]);
    await page.evaluate(() => window.setShowFormerEmployers(false));
    check('Ü4 Ehemalige anzeigen', [o9.rows.length, withFormerOv.rows.length, (await ov('2026-09')).rows.length], [4, 4 + expected.formerCount, 4]);
    check('Ü4 Teilen und PDF nutzen denselben Stand', [sharedOv, ...sharedOvFormer], [4, 4 + expected.formerCount, true]);
    // Chromium meldet bei Umlauten im Dateinamen nur „download“, deshalb das download-Attribut prüfen.
    await page.evaluate(() => {
      const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { window.__lastDownloadName = this.download; HTMLAnchorElement.prototype.click = orig; return orig.call(this); };
    });
    await Promise.all([page.waitForEvent('download'), page.click('#btn-export-overview-pdf')]);
    await page.waitForFunction(() => document.getElementById('toast').textContent === 'Übersicht als PDF heruntergeladen');
    check('Ü5 Knopf PDF', await page.evaluate(() => window.__lastDownloadName), 'Arbeitszeit_Übersicht_2026-09.pdf');
    check('Ü5 Dateiname über den Kontext', await page.evaluate(() => window.__appCtx().format.fileNameForOverview({ ym: '2026-09' }, 'pdf')), 'Arbeitszeit_Übersicht_2026-09.pdf');
    const o6 = await page.evaluate(() => {
      const saved = window.state.employers;
      window.state.employers = [];
      window.__appCtx().render.overview();
      const t = document.getElementById('overview-content').textContent.trim();
      const cur = window.__appCtx().compute.currentOverview();
      const msg = document.getElementById('toast').textContent;
      window.state.employers = saved;
      window.__appCtx().render.overview();
      return [t, cur, msg];
    });
    check('Ü6 ohne Arbeitgeber', o6, ['Bitte zuerst einen Arbeitgeber anlegen.', null, 'Bitte zuerst einen Arbeitgeber anlegen']);

    // ---------- Sollstunden-Banner (v3.15.3) ----------
    const banner = () => page.evaluate(() => ['sollstunden-warning-banner', 'sollstunden-warning-banner-overview'].map((id) => {
      const b = document.getElementById(id);
      return { hidden: b.classList.contains('hidden'), list: b.querySelector('[id^="sollstunden-warning-list"]').innerHTML };
    }));
    check('B1 Warnung aus: Banner verborgen', (await banner()).map((b) => b.hidden), [true, true]);
    await page.evaluate(() => {
      Object.assign(window.state.settings, { sollWarningMonthEnabled: true, sollWarningGleitzeitEnabled: true });
      window.updateSollWarningBanner({ ym: '2026-09', year: 2026, today: '2026-09-30' });
    });
    const b1 = await banner();
    check('B1 Warnung an: beide Banner sichtbar mit gleichem Inhalt', [b1[0].hidden, b1[1].hidden, b1[0].list.length > 0, b1[0].list === b1[1].list], [false, false, true, true]);
    await page.click('#btn-sollwarning-snooze-overview');
    check('B1 Später erinnern blendet beide aus', (await banner()).map((b) => b.hidden), [true, true]);
    check('B1 Hinweis', await page.textContent('#toast'), 'Erinnerung für 7 Tage verschoben');
    await page.evaluate(() => {
      delete window.state.settings.sollWarningSnoozeUntil;
      Object.assign(window.state.settings, { sollWarningMonthEnabled: false, sollWarningGleitzeitEnabled: false });
      window.updateSollWarningBanner();
    });

    // ---------- Jahresauswahl (v3.15.3) ----------
    const j1 = await page.evaluate(async () => {
      const Y = await import('/modules/ui/year-select.js');
      const opts = (id) => [...document.querySelectorAll(`#${id} option`)].map((o) => Number(o.value));
      window.switchView('vacation-planning');
      const vac = opts('vacation-planning-year');
      window.switchView('gleitzeitkonto');
      return { pure: Y.computeSelectableYears(window.state, 2026), vac, gleit: opts('gleitzeitkonto-year') };
    });
    check('J1 Jahre aus den Testdaten', j1.pure, [2027, 2026, 2025, 2024, 2023, 2022]);
    check('J1 Urlaubsplanung und Gleitzeitkonto gleich', [j1.vac, j1.gleit], [j1.pure, j1.pure]);

    // ---------- Erfassen (v3.15.4) ----------
    const closeModals = () => page.evaluate(() => document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')));
    const tiles = () => page.evaluate(() => ({
      title: (document.querySelector('#today-summary h3') || {}).textContent,
      values: [...document.querySelectorAll('#today-summary .summary-item .value')].map((v) => v.textContent.trim()),
    }));
    const buttons = () => page.evaluate(() => [document.getElementById('btn-start').disabled, document.getElementById('btn-end').disabled]);
    const at = (iso) => page.clock.setFixedTime(new Date(iso));
    await at('2026-11-18T08:00:00+01:00');
    await page.evaluate(() => { window.state.runningTimer = null; window.switchView('tracker'); });
    const t1 = await tiles();
    check('T1 Kacheln November 2026', [t1.title, ...t1.values], ['Diesen Monat (November 2026)', '0:00', '168:00', '-168:00', '0 / 0', '0 Tage']);
    check('T1 Auswahl Arbeitgeber', await page.evaluate(() => [...document.querySelectorAll('#active-employer option')].map((o) => o.textContent)),
      ['Musterfirma GmbH', 'Teilzeit Logistik Nord', 'Studio Nordlicht', 'Alpine Design SA']);
    check('T1 Knöpfe beim Start', await buttons(), [false, true]);
    await page.click('#btn-start');
    check('T2 Start um 08:00', [await page.textContent('#toast'), await page.textContent('#live-time'), ...(await buttons())],
      ['Arbeitsbeginn erfasst', 'Musterfirma GmbH • 18.11., 08:00', true, false]);
    await at('2026-11-18T16:30:15+01:00');
    await page.waitForFunction(() => document.getElementById('live-duration').textContent === '08:30:15');
    check('T3 Sekundenanzeige', await page.textContent('#live-duration'), '08:30:15');
    const nEntries = await page.evaluate(() => window.state.entries.length);
    await page.click('#btn-end');
    const t2 = await page.evaluate(async () => {
      const e = window.state.entries.at(-1);
      const T = await import('/modules/tabs/tracker.js');
      return { e: [e.date, e.type, e.start, e.end, e.breakMinutes], n: window.state.entries.length, modal: !document.getElementById('modal-entry').classList.contains('hidden'),
        live: document.getElementById('live-status').classList.contains('hidden'), ticking: T.isLiveTimerRunning(), timer: window.state.runningTimer };
    });
    check('T2 Ende um 16:30', [t2.e, t2.n, t2.modal], [['2026-11-18', 'work', '08:00', '16:30', 30], nEntries + 1, true]);
    check('T3 nach Ende Anzeige verborgen und Uhr steht', [t2.live, t2.ticking, t2.timer], [true, false, null]);
    await closeModals();
    check('T2 Kacheln danach', (await tiles()).values.slice(0, 3), ['8:00', '168:00', '-160:00']);
    await at('2026-11-18T22:00:00+01:00');
    await page.click('#mode-homeoffice');
    await page.click('#btn-start');
    check('T4 Home-Office-Block gestartet', [await page.textContent('#toast'), await page.evaluate(() => window.state.runningTimer.type)], ['Home-Office-Block gestartet', 'homeoffice']);
    await at('2026-11-19T01:30:00+01:00');
    await page.click('#btn-end');
    const t4 = await page.evaluate(() => window.state.entries.filter((e) => e.type === 'homeoffice' && e.date >= '2026-11-18').map((e) => [e.date, e.segments]));
    check('T4 Home-Office über Mitternacht', [await page.textContent('#toast'), t4],
      ['Home-Office-Block auf 2 Tage verteilt gespeichert', [['2026-11-18', [{ start: '22:00', end: '24:00' }]], ['2026-11-19', [{ start: '00:00', end: '01:30' }]]]]);
    await at('2026-11-18T12:00:00+01:00');
    await page.evaluate(() => {
      window.state.entries = window.state.entries.filter((e) => !(e.date >= '2026-11-18' && e.createdAt && e.createdAt.startsWith('2026-11-1')));
      window.state.entries.push({ id: 'tst-vac-1118', employerId: window.state.activeEmployerId, date: '2026-11-18', type: 'vacation', note: '', createdAt: '2026-11-18T11:00:00.000Z' });
      window.switchView('tracker');
    });
    await page.click('#btn-start');
    check('T5 Abwesenheit am selben Tag', [await page.textContent('#toast'), await page.evaluate(() => window.state.runningTimer)],
      ['Für dieses Datum existiert bereits eine ganztägige Abwesenheit oder ein anderer Eintrag. Bitte zuerst löschen oder bearbeiten.', null]);
    await page.evaluate(() => { window.state.entries = window.state.entries.filter((e) => e.id !== 'tst-vac-1118'); });
    const t6 = await page.evaluate(() => {
      const keep = window.state.activeEmployerId;
      window.state.activeEmployerId = window.state.employers.find((e) => e.name === 'Alte Softwareschmiede AG').id;
      window.renderTracker();
      const res = [document.getElementById('btn-start').disabled, document.querySelector('#active-employer option:checked').textContent];
      window.state.activeEmployerId = keep;
      window.renderTracker();
      return [...res, document.getElementById('btn-start').disabled];
    });
    check('T6 ehemaliger Arbeitgeber: Start gesperrt', t6, [true, 'Alte Softwareschmiede AG (ehemalig)', false]);
    const mode = () => page.evaluate(() => ['mode-praesenz', 'mode-homeoffice'].map((id) => document.getElementById(id).getAttribute('aria-checked')));
    await page.click('#mode-homeoffice');
    const t7a = await mode();
    await page.evaluate(() => { window.switchView('report'); window.switchView('tracker'); });
    const t7b = await mode();
    await page.evaluate(() => { window.state.runningTimer = { employerId: window.state.activeEmployerId, startISO: new Date().toISOString(), type: 'homeoffice' }; window.switchView('tracker'); });
    const t7c = await mode();
    await page.evaluate(() => { window.state.runningTimer = null; window.switchView('tracker'); });
    check('T7 Modus', [t7a, t7b, t7c, await mode()], [['false', 'true'], ['true', 'false'], ['false', 'true'], ['true', 'false']]);

    // ---------- Monat (v3.15.4) ----------
    const month = (ym, emp) => page.evaluate(({ ym, emp }) => {
      window.switchView('report');
      if (emp !== undefined) document.getElementById('report-employer').value = emp;
      document.getElementById('report-month').value = ym;
      window.renderReport();
      const box = document.getElementById('report-content');
      return {
        values: [...box.querySelectorAll('.summary-grid .summary-item .value')].map((v) => v.textContent.trim()),
        rows: box.querySelectorAll('table tbody tr').length,
        tips: [...box.querySelectorAll('.info-tooltip-content')].map((t) => t.textContent),
        km: !document.getElementById('btn-export-km-pdf').classList.contains('hidden'),
        text: box.textContent.trim(),
      };
    }, { ym, emp });
    const m9 = await month('2026-09', expected.empId);
    check('M1 Monat September 2026', [...m9.values.slice(0, 4), m9.rows], ['73:04', '176:00', '-102:56', '0 / 0', 9]);
    const m4 = await month('2026-04', expected.empId);
    check('M2 Monat April 2026', m4.values.slice(0, 4), ['143:53', '160:00', '+7:53', '2 / 1']);
    check('M2 Erklärung Gutschrift', m4.tips, ['Enthält 24:00 Std. Gutschrift für 2 Urlaubstage und 1 Krankheitstag – zählt wie gearbeitete Zeit (§ 3 EntgFG).']);
    await month('2026-10', expected.empId);
    for (const [btn, ext, msg] of [['pdf', 'pdf', 'PDF heruntergeladen'], ['word', 'docx', 'Word-Datei heruntergeladen'], ['csv', 'csv', 'CSV-Datei heruntergeladen']]) {
      await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`#btn-export-${btn}`)]);
      await page.waitForFunction((m) => document.getElementById('toast').textContent === m, msg);
      check(`M3 Knopf ${btn}`, dl.suggestedFilename(), `Arbeitszeit_Musterfirma_GmbH_2026-10.${ext}`);
    }
    check('M3 Dateiname und CSV über den Kontext', await page.evaluate(async () => {
      const ctx = window.__appCtx(); const r = ctx.compute.currentReport();
      return [ctx.format.fileNameForReport(r, 'pdf'), typeof ctx.exports.csv, (await ctx.exports.csv(r).text()) === (await window.generateCsvBlob(r).text())];
    }), ['Arbeitszeit_Musterfirma_GmbH_2026-10.pdf', 'function', true]);
    check('M4 ohne Kilometer kein Knopf', (await month('2026-09', expected.empId)).km, false);
    const kmEntry = await page.evaluate((emp) => {
      const e = window.state.entries.find((x) => x.employerId === emp && x.date === '2026-09-01' && x.type === 'work');
      e.km = 42.5; window.state.settings.fieldService = { enabled: true, employerIds: [emp] };
      return e.id;
    }, expected.empId);
    check('M4 mit Kilometern Knopf sichtbar', (await month('2026-09', expected.empId)).km, true);
    const [kdl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-km-pdf')]);
    await page.waitForFunction(() => document.getElementById('toast').textContent === 'Kilometer-PDF heruntergeladen');
    check('M4 Kilometer-PDF', kdl.suggestedFilename(), 'Arbeitszeit_Musterfirma_GmbH_2026-09-kilometer.pdf');
    await page.evaluate((id) => { delete window.state.settings.fieldService; delete window.state.entries.find((x) => x.id === id).km; }, kmEntry);
    const m5 = await page.evaluate(() => {
      const saved = [window.state.employers, window.state.activeEmployerId];
      window.state.employers = []; window.state.activeEmployerId = null;
      document.getElementById('report-employer').value = '';
      window.renderReport();
      const t = document.getElementById('report-content').textContent.trim();
      const cur = window.__appCtx().compute.currentReport();
      const msg = document.getElementById('toast').textContent;
      [window.state.employers, window.state.activeEmployerId] = saved;
      return [t, cur, msg];
    });
    check('M5 ohne Arbeitgeber', m5, ['Bitte Arbeitgeber und Monat wählen.', null, 'Bitte Arbeitgeber und Monat wählen']);
    const mopts = () => page.evaluate(() => [...document.querySelectorAll('#report-employer option')].map((o) => o.textContent));
    await month('2026-09', expected.empId);
    const mWithout = await mopts();
    await page.evaluate(() => window.setShowFormerEmployers(true));
    const mWith = await mopts();
    await page.evaluate(() => window.setShowFormerEmployers(false));
    check('M6 Ehemalige nur mit „Ehemalige anzeigen“', [mWithout.length, mWithout.some((t) => t.includes('(ehemalig)')), mWith.filter((t) => t.includes('(ehemalig)')).length],
      [4, false, expected.formerCount]);

    // ---------- Backup-Erinnerung (v3.15.4) ----------
    const reminder = () => page.evaluate(() => [['backup-reminder-banner', 'backup-reminder-text'], ['backup-reminder-banner-tracker', 'backup-reminder-text-tracker']]
      .map(([b, t]) => [document.getElementById(b).classList.contains('hidden'), document.getElementById(t).textContent]));
    await page.evaluate(() => {
      Object.assign(window.state.settings, { lastBackupAt: '2026-11-01T10:00:00.000Z', changesSinceBackup: 3 });
      delete window.state.settings.backupReminderSnoozeUntil;
      window.switchView('tracker');
      window.updateBackupReminderBanner();
    });
    const r1 = await reminder();
    check('R1 Banner in Einstellungen und Erfassen mit gleichem Text', [r1[0][0], r1[1][0], r1[0][1].length > 0, r1[0][1] === r1[1][1]], [false, false, true, true]);
    await page.click('#btn-backup-reminder-snooze-tracker');
    check('R1 Später erinnern blendet beide aus', (await reminder()).map((r) => r[0]), [true, true]);
    await page.evaluate(() => {
      Object.assign(window.state.settings, { lastBackupAt: new Date().toISOString(), changesSinceBackup: 0 });
      window.updateBackupReminderBanner();
    });
    check('R1 nach Backup kein Banner', (await reminder()).map((r) => r[0]), [true, true]);

    // ---------- Arbeitgeber (v3.15.5) ----------
    const agCards = () => page.evaluate(() => {
      window.switchView('employers');
      return {
        title: document.getElementById('employers-view-title').textContent,
        tab: document.querySelector('.tab[data-view="employers"]').textContent,
        cards: [...document.querySelectorAll('#employers-list .employer-card')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
      };
    });
    const hasAll = (list, parts) => parts.map((p, i) => p.every((x) => (list[i] || '').includes(x)));
    const ag1 = await agCards();
    check('AG1 Arbeitgeber, Angestellt', [ag1.title, ag1.cards.length, ...hasAll(ag1.cards, [
      ['Musterfirma GmbH', '40 h/Woche', 'Pause gesetzlich', 'Pers.-Nr. 10234'],
      ['Alte Softwareschmiede AG', 'Ehemalig seit 31.03.2025', '173 h/Monat', 'Pause manuell'],
      ['Teilzeit Logistik Nord', '20 h/Woche', 'Gleitzeit', 'Pers.-Nr. 77220']])],
    ['Arbeitgeber verwalten', 3, true, true, true]);
    await page.evaluate(() => { window.state.settings.appMode = 'freelance'; });
    const ag2 = await agCards();
    await page.evaluate(() => { delete window.state.settings.appMode; window.switchView('employers'); });
    check('AG2 Kunden, Freiberuflich', [ag2.title, ag2.tab, ag2.cards.length, ...hasAll(ag2.cards, [
      ['Studio Nordlicht', '15 h/Woche', 'Ohne Pause', '75,00 €/h'],
      ['BrightPath Consulting', 'Ehemalig seit 31.12.2024', '40 h/Monat', '95,00 €/h'],
      ['Alpine Design SA', '10 h/Woche', '110,00 CHF/h']])],
    ['Kunden verwalten', 'Kunden', 3, true, true, true]);
    check('AG2 zurück auf Angestellt', (await agCards()).tab, 'Arbeitgeber');
    await page.click('#employers-list .employer-card');
    check('AG3 Klick öffnet Dialog', await page.evaluate(() => [document.getElementById('modal-employer').classList.contains('hidden'), document.getElementById('employer-name').value]),
      [false, 'Musterfirma GmbH']);
    await page.evaluate(() => window.__appCtx().ui.closeModals());
    check('AG4 leere Liste', await page.evaluate(() => {
      const saved = window.state.employers; window.state.employers = [];
      window.renderEmployers();
      const t = document.getElementById('employers-list').textContent.trim();
      window.state.employers = saved; window.renderEmployers();
      return t.startsWith('Noch kein Arbeitgeber angelegt.');
    }), true);

    // ---------- Einstellungen (v3.15.5) ----------
    const settingsView = () => page.evaluate(() => {
      window.switchView('settings');
      const v = (id) => document.getElementById(id).value;
      return {
        fields: [v('setting-employee-name'), v('setting-own-email'), v('setting-state'), document.getElementById('setting-arbzg-hints').checked,
          [...document.querySelectorAll('input[name="setting-app-mode"]')].find((r) => r.checked).value],
        label: document.getElementById('settings-employee-name-label').textContent,
        holidays: document.querySelectorAll('#holiday-list li, #holiday-list .holiday-row, #holiday-list tr').length,
        sw: [document.getElementById('setting-sw-month-enabled').checked, document.getElementById('setting-sw-gleitzeit-enabled').checked,
          document.querySelector('.sw-chip[data-target="month"].active')?.dataset.value, document.querySelector('.sw-chip[data-target="gleitzeit"].active')?.dataset.value],
        hidden: ['settings-block-state', 'settings-block-holidays', 'settings-block-sw'].map((id) => document.getElementById(id).classList.contains('hidden')),
        absence: document.getElementById('btn-add-absence').style.display,
        templates: document.querySelectorAll('#templates-list > *').length,
        audit: document.getElementById('audit-log-list').textContent.trim(),
      };
    });
    const es0 = await settingsView();
    check('ES1 Felder Einstellungen', [...es0.fields, es0.label], ['Max Mustermann', 'max.mustermann@example.com', 'HE', true, 'employee', 'Arbeitnehmer/in – Name']);
    check('ES2 Feiertage Hessen 2026', es0.holidays, 10);
    check('ES3 Sollstunden-Warnung', es0.sw, [false, false, '20', '10']);
    await page.evaluate(() => { window.state.settings.appMode = 'freelance'; });
    const esF = await settingsView();
    await page.evaluate(() => { delete window.state.settings.appMode; });
    const esE = await settingsView();
    check('ES4 Modus Freiberuflich', [esF.fields[4], esF.label, esF.hidden, esF.absence, esF.templates], ['freelance', 'Freiberufler/in – Name', [true, true, true], 'none', 4]);
    check('ES4 zurück auf Angestellt', [esE.label, esE.hidden, esE.absence], ['Arbeitnehmer/in – Name', [false, false, false], '']);
    check('ES5 Protokoll leer', es0.audit, 'Noch keine Änderungen protokolliert.');
    const es5 = await page.evaluate(() => {
      const entry = window.state.entries.find((e) => e.employerId === window.state.activeEmployerId);
      window.pushAuditLog(window.state, { action: 'update', entry, summary: 'Test' });
      window.renderAuditLog();
      const rows = [...document.querySelectorAll('#audit-log-list .audit-log-row')].map((r) => r.textContent);
      window.state.auditLog = []; window.renderAuditLog();
      return [rows.length, rows[0].includes('Musterfirma GmbH')];
    });
    check('ES5 Protokoll nach Änderung', es5, [1, true]);

    // ---------- Backup (v3.15.5) ----------
    const bk1 = await page.evaluate(async () => {
      await window.renderBackupFolderSection();
      return ['showDirectoryPicker' in window, document.getElementById('backup-folder-content').textContent.replace(/\s+/g, ' ').trim(), !!document.getElementById('btn-choose-backup-folder')];
    });
    check('BK1 Karte Backup-Ordner', bk1[0]
      ? [bk1[1].startsWith('Noch kein fester Ordner ausgewählt.'), bk1[2]]
      : [bk1[1].startsWith('Ein fester Backup-Ordner lässt sich in Safari aus Sicherheitsgründen nicht direkt in der App festlegen.'), bk1[2]],
    bk1[0] ? [true, true] : [true, false]);
    await page.evaluate(() => { window.saveState(); window.state.settings.changesSinceBackup = 5; delete window.state.settings.lastBackupAt; document.getElementById('toast').textContent = ''; });
    const [bdl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.exportBackup())]);
    await page.waitForFunction(() => document.getElementById('toast').textContent === 'Backup heruntergeladen');
    check('BK2 Backup erstellen', [bdl.suggestedFilename(), await page.evaluate(() => [window.state.settings.changesSinceBackup, typeof window.state.settings.lastBackupAt,
      document.getElementById('backup-reminder-banner').classList.contains('hidden')])], ['arbeitszeit-backup-2026-11-18.json', [0, 'string', true]]);
    await page.evaluate(() => { window.state.settings.employeeName = 'Geändert'; window.saveState(); document.getElementById('toast').textContent = ''; });
    await page.setInputFiles('#input-backup-file', FIXTURE);
    await page.waitForFunction(() => document.getElementById('toast').textContent === 'Backup importiert');
    check('BK3 Backup einlesen', await page.evaluate(() => [window.state.settings.employeeName, window.state.employers.length,
      document.getElementById('setting-employee-name').value, document.querySelectorAll('#employers-list .employer-card').length]),
    ['Max Mustermann', 6, 'Max Mustermann', 3]);
    check('BK4 Wiederherstellung aus der Spiegelkopie', await page.evaluate(async (raw) => {
      window.state.settings.employeeName = 'Geändert'; window.saveState();
      const B = await import('/modules/ui/backup-ui.js');
      B.restoreFromMirror(window.__appCtx(), JSON.parse(raw));
      return [window.state.settings.employeeName, window.state.employers.length, document.getElementById('setting-employee-name').value];
    }, fixture), ['Max Mustermann', 6, 'Max Mustermann']);
  } finally {
    await context.close();
  }
}
