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
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(REPO_ROOT, 'scripts', 'fixtures', 'test-backup-muster.json');

/** Obergrenze für app.js (Zeilen), sinkt je Release: 2.350 / 2.150 / 1.900 / 1.550 / 1.300. */
export const APP_JS_MAX_LINES = 2150;

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
};

/** Funktionen, die ganz aus app.js verschwinden (jetzt in Modulen ohne Einzeiler). */
export const REMOVED = ['isoWeekToDates', 'supportsWeekInput', 'fileNameForGleitzeitkonto'];

const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function runSourceChecks(check) {
  const tabFiles = fs.readdirSync(path.join(REPO_ROOT, 'modules', 'tabs')).filter((f) => f.endsWith('.js')).map((f) => `modules/tabs/${f}`);
  check('TAB1 Reiter-Module vorhanden', tabFiles.length >= new Set(Object.values(MOVED).map(([m]) => m)).size, true);
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
    const m = app.match(new RegExp(`^function ${name}\\(\\) \\{ return (_\\w+)\\(appCtx\\(\\)\\); \\}$`, 'm'));
    check(`TAB2 ${name} in app.js nur Einzeiler`, !!m, true);
    const count = (app.match(new RegExp(`function ${name}\\s*\\(`, 'g')) || []).length;
    check(`TAB2 ${name} nur einmal in app.js`, count, 1);
    if (m) {
      const imp = new RegExp(`import \\{[^}]*\\b${exp} as ${m[1]}\\b[^}]*\\} from '\\./${rel.replace(/\./g, '\\.')}';`);
      check(`TAB2 ${name} bindet ${rel} an`, imp.test(app), true);
    }
    check(`TAB2 ${rel} exportiert ${exp}`, new RegExp(`export (async )?function ${exp}\\(ctx[,)]`).test(read(rel)), true);
  }
  for (const name of REMOVED) check(`TAB2 ${name} nicht mehr in app.js`, new RegExp(`function ${name}\\s*\\(`).test(app), false);
  check('TAB2 app.js ohne DOM-Ziele der verschobenen Reiter', ['archive-list', 'entries-list', 'filter-month', 'week-content', 'week-input', 'week-employer', 'gleitzeitkonto-content', 'gleitzeitkonto-year'].filter((id) => app.includes(`'${id}'`)), []);
  const lines = app.split('\n').length;
  check(`TAB4 app.js höchstens ${APP_JS_MAX_LINES} Zeilen (aktuell ${lines})`, lines <= APP_JS_MAX_LINES, true);
  const sw = read('sw.js');
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
        render: [typeof ctx.render.archive, typeof ctx.render.gleitzeit, typeof ctx.render.vacation, typeof ctx.render.settings, typeof ctx.render.auditLog],
        ui: [typeof ctx.ui.openHomeofficeModal, typeof ctx.ui.showFormerEmployers, typeof ctx.ui.setShowFormerEmployers],
        compute: [typeof ctx.compute.monthTargetMinutes, typeof ctx.compute.workdaysInMonth],
        exports: [typeof ctx.exports.kmPdf, typeof ctx.exports.gleitzeitPdf, typeof ctx.exports.vacationCertificatePdf],
        modules: [typeof A.renderArchive, typeof A.archiveCurrentMonth, typeof E.renderEntries],
        former: ctx.ui.showFormerEmployers(),
      };
    });
    check('TAB3 Kontext render', bridge.render, Array(5).fill('function'));
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
  } finally {
    await context.close();
  }
}
