// Rechenfälle für bisher nur indirekt geprüfte Module (seit v3.15.10). Werte von Hand gerechnet:
//   Präsenz 08:00–16:30, Pause 30 = 8:00. Gesetzliche Pause: bis 6:00 keine, über 6:00 30, über 9:00 45.
//   November 2026, 39 Std./Woche: 21 Arbeitstage × 7:48 = 163:48. 8:00 Arbeit + 7:48 Urlaub − 163:48 = −148:00.
//   Kilometer: 42 km × 0,30 € = 12,60 €, Dienstwagen 0 €.
//   Sonntage 2026: 52. Mit 37 gearbeiteten bleiben 15 frei (Grenze), mit 38 nur 14 (darunter).
//   ArbZG: 07:00–18:30, Pause 45 = 10:45 > 10:00. Ruhezeit 22:00 → 08:00 = 10:00 < 11:00, 22:00 → 09:00 = 11:00.
//   Soll-Warnung: 2000 von 9828 Min. = 20,4 % (ab 20 %), 1900 = 19,3 % (nein); 983 = 10,0 % (ab 10 %), 982 = 9,99 % (nein).
export async function cases(load) {
  const C = await load('compute.js');
  const F = await load('field-service.js');
  const S = await load('sunday-hints.js');
  const A = await load('arbzg-hints.js');
  const W = await load('soll-warning.js');
  const out = [], test = (n, v, e) => out.push([n, v, e]);
  const emp = {
    id: 'm', name: 'Muster GmbH', kind: 'employer', color: '#2563eb', contacts: [],
    hoursMode: 'week', weeklyHours: 39, monthlyHours: 0, schedule: {},
    hiredSince: '2025-01-01', employmentEndDate: '', annualVacation: 30, breakMode: 'legal',
  };
  const work = (date, start, end, b) => ({ id: date + start, employerId: 'm', type: 'work', date, start, end, breakMinutes: b });

  test('UC1 Arbeitszeit mit Pause', C.computeWorkMinutes(work('2026-11-03', '08:00', '16:30', 30)), 480);
  test('UC1 gesetzliche Pause 6:00 / 6:01 / 9:00 / 9:01', [
    C.computeSuggestedBreak('08:00', '14:00', 'legal'), C.computeSuggestedBreak('08:00', '14:01', 'legal'),
    C.computeSuggestedBreak('08:00', '17:00', 'legal'), C.computeSuggestedBreak('08:00', '17:01', 'legal'),
  ], [0, 30, 30, 45]);
  test('UC1 ohne Pausenregel', [C.computeSuggestedBreak('08:00', '17:01', 'none'), C.computeSuggestedBreak('08:00', '17:01', 'manual')], [null, null]);
  const state = {
    employers: [emp], settings: { state: 'HE' },
    entries: [work('2026-11-03', '08:00', '16:30', 30), { id: 'v1', employerId: 'm', type: 'vacation', date: '2026-11-04' }],
  };
  const r = C.computeMonthReport('m', '2026-11', { state });
  test('UC2 Monatsbericht November 2026', [r.workedMin, r.targetMin, r.creditedAbsenceMin, r.balance], [480, 9828, 468, -8880]);

  test('UC3 Kilometer', [F.entryKm({ km: 12.34 }), F.entryKm({ km: -3 }), F.formatKm(12.3), F.formatKm(12)], [12.3, 0, '12,3', '12']);
  test('UC3 Betrag', [F.kmAmount(42, 'private', 0.3), F.kmAmount(42, 'company', 0.3), F.formatEuro(12.6)], [12.6, 0, '12,60 €']);

  const sundays = [];
  for (let d = new Date(Date.UTC(2026, 0, 4)); d.getUTCFullYear() === 2026; d.setUTCDate(d.getUTCDate() + 7)) sundays.push(d.toISOString().slice(0, 10));
  test('UC4 Sonntage 2026', [S.countSundaysInYear(2026), sundays.length], [52, 52]);
  const sunEntries = (n) => sundays.slice(0, n).map((d) => work(d, '08:00', '12:00', 0));
  const level = (n) => {
    const list = sunEntries(n);
    const cand = list[list.length - 1];
    return S.computeSundayHintsForCandidate(list, [emp], cand).find(h => h.kind === 'count');
  };
  test('UC4 Grenze 15 freie Sonntage', [level(37).level, level(37).stats.free, level(38).level, level(38).stats.free, level(10).level], ['limit', 15, 'below', 14, 'ok']);

  const emps = [{ id: 'm', name: 'Muster GmbH', kind: 'employer' }];
  const daily = A.computeArbzgHints([work('2026-11-16', '07:00', '18:30', 45)], emps, '2026-11-01', '2026-11-30');
  test('UC5 Tageshöchstzeit', daily.filter(h => h.type === 'daily').map(h => [h.totalMin, h.limitMin]), [[645, 600]]);
  const ok10 = A.computeArbzgHints([work('2026-11-16', '08:00', '18:00', 45)], emps, '2026-11-01', '2026-11-30');
  test('UC5 genau 10 Std. ohne Hinweis', ok10.filter(h => h.type === 'daily').length, 0);
  const rest = (next) => A.computeArbzgHints([work('2026-11-16', '13:00', '22:00', 30), work('2026-11-17', next, '12:00', 0)], emps, '2026-11-01', '2026-11-30').filter(h => h.type === 'rest').map(h => h.restMin);
  test('UC5 Ruhezeit 10:00 / 11:00', [rest('08:00'), rest('09:00')], [[600], []]);

  const ev = (bal, target, pct, basis) => { const w = W.evaluateSollWarning(bal, target, pct, basis); return w ? [w.direction, w.pct] : null; };
  test('UC6 Monat 20 %', [ev(-2000, 9828, 20, 'month'), ev(-1900, 9828, 20, 'month'), ev(2000, 9828, 20, 'month')], [['under', 20], null, ['over', 20]]);
  test('UC6 Fenster 10 %', [ev(-983, 9828, 10, 'gleitzeitkonto'), ev(-982, 9828, 10, 'gleitzeitkonto')], [['under', 10], null]);
  test('UC6 zu kleines Soll und Schwelle 0', [ev(-59, 59, 10, 'month'), ev(-5000, 9828, 0, 'month')], [null, null]);
  test('UC6 Mindest-Arbeitstage', [W.computeMinElapsedWorkdaysForThreshold(20), W.computeMinElapsedWorkdaysForThreshold(10), W.computeMinElapsedWorkdaysForThreshold(5)], [6, 11, 11]);
  return out;
}
