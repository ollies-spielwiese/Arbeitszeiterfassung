// v3.14.1: Zentraler Kontext (modules/app-context.js).
// Prüft: Aufbau und Schutz des Kontexts, gleiche Namen in allen 12 bisherigen
// Übergabe-Objekten wie in v3.14.0, gleiche Funktionen wie im Kontext und
// ein einziger Zustand für alle Übergabe-Objekte.

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

export async function runAppContextTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.14.1: Zentraler Kontext ===');
  const check = (name, value, expected) => assertEq(`Kontext ${name}`, JSON.stringify(value), JSON.stringify(expected));
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
      return out;
    });
    for (const [n, v, e] of pure) check(n, v, e);

    // ---------- Verdrahtung in app.js ----------
    const wired = await page.evaluate(async () => {
      const M = await import('/modules/app-context.js');
      const ctx = window.__appCtx();
      const factories = window.__legacyCtx;
      const out = { keys: {}, same: {}, errors: [] };
      for (const [name, fn] of Object.entries(factories)) {
        const obj = fn();
        out.keys[name] = Object.keys(obj).sort();
        // Jede Funktion, die es im Kontext gibt, muss identisch sein.
        out.same[name] = Object.keys(obj).every((k) => !(k in M.LEGACY_MAP) || obj[k] === M.resolvePath(ctx, M.LEGACY_MAP[k]));
      }
      const st = ctx.state.get();
      return {
        ...out,
        singleton: window.__appCtx() === ctx,
        stateSame: st === window.state,
        allStateSame: Object.values(factories).every((f) => { const o = f(); return !o.getState || o.getState() === st; }),
        holidayXmas: ctx.compute.holidayOf('2026-12-25') ? true : false,
        holidayWork: ctx.compute.holidayOf('2026-11-18') ? true : false,
        areas: Object.keys(ctx),
      };
    });
    check('Anzahl Übergabe-Objekte', Object.keys(wired.keys).length, 12);
    for (const [name, keys] of Object.entries(EXPECTED_KEYS)) {
      check(`${name} Namen wie v3.14.0`, wired.keys[name], [...keys].sort());
      check(`${name} Funktionen aus dem Kontext`, wired.same[name], true);
    }
    check('Kontext nur einmal gebaut', wired.singleton, true);
    check('ctx.state.get() ist der App-Zustand', wired.stateSame, true);
    check('alle Übergabe-Objekte lesen denselben Zustand', wired.allStateSame, true);
    check('holidayOf 25.12.2026', wired.holidayXmas, true);
    check('holidayOf 18.11.2026 (Hessen)', wired.holidayWork, false);
    check('Bereiche im App-Kontext', wired.areas, ['state', 'compute', 'format', 'ui', 'render', 'exports', 'data']);

    // Zustand nach Austausch (wie beim Import): Kontext liefert den neuen Zustand.
    const swapped = await page.evaluate(async () => {
      const S = await import('/modules/state.js');
      const ctx = window.__appCtx();
      const before = ctx.state.get();
      const copy = JSON.parse(JSON.stringify(before));
      copy.settings = { ...(copy.settings || {}), employeeName: 'Kontext Test' };
      S.replaceStateAtomically(copy, () => {});
      const ok = ctx.state.get() === copy && window.__legacyCtx._tplCtx().getState() === copy;
      S.replaceStateAtomically(before, () => {});
      return ok && ctx.state.get() === before;
    });
    check('neuer Zustand nach Austausch sichtbar', swapped, true);
  } finally {
    await context.close();
  }
}
