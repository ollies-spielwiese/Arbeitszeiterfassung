#!/usr/bin/env node
/**
 * Arbeitszeiterfassung — Regression-Sweep
 *
 * Reproduzierbarer QA-Lauf, der VOR jedem Version-Bump grün sein muss.
 * Deckt ab:
 *   1) Selector-Unit-Tests   — getSummaryFields in 5 Konfigurationen
 *   2) E2E Freelance-Sweep   — Tracker, Week, Month, Overview + PDF/Word/OverviewPDF
 *   3) E2E Employee-Sweep    — dito mit target + balance
 *
 * Ausführung:
 *   node scripts/regression.mjs                 # gegen http://localhost:8765
 *   BASE_URL=http://x:8000 node scripts/regression.mjs
 *
 * Voraussetzung: lokaler HTTP-Server auf BASE_URL, playwright installiert
 * (systemweit oder als dev-dep via `npm i -D playwright`).
 *
 * Exit-Code: 0 = alles grün, 1 = mindestens ein Fehler.
 */

import { chromium } from 'playwright';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8765';
const HEADLESS = process.env.HEADLESS !== '0';

const results = [];
let failed = 0;

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  const mark = ok ? '  OK  ' : ' FAIL ';
  const line = `[${mark}] ${name}${detail ? '  — ' + detail : ''}`;
  console.log(line);
}

function assertEq(name, actual, expected) {
  const ok = actual === expected;
  record(name, ok, ok ? '' : `erwartet=${JSON.stringify(expected)} bekommen=${JSON.stringify(actual)}`);
}

function assertTrue(name, cond, detail = '') {
  record(name, !!cond, detail);
}

function assertContains(name, haystack, needle) {
  const s = typeof haystack === 'string' ? haystack : String(haystack);
  const ok = s.includes(needle);
  const preview = s.length > 100 ? s.slice(0, 100) + '…' : s;
  record(name, ok, ok ? preview : `nicht gefunden: "${needle}" in ${preview}`);
}

function assertAtLeast(name, actual, min) {
  const ok = typeof actual === 'number' && actual >= min;
  record(name, ok, ok ? `${actual}` : `erwartet≥${min} bekommen=${actual}`);
}

// ---------- Boot ----------

async function boot() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', err => record('page-error: ' + err.message, false));
  page.on('console', msg => {
    if (msg.type() === 'error') record('console-error: ' + msg.text(), false);
  });

  await page.goto(BASE_URL + '/?nc=' + Date.now(), { waitUntil: 'commit', timeout: 15000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  await page.waitForFunction(
    () => typeof state !== 'undefined' && typeof getSummaryFields === 'function',
    null,
    { timeout: 15000 }
  );
  await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));
  return { browser, context, page };
}

// ---------- 1) Selector-Unit-Tests ----------

async function runSelectorUnits(page) {
  console.log('\n=== 1) Selector-Unit-Tests ===');

  // Fall A: Freelance ohne Rate — nur worked
  const a = await page.evaluate(() => getSummaryFields({
    mode: 'freelance', workedMin: 300, hourlyRate: 0, currency: 'EUR'
  }));
  assertTrue('unit-A: freelance ohne rate liefert genau 1 Feld', a.length === 1, `len=${a.length}`);
  assertEq('unit-A: key=worked', a[0]?.key, 'worked');

  // Fall B: Freelance mit Rate
  const b = await page.evaluate(() => getSummaryFields({
    mode: 'freelance', workedMin: 420, hourlyRate: 85, currency: 'EUR'
  }));
  const bKeys = b.map(f => f.key);
  assertTrue('unit-B: freelance mit rate enthält worked+net',
    bKeys.includes('worked') && bKeys.includes('net'), `keys=${bKeys.join(',')}`);
  const bNet = b.find(f => f.key === 'net');
  assertEq('unit-B: net amount 7h × 85 = 595', bNet?.rawAmount?.amount, 595);

  // Fall C: Employee full
  const c = await page.evaluate(() => getSummaryFields({
    mode: 'employee', workedMin: 9600, targetMin: 9600, balance: 0,
    vacationDays: 2, sickDays: 1
  }));
  const cKeys = c.map(f => f.key);
  const needed = ['worked','target','balance','absences'];
  const missing = needed.filter(k => !cKeys.includes(k));
  assertTrue('unit-C: employee liefert worked/target/balance/absences',
    missing.length === 0, missing.length ? `fehlt=${missing.join(',')}` : '');
  const cBalance = c.find(f => f.key === 'balance');
  assertEq('unit-C: balance rawMinutes = 0', cBalance?.rawMinutes, 0);

  // Fall D: Week Freelance mit Feiertagen
  const d = await page.evaluate(() => getSummaryFields({
    mode: 'freelance', workedMin: 300, hourlyRate: 85, currency: 'EUR',
    includeHolidays: true, holidayCount: 1
  }));
  const dKeys = d.map(f => f.key);
  assertTrue('unit-D: week freelance enthält holidays', dKeys.includes('holidays'),
    `keys=${dKeys.join(',')}`);

  // Fall E: Employee ohne Absences
  const e = await page.evaluate(() => getSummaryFields({
    mode: 'employee', workedMin: 480, targetMin: 480, balance: 0,
    includeAbsences: false
  }));
  const eKeys = e.map(f => f.key);
  assertTrue('unit-E: employee ohne absences hat keine absences', !eKeys.includes('absences'),
    `keys=${eKeys.join(',')}`);
}

// ---------- 1b) Migrations-Unit-Tests ----------

async function runMigrationUnits(page) {
  console.log('\n=== 1b) Migrations-Unit-Tests ===');

  // Fall M1: Legacy-State ohne schemaVersion mit einem tpl-2 ohne scope
  const m1 = await page.evaluate(() => {
    const legacy = {
      employers: [], entries: [], archives: [],
      templates: [{ id: 'tpl-2', label: 'Alt', text: 'x' }, { id: 'tpl-9', label: 'Y', text: 'y' }],
      settings: { state: 'HE' }, runningTimer: null,
    };
    return runMigrations(legacy);
  });
  assertTrue('mig-M1: changed=true bei Legacy-State', m1.changed === true, `changed=${m1.changed}`);
  assertEq('mig-M1: schemaVersion nach Migration = SCHEMA_VERSION', m1.state.schemaVersion, 4);
  const tpl2 = m1.state.templates.find(t => t.id === 'tpl-2');
  const tpl9 = m1.state.templates.find(t => t.id === 'tpl-9');
  assertEq('mig-M1: tpl-2 bekommt scope=employee', tpl2?.scope, 'employee');
  assertEq('mig-M1: tpl-9 bekommt scope=both', tpl9?.scope, 'both');

  // Fall M2: State bereits auf aktueller Version darf nicht als changed markiert werden
  const m2 = await page.evaluate(() => {
    const currentState = {
      schemaVersion: 4,
      employers: [], entries: [], archives: [],
      templates: [{ id: 'tpl-1', label: 'A', text: 'a', scope: 'both' }],
      settings: { state: 'HE' }, runningTimer: null,
    };
    return runMigrations(currentState);
  });
  assertTrue('mig-M2: aktueller State bleibt unverändert', m2.changed === false, `changed=${m2.changed}`);

  // Fall M3: Idempotenz — zweimal migrieren ändert nichts mehr
  const m3 = await page.evaluate(() => {
    const legacy = {
      employers: [], entries: [], archives: [],
      templates: [{ id: 'tpl-2', label: 'Alt', text: 'x' }],
      settings: { state: 'HE' }, runningTimer: null,
    };
    const first = runMigrations(legacy);
    const second = runMigrations(first.state);
    return { firstChanged: first.changed, secondChanged: second.changed };
  });
  assertTrue('mig-M3: erste Migration ändert', m3.firstChanged === true, '');
  assertTrue('mig-M3: zweite Migration ändert nichts', m3.secondChanged === false, '');

  // Fall M4: Legacy Home-Office-Duplikate werden konsolidiert (schemaVersion 1 → 2)
  const m4 = await page.evaluate(() => {
    const legacy = {
      employers: [{ id: 'e1', name: 'X' }],
      entries: [
        { id: 'a', employerId: 'e1', date: '2026-01-15', type: 'homeoffice', segments: [{ start: '09:00', end: '11:00' }] },
        { id: 'b', employerId: 'e1', date: '2026-01-15', type: 'homeoffice', segments: [{ start: '13:00', end: '17:00' }] },
      ],
      archives: [], templates: [], settings: { state: 'HE' }, runningTimer: null,
    };
    return runMigrations(legacy);
  });
  const hoOn15 = m4.state.entries.filter(e => e.type === 'homeoffice' && e.date === '2026-01-15');
  assertTrue('mig-M4: zwei Legacy-Home-Office-Einträge → einer', hoOn15.length === 1, `count=${hoOn15.length}`);
  assertTrue('mig-M4: konsolidierter Eintrag hat 2 Segmente',
    hoOn15[0]?.segments?.length === 2, `segs=${hoOn15[0]?.segments?.length}`);
}

