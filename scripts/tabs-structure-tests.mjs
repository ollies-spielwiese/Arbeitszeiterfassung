// v3.15.x: Ein Modul je Reiter (Roadmap 3 Stufe 2).
//   TAB1  Module in modules/tabs/: kein Import von app.js, kein window.state,
//         Zugriff nur über toAppContext(ctx)
//   TAB2  Verschobene Funktionen sind in app.js nur noch Einzeiler
//   TAB3  window.renderXyz der Testbrücke zeichnet über das neue Modul
//   TAB4  app.js bleibt unter der Obergrenze des Releases
//   TAB5  Jedes Reiter-Modul steht in der ASSETS-Liste von sw.js
// Dazu Funktionsprüfungen der verschobenen Reiter mit den Testdaten von
// Max Mustermann (scripts/fixtures/test-backup-muster.json).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(REPO_ROOT, 'scripts', 'fixtures', 'test-backup-muster.json');

/** Obergrenze für app.js (Zeilen), sinkt je Release: 2.350 / 2.150 / 1.900 / 1.550 / 1.300. */
export const APP_JS_MAX_LINES = 2350;

/** Verschobene Funktionen: Name in app.js → [Modul, Name des Exports]. */
export const MOVED = {
  renderArchive: ['modules/tabs/archive.js', 'renderArchive'],
  archiveCurrentMonth: ['modules/tabs/archive.js', 'archiveCurrentMonth'],
  renderEntries: ['modules/tabs/entries.js', 'renderEntries'],
};

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
    check(`TAB2 ${rel} exportiert ${exp}`, new RegExp(`export function ${exp}\\(ctx\\)`).test(read(rel)), true);
  }
  check('TAB2 app.js ohne DOM-Ziele der verschobenen Reiter', ['archive-list', 'entries-list', 'filter-month'].filter((id) => app.includes(`'${id}'`)), []);
  const lines = app.split('\n').length;
  check(`TAB4 app.js höchstens ${APP_JS_MAX_LINES} Zeilen (aktuell ${lines})`, lines <= APP_JS_MAX_LINES, true);
  const sw = read('sw.js');
  for (const rel of tabFiles) check(`TAB5 ${rel} in sw.js ASSETS`, sw.includes(`'./${rel}'`), true);
}

export async function runTabsStructureTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.15.x: Ein Modul je Reiter ===');
  const check = (name, value, expected) => assertEq(`Reiter ${name}`, JSON.stringify(value), JSON.stringify(expected));
  runSourceChecks(check);

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
  } finally {
    await context.close();
  }
}
