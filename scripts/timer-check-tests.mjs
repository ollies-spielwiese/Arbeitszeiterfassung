// v3.15.6: Dialog „Timer prüfen“ (ab 12 Std. Laufzeit), Konfliktprüfung Präsenz nur am
// Starttag, CSV-Formelschutz, Barrierefreiheit (Dialog-Titel, Überschriften) und CSP.
// Rechenbeispiele aus der Vorschau (Muster GmbH, 40 Std./Woche, Pause gesetzlich):
//   TP1: Präsenz Mo 16.11. 08:00, „Ende“ am Di 17.11. 09:00 (25 Std.)
//        → Vorschlag 16:30 = 8:00 Soll + 30 Min. Pause, gespeichert netto 8:00.
//   TP2: Präsenz Di 17.11. 07:00, „Ende“ um 20:10 (13:10 Std.)
//        → Vorschlag jetzt, Pause 45 Min., netto 12:25.
//   TP3: 11:59 Std. → kein Dialog, Ende wie bisher.
//   TP4: Home-Office Sa 14.11. 08:00, „Ende“ Mo 16.11. 14:00, korrigiert auf So 15.11. 01:30
//        → zwei Tage (14.11. und 15.11.), kein Tag 00:00–24:00, nichts am 16.11.
//   TP5: ungültige Enden (vor Beginn, Zukunft, Präsenz ≥ 24 Std.) → Fehler, Timer bleibt.
//   TP6: „Timer weiterlaufen lassen“ → nichts ändert sich.
//   KF1: Präsenz Mo 16.11. 22:00 bis Di 06:00, Urlaub am Di → lässt sich beenden.

const EMP = {
  id: 'tp', name: 'Muster GmbH', kind: 'employer', color: '#123456', contacts: [],
  hoursMode: 'week', weeklyHours: 40, monthlyHours: 0, schedule: {},
  hiredSince: '2025-01-01', employmentEndDate: '', annualVacation: 30, breakMode: 'legal',
};