// ---------- 1e) Range-Entry (Option B) Unit-Tests ----------

async function runRangeEntryUnits(page) {
  console.log('\n=== 1e) buildRangeEntries Unit-Tests (Zeitraum erfassen) ===');

  // R1: Mo-Fr + folgendes Sa/So — nur 5 Werktage werden angelegt, Wochenende übersprungen.
  const r1 = await page.evaluate(() => buildRangeEntries({
    startISO: '2026-06-08', // Montag
    endISO: '2026-06-14',   // Sonntag
    employerId: 'e1', type: 'vacation', note: '',
    skipWeekendsHolidays: true, stateCode: 'HE',
    existingEntries: [], uid: () => 'x' + Math.random(),
  }));
  assertEq('R1: 7 Kalendertage im Bereich', r1.totalDays, 7);
  assertEq('R1: genau 5 Urlaubseinträge (Mo-Fr)', r1.created, 5);
  assertEq('R1: 2 Tage wegen Wochenende übersprungen', r1.skippedWeekend, 2);
  assertTrue('R1: alle erzeugten Einträge sind type=vacation',
    r1.toCreate.every(e => e.type === 'vacation'), '');
  assertTrue('R1: kein Sa/So unter den erzeugten Daten',
    !r1.toCreate.some(e => ['2026-06-13', '2026-06-14'].includes(e.date)), '');

  // R2: Bestehender Eintrag am selben Tag/Employer wird nicht überschrieben (übersprungen).
  const r2 = await page.evaluate(() => buildRangeEntries({
    startISO: '2026-06-08', endISO: '2026-06-10', // Mo-Mi
    employerId: 'e1', type: 'vacation', note: '',
    skipWeekendsHolidays: true, stateCode: 'HE',
    existingEntries: [{ id: 'p1', employerId: 'e1', date: '2026-06-09', type: 'work' }],
    uid: () => 'x' + Math.random(),
  }));
  assertEq('R2: 2 von 3 Tagen angelegt (1 bereits belegt)', r2.created, 2);
  assertEq('R2: 1 Tag wegen bestehendem Eintrag übersprungen', r2.skippedExisting, 1);
  assertTrue('R2: der belegte Tag 2026-06-09 wird nicht erneut erzeugt',
    !r2.toCreate.some(e => e.date === '2026-06-09'), '');

  // R3: Feiertag auf einem Werktag (Tag der Arbeit, Fr 2026-05-01) wird eigenständig über
  // skippedHoliday erfasst — Mi/Do/Fr, keine Wochenendüberlappung.
  const r3 = await page.evaluate(() => buildRangeEntries({
    startISO: '2026-04-29', endISO: '2026-05-01', // Mi, Do, Fr(Feiertag)
    employerId: 'e1', type: 'sick', note: '',
    skipWeekendsHolidays: true, stateCode: 'HE',
    existingEntries: [], uid: () => 'x' + Math.random(),
  }));
  assertEq('R3: 2 von 3 Tagen angelegt (Feiertag am 01.05. ausgelassen)', r3.created, 2);
  assertEq('R3: genau 1 Tag wegen Feiertag übersprungen', r3.skippedHoliday, 1);
  assertEq('R3: 0 Tage wegen Wochenende übersprungen (reine Werktage)', r3.skippedWeekend, 0);
  assertTrue('R3: 2026-05-01 (Feiertag) taucht nicht unter den erzeugten Terminen auf',
    !r3.toCreate.some(e => e.date === '2026-05-01'), `created=${JSON.stringify(r3.toCreate.map(e=>e.date))}`);

  // R4: skipWeekendsHolidays=false — auch Sa/So werden angelegt.
  const r4 = await page.evaluate(() => buildRangeEntries({
    startISO: '2026-06-13', endISO: '2026-06-14', // Sa, So
    employerId: 'e1', type: 'vacation', note: '',
    skipWeekendsHolidays: false, stateCode: 'HE',
    existingEntries: [], uid: () => 'x' + Math.random(),
  }));
  assertEq('R4: ohne Filter werden beide Wochenendtage angelegt', r4.created, 2);
  assertEq('R4: skippedWeekend=0 wenn Filter deaktiviert', r4.skippedWeekend, 0);

  // R5: formatRangeEntrySummary liefert lesbaren Text mit Zahlen aus dem Ergebnis.
  const r5 = await page.evaluate(() => {
    const res = buildRangeEntries({
      startISO: '2026-06-08', endISO: '2026-06-14',
      employerId: 'e1', type: 'vacation', note: '',
      skipWeekendsHolidays: true, stateCode: 'HE',
      existingEntries: [], uid: () => 'x' + Math.random(),
    });
    return formatRangeEntrySummary(res, 'vacation');
  });
  assertContains('R5: Summary enthält Anzahl angelegter Urlaubstage', r5, '5 Urlaubstage angelegt');
  assertContains('R5: Summary erwähnt übersprungene Wochenendtage', r5, 'Wochenende/Feiertag');

  // R6: Integration — über buildRangeEntries angelegte Urlaubstage werden vom bestehenden
  // computeMonthReport()-Pfad korrekt als Urlaub gezählt (keine Änderung an compute.js nötig,
  // da die erzeugten Entries dieselbe Form wie manuell angelegte haben).
  const r6 = await page.evaluate(() => {
    const empId = '__range-check-e6__';
    state.employers.push({ id: empId, name: 'Range-Check', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', annualVacation: 30 });
    const res = buildRangeEntries({
      startISO: '2026-06-08', endISO: '2026-06-12', // Mo-Fr, 5 Werktage
      employerId: empId, type: 'vacation', note: '',
      skipWeekendsHolidays: true, stateCode: 'HE',
      existingEntries: state.entries, uid: () => 'rg' + Math.random(),
    });
    state.entries.push(...res.toCreate);
    const report = computeMonthReport(empId, '2026-06');
    const vacationDays = report ? report.vacationEntries.length : -1;
    // Aufräumen, damit nachfolgende Tests im selben Page-Context nicht beeinflusst werden.
    state.employers = state.employers.filter(e => e.id !== empId);
    state.entries = state.entries.filter(e => e.employerId !== empId);
    return { vacationDays, created: res.created };
  });
  assertEq('R6: 5 angelegte Urlaubstage', r6.created, 5);
  assertEq('R6: computeMonthReport zählt 5 Urlaubstage', r6.vacationDays, 5);
}

// ---------- 1e-2) Gleitzeit-Überstundenabbau (Option B, v3.9.42) ----------

async function runOvertimeReductionUnits(page) {
  console.log('\n=== 1e-2) Gleitzeit-Überstundenabbau Unit-Tests ===');

  // OT1: buildRangeEntries akzeptiert type='overtime_reduction' und legt Werktage an
  // (identisch zum Urlaub-Fall R1, nur mit dem neuen Typ).
  const ot1 = await page.evaluate(() => buildRangeEntries({
    startISO: '2026-06-08', endISO: '2026-06-14', // Mo-So
    employerId: 'e1', type: 'overtime_reduction', note: '',
    skipWeekendsHolidays: true, stateCode: 'HE',
    existingEntries: [], uid: () => 'x' + Math.random(),
  }));
  assertEq('OT1: genau 5 Einträge angelegt (Mo-Fr)', ot1.created, 5);
  assertTrue('OT1: alle erzeugten Einträge sind type=overtime_reduction',
    ot1.toCreate.every(e => e.type === 'overtime_reduction'), '');

  // OT2: formatRangeEntrySummary liefert den Überstundenabbau-spezifischen Text.
  const ot2 = await page.evaluate(() => {
    const res = buildRangeEntries({
      startISO: '2026-06-08', endISO: '2026-06-09', // Mo-Di
      employerId: 'e1', type: 'overtime_reduction', note: '',
      skipWeekendsHolidays: true, stateCode: 'HE',
      existingEntries: [], uid: () => 'x' + Math.random(),
    });
    return formatRangeEntrySummary(res, 'overtime_reduction');
  });
  assertContains('OT2: Summary nennt "Überstundenabbau-Tage"', ot2, 'Überstundenabbau-Tage');

  // OT3+OT4: Integration — computeMonthReport zählt die Tage separat, rechnet sie
  // wie Urlaub/Krank als volle Tage an (creditedAbsenceMin), mindert aber NICHT
  // den Urlaubsanspruch aus computeVacationRemaining.
  const ot34 = await page.evaluate(() => {
    const empId = '__ot-check-e34__';
    state.employers.push({
      id: empId, name: 'OT-Check', hoursMode: 'week', weeklyHours: 40,
      breakMode: 'none', annualVacation: 30,
    });
    const res = buildRangeEntries({
      startISO: '2026-06-08', endISO: '2026-06-09', // Mo+Di, 2 Werktage
      employerId: empId, type: 'overtime_reduction', note: '',
      skipWeekendsHolidays: true, stateCode: 'HE',
      existingEntries: state.entries, uid: () => 'rg' + Math.random(),
    });
    state.entries.push(...res.toCreate);
    const report = computeMonthReport(empId, '2026-06');
    const vacRemaining = computeVacationRemaining(
      { id: empId, annualVacation: 30, vacationCarryOver: 0, hiredSince: '' },
      '2026-06', state.entries,
    );
    const dailyTargetMin = report.dailyTargetMin;
    const result = {
      created: res.created,
      overtimeReductionDays: report.overtimeReductionEntries.length,
      creditedAbsenceMin: report.creditedAbsenceMin,
      dailyTargetMin,
      vacationRemaining: vacRemaining.remaining,
      vacationTaken: vacRemaining.taken,
    };
    state.employers = state.employers.filter(e => e.id !== empId);
    state.entries = state.entries.filter(e => e.employerId !== empId);
    return result;
  });
  assertEq('OT3: 2 angelegte Überstundenabbau-Tage', ot34.created, 2);
  assertEq('OT3: computeMonthReport zählt 2 Überstundenabbau-Tage', ot34.overtimeReductionDays, 2);
  assertEq('OT3: creditedAbsenceMin = 2 × Tagessoll (volle Anrechnung)',
    ot34.creditedAbsenceMin, 2 * ot34.dailyTargetMin);
  assertEq('OT4: Urlaubsanspruch bleibt bei 30 (Überstundenabbau mindert ihn NICHT)',
    ot34.vacationRemaining, 30);
  assertEq('OT4: computeVacationRemaining zählt 0 genommene Urlaubstage', ot34.vacationTaken, 0);

  // OT5: computeMonthOverview summiert overtimeReductionDays korrekt über die Totals.
  const ot5 = await page.evaluate(() => {
    const empId = '__ot-check-e5__';
    state.employers.push({
      id: empId, name: 'OT-Check-5', hoursMode: 'week', weeklyHours: 40,
      breakMode: 'none', annualVacation: 30,
    });
    state.entries.push(
      { id: 'ot5a', employerId: empId, date: '2026-06-08', type: 'overtime_reduction' },
      { id: 'ot5b', employerId: empId, date: '2026-06-09', type: 'overtime_reduction' },
    );
    const ov = computeMonthOverview('2026-06');
    const row = ov.rows.find(r => r.employer.id === empId);
    const result = { rowDays: row ? row.overtimeReductionDays : -1, totalsDays: ov.totals.overtimeReductionDays };
    state.employers = state.employers.filter(e => e.id !== empId);
    state.entries = state.entries.filter(e => e.employerId !== empId);
    return result;
  });
  assertAtLeast('OT5: Übersicht-Zeile zählt mind. 2 Überstundenabbau-Tage', ot5.rowDays, 2);
  assertAtLeast('OT5: Übersicht-Totals zählen mind. 2 Überstundenabbau-Tage', ot5.totalsDays, 2);

  // OT6: getSummaryFields liefert das neue Feld mit korrektem Wert.
  const ot6 = await page.evaluate(() => getSummaryFields({
    mode: 'employee', workedMin: 9600, targetMin: 9600, balance: 0,
    vacationDays: 1, sickDays: 0, overtimeReductionDays: 2,
  }));
  const ot6Field = ot6.find(f => f.key === 'overtimeReduction');
  assertTrue('OT6: Feld overtimeReduction vorhanden', !!ot6Field, `keys=${ot6.map(f=>f.key).join(',')}`);
  assertContains('OT6: Wert nennt "2 Tage"', ot6Field?.value || '', '2 Tage');

  // OT7: computeEntryRows liefert badgeType/rightKind für den neuen Typ.
  const ot7 = await page.evaluate(async () => {
    const { computeEntryRows } = await import('/modules/selectors.js');
    const rows = computeEntryRows(
      [{ id: 'x1', employerId: 'e1', date: '2026-06-08', type: 'overtime_reduction' }],
      {
        getEmployer: () => ({ id: 'e1', name: 'Test', color: '#3b82f6' }),
        computeWorkMinutes: () => 0,
        computeHomeofficeMinutes: () => 0,
        computeMonthTargetMinutes: () => 0,
        countWorkdaysInMonth: () => 0,
      },
    );
    return rows[0];
  });
  assertEq('OT7: rightKind = absence-overtime_reduction', ot7.rightKind, 'absence-overtime_reduction');
  assertEq('OT7: badgeType = overtime_reduction', ot7.badgeType, 'overtime_reduction');

  // OT8+OT9: PDF/Word-Export enthalten die Überstundenabbau-Zeile mit Datum.
  const ot89 = await page.evaluate(async () => {
    const empId = '__ot-check-e89__';
    state.employers.push({
      id: empId, name: 'OT-Export-Check', hoursMode: 'week', weeklyHours: 40,
      breakMode: 'none', annualVacation: 30,
    });
    state.entries.push({ id: 'ot89a', employerId: empId, date: '2026-06-08', type: 'overtime_reduction' });
    const report = computeMonthReport(empId, '2026-06');
    const pdfBlob = await generatePdfBlob(report);
    const wordBlob = await generateWordBlob(report);
    const pdfBytes = Array.from(new Uint8Array(await pdfBlob.arrayBuffer()));
    const wordBytes = Array.from(new Uint8Array(await wordBlob.arrayBuffer()));
    state.employers = state.employers.filter(e => e.id !== empId);
    state.entries = state.entries.filter(e => e.employerId !== empId);
    return { pdfBytes, wordBytes };
  });
  const ot8Text = await extractPdfText(Buffer.from(ot89.pdfBytes));
  assertContains('OT8: PDF-Export enthält "Überstundenabbau"', ot8Text, 'Überstundenabbau');
  const ot9Text = await extractWordText(Buffer.from(ot89.wordBytes));
  assertContains('OT9: Word-Export enthält "Überstundenabbau"', ot9Text, 'Überstundenabbau');
}

// ---------- 1e-3) Datums-Konflikt-Schutz für Ganztagesabwesenheiten (v3.9.44) ----------

async function runAbsenceDuplicateGuardUnits(page) {
  console.log('\n=== 1e-3) Datums-Konflikt-Schutz (Urlaub/Krank/Überstundenabbau) ===');

  // DUP1: Neuer Eintrag auf freiem Datum wird ganz normal angelegt (Regressionsschutz
  // für den unveränderten Normalfall).
  const dup1 = await page.evaluate(async () => {
    const { saveEntry } = await import('/modules/ui/entry-modal.js');
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    const empId = '__dup-guard-e1__';
    state.employers.push({ id: empId, name: 'Dup-Guard-Test', hoursMode: 'week', weeklyHours: 40, breakMode: 'none' });
    let lastToast = '';
    const ctx = {
      getState: () => state, saveState, closeModals: () => {}, renderTracker: () => {}, renderEntries: () => {},
      toast: (m) => { lastToast = m; }, uid,
    };
    document.getElementById('entry-id').value = '';
    document.getElementById('entry-employer').innerHTML = `<option value="${empId}">Test</option>`;
    document.getElementById('entry-employer').value = empId;
    document.getElementById('entry-date').value = '2027-01-04';
    document.getElementById('entry-type').value = 'sick';
    document.getElementById('entry-start').value = '';
    document.getElementById('entry-end').value = '';
    document.getElementById('entry-break').value = '0';
    document.getElementById('entry-overtime-reason').value = '';
    document.getElementById('entry-note').value = '';
    saveEntry({ preventDefault: () => {} }, ctx);
    const created = state.entries.filter(e => e.employerId === empId);
    return { count: created.length, type: created[0]?.type, lastToast };
  });
  assertEq('DUP1: freies Datum \u2014 Eintrag wird angelegt', dup1.count, 1);
  assertEq('DUP1: Typ korrekt gespeichert (sick)', dup1.type, 'sick');
  assertEq('DUP1: Erfolgs-Toast im Normalfall (kein Konflikt-Hinweis)', dup1.lastToast, 'Gespeichert');

  // DUP2: Zweiter NEUER Eintrag auf demselben Datum (anderer Typ) wird blockiert \u2014
  // reproduziert den gemeldeten Fehler (Gleitzeit-Tag wurde als "Krank" anger\u00fcndigt/angezeigt,
  // weil ein zweiter Eintrag klanglos neben dem ersten existierte).
  const dup2 = await page.evaluate(async () => {
    const { saveEntry } = await import('/modules/ui/entry-modal.js');
    const empId = '__dup-guard-e1__'; // von DUP1 wiederverwendet
    let lastToast = '';
    const ctx = {
      getState: () => state, saveState, closeModals: () => {}, renderTracker: () => {}, renderEntries: () => {},
      toast: (m) => { lastToast = m; }, uid,
    };
    document.getElementById('entry-id').value = '';
    document.getElementById('entry-employer').value = empId;
    document.getElementById('entry-date').value = '2027-01-04'; // gleiches Datum wie DUP1
    document.getElementById('entry-type').value = 'overtime_reduction';
    document.getElementById('entry-note').value = '';
    saveEntry({ preventDefault: () => {} }, ctx);
    const entriesForDate = state.entries.filter(e => e.employerId === empId && e.date === '2027-01-04');
    return { count: entriesForDate.length, types: entriesForDate.map(e => e.type), lastToast };
  });
  assertEq('DUP2: belegtes Datum \u2014 kein zweiter Eintrag wird angelegt', dup2.count, 1);
  assertTrue('DUP2: der urspr\u00fcngliche Eintrag (sick) bleibt unver\u00e4ndert erhalten',
    dup2.types.length === 1 && dup2.types[0] === 'sick', `types=${JSON.stringify(dup2.types)}`);
  assertContains('DUP2: Toast nennt den Konflikt und den bestehenden Typ (Krank)', dup2.lastToast, 'Krank');
  assertContains('DUP2: Toast weist auf bereits existierenden Eintrag hin', dup2.lastToast, 'bereits ein Eintrag');

  // DUP3: Bearbeiten DESSELBEN Eintrags (gleiche id, gleiches Datum, Typwechsel) darf
  // nicht fälschlich als Konflikt mit sich selbst erkannt werden.
  const dup3 = await page.evaluate(async () => {
    const { saveEntry } = await import('/modules/ui/entry-modal.js');
    const empId = '__dup-guard-e1__';
    const existing = state.entries.find(e => e.employerId === empId && e.date === '2027-01-04');
    let lastToast = '';
    const ctx = {
      getState: () => state, saveState, closeModals: () => {}, renderTracker: () => {}, renderEntries: () => {},
      toast: (m) => { lastToast = m; }, uid,
    };
    document.getElementById('entry-id').value = existing.id;
    document.getElementById('entry-employer').value = empId;
    document.getElementById('entry-date').value = '2027-01-04';
    document.getElementById('entry-type').value = 'overtime_reduction';
    document.getElementById('entry-note').value = '';
    saveEntry({ preventDefault: () => {} }, ctx);
    const entriesForDate = state.entries.filter(e => e.employerId === empId && e.date === '2027-01-04');
    return { count: entriesForDate.length, type: entriesForDate[0]?.type, lastToast };
  });
  assertEq('DUP3: Bearbeiten des eigenen Eintrags erzeugt keinen falschen Konflikt (Erfolgs-Toast statt Konflikt-Meldung)', dup3.lastToast, 'Gespeichert');
  assertEq('DUP3: weiterhin genau 1 Eintrag an diesem Datum', dup3.count, 1);
  assertEq('DUP3: Typwechsel beim Bearbeiten wird \u00fcbernommen (overtime_reduction)', dup3.type, 'overtime_reduction');

  // DUP4: Aufräumen, damit nachfolgende Tests im selben Page-Context nicht beeinflusst werden.
  await page.evaluate(() => {
    const empId = '__dup-guard-e1__';
    state.employers = state.employers.filter(e => e.id !== empId);
    state.entries = state.entries.filter(e => e.employerId !== empId);
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
  });
}

async function runRangeVacationStatsUnits(page) {
  console.log('\n=== 1f) Urlaubskonto-Anzeige im Zeitraum-Modal ===');

  // RV1: Typ=Urlaub + Arbeitgeber gewählt -> Box sichtbar mit korrekten Zahlen
  // (genommen=2 aus zwei Urlaubseinträgen im selben Jahr, geplant=30+5=35, offen=35-2=33).
  const rv1 = await page.evaluate(async () => {
    const { updateRangeVacationStats } = await import('/modules/ui/range-entry-modal.js');
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    const emp = { id: '__rvtest__', annualVacation: 30, vacationCarryOver: 5, hiredSince: '' };
    const entries = [
      { id: 'x1', type: 'vacation', employerId: '__rvtest__', date: '2026-03-10' },
      { id: 'x2', type: 'vacation', employerId: '__rvtest__', date: '2026-11-20' },
      { id: 'x3', type: 'sick', employerId: '__rvtest__', date: '2026-04-01' },
    ];
    const empSel = document.getElementById('range-employer');
    empSel.innerHTML = `<option value="${emp.id}">Test</option>`;
    empSel.value = emp.id;
    document.getElementById('range-type').value = 'vacation';
    document.getElementById('range-start').value = '2026-06-08';
    const ctx = { getState: () => ({ employers: [emp], entries }) };
    updateRangeVacationStats(ctx);
    const box = document.getElementById('range-vacation-stats');
    return { hidden: box.hidden, html: box.innerHTML };
  });
  assertTrue('RV1: Stats-Box sichtbar bei Typ=Urlaub + Arbeitgeber', rv1.hidden === false, `hidden=${rv1.hidden}`);
  assertContains('RV1: bereits genommene Urlaubstage = 2', rv1.html, 'Bereits genommen: <strong>2</strong>');
  assertContains('RV1: geplanter Jahresurlaub = 35 (30 Jahresanspruch + 5 Vorjahr)', rv1.html, 'Urlaubsanspruch: <strong>35</strong>');
  assertContains('RV1: noch nicht erfasste Urlaubstage = 33 (35-2)', rv1.html, 'Noch nicht erfasst: <strong>33</strong>');
  assertContains('RV1: Jahr im Hinweistext (aus Von-Datum abgeleitet)', rv1.html, 'Urlaubsjahr 2026');
  assertContains('RV1: Resturlaub Vorjahr im Hinweistext genannt', rv1.html, 'davon 5 Tage Resturlaub Vorjahr');

  // RV2: Box wird bei Typ=Krankheit ausgeblendet (kein Urlaubskonto relevant).
  const rv2Hidden = await page.evaluate(async () => {
    const { updateRangeVacationStats } = await import('/modules/ui/range-entry-modal.js');
    const emp = { id: '__rvtest__', annualVacation: 30, vacationCarryOver: 5, hiredSince: '' };
    document.getElementById('range-type').value = 'sick';
    const ctx = { getState: () => ({ employers: [emp], entries: [] }) };
    updateRangeVacationStats(ctx);
    return document.getElementById('range-vacation-stats').hidden;
  });
  assertTrue('RV2: Stats-Box ausgeblendet bei Typ=Krankheit', rv2Hidden === true, `hidden=${rv2Hidden}`);

  // RV3: Box wird ausgeblendet, wenn kein Arbeitgeber gewählt ist.
  const rv3Hidden = await page.evaluate(async () => {
    const { updateRangeVacationStats } = await import('/modules/ui/range-entry-modal.js');
    document.getElementById('range-type').value = 'vacation';
    document.getElementById('range-employer').innerHTML = '';
    const ctx = { getState: () => ({ employers: [], entries: [] }) };
    updateRangeVacationStats(ctx);
    return document.getElementById('range-vacation-stats').hidden;
  });
  assertTrue('RV3: Stats-Box ausgeblendet ohne gewählten Arbeitgeber', rv3Hidden === true, `hidden=${rv3Hidden}`);
}

// ---------- Helpers für E2E ----------

/*
 * Seedet state.employers (auch im Freelance-Modus — der Kunde ist dort das "employer"-Objekt)
 * mit einem Work-Entry an heute-Datum, 09:00-16:00 = 7:00 = 420 Minuten.
 */
async function seedState(page, mode, employer) {
  await page.evaluate(({ mode, emp }) => {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    state.settings.appMode = mode;
    state.employers = [emp];
    state.activeEmployerId = emp.id;
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const day = `${y}-${m}-01`;
    state.entries = [{
      id: 'r1',
      employerId: emp.id,
      date: day,
      type: 'work',
      start: '09:00',
      end: '16:00',
      breakMinutes: 0,
      note: 'QA-Regression',
      createdAt: new Date().toISOString(),
    }];
    saveState();
  }, { mode, emp: employer });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof getSummaryFields === 'function');
  await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));
}

