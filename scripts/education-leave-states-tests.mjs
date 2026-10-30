// v3.11.0: Bildungsurlaub für alle Bundesländer — Regeltabelle, Zeiträume, Wartezeit,
// abweichender Anspruch, Formularfeld, Urlaubsplanung und Zeitraum-Dialog.
// Rechenbeispiele aus der Vorschau: Muster GmbH, 5-Tage-Woche, angestellt seit 01.03.2025.

export async function runEducationLeaveStatesTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.11.0: Bildungsurlaub nach Bundesland ===');
  const check = (name, value, expected) => assertEq(`BL ${name}`, JSON.stringify(value), JSON.stringify(expected));
  const context = await browser.newContext({ timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => check(`Browserfehler: ${e.message}`, true, false));
  await page.clock.install({ time: new Date('2026-10-30T10:00:00+01:00') });
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => typeof window.renderTracker === 'function');
    const results = await page.evaluate(async () => {
      const C = await import('/modules/compute.js');
      const RL = await import('/modules/education-leave-rules.js');
      const EM = await import('/modules/ui/employer-modal.js');
      const { validateBackup } = await import('/modules/backup-validation.js');
      const out = [], test = (n, v, e) => out.push([n, v, e]);
      const off = Object.fromEntries(C.DAY_KEYS.map(k => [k, { enabled: false, start: '', end: '', break: 0 }]));
      const on = { enabled: true, start: '08:00', end: '16:00', break: 0 };
      const emp = { id: 'm', name: 'Muster GmbH', kind: 'employer', color: '#123456', contacts: [], hoursMode: 'week',
        weeklyHours: 40, monthlyHours: 0, schedule: off, hiredSince: '2025-03-01', employmentEndDate: '', annualVacation: 30, breakMode: 'legal' };
      const bu = (d) => ({ id: 'e' + d, employerId: 'm', date: d, type: 'education_leave' });
      const today = '2026-10-30';
      const pick = (el) => [el.periodLabel, el.entitlement, el.taken, el.upcoming, el.remaining];

      // Regeltabelle: alle 16 Länder vorhanden.
      test('16 Länder', Object.keys(RL.EDUCATION_LEAVE_RULES).sort(),
        ['BB', 'BE', 'BW', 'BY', 'HB', 'HE', 'HH', 'MV', 'NI', 'NW', 'RP', 'SH', 'SL', 'SN', 'ST', 'TH']);

      // Beispiel 1 Hessen: 5 Tage, 21.–25.09.2026 genommen → 0 verfügbar.
      const he = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'].map(bu);
      let el = C.computeEducationLeaveYear(emp, 2026, he, today, 'HE');
      test('HE Beispiel', [...pick(el), el.law, el.eligibleFrom], ['2026', 5, 5, 0, 0, 'HBUG', '2025-09-01']);
      test('HE ohne Bundesland (Standard)', C.computeEducationLeaveYear(emp, 2026, he, today).law, 'HBUG');
      test('unbekanntes Bundesland → HE', C.computeEducationLeaveYear(emp, 2026, he, today, 'XX').stateCode, 'HE');
      const four = { ...emp, schedule: { ...off, mon: on, tue: on, wed: on, thu: on } };
      test('HE 4-Tage-Woche → 4', C.computeEducationLeaveYear(four, 2026, [], today, 'HE').entitlement, 4);

      // Beispiel 2 Rheinland-Pfalz: Zeitraum 2025/2026, 3 + 5 genommen → 2 verfügbar.
      const rp = ['2025-11-17', '2025-11-18', '2025-11-19', ...he.map(e => e.date)].map(bu);
      el = C.computeEducationLeaveYear(emp, 2026, rp, today, 'RP');
      test('RP Beispiel 2026', [...pick(el), el.biennial, el.law], ['2025/2026', 10, 8, 0, 2, true, 'BFG']);
      test('RP 2025 gleicher Zeitraum', pick(C.computeEducationLeaveYear(emp, 2025, rp, today, 'RP')), ['2025/2026', 10, 8, 0, 2]);
      test('RP 2027 neuer Zeitraum', pick(C.computeEducationLeaveYear(emp, 2027, rp, today, 'RP')), ['2027/2028', 10, 0, 0, 10]);
      test('RP 4-Tage-Woche → 8', C.computeEducationLeaveYear(four, 2026, [], today, 'RP').entitlement, 8);

      // Beispiel 3 Bayern: kein Gesetz → 0; abweichender Anspruch 2 → 2.
      el = C.computeEducationLeaveYear(emp, 2026, [], today, 'BY');
      test('BY ohne Gesetz', [el.noLaw, el.entitlement, el.override, el.periodLabel], [true, 0, false, '2026']);
      el = C.computeEducationLeaveYear({ ...emp, educationLeaveDays: 2 }, 2026, [], today, 'BY');
      test('BY abweichend 2', [el.override, el.entitlement, el.remaining], [true, 2, 2]);
      el = C.computeEducationLeaveYear({ ...emp, educationLeaveDays: 0 }, 2026, [], today, 'HE');
      test('HE abweichend 0', [el.override, el.entitlement], [true, 0]);
      el = C.computeEducationLeaveYear({ ...emp, educationLeaveDays: null }, 2026, [], today, 'HE');
      test('HE abweichend null = Gesetz', [el.override, el.entitlement], [false, 5]);
      el = C.computeEducationLeaveYear({ ...emp, hiredSince: '2026-08-01', educationLeaveDays: 7 }, 2026, [], today, 'HE');
      test('abweichend ohne Wartezeit', [el.notEligible, el.entitlement], [false, 7]);
      el = C.computeEducationLeaveYear({ ...emp, educationLeaveDays: 12 }, 2026, rp, today, 'RP');
      test('RP abweichend pro Zeitraum', [el.periodLabel, el.entitlement, el.remaining], ['2025/2026', 12, 4]);

      // Sachsen: vor 2027 kein Gesetz, ab 2027 3 Tage (4-Tage-Woche 2,4).
      el = C.computeEducationLeaveYear(emp, 2026, [], today, 'SN');
      test('SN 2026', [el.noLaw, el.entitlement, el.firstYear], [true, 0, 2027]);
      test('SN 2027', [C.computeEducationLeaveYear(emp, 2027, [], today, 'SN').entitlement, C.computeEducationLeaveYear(emp, 2027, [], today, 'SN').law], [3, 'SächsQZG']);
      test('SN 2027 4-Tage-Woche', C.computeEducationLeaveYear(four, 2027, [], today, 'SN').entitlement, 2.4);

      // Niedersachsen: Gesetzeswechsel 2027.
      test('NI 2026/2027', [C.computeEducationLeaveYear(emp, 2026, [], today, 'NI').law, C.computeEducationLeaveYear(emp, 2027, [], today, 'NI').law], ['NBildUG', 'NBildZG']);

      // Mecklenburg-Vorpommern: Eintritt im geraden Jahr → 5 Tage in diesem Jahr.
      const mv = { ...emp, hiredSince: '2026-01-01' };
      el = C.computeEducationLeaveYear(mv, 2026, [], today, 'MV');
      test('MV Eintritt 2026', [el.periodLabel, el.entitlement, el.halfYear, el.eligibleFrom], ['2026', 5, true, '2026-07-01']);
      test('MV danach 2027/2028', pick(C.computeEducationLeaveYear(mv, 2027, [], today, 'MV')), ['2027/2028', 10, 0, 0, 10]);
      test('MV Eintritt 2025', pick(C.computeEducationLeaveYear(emp, 2026, [], today, 'MV')), ['2025/2026', 10, 0, 0, 10]);
      el = C.computeEducationLeaveYear({ ...emp, hiredSince: '2026-08-01' }, 2026, [], today, 'MV');
      test('MV Wartezeit über Jahresende', [el.notEligible, el.entitlement], [true, 0]);

      // Hamburg/Bremen/Brandenburg: Zeitraum ab Eintrittsjahr.
      const hh = { ...emp, hiredSince: '2026-04-01' };
      test('HH Eintritt 2026', pick(C.computeEducationLeaveYear(hh, 2026, [], today, 'HH')), ['2026/2027', 10, 0, 0, 10]);
      test('HH 2027 gleicher Zeitraum', C.computeEducationLeaveYear(hh, 2027, [], today, 'HH').periodLabel, '2026/2027');
      test('HB 2028 neuer Zeitraum', C.computeEducationLeaveYear(hh, 2028, [], today, 'HB').periodLabel, '2028/2029');
      test('BB Eintritt 2025', C.computeEducationLeaveYear(emp, 2026, [], today, 'BB').periodLabel, '2025/2026');
      test('HH ohne Eintritt → ungerade', C.computeEducationLeaveYear({ ...emp, hiredSince: '' }, 2026, [], today, 'HH').periodLabel, '2025/2026');
      el = C.computeEducationLeaveYear({ ...emp, hiredSince: '2026-09-01' }, 2026, [], today, 'HH');
      test('HH Wartezeit im Zeitraum erfüllt', [el.notEligible, el.entitlement, el.eligibleFrom], [false, 10, '2027-03-01']);

      // Baden-Württemberg: 12 Monate Wartezeit.
      el = C.computeEducationLeaveYear({ ...emp, hiredSince: '2026-03-01' }, 2026, [], today, 'BW');
      test('BW 12 Monate', [el.notEligible, el.eligibleFrom, el.waitMonths], [true, '2027-03-01', 12]);
      test('BW Folgejahr', C.computeEducationLeaveYear({ ...emp, hiredSince: '2026-03-01' }, 2027, [], today, 'BW').entitlement, 5);

      // Schleswig-Holstein: 6-Tage-Woche → 6.
      const six = { ...emp, schedule: { ...off, mon: on, tue: on, wed: on, thu: on, fri: on, sat: on } };
      test('SH 6-Tage-Woche', C.computeEducationLeaveYear(six, 2026, [], today, 'SH').entitlement, 6);

      // Eingabefeld.
      test('Feld leer', EM.parseEducationLeaveDays(''), null);
      test('Feld Komma', EM.parseEducationLeaveDays('2,5'), 2.5);
      test('Feld negativ', EM.parseEducationLeaveDays('-1'), null);
      test('Feld Text', EM.parseEducationLeaveDays('abc'), null);
      test('Feld Obergrenze', EM.parseEducationLeaveDays('150'), 99);
      test('Feld 0', EM.parseEducationLeaveDays('0'), 0);

      // Backup.
      const backup = (v) => ({ schemaVersion: 7, employers: [{ ...emp, educationLeaveDays: v }], entries: [], archives: [], templates: [], auditLog: [],
        settings: { state: 'RP', appMode: 'employee' }, activeEmployerId: 'm', runningTimer: null });
      const ok = (v) => { try { validateBackup(backup(v)); return true; } catch { return false; } };
      test('Backup educationLeaveDays', [ok(null), ok(3), ok('x')], [true, true, false]);
      return out;
    });
    for (const [n, v, e] of results) check(n, v, e);

    // UI: Urlaubsplanung in Rheinland-Pfalz und Bayern.
    const setup = async (stateCode, extra = {}) => {
      await page.evaluate(({ stateCode, extra }) => {
        const off = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(k => [k, { enabled: false, start: '', end: '', break: 0 }]));
        const s = window.state;
        s.settings.appMode = 'employee'; s.settings.state = stateCode;
        s.employers = [{ id: 'm', name: 'Muster GmbH', kind: 'employer', color: '#123456', contacts: [], hoursMode: 'week', weeklyHours: 40, monthlyHours: 0,
          schedule: off, hiredSince: '2025-03-01', employmentEndDate: '', annualVacation: 30, breakMode: 'legal', ...extra }];
        s.activeEmployerId = 'm';
        s.entries = ['2025-11-17', '2025-11-18', '2025-11-19', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
          .map(d => ({ id: 'b' + d, employerId: 'm', date: d, type: 'education_leave', note: '' }));
        window.saveState();
      }, { stateCode, extra });
      await page.reload();
      await page.waitForFunction(() => typeof window.renderTracker === 'function');
      await page.evaluate(() => document.getElementById('modal-whatsnew')?.classList.add('hidden'));
    };
    await setup('RP');
    await page.evaluate(() => window.switchView('vacation-planning'));
    let block = await page.locator('[data-testid="education-leave-block"]').innerText();
    check('RP Block', [block.includes('Bildungsurlaub 2025/2026'), block.includes('Rheinland-Pfalz') && block.includes('(6 Monate nach Beschäftigungsbeginn)'), /Noch verfügbar\s*2 Tage/i.test(block), /Bereits genommen\s*8 Tage/i.test(block)], [true, true, true, true]);
    await setup('BY');
    await page.evaluate(() => window.switchView('vacation-planning'));
    block = await page.locator('[data-testid="education-leave-block"]').innerText();
    check('BY Block', [block.includes('kein Bildungsurlaubsgesetz'), block.includes('Abweichender Bildungsurlaub-Anspruch'), /Anspruch 2026\s*0 Tage/i.test(block)], [true, true, true]);

    // Formular: Feld speichern und wieder laden.
    await page.evaluate(() => window.switchView('employers'));
    await page.locator('.employer-card[data-id="m"]').first().click();
    await page.waitForSelector('#employer-education-leave-days', { state: 'visible' });
    check('Formular Hinweis BY', (await page.locator('#employer-education-leave-hint').innerText()).includes('kein Bildungsurlaubsgesetz'), true);
    check('Formular leer', await page.inputValue('#employer-education-leave-days'), '');
    await page.fill('#employer-education-leave-days', '2');
    await page.evaluate(() => document.getElementById('form-employer').requestSubmit());
    check('gespeichert 2', await page.evaluate(() => window.state.employers.find(e => e.id === 'm').educationLeaveDays), 2);
    await page.evaluate(() => window.switchView('vacation-planning'));
    block = await page.locator('[data-testid="education-leave-block"]').innerText();
    check('BY Block abweichend', [/Anspruch 2026\s*2 Tage/i.test(block), block.includes('Abweichender Anspruch laut Arbeitgeber')], [true, true]);

    // Zeitraum-Dialog in Rheinland-Pfalz: Zeitraum 2025/2026, 8 erfasst.
    await setup('RP');
    await page.evaluate(() => window.switchView('tracker'));
    await page.click('#btn-add-range');
    await page.selectOption('#range-type', 'education_leave');
    await page.fill('#range-start', '2026-11-02');
    await page.dispatchEvent('#range-start', 'change');
    await page.fill('#range-end', '2026-11-03');
    await page.dispatchEvent('#range-end', 'change');
    const stats = await page.locator('#range-vacation-stats').innerText();
    check('Zeitraum-Dialog RP', [stats.includes('Zeitraum 2025/2026'), stats.includes('Anspruch 10'), stats.includes('bereits erfasst: 8'), stats.includes('nach diesem Eintrag: 10 von 10'), stats.includes('(BFG)')], [true, true, true, true, true]);
  } finally {
    await context.close();
  }
}
