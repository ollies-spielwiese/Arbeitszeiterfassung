// v3.14.1/v3.14.2: Zentraler Kontext (modules/app-context.js).
// Prüft: Aufbau und Schutz des Kontexts, die 12 Übergabe-Objekte in app.js
// (seit v3.14.2 liefern 10 davon den gebauten Kontext, 2 für die reinen
// Selektoren weiter flache Namen), gleiche Funktionen wie im Kontext,
// toAppContext/withExtras und ein einziger Zustand für alle.

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

// Seit v3.14.2: diese Übergabe-Objekte liefern den gebauten Kontext, mit diesen Zusätzen unter ctx.extra.
const STRUCTURED_EXTRAS = {
  _storageStatusCtx: [], _fsCtx: ['saveEntryAndNext'], _entryCtx: ['computeFormFields'], _rangeEntryCtx: [],
  _hoCtx: [], _overviewShareCtx: [], _shareCtx: [], _emCtx: [], _holCtx: [], _tplCtx: [],
};
const FLAT_FACTORIES = ['_selectorsFmtCtx', '_renderSummaryCtx'];

// Seit v3.14.2 lesen diese Module nur noch über toAppContext(ctx).
const MIGRATED_MODULES = [
  'modules/ui/entry-modal.js', 'modules/ui/field-service-ui.js', 'modules/ui/homeoffice-modal.js',
  'modules/ui/range-entry-modal.js', 'modules/ui/templates.js', 'modules/ui/employer-modal.js',
  'modules/ui/holiday-overrides.js', 'modules/ui/storage-status-ui.js', 'modules/share.js',
];

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  const context = await browser.newContext({ timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (e) => check(`Browserfehler: ${e.message}`, true, false));
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => typeof window.__appCtx === 'function' && !!window.__legacyCtx);

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

    // ---------- Verdrahtung in app.js ----------
    const wired = await page.evaluate(async () => {
      const M = await import('/modules/app-context.js');
      const ctx = window.__appCtx();
      const factories = window.__legacyCtx;
      const out = { keys: {}, same: {}, errors: [] };
      out.structured = {}; out.extras = {};
      for (const [name, fn] of Object.entries(factories)) {
        const obj = fn();
        out.structured[name] = M.isAppContext(obj);
        if (M.isAppContext(obj)) {
          out.extras[name] = Object.keys(obj.extra).sort();
          // Alle Bereiche müssen dieselben Funktionen wie der App-Kontext enthalten.
          out.same[name] = M.CONTEXT_AREAS.every((a) => Object.keys(ctx[a]).every((k) => obj[a][k] === ctx[a][k])
            && Object.keys(obj[a]).length === Object.keys(ctx[a]).length);
        } else {
          out.keys[name] = Object.keys(obj).sort();
          out.same[name] = Object.keys(obj).every((k) => !(k in M.LEGACY_MAP) || obj[k] === M.resolvePath(ctx, M.LEGACY_MAP[k]));
        }
      }
      const st = ctx.state.get();
      const stateOf = (o) => (M.isAppContext(o) ? o.state.get : o.getState);
      return {
        ...out,
        singleton: window.__appCtx() === ctx,
        stateSame: st === window.state,
        allStateSame: Object.values(factories).every((f) => { const g = stateOf(f()); return !g || g() === st; }),
        holidayXmas: ctx.compute.holidayOf('2026-12-25') ? true : false,
        holidayWork: ctx.compute.holidayOf('2026-11-18') ? true : false,
        areas: Object.keys(ctx),
        legacyNames: Object.keys(M.LEGACY_MAP),
      };
    });
    check('Anzahl Übergabe-Objekte', Object.keys(wired.structured).length, 12);
    for (const name of FLAT_FACTORIES) {
      check(`${name} bleibt flach`, wired.structured[name], false);
      check(`${name} Namen wie v3.14.0`, wired.keys[name], [...EXPECTED_KEYS[name]].sort());
      check(`${name} Funktionen aus dem Kontext`, wired.same[name], true);
    }
    for (const [name, extras] of Object.entries(STRUCTURED_EXTRAS)) {
      check(`${name} liefert den gebauten Kontext`, wired.structured[name], true);
      check(`${name} Zusätze`, wired.extras[name], [...extras].sort());
      check(`${name} Bereiche wie App-Kontext`, wired.same[name], true);
      // Jeder in v3.14.0 genutzte Name ist im Kontext oder als Zusatz erreichbar.
      const reachable = EXPECTED_KEYS[name].every((k) => wired.legacyNames.includes(k) || extras.includes(k));
      check(`${name} alle Namen aus v3.14.0 erreichbar`, reachable, true);
    }
    check('Kontext nur einmal gebaut', wired.singleton, true);
    check('ctx.state.get() ist der App-Zustand', wired.stateSame, true);
    check('alle Übergabe-Objekte lesen denselben Zustand', wired.allStateSame, true);
    check('holidayOf 25.12.2026', wired.holidayXmas, true);
    check('holidayOf 18.11.2026 (Hessen)', wired.holidayWork, false);
    check('Bereiche im App-Kontext', wired.areas, ['state', 'compute', 'format', 'ui', 'render', 'exports', 'data', 'extra']);

    // Zustand nach Austausch (wie beim Import): Kontext liefert den neuen Zustand.
    const swapped = await page.evaluate(async () => {
      const S = await import('/modules/state.js');
      const ctx = window.__appCtx();
      const before = ctx.state.get();
      const copy = JSON.parse(JSON.stringify(before));
      copy.settings = { ...(copy.settings || {}), employeeName: 'Kontext Test' };
      S.replaceStateAtomically(copy, () => {});
      const ok = ctx.state.get() === copy && window.__legacyCtx._tplCtx().state.get() === copy;
      S.replaceStateAtomically(before, () => {});
      return ok && ctx.state.get() === before;
    });
    check('neuer Zustand nach Austausch sichtbar', swapped, true);
  } finally {
    await context.close();
  }
}