async function runVacationRemainingUnits(page) {
  console.log('\n=== 1c) computeVacationRemaining Unit-Tests ===');

  // V1: Voller Jahresanspruch (kein hiredSince), 0 Vorjahr, 0 genommen
  const v1 = await page.evaluate(() => {
    const emp = { id: 'e1', annualVacation: 30, vacationCarryOver: 0, hiredSince: '' };
    return computeVacationRemaining(emp, '2026-07', []);
  });
  assertEq('V1: annual=30 bei leerem hiredSince', v1.annual, 30);
  assertEq('V1: remaining=30 bei 0 genommen', v1.remaining, 30);
  assertEq('V1: prorated=false', v1.prorated, false);

  // V2: Anteilige Kürzung bei Mai-Anstellung im aktuellen Jahr (8/12 von 30 = 20)
  const v2 = await page.evaluate(() => {
    const emp = { id: 'e1', annualVacation: 30, vacationCarryOver: 0, hiredSince: '2026-05-01' };
    return computeVacationRemaining(emp, '2026-07', []);
  });
  assertEq('V2: annual anteilig gekürzt (Mai → 8/12 von 30 = 20)', v2.annual, 20);
  assertEq('V2: prorated=true', v2.prorated, true);
  assertEq('V2: hiredMonth=5', v2.hiredMonth, 5);

  // V3: Anstellung im Vorjahr — kein Prorating
  const v3 = await page.evaluate(() => {
    const emp = { id: 'e1', annualVacation: 30, vacationCarryOver: 3, hiredSince: '2020-01-01' };
    return computeVacationRemaining(emp, '2026-07', []);
  });
  assertEq('V3: annual=30 bei Vorjahr-Anstellung', v3.annual, 30);
  assertEq('V3: carryOver=3', v3.carryOver, 3);
  assertEq('V3: remaining=33 (30+3-0)', v3.remaining, 33);

  // V4: Genommene Urlaubstage bis Stichtag werden abgezogen, zukünftige nicht
  const v4 = await page.evaluate(() => {
    const emp = { id: 'e1', annualVacation: 30, vacationCarryOver: 0, hiredSince: '' };
    const entries = [
      { id: 'a', type: 'vacation', employerId: 'e1', date: '2026-03-10' },  // vor ym — zählt
      { id: 'b', type: 'vacation', employerId: 'e1', date: '2026-07-15' },  // in ym — zählt
      { id: 'c', type: 'vacation', employerId: 'e1', date: '2026-07-31' },  // Stichtag — zählt
      { id: 'd', type: 'vacation', employerId: 'e1', date: '2026-08-01' },  // Zukunft — zählt NICHT
      { id: 'e', type: 'vacation', employerId: 'e1', date: '2026-12-20' },  // Zukunft — zählt NICHT
      { id: 'f', type: 'vacation', employerId: 'e2', date: '2026-05-01' },  // anderer Employer — zählt NICHT
      { id: 'g', type: 'sick',     employerId: 'e1', date: '2026-04-01' },  // Krank — zählt NICHT
      { id: 'h', type: 'vacation', employerId: 'e1', date: '2025-12-15' },  // Vorjahr — zählt NICHT
    ];
    return computeVacationRemaining(emp, '2026-07', entries);
  });
  assertEq('V4: taken=3 (nur eigene Urlaube bis Stichtag)', v4.taken, 3);
  assertEq('V4: remaining=27 (30-3)', v4.remaining, 27);

  // V5: Überbezug wird auf 0 gekappt, nicht negativ
  const v5 = await page.evaluate(() => {
    const emp = { id: 'e1', annualVacation: 5, vacationCarryOver: 0, hiredSince: '' };
    const entries = Array.from({length: 10}, (_, i) => ({
      id: `x${i}`, type: 'vacation', employerId: 'e1', date: `2026-0${i%9+1}-01`,
    }));
    return computeVacationRemaining(emp, '2026-07', entries);
  });
  assertTrue('V5: remaining bei Überbezug=0 (nicht negativ)', v5.remaining === 0, `remaining=${v5.remaining}`);

  console.log('\n=== 1d) WhatsNew-Intro-Rendering ===');
  // W1: Intro-Text erscheint im Modal bei neuer Version
  const w1 = await page.evaluate(async () => {
    const { maybeShowWhatsNew } = await import('/modules/whatsnew.js');
    // Container + Modal ins DOM injizieren
    document.getElementById('__wntest')?.remove();
    const host = document.createElement('div');
    host.id = '__wntest';
    host.innerHTML = '<div id="wn-modal" class="modal hidden"><div id="wn-body"></div></div>';
    document.body.appendChild(host);
    // Alt-Version simulieren
    localStorage.setItem('__wn-key', '3.9.30');
    maybeShowWhatsNew({
      appVersion: '3.9.35',
      lastSeenVersionKey: '__wn-key',
      changelog: [{ version: '3.9.35', items: ['Test-Eintrag'] }],
      escapeHtml: (s) => String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])),
    }, { modalId: 'wn-modal', containerId: 'wn-body' });
    const html = document.getElementById('wn-body').innerHTML;
    const visible = !document.getElementById('wn-modal').classList.contains('hidden');
    host.remove();
    localStorage.removeItem('__wn-key');
    return { html, visible };
  });
  assertTrue('W1: Modal wird sichtbar bei neuer Version', w1.visible, `visible=${w1.visible}`);
  assertContains('W1: Intro-Text vorhanden', w1.html, 'seit Deinem letzten Besuch');
  assertContains('W1: whatsnew-intro CSS-Klasse', w1.html, 'whatsnew-intro');
  assertContains('W1: Changelog-Version gerendert', w1.html, 'Version 3.9.35');

  // W2: Kein Modal wenn Version bereits gesehen
  const w2 = await page.evaluate(async () => {
    const { maybeShowWhatsNew } = await import('/modules/whatsnew.js');
    document.getElementById('__wntest2')?.remove();
    const host = document.createElement('div');
    host.id = '__wntest2';
    host.innerHTML = '<div id="wn-modal2" class="modal hidden"><div id="wn-body2"></div></div>';
    document.body.appendChild(host);
    localStorage.setItem('__wn-key2', '3.9.35');
    maybeShowWhatsNew({
      appVersion: '3.9.35',
      lastSeenVersionKey: '__wn-key2',
      changelog: [{ version: '3.9.35', items: ['x'] }],
      escapeHtml: (s) => String(s),
    }, { modalId: 'wn-modal2', containerId: 'wn-body2' });
    const hidden = document.getElementById('wn-modal2').classList.contains('hidden');
    host.remove();
    localStorage.removeItem('__wn-key2');
    return hidden;
  });
  assertTrue('W2: Modal bleibt hidden wenn Version bereits gesehen', w2 === true);
}

