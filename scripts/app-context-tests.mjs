// v3.14.1–v3.14.3: Zentraler Kontext (modules/app-context.js).
// Prüft: Aufbau und Schutz des Kontexts, toAppContext/withExtras, dass die
// 12 früheren Übergabe-Objekte und die Variable state aus app.js entfernt sind,
// dass alle früher übergebenen Namen im Kontext erreichbar sind und dass es
// nur einen Zustand gibt (auch window.state).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const EXPECTED_KEYS = {
  _selectorsFmtCtx: ['isFreelance', 'minutesToHM', 'hoursDecimal', 'formatMoney'],
  _renderSummaryCtx: ['formatMoney'],
  _storageStatusCtx: ['getState', 'saveState', 'toast', 'escapeHtml'],
  _fsCtx: ['getState', 'saveState', 'escapeHtml', 'getEmployer', 'todayISO', 'holidayOf', 'computeSuggestedBreak',
    'openEntryModal', 'renderTracker', 'refreshAll', 'toast', 'uid', 'minutesToHM', 'computeWorkMinutes', 'saveEntryAndNext'],
  _entryCtx: ['holidayOf', 'openEntryModal', 'getState', 'saveState', 'getEmployer', 'todayISO', 'dayOfWeekISO', 'DAY_KEYS',
    'DAY_LABELS_LONG', 'escapeHtml', 'populateTemplatePicker', 'computeSuggestedBreak', 'computeFormFields', 'renderTracker',
    'renderEntries', 'refreshAll', 'toast', 'closeModals', 'uid'],
  _rangeEntryCtx: ['getState', 'saveState', 'escapeHtml', 'todayISO', 'renderTracker', 'renderEntries', 'refreshAll', 'toast',
    'closeModals', 'uid'],
  _hoCtx: ['getState', 'saveState', 'getEmployer', 'escapeHtml', 'todayISO', 'formatDate', 'populateTemplatePicker',
    'buildHomeofficeSegmentsHTML', 'computeHomeofficeMinutes', 'minutesToHM', 'hhmmToMinutes', 'normalizeSegments',
    'renderTracker', 'renderEntries', 'renderWeek', 'renderReport', 'renderOverview', 'refreshAll', 'closeModals', 'toast', 'uid'],
  _overviewShareCtx: ['getCurrentOverview', 'getState', 'escapeHtml', 'fileNameForOverview', 'formatMonthYear',
    'renderSummaryPlaintext', 'getOverviewSummaryFields', 'generateOverviewPdfBlob', 'downloadBlob', 'toast', 'closeModals'],
  _shareCtx: ['getCurrentReport', 'getState', 'escapeHtml', 'fileNameForReport', 'formatMonthYear', 'renderSummaryPlaintext',
    'getSummaryFields', 'generateWordBlob', 'generatePdfBlob', 'downloadBlob', 'toast', 'closeModals'],
  _emCtx: ['getState', 'saveState', 'getEmployer', 'defaultSchedule', 'L', 'isFreelance', 'uid', 'closeModals',
    'renderEmployers', 'renderTracker', 'toast'],
  _holCtx: ['getState', 'saveState', 'normalizeHolidayOverrides', 'escapeHtml', 'formatDate', 'closeModals', 'toast'],
  _tplCtx: ['getState', 'saveState', 'getAppMode', 'isFreelance', 'escapeHtml', 'uid', 'closeModals', 'toast'],
};

// Seit v3.14.3 gibt es diese Übergabe-Objekte nicht mehr. Die Liste bleibt als
// Nachweis: Jeder Name, den sie in v3.14.0 lieferten, muss im Kontext erreichbar sein.
const REMOVED_FACTORIES = Object.keys(EXPECTED_KEYS);

