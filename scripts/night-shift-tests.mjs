// v3.15.8: Nachtschicht über Mitternacht zählt zum Tag des Schichtbeginns (Standard)
// oder nach Kalendertag. Handrechnung aus der Vorschau (Muster GmbH, 39 Std./Woche):
//   NS1 Präsenz So 06.12.2026 22:00–06:00, Pause 30: Schichtbeginn So 7:30;
//       Kalendertag So 2:00 − 8 = 1:52, Mo 6:00 − 22 = 5:38
//   NS2 Home-Office So 06.12. 22:00–24:00 + Mo 07.12. 00:00–06:00: Schichtbeginn So 8:00;
//       Kalendertag So 2:00, Mo 6:00
//   NS3 Präsenz Mo 30.11.2026 22:00–06:00, Pause 30: Schichtbeginn Nov 7:30, Dez 0:00;
//       Kalendertag Nov 1:52, Dez 5:38
//   NS4 Home-Office Do 31.12.2026 22:00–24:00 + Fr 01.01.2027 00:00–06:00:
//       Schichtbeginn 2026 8:00, 2027 0:00; Kalendertag 2026 2:00, 2027 6:00
//   NS5 Zeitumstellung (echte Minuten) und NS6 Grenzfälle, Oberfläche und Backup.

const EMP = {
  id: 'm', name: 'Muster GmbH', kind: 'employer', color: '#2563eb', contacts: [],
  hoursMode: 'week', weeklyHours: 39, monthlyHours: 0, schedule: {},
  hiredSince: '2025-01-01', employmentEndDate: '', annualVacation: 30, breakMode: 'legal',
};

async function pureChecks(page) {
  return page.evaluate(async () => {
    const m = await import('/scripts/unit/night-shift.cases.mjs');
    return m.cases((n) => import('/modules/' + n));
  });
}

export async function runNightShiftTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.15.8: Nachtschicht über Mitternacht ===');
  const check = (name, value, expected) => assertEq(`Nachtschicht ${name}`, JSON.stringify(value), JSON.stringify(expected));

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

  // Oberfläche: Einstellung, Woche, Einträge, Monatsbericht.
  const context = await browser.newContext({ timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => check(`Browserfehler: ${e.message}`, true, false));
  await page.clock.install({ time: new Date('2026-12-10T10:00:00+01:00') });
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => typeof window.renderTracker === 'function');
    await page.evaluate((emp) => {
      const s = window.state;
      s.employers = [emp];
      s.activeEmployerId = emp.id;
      s.runningTimer = null;
      delete s.settings.nightShiftDay;
      const c = '2026-12-07T06:00:00.000Z';
      s.entries = [
        { id: 'u1', employerId: 'm', date: '2026-12-06', type: 'homeoffice', segments: [{ start: '22:00', end: '24:00' }], note: '', createdAt: c },
        { id: 'u2', employerId: 'm', date: '2026-12-07', type: 'homeoffice', segments: [{ start: '00:00', end: '06:00' }], note: '', createdAt: c },
        { id: 'u3', employerId: 'm', date: '2026-11-30', type: 'work', start: '22:00', end: '06:00', breakMinutes: 30, overtimeReason: '', note: '', createdAt: c },
      ];
      window.saveState();
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    }, EMP);

    const week = (wk) => page.evaluate((wk) => {
      window.switchView('week');
      const inp = document.getElementById('week-input');
      inp.value = wk;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return [...document.querySelectorAll('#week-content .week-day-card')].map(c => [
        c.querySelector('.day-hours')?.textContent?.trim(), c.querySelector('.day-detail')?.textContent?.trim(),
      ]);
    }, wk);
    const entries = () => page.evaluate(() => {
      window.switchView('entries');
      const m = document.getElementById('filter-month');
      const b = (id) => document.querySelector(`[data-testid="badge-night-${id}"]`)?.textContent?.trim() || '';
      const at = (ym) => { m.value = ym; m.dispatchEvent(new Event('change', { bubbles: true })); window.renderEntries(); };
      at('2026-12');
      const dec = [b('u1'), b('u2')];
      at('2026-11');
      return [...dec, b('u3')];
    });
    const reportNotes = (ym) => page.evaluate((ym) => {
      window.switchView('report');
      const inp = document.getElementById('report-month');
      inp.value = ym;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return document.querySelector('[data-testid="report-night-shift-notes"]')?.textContent?.trim() || '';
    }, ym);
    const radios = () => page.evaluate(() => {
      window.switchView('settings');
      return [...document.querySelectorAll('input[name="setting-night-shift"]')].map(r => [r.value, r.checked]);
    });

    check('NS1 Einstellung Standard', await radios(), [['start', true], ['calendar', false]]);
    const w49 = await week('2026-W49');
    check('NS2 Woche So 06.12. Schichtbeginn', w49[6], ['8:00', 'Home-Office']);
    check('NS3 Woche Mo 30.11. Präsenz', w49[0], ['7:30', '22:00–06:00']);
    const w50 = await week('2026-W50');
    check('NS2 Woche Mo 07.12. Schichtbeginn', w50[0], ['–', 'Home-Office · Block ab 00:00 zählt zum Vortag']);
    check('NS4 Schilder Schichtbeginn', await entries(), ['', '00:00–06:00 zählt zum 06.12.', '']);
    check('NS4 Bericht November Schichtbeginn ohne Hinweis', await reportNotes('2026-11'), '');

    await page.evaluate(() => {
      window.switchView('settings');
      const r = document.querySelector('[data-testid="radio-night-shift-calendar"]');
      r.click();
    });
    check('NS5 Einstellung gespeichert', await page.evaluate(() => [window.state.settings.nightShiftDay, JSON.parse(localStorage.getItem('arbeitszeit_v1') || '{}')?.settings?.nightShiftDay]), ['calendar', 'calendar']);
    check('NS5 Einstellung angezeigt', await radios(), [['start', false], ['calendar', true]]);
    const w49c = await week('2026-W49');
    check('NS5 Woche Kalendertag', [w49c[0], w49c[1], w49c[6]], [['1:52', '22:00–06:00'], ['5:38', 'Nachtschicht vom Vortag'], ['2:00', 'Home-Office']]);
    const w50c = await week('2026-W50');
    check('NS5 Woche Mo 07.12. Kalendertag', w50c[0], ['6:00', 'Home-Office']);
    check('NS5 Schilder Kalendertag', await entries(), ['', '', 'verteilt: 1:52 / 5:38']);
    check('NS5 Bericht Dezember Hinweis', await reportNotes('2026-12'), 'Präsenz 22:00–06:00 vom 30.11.2026: 5:38 zählen zum 01.12.2026 (nach Kalendertag).');

    await page.evaluate(() => {
      window.switchView('settings');
      document.querySelector('[data-testid="radio-night-shift-start"]').click();
    });
    check('NS6 zurück auf Schichtbeginn', await page.evaluate(() => window.state.settings.nightShiftDay), 'start');
  } finally {
    await context.close();
  }
}