async function runVacationPlanningUnits(page) {
  console.log('\n=== 1g) computeYearlyVacationPlanning + buildVacationPlanningHTML Unit-Tests ===');

  // VP1: Genommen (<=today) vs. eingegeben (>today) korrekt pro Monat aufgeteilt;
  // andere Employer, andere Jahre und Typ='sick' werden ignoriert.
  const vp1 = await page.evaluate(() => {
    const emp = { id: 'e1' };
    const entries = [
      { id: 'a', type: 'vacation', employerId: 'e1', date: '2026-01-10' }, // Jan, genommen
      { id: 'b', type: 'vacation', employerId: 'e1', date: '2026-03-05' }, // Mär, genommen
      { id: 'c', type: 'vacation', employerId: 'e1', date: '2026-06-15' }, // Stichtag selbst, genommen
      { id: 'd', type: 'vacation', employerId: 'e1', date: '2026-08-01' }, // Aug, eingegeben
      { id: 'e', type: 'vacation', employerId: 'e1', date: '2026-12-24' }, // Dez, eingegeben
      { id: 'f', type: 'vacation', employerId: 'e2', date: '2026-05-01' }, // anderer Employer
      { id: 'g', type: 'sick', employerId: 'e1', date: '2026-04-01' },     // Krank
      { id: 'h', type: 'vacation', employerId: 'e1', date: '2025-12-20' }, // Vorjahr
      { id: 'i', type: 'vacation', employerId: 'e1', date: '2027-01-05' }, // Folgejahr
    ];
    return computeYearlyVacationPlanning(emp, '2026', entries, '2026-06-15');
  });
  assertEq('VP1: totalTaken=3', vp1.totalTaken, 3);
  assertEq('VP1: totalUpcoming=2', vp1.totalUpcoming, 2);
  assertEq('VP1: totalYear=5', vp1.totalYear, 5);
  assertEq('VP1: Januar (Monat 1) genommen=1', vp1.months[0].taken, 1);
  assertEq('VP1: März (Monat 3) genommen=1', vp1.months[2].taken, 1);
  assertEq('VP1: Juni (Monat 6) — Stichtag selbst zählt als genommen', vp1.months[5].taken, 1);
  assertEq('VP1: August (Monat 8) eingegeben=1', vp1.months[7].upcoming, 1);
  assertEq('VP1: Dezember (Monat 12) eingegeben=1', vp1.months[11].upcoming, 1);
  assertEq('VP1: Februar (Monat 2) unberührt=0', vp1.months[1].taken + vp1.months[1].upcoming, 0);
  assertEq('VP1: year als String "2026"', vp1.year, '2026');

  // VP2: Ohne Arbeitgeber (emp=null) liefert die Funktion durchgehend Nullen statt zu crashen.
  const vp2 = await page.evaluate(() => {
    const entries = [{ id: 'a', type: 'vacation', employerId: 'e1', date: '2026-01-10' }];
    return computeYearlyVacationPlanning(null, '2026', entries, '2026-06-15');
  });
  assertEq('VP2: totalYear=0 ohne Arbeitgeber', vp2.totalYear, 0);
  assertEq('VP2: 12 Monate im Ergebnis-Array', vp2.months.length, 12);

  // VP3: Leere Eintrags-Liste liefert 12 leere Monate, keine Exceptions.
  const vp3 = await page.evaluate(() => computeYearlyVacationPlanning({ id: 'e1' }, '2026', [], '2026-06-15'));
  assertTrue('VP3: alle Monate 0/0 bei leerer Eintragsliste', vp3.months.every(m => m.taken === 0 && m.upcoming === 0), JSON.stringify(vp3.months));

  // VP4: buildVacationPlanningHTML rendert Summary-Karte + Monatstabelle mit Gesamt-Zeile.
  const vp4Html = await page.evaluate(() => {
    const vp = { year: '2026', months: [
      { month: 1, taken: 1, upcoming: 0 },
      { month: 2, taken: 0, upcoming: 0 },
      { month: 8, taken: 0, upcoming: 2 },
    ].concat(Array.from({ length: 9 }, (_, i) => ({ month: i + 4, taken: 0, upcoming: 0 }))).sort((a, b) => a.month - b.month),
      totalTaken: 1, totalUpcoming: 2, totalYear: 3 };
    const vr = { annual: 30, carryOver: 5, taken: 3, remaining: 32, prorated: false, hiredMonth: null };
    const emp = { id: 'e1', name: 'Test-Arbeitgeber' };
    const escapeHtml = (s) => String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
    return buildVacationPlanningHTML(vp, vr, emp, { escapeHtml, renderSummaryHTML, monthLabels: MONTH_LABELS_LONG });
  });
  assertContains('VP4: Arbeitgeber-Name im Header', vp4Html, 'Test-Arbeitgeber');
  assertContains('VP4: Jahr im Untertitel', vp4Html, 'Jahr 2026');
  assertContains('VP4: Jahresanspruch 35 Tage (30+5) in Summary-Karte', vp4Html, '35 Tage');
  assertContains('VP4: Bereits genommen 1 Tage in Summary-Karte', vp4Html, 'Bereits genommen');
  assertContains('VP4: Eingegeben (Zukunft) 2 Tage in Summary-Karte', vp4Html, 'Eingegeben (Zukunft)');
  assertContains('VP4: Noch nicht erfasst (vr.remaining=32) in Summary-Karte', vp4Html, 'Noch nicht erfasst');
  assertContains('VP4: Monatsname Januar in Tabelle', vp4Html, 'Januar');
  assertContains('VP4: Monatsname August in Tabelle', vp4Html, 'August');
  assertContains('VP4: Gesamt-Zeile mit Summe 3', vp4Html, 'Gesamt');
  assertContains('VP4: leerer Monat erhält muted-row Klasse', vp4Html, 'muted-row');
}

