// v3.15.0: Spiegelkopie in IndexedDB (Stufe 2).
// Testfälle aus der Vorschau mit den Beispieldaten von Max Mustermann
// (scripts/fixtures/test-backup-muster.json: 1.365 Einträge, 6 Arbeitgeber, 438.177 Minuten):
//   IDB1  Speichern → Spiegel gleich localStorage, Prüfsumme gleich
//   IDB2  10 Speichervorgänge kurz nacheinander → nur der letzte Stand im Spiegel
//   IDB3  erster Start ohne Spiegel → „angelegt“, nächster Start → „aktuell“
//   IDB4  Spiegel mit 1.364 Einträgen → „erneuert“ mit Angabe, danach 1.365
//   IDB5  nur Bemerkung geändert → Abweichung erkannt
//   IDB6  indexedDB fehlt → „nicht verfügbar“, Speichern läuft
//   IDB7  Schreibfehler → „Fehler“, keine Fehlermeldung beim Speichern
//   IDB8  Backup importieren → Spiegel gleich Import
//   IDB9  localStorage leer, Spiegel voll → Dialog, Spiegel unverändert, Wiederherstellen
//   IDB10 „Leer starten“ mit Rückfrage (abbrechen / bestätigen)
//   IDB11 localStorage beschädigt, Spiegel voll → Dialog
//   IDB12 Karte Speicherstatus zeigt die Zeile
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'test-backup-muster.json');