// Seit v3.14.2 lesen diese Module nur noch über toAppContext(ctx).
const MIGRATED_MODULES = [
  'modules/ui/entry-modal.js', 'modules/ui/field-service-ui.js', 'modules/ui/homeoffice-modal.js',
  'modules/ui/range-entry-modal.js', 'modules/ui/templates.js', 'modules/ui/employer-modal.js',
  'modules/ui/holiday-overrides.js', 'modules/ui/storage-status-ui.js', 'modules/share.js',
];

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSource(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

// v3.14.3: app.js ohne Übergabe-Objekte und ohne eigene Variable state.
function runAppJsSourceChecks(check) {
  const app = readSource('app.js').replace(/^\s*(\/\/|\*).*$/gm, '');
  const defined = REMOVED_FACTORIES.filter((n) => new RegExp('function ' + n + '\\s*\\(').test(app));
  check('app.js ohne alte Übergabe-Objekte', defined, []);
  const called = REMOVED_FACTORIES.filter((n) => app.includes(n));
  check('app.js ruft keine alten Übergabe-Objekte auf', called, []);
  check('app.js ohne eigene Variable state', /\b(let|var|const)\s+state\b/.test(app), false);
  check('app.js ohne Zuweisung an state', /(^|[^\w.$])state\s*=(?!=)/m.test(app), false);
  check('app.js ohne legacyView', app.includes('legacyView'), false);
  const bridge = readSource('modules/regression-bridge.js');
  check('Testbrücke ohne alte Übergabe-Objekte', /legacyCtx/.test(bridge), false);
  check('Testbrücke liest window.state über den Kontext', bridge.includes('appCtx().state.get()'), true);
  const sel = readSource('modules/selectors.js');
  const sum = readSource('modules/render/summary.js');
  check('selectors.js nutzt toAppContext', /import \{ toAppContext \} from '\.\/app-context\.js';/.test(sel), true);
  check('selectors.js ohne flache Formatierer', /\{ isFreelance, minutesToHM, hoursDecimal, formatMoney \} = ctx/.test(sel), false);
  check('render/summary.js nutzt toAppContext', /import \{ toAppContext \} from '\.\.\/app-context\.js';/.test(sum), true);
  check('render/summary.js ohne flaches formatMoney', /\{ formatMoney \} = ctx/.test(sum), false);
}

function runMigratedModuleSourceChecks(check) {
  for (const rel of MIGRATED_MODULES) {
    const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    check(`${rel} importiert toAppContext`, /import \{ toAppContext \} from '\.{1,2}\/(app-context|\.\.\/app-context)\.js';|import \{ toAppContext \} from '\.\.\/app-context\.js';|import \{ toAppContext \} from '\.\/app-context\.js';/.test(src), true);
    check(`${rel} ohne flaches Auspacken von ctx`, (src.match(/\}\s*=\s*ctx\s*;/g) || []).length, 0);
    check(`${rel} ohne flachen Zugriff ctx.name`, (src.match(/(?<![\w$.])ctx\.[A-Za-z_$]/g) || []).length, 0);
  }
}