async function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

async function checkView(page, viewName) {
  await page.evaluate(v => switchView(v), viewName);
  await page.waitForTimeout(150);
  return await page.evaluate(() => document.body.innerText);
}

async function checkBlob(page, label, kind) {
  const result = await page.evaluate(async ({ k }) => {
    const d = new Date();
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    let blob = null;
    if (k === 'overviewPdf') {
      const ov = computeMonthOverview(ym);
      blob = await generateOverviewPdfBlob(ov);
    } else {
      const r = computeMonthReport(state.activeEmployerId, ym);
      if (!r) return null;
      if (k === 'pdf') blob = await generatePdfBlob(r);
      else if (k === 'word') blob = await generateWordBlob(r);
    }
    if (!blob) return null;
    const buf = await blob.arrayBuffer();
    return { size: blob.size, bytes: Array.from(new Uint8Array(buf)) };
  }, { k: kind });
  const size = result?.size ?? -1;
  assertAtLeast(`${label} — ${kind} > 500 bytes`, size, 500);
  return result ? Buffer.from(result.bytes) : null;
}

async function extractPdfText(buf) {
  // pdf-parse referenziert intern eine Test-Datei beim direkten Require des Index — Lib-Datei direkt laden
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  const { text } = await pdfParse(buf);
  return text || '';
}

