// v3.15.7: Sommer- und Winterzeit nach deutscher Zeit (EU-Regel), unabhängig von der
// Gerätezeitzone. Handrechnung aus der Vorschau (Muster GmbH, Pause gesetzlich):
//   DST1 (A) Sa 24.10.2026 22:00–06:00: 9:00 brutto, Pause 30, netto 8:30 (bisher 7:30)
//   DST2 (B) Sa 24.10.2026 21:00–06:00: 10:00 brutto, Pause 45, netto 9:15 (bisher 8:30)
//   DST3 (C) Sa 27.03.2027 22:00–06:00: 7:00 brutto, Pause 30, netto 6:30 (bisher 7:30)
//   DST4 (D) Home-Office So 25.10.2026 00:00–06:00: 7:00 (bisher 6:00)
//   DST5 (E) So 25.10.2026 01:00–05:00: 5:00 (bisher 4:00)
//   DST6 (F) Sa 24.10.2026 22:00–02:30: 4:30 (doppelte Stunde = erster Durchgang)
//   DST7 (G) Sa 27.03.2027 22:00–01:30: 3:30 (unverändert)
//   DR1 Ruhezeit Sa 24.10.2026 23:00 → So 09:00 = 11:00, kein Hinweis (bisher 10:00)
//   DR2 Ruhezeit Sa 27.03.2027 22:00 → So 09:00 = 10:00, Hinweis (bisher 11:00)

const EMP = {
  id: 'm', name: 'Muster GmbH', kind: 'employer', color: '#2563eb', contacts: [],
  hoursMode: 'week', weeklyHours: 40, monthlyHours: 0, schedule: {},
  hiredSince: '2025-01-01', employmentEndDate: '', annualVacation: 30, breakMode: 'legal',
};

async function pureChecks(page) {
  return page.evaluate(async () => {
    const m = await import('/scripts/unit/dst.cases.mjs');
    return m.cases((n) => import('/modules/' + n));
  });
}

export async function runDstTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.15.7: Sommer- und Winterzeit ===');
  const check = (name, value, expected) => assertEq(`Zeitumstellung ${name}`, JSON.stringify(value), JSON.stringify(expected));

  // Reine Rechnung in deutscher und in New Yorker Gerätezeitzone: gleiches Ergebnis.
  for (const tz of ['Europe/Berlin', 'America/New_York']) {
    const context = await browser.newContext({ timezoneId: tz, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', e => check(`Browserfehler (${tz}): ${e.message}`, true, false));
    try {
      await page.goto(baseURL);
      await page.waitForFunction(() => typeof window.renderTracker === 'function');
      for (const [n, v, e] of await pureChecks(page)) check(`${n} (${tz === 'Europe/Berlin' ? 'Berlin' : 'New York'})`, v, e);
    } finally {
      await context.close();
    }
  }

  // Oberfläche: Schild in „Einträge“, Hinweis im Formular, Timer über die Umstellungsnacht.
  const context = await browser.newContext({ timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => check(`Browserfehler: ${e.message}`, true, false));
  await page.clock.install({ time: new Date('2026-10-26T10:00:00+01:00') });
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => typeof window.renderTracker === 'function');
    await page.evaluate((emp) => {
      const s = window.state;
      s.employers = [emp];
      s.activeEmployerId = emp.id;
      s.runningTimer = null;
      s.entries = [
        { id: 'n1', employerId: 'm', date: '2026-10-24', type: 'work', start: '22:00', end: '06:00', breakMinutes: 30, overtimeReason: '', note: '', createdAt: '2026-10-25T06:00:00.000Z' },
        { id: 'h1', employerId: 'm', date: '2026-10-25', type: 'homeoffice', segments: [{ start: '00:00', end: '06:00' }], note: '', createdAt: '2026-10-25T06:00:00.000Z' },
        { id: 'd1', employerId: 'm', date: '2026-10-23', type: 'work', start: '08:00', end: '16:30', breakMinutes: 30, overtimeReason: '', note: '', createdAt: '2026-10-23T16:00:00.000Z' },
      ];
      window.saveState();
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      window.switchView('entries');
    }, EMP);
    const list = await page.evaluate(() => {
      const card = (id) => document.querySelector(`[data-id="${id}"]`);
      const hours = (id) => card(id)?.querySelector('.entry-hours')?.textContent?.trim() || '';
      const badge = (id) => document.querySelector(`[data-testid="badge-dst-${id}"]`)?.textContent?.trim() || '';
      return { n1: [hours('n1'), badge('n1')], h1: [hours('h1'), badge('h1')], d1: [hours('d1'), badge('d1')] };
    });
    check('Einträge Präsenz', list.n1, ['8:30', 'Zeitumstellung +1:00']);
    check('Einträge Home-Office', list.h1, ['7:00', 'Zeitumstellung +1:00']);
    check('Einträge normaler Tag ohne Schild', list.d1, ['8:00', '']);

    await page.evaluate(() => window.openEntryModal(window.state.entries.find(e => e.id === 'n1')));
    const hint = () => page.evaluate(() => {
      const el = document.getElementById('entry-dst-hint');
      return el.classList.contains('hidden') ? '' : el.textContent;
    });
    check('Formular Hinweis Winterzeit', await hint(),
      'In dieser Nacht wurde die Uhr um 03:00 auf 02:00 zurückgestellt (Winterzeit). Gezählt werden 9:00 Std. statt 8:00, Pause 30 Min., netto 8:30 Std.');
    await page.fill('#entry-date', '2027-03-27');
    await page.dispatchEvent('#entry-date', 'change');
    check('Formular Hinweis Sommerzeit', await hint(),
      'In dieser Nacht wurde die Uhr um 02:00 auf 03:00 vorgestellt (Sommerzeit). Gezählt werden 7:00 Std. statt 8:00, Pause 30 Min., netto 6:30 Std.');
    await page.fill('#entry-date', '2026-11-14');
    await page.dispatchEvent('#entry-date', 'change');
    check('Formular ohne Umstellung kein Hinweis', await hint(), '');
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));

    // Timer über die Umstellungsnacht: 22:00 bis 06:00 = 9 Std., Pause 30, netto 8:30.
    await page.clock.setSystemTime(new Date('2026-10-25T06:00:00+01:00'));
    await page.evaluate(() => {
      const s = window.state;
      s.entries = [];
      s.runningTimer = { employerId: 'm', startISO: '2026-10-24T20:00:00.000Z', type: 'work' };
      window.saveState();
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      window.switchView('tracker');
      window.renderTracker();
    });
    await page.click('[data-testid="button-end"]');
    const saved = await page.evaluate(() => {
      const e = window.state.entries[0];
      return e ? [e.date, e.start, e.end, e.breakMinutes, window.computeWorkMinutes(e), !!window.state.runningTimer] : null;
    });
    check('Timer über Umstellungsnacht', saved, ['2026-10-24', '22:00', '06:00', 30, 510, false]);
  } finally {
    await context.close();
  }
}
