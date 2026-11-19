// Reine Rechenfälle Nachtschicht (v3.15.8/v3.15.9), seit v3.15.10 gemeinsam für Node
// (scripts/unit.mjs) und Browser (scripts/night-shift-tests.mjs). load(name) lädt ein Modul aus modules/.
const EMP = {
  id: 'm', name: 'Muster GmbH', kind: 'employer', color: '#2563eb', contacts: [],
  hoursMode: 'week', weeklyHours: 39, monthlyHours: 0, schedule: {},
  hiredSince: '2025-01-01', employmentEndDate: '', annualVacation: 30, breakMode: 'legal',
};

export async function cases(load) {
    const emp = EMP;
    const N = await load('night-shift.js');
    const C = await load('compute.js');
    const V = await load('backup-validation.js');
    const out = [], test = (n, v, e) => out.push([n, v, e]);
    const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    const work = (id, date, start, end, b, employerId = 'm') => ({ id, employerId, date, type: 'work', start, end, breakMinutes: b });
    const ho = (id, date, segments, employerId = 'm') => ({ id, employerId, date, type: 'homeoffice', segments });
    const parts = (e, all, rule) => N.attributeWorkedMinutes(e, all, rule).map(p => [p.date, hm(p.minutes)]);
    const byDate = (all, rule, from, to) => [...N.minutesByDate(all, all, rule, from, to).entries()].sort().map(([d, m]) => [d, hm(m)]);

    test('NS Regel Standard', [N.getNightShiftRule(undefined), N.getNightShiftRule({}), N.getNightShiftRule({ nightShiftDay: 'x' }), N.getNightShiftRule({ nightShiftDay: 'calendar' })], ['start', 'start', 'start', 'calendar']);

    // NS1 Präsenz über den Wochenwechsel
    const p1 = work('p1', '2026-12-06', '22:00', '06:00', 30);
    test('NS1 Präsenz Schichtbeginn', parts(p1, [p1], 'start'), [['2026-12-06', '7:30']]);
    test('NS1 Präsenz Kalendertag', parts(p1, [p1], 'calendar'), [['2026-12-06', '1:52'], ['2026-12-07', '5:38']]);

    // NS2 Home-Office in derselben Nacht
    const h1 = ho('h1', '2026-12-06', [{ start: '22:00', end: '24:00' }]);
    const h2 = ho('h2', '2026-12-07', [{ start: '00:00', end: '06:00' }]);
    test('NS2 Home-Office Schichtbeginn', byDate([h1, h2], 'start', '2026-12-06', '2026-12-07'), [['2026-12-06', '8:00']]);
    test('NS2 Home-Office Kalendertag', byDate([h1, h2], 'calendar', '2026-12-06', '2026-12-07'), [['2026-12-06', '2:00'], ['2026-12-07', '6:00']]);

    // NS3 und NS4 über den Monatsbericht (und damit Gleitzeitkonto, Übersicht, Warnung)
    const report = (entries, rule, ym) => {
      const state = { employers: [emp], entries, settings: { state: 'HE', nightShiftDay: rule } };
      return C.computeMonthReport('m', ym, { state }).workedMin;
    };
    const p3 = work('p3', '2026-11-30', '22:00', '06:00', 30);
    test('NS3 Monatswechsel Schichtbeginn', [report([p3], 'start', '2026-11'), report([p3], 'start', '2026-12')].map(hm), ['7:30', '0:00']);
    test('NS3 Monatswechsel Kalendertag', [report([p3], 'calendar', '2026-11'), report([p3], 'calendar', '2026-12')].map(hm), ['1:52', '5:38']);
    const h4a = ho('h4a', '2026-12-31', [{ start: '22:00', end: '24:00' }]);
    const h4b = ho('h4b', '2027-01-01', [{ start: '00:00', end: '06:00' }]);
    test('NS4 Jahreswechsel Schichtbeginn', [report([h4a, h4b], 'start', '2026-12'), report([h4a, h4b], 'start', '2027-01')].map(hm), ['8:00', '0:00']);
    test('NS4 Jahreswechsel Kalendertag', [report([h4a, h4b], 'calendar', '2026-12'), report([h4a, h4b], 'calendar', '2027-01')].map(hm), ['2:00', '6:00']);
    const gk = (entries, rule, year) => {
      const state = { employers: [emp], entries, settings: { state: 'HE', nightShiftDay: rule } };
      const rows = C.computeGleitzeitkontoRows(emp, year, { state });
      const list = Array.isArray(rows) ? rows : (rows.rows || []);
      return list.reduce((s, r) => s + (r.workedMin || 0), 0);
    };
    test('NS4 Gleitzeitkonto 2026/2027 Schichtbeginn', [gk([h4a, h4b], 'start', 2026), gk([h4a, h4b], 'start', 2027)].map(hm), ['8:00', '0:00']);
    test('NS4 Gleitzeitkonto 2026/2027 Kalendertag', [gk([h4a, h4b], 'calendar', 2026), gk([h4a, h4b], 'calendar', 2027)].map(hm), ['2:00', '6:00']);
    const notes = (entries, rule, ym) => {
      const state = { employers: [emp], entries, settings: { state: 'HE', nightShiftDay: rule } };
      return C.computeMonthReport('m', ym, { state }).nightShiftNotes || [];
    };
    test('NS3 Hinweis Monatsbericht Kalendertag', [notes([p3], 'calendar', '2026-11'), notes([p3], 'calendar', '2026-12')], [
      ['Präsenz 22:00–06:00 vom 30.11.2026: 5:38 zählen zum 01.12.2026 (nach Kalendertag).'],
      ['Präsenz 22:00–06:00 vom 30.11.2026: 5:38 zählen zum 01.12.2026 (nach Kalendertag).'],
    ]);
    test('NS3 kein Hinweis Schichtbeginn', notes([p3], 'start', '2026-11'), []);
    test('NS4 Hinweis Monatsbericht Schichtbeginn', notes([h4a, h4b], 'start', '2027-01'),
      ['Home-Office 00:00–06:00 am 01.01.2027 zählt zum 31.12.2026 (Tag des Schichtbeginns).']);
    // NS7 (seit v3.15.9): Hinweis auch in der CSV, als Kopfzeile. Ohne Hinweis keine Zeile.
    const X = await load('export/csv.js');
    const T = await load('util-time.js');
    const csv = async (entries, rule, ym) => {
      const state = { employers: [emp], entries, settings: { state: 'HE', nightShiftDay: rule } };
      const r = C.computeMonthReport('m', ym, { state });
      const text = await X.generateCsvBlob(r, { formatDate: T.formatDate, minutesToHM: T.minutesToHM, computeWorkMinutes: C.computeWorkMinutes, computeHomeofficeMinutes: C.computeHomeofficeMinutes, employeeName: 'Max Mustermann' }).text();
      return text.split('\r\n').filter(l => l.startsWith('Nachtschicht;'));
    };
    test('NS7 CSV November Kalendertag', await csv([p3], 'calendar', '2026-11'), ['Nachtschicht;Präsenz 22:00–06:00 vom 30.11.2026: 5:38 zählen zum 01.12.2026 (nach Kalendertag).']);
    test('NS7 CSV Dezember Kalendertag', await csv([p3], 'calendar', '2026-12'), ['Nachtschicht;Präsenz 22:00–06:00 vom 30.11.2026: 5:38 zählen zum 01.12.2026 (nach Kalendertag).']);
    test('NS7 CSV November Schichtbeginn ohne Zeile', await csv([p3], 'start', '2026-11'), []);
    test('NS7 CSV Januar Schichtbeginn', await csv([h4a, h4b], 'start', '2027-01'), ['Nachtschicht;Home-Office 00:00–06:00 am 01.01.2027 zählt zum 31.12.2026 (Tag des Schichtbeginns).']);
    test('NS7 CSV Januar Kalendertag ohne Zeile', await csv([h4a, h4b], 'calendar', '2027-01'), []);
    test('NS1 kein Hinweis innerhalb des Monats', [notes([p1], 'calendar', '2026-12'), notes([h1, h2], 'start', '2026-12')], [[], []]);

    // NS5 Zeitumstellung: echte Minuten, Pause anteilig
    const p5w = work('p5w', '2026-10-24', '22:00', '06:00', 30);
    test('NS5 Winterzeit Kalendertag', parts(p5w, [p5w], 'calendar'), [['2026-10-24', '1:53'], ['2026-10-25', '6:37']]);
    test('NS5 Winterzeit Summe wie Eintrag', hm(N.attributeWorkedMinutes(p5w, [p5w], 'calendar').reduce((s, p) => s + p.minutes, 0)), hm(C.computeWorkMinutes(p5w)));
    const p5s = work('p5s', '2027-03-27', '22:00', '06:00', 30);
    test('NS5 Sommerzeit Kalendertag', parts(p5s, [p5s], 'calendar'), [['2027-03-27', '1:51'], ['2027-03-28', '4:39']]);
    const h5a = ho('h5a', '2026-10-24', [{ start: '22:00', end: '24:00' }]);
    const h5b = ho('h5b', '2026-10-25', [{ start: '00:00', end: '06:00' }]);
    test('NS5 Home-Office Winterzeit Schichtbeginn', byDate([h5a, h5b], 'start', '2026-10-24', '2026-10-25'), [['2026-10-24', '9:00']]);

    // NS6 Grenzfälle
    const g1 = ho('g1', '2026-12-06', [{ start: '22:00', end: '24:00' }], 'm');
    const g2 = ho('g2', '2026-12-07', [{ start: '00:00', end: '06:00' }], 'x');
    test('NS6 zwei Arbeitgeber werden nicht verbunden', [parts(g2, [g1, g2], 'start')], [[['2026-12-07', '6:00']]]);
    const g3 = ho('g3', '2026-12-08', [{ start: '00:00', end: '06:00' }]);
    test('NS6 Block ab 00:00 ohne Vortag bleibt', parts(g3, [g3], 'start'), [['2026-12-08', '6:00']]);
    const g4 = ho('g4', '2026-12-07', [{ start: '00:00', end: '06:00' }, { start: '14:00', end: '16:00' }]);
    test('NS6 nur der Block ab 00:00 zählt zum Vortag', parts(g4, [h1, g4], 'start'), [['2026-12-06', '6:00'], ['2026-12-07', '2:00']]);
    const g5 = work('g5', '2026-12-09', '08:00', '16:30', 30);
    test('NS6 normaler Tag unverändert', [parts(g5, [g5], 'start'), parts(g5, [g5], 'calendar')], [[['2026-12-09', '8:00']], [['2026-12-09', '8:00']]]);
    const g6 = work('g6', '2026-12-09', '22:00', '24:00', 0);
    test('NS6 Ende 24:00 wird nicht geteilt', parts(g6, [g6], 'calendar'), [['2026-12-09', '2:00']]);
    const g7 = work('g7', '2026-12-09', '23:00', '00:30', 200);
    test('NS6 Pause länger als Schicht', parts(g7, [g7], 'calendar').map(p => p[1]), ['0:00', '0:00']);
    const g8 = work('g8', '2026-12-06', '22:00', '06:00', 30);
    test('NS6 Präsenz und Home-Office in derselben Nacht', byDate([g8, h1, h2], 'start', '2026-12-06', '2026-12-07'), [['2026-12-06', '15:30']]);
    // Summe bleibt bei beiden Regeln gleich
    let same = true;
    const pool = [p1, h1, h2, p3, h4a, h4b, p5w, p5s, h5a, h5b, g3, g4, g5];
    for (const rule of ['start', 'calendar']) {
      const a = N.sumMinutes(N.minutesByDate(pool, pool, rule, '2026-01-01', '2027-12-31'));
      const b = pool.reduce((s, e) => s + C.computeWorkMinutes(e), 0);
      if (a !== b) same = false;
    }
    test('NS6 Gesamtsumme bei beiden Regeln gleich', same, true);
    test('NS6 Schild-Texte', [
      N.nightShiftBadgeText(h2, [h1, h2], 'start', hm), N.nightShiftBadgeText(h2, [h1, h2], 'calendar', hm),
      N.nightShiftBadgeText(p1, [p1], 'calendar', hm), N.nightShiftBadgeText(p1, [p1], 'start', hm),
    ], ['00:00–06:00 zählt zum 06.12.', '', 'verteilt: 1:52 / 5:38', '']);

    // Backup: neues Feld optional und geprüft
    const bk = (v) => ({ schemaVersion: 7, employers: [emp], entries: [], settings: v === undefined ? {} : { nightShiftDay: v } });
    const ok = (v) => { try { V.validateBackup(bk(v)); return true; } catch (_) { return false; } };
    test('NS6 Backup mit und ohne Feld', [ok(undefined), ok('start'), ok('calendar'), ok('egal')], [true, true, true, false]);
    return out;
}