async function extractWordText(buf) {
  const mammoth = require('mammoth');
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value || '';
}

// ---------- 2) Freelance E2E ----------

async function runFreelance(page) {
  console.log('\n=== 2) E2E Freelance (Kunde Alpha, hourlyRate=85 EUR) ===');
  await seedState(page, 'freelance', {
    id: 'e1', name: 'Kunde Alpha',
    hourlyRate: 85, currency: 'EUR',
    targetHours: 0, weeklySchedule: null,
  });

  const tracker = await checkView(page, 'tracker');
  assertTrue('freelance tracker: Rechnungsbetrag 595,00 €',
    /595,00\s*€/.test(tracker));

  const week = await checkView(page, 'week');
  // Uppercase-Label "IST" via CSS text-transform; Woche kann leer sein wenn 1. des Monats
  // in anderer KW liegt — dann matcht das persistente Label "IST" oder "RECHNUNGSBETRAG".
  assertTrue('freelance week: Ist sichtbar', /7:00/.test(week) || /IST|Ist|RECHNUNGSBETRAG/i.test(week));

  // Report-Month setzen, View wechseln und renderReport erzwingen
  await page.evaluate(v => switchView(v), 'report');
  await page.evaluate(async ym => {
    const inp = document.getElementById('report-month');
    if (inp) inp.value = ym;
    const sel = document.getElementById('report-employer');
    if (sel) sel.value = state.activeEmployerId;
    if (typeof renderReport === 'function') renderReport();
  }, await currentYm());
  await page.waitForTimeout(150);
  const report = await page.evaluate(() => document.body.innerText);
  assertTrue('freelance report: Rechnungsbetrag 595,00 €', /595,00\s*€/.test(report));

  // Overview
  await page.evaluate(async ym => {
    const inp = document.getElementById('overview-month');
    if (inp) inp.value = ym;
  }, await currentYm());
  const overview = await checkView(page, 'overview');
  assertTrue('freelance overview: 595,00 € aggregiert', /595,00\s*€/.test(overview));

  const flPdf = await checkBlob(page, 'freelance', 'pdf');
  if (flPdf) {
    const t = await extractPdfText(flPdf);
    assertTrue('freelance pdf-content: 595,00 € enthalten', /595,00\s*€?/.test(t), snippet(t));
    assertTrue('freelance pdf-content: Kunde Alpha genannt', /Kunde\s*Alpha/i.test(t), snippet(t));
    assertTrue('freelance pdf-content: 7:00 (Ist-Stunden)', /7:00|07:00/.test(t), snippet(t));
  }
  const flWord = await checkBlob(page, 'freelance', 'word');
  if (flWord) {
    const t = await extractWordText(flWord);
    assertTrue('freelance word-content: 595,00 enthalten', /595,00/.test(t), snippet(t));
    assertTrue('freelance word-content: Kunde Alpha genannt', /Kunde\s*Alpha/i.test(t), snippet(t));
  }
  const flOv = await checkBlob(page, 'freelance', 'overviewPdf');
  if (flOv) {
    const t = await extractPdfText(flOv);
    assertTrue('freelance overviewPdf-content: Kunde Alpha genannt', /Kunde\s*Alpha/i.test(t), snippet(t));
    assertTrue('freelance overviewPdf-content: 595,00 aggregiert', /595,00/.test(t), snippet(t));
  }
}

