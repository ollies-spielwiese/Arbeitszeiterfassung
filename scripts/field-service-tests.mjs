// v3.13.0: Außendienst-Nachweis (Tätigkeit, Einsatzort, Kilometer, Kilometer-PDF) und
// Hinweis Sonn- und Feiertagsarbeit (§§ 9–11 ArbZG, freie Sonntage je Jahr).
// Rechenbeispiele aus der Vorschau:
//   Kilometer: Di 03.11. 190 + 145 = 335 km (100,50 €), Do 05.11. 45 + 45 = 90 km (27,00 €),
//              So 08.11. 25 + 25 = 50 km (15,00 €) → 475 km × 0,30 € = 142,50 €.
//   Sonntage: Beispiel Café jeden Sonntag ab 05.04.2026 → 06.12. = 36 gearbeitet / 16 frei,
//             13.12. = 37/15 (genau an der Grenze), 20.12. = 38/14, 27.12. = 39/13.

export async function runFieldServiceTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.13.0: Außendienst-Nachweis und Sonntagshinweis ===');
  const check = (name, value, expected) => assertEq(`Außendienst ${name}`, JSON.stringify(value), JSON.stringify(expected));
  const context = await browser.newContext({ timezoneId: 'Europe/Berlin', serviceWorkers: 'block', acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => check(`Browserfehler: ${e.message}`, true, false));
  await page.clock.install({ time: new Date('2026-11-08T16:00:00+01:00') });
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => typeof window.renderTracker === 'function');

    const results = await page.evaluate(async () => {
      const F = await import('/modules/field-service.js');
      const SH = await import('/modules/sunday-hints.js');
      const { validateBackup } = await import('/modules/backup-validation.js');
      const out = [], test = (n, v, e) => out.push([n, v, e]);

      // Einstellungen: Standardwerte.
      const d = F.getFieldServiceSettings({});
      test('Standard', [d.enabled, d.kmEnabled, d.kmRate, d.defaultVehicle, d.kmPrompt, d.showTodayList, d.activities.map(a => a.id)],
        [false, true, 0.3, 'private', 'switch', true, ['office', 'client', 'trip']]);
      const s1 = { fieldService: { enabled: true, employerIds: ['g'], activities: [{ id: 'trip', hidden: true }, { id: 'custom-1', label: '  Messe ', isTrip: false }, { id: 'x', label: '' }], kmRate: 'abc' } };
      const n1 = F.getFieldServiceSettings(s1);
      test('Normalisierung', [n1.activities.map(a => `${a.id}:${a.label}:${a.hidden}`), n1.kmRate], [['office:Büro:false', 'client:Kundentermin:false', 'trip:Fahrt:true', 'custom-1:Messe:false'], 0.3]);
      test('aktiv je Arbeitgeber', [F.isFieldServiceActive(s1, 'g'), F.isFieldServiceActive(s1, 'c'), F.isFieldServiceActive({ fieldService: { employerIds: ['g'] } }, 'g')], [true, false, false]);
      test('sichtbare Tätigkeiten', F.visibleActivities(n1).map(a => a.id), ['office', 'client', 'custom-1']);
      test('neue ID', F.newActivityId(n1.activities), 'custom-2');

      // Kilometer-Rechenbeispiel.
      const fs = F.getFieldServiceSettings({ fieldService: { enabled: true, employerIds: ['g'], activities: [{ id: 'custom-1', label: 'Messe' }] } });
      const w = (id, date, st, en, act, loc, km, extra) => ({ id, employerId: 'g', date, type: 'work', start: st, end: en, breakMinutes: 0, activity: act, location: loc, km: km || 0, ...(extra || {}) });
      const list = [
        w('a0', '2026-11-03', '06:30', '07:00', 'office', 'Frankfurt am Main'),
        w('a1', '2026-11-03', '07:00', '09:30', 'trip', 'Beispiel AG, Kassel', 190),
        w('a2', '2026-11-03', '09:30', '13:00', 'client', 'Beispiel AG, Kassel'),
        w('a3', '2026-11-03', '13:00', '15:00', 'trip', 'Frankfurt am Main', 145),
        w('b1', '2026-11-05', '09:00', '10:00', 'trip', 'Muster KG, Mainz', 45),
        w('b2', '2026-11-05', '10:00', '12:00', 'client', 'Muster KG, Mainz'),
        w('b3', '2026-11-05', '12:00', '13:00', 'trip', 'Frankfurt am Main', 45),
        w('c1', '2026-11-08', '09:00', '09:45', 'trip', 'Messe Musterstadt', 25),
        w('c2', '2026-11-08', '09:45', '14:00', 'custom-1', 'Messe Musterstadt', 0, { note: '' }),
        w('c3', '2026-11-08', '14:00', '14:45', 'trip', 'Frankfurt am Main', 25),
      ];
      const mins = (e) => { const [h1, m1] = e.start.split(':').map(Number); const [h2, m2] = e.end.split(':').map(Number); return (h2 * 60 + m2) - (h1 * 60 + m1) - (e.breakMinutes || 0); };
      const m = F.computeFieldServiceMonth(list, fs, mins);
      test('km gesamt', [m.km, m.amount, m.trips.length, m.tripDays, m.kmCompany], [475, 142.5, 6, 3, 0]);
      const day = (dt) => m.trips.filter(t => t.date === dt).reduce((s, t) => [s[0] + t.km, Math.round((s[1] + t.amount) * 100) / 100], [0, 0]);
      test('Tagessummen', [day('2026-11-03'), day('2026-11-05'), day('2026-11-08')], [[335, 100.5], [90, 27], [50, 15]]);
      test('Von/Nach/Anlass', m.trips.slice(0, 2).map(t => [t.from, t.to, t.reason]), [['Frankfurt am Main', 'Beispiel AG, Kassel', 'Kundentermin'], ['Beispiel AG, Kassel', 'Frankfurt am Main', 'Rückfahrt']]);
      test('Anlass eigene Tätigkeit', m.trips[4].reason, 'Messe');
      test('Fahrtzeit', m.tripMin, 150 + 120 + 60 + 60 + 45 + 45);
      const comp = F.computeFieldServiceMonth([w('d1', '2026-11-10', '08:00', '09:00', 'trip', 'X', 100, { vehicle: 'company' })], fs, mins);
      test('Dienstwagen ohne Betrag', [comp.km, comp.kmCompany, comp.amount], [100, 100, 0]);
      test('Präfix', [F.fieldServicePrefix(list[1], fs), F.noteWithFieldService({ ...list[2], note: 'Wartung' }, fs), F.noteWithFieldService({ note: 'x' }, fs)],
        ['Fahrt · Beispiel AG, Kassel · 190 km', 'Kundentermin · Beispiel AG, Kassel – Wartung', 'x']);
      test('gelöschte Tätigkeit behält Namen', F.activityLabelOf({ activity: 'custom-9', activityLabel: 'Montage' }, fs), 'Montage');
      const bd = F.buildEntryFieldServiceData(fs, { activity: 'trip', location: ' Kassel ', km: '12,34', vehicle: '' });
      test('Eingabe Fahrt', bd, { activity: 'trip', activityLabel: 'Fahrt', location: 'Kassel', km: 12.3, vehicle: 'private' });
      test('Eingabe ohne Fahrt', F.buildEntryFieldServiceData(fs, { activity: 'client', km: '50' }).km, 0);

      // Sonntage.
      test('Sonntage im Jahr', [SH.countSundaysInYear(2026), SH.countSundaysInYear(2027), SH.countSundaysInYear(2023)], [52, 52, 53]);
      const emps = [{ id: 'g', name: 'Muster GmbH', kind: 'employer' }, { id: 'c', name: 'Beispiel Café', kind: 'employer' }, { id: 'k', name: 'Kunde AG', kind: 'client' }];
      const cafe = [];
      let dt = new Date(Date.UTC(2026, 3, 5));
      while (dt <= new Date(Date.UTC(2026, 10, 29))) { cafe.push({ id: 'cf' + cafe.length, employerId: 'c', date: dt.toISOString().slice(0, 10), type: 'work', start: '10:00', end: '15:00', breakMinutes: 0 }); dt = new Date(dt.getTime() + 7 * 864e5); }
      cafe.push({ id: 'msg', employerId: 'g', date: '2026-11-08', type: 'work', start: '10:00', end: '14:00', breakMinutes: 0 });
      cafe.push({ id: 'kd', employerId: 'k', date: '2026-01-04', type: 'work', start: '10:00', end: '14:00', breakMinutes: 0 });
      const cand = (date, id) => ({ id: id || 'new', employerId: 'c', date, type: 'work', start: '10:00', end: '15:00', breakMinutes: 0 });
      const stat = (date) => { const h = SH.computeSundayHintsForCandidate(cafe, emps, cand(date)); const c = h.find(x => x.kind === 'count'); return [c.stats.worked, c.stats.free, c.level]; };
      test('06.12.', stat('2026-12-06'), [36, 16, 'ok']);
      cafe.push(cand('2026-12-06', 'd06'));
      test('13.12. Grenze', stat('2026-12-13'), [37, 15, 'limit']);
      const lim = SH.computeSundayHintsForCandidate(cafe, emps, cand('2026-12-13')).find(x => x.kind === 'count');
      test('Text Grenze', lim.text, 'Mit diesem Eintrag an 37 von 52 Sonntagen gearbeitet – genau 15 bleiben frei. Jeder weitere Sonntag mit Arbeit unterschreitet § 11 Abs. 1 ArbZG.');
      cafe.push(cand('2026-12-13', 'd13'));
      test('20.12. unter Minimum', stat('2026-12-20'), [38, 14, 'below']);
      cafe.push(cand('2026-12-20', 'd20'));
      test('27.12.', stat('2026-12-27'), [39, 13, 'below']);
      const below = SH.computeSundayHintsForCandidate(cafe, emps, cand('2026-12-20', 'd20')).find(x => x.kind === 'count');
      test('Text unter Minimum', below.text, 'Mit diesem Eintrag an 38 von 52 Sonntagen gearbeitet (alle Arbeitgeber) – höchstens noch 14 frei. Mindestens 15 müssen beschäftigungsfrei bleiben (§ 11 Abs. 1 ArbZG).');
      test('Bearbeiten zählt nicht doppelt', SH.computeSundayStats(cafe, emps, 2026, cand('2026-12-20', 'd20')).worked, 38);
      test('Kunde zählt nicht', SH.computeSundayHintsForCandidate(cafe, emps, { ...cand('2026-12-27'), employerId: 'k' }), []);
      test('Werktag ohne Hinweis', SH.computeSundayHintsForCandidate(cafe, emps, cand('2026-12-22')), []);
      const tv = emps.map(e => e.kind === 'employer' ? { ...e, minFreeSundays: 10 } : e);
      test('Tarifvertrag 10', SH.computeSundayStats(cafe, tv, 2026).minFree, 10);
      test('strengster Wert gilt', SH.computeSundayStats(cafe, tv.map(e => e.id === 'g' ? { ...e, minFreeSundays: 15 } : e), 2026).minFree, 15);
      test('Arbeitgeber ohne Sonntagsarbeit zählt nicht', SH.computeSundayStats(cafe.filter(e => e.employerId !== 'g'), tv.map(e => e.id === 'g' ? { ...e, minFreeSundays: 15 } : e), 2026).minFree, 10);
      test('ungültiger Wert → 15', [SH.normalizeMinFreeSundays(7), SH.normalizeMinFreeSundays('8'), SH.normalizeMinFreeSundays(undefined)], [15, 8, 15]);
      const hol = SH.computeSundayHintsForCandidate([], emps, cand('2026-12-25'), (iso) => iso === '2026-12-25' ? { name: '1. Weihnachtstag' } : null);
      test('Feiertag Werktag', [hol.length, hol[0].kind, hol[0].text.includes('acht Wochen')], [1, 'holiday', true]);
      test('Schalter', [SH.isSundayHintEnabled({}), SH.isSundayHintEnabled({ sundayHintEnabled: false }), SH.isSundayHintEnabled({ arbzgHintsEnabled: false })], [true, false, false]);
      const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      test('Escape Feiertag', SH.buildSundayHintParagraphs([{ kind: 'holiday', holidayName: '<b>', text: 'x' }], esc).includes('<b>'), false);

      // Backup-Validierung.
      const backup = (patch) => ({ schemaVersion: 7, employers: [{ id: 'g', name: 'Muster GmbH', kind: 'employer', ...(patch.emp || {}) }], entries: patch.entries || [], archives: [], templates: [], auditLog: [],
        settings: { state: 'HE', appMode: 'employee', ...(patch.settings || {}) }, activeEmployerId: null, runningTimer: patch.timer || null });
      const ok = (p) => { try { validateBackup(backup(p)); return true; } catch { return false; } };
      const fsOk = { enabled: true, employerIds: ['g'], activities: [{ id: 'office', label: 'Büro', builtin: true, hidden: false, isTrip: false }, { id: 'custom-1', label: 'Messe', builtin: false, hidden: false, isTrip: true }], kmEnabled: true, kmRate: 0.3, defaultVehicle: 'private', kmPrompt: 'end', showTodayList: false };
      test('Backup gültig', [
        ok({ settings: { fieldService: fsOk, sundayHintEnabled: false } }),
        ok({ emp: { minFreeSundays: 10 } }),
        ok({ entries: [w('e1', '2026-11-03', '07:00', '09:00', 'trip', 'Kassel', 190, { vehicle: 'company', activityLabel: 'Fahrt' })] }),
        ok({ entries: [w('e1', '2026-11-03', '07:00', '09:00', '', '', 0, { vehicle: '' })] }),
        ok({ timer: { employerId: 'g', startISO: '2026-11-03T07:00:00.000Z', type: 'work', activity: 'trip', activityLabel: 'Fahrt', location: 'Kassel' } }),
      ], [true, true, true, true, true]);
      test('Backup ungültig', [
        ok({ emp: { minFreeSundays: 12 } }),
        ok({ entries: [w('e1', '2026-11-03', '07:00', '09:00', 'trip', 'Kassel', 190, { vehicle: 'lkw' })] }),
        ok({ entries: [w('e1', '2026-11-03', '07:00', '09:00', 'trip', 'Kassel', '190')] }),
        ok({ settings: { fieldService: { ...fsOk, kmPrompt: 'nie' } } }),
        ok({ settings: { sundayHintEnabled: 'ja' } }),
      ], [false, false, false, false, false]);
      return out;
    });
    for (const [n, v, e] of results) check(n, v, e);

    // UI mit Beispieldaten.
    await page.evaluate(() => {
      const mk = (on, st, en, br) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((k, i) => [k, { enabled: on.includes(i), start: on.includes(i) ? st : '', end: on.includes(i) ? en : '', break: on.includes(i) ? br : 0 }]));
      const s = window.state;
      s.settings.appMode = 'employee'; s.settings.state = 'HE'; s.settings.employeeName = 'Max Mustermann';
      delete s.settings.fieldService; delete s.settings.sundayHintEnabled; s.settings.arbzgHintsEnabled = true;
      s.employers = [
        { id: 'g', name: 'Muster GmbH', kind: 'employer', color: '#2563eb', contacts: [], hoursMode: 'week', weeklyHours: 40, monthlyHours: 0, schedule: mk([0, 1, 2, 3, 4], '08:00', '16:30', 30), hiredSince: '2024-01-01', employmentEndDate: '', annualVacation: 30, breakMode: 'legal', employmentScope: 'vollzeit' },
        { id: 'c', name: 'Beispiel Café', kind: 'employer', color: '#c2410c', contacts: [], hoursMode: 'month', weeklyHours: 0, monthlyHours: 20, schedule: mk([6], '10:00', '15:00', 0), hiredSince: '2026-04-01', employmentEndDate: '', annualVacation: 24, breakMode: 'legal', employmentScope: 'minijob' },
      ];
      s.activeEmployerId = 'g'; s.runningTimer = null;
      s.entries = [];
      let d = new Date(Date.UTC(2026, 3, 5)); let i = 0;
      while (d <= new Date(Date.UTC(2026, 10, 1))) { s.entries.push({ id: 'cf' + (i++), employerId: 'c', date: d.toISOString().slice(0, 10), type: 'work', start: '10:00', end: '15:00', breakMinutes: 0 }); d = new Date(d.getTime() + 7 * 864e5); }
      window.saveState();
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      window.switchView('tracker'); window.renderTracker();
    });
    const vis = (sel) => page.evaluate((q) => { const el = document.querySelector(q); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, sel);

    // Standard: aus — nichts Neues sichtbar.
    check('aus: Tracker', await vis('#tracker-fs'), false);
    check('Sonntagshinweis Tracker', await page.locator('[data-testid="hint-sunday-count"]').first().textContent(), 'Freie Sonntage 2026: Einschließlich heute an 32 von 52 Sonntagen gearbeitet – noch 20 frei, mindestens 15 müssen beschäftigungsfrei bleiben (§ 11 Abs. 1 ArbZG).');
    await page.evaluate(() => window.openEntryModal(null, { presetType: 'work' }));
    check('aus: Dialog', [await vis('#entry-fs-block'), await vis('#entry-more-toggle'), await vis('#entry-note'), await vis('#entry-save-next-row')], [false, false, true, false]);
    check('Sonntag im Dialog', (await page.locator('#entry-arbzg-hint').textContent()).includes('Sonntag: Arbeit an Sonn- und Feiertagen'), true);
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));
    check('Kilometer-PDF-Knopf aus', await page.evaluate(() => { window.switchView('report'); return document.getElementById('btn-export-km-pdf').classList.contains('hidden'); }), true);

    // Einstellungen einschalten.
    await page.evaluate(() => window.switchView('settings'));
    check('Einstellungsblock zu', await vis('#settings-block-fieldservice .fs-settings-body'), false);
    await page.check('#setting-fs-enabled');
    await page.check('[data-testid="checkbox-fs-emp-g"]');
    check('Einstellung gespeichert', await page.evaluate(() => ({ e: window.state.settings.fieldService.enabled, ids: window.state.settings.fieldService.employerIds })), { e: true, ids: ['g'] });
    check('nur Arbeitgeber', await page.locator('[data-fs-emp]').count(), 2);
    // Eigene Tätigkeit anlegen.
    await page.click('#btn-fs-add-activity');
    await page.fill('#fs-activity-label', 'Messe');
    await page.click('[data-testid="button-fs-activity-save"]');
    check('eigene Tätigkeit', await page.evaluate(() => window.state.settings.fieldService.activities.filter(a => !a.builtin).map(a => [a.id, a.label, a.isTrip])), [['custom-1', 'Messe', false]]);
    await page.click('[data-testid="chip-setting-activity-office"]');
    check('Büro ausblenden', await page.evaluate(() => window.state.settings.fieldService.activities.find(a => a.id === 'office').hidden), true);
    await page.click('[data-testid="chip-setting-activity-office"]');
    await page.fill('#setting-fs-rate', '0,35');
    await page.dispatchEvent('#setting-fs-rate', 'change');
    check('Kilometersatz', await page.evaluate(() => window.state.settings.fieldService.kmRate), 0.35);
    await page.fill('#setting-fs-rate', '0,30');
    await page.dispatchEvent('#setting-fs-rate', 'change');
    await page.uncheck('#setting-sunday-hint');
    check('Sonntagshinweis aus', await page.evaluate(() => window.state.settings.sundayHintEnabled), false);
    await page.check('#setting-sunday-hint');

    // Dialog: Tätigkeit, Kilometer, Speichern und nächsten Block.
    await page.evaluate(() => window.openEntryModal(null, { presetType: 'work' }));
    await page.selectOption('#entry-employer', 'g');
    await page.evaluate(() => { document.getElementById('entry-employer').dispatchEvent(new Event('change', { bubbles: true })); });
    check('an: Dialog', [await vis('#entry-fs-block'), await vis('#entry-more-toggle'), await vis('#entry-note'), await vis('#entry-save-next-row')], [true, true, false, true]);
    check('Chips', await page.locator('#entry-fs-chips .fs-chip').allTextContents(), ['Büro', 'Kundentermin', 'Fahrt', 'Messe']);
    await page.click('[data-testid="chip-entry-activity-trip"]');
    check('Kilometerfeld', await vis('#entry-fs-km-row'), true);
    await page.fill('#entry-date', '2026-11-03');
    await page.fill('#entry-start', '07:00');
    await page.fill('#entry-end', '09:30');
    await page.fill('#entry-break', '0');
    await page.fill('#entry-fs-location', 'Beispiel AG, Kassel');
    await page.fill('#entry-fs-km', '190');
    await page.click('#btn-save-next-entry');
    check('Block gespeichert', await page.evaluate(() => { const e = window.state.entries.find(x => x.date === '2026-11-03' && x.start === '07:00'); return e && [e.activity, e.activityLabel, e.location, e.km, e.vehicle]; }), ['trip', 'Fahrt', 'Beispiel AG, Kassel', 190, 'private']);
    check('nächster Block', [await vis('#modal-entry'), await page.inputValue('#entry-start'), await page.inputValue('#entry-date'), await page.inputValue('#entry-fs-activity')], [true, '09:30', '2026-11-03', '']);
    await page.click('#entry-more-toggle');
    check('Bemerkung aufgeklappt', await vis('#entry-note'), true);
    await page.click('[data-testid="chip-entry-activity-client"]');
    check('kein Kilometerfeld', await vis('#entry-fs-km-row'), false);
    await page.fill('#entry-end', '13:00');
    await page.fill('#entry-note', 'Wartung');
    await page.fill('#entry-fs-location', 'Beispiel AG, Kassel');
    await page.click('#form-entry button[type="submit"]');
    await page.evaluate(() => {
      const s = window.state;
      s.entries.push({ id: 'rt', employerId: 'g', date: '2026-11-03', type: 'work', start: '13:00', end: '15:00', breakMinutes: 0, activity: 'trip', activityLabel: 'Fahrt', location: 'Frankfurt am Main', km: 145, vehicle: 'private' });
      window.saveState();
      window.switchView('report');
      document.getElementById('report-employer').value = 'g';
      document.getElementById('report-month').value = '2026-11';
      window.renderReport();
    });
    check('Monat: Fußzeile', await page.locator('[data-testid="report-fs-footer"]').textContent(), 'Tätigkeiten: Fahrt 4:30 · Kundentermin 3:30 · Kilometer: 335 km (100,50 €)');
    check('Monat: Bemerkung', (await page.locator('#report-content').textContent()).includes('Kundentermin · Beispiel AG, Kassel – Wartung'), true);
    check('Kilometer-PDF-Knopf', await vis('#btn-export-km-pdf'), true);
    const pdf = await page.evaluate(async () => { const b = await window.generateKmPdfBlob(window.getCurrentReport()); return [b.type, b.size > 2000]; });
    check('Kilometer-PDF', pdf, ['application/pdf', true]);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-km-pdf')]);
    check('Dateiname', dl.suggestedFilename().endsWith('-kilometer.pdf'), true);
    const csv = await page.evaluate(async () => { const b = await window.generateCsvBlob(window.getCurrentReport()); return b.text(); });
    check('CSV Spalten', csv.includes('Grund/Bemerkung;Tätigkeit;Einsatzort;Sonn/Feiertag;Kilometer;Fahrzeug'), true);
    check('CSV Zeile', csv.includes('03.11.2026;Arbeit;07:00;09:30;0;2:30;;Fahrt;Beispiel AG, Kassel;;190;Privat-PKW'), true);
    check('CSV Summe', csv.includes('Kilometer gesamt;335'), true);
    const csvCafe = await page.evaluate(async () => { document.getElementById('report-employer').value = 'c'; window.renderReport(); const b = await window.generateCsvBlob(window.getCurrentReport()); return b.text(); });
    check('CSV ohne Außendienst', csvCafe.includes('Tätigkeit'), false);

    // Reiter „Erfassen“: Start mit Tätigkeit, Wechsel, Kilometer-Abfrage, Liste „Heute“.
    await page.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); window.switchView('tracker'); window.state.activeEmployerId = 'g'; window.renderTracker(); });
    check('an: Tracker', await vis('#tracker-fs'), true);
    await page.click('[data-testid="chip-tracker-activity-trip"]');
    await page.fill('#tracker-fs-location', 'Messe Musterstadt');
    await page.click('#btn-start');
    check('Timer', await page.evaluate(() => { const r = window.state.runningTimer; return [r.activity, r.location]; }), ['trip', 'Messe Musterstadt']);
    check('Live-Label', await page.locator('#live-status .live-label').textContent(), 'Fahrt läuft seit');
    await page.clock.runFor(45 * 60000);
    await page.fill('#tracker-fs-next-location', 'Messe Musterstadt');
    await page.click('[data-testid="chip-switch-activity-custom-1"]');
    check('km-Abfrage', await vis('#modal-fs-km'), true);
    await page.fill('#fs-km-input-0', '25');
    await page.click('#btn-fs-km-save');
    check('Wechsel gespeichert', await page.evaluate(() => { const e = window.state.entries.filter(x => x.date === '2026-11-08' && x.employerId === 'g'); const r = window.state.runningTimer; return [e.length, e[0].start, e[0].end, e[0].activity, e[0].km, r.activity, r.location, new Date(r.startISO).getMinutes()]; }), [1, '16:00', '16:45', 'trip', 25, 'custom-1', 'Messe Musterstadt', 45]);
    check('Liste Heute', await page.locator('[data-testid="list-fs-today"] li').count(), 2);
    check('Monatskachel km', (await page.locator('#today-summary').textContent()).includes('360 km'), true);
    await page.clock.runFor(60 * 60000);
    await page.click('#btn-end');
    check('Arbeitsende-Dialog', [await vis('#modal-entry'), await page.inputValue('#entry-fs-activity'), await page.inputValue('#entry-fs-location')], [true, 'custom-1', 'Messe Musterstadt']);
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));

    // Arbeitgeber: Mindestens freie Sonntage.
    await page.evaluate(() => window.openEmployerModal && window.openEmployerModal(window.state.employers.find(e => e.id === 'c')));
    if (await page.locator('#employer-min-free-sundays').isVisible()) {
      await page.selectOption('#employer-min-free-sundays', '10');
      await page.click('#form-employer button[type="submit"]');
      check('Arbeitgeber 10 Sonntage', await page.evaluate(() => window.state.employers.find(e => e.id === 'c').minFreeSundays), 10);
    } else {
      check('Arbeitgeber-Dialog öffnet', false, true);
    }

    // Ausschalten: alles wieder wie vorher.
    await page.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); window.switchView('settings'); });
    await page.uncheck('#setting-fs-enabled');
    await page.evaluate(() => { window.switchView('tracker'); window.renderTracker(); });
    check('wieder aus: Tracker', [await vis('#tracker-fs'), await vis('#tracker-fs-today')], [false, false]);
  } finally {
    await context.close();
  }
}
