// F01–F04: echte Datei-Importe, UI-Ereignisse und kontrollierte Storage-Ausfälle.
export async function runBackupSafetyTests(browser, baseURL, { assertEq }) {
  console.log('\n=== F01–F04: Backup- und Speichersicherheit ===');
  const check = (name, actual, expected) => assertEq(`BACKUP ${name}`, JSON.stringify(actual), JSON.stringify(expected));
  const employer = { id: 'safe-employer', name: 'Bestand', kind: 'employer', color: '#3b82f6',
    contacts: [], hoursMode: 'week', weeklyHours: 40, breakMode: 'none', schedule: {} };
  const seed = { schemaVersion: 7, employers: [employer, { ...employer, id: 'second', name: 'Zweiter' }],
    entries: [], archives: [], auditLog: [], templates: [], runningTimer: null, activeEmployerId: employer.id,
    settings: { employeeName: 'Vorher', ownEmail: 'alt@example.de', state: 'HE', appMode: 'employee' } };
  async function fresh() {
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await context.addInitScript(seed => {
      if (!localStorage.getItem('safety-seeded')) {
        localStorage.setItem('arbeitszeit_v1', JSON.stringify(seed));
        localStorage.setItem('safety-seeded', '1');
      }
    }, seed);
    await page.goto(baseURL);
    await page.waitForFunction(() => typeof window.renderSettings === 'function');
    await page.evaluate(() => {
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      saveState();
    });
    page.on('pageerror', e => check(`unbehandelter Browserfehler ${e.message}`, true, false));
    return { context, page };
  }
  async function upload(page, data, accept = true) {
    const dialog = d => accept ? d.accept() : d.dismiss();
    page.on('dialog', dialog);
    await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
    await page.locator('#input-backup-file').setInputFiles({
      name: 'safety.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
    });
    // FileReader + ggf. Dialog abwarten; Abbruch hat absichtlich keinen Erfolgstoast.
    if (accept) await page.waitForFunction(() => /[Ii]mport/.test(document.getElementById('toast').textContent));
    else await page.waitForTimeout(150);
    page.off('dialog', dialog);
  }
  {
    const { context, page } = await fresh();
    try {
      const before = await page.evaluate(() => localStorage.getItem('arbeitszeit_v1'));
      const attack = structuredClone(seed);
      attack.employers[0].color = '"><img src="/safety-missing" onerror="window.__safetyXss=1">';
      await upload(page, attack);
      check('F01 manipulierte Farbe abgewiesen', await page.evaluate(() =>
        document.getElementById('toast').textContent.includes('Import fehlgeschlagen')), true);
      check('F01 kein ausführbares HTML eingefügt', await page.evaluate(() =>
        !!window.__safetyXss || !!document.querySelector('img[src="/safety-missing"]')), false);
      check('F01 alter Speicher bleibt identisch', await page.evaluate(() => localStorage.getItem('arbeitszeit_v1')), before);
    } finally { await context.close(); }
  }
  {
    const { context, page } = await fresh();
    try {
      const before = await page.evaluate(() => localStorage.getItem('arbeitszeit_v1'));
      const attack = '"><img src="/safety-missing" onerror="window.__safetyXss=1">';
      const validEntry = { id: 'entry1', employerId: employer.id, date: '2026-10-04',
        type: 'work', start: '09:00', end: '10:00', breakMinutes: 0 };
      const validArchive = { id: 'archive1', employerId: employer.id, yearMonth: '2026-10',
        snapshot: { employer, entries: [validEntry], workedMin: 60, targetMin: 60, balance: 0, holidays: [] } };
      const cases = [
        ['Wurzel null', () => null],
        ['Wurzel Array', () => []],
        ['Arbeitgeber null', d => { d.employers = [null]; }],
        ['Arbeitgeber-ID', d => { d.employers[0].id = attack; }],
        ['Doppelte Arbeitgeber-ID', d => { d.employers.push(d.employers[0]); }],
        ['Kontakte als Objekt', d => { d.employers[0].contacts = {}; }],
        ['Kontaktwert Objekt', d => { d.employers[0].contacts = [{ name: {} }]; }],
        ['Wochenplan Zeit-Attribut', d => { d.employers[0].schedule = { mon: { start: attack } }; }],
        ['Wochenplan Pause-Attribut', d => { d.employers[0].schedule = { mon: { break: attack } }; }],
        ['Eintrags-ID', d => { d.entries = [{ ...validEntry, id: attack }]; }],
        ['Eintragsdatum', d => { d.entries = [{ ...validEntry, date: '2026-02-30' }]; }],
        ['Unbekannter Arbeitgeber', d => { d.entries = [{ ...validEntry, employerId: 'missing' }]; }],
        ['Falscher Eintragstyp', d => { d.entries = [{ ...validEntry, type: attack }]; }],
        ['Doppelte Eintrags-ID', d => { d.entries = [validEntry, validEntry]; }],
        ['HO Zeit-Attribut', d => { d.entries = [{ ...validEntry, type: 'homeoffice', segments: [{ start: attack, end: '10:00' }] }]; }],
        ['HO Liste statt Segment', d => { d.entries = [{ ...validEntry, type: 'homeoffice', segments: [null] }]; }],
        ['Vorlagen statt Array', d => { d.templates = {}; }],
        ['Vorlagen-ID', d => { d.templates = [{ id: attack, label: 'Text', text: 'Text' }]; }],
        ['Vorlagen-Gültigkeit', d => { d.templates = [{ id: 'tpl', label: 'Text', text: 'Text', scope: attack }]; }],
        ['Archiv statt Array', d => { d.archives = {}; }],
        ['Archiv ohne Snapshot', d => { d.archives = [{ id: 'arch', employerId: employer.id, yearMonth: '2026-10' }]; }],
        ['Archiv mit falschen Einträgen', d => { d.archives = [{ ...validArchive, snapshot: { ...validArchive.snapshot, entries: {} } }]; }],
        ['Archiv-Farbe', d => { d.archives = [{ ...validArchive, snapshot: { ...validArchive.snapshot, employer: { ...employer, color: attack } } }]; }],
        ['Protokoll statt Array', d => { d.auditLog = {}; }],
        ['Protokoll null', d => { d.auditLog = [null]; }],
        ['Einstellungen als Array', d => { d.settings = []; }],
        ['Name als Objekt', d => { d.settings.employeeName = {}; }],
        ['Währungs-Injektion', d => { d.settings.currency = attack; }],
        ['Feiertag-Datum', d => { d.settings.holidayOverrides = { add: [{ name: 'Test', date: attack }] }; }],
        ['Feiertag-Umbenennung', d => { d.settings.holidayOverrides = { rename: { '2026-10-04': {} } }; }],
        ['Timer unbekannter Arbeitgeber', d => { d.runningTimer = { employerId: 'missing', startISO: '2026-10-04T09:00:00Z' }; }],
        ['Timer ohne Zeit', d => { d.runningTimer = { employerId: employer.id }; }],
        ['Aktiver Arbeitgeber unbekannt', d => { d.activeEmployerId = 'missing'; }],
        ['Zukünftige Schema-Version', d => { d.schemaVersion = 99; }],
        ['Prototyp-Schlüssel', d => { d.settings = JSON.parse('{"__proto__":{"polluted":true}}'); }],
      ];
      for (const [name, mutate] of cases) {
        const data = structuredClone(seed);
        const result = mutate(data);
        await upload(page, result === undefined ? data : result);
        check(`F01/F03 ${name}: abgewiesen`, await page.evaluate(() =>
          document.getElementById('toast').textContent.includes('Import fehlgeschlagen')), true);
        check(`F01/F03 ${name}: Bestand unverändert`, await page.evaluate(before =>
          localStorage.getItem('arbeitszeit_v1') === before && state.settings.employeeName === 'Vorher' &&
          Array.isArray(state.entries) && !window.__safetyXss && !({}).polluted, before), true);
      }
      await upload(page, { ...seed, settings: { ...seed.settings, employeeName: 'Abbruch' } }, false);
      check('F03 Abbruch ändert keine Daten', await page.evaluate(before =>
        localStorage.getItem('arbeitszeit_v1') === before && state.settings.employeeName === 'Vorher', before), true);

      // Valid archive of a former/deleted employer stays importable; plain text is NOT HTML.
      const safeText = '<b>Text & "Zitat"</b>';
      const valid = structuredClone(seed);
      valid.employers[0].name = safeText;
      valid.archives = [validArchive];
      valid.entries = [validEntry];
      valid.templates = [{ id: 'tpl-text', label: safeText, text: safeText, scope: 'both' }];
      valid.settings.holidayOverrides = { add: [{ date: '2026-10-05', name: safeText }], disable: [], rename: {} };
      await upload(page, valid);
      check('F03 vollständiges Backup einschließlich Archiv importierbar', await page.evaluate(() =>
        document.getElementById('toast').textContent === 'Backup importiert' &&
        state.archives.length === 1 && state.entries.length === 1), true);
      check('F01 harmlose Sonderzeichen bleiben Text', await page.evaluate(safeText =>
        document.querySelector('.employer-name').textContent === safeText &&
        !document.querySelector('.employer-name b'), safeText), true);
      await page.reload();
      await page.waitForFunction(() => typeof state !== 'undefined');
      check('F03 gültiger Import übersteht Neustart', await page.evaluate(() =>
        state.archives.length === 1 && state.entries.length === 1), true);

      // Defence in depth: renderers also escape already-stored old malicious attributes.
      const rendered = await page.evaluate(async attack => {
        const { escapeHtml } = await import('/modules/util-format.js');
        const { buildHomeofficeSegmentsHTML } = await import('/modules/render/tracker.js');
        const { buildEmployerCardsHTML } = await import('/modules/render/employers.js');
        const { buildEntriesHTML } = await import('/modules/render/entries.js');
        const { buildScheduleGrid } = await import('/modules/ui/employer-modal.js');
        const host = document.createElement('div');
        host.innerHTML = buildHomeofficeSegmentsHTML([{ start: attack, end: attack }]) +
          buildEmployerCardsHTML([{ id: attack, color: attack, name: 'Text', contacts: [] }],
            { escapeHtml, formatMoney: () => '', breakModeLabel: () => '', isFreelance: () => false }) +
          buildEntriesHTML([{ id: attack, color: attack, detailsParts: [], date: '2026-10-04', badgeType: attack }],
            { escapeHtml, formatDateLong: x => x, minutesToHM: () => '' });
        document.body.append(host);
        buildScheduleGrid({ mon: { enabled: true, start: attack, end: attack, break: attack } });
        const result = !host.querySelector('img,script,[onerror],[onfocus]') &&
          !document.querySelector('#schedule-grid img,#schedule-grid [onerror]') && !window.__safetyXss;
        host.remove();
        return result;
      }, attack);
      check('F01 Renderer schützen auch bereits gespeicherte Attribute', rendered, true);
    } finally { await context.close(); }
  }
  {
    const { context, page } = await fresh();
    try {
      await upload(page, { ...seed, settings: { ...seed.settings, employeeName: 'Importiert' } });
      await page.evaluate(() => switchView('settings'));
      await page.fill('#setting-employee-name', 'Nach Import');
      await page.locator('#setting-employee-name').press('Tab');
      check('F02 Änderung nach Import im aktuellen und gespeicherten Zustand', await page.evaluate(() =>
        [state.settings.employeeName, JSON.parse(localStorage.getItem('arbeitszeit_v1')).settings.employeeName]),
      ['Nach Import', 'Nach Import']);
      await page.fill('#setting-own-email', 'neu+test@example.de');
      await page.locator('#setting-own-email').press('Tab');
      await page.selectOption('#setting-state', 'BY');
      await page.check('#setting-sw-month-enabled');
      await page.evaluate(() => switchView('tracker'));
      await page.selectOption('#active-employer', 'second');
      check('F02 E-Mail, Bundesland, Warnung und Arbeitgeber aktuell', await page.evaluate(() =>
        [state.settings.ownEmail, state.settings.state, state.settings.sollWarningMonthEnabled, state.activeEmployerId]),
      ['neu+test@example.de', 'BY', true, 'second']);
      await page.reload();
      await page.waitForFunction(() => typeof state !== 'undefined');
      check('F02 Änderungen überstehen Neustart', await page.evaluate(() =>
        [state.settings.employeeName, state.settings.ownEmail, state.settings.state, state.activeEmployerId]),
      ['Nach Import', 'neu+test@example.de', 'BY', 'second']);
      await page.evaluate(() => {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        switchView('settings');
      });
      await page.check('input[name="setting-app-mode"][value="freelance"]');
      check('F02 Moduswechsel nutzt aktuellen Zustand', await page.evaluate(() =>
        [state.settings.appMode, JSON.parse(localStorage.getItem('arbeitszeit_v1')).settings.appMode]), ['freelance', 'freelance']);
      await upload(page, { ...seed, runningTimer: { employerId: employer.id, type: 'work', startISO: '2026-10-04T09:00:00Z' } });
      await page.evaluate(() => switchView('tracker'));
      await page.selectOption('#active-employer', 'second');
      check('F02 Timer-Schutz gilt auch nach erneutem Import', await page.evaluate(() => state.activeEmployerId), employer.id);
    } finally { await context.close(); }
  }
  {
    const { context, page } = await fresh();
    try {
      const before = await page.evaluate(() => localStorage.getItem('arbeitszeit_v1'));
      await upload(page, { ...seed, entries: { defekt: true } });
      check('F03 ungültiger Import ohne Speicheränderung', await page.evaluate(() => localStorage.getItem('arbeitszeit_v1')), before);
      check('F03 Laufzeitzustand bleibt nutzbar', await page.evaluate(() => Array.isArray(state.entries)), true);
      const rollback = await page.evaluate(async () => {
        const m = await import('/modules/state.js');
        const previous = m.getState(), before = localStorage.getItem('arbeitszeit_v1');
        const candidate = JSON.parse(JSON.stringify(previous));
        candidate.settings.employeeName = 'Renderfehler';
        let applied = null, failed = false;
        try {
          m.replaceStateAtomically(candidate, current => {
            applied = current;
            m.saveState(); // Nested renderer writes must NOT reach storage.
            if (current === candidate) throw new Error('Kontrollierter Renderfehler');
          });
        } catch (_) { failed = true; }
        return { failed, reference: m.getState() === previous, restored: applied === previous,
          bytes: localStorage.getItem('arbeitszeit_v1') === before };
      });
      check('F03 Renderfehler setzt Referenzen zurück und schreibt nichts', rollback,
        { failed: true, reference: true, restored: true, bytes: true });
      const migrationFailure = await page.evaluate(async () => {
        const { importBackup } = await import('/modules/backup.js');
        const { DEFAULT_STATE } = await import('/modules/state.js');
        let commits = 0;
        return new Promise(resolve => {
          importBackup(new File([JSON.stringify({ employers: [] })], 'migration.json'), {
            DEFAULT_STATE, normalizeHolidayOverrides: window.normalizeHolidayOverrides,
            runMigrations: s => ({ state: { ...s, entries: {} } }),
            commitImport: () => { commits++; }, toast: message => resolve({ commits, rejected: message.includes('Import fehlgeschlagen') }),
          });
        });
      });
      check('F03 auch Migrationsergebnis vor Übernahme validiert', migrationFailure, { commits: 0, rejected: true });
    } finally { await context.close(); }
  }
  {
    const { context, page } = await fresh();
    try {
      await page.evaluate(() => {
        window.__originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === 'arbeitszeit_v1') throw new DOMException('Test-Speicher voll', 'QuotaExceededError');
          return window.__originalSetItem.call(this, key, value);
        };
        switchView('settings');
      });
      await page.fill('#setting-employee-name', 'Ungesichert');
      await page.locator('#setting-employee-name').press('Tab');
      check('F04 Speicherfehler dauerhaft sichtbar', await page.evaluate(() =>
        !!document.getElementById('storage-warning') && !document.getElementById('storage-warning').hidden), true);
      check('F04 kein falscher Persistenzstatus', await page.evaluate(async () =>
        (await import('/modules/state.js')).storage.isPersistent), false);
      check('F04 RAM enthält neue, Storage weiterhin alte Daten', await page.evaluate(() =>
        [state.settings.employeeName, JSON.parse(localStorage.getItem('arbeitszeit_v1')).settings.employeeName]),
      ['Ungesichert', 'Vorher']);
      await upload(page, { ...seed, settings: { ...seed.settings, employeeName: 'Darf nicht übernehmen' } });
      check('F03/F04 Import bei Schreibfehler abgebrochen', await page.evaluate(() =>
        document.getElementById('toast').textContent.includes('Import fehlgeschlagen')), true);
      check('F03/F04 ungesicherter Altzustand bleibt erhalten', await page.evaluate(() => state.settings.employeeName), 'Ungesichert');
      const downloadPromise = page.waitForEvent('download');
      await page.click('#btn-storage-backup');
      const download = await downloadPromise, stream = await download.createReadStream(), chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const savedBackup = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      check('F04 Notfall-Backup enthält ungesicherten RAM-Zustand', savedBackup.settings.employeeName, 'Ungesichert');
      check('F04 Backup-Download verdeckt Speicherwarnung nicht', await page.isVisible('#storage-warning'), true);
      await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
      await page.click('#btn-storage-retry');
      check('F04 Wiederholen speichert vollständigen aktuellen Zustand', await page.evaluate(() =>
        JSON.parse(localStorage.getItem('arbeitszeit_v1')).settings.employeeName), 'Ungesichert');
      check('F04 Warnung erst nach erfolgreichem Speichern entfernt', await page.isVisible('#storage-warning'), false);
      check('F04 Persistenzstatus erholt sich', await page.evaluate(async () =>
        (await import('/modules/state.js')).storage.isPersistent), true);
      await page.reload();
      await page.waitForFunction(() => typeof state !== 'undefined');
      check('F04 gerettete Änderung übersteht Neustart', await page.evaluate(() => state.settings.employeeName), 'Ungesichert');
    } finally { await context.close(); }
  }
  {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      await context.addInitScript(seed => {
        localStorage.setItem('arbeitszeit_v1', JSON.stringify(seed));
        Storage.prototype.setItem = () => { throw new DOMException('Schon voll', 'QuotaExceededError'); };
      }, seed);
      const page = await context.newPage();
      await page.goto(baseURL);
      await page.waitForFunction(() => typeof state !== 'undefined');
      check('F04 voller Speicher beim Start verbirgt keine vorhandenen Daten', await page.evaluate(() =>
        [state.settings.employeeName, state.employers.length]), ['Vorher', 2]);
      check('F04 Start-Schreibfehler sichtbar trotz lesbarem Bestand', await page.isVisible('#storage-warning'), true);
    } finally { await context.close(); }
  }
  {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      await context.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          get() { throw new DOMException('Gesperrt', 'SecurityError'); },
        });
      });
      const page = await context.newPage();
      await page.goto(baseURL);
      await page.waitForFunction(() => typeof state !== 'undefined');
      check('F04 gesperrter Speicher bereits beim Start sichtbar', await page.isVisible('#storage-warning'), true);
      await upload(page, seed);
      check('F03 kein nur scheinbar dauerhafter Import im RAM-Modus', await page.evaluate(() =>
        document.getElementById('toast').textContent.includes('Import fehlgeschlagen') && state.employers.length === 0), true);
    } finally { await context.close(); }
  }
}