function snippet(s) {
  if (!s) return '';
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > 120 ? clean.slice(0, 120) + '…' : clean;
}

// ---------- 3) Employee E2E ----------

async function runEmployee(page) {
  console.log('\n=== 3) E2E Employee (Arbeitgeber A, targetHours=160) ===');
  await seedState(page, 'employee', {
    id: 'e1', name: 'Arbeitgeber A',
    hourlyRate: 0, currency: 'EUR',
    targetHours: 160, weeklySchedule: null,
    annualVacation: 30, hiredSince: '2020-03-15', vacationCarryOver: 5,
  });

  const tracker = await checkView(page, 'tracker');
  assertTrue('employee tracker: Ist 7:00', /7:00/.test(tracker));
  assertTrue('employee tracker: Soll sichtbar', /Soll/i.test(tracker));
  assertTrue('employee tracker: Saldo sichtbar', /Saldo/i.test(tracker));

  const week = await checkView(page, 'week');
  assertTrue('employee week: Soll sichtbar', /Soll/i.test(week));

  await page.evaluate(async ym => {
    const inp = document.getElementById('report-month');
    if (inp) inp.value = ym;
    const sel = document.getElementById('report-employer');
    if (sel) sel.value = state.activeEmployerId;
    if (typeof renderReport === 'function') renderReport();
  }, await currentYm());
  await page.waitForTimeout(150);
  const report = await page.evaluate(() => document.body.innerText);
  assertTrue('employee report: Saldo sichtbar', /Saldo/i.test(report));

  await page.evaluate(async ym => {
    const inp = document.getElementById('overview-month');
    if (inp) inp.value = ym;
  }, await currentYm());
  const overview = await checkView(page, 'overview');
  assertTrue('employee overview: Ist gesamt sichtbar', /Ist/i.test(overview));

  await page.evaluate(async ym => {
    const inp = document.getElementById('vacation-planning-year');
    if (inp) inp.value = ym.slice(0, 4);
  }, await currentYm());
  const vacationPlanning = await checkView(page, 'vacation-planning');
  assertTrue('employee vacation-planning: Header sichtbar', /Urlaubsplanung/i.test(vacationPlanning));
  assertTrue('employee vacation-planning: Arbeitgeber A genannt', /Arbeitgeber\s*A/i.test(vacationPlanning));
  assertTrue('employee vacation-planning: Jahresanspruch sichtbar', /Jahresanspruch/i.test(vacationPlanning));
  assertTrue('employee vacation-planning: Monatsname Dezember in Tabelle', /Dezember/i.test(vacationPlanning));
  assertTrue('employee vacation-planning: Gesamt-Zeile sichtbar', /Gesamt/i.test(vacationPlanning));

  const emPdf = await checkBlob(page, 'employee', 'pdf');
  if (emPdf) {
    const t = await extractPdfText(emPdf);
    assertTrue('employee pdf-content: Ist sichtbar', /\bIst\b/i.test(t), snippet(t));
    assertTrue('employee pdf-content: Soll sichtbar', /\bSoll\b/i.test(t), snippet(t));
    assertTrue('employee pdf-content: Saldo sichtbar', /\bSaldo\b/i.test(t), snippet(t));
    assertTrue('employee pdf-content: 7:00 (Ist-Stunden)', /7:00|07:00/.test(t), snippet(t));
    assertTrue('employee pdf-content: Arbeitgeber A genannt', /Arbeitgeber\s*A/i.test(t), snippet(t));
    assertTrue('employee pdf-content: Ist-Stunden', /Ist-Stunden/.test(t), snippet(t));
    assertTrue('employee pdf-content: Soll-Stunden', /Soll-Stunden/.test(t), snippet(t));
    assertTrue('employee pdf-content: Angestellt seit', /Angestellt seit/.test(t), snippet(t));
    assertTrue('employee pdf-content: Jahresurlaub', /Jahresurlaub/.test(t), snippet(t));
    assertTrue('employee pdf-content: Resturlaub', /Resturlaub/.test(t), snippet(t));
    assertTrue('employee pdf-content: Resturlaub Vorjahr 5', /Resturlaub Vorjahr:\s*5/.test(t), snippet(t));
    assertTrue('employee pdf-content: Erstellt am unten', /Erstellt am/.test(t), snippet(t));
    assertTrue('employee pdf-content: Footer Seite 1 von', /Seite 1 von \d+/.test(t), snippet(t));
    assertTrue('employee pdf-content: Footer enthält Arbeitgeber', /Arbeitszeitnachweis.*Arbeitgeber A.*Seite/.test(t), snippet(t));
    assertTrue('employee pdf-content: Footer enthält Monat', /Seite \d+ von \d+/.test(t), snippet(t));
  }
  const emWord = await checkBlob(page, 'employee', 'word');
  if (emWord) {
    const t = await extractWordText(emWord);
    assertTrue('employee word-content: Ist sichtbar', /\bIst\b/i.test(t), snippet(t));
    assertTrue('employee word-content: Soll sichtbar', /\bSoll\b/i.test(t), snippet(t));
    assertTrue('employee word-content: Saldo sichtbar', /\bSaldo\b/i.test(t), snippet(t));
    assertTrue('employee word-content: Arbeitgeber A genannt', /Arbeitgeber\s*A/i.test(t), snippet(t));
  }
  const emOv = await checkBlob(page, 'employee', 'overviewPdf');
  if (emOv) {
    const t = await extractPdfText(emOv);
    assertTrue('employee overviewPdf-content: Arbeitgeber A genannt', /Arbeitgeber\s*A/i.test(t), snippet(t));
    assertTrue('employee overviewPdf-content: Ist gesamt sichtbar', /\bIst\b/i.test(t), snippet(t));
  }
}

