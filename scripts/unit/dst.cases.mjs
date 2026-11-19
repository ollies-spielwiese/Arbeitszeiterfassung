// Reine Rechenfälle Sommer- und Winterzeit (v3.15.7), seit v3.15.10 gemeinsam für Node
// (scripts/unit.mjs) und Browser (scripts/dst-tests.mjs). load(name) lädt ein Modul aus modules/.
export async function cases(load) {
    const C = await load('compute.js');
    const D = await load('dst.js');
    const A = await load('arbzg-hints.js');
    const out = [], test = (n, v, e) => out.push([n, v, e]);
    const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    const work = (date, start, end) => {
      const b = C.computeSuggestedBreak(start, end, 'legal', date);
      const net = C.computeWorkMinutes({ type: 'work', date, start, end, breakMinutes: b || 0 });
      return [hm(D.realMinutes(date, start, end)), b, hm(net)];
    };
    test('DST1 Winterzeit 22–06', work('2026-10-24', '22:00', '06:00'), ['9:00', 30, '8:30']);
    test('DST2 Winterzeit 21–06', work('2026-10-24', '21:00', '06:00'), ['10:00', 45, '9:15']);
    test('DST3 Sommerzeit 22–06', work('2027-03-27', '22:00', '06:00'), ['7:00', 30, '6:30']);
    test('DST4 Home-Office 25.10. 00–06', hm(C.computeHomeofficeMinutes({ type: 'homeoffice', date: '2026-10-25', segments: [{ start: '00:00', end: '06:00' }] })), '7:00');
    test('DST5 gleicher Tag 01–05', hm(C.computeWorkMinutes({ type: 'work', date: '2026-10-25', start: '01:00', end: '05:00', breakMinutes: 0 })), '5:00');
    test('DST6 doppelte Stunde', work('2026-10-24', '22:00', '02:30'), ['4:30', 0, '4:30']);
    test('DST7 Sommerzeit vor dem Sprung', work('2027-03-27', '22:00', '01:30'), ['3:30', 0, '3:30']);
    test('Grenzfall 24:00', [
      C.computeHomeofficeMinutes({ type: 'homeoffice', date: '2026-10-25', segments: [{ start: '00:00', end: '24:00' }] }),
      C.computeHomeofficeMinutes({ type: 'homeoffice', date: '2027-03-28', segments: [{ start: '00:00', end: '24:00' }] }),
      C.computeHomeofficeMinutes({ type: 'homeoffice', date: '2026-11-16', segments: [{ start: '00:00', end: '24:00' }] }),
    ], [1500, 1380, 1440]);
    test('Grenzfall fehlende Stunde 02:30 (zählt wie 03:30, Dauer = Uhrzeit-Differenz)', [D.realMinutes('2027-03-28', '01:00', '02:30'), D.dstShiftMinutes('2027-03-28', '01:00', '02:30')], [90, 0]);
    test('ohne Datum wie bisher', [
      C.computeWorkMinutes({ type: 'work', start: '22:00', end: '06:00', breakMinutes: 30 }),
      C.computeSuggestedBreak('21:00', '06:00', 'legal'),
    ], [450, 30]);
    test('normaler Tag unverändert', C.computeWorkMinutes({ type: 'work', date: '2026-11-16', start: '22:00', end: '06:00', breakMinutes: 30 }), 450);
    test('weitere Jahre', [
      D.dstShiftMinutes('2027-10-30', '22:00', '06:00'), D.dstShiftMinutes('2028-03-25', '22:00', '06:00'),
      D.dstShiftMinutes('2028-10-28', '22:00', '06:00'), D.dstShiftMinutes('2027-10-23', '22:00', '06:00'),
    ], [60, -60, 60, 0]);
    test('Schild-Text', [D.formatDstShift(60), D.formatDstShift(-60)], ['+1:00', '\u22121:00']);
    test('Verschiebung je Eintrag', [
      D.entryDstShift({ type: 'work', date: '2026-10-24', start: '22:00', end: '06:00' }),
      D.entryDstShift({ type: 'homeoffice', date: '2026-10-25', segments: [{ start: '00:00', end: '06:00' }, { start: '08:00', end: '12:00' }] }),
      D.entryDstShift({ type: 'vacation', date: '2026-10-25' }),
    ], [60, 60, 0]);

    const emps = [{ id: 'm', name: 'Muster GmbH', kind: 'employer' }];
    const w = (date, start, end, b) => ({ employerId: 'm', type: 'work', date, start, end, breakMinutes: b });
    const r1 = A.computeArbzgHints([w('2026-10-24', '14:00', '23:00', 30), w('2026-10-25', '09:00', '13:00', 0)], emps, '2026-10-01', '2026-10-31');
    test('DR1 Winterzeit: kein Ruhezeit-Hinweis', r1.filter(h => h.type === 'rest').length, 0);
    const r2 = A.computeArbzgHints([w('2027-03-27', '13:00', '22:00', 30), w('2027-03-28', '09:00', '13:00', 0)], emps, '2027-03-01', '2027-03-31');
    test('DR2 Sommerzeit: Ruhezeit 10:00', r2.filter(h => h.type === 'rest').map(h => [h.restMin, h.prevEnd, h.nextStart]), [[600, '22:00', '09:00']]);
    const r3 = A.computeArbzgHints([w('2026-11-16', '14:00', '23:00', 30), w('2026-11-17', '09:00', '13:00', 0)], emps, '2026-11-01', '2026-11-30');
    test('Ruhezeit normaler Tag unverändert', r3.filter(h => h.type === 'rest').map(h => h.restMin), [600]);
    const r4 = A.computeArbzgHints([w('2026-10-24', '20:00', '07:00', 45)], emps, '2026-10-01', '2026-10-31');
    test('Tageshöchstzeit mit Zeitumstellung', r4.filter(h => h.type === 'daily').map(h => h.totalMin), [675]);
    return out;
}
