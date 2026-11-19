// MIG7 (seit v3.15.10): ein Backup im Schema 1 läuft durch alle Migrationen bis Schema 7.
// Handrechnung November 2026 (Hessen, keine Feiertage), Muster GmbH 39 Std./Woche:
//   Home-Office 02.11. zwei alte Einträge 08:00–12:00 und 12:30–16:30 → ein Eintrag, 8:00
//   Präsenz 03.11. 08:00–16:30, Pause 30 → 8:00; Ist 16:00, davon Home-Office 8:00
//   Soll 21 × 7:48 = 163:48; Urlaub 04.11. 7:48; Saldo 16:00 + 7:48 − 163:48 = −140:00

/** Altes Backup ohne schemaVersion (Schema 1). */
export const LEGACY_BACKUP = {
  employers: [{ id: 'm', name: 'Muster GmbH', color: '#2563eb', contacts: [], hoursMode: 'week', weeklyHours: 39, monthlyHours: 0, schedule: {}, annualVacation: 30, breakMode: 'legal' }],
  entries: [
    { id: 'h1', employerId: 'm', date: '2026-11-02', type: 'homeoffice', start: '08:00', end: '12:00', note: '', createdAt: '2026-11-02T07:00:00.000Z' },
    { id: 'h2', employerId: 'm', date: '2026-11-02', type: 'homeoffice', start: '12:30', end: '16:30', note: '', createdAt: '2026-11-02T11:30:00.000Z' },
    { id: 'p1', employerId: 'm', date: '2026-11-03', type: 'work', start: '08:00', end: '16:30', breakMinutes: 30, overtimeReason: '', note: '', createdAt: '2026-11-03T07:00:00.000Z' },
    { id: 'v1', employerId: 'm', date: '2026-11-04', type: 'vacation', note: '', createdAt: '2026-11-04T07:00:00.000Z' },
  ],
  archives: [],
  templates: [{ id: 'tpl-2', label: 'Alt', text: 'x' }],
  settings: { state: 'HE', appMode: 'employee', employeeName: 'Max Mustermann' },
  activeEmployerId: 'm',
  runningTimer: null,
};

/** Dieselben Daten direkt im heutigen Schema 7. */
export const CURRENT_EQUIVALENT = {
  schemaVersion: 7,
  employers: [{ ...LEGACY_BACKUP.employers[0], kind: 'employer', hiredSince: '', vacationCarryOver: 0, employmentEndDate: '', personnelNumber: '' }],
  entries: [
    { id: 'h1', employerId: 'm', date: '2026-11-02', type: 'homeoffice', segments: [{ start: '08:00', end: '12:00' }, { start: '12:30', end: '16:30' }], note: '', createdAt: '2026-11-02T07:00:00.000Z' },
    ...LEGACY_BACKUP.entries.slice(2),
  ],
  archives: [],
  templates: [{ id: 'tpl-2', label: 'Alt', text: 'x', scope: 'employee' }],
  settings: { state: 'HE', appMode: 'employee', employeeName: 'Max Mustermann' },
  activeEmployerId: 'm',
  runningTimer: null,
};

/** Gleiche Regel wie normalizeSegments in app.js: sortieren, überlappende und angrenzende Blöcke zusammenfassen. */
export function normalizeSegments(segments) {
  const m = (t) => { const [h, mi] = String(t).split(':').map(Number); return h * 60 + mi; };
  const clean = (segments || []).filter(s => s && s.start && s.end).map(s => ({ start: s.start, end: s.end }))
    .filter(s => m(s.end) > m(s.start)).sort((a, b) => m(a.start) - m(b.start));
  const out = [];
  for (const s of clean) {
    const last = out[out.length - 1];
    if (last && m(s.start) <= m(last.end)) { if (m(s.end) > m(last.end)) last.end = s.end; } else out.push({ ...s });
  }
  return out;
}

/** Kennzahlen eines Zustands für November 2026, wie sie der Test vergleicht. */
export function summarize(C, state) {
  const r = C.computeMonthReport('m', '2026-11', { state });
  return [r.workedMin, r.homeofficeMin, r.targetMin, r.creditedAbsenceMin, r.balance];
}

export async function cases(load) {
  const C = await load('compute.js');
  const B = await load('backup.js');
  const M = await load('migrations.js');
  const S = await load('state.js');
  const H = await load('holidays.js');
  const out = [], test = (n, v, e) => out.push([n, v, e]);
  let n = 0;
  const ctx = { DEFAULT_STATE: S.DEFAULT_STATE, normalizeHolidayOverrides: H.normalizeHolidayOverrides, runMigrations: M.runMigrations, uid: () => 'uid' + (++n), normalizeSegments };
  const s = B.prepareImportedState(JSON.parse(JSON.stringify(LEGACY_BACKUP)), ctx);
  test('MIG7 Schema nach Import', s.schemaVersion, 7);
  const ho = s.entries.filter(e => e.type === 'homeoffice' && e.date === '2026-11-02');
  test('MIG7 Home-Office 02.11. ein Eintrag mit zwei Abschnitten', ho.map(e => e.segments), [[{ start: '08:00', end: '12:00' }, { start: '12:30', end: '16:30' }]]);
  const e = s.employers[0];
  test('MIG7 Standardwerte Arbeitgeber', [e.kind, e.hiredSince, e.employmentEndDate, e.personnelNumber, e.vacationCarryOver], ['employer', '', '', '', 0]);
  test('MIG7 Vorlage tpl-2', s.templates.find(t => t.id === 'tpl-2')?.scope, 'employee');
  test('MIG7 Hinweis zur Zuordnung', s.pendingMigrationNotice && [s.pendingMigrationNotice.toKind, s.pendingMigrationNotice.names], ['employer', ['Muster GmbH']]);
  test('MIG7 Summen November 2026 (Ist, Home-Office, Soll, Urlaub, Saldo)', summarize(C, s), [960, 480, 9828, 468, -8400]);
  test('MIG7 gleiche Summen wie im Schema 7', summarize(C, s), summarize(C, JSON.parse(JSON.stringify(CURRENT_EQUIVALENT))));
  const again = M.runMigrations(JSON.parse(JSON.stringify(s)), ctx);
  test('MIG7 zweiter Durchlauf ändert nichts', again.changed, false);
  return out;
}