// ---------- SW1: Offline-Precache-Vollständigkeit ----------
// Verhindert die Regressionsklasse aus v3.9.38/39: ein neues Modul wird per
// import in app.js/modules/*.js referenziert, aber vergessen in sw.js' ASSETS
// aufzunehmen. Folge: fehlt der Netzwerkzugriff (offline / frischer SW vor
// erstem Online-Laden), bricht der komplette app.js-Modul-Import ab — die
// ganze App (inkl. Navigation) bleibt tot, ohne Konsolenfehler im Normalfall.
function runServiceWorkerPrecacheCheck() {
  const swPath = path.join(REPO_ROOT, 'sw.js');
  const swSrc = fs.readFileSync(swPath, 'utf8');
  const assetsMatch = swSrc.match(/const ASSETS = \[([\s\S]*?)\];/);
  assertTrue('SW1: ASSETS-Array in sw.js gefunden', !!assetsMatch, swPath);
  if (!assetsMatch) return;
  const assets = new Set(
    Array.from(assetsMatch[1].matchAll(/'([^']+)'/g)).map((m) => m[1])
  );

  // Alle lokalen .js-Dateien einsammeln, die per import referenziert werden könnten
  // (app.js selbst + alles unter modules/, rekursiv).
  const jsFiles = ['app.js'];
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.js')) jsFiles.push(rel);
    }
  }
  walk('modules');

  const missing = [];
  for (const file of jsFiles) {
    const rawSrc = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    // Block- und Zeilenkommentare entfernen, damit JSDoc-Beispielpfade (die
    // oft root-relativ statt relativ zur eigenen Datei angegeben sind) nicht
    // faelschlich als echte Imports gewertet werden. Import-Statements selbst
    // koennen sich ueber mehrere Zeilen erstrecken, daher komplettes File
    // bereinigen statt zeilenweise zu pruefen.
    const src = rawSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const fileDir = path.dirname(file);
    for (const m of src.matchAll(/\b(?:import|export)\b[\s\S]*?from\s+['"](\.[^'"]+)['"]/g)) {
      const importPath = m[1];
      const resolved = path.normalize(path.join(fileDir, importPath)).split(path.sep).join('/');
      const asAsset = './' + resolved;
      if (!assets.has(asAsset)) missing.push(`${file} -> ${importPath} (erwartet '${asAsset}' in sw.js ASSETS)`);
    }
  }
  assertTrue(
    'SW1: alle lokalen ES-Module-Imports sind in sw.js ASSETS precached',
    missing.length === 0,
    missing.join(' | ')
  );
}

// ---------- SW2: Versions-Badge in index.html synchron mit APP_VERSION ----------
// index.html enthaelt den Badge-Text "v<version>" statisch (kein Runtime-Update
// aus constants.js) — muss bei jedem Version-Bump manuell mitgepflegt werden.
// Diese Pruefung verhindert, dass das kuenftig vergessen wird (wie bei v3.9.39
// zunaechst passiert).
function runVersionBadgeSyncCheck() {
  const constantsSrc = fs.readFileSync(path.join(REPO_ROOT, 'modules/constants.js'), 'utf8');
  const versionMatch = constantsSrc.match(/export const APP_VERSION = '([^']+)'/);
  assertTrue('SW2: APP_VERSION in constants.js gefunden', !!versionMatch, 'modules/constants.js');
  if (!versionMatch) return;
  const appVersion = versionMatch[1];

  const indexSrc = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  const badgeMatch = indexSrc.match(/id="app-version-badge"[^>]*>v([^<]+)</);
  assertTrue('SW2: app-version-badge in index.html gefunden', !!badgeMatch, 'index.html');
  if (!badgeMatch) return;
  assertEq('SW2: Versions-Badge in index.html stimmt mit APP_VERSION ueberein', badgeMatch[1], appVersion);

  const swSrc = fs.readFileSync(path.join(REPO_ROOT, 'sw.js'), 'utf8');
  const cacheMatch = swSrc.match(/CACHE_NAME = 'arbeitszeit-v([^']+)'/);
  assertTrue('SW2: CACHE_NAME in sw.js gefunden', !!cacheMatch, 'sw.js');
  if (cacheMatch) {
    assertEq(
      'SW2: CACHE_NAME in sw.js stimmt mit APP_VERSION ueberein',
      cacheMatch[1].replace(/-/g, '.'),
      appVersion
    );
  }

  const pkgSrc = fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8');
  const pkgVersion = JSON.parse(pkgSrc).version;
  assertEq('SW2: version in package.json stimmt mit APP_VERSION ueberein', pkgVersion, appVersion);
}

// ---------- SW3: Aktiver Update-Check bei jedem App-Start (iOS-Fix v3.9.40) ----------
// Auf iOS/iPadOS feuert visibilitychange in einer durchgehend im Vordergrund
// laufenden Home-Bildschirm-App nie — ohne einen expliziten reg.update()
// direkt nach der Registrierung wird eine neu deployte Version dort nie
// erkannt. Diese Pruefung stellt sicher, dass der Aufruf nicht versehentlich
// wieder entfernt wird (z.B. bei einem Refactor von sw-update.js).
function runActiveUpdateCheckOnLoadCheck() {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'modules/sw-update.js'), 'utf8');
  const registerFnMatch = src.match(/function registerServiceWorkerWithUpdatePrompt\(\)\s*{([\s\S]*?)\n}\n/);
  assertTrue('SW3: registerServiceWorkerWithUpdatePrompt gefunden', !!registerFnMatch, 'modules/sw-update.js');
  if (!registerFnMatch) return;
  const body = registerFnMatch[1];
  // Muss ausserhalb des visibilitychange-Listeners liegen, also vor dessen
  // addEventListener-Aufruf im Funktionskoerper stehen.
  const updateCallIdx = body.indexOf('reg.update()');
  const visibilityIdx = body.indexOf("addEventListener('visibilitychange'");
  assertTrue(
    'SW3: reg.update() wird direkt beim Registrieren aufgerufen (nicht nur bei visibilitychange)',
    updateCallIdx !== -1 && (visibilityIdx === -1 || updateCallIdx < visibilityIdx),
    `updateCallIdx=${updateCallIdx} visibilityIdx=${visibilityIdx}`
  );
}

// ---------- Runner ----------

(async () => {
  console.log(`Regression-Sweep gegen ${BASE_URL}`);
  const t0 = Date.now();
  runServiceWorkerPrecacheCheck();
  runVersionBadgeSyncCheck();
  runActiveUpdateCheckOnLoadCheck();
  const { browser, page } = await boot();
  try {
    await runSelectorUnits(page);
    await runMigrationUnits(page);
    await runVacationRemainingUnits(page);
    await runVacationPlanningUnits(page);
    await runRangeEntryUnits(page);
    await runOvertimeReductionUnits(page);
    await runAbsenceDuplicateGuardUnits(page);
    await runRangeVacationStatsUnits(page);
    await runFreelance(page);
    await runEmployee(page);
  } catch (err) {
    record('runner-exception: ' + err.message, false, err.stack?.split('\n').slice(0,3).join(' | '));
  } finally {
    await browser.close();
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const total = results.length;
  const passed = total - failed;
  console.log('\n=== Ergebnis ===');
  console.log(`${passed}/${total} Checks OK — ${failed} Fehler — ${dt}s`);
  process.exit(failed === 0 ? 0 : 1);
})();
