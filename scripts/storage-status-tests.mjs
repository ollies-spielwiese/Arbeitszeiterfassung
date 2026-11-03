// v3.14.0: Speicherstatus und Backup-Erinnerung.
// Testfälle aus der Vorschau (Stichtag 03.11.2026):
//   A: Backup vor 3 Tagen, 12 Änderungen         → nein / nein
//   B: Backup vor 8 Tagen, 0 Änderungen          → nein / nein
//   C: Backup vor 8 Tagen, 5 Änderungen          → ja / ja
//   D: Backup vor 15 Tagen, 23 Änderungen        → ja / ja
//   E: noch nie, Daten seit 2 Tagen, 9 Änderungen → ja / ja („noch kein Backup“)
//   F: wie D, „Später erinnern“ vor 2 Tagen      → nein / nein
// Speicherstatus: aktiv, nicht gewährt (Safari-Tab), nicht gewährt (andere), unbekannt.

export async function runStorageStatusTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.14.0: Speicherstatus und Backup-Erinnerung ===');
  const check = (name, value, expected) => assertEq(`Speicherstatus ${name}`, JSON.stringify(value), JSON.stringify(expected));
  const context = await browser.newContext({ timezoneId: 'Europe/Berlin', serviceWorkers: 'block', acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => check(`Browserfehler: ${e.message}`, true, false));
  await page.clock.install({ time: new Date('2026-11-03T10:00:00+01:00') });
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => typeof window.renderTracker === 'function');

    // ---------- Reine Logik ----------
    const pure = await page.evaluate(async () => {
      const S = await import('/modules/storage-status.js');
      const { validateBackup } = await import('/modules/backup-validation.js');
      const out = [], test = (n, v, e) => out.push([n, v, e]);
      const now = new Date('2026-11-03T10:00:00+01:00').getTime();
      const ago = (d) => new Date(now - d * 864e5).toISOString();
      const rem = (o) => S.computeBackupReminder({ hasData: true, now, ...o });

      const A = rem({ lastBackupAt: ago(3), changesSinceBackup: 12 });
      const B = rem({ lastBackupAt: ago(8), changesSinceBackup: 0 });
      const C = rem({ lastBackupAt: ago(8), changesSinceBackup: 5 });
      const D = rem({ lastBackupAt: ago(15), changesSinceBackup: 23 });
      const E = rem({ lastBackupAt: null, firstSeenAt: ago(2), changesSinceBackup: 9 });
      const F = rem({ lastBackupAt: ago(15), changesSinceBackup: 23, snoozeUntil: new Date(now + 5 * 864e5).toISOString() });
      test('Fälle A–F sichtbar', [A.show, B.show, C.show, D.show, E.show, F.show], [false, false, true, true, true, false]);
      test('Fälle A–F Grund', [A.reason, B.reason, C.reason, D.reason, E.reason, F.reason], ['recent', 'unchanged', 'due', 'due', 'never', 'snoozed']);
      test('Fall C Text', C.text, 'Seit deinem letzten Backup vor 8 Tagen gibt es 5 Änderungen. Jetzt sichern?');
      test('Fall D Text', D.text, 'Seit deinem letzten Backup vor 15 Tagen gibt es 23 Änderungen. Jetzt sichern?');
      test('Fall E Text', E.text, 'Du hast noch kein Backup erstellt. Sichere deine Daten regelmäßig, damit nichts verloren geht.');
      test('Grenze 6/7 Tage', [rem({ lastBackupAt: ago(6), changesSinceBackup: 3 }).show, rem({ lastBackupAt: ago(7), changesSinceBackup: 3 }).show], [false, true]);
      test('Einzahl', rem({ lastBackupAt: ago(7), changesSinceBackup: 1 }).text, 'Seit deinem letzten Backup vor 7 Tagen gibt es 1 Änderung. Jetzt sichern?');
      test('ohne Zähler (Altdaten) bisheriger Text', rem({ lastBackupAt: ago(20) }).text, 'Dein letztes Backup ist 20 Tage her. Jetzt sichern?');
      test('ohne Daten', rem({ hasData: false, lastBackupAt: ago(30), changesSinceBackup: 5 }).show, false);
      test('noch nie, erster Tag', rem({ lastBackupAt: null, firstSeenAt: ago(0), changesSinceBackup: 3 }).show, false);
      test('abgelaufenes Verschieben', rem({ lastBackupAt: ago(15), changesSinceBackup: 2, snoozeUntil: ago(1) }).show, true);

      test('Zähler normalisieren', [
        S.normalizeChangesSinceBackup({ lastBackupAt: ago(3) }),
        S.normalizeChangesSinceBackup({}),
        S.normalizeChangesSinceBackup({ changesSinceBackup: 5 }),
        S.normalizeChangesSinceBackup({ changesSinceBackup: -2, lastBackupAt: ago(1) }),
        S.normalizeChangesSinceBackup({ changesSinceBackup: 0, lastBackupAt: ago(1) }),
      ], [1, 0, 5, 1, 0]);

      test('Texte', [S.agoText(0), S.agoText(1), S.agoText(15), S.changesText(1), S.changesText(23)],
        ['heute', 'vor 1 Tag', 'vor 15 Tagen', '1 Änderung', '23 Änderungen']);
      test('letztes Backup', [S.lastBackupText(new Date('2026-10-19T09:00:00+02:00').toISOString(), now), S.lastBackupText(null, now)],
        ['19.10.2026 (vor 15 Tagen)', 'noch keins']);
      test('Größe', [S.sizeText(0.4 * 1024 * 1024), S.sizeText(1000), S.sizeText(2.36 * 1024 * 1024), S.sizeText(NaN)],
        ['ca. 0,4 MB', 'unter 0,1 MB', 'ca. 2,4 MB', 'unbekannt']);

      const info = (o) => { const r = S.storageStatusInfo({ apiAvailable: true, persisted: false, appleWebKit: false, standalone: false, ...o }); return [r.key, r.badge, r.showRequestButton]; };
      test('Zustand aktiv', info({ persisted: true }), ['granted', 'aktiv', false]);
      test('Zustand Safari-Tab', info({ appleWebKit: true }), ['safari', 'nicht gewährt', true]);
      test('Zustand andere Browser', info({}), ['other', 'nicht gewährt', true]);
      test('Zustand Safari installiert', info({ appleWebKit: true, standalone: true }), ['other', 'nicht gewährt', true]);
      test('Zustand unbekannt (keine API)', info({ apiAvailable: false }), ['unknown', 'unbekannt', false]);
      test('Zustand unbekannt (Fehler)', info({ persisted: null }), ['unknown', 'unbekannt', false]);
      test('Safari-Text', S.storageStatusInfo({ apiAvailable: true, persisted: false, appleWebKit: true, standalone: false }).text,
        'In Safari können Daten nach 7 Tagen ohne Nutzung gelöscht werden. Tipp: App zum Home-Bildschirm hinzufügen. Regelmäßige Backups schützen zusätzlich.');

      const UA = {
        iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
        macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
        macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        macEdge: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
        android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      };
      test('Apple-Erkennung', [S.isAppleWebKit(UA.iphone), S.isAppleWebKit(UA.iphoneChrome), S.isAppleWebKit(UA.macSafari),
        S.isAppleWebKit(UA.macChrome), S.isAppleWebKit(UA.macEdge), S.isAppleWebKit(UA.android), S.isAppleWebKit(UA.firefox),
        S.isAppleWebKit(UA.macSafari.replace('Version/17.5 ', ''), 5)], [true, true, true, false, false, false, false, true]);

      const sp = (o) => S.shouldRequestPersist({ apiAvailable: true, persisted: false, hasEntries: true, persistRequestedAt: null, standalone: false, requestedThisSession: false, ...o });
      test('Anfrage dauerhafter Speicher', [sp({}), sp({ hasEntries: false }), sp({ persistRequestedAt: ago(3) }), sp({ persistRequestedAt: ago(3), standalone: true }),
        sp({ persisted: true }), sp({ persisted: null }), sp({ apiAvailable: false }), sp({ requestedThisSession: true, standalone: true })],
      [true, false, false, true, false, false, false, false]);

      const st = { entries: [{ id: 'e1' }], employers: [], settings: { employeeName: 'Max Mustermann', lastBackupAt: ago(1), changesSinceBackup: 3 }, auditLog: [{ id: 'a' }], runningTimer: null };
      const fp = S.contentFingerprint(st);
      test('Fingerabdruck ohne Verwaltungsfelder', [
        S.contentFingerprint({ ...st, settings: { ...st.settings, lastBackupAt: ago(0), changesSinceBackup: 0, backupReminderSnoozeUntil: ago(-7), persistRequestedAt: ago(0) } }) === fp,
        S.contentFingerprint({ ...st, auditLog: [], runningTimer: { employerId: 'x' } }) === fp,
        S.contentFingerprint({ ...st, settings: { ...st.settings, employeeName: 'Erika Musterfrau' } }) === fp,
        S.contentFingerprint({ ...st, entries: [{ id: 'e1', note: 'neu' }] }) === fp,
      ], [true, true, false, false]);

      // Backup-Prüfung akzeptiert die neuen Felder.
      const raw = JSON.parse(JSON.stringify(state));
      raw.settings.changesSinceBackup = 4; raw.settings.persistRequestedAt = ago(1);
      let ok = true; try { validateBackup(raw); } catch (e) { ok = String(e.message || e); }
      test('Backup-Prüfung neue Felder', ok, true);
      raw.settings.changesSinceBackup = 'viele';
      let bad = false; try { validateBackup(raw); } catch (e) { bad = true; }
      test('Backup-Prüfung lehnt falschen Zähler ab', bad, true);
      return out;
    });
    for (const [n, v, e] of pure) check(n, v, e);

    // ---------- Zähler „Änderungen seit dem letzten Backup“ ----------
    const counter = await page.evaluate(async () => {
      const r = {};
      state.entries.push({ id: 'ss-e1', employerId: state.employers[0] ? state.employers[0].id : 'x', date: '2026-11-02', type: 'work', start: '08:00', end: '16:00', breakMinutes: 30 });
      saveState();
      state.settings.changesSinceBackup = 0; saveState();
      r.start = state.settings.changesSinceBackup;
      saveState(); r.unchanged = state.settings.changesSinceBackup;
      state.entries.find(e => e.id === 'ss-e1').note = 'Kundentermin'; saveState();
      r.afterEdit = state.settings.changesSinceBackup;
      state.settings.employeeName = 'Max Mustermann'; saveState();
      state.settings.employeeName = 'Max Mustermann'; saveState();
      r.afterSetting = state.settings.changesSinceBackup;
      state.settings.backupReminderSnoozeUntil = null; state.settings.persistRequestedAt = new Date().toISOString(); saveState();
      r.afterMeta = state.settings.changesSinceBackup;
      const stored = JSON.parse(localStorage.getItem('arbeitszeit_v1')).settings.changesSinceBackup;
      r.stored = stored;
      return r;
    });
    check('Zähler zählt nur echte Änderungen', [counter.start, counter.unchanged, counter.afterEdit, counter.afterMeta, counter.stored],
      [0, 0, 1, counter.afterSetting, counter.afterSetting]);
    check('Zähler nach Einstellungsänderung', counter.afterSetting >= 1, true);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
      page.evaluate(() => exportBackup()),
    ]);
    const afterExport = await page.evaluate(() => [state.settings.changesSinceBackup, !!state.settings.lastBackupAt]);
    check('Export setzt Zähler auf 0', [!!download, afterExport[0], afterExport[1]], [true, 0, true]);

    // ---------- Banner in beiden Reitern ----------
    const banners = await page.evaluate(() => {
      const vis = () => ['backup-reminder-banner', 'backup-reminder-banner-tracker'].map(id => !document.getElementById(id).classList.contains('hidden'));
      const txt = () => [document.getElementById('backup-reminder-text').textContent, document.getElementById('backup-reminder-text-tracker').textContent];
      const now = Date.now();
      const set = (days, changes) => { state.settings.lastBackupAt = new Date(now - days * 864e5).toISOString(); state.settings.changesSinceBackup = changes; state.settings.backupReminderSnoozeUntil = null; updateBackupReminderBanner(); };
      const r = {};
      set(15, 23); r.D = vis(); r.Dtext = txt();
      set(8, 0); r.B = vis();
      set(3, 12); r.A = vis();
      set(8, 5); r.C = vis();
      document.getElementById('btn-backup-reminder-snooze-tracker').click();
      r.afterSnooze = vis();
      r.snoozeDays = Math.round((new Date(state.settings.backupReminderSnoozeUntil).getTime() - now) / 864e5);
      return r;
    });
    check('Fall D in beiden Reitern', banners.D, [true, true]);
    check('Fall D Text in beiden Reitern', banners.Dtext, Array(2).fill('Seit deinem letzten Backup vor 15 Tagen gibt es 23 Änderungen. Jetzt sichern?'));
    check('Fall B und A ausgeblendet', [banners.B, banners.A], [[false, false], [false, false]]);
    check('Fall C sichtbar', banners.C, [true, true]);
    check('Später erinnern im Reiter Erfassen blendet beide aus', [banners.afterSnooze, banners.snoozeDays], [[false, false], 7]);

    const trackerExport = await page.evaluate(async () => {
      state.settings.backupReminderSnoozeUntil = null;
      state.settings.lastBackupAt = new Date(Date.now() - 9 * 864e5).toISOString(); state.settings.changesSinceBackup = 4;
      updateBackupReminderBanner();
      const before = !document.getElementById('backup-reminder-banner-tracker').classList.contains('hidden');
      return before;
    });
    const [dl2] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
      page.evaluate(() => document.getElementById('btn-backup-reminder-export-tracker').click()),
    ]);
    await page.waitForFunction(() => document.getElementById('backup-reminder-banner-tracker').classList.contains('hidden'));
    const afterTrackerExport = await page.evaluate(() => [state.settings.changesSinceBackup, document.getElementById('backup-reminder-banner-tracker').classList.contains('hidden')]);
    check('Jetzt exportieren im Reiter Erfassen', [trackerExport, !!dl2, afterTrackerExport[0], afterTrackerExport[1]], [true, true, 0, true]);

    // ---------- Karte „Speicherstatus“ ----------
    const card = await page.evaluate(async () => {
      const UI = await import('/modules/ui/storage-status-ui.js');
      const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
      const mk = (persisted, ua) => ({ userAgent: ua || 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0', maxTouchPoints: 0,
        storage: { persisted: async () => { if (persisted === 'err') throw new Error('x'); return persisted; }, persist: async () => true } });
      const win = { matchMedia: () => ({ matches: false }) };
      const base = { getState: () => state, saveState, toast: () => {}, escapeHtml: (s) => s, win };
      state.settings.lastBackupAt = new Date('2026-10-19T09:00:00+02:00').toISOString();
      state.settings.changesSinceBackup = 23;
      const read = () => {
        const box = document.getElementById('storage-status-content');
        const q = (t) => (box.querySelector(`[data-testid="${t}"]`) || {}).textContent;
        return [box.dataset.state, q('storage-status-persist'), q('storage-status-last-backup'), q('storage-status-changes'),
          /^(ca\. \d+,\d MB|unter 0,1 MB)$/.test(q('storage-status-size') || ''),
          !document.getElementById('btn-storage-persist').classList.contains('hidden')];
      };
      const r = {};
      await UI.renderStorageStatus({ ...base, nav: mk(false, iphone) }); r.safari = read();
      r.safariText = document.querySelector('[data-testid="storage-status-text"]').textContent;
      await UI.renderStorageStatus({ ...base, nav: mk(true) }); r.granted = read();
      await UI.renderStorageStatus({ ...base, nav: mk(false) }); r.other = read();
      await UI.renderStorageStatus({ ...base, nav: { userAgent: 'x' } }); r.noApi = read();
      await UI.renderStorageStatus({ ...base, nav: mk('err') }); r.err = read();

      // Anfrage nach dem ersten Eintrag: einmal, danach nicht erneut.
      UI._resetStorageStatusSession();
      let calls = 0;
      const nav = { userAgent: 'x', storage: { persisted: async () => false, persist: async () => { calls++; return false; } } };
      state.settings.persistRequestedAt = null;
      const first = await UI.maybeRequestPersist({ ...base, nav });
      const stamped = !!state.settings.persistRequestedAt;
      UI._resetStorageStatusSession();
      const second = await UI.maybeRequestPersist({ ...base, nav });
      // Installierte App: bei jedem Start erneut (neue Sitzung).
      UI._resetStorageStatusSession();
      const standalone = await UI.maybeRequestPersist({ ...base, nav, win: { matchMedia: () => ({ matches: true }) } });
      const sameSession = await UI.maybeRequestPersist({ ...base, nav, win: { matchMedia: () => ({ matches: true }) } });
      r.persist = [first, stamped, second, standalone, sameSession, calls];
      return r;
    });
    check('Karte Safari-Tab', card.safari, ['safari', 'nicht gewährt', '19.10.2026 (vor 15 Tagen)', '23', true, true]);
    check('Karte Safari-Text', card.safariText, 'In Safari können Daten nach 7 Tagen ohne Nutzung gelöscht werden. Tipp: App zum Home-Bildschirm hinzufügen. Regelmäßige Backups schützen zusätzlich.');
    check('Karte aktiv', card.granted, ['granted', 'aktiv', '19.10.2026 (vor 15 Tagen)', '23', true, false]);
    check('Karte andere Browser', card.other.slice(0, 2).concat(card.other[5]), ['other', 'nicht gewährt', true]);
    check('Karte ohne API', card.noApi.slice(0, 2).concat(card.noApi[5]), ['unknown', 'unbekannt', false]);
    check('Karte bei Fehler', card.err.slice(0, 2), ['unknown', 'unbekannt']);
    check('Anfrage dauerhafter Speicher', card.persist, [false, true, null, false, null, 2]);

    // Karte erscheint in den Einstellungen über „Daten“.
    await page.evaluate(() => document.querySelector('button.tab[data-view=settings]').click());
    await page.waitForFunction(() => document.getElementById('storage-status-content').dataset.state);
    const order = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('#view-settings .settings-block')];
      const i = blocks.findIndex(b => b.id === 'storage-status-block');
      return [i >= 0, (blocks[i + 1] && blocks[i + 1].querySelector('h3').textContent) || ''];
    });
    check('Karte steht über „Daten“', order, [true, 'Daten']);

    // ---------- Altdaten beim Laden ----------
    const reload = async (settingsPatch) => {
      await page.evaluate((patch) => {
        const s = JSON.parse(localStorage.getItem('arbeitszeit_v1'));
        delete s.settings.changesSinceBackup;
        Object.assign(s.settings, patch);
        localStorage.setItem('arbeitszeit_v1', JSON.stringify(s));
      }, settingsPatch);
      await page.reload();
      await page.waitForFunction(() => typeof window.renderTracker === 'function');
      return page.evaluate(() => state.settings.changesSinceBackup);
    };
    const withBackup = await reload({ lastBackupAt: new Date(Date.now() - 10 * 864e5).toISOString() });
    const withoutBackup = await reload({ lastBackupAt: null });
    check('Altdaten: Zähler mit/ohne Backup', [withBackup, withoutBackup], [1, 0]);
  } finally {
    await context.close();
  }
}
