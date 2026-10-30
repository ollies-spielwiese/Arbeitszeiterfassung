// v3.12.0: Hinweis Arbeitszeitgesetz über alle Arbeitgeber — Tageshöchstzeit (§ 3 i. V. m. § 2 ArbZG)
// und Ruhezeit (§ 5 ArbZG), Dialog, Home-Office-Dialog, Woche, Übersicht und Einstellung.
// Rechenbeispiel aus der Vorschau: Mo 26.10.2026 Muster GmbH 08:00–14:30 (0:30 Pause) = 6:00,
// Beispiel Café 17:00–22:00 = 5:00, Summe 11:00 > 10:00. Ruhezeit Mo 22:00 → Di 08:00 = 10:00 < 11:00.

export async function runArbzgHintsTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.12.0: Hinweis Arbeitszeitgesetz ===');
  const check = (name, value, expected) => assertEq(`ArbZG ${name}`, JSON.stringify(value), JSON.stringify(expected));
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
      const A = await import('/modules/arbzg-hints.js');
      const S = await import('/modules/state.js');
      const { validateBackup } = await import('/modules/backup-validation.js');
      const out = [], test = (n, v, e) => out.push([n, v, e]);
      const emps = [{ id: 'g', name: 'Muster GmbH', kind: 'employer' }, { id: 'c', name: 'Beispiel Café', kind: 'employer' },
        { id: 'k', name: 'Kunde AG', kind: 'client' }];
      const w = (id, employerId, date, start, end, breakMinutes = 0) => ({ id, employerId, date, type: 'work', start, end, breakMinutes });
      const base = [w('g26', 'g', '2026-10-26', '08:00', '14:30', 30), w('c26', 'c', '2026-10-26', '17:00', '22:00'),
        w('g27', 'g', '2026-10-27', '08:00', '14:30', 30)];
      const pick = (h) => h.type === 'daily' ? [h.type, h.date, h.totalMin, h.parts.map(p => [p.name, p.min])]
        : [h.type, h.date, h.restMin, h.prevEnd, h.prevName, h.nextStart, h.nextName];

      // Beispiel aus der Vorschau.
      const hints = A.computeArbzgHints(base, emps, '2026-10-01', '2026-10-31');
      test('Beispiel', hints.map(pick), [
        ['daily', '2026-10-26', 660, [['Muster GmbH', 360], ['Beispiel Café', 300]]],
        ['rest', '2026-10-27', 600, '22:00', 'Beispiel Café', '08:00', 'Muster GmbH'],
      ]);
      test('Dialogtext Tag', A.arbzgDialogText(hints[0]),
        'Am 26.10.2026 kommst du über alle Arbeitgeber auf 11:00 Std. (Muster GmbH 6:00 + Beispiel Café 5:00). Erlaubt sind höchstens 10 Std. pro Tag (§ 3 ArbZG, Zeiten mehrerer Arbeitgeber werden nach § 2 zusammengerechnet).');
      test('Dialogtext Ruhezeit', A.arbzgDialogText(hints[1]),
        'Zwischen Arbeitsende am 26.10.2026 um 22:00 (Beispiel Café) und Arbeitsbeginn am 27.10.2026 um 08:00 (Muster GmbH) liegen nur 10:00 Std. Ruhezeit. Vorgeschrieben sind mindestens 11 Std. (§ 5 ArbZG).');
      test('Kurzform', hints.map(h => [A.arbzgShortLabel(h), A.arbzgLimitLabel(h), A.arbzgComposition(h)]), [
        ['11:00 Std. am Tag', 'max. 10 Std.', 'Muster GmbH 6:00 + Beispiel Café 5:00'],
        ['10:00 Std. Ruhezeit', 'min. 11 Std.', 'Ende 22:00 Beispiel Café → Beginn 08:00 Muster GmbH'],
      ]);
      test('Wochentag', A.formatArbzgDateWeekday('2026-10-26'), 'Mo, 26.10.2026');

      // Grenzen: genau 10:00 kein Hinweis, 10:01 Hinweis; genau 11:00 Ruhezeit kein Hinweis, 10:59 Hinweis.
      const day = (endCafe) => A.computeArbzgHints([base[0], w('c', 'c', '2026-10-26', '17:00', endCafe)], emps, null, null);
      test('genau 10:00', day('21:00').length, 0);
      test('10:01', day('21:01').map(h => h.totalMin), [601]);
      const rest = (endCafe) => A.computeArbzgHints([w('c', 'c', '2026-10-26', '18:00', endCafe), base[2]], emps, null, null).filter(h => h.type === 'rest');
      test('Ruhezeit genau 11:00', rest('21:00').length, 0);
      test('Ruhezeit 10:59', rest('21:01').map(h => h.restMin), [659]);

      // Ein Arbeitgeber allein: Text ohne „über alle Arbeitgeber“ und ohne § 2.
      const solo = A.computeArbzgHints([w('s', 'g', '2026-10-26', '07:00', '18:30', 30)], emps, null, null);
      test('ein Arbeitgeber', A.arbzgDialogText(solo[0]),
        'Am 26.10.2026 kommst du auf 11:00 Std. (Muster GmbH 11:00). Erlaubt sind höchstens 10 Std. pro Tag (§ 3 ArbZG).');

      // Kunden zählen nicht, Abwesenheiten zählen nicht, Home-Office zählt mit.
      test('Kunde zählt nicht', A.computeArbzgHints([base[0], w('k', 'k', '2026-10-26', '17:00', '22:00')], emps, null, null).length, 0);
      test('Urlaub zählt nicht', A.computeArbzgHints([base[0], { id: 'v', employerId: 'c', date: '2026-10-26', type: 'vacation' }], emps, null, null).length, 0);
      const ho = { id: 'h', employerId: 'c', date: '2026-10-26', type: 'homeoffice', segments: [{ start: '15:00', end: '17:00' }, { start: '19:00', end: '22:00' }] };
      test('Home-Office zählt', A.computeArbzgHints([base[0], ho], emps, null, null).map(pick),
        [['daily', '2026-10-26', 660, [['Muster GmbH', 360], ['Beispiel Café', 300]]]]);
      test('Home-Office Ruhezeit', A.computeArbzgHints([ho, base[2]], emps, null, null).map(h => [h.type, h.restMin]), [['rest', 600]]);
      test('unbekannter Arbeitgeber', A.computeArbzgHints([w('x', 'zz', '2026-10-26', '06:00', '20:00')], emps, null, null).length, 0);

      // Nachtschicht über Mitternacht: zählt zum Eintragsdatum, Ende am Folgetag.
      const night = [w('n', 'c', '2026-10-26', '22:00', '06:00'), w('m', 'g', '2026-10-27', '14:00', '20:00')];
      test('Nachtschicht Ruhezeit', A.computeArbzgHints(night, emps, null, null).map(h => [h.type, h.date, h.restMin, h.prevEnd]), [['rest', '2026-10-27', 480, '06:00']]);
      test('Nachtschicht Netto', A.netWorkMinutes(night[0]), 480);

      // Zeitraum-Filter und Lücke (kein Vortag mit Arbeit → keine Ruhezeit-Prüfung).
      test('Zeitraum', A.computeArbzgHints(base, emps, '2026-10-27', '2026-10-27').map(h => h.type), ['rest']);
      test('kein Vortag', A.computeArbzgHints([base[1], w('g28', 'g', '2026-10-28', '06:00', '08:00')], emps, null, null).length, 0);

      // Dialog-Kandidat: ersetzt den Eintrag mit gleicher id, prüft Tag und Folgetag.
      const cand = A.computeArbzgHintsForCandidate(base, emps, w('c26', 'c', '2026-10-26', '17:00', '21:00'));
      test('Kandidat 10:00 und 11:00 Ruhezeit', cand.length, 0);
      test('Kandidat neu', A.computeArbzgHintsForCandidate(base.slice(0, 1), emps, w('', 'c', '2026-10-26', '17:00', '22:00')).map(h => h.type), ['daily']);
      test('Kandidat Folgetag', A.computeArbzgHintsForCandidate(base.filter(e => e.id !== 'c26'), emps, w('', 'c', '2026-10-26', '17:00', '22:00')).map(h => h.type), ['daily', 'rest']);
      test('Kandidat Urlaub', A.computeArbzgHintsForCandidate(base, emps, { id: 'c26', employerId: 'c', date: '2026-10-26', type: 'vacation' }).length, 0);

      // Woche: Tageshinweis bei beteiligten Arbeitgebern, Ruhezeit nur beim Arbeitgeber mit Arbeitsbeginn.
      test('Woche GmbH', ['2026-10-26', '2026-10-27'].map(d => A.arbzgHintsForEmployerDay(hints, 'g', d).map(h => h.type)), [['daily'], ['rest']]);
      test('Woche Café', ['2026-10-26', '2026-10-27'].map(d => A.arbzgHintsForEmployerDay(hints, 'c', d).map(h => h.type)), [['daily'], []]);

      // Einstellung, Standard und Backup.
      test('Standard an', [A.isArbzgHintEnabled({}), A.isArbzgHintEnabled(undefined), A.isArbzgHintEnabled({ arbzgHintsEnabled: false })], [true, true, false]);
      test('DEFAULT_STATE', S.DEFAULT_STATE ? S.DEFAULT_STATE.settings.arbzgHintsEnabled : true, true);
      test('Regeltabelle', [A.ARBZG_RULES.maxDailyMinutes, A.ARBZG_RULES.minRestMinutes], [600, 660]);
      const backup = (v) => ({ schemaVersion: 7, employers: [], entries: [], archives: [], templates: [], auditLog: [],
        settings: { state: 'HE', appMode: 'employee', arbzgHintsEnabled: v }, activeEmployerId: null, runningTimer: null });
      const ok = (v) => { try { validateBackup(backup(v)); return true; } catch { return false; } };
      test('Backup arbzgHintsEnabled', [ok(true), ok(false), ok('ja')], [true, true, false]);

      // HTML wird escaped.
      const evil = A.computeArbzgHints([w('a', 'e', '2026-10-26', '06:00', '18:00')], [{ id: 'e', name: '<b>X</b>', kind: 'employer' }], null, null);
      const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      test('Escape', [A.buildArbzgOverviewHTML(evil, 'Oktober 2026', esc).includes('<b>X</b>'), A.buildArbzgWeekBadgesHTML(evil, esc).includes('&lt;b&gt;')], [false, true]);
      test('leer → kein HTML', [A.buildArbzgOverviewHTML([], 'x', esc), A.buildArbzgWeekBadgesHTML([], esc), A.buildArbzgDialogHTML([], esc)], ['', '', '']);
      return out;
    });
    for (const [n, v, e] of results) check(n, v, e);

    // UI mit Beispieldaten aus der Vorschau.
    await page.evaluate(() => {
      const mk = (on, st, en, br) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((k, i) => [k, { enabled: on.includes(i), start: on.includes(i) ? st : '', end: on.includes(i) ? en : '', break: on.includes(i) ? br : 0 }]));
      const s = window.state;
      s.settings.appMode = 'employee'; s.settings.state = 'HE'; delete s.settings.arbzgHintsEnabled;
      s.employers = [
        { id: 'g', name: 'Muster GmbH', kind: 'employer', color: '#2563eb', contacts: [], hoursMode: 'week', weeklyHours: 30, monthlyHours: 0, schedule: mk([0, 1, 2, 3, 4], '08:00', '14:30', 30), hiredSince: '2024-01-01', employmentEndDate: '', annualVacation: 30, breakMode: 'legal' },
        { id: 'c', name: 'Beispiel Café', kind: 'employer', color: '#d9480f', contacts: [], hoursMode: 'month', weeklyHours: 0, monthlyHours: 9, schedule: mk([], '', '', 0), hiredSince: '2025-05-01', employmentEndDate: '', annualVacation: 0, breakMode: 'none' },
      ];
      s.activeEmployerId = 'g';
      const E = [];
      for (let i = 1; i <= 31; i++) {
        const d = '2026-10-' + String(i).padStart(2, '0');
        const wd = new Date(d + 'T12:00:00').getDay();
        if (wd === 0 || wd === 6) continue;
        E.push({ id: 'g' + d, employerId: 'g', date: d, type: 'work', start: '08:00', end: '14:30', breakMinutes: 30 });
      }
      E.push({ id: 'c1', employerId: 'c', date: '2026-10-21', type: 'work', start: '17:00', end: '21:00', breakMinutes: 0 });
      E.push({ id: 'c2', employerId: 'c', date: '2026-10-26', type: 'work', start: '17:00', end: '22:00', breakMinutes: 0 });
      s.entries = E;
      window.saveState();
    });
    await page.reload();
    await page.waitForFunction(() => typeof window.renderTracker === 'function');
    await page.evaluate(() => document.getElementById('modal-whatsnew')?.classList.add('hidden'));

    // Übersicht Oktober 2026.
    const openOverview = async () => {
      await page.evaluate(() => {
        window.switchView('overview');
        const m = document.getElementById('overview-month'); m.value = '2026-10'; m.dispatchEvent(new Event('change', { bubbles: true }));
      });
    };
    await openOverview();
    let ov = await page.locator('[data-testid="arbzg-overview"]').innerText();
    check('Übersicht', [ov.includes('Arbeitszeitgesetz: 2 Hinweise im Oktober 2026'), ov.includes('Mo, 26.10.2026'), ov.includes('Muster GmbH 6:00 + Beispiel Café 5:00'),
      ov.includes('Di, 27.10.2026'), ov.includes('Ende 22:00 Beispiel Café → Beginn 08:00 Muster GmbH')], [true, true, true, true, true]);
    const totals = await page.locator('#overview-content .overview-table').innerText();
    check('Übersicht Summen unverändert', [totals.includes('141:00'), totals.includes('132:00')], [true, true]);

    // Woche KW 44 für beide Arbeitgeber.
    const openWeek = async (emp) => {
      await page.evaluate((emp) => {
        window.switchView('week');
        const s = document.getElementById('week-employer'); s.value = emp; s.dispatchEvent(new Event('change', { bubbles: true }));
        const w = document.getElementById('week-input'); w.value = '2026-W44'; w.dispatchEvent(new Event('change', { bubbles: true }));
      }, emp);
      return page.evaluate(() => [...document.querySelectorAll('#week-content .week-day-card')]
        .map(c => [...c.querySelectorAll('[data-testid^="arbzg-week-"]')].map(x => x.dataset.testid.replace('arbzg-week-', ''))));
    };
    check('Woche GmbH', await openWeek('g'), [['daily'], ['rest'], [], [], [], [], []]);
    check('Woche GmbH Text', (await page.locator('#week-content .week-day-card').first().innerText()).includes('⚠ ArbZG: 11:00 Std. am Tag'), true);
    check('Woche Café', await openWeek('c'), [['daily'], [], [], [], [], [], []]);
    check('Woche Ist unverändert', (await page.locator('#week-content .summary-grid').innerText()).includes('5:00'), true);

    // Eintragsdialog: Hinweis live, Speichern trotzdem möglich.
    await page.evaluate(() => window.switchView('entries'));
    await page.locator('.entry-card[data-id="c2"]').click();
    await page.waitForSelector('#entry-arbzg-hint', { state: 'visible' });
    let hint = await page.locator('#entry-arbzg-hint').innerText();
    check('Dialog Tageshinweis', [hint.includes('auf 11:00 Std.'), hint.includes('Du kannst trotzdem speichern.'), hint.includes('liegen nur 10:00 Std. Ruhezeit')], [true, true, true]);
    await page.fill('#entry-end', '21:00');
    await page.dispatchEvent('#entry-end', 'change');
    check('Dialog ausgeblendet', await page.locator('#entry-arbzg-hint').isHidden(), true);
    await page.fill('#entry-end', '22:30');
    await page.dispatchEvent('#entry-end', 'change');
    hint = await page.locator('#entry-arbzg-hint').innerText();
    check('Dialog 11:30', hint.includes('auf 11:30 Std.'), true);
    await page.evaluate(() => document.getElementById('form-entry').requestSubmit());
    check('trotz Hinweis gespeichert', await page.evaluate(() => window.state.entries.find(e => e.id === 'c2').end), '22:30');
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));

    // Home-Office-Dialog: GmbH-Tag 21.10. (6:00) + Café 4:00 = 10:00, plus 1 Std. Home-Office = 11:00.
    await page.evaluate(() => window.switchView('tracker'));
    await page.evaluate(() => document.getElementById('btn-add-homeoffice').click());
    await page.waitForSelector('#modal-homeoffice:not(.hidden)');
    await page.selectOption('#ho-employer', 'c');
    await page.fill('#ho-date', '2026-10-21');
    await page.dispatchEvent('#ho-date', 'change');
    const times = page.locator('#ho-segments input[type="time"]');
    await times.nth(0).fill('06:00');
    await times.nth(1).fill('07:00');
    await times.nth(1).dispatchEvent('change');
    await page.waitForSelector('#ho-arbzg-hint', { state: 'visible' });
    check('Home-Office-Dialog', (await page.locator('#ho-arbzg-hint').innerText()).includes('auf 11:00 Std.'), true);
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));

    // Einstellung aus: keine Hinweise mehr.
    await page.evaluate(() => window.switchView('settings'));
    check('Einstellung Standard an', await page.isChecked('#setting-arbzg-hints'), true);
    await page.uncheck('#setting-arbzg-hints');
    check('Einstellung gespeichert', await page.evaluate(() => window.state.settings.arbzgHintsEnabled), false);
    await openOverview();
    check('aus: Übersicht', await page.locator('[data-testid="arbzg-overview"]').count(), 0);
    check('aus: Woche', await openWeek('g'), [[], [], [], [], [], [], []]);
    await page.evaluate(() => window.switchView('entries'));
    await page.locator('.entry-card[data-id="c2"]').click();
    check('aus: Dialog', await page.locator('#entry-arbzg-hint').isHidden(), true);
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));
    await page.evaluate(() => window.switchView('settings'));
    await page.check('#setting-arbzg-hints');
    await openOverview();
    check('wieder an', await page.locator('[data-testid="arbzg-overview"]').count(), 1);
  } finally {
    await context.close();
  }
}