export async function runStorageIdbTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.15.0: Spiegelkopie in IndexedDB ===');
  const check = (name, value, expected) => assertEq(`Spiegelkopie ${name}`, JSON.stringify(value), JSON.stringify(expected));
  const fixtureJson = fs.readFileSync(FIXTURE, 'utf8');
  const EXPECTED_SUM = { entries: 1365, employers: 6, minutes: 438177 };

  /** Neuer Kontext; seed wird nur beim allerersten Laden in localStorage gelegt. */
  async function open({ seed = fixtureJson, noIdb = false, dialogs = 'accept' } = {}) {
    const context = await browser.newContext({ timezoneId: 'Europe/Berlin', locale: 'de-DE', serviceWorkers: 'block', acceptDownloads: true });
    await context.addInitScript(({ seed, noIdb }) => {
      if (noIdb) { try { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); } catch (_) { /* ignore */ } }
      localStorage.setItem('arbeitszeit_last_seen_version', '9.9.9');
      if (seed !== null && !sessionStorage.getItem('__idb_seeded')) {
        sessionStorage.setItem('__idb_seeded', '1');
        localStorage.setItem('arbeitszeit_v1', seed);
      }
    }, { seed, noIdb });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.__dialogs = [];
    page.on('dialog', (d) => { page.__dialogs.push(d.message()); (page.__dialogMode === 'dismiss' || (page.__dialogMode == null && dialogs === 'dismiss')) ? d.dismiss() : d.accept(); });
    page.on('pageerror', (e) => check(`Browserfehler: ${e.message}`, true, false));
    await page.goto(baseURL);
    await page.waitForFunction(() => typeof window.renderTracker === 'function' && !!window.__azMirror);
    return { context, page };
  }
  const status = (page) => page.evaluate(() => window.__azMirror.getMirrorStatus());
  const waitStatus = (page, keys) => page.waitForFunction((keys) => keys.includes(window.__azMirror.getMirrorStatus().key), keys);
  const idle = (page) => page.evaluate(() => window.__azMirror.whenMirrorIdle());
  const mirror = (page) => page.evaluate(async () => {
    const M = window.__azMirror;
    const rec = await M.readMirror();
    const ls = localStorage.getItem('arbeitszeit_v1');
    if (!rec) return { exists: false, same: false, checksum: null };
    return { exists: true, same: rec.json === ls, checksum: rec.checksum, appVersion: rec.appVersion, entries: JSON.parse(rec.json).entries.length };
  });
  /** Spiegel direkt verändern (für Abweichungs-Tests). */
  const tamper = (page, how) => page.evaluate(async (how) => {
    const M = window.__azMirror;
    const rec = await M.readMirror();
    const data = JSON.parse(rec.json);
    if (how === 'drop') data.entries.pop();
    if (how === 'note') { data.entries[0].note = (data.entries[0].note || '') + ' geändert'; }
    const json = JSON.stringify(data);
    await new Promise((resolve, reject) => {
      const r = indexedDB.open(M.MIRROR_DB, 1);
      r.onsuccess = () => {
        const tx = r.result.transaction(M.MIRROR_STORE, 'readwrite');
        tx.objectStore(M.MIRROR_STORE).put({ ...rec, json, checksum: M.mirrorChecksum(data) }, M.MIRROR_KEY);
        tx.oncomplete = () => { r.result.close(); resolve(undefined); };
        tx.onerror = () => reject(tx.error);
      };
      r.onerror = () => reject(r.error);
    });
  }, how);
  // Markiert das alte Dokument, damit nach dem Neuladen sicher das neue geprüft wird
  // (WebKit meldet reload() teils, bevor das neue Dokument bereit ist).
  const reload = async (page) => {
    await page.evaluate(() => { window.__azOldDocument = true; });
    await page.reload();
    await page.waitForFunction(() => !window.__azOldDocument && typeof window.renderTracker === 'function' && !!window.__azMirror);
  };

  // ---------- Reine Logik ----------
  {
    const { context, page } = await open({ seed: null });
    try {
      const pure = await page.evaluate(async () => {
        const M = window.__azMirror;
        const out = [], test = (n, v, e) => out.push([n, v, e]);
        const sum = { entries: 1365, employers: 6, minutes: 438177 };
        const info = (st) => { const r = M.mirrorStatusInfo({ savedAt: null, checksum: null, previous: null, ...st }); return [r.badge, r.badgeClass, r.text]; };
        test('Text aktuell', info({ key: 'current', savedAt: new Date('2026-11-18T21:40:00+01:00').toISOString(), checksum: sum }), ['aktuell', 'st-ok',
          'Die Spiegelkopie in IndexedDB stimmt mit den Daten überein. Zuletzt geschrieben: 18.11.2026, 21:40. 1.365 Einträge, 6 Arbeitgeber und Kunden, 7.303 Stunden.']);
        test('Text angelegt', info({ key: 'created' }), ['angelegt', 'st-ok', 'Die Spiegelkopie in IndexedDB wurde neu angelegt. Die Daten liegen weiter in localStorage.']);
        test('Text erneuert', info({ key: 'renewed', previous: { ...sum, entries: 1364 }, checksum: sum }), ['erneuert', 'st-neutral',
          'Beim Start wich die Spiegelkopie ab (1.364 statt 1.365 Einträge). Es gelten die Daten aus localStorage, die Spiegelkopie wurde neu geschrieben.']);
        test('Text erneuert ohne Zahlenabweichung', info({ key: 'renewed', previous: sum, checksum: sum })[2],
          'Beim Start wich die Spiegelkopie ab. Es gelten die Daten aus localStorage, die Spiegelkopie wurde neu geschrieben.');
        test('Text nicht verfügbar', info({ key: 'unavailable' }), ['nicht verfügbar', 'st-neutral',
          'IndexedDB ist in diesem Browser nicht verfügbar, zum Beispiel im privaten Modus. Die Daten liegen wie bisher in localStorage.']);
        test('Text Fehler', info({ key: 'error' }), ['Fehler', 'st-warn',
          'Die Spiegelkopie konnte nicht geschrieben werden. Die Daten liegen sicher in localStorage. Bitte ein Backup sichern.']);
        test('Text Entscheidung offen', info({ key: 'restore', checksum: sum })[0], 'Entscheidung offen');
        test('Text noch leer', info({ key: 'idle' })[0], 'noch leer');
        test('Einzahl', M.checksumText({ entries: 1, employers: 1, minutes: 60 }), '1 Eintrag, 1 Arbeitgeber und Kunden, 1 Stunde');
        test('Daten vorhanden', [M.stateHasData(null), M.stateHasData({ entries: [], employers: [] }), M.stateHasData({ entries: [], employers: [{}] }), M.stateHasData({ entries: [{}], employers: [] })],
          [false, false, true, true]);
        test('Prüfsumme leer', M.mirrorChecksum({}), { entries: 0, employers: 0, minutes: 0 });
        return out;
      });
      for (const [n, v, e] of pure) check(n, v, e);
    } finally { await context.close(); }
  }

  // ---------- IDB1–IDB5, IDB12 ----------
  {
    const { context, page } = await open();
    try {
      await waitStatus(page, ['created']);
      await idle(page);
      const m1 = await mirror(page);
      check('IDB1 Spiegel gleich localStorage', m1.same, true);
      check('IDB1 Prüfsumme Testdaten', m1.checksum, EXPECTED_SUM);
      check('IDB1 App-Version vermerkt', /^\d+\.\d+\.\d+$/.test(m1.appVersion || ''), true);
      check('IDB3 erster Start angelegt', (await status(page)).key, 'created');

      // IDB12: Karte Speicherstatus
      await page.evaluate(() => window.switchView('settings'));
      await page.waitForSelector('[data-testid="storage-status-mirror"]');
      check('IDB12 Karte Abzeichen', (await page.textContent('[data-testid="storage-status-mirror"]')).trim(), 'angelegt');

      // IDB2: 10 Speichervorgänge
      const saved = await page.evaluate(async () => {
        const s = window.state; const results = [];
        for (let i = 0; i < 10; i++) { s.settings.employeeName = 'Max Mustermann ' + i; results.push(window.saveState()); }
        return results.every(Boolean);
      });
      check('IDB2 alle Speichervorgänge erfolgreich', saved, true);
      await idle(page);
      const m2 = await page.evaluate(async () => JSON.parse((await window.__azMirror.readMirror()).json).settings.employeeName);
      check('IDB2 letzter Stand im Spiegel', m2, 'Max Mustermann 9');
      check('IDB2 Spiegel gleich localStorage', (await mirror(page)).same, true);

      // IDB3: nächster Start → aktuell
      await reload(page);
      await waitStatus(page, ['current']);
      const st3 = await status(page);
      check('IDB3 zweiter Start aktuell', [st3.key, st3.checksum], ['current', EXPECTED_SUM]);
      await page.evaluate(() => window.switchView('settings'));
      await page.waitForFunction(() => (document.querySelector('[data-testid="storage-status-mirror"]') || {}).textContent === 'aktuell');
      const txt = await page.textContent('[data-testid="storage-status-mirror-text"]');
      check('IDB12 Karte Text mit Zahlen', txt.includes('1.365 Einträge, 6 Arbeitgeber und Kunden, 7.303 Stunden.'), true);

      // IDB4: ein Eintrag fehlt im Spiegel
      await tamper(page, 'drop');
      await reload(page);
      await waitStatus(page, ['renewed']);
      await idle(page);
      await page.evaluate(() => window.switchView('settings'));
      await page.waitForFunction(() => (document.querySelector('[data-testid="storage-status-mirror"]') || {}).textContent === 'erneuert');
      check('IDB4 Text mit Abweichung', (await page.textContent('[data-testid="storage-status-mirror-text"]')).includes('(1.364 statt 1.365 Einträge)'), true);
      const m4 = await mirror(page);
      check('IDB4 Spiegel neu geschrieben', [m4.same, m4.entries], [true, 1365]);

      // IDB5: nur Bemerkung geändert
      await tamper(page, 'note');
      await reload(page);
      await waitStatus(page, ['renewed']);
      await idle(page);
      check('IDB5 Bemerkung erkannt und korrigiert', (await mirror(page)).same, true);
    } finally { await context.close(); }
  }

  // ---------- IDB6: indexedDB fehlt ----------
  {
    const { context, page } = await open({ noIdb: true });
    try {
      await waitStatus(page, ['unavailable']);
      const ok = await page.evaluate(() => { window.state.settings.employeeName = 'Erika Musterfrau'; return window.saveState(); });
      const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('arbeitszeit_v1')).settings.employeeName);
      check('IDB6 Speichern ohne IndexedDB', [ok, ls], [true, 'Erika Musterfrau']);
      await page.evaluate(() => window.switchView('settings'));
      await page.waitForSelector('[data-testid="storage-status-mirror"]');
      check('IDB6 Karte', (await page.textContent('[data-testid="storage-status-mirror"]')).trim(), 'nicht verfügbar');
    } finally { await context.close(); }
  }

  // ---------- IDB7: Schreibfehler ----------
  {
    const { context, page } = await open();
    try {
      await waitStatus(page, ['created']);
      await idle(page);
      const res = await page.evaluate(async () => {
        const M = window.__azMirror;
        M._setMirrorWriteFault(true);
        window.state.settings.employeeName = 'Fehlerfall';
        const ok = window.saveState();
        await M.whenMirrorIdle();
        const key = M.getMirrorStatus().key;
        const toast = (document.getElementById('toast') || {}).textContent || '';
        M._setMirrorWriteFault(false);
        window.state.settings.employeeName = 'Wieder gut';
        window.saveState();
        await M.whenMirrorIdle();
        return { ok, key, toast, after: M.getMirrorStatus().key };
      });
      check('IDB7 Speichern trotz Fehler erfolgreich', res.ok, true);
      check('IDB7 Zustand Fehler', res.key, 'error');
      check('IDB7 keine Fehlermeldung beim Speichern', res.toast.includes('Nicht dauerhaft gespeichert'), false);
      check('IDB7 nach Erfolg wieder aktuell', res.after, 'current');
    } finally { await context.close(); }
  }

  // ---------- IDB8: Backup importieren ----------
  {
    const { context, page } = await open({ seed: null });
    try {
      await waitStatus(page, ['idle', 'created']);
      const data = JSON.parse(fixtureJson);
      data.settings.employeeName = 'Max Mustermann (Import)';
      await page.setInputFiles('#input-backup-file', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
      await page.waitForFunction(() => window.state.entries.length === 1365);
      await idle(page);
      const m8 = await mirror(page);
      check('IDB8 Spiegel gleich Import', [m8.same, m8.checksum], [true, EXPECTED_SUM]);
    } finally { await context.close(); }
  }

  // ---------- IDB9–IDB11: Wiederherstellung ----------
  async function withFullMirrorThen(lsValue) {
    const opened = await open();
    const { page } = opened;
    await waitStatus(page, ['created']);
    await idle(page);
    await page.evaluate((v) => {
      if (v === null) localStorage.removeItem('arbeitszeit_v1'); else localStorage.setItem('arbeitszeit_v1', v);
    }, lsValue);
    await reload(page);
    await waitStatus(page, ['restore']);
    return opened;
  }
  {
    const { context, page } = await withFullMirrorThen(null);
    try {
      await page.waitForSelector('[data-testid="modal-mirror-restore"]:not(.hidden)');
      check('IDB9 Dialog Zahlen', (await page.textContent('[data-testid="mirror-restore-sums"]')).trim(), '1.365 Einträge, 6 Arbeitgeber und Kunden');
      // App speichert während des Starts und danach; der Spiegel darf nicht überschrieben werden.
      await page.evaluate(() => { window.state.settings.employeeName = 'leer'; window.saveState(); });
      await page.keyboard.press('Escape');
      check('IDB9 Dialog bleibt bei Escape offen', await page.isVisible('[data-testid="modal-mirror-restore"]'), true);
      const m9 = await mirror(page);
      check('IDB9 Spiegel unverändert', [m9.exists, m9.entries], [true, 1365]);
      await page.click('[data-testid="button-mirror-restore"]');
      await page.waitForFunction(() => window.state.entries.length === 1365);
      await waitStatus(page, ['current']);
      await idle(page);
      const m9b = await mirror(page);
      check('IDB9 nach Wiederherstellen', [await page.isHidden('[data-testid="modal-mirror-restore"]'), m9b.same, m9b.entries,
        await page.evaluate(() => JSON.parse(localStorage.getItem('arbeitszeit_v1')).entries.length)], [true, true, 1365, 1365]);
    } finally { await context.close(); }
  }
  {
    const { context, page } = await withFullMirrorThen(null);
    try {
      page.__dialogMode = 'dismiss';
      await page.click('[data-testid="button-mirror-empty"]');
      check('IDB10 Rückfrage gestellt', page.__dialogs.some((m) => m.includes('1.365 Einträgen endgültig löschen')), true);
      check('IDB10 abgebrochen: Dialog bleibt', await page.isVisible('[data-testid="modal-mirror-restore"]'), true);
      check('IDB10 abgebrochen: Spiegel bleibt', (await mirror(page)).entries, 1365);
      page.__dialogMode = 'accept';
      await page.click('[data-testid="button-mirror-empty"]');
      await page.waitForSelector('[data-testid="modal-mirror-restore"]', { state: 'hidden' });
      await waitStatus(page, ['idle', 'created', 'current']);
      await idle(page);
      const st = await status(page);
      const m10 = await mirror(page);
      check('IDB10 bestätigt: leer gestartet', [await page.evaluate(() => window.state.entries.length), ['idle', 'created', 'current'].includes(st.key)], [0, true]);
      check('IDB10 bestätigt: Spiegel ohne alte Daten', m10.exists ? m10.entries : 0, 0);
    } finally { await context.close(); }
  }
  {
    const { context, page } = await withFullMirrorThen('{kaputt');
    try {
      const shown = await page.waitForSelector('[data-testid="modal-mirror-restore"]:not(.hidden)', { timeout: 8000 }).then(() => true, () => false);
      check('IDB11 Dialog bei beschädigtem Speicher', shown, true);
      check('IDB11 Text nennt beschädigten Speicher', (await page.textContent('[data-testid="mirror-restore-text"]')).startsWith('Der normale Speicher ist leer oder nicht lesbar.'), true);
      await page.click('[data-testid="button-mirror-restore"]');
      await page.waitForFunction(() => window.state.entries.length === 1365);
      await idle(page);
      check('IDB11 wiederhergestellt', (await mirror(page)).same, true);
    } finally { await context.close(); }
  }
}
