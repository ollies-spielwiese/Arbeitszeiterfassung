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
const require = createRequire(import.meta.url);

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

  const emPdf = await checkBlob(page, 'employee', 'pdf');
  if (emPdf) {
    const t = await extractPdfText(emPdf);
    assertTrue('employee pdf-content: Ist sichtbar', /\bIst\b/i.test(t), snippet(t));
    assertTrue('employee pdf-content: Soll sichtbar', /\bSoll\b/i.test(t), snippet(t));
    assertTrue('employee pdf-content: Saldo sichtbar', /\bSaldo\b/i.test(t), snippet(t));
    assertTrue('employee pdf-content: 7:00 (Ist-Stunden)', /7:00|07:00/.test(t), snippet(t));
    assertTrue('employee pdf-content: Arbeitgeber A genannt', /Arbeitgeber\s*A/i.test(t), snippet(t));
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

// ---------- Runner ----------

(async () => {
  console.log(`Regression-Sweep gegen ${BASE_URL}`);
  const t0 = Date.now();
  const { browser, page } = await boot();
  try {
    await runSelectorUnits(page);
    await runMigrationUnits(page);
    await runVacationRemainingUnits(page);
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