export async function runAppContextTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.14.1: Zentraler Kontext ===');
  const check = (name, value, expected) => assertEq(`Kontext ${name}`, JSON.stringify(value), JSON.stringify(expected));
  runMigratedModuleSourceChecks(check);
  runAppJsSourceChecks(check);
  const context = await browser.newContext({ timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (e) => check(`Browserfehler: ${e.message}`, true, false));
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => typeof window.__appCtx === 'function');

    // ---------- Reine Logik des Moduls ----------
    const pure = await page.evaluate(async () => {
      const M = await import('/modules/app-context.js');
      const out = [], test = (n, v, e) => out.push([n, v, e]);
      const names = Object.keys(M.LEGACY_MAP);
      const paths = Object.values(M.LEGACY_MAP);
      test('Bereiche', M.CONTEXT_AREAS.join(','), 'state,compute,format,ui,render,exports,data');
      test('Pfade eindeutig', new Set(paths).size, paths.length);
      test('Pfade nur in bekannten Bereichen', paths.every((p) => M.CONTEXT_AREAS.includes(p.split('.')[0]) && p.split('.').length === 2), true);
      test('Zuordnung eingefroren', Object.isFrozen(M.LEGACY_MAP), true);

      const deps = {};
      for (const n of names) deps[n] = (n === 'DAY_KEYS' || n === 'DAY_LABELS_LONG') ? ['x'] : (() => n);
      const ctx = M.createAppContext(deps);
      test('Kontext eingefroren', Object.isFrozen(ctx) && M.CONTEXT_AREAS.every((a) => Object.isFrozen(ctx[a])), true);
      test('Bereich ui.toast', ctx.ui.toast(), 'toast');
      test('Bereich state.get', ctx.state.get(), 'getState');
      test('Bereich render.all', ctx.render.all(), 'refreshAll');
      test('Bereich data.dayKeys', ctx.data.dayKeys, ['x']);
      test('Anzahl Einträge', M.CONTEXT_AREAS.reduce((s, a) => s + Object.keys(ctx[a]).length, 0), names.length);
      let err = '';
      try { ctx.ui.toast = null; } catch (e) { err = 'TypeError'; }
      test('Kontext nicht überschreibbar', ctx.ui.toast(), 'toast');

      const miss = { ...deps }; delete miss.toast; delete miss.uid;
      try { M.createAppContext(miss); err = ''; } catch (e) { err = e.message; }
      test('fehlende Abhängigkeit gemeldet', err, 'createAppContext: fehlende Abhängigkeiten: toast, uid');
      try { M.createAppContext({ ...deps, saveState: 'kein' }); err = ''; } catch (e) { err = e.message; }
      test('falscher Typ gemeldet', err, 'createAppContext: fehlende Abhängigkeiten: saveState');
      try { M.createAppContext(null); err = ''; } catch (e) { err = e.message; }
      test('deps fehlt', err, 'createAppContext: deps fehlt');

      const lv = M.legacyView(ctx, ['getState', 'toast']);
      test('legacyView Namen', Object.keys(lv), ['getState', 'toast']);
      test('legacyView gleiche Funktion', lv.toast === ctx.ui.toast, true);
      try { M.legacyView(ctx, ['gibtsNicht']); err = ''; } catch (e) { err = e.message; }
      test('legacyView unbekannter Name', err, 'Kontext: unbekannter Name gibtsNicht');
      try { M.resolvePath(ctx, 'ui.gibtsNicht'); err = ''; } catch (e) { err = e.message; }
      test('resolvePath unbekannter Pfad', err, 'Kontext: unbekannter Pfad ui.gibtsNicht');

      // v3.14.2: toAppContext und withExtras
      test('isAppContext gebaut', M.isAppContext(ctx), true);
      test('isAppContext flach', M.isAppContext({ toast: () => 1 }), false);
      test('isAppContext null', M.isAppContext(null), false);
      test('toAppContext gibt gebauten Kontext unverändert zurück', M.toAppContext(ctx) === ctx, true);
      const flatToast = () => 'flach';
      const flat = { getState: () => 'S', toast: flatToast, refreshAll: () => 'R', DAY_KEYS: ['mo'], nav: 'N', __saveAndNext: true };
      const fc = M.toAppContext(flat);
      test('toAppContext flach: state.get', fc.state.get(), 'S');
      test('toAppContext flach: gleiche Funktion', fc.ui.toast === flatToast, true);
      test('toAppContext flach: render.all', fc.render.all(), 'R');
      test('toAppContext flach: data.dayKeys', fc.data.dayKeys, ['mo']);
      test('toAppContext flach: unbekannte Namen unter extra', Object.keys(fc.extra).sort(), ['__saveAndNext', 'nav']);
      test('toAppContext flach: fehlender Eintrag undefined', fc.ui.closeModals, undefined);
      test('toAppContext flach: alle Bereiche vorhanden', [...M.CONTEXT_AREAS, 'extra'].every((a) => fc[a] && typeof fc[a] === 'object'), true);
      test('toAppContext flach: eingefroren', Object.isFrozen(fc) && Object.isFrozen(fc.extra) && Object.isFrozen(fc.ui), true);
      test('toAppContext leer', Object.keys(M.toAppContext(undefined).ui).length, 0);
      const wx = M.withExtras(ctx, { a: 1 });
      const wx2 = M.withExtras(wx, { b: 2 });
      test('withExtras Zusätze', Object.keys(wx2.extra).sort(), ['a', 'b']);
      test('withExtras Bereiche gleich', wx2.ui.toast === ctx.ui.toast && wx2.state.get === ctx.state.get, true);
      test('withExtras ändert Ausgangskontext nicht', Object.keys(ctx.extra).length + Object.keys(wx.extra).length, 1);
      test('withExtras ergibt gebauten Kontext', M.isAppContext(wx2), true);
      test('withExtras aus flachem Objekt', M.withExtras(flat, { c: 3 }).extra.c + M.withExtras(flat, { c: 3 }).extra.nav, '3N');
      return out;
    });
    for (const [n, v, e] of pure) check(n, v, e);

    // ---------- Verdrahtung in app.js (seit v3.14.3 ohne Übergabe-Objekte) ----------
    const wired = await page.evaluate(async () => {
      const M = await import('/modules/app-context.js');
      const ctx = window.__appCtx();
      const st = ctx.state.get();
      const flatMoney = (n, c) => `${n} ${c}`;
      const fields = [{ kind: 'money', label: 'Netto', value: '12,50 €', rawAmount: { hoursDec: '1,00', rate: 12.5, currency: 'EUR' } }];
      const R = await import('/modules/render/summary.js');
      return {
        legacyGone: typeof window.__legacyCtx === 'undefined',
        singleton: window.__appCtx() === ctx,
        stateSame: st === window.state,
        stateDescriptor: typeof Object.getOwnPropertyDescriptor(window, 'state')?.get,
        formFields: typeof ctx.compute.formFields,
        saveEntryAndNext: typeof ctx.ui.saveEntryAndNext,
        holidayXmas: ctx.compute.holidayOf('2026-12-25') ? true : false,
        holidayWork: ctx.compute.holidayOf('2026-11-18') ? true : false,
        areas: Object.keys(ctx),
        legacyNames: Object.keys(M.LEGACY_MAP),
        resolved: Object.fromEntries(Object.entries(M.LEGACY_MAP).map(([n, p]) => [n, M.resolvePath(ctx, p) != null])),
        // Gleiches Ergebnis mit flachem Objekt (Tests) und mit dem zentralen Kontext.
        pdfFlat: JSON.stringify(R.renderSummaryPdfLines(fields, { formatMoney: flatMoney })),
        pdfCtx: JSON.stringify(R.renderSummaryPdfLines(fields, M.toAppContext({ formatMoney: flatMoney }))),
        pdfApp: JSON.stringify(window.renderSummaryPdfLines(fields)),
        pdfAppDirect: JSON.stringify(R.renderSummaryPdfLines(fields, ctx)),
      };
    });
    check('Testbrücke ohne alte Übergabe-Objekte (window.__legacyCtx)', wired.legacyGone, true);
    for (const name of REMOVED_FACTORIES) {
      const missing = EXPECTED_KEYS[name].filter((k) => !wired.legacyNames.includes(k) || !wired.resolved[k]);
      check(`${name}: alle Namen aus v3.14.0 im Kontext`, missing, []);
    }
    check('compute.formFields im Kontext', wired.formFields, 'function');
    check('ui.saveEntryAndNext im Kontext', wired.saveEntryAndNext, 'function');
    check('Kontext nur einmal gebaut', wired.singleton, true);
    check('ctx.state.get() ist der App-Zustand', wired.stateSame, true);
    check('window.state liest über den Kontext', wired.stateDescriptor, 'function');
    check('holidayOf 25.12.2026', wired.holidayXmas, true);
    check('holidayOf 18.11.2026 (Hessen)', wired.holidayWork, false);
    check('Bereiche im App-Kontext', wired.areas, ['state', 'compute', 'format', 'ui', 'render', 'exports', 'data', 'extra']);
    check('Summary-PDF flach = Kontext', wired.pdfCtx, wired.pdfFlat);
    check('Summary-PDF nutzt formatMoney', wired.pdfFlat.includes('12.5 EUR/h'), true);
    check('Summary-PDF App-Wrapper = Kontext direkt', wired.pdfApp, wired.pdfAppDirect);

    // Zustand nach Austausch (wie beim Import): Kontext und window.state liefern den neuen Zustand.
    const swapped = await page.evaluate(async () => {
      const S = await import('/modules/state.js');
      const ctx = window.__appCtx();
      const before = ctx.state.get();
      const copy = JSON.parse(JSON.stringify(before));
      copy.settings = { ...(copy.settings || {}), employeeName: 'Kontext Test' };
      S.replaceStateAtomically(copy, () => {});
      const ok = ctx.state.get() === copy && window.state === copy && window.state.settings.employeeName === 'Kontext Test';
      S.replaceStateAtomically(before, () => {});
      return ok && ctx.state.get() === before && window.state === before;
    });
    check('neuer Zustand nach Austausch sichtbar (Kontext und window.state)', swapped, true);
  } finally {
    await context.close();
  }
}