export async function runTimerCheckTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.15.6: Timer prüfen, CSV-Schutz, Barrierefreiheit ===');
  const check = (name, value, expected) => assertEq(`Timer prüfen ${name}`, JSON.stringify(value), JSON.stringify(expected));
  const context = await browser.newContext({ timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => check(`Browserfehler: ${e.message}`, true, false));
  await page.clock.install({ time: new Date('2026-11-17T09:00:00+01:00') });

  const modalVisible = () => page.evaluate(() => !document.getElementById('modal-timer-check').classList.contains('hidden'));
  const hideModals = () => page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));
  /** Zustand setzen: Arbeitgeber, Einträge, laufender Timer. */
  const seed = async (now, timer, entries = []) => {
    await page.clock.setSystemTime(new Date(now));
    await page.evaluate(([emp, timerArg, list]) => {
      const s = window.state;
      s.employers = [emp];
      s.activeEmployerId = emp.id;
      s.entries = list;
      s.runningTimer = timerArg ? { employerId: emp.id, ...timerArg } : null;
      window.saveState();
      window.renderTracker();
    }, [EMP, timer, entries]);
    await hideModals();
  };
  const pressEnd = () => page.click('[data-testid="button-end"]');
  const fields = () => page.evaluate(() => ({
    date: /** @type {HTMLInputElement} */ (document.getElementById('timer-check-date')).value,
    time: /** @type {HTMLInputElement} */ (document.getElementById('timer-check-time')).value,
    result: document.getElementById('timer-check-result').textContent,
    error: document.getElementById('timer-check-error').classList.contains('hidden') ? '' : document.getElementById('timer-check-error').textContent,
  }));
  const setEnd = async (date, time) => {
    await page.fill('[data-testid="input-timer-check-date"]', date);
    await page.fill('[data-testid="input-timer-check-time"]', time);
  };
  const snapshot = () => page.evaluate(() => ({
    timer: !!window.state.runningTimer,
    entries: window.state.entries.map(e => e.type === 'homeoffice'
      ? `${e.date} HO ${(e.segments || []).map(g => `${g.start}-${g.end}`).join(',')}`
      : `${e.date} ${e.type} ${e.start || ''}-${e.end || ''} P${e.breakMinutes || 0}`),
  }));
  const netOf = (line) => {
    const m = /(\d\d):(\d\d)-(\d\d):(\d\d) P(\d+)/.exec(line);
    if (!m) return null;
    let d = (+m[3] * 60 + +m[4]) - (+m[1] * 60 + +m[2]);
    if (d < 0) d += 1440;
    const n = d - +m[5];
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  };

  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => typeof window.renderTracker === 'function');

    // ---------- Reine Logik ----------
    const pure = await page.evaluate(async () => {
      const T = await import('/modules/timer-check.js');
      const out = [], test = (n, v, e) => out.push([n, v, e]);
      const start = '2026-11-16T07:00:00.000Z'; // Mo 08:00 Berlin
      const at = (iso) => new Date(iso);
      test('Schwelle', [T.needsTimerCheck(start, at('2026-11-16T18:59:00Z')), T.needsTimerCheck(start, at('2026-11-16T19:00:00Z'))], [false, true]);
      const sug = T.suggestTimerEnd({ startISO: start, type: 'work', now: at('2026-11-17T08:00:00Z'), dayTargetMin: 480, breakMode: 'legal' });
      test('Vorschlag Präsenz 25 Std.', T.toTimeInput(sug), '16:30');
      const sugNone = T.suggestTimerEnd({ startISO: start, type: 'work', now: at('2026-11-17T08:00:00Z'), dayTargetMin: 480, breakMode: 'none' });
      test('Vorschlag ohne Pause', T.toTimeInput(sugNone), '16:00');
      const sugWe = T.suggestTimerEnd({ startISO: start, type: 'work', now: at('2026-11-17T08:00:00Z'), dayTargetMin: 0, breakMode: 'legal' });
      test('Vorschlag ohne Soll (8 Std.)', T.toTimeInput(sugWe), '16:30');
      const sugHo = T.suggestTimerEnd({ startISO: start, type: 'homeoffice', now: at('2026-11-17T08:00:00Z'), dayTargetMin: 480 });
      test('Vorschlag Home-Office = jetzt', T.toTimeInput(sugHo), '09:00');
      const v = (end, type = 'work') => T.validateTimerEnd({ startISO: start, type, end, now: at('2026-11-17T08:00:00Z') });
      test('Prüfung', [
        !!v(null), !!v(at('2026-11-16T06:00:00Z')), !!v(at('2026-11-17T09:00:00Z')),
        !!v(at('2026-11-17T07:00:00Z')), v(at('2026-11-17T07:00:00Z'), 'homeoffice'), v(at('2026-11-16T15:30:00Z')),
      ], [true, true, true, true, null, null]);
      test('Ergebnistext', T.describeTimerResult({ startISO: start, type: 'work', end: at('2026-11-16T15:30:00Z'), breakMode: 'legal' }),
        'Ergebnis: Mo, 16.11.2026, 08:00–16:30 = 8:30 Std., Pause 30 Min., netto 8:00 Std.');
      return out;
    });
    for (const [n, v, e] of pure) check(n, v, e);

    // ---------- TP1: Präsenz 25 Std. ----------
    await seed('2026-11-17T09:00:00+01:00', { startISO: '2026-11-16T07:00:00.000Z', type: 'work' });
    await pressEnd();
    check('TP1: Dialog offen', await modalVisible(), true);
    const f1 = await fields();
    check('TP1: Vorschlag', [f1.date, f1.time, f1.error], ['2026-11-16', '16:30', '']);
    check('TP1: Ergebnis netto 8:00', /netto 8:00 Std\./.test(f1.result), true);
    const msg1 = await page.textContent('[data-testid="text-timer-check-message"]');
    check('TP1: Hinweis 24 Std.', /25:00 Std\..*höchstens 24 Std\./.test(msg1 || ''), true);
    await page.click('[data-testid="button-timer-check-save"]');
    const s1 = await snapshot();
    check('TP1: gespeichert', [s1.timer, s1.entries], [false, ['2026-11-16 work 08:00-16:30 P30']]);
    check('TP1: netto', netOf(s1.entries[0]), '8:00');

    // ---------- TP2: 13:10 Std. ----------
    await seed('2026-11-17T20:10:00+01:00', { startISO: '2026-11-17T06:00:00.000Z', type: 'work' });
    await pressEnd();
    check('TP2: Dialog offen', await modalVisible(), true);
    const f2 = await fields();
    check('TP2: Vorschlag = jetzt', [f2.date, f2.time], ['2026-11-17', '20:10']);
    await page.click('[data-testid="button-timer-check-save"]');
    const s2 = await snapshot();
    check('TP2: gespeichert', [s2.timer, s2.entries], [false, ['2026-11-17 work 07:00-20:10 P45']]);
    check('TP2: netto', netOf(s2.entries[0]), '12:25');

    // ---------- TP3: unter 12 Std. ----------
    await seed('2026-11-17T19:59:00+01:00', { startISO: '2026-11-17T07:00:00.000Z', type: 'work' });
    await pressEnd();
    check('TP3: kein Dialog', await modalVisible(), false);
    const s3 = await snapshot();
    check('TP3: wie bisher gespeichert', [s3.timer, s3.entries], [false, ['2026-11-17 work 08:00-19:59 P45']]);

    // ---------- TP4: Home-Office 54 Std., korrigiertes Ende ----------
    await seed('2026-11-16T14:00:00+01:00', { startISO: '2026-11-14T07:00:00.000Z', type: 'homeoffice' });
    await pressEnd();
    check('TP4: Dialog offen', await modalVisible(), true);
    check('TP4: Vorschlag = jetzt', (await fields()).time, '14:00');
    await setEnd('2026-11-15', '01:30');
    check('TP4: Ergebnis 2 Tage', /verteilt auf 2 Tage/.test((await fields()).result), true);
    await page.click('[data-testid="button-timer-check-save"]');
    const s4 = await snapshot();
    check('TP4: Timer beendet', s4.timer, false);
    check('TP4: Tage', s4.entries.map(l => l.slice(0, 10)), ['2026-11-14', '2026-11-15']);
    check('TP4: kein Tag 00:00–24:00', s4.entries.some(l => /00:00-(24:00|23:59)/.test(l)), false);
    check('TP4: zweiter Tag', /^2026-11-15 HO 00:00-01:30$/.test(s4.entries[1] || ''), true);

    // ---------- TP5: ungültige Enden ----------
    await seed('2026-11-17T09:00:00+01:00', { startISO: '2026-11-16T07:00:00.000Z', type: 'work' });
    await pressEnd();
    await setEnd('2026-11-16', '07:00');
    check('TP5: vor Beginn', (await fields()).error, 'Das Ende muss nach dem Beginn liegen.');
    await page.click('[data-testid="button-timer-check-save"]');
    check('TP5: Dialog bleibt offen', await modalVisible(), true);
    await setEnd('2026-11-17', '10:00');
    check('TP5: Zukunft', (await fields()).error, 'Das Ende darf nicht in der Zukunft liegen.');
    await setEnd('2026-11-17', '08:30');
    check('TP5: über 24 Std.', /höchstens 24 Std\./.test((await fields()).error), true);
    await page.click('[data-testid="button-timer-check-save"]');
    const s5 = await snapshot();
    check('TP5: Timer bleibt, nichts gespeichert', [s5.timer, s5.entries.length], [true, 0]);

    // ---------- TP6: weiterlaufen lassen ----------
    const before = await page.evaluate(() => JSON.stringify(window.state.runningTimer));
    await page.click('[data-testid="button-timer-check-continue"]');
    check('TP6: Dialog zu', await modalVisible(), false);
    const after = await page.evaluate(() => JSON.stringify(window.state.runningTimer));
    check('TP6: Timer unverändert', after, before);
    check('TP6: keine Einträge', (await snapshot()).entries.length, 0);

    // ---------- KF1: Präsenz über Mitternacht, Urlaub am Folgetag ----------
    await seed('2026-11-17T06:00:00+01:00', { startISO: '2026-11-16T21:00:00.000Z', type: 'work' },
      [{ id: 'u1', employerId: 'tp', date: '2026-11-17', type: 'vacation', note: '', createdAt: '2026-11-01T10:00:00.000Z' }]);
    await pressEnd();
    check('KF1: kein Dialog (8 Std.)', await modalVisible(), false);
    const s6 = await snapshot();
    check('KF1: beendet', [s6.timer, s6.entries.filter(l => l.includes(' work '))], [false, ['2026-11-16 work 22:00-06:00 P30']]);
    await hideModals();

    // KF1b: Home-Office über Mitternacht mit Urlaub am Folgetag bleibt gesperrt.
    await seed('2026-11-17T06:00:00+01:00', { startISO: '2026-11-16T21:00:00.000Z', type: 'homeoffice' },
      [{ id: 'u1', employerId: 'tp', date: '2026-11-17', type: 'vacation', note: '', createdAt: '2026-11-01T10:00:00.000Z' }]);
    await pressEnd();
    const s7 = await snapshot();
    check('KF1: Home-Office prüft weiter alle Tage', [s7.timer, s7.entries.length], [true, 1]);
    await page.evaluate(() => { window.state.runningTimer = null; window.state.entries = []; window.saveState(); window.renderTracker(); });

    // ---------- CV1: CSV-Formelschutz ----------
    const csv = await page.evaluate(async () => {
      const { csvField } = await import('/modules/export/csv.js');
      return [csvField('=HYPERLINK("http://x")'), csvField('+49 177'), csvField('@SUM(A1)'), csvField('-0:30'), csvField('-12,50'), csvField('Büro'), csvField('a\rb')];
    });
    check('CV1: Formel', csv[0].startsWith('"\'=') || csv[0].startsWith('\'='), true);
    check('CV1: Plus und @', [csv[1].includes('\'+49'), csv[2].includes('\'@SUM')], [true, true]);
    check('CV1: Zahlen bleiben', [csv[3], csv[4], csv[5]], ['-0:30', '-12,50', 'Büro']);
    check('CV1: Wagenrücklauf in Anführungszeichen', csv[6].startsWith('"'), true);

    // ---------- AX1: Dialog-Titel und Überschriften ----------
    const ax = await page.evaluate(() => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      const bad = dialogs.filter(d => { const id = d.getAttribute('aria-labelledby'); return !id || !document.getElementById(id); }).map(d => d.id);
      const closeNoLabel = [...document.querySelectorAll('.modal-close')].filter(b => !b.getAttribute('aria-label')).length;
      const views = [...document.querySelectorAll('section.view, section[id^="view-"]')];
      const noH2 = views.filter(v => !v.querySelector('h2')).map(v => v.id);
      const modalH3 = document.querySelectorAll('.modal-header h3').length;
      return { count: dialogs.length, bad, closeNoLabel, views: views.length, noH2, modalH3 };
    });
    check('AX1: Dialoge mit Titel', [ax.count > 10, ax.bad], [true, []]);
    check('AX1: Schließen-Knöpfe beschriftet', ax.closeNoLabel, 0);
    check('AX1: jede Ansicht mit h2', [ax.views > 5, ax.noH2], [true, []]);
    check('AX1: Dialog-Titel als h2', ax.modalH3, 0);

    // ---------- CSP1: Content-Security-Policy ----------
    const csp = await page.evaluate(() => {
      const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return m ? m.getAttribute('content') : '';
    });
    check('CSP1: vorhanden', [
      /script-src 'self' https:\/\/unpkg\.com;/.test(csp || ''), /object-src 'none'/.test(csp || ''),
      /base-uri 'self'/.test(csp || ''), /unsafe-eval/.test(csp || ''),
    ], [true, true, true, false]);
  } finally {
    await context.close();
  }
}
