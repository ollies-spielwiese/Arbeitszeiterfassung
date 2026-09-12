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

// ---------- 1c) CDN-Library-Ladung: Subresource-Integrity (SRI) (v3.9.49) ----------
// modules/lib-loader.js pinnt seit v3.9.49 SRI-Hashes (integrity + crossorigin) fuer die drei
// per <script>-Tag nachgeladenen CDN-Libraries (jsPDF, jspdf-autotable, docx).
// SRI1 prueft, dass die aktuell hinterlegten Hashes tatsaechlich zu den ausgelieferten Dateien
// passen (sonst waere die App durch einen simplen Tippfehler im Hash dauerhaft kaputt) — und ist
// damit zugleich der ERSTE reale Aufruf von ensurePdfLibs()/ensureDocxLib() im gesamten Lauf.
// Muss deshalb vor 1e-2 (dem ersten PDF/Word-Export-Test) laufen, sonst greift bereits der
// DOM-Cache-Kurzschluss in loadScript() (script[data-lib=...] existiert schon) und der echte
// Netzwerk-Ladepfad mit Integritaetspruefung wird gar nicht mehr durchlaufen.
// SRI2 simuliert einen Hash-Mismatch direkt ueber denselben <script integrity crossorigin>-
// Mechanismus, den loadScript() verwendet, und prueft, dass der Browser den Ladevorgang
// kontrolliert ueber onerror abbricht statt den Code stillschweigend auszufuehren oder die
// App haengen zu lassen. Der exportierte Pfad selbst laesst sich fuer den negativen Fall nicht
// nochmal mit demselben Key testen (DOM-Cache + Modul-Singleton in loadScript), daher wird hier
// bewusst derselbe Mechanismus nachgebaut statt die Funktion ein zweites Mal aufzurufen.
async function runLibIntegrityUnits(page) {
  console.log('\n=== 1c) CDN-Library SRI ===');

  // SRI1: reale Hashes gegen reale CDN-Antwort — muss ohne Fehler durchlaufen.
  const positive = await page.evaluate(async () => {
    try {
      const mod = await import('/modules/lib-loader.js');
      await mod.ensurePdfLibs();
      await mod.ensureDocxLib();
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });
  assertTrue(
    'SRI1: ensurePdfLibs()/ensureDocxLib() laden mit den hinterlegten SRI-Hashes erfolgreich',
    positive.ok,
    positive.ok ? '' : positive.message
  );

  // SRI2: absichtlich falscher Hash auf einer echten, erreichbaren CDN-URL. Der native
  // Browser-Blockierungshinweis dafuer landet als Konsolenfehler — den globalen
  // console-error-Listener aus boot() dafuer kurz abhaengen (analog zur console.error-
  // Unterdrueckung in CS1), sonst wuerde dieser erwuenschte, provozierte Fehler selbst
  // als Regressions-Fehler gezaehlt werden.
  page.removeAllListeners('console');
  const negative = await page.evaluate(async () => {
    return await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ settled: false }), 8000);
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js';
      s.integrity = 'sha384-0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
      s.crossOrigin = 'anonymous';
      s.onload = () => { clearTimeout(timeout); resolve({ settled: true, rejected: false }); };
      s.onerror = () => { clearTimeout(timeout); resolve({ settled: true, rejected: true }); };
      document.head.appendChild(s);
    });
  });
  page.on('console', msg => {
    if (msg.type() === 'error') record('console-error: ' + msg.text(), false);
  });
  assertTrue(
    'SRI2: absichtlich falscher Integrity-Hash laesst den Ladevorgang kontrolliert ueber onerror fehlschlagen (kein Hang, kein ungeprueftes Ausfuehren)',
    negative.settled && negative.rejected,
    JSON.stringify(negative)
  );
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
  assertEq('mig-M1: schemaVersion nach Migration = SCHEMA_VERSION', m1.state.schemaVersion, 7);
  const tpl2 = m1.state.templates.find(t => t.id === 'tpl-2');
  const tpl9 = m1.state.templates.find(t => t.id === 'tpl-9');
  assertEq('mig-M1: tpl-2 bekommt scope=employee', tpl2?.scope, 'employee');
  assertEq('mig-M1: tpl-9 bekommt scope=both', tpl9?.scope, 'both');

  // Fall M2: State bereits auf aktueller Version darf nicht als changed markiert werden
  const m2 = await page.evaluate(() => {
    const currentState = {
      schemaVersion: 7,
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

// ---------- 1c) Konsolidierter Migrationsketten-Test (v1 → SCHEMA_VERSION, end-to-end) ----------
//
// Die einzelnen mig-M*-Tests oben prüfen jeweils EINEN Migrationsschritt isoliert.
// Dieser Test fährt einen realistischen "sehr alten Backup"-Zustand (schemaVersion
// fehlt komplett) EINMAL durch die GESAMTE Kette 1→2→3→4→5→6→7 und prüft das
// Endergebnis sowie Idempotenz der kompletten Kette — nicht nur pro Einzelschritt.
// Deckt zusätzlich Wechselwirkungen zwischen aufeinanderfolgenden Schritten ab, die
// isolierte Einzeltests nicht sehen (z. B. ob ein von Schritt N gesetztes Feld von
// Schritt N+1 versehentlich überschrieben wird).
async function runMigrationChainUnits(page) {
  console.log('\n=== 1c) Migrationsketten-Test (v1 → SCHEMA_VERSION, end-to-end) ===');

  // Voll-Legacy-Zustand: berührt JEDEN Schritt der Kette in einem Durchlauf.
  //   1→2: zwei Home-Office-Einträge am selben Tag/Employer → müssen zu einem verschmelzen
  //   2→3: Template tpl-2 ohne scope → 'employee'; Template ohne bekannte id → 'both'
  //   3→4: employer1 hat weder hiredSince noch vacationCarryOver
  //   4→5: employer1 hat kein employmentEndDate
  //   5→6: employer1 hat kein personnelNumber
  //   6→7: employer1 UND employer2 haben kein kind → beide werden auto-zugeordnet
  const chainFull = await page.evaluate(() => {
    const legacy = {
      // kein schemaVersion-Feld — muss als 1 behandelt werden
      employers: [
        { id: 'e1', name: 'Alt GmbH' },
        { id: 'e2', name: 'Kunde Alt AG' },
      ],
      entries: [
        { id: 'a', employerId: 'e1', date: '2026-02-10', type: 'homeoffice', segments: [{ start: '08:00', end: '12:00' }] },
        { id: 'b', employerId: 'e1', date: '2026-02-10', type: 'homeoffice', segments: [{ start: '13:00', end: '16:00' }] },
        { id: 'c', employerId: 'e1', date: '2026-02-11', type: 'work', start: '09:00', end: '17:00' },
      ],
      archives: [],
      templates: [
        { id: 'tpl-2', label: 'Alt', text: 'x' },
        { id: 'tpl-legacy', label: 'Y', text: 'y' },
      ],
      settings: { state: 'HE', appMode: 'employee' },
      runningTimer: null,
    };
    const first = runMigrations(legacy);
    const second = runMigrations(first.state);
    return { first, second };
  });

  const s1 = chainFull.first.state;
  assertTrue('mig-chain-1: erster Durchlauf changed=true', chainFull.first.changed === true, '');
  assertEq('mig-chain-1: schemaVersion erreicht SCHEMA_VERSION (7)', s1.schemaVersion, 7);

  // 1→2: Home-Office-Konsolidierung überlebt die gesamte restliche Kette
  const hoMerged = s1.entries.filter(e => e.type === 'homeoffice' && e.date === '2026-02-10');
  assertTrue('mig-chain-2: Home-Office-Duplikate am Kettenende konsolidiert (1 Eintrag)',
    hoMerged.length === 1, `count=${hoMerged.length}`);
  assertTrue('mig-chain-2: konsolidierter Eintrag hat beide Segmente',
    hoMerged[0]?.segments?.length === 2, `segs=${hoMerged[0]?.segments?.length}`);
  assertTrue('mig-chain-2: unbeteiligter work-Eintrag unverändert erhalten',
    s1.entries.some(e => e.id === 'c' && e.type === 'work'), '');

  // 2→3: Template-Scopes
  const tpl2 = s1.templates.find(t => t.id === 'tpl-2');
  const tplLegacy = s1.templates.find(t => t.id === 'tpl-legacy');
  assertEq('mig-chain-3: tpl-2 bekommt scope=employee', tpl2?.scope, 'employee');
  assertEq('mig-chain-3: unbekanntes Template bekommt scope=both', tplLegacy?.scope, 'both');

  // 3→4, 4→5, 5→6: additive Employer-Felder, für BEIDE Employer gesetzt
  for (const id of ['e1', 'e2']) {
    const emp = s1.employers.find(e => e.id === id);
    assertEq(`mig-chain-4: ${id}.hiredSince = '' (Default)`, emp?.hiredSince, '');
    assertEq(`mig-chain-4: ${id}.vacationCarryOver = 0 (Default)`, emp?.vacationCarryOver, 0);
    assertEq(`mig-chain-5: ${id}.employmentEndDate = '' (Default)`, emp?.employmentEndDate, '');
    assertEq(`mig-chain-6: ${id}.personnelNumber = '' (Default)`, emp?.personnelNumber, '');
  }

  // 6→7: kind-Zuordnung + Hinweis, appMode='employee' → Fallback 'employer'
  const e1After = s1.employers.find(e => e.id === 'e1');
  const e2After = s1.employers.find(e => e.id === 'e2');
  assertEq('mig-chain-7: e1.kind = employer (Fallback aus appMode)', e1After?.kind, 'employer');
  assertEq('mig-chain-7: e2.kind = employer (Fallback aus appMode)', e2After?.kind, 'employer');
  assertEq('mig-chain-7: pendingMigrationNotice.type gesetzt', s1.pendingMigrationNotice?.type, 'kindAutoAssigned');
  assertTrue('mig-chain-7: pendingMigrationNotice listet beide betroffenen Namen',
    s1.pendingMigrationNotice?.names?.length === 2, `names=${JSON.stringify(s1.pendingMigrationNotice?.names)}`);

  // Idempotenz der GESAMTEN Kette (nicht nur eines Einzelschritts): zweiter voller
  // Durchlauf über den bereits migrierten Zustand darf nichts mehr ändern.
  assertTrue('mig-chain-8: zweiter Durchlauf über voll migrierten State ist no-op',
    chainFull.second.changed === false, `changed=${chainFull.second.changed}`);

  // Einstieg aus der Mitte der Kette: State startet bereits bei schemaVersion=4
  // (3→4 bereits gelaufen) — nur 4→5→6→7 dürfen noch laufen, frühere Felder
  // bleiben unangetastet.
  const midChain = await page.evaluate(() => {
    const partial = {
      schemaVersion: 4,
      employers: [{ id: 'e1', name: 'Mitte GmbH', hiredSince: '2020-01-01', vacationCarryOver: 5 }],
      entries: [], archives: [],
      templates: [{ id: 'tpl-1', label: 'A', text: 'a', scope: 'both' }],
      settings: { state: 'HE', appMode: 'freelance' },
      runningTimer: null,
    };
    return runMigrations(partial);
  });
  assertEq('mig-chain-9: Einstieg bei v4 erreicht ebenfalls v7', midChain.state.schemaVersion, 7);
  const midEmp = midChain.state.employers[0];
  assertEq('mig-chain-9: bereits gesetztes hiredSince (v3→4) bleibt unangetastet', midEmp?.hiredSince, '2020-01-01');
  assertEq('mig-chain-9: bereits gesetztes vacationCarryOver (v3→4) bleibt unangetastet', midEmp?.vacationCarryOver, 5);
  assertEq('mig-chain-9: employmentEndDate wird beim Einstieg bei v4 nachgezogen', midEmp?.employmentEndDate, '');
  assertEq('mig-chain-9: kind wird beim Einstieg bei v4 nachgezogen (appMode=freelance → client)', midEmp?.kind, 'client');
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

  // OT3+OT4: Integration — computeMonthReport zählt die Tage separat (overtimeReductionDays),
  // rechnet sie seit v3.9.46 aber NICHT mehr wie Urlaub/Krank gut (creditedAbsenceMin bleibt 0
  // für reine Überstundenabbau-Tage) — ein Gleittag soll den Saldo tatsächlich verringern, nicht
  // neutral bleiben. Der Urlaubsanspruch aus computeVacationRemaining bleibt unberührt.
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
    const result = {
      created: res.created,
      overtimeReductionDays: report.overtimeReductionEntries.length,
      creditedAbsenceMin: report.creditedAbsenceMin,
      vacationRemaining: vacRemaining.remaining,
      vacationTaken: vacRemaining.taken,
    };
    state.employers = state.employers.filter(e => e.id !== empId);
    state.entries = state.entries.filter(e => e.employerId !== empId);
    return result;
  });
  assertEq('OT3: 2 angelegte Überstundenabbau-Tage', ot34.created, 2);
  assertEq('OT3: computeMonthReport zählt weiterhin 2 Überstundenabbau-Tage (Anzeige)', ot34.overtimeReductionDays, 2);
  assertEq('OT3: creditedAbsenceMin = 0 (Überstundenabbau wird NICHT mehr gutgeschrieben, seit v3.9.46)',
    ot34.creditedAbsenceMin, 0);
  assertEq('OT4: Urlaubsanspruch bleibt bei 30 (Überstundenabbau mindert ihn NICHT)',
    ot34.vacationRemaining, 30);
  assertEq('OT4: computeVacationRemaining zählt 0 genommene Urlaubstage', ot34.vacationTaken, 0);

  // OT4b: Saldo-Abbau-Demonstration (v3.9.46) — ein Gleittag verbraucht das zuvor aufgebaute
  // Zeitguthaben tatsächlich. Arbeitgeber 24h/Woche (Default-Schema, 4:48h=288min/Werktag).
  // 08.06. (Mo): doppelter Tag gearbeitet (576min = +288min/+4:48 Überstunden).
  // 15.06. (Mo): ganzer Gleittag (overtime_reduction, kein Arbeits-Eintrag).
  // Alle übrigen Werktage im Juni: exakt Tages-Soll (288min) gearbeitet → kein weiterer Einfluss.
  // Erwarteter Saldo am Monatsende: 0 (die +4:48 Überstunden wurden exakt durch den
  // ungedeckten Gleittag [-4:48] wieder abgebaut).
  const ot4b = await page.evaluate(() => {
    const empId = '__ot-check-e4b__';
    state.employers.push({ id: empId, name: 'OT4b-Check', hoursMode: 'week', weeklyHours: 24, breakMode: 'none', annualVacation: 30 });
    const holidays = new Set(getHolidaysInRange('2026-06-01', '2026-06-30', 'HE').map(h => h.date));
    const workdays = [];
    for (let d = 1; d <= 30; d++) {
      const iso = `2026-06-${String(d).padStart(2, '0')}`;
      const dow = new Date(iso + 'T00:00:00').getDay();
      if (dow >= 1 && dow <= 5 && !holidays.has(iso)) workdays.push(iso);
    }
    workdays.forEach((iso) => {
      if (iso === '2026-06-08') {
        state.entries.push({ id: 'ot4b-1', employerId: empId, date: iso, type: 'work', start: '08:00', end: '17:36', breakMinutes: 0 }); // 576min
      } else if (iso === '2026-06-15') {
        state.entries.push({ id: 'ot4b-2', employerId: empId, date: iso, type: 'overtime_reduction', note: 'Gleittag' }); // kein Ist
      } else {
        state.entries.push({ id: 'ot4b-w-' + iso, employerId: empId, date: iso, type: 'work', start: '09:00', end: '13:48', breakMinutes: 0 }); // 288min = Tages-Soll
      }
    });
    const report = computeMonthReport(empId, '2026-06');
    const result = { balance: report.balance, overtimeReductionDays: report.overtimeReductionEntries.length, creditedAbsenceMin: report.creditedAbsenceMin };
    state.employers = state.employers.filter(e => e.id !== empId);
    state.entries = state.entries.filter(e => e.employerId !== empId);
    return result;
  });
  assertEq('OT4b: Saldo = 0:00 — Gleittag baut die zuvor gesammelten Überstunden korrekt ab', ot4b.balance, 0);
  assertEq('OT4b: 1 Überstundenabbau-Tag weiterhin gezählt (Anzeige)', ot4b.overtimeReductionDays, 1);
  assertEq('OT4b: creditedAbsenceMin bleibt 0 (kein Urlaub/Krank in diesem Monat)', ot4b.creditedAbsenceMin, 0);

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

// ---------- 1e-4) Tagesgenaue Gutschrift bei unregelmäßigen Wochenschemata (v3.9.45) ----------

async function runDayExactCreditUnits(page) {
  console.log('\n=== 1e-4) Tagesgenaue Gutschrift (unregelmäßige Wochenschemata) ===');

  // Irregulärer Wochenplan: Mo 8h (480min), Di aus, Mi 4h (240min), Do aus, Fr 6h (360min).
  // SCHED1-3: computeDayTargetMinutes liefert das echte Tages-Soll je Wochentag,
  // nicht den Durchschnitt (18h × 60 / 5 = 216min).
  const sched123 = await page.evaluate(() => {
    const empId = '__sched-check-e1__';
    state.employers.push({
      id: empId, name: 'Sched-Check', hoursMode: 'week', weeklyHours: 18, breakMode: 'none', annualVacation: 30,
      schedule: {
        mon: { enabled: true, start: '09:00', end: '17:00', break: 0 }, // 480 min
        tue: { enabled: false, start: '', end: '', break: 0 },
        wed: { enabled: true, start: '09:00', end: '13:00', break: 0 }, // 240 min
        thu: { enabled: false, start: '', end: '', break: 0 },
        fri: { enabled: true, start: '09:00', end: '15:00', break: 0 }, // 360 min
        sat: { enabled: false, start: '', end: '', break: 0 },
        sun: { enabled: false, start: '', end: '', break: 0 },
      },
    });
    const emp = state.employers.find(e => e.id === empId);
    return {
      mon: computeDayTargetMinutes(emp, '2026-06-08'), // Montag, langer Tag
      tue: computeDayTargetMinutes(emp, '2026-06-09'), // Dienstag, deaktiviert
      wed: computeDayTargetMinutes(emp, '2026-06-10'), // Mittwoch, kurzer Tag
    };
  });
  assertEq('SCHED1: Montag (8h-Tag) liefert 480 Minuten Tages-Soll', sched123.mon, 480);
  assertEq('SCHED2: Dienstag (deaktiviert) liefert 0 Minuten', sched123.tue, 0);
  assertEq('SCHED3: Mittwoch (4h-Tag) liefert 240 Minuten Tages-Soll (nicht 216 = Durchschnitt)', sched123.wed, 240);

  // SCHED4: computeMonthReport rechnet Krank (Montag, langer Tag) + Urlaub (Mittwoch,
  // kurzer Tag) tagesgenau an: 480 + 240 = 720min, NICHT 2 × 216 = 432min (alter Durchschnitt).
  const sched4 = await page.evaluate(() => {
    const empId = '__sched-check-e1__';
    state.entries.push(
      { id: 'sc-1', employerId: empId, date: '2026-06-08', type: 'sick', note: '' },
      { id: 'sc-2', employerId: empId, date: '2026-06-10', type: 'vacation', note: '' },
    );
    const report = computeMonthReport(empId, '2026-06');
    return { creditedAbsenceMin: report.creditedAbsenceMin, dailyTargetMin: report.dailyTargetMin };
  });
  assertEq('SCHED4: Monat — tagesgenaue Gutschrift 480+240=720min (statt 2×216 Durchschnitt)',
    sched4.creditedAbsenceMin, 720);

  // SCHED5: Woche-Ansicht (renderWeek) rechnet mit derselben tagesgenauen Logik.
  // Woche 2026-W24 (Mo 08.06.–So 14.06.): nur der Urlaubstag Mittwoch (kurzer Tag, 240min)
  // liegt in dieser Woche; Wochen-Soll = 480(Mo)+240(Mi)+360(Fr) = 1080min; Ist = 0.
  // Erwarteter Saldo = 0 + 240 − 1080 = −840min = −14:00.
  const weekHtml = await page.evaluate(() => {
    const empId = '__sched-check-e1__';
    state.activeEmployerId = empId;
    state.entries = state.entries.filter(e => !(e.employerId === empId && e.date === '2026-06-08')); // nur Mi-Urlaub behalten
    document.getElementById('week-employer').innerHTML = '';
    document.getElementById('week-employer').value = '';
    document.getElementById('week-input').value = '2026-W24';
    renderWeek();
    return document.getElementById('week-content').innerText;
  });
  const saldoMatch = /Saldo\s*\n?\s*(-?\d{1,3}:\d{2})/.exec(weekHtml);
  assertTrue('SCHED5: Woche zeigt Saldo −14:00 (tagesgenaue Gutschrift für Mittwoch-Urlaub)',
    !!saldoMatch && saldoMatch[1] === '-14:00', `weekHtml-Ausschnitt=${weekHtml.slice(0, 300)}`);

  // SCHED6: Regressionsschutz — Arbeitgeber OHNE individuelles Wochenschema (defaultSchedule,
  // gleichmäßig) bleibt intern konsistent: die Gutschrift entspricht weiterhin exakt der Summe
  // der Tages-Solls aus computeDayTargetMinutes (hier: 40h/Woche → defaultSchedule mit Pause,
  // also 450min/Tag statt der alten pausenfreien Durchschnittsformel 480min/Tag — das ist die
  // in OT3 dokumentierte, bewusst korrigierte Inkonsistenz, siehe dortigen Kommentar).
  const sched6 = await page.evaluate(() => {
    const empId = '__sched-check-e2__';
    state.employers.push({ id: empId, name: 'Sched-Default', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', annualVacation: 30 });
    state.entries.push(
      { id: 'sc-3', employerId: empId, date: '2026-06-08', type: 'vacation', note: '' },
      { id: 'sc-4', employerId: empId, date: '2026-06-09', type: 'sick', note: '' },
    );
    const emp = state.employers.find(e => e.id === empId);
    const expected = computeDayTargetMinutes(emp, '2026-06-08') + computeDayTargetMinutes(emp, '2026-06-09');
    const report = computeMonthReport(empId, '2026-06');
    const result = { creditedAbsenceMin: report.creditedAbsenceMin, expected };
    state.employers = state.employers.filter(e => e.id !== empId);
    state.entries = state.entries.filter(e => e.employerId !== empId);
    return result;
  });
  assertEq('SCHED6: Arbeitgeber ohne eigenes Wochenschema — Gutschrift = Summe der Tages-Solls (konsistent, Pause berücksichtigt)',
    sched6.creditedAbsenceMin, sched6.expected);

  // Aufräumen
  await page.evaluate(() => {
    const empId = '__sched-check-e1__';
    state.employers = state.employers.filter(e => e.id !== empId);
    state.entries = state.entries.filter(e => e.employerId !== empId);
  });
}

// ---------- 1e-5) XSS-Haertung: Zeitraum-Details in der Wochenansicht werden escaped (v3.9.51) ----------
// CodeQL (js/xss-through-dom) hat gemeldet, dass modules/render/week.js den Tages-Detailtext
// (u.a. `${e.start}-${e.end}` aus den gespeicherten Zeiteintraegen) unescaped per innerHTML
// rendert. Der Backup-Import (modules/backup.js) validiert den Inhalt einzelner Eintraege nicht
// inhaltlich -- eine praeparierte Backup-Datei koennte also z.B. start="<img src=x onerror=...>"
// enthalten. SEC1 simuliert genau diesen Weg: Eintrag mit HTML-Payload direkt in state.entries,
// dann echte Wochenansicht rendern -- der Payload darf weder als Element im DOM landen noch
// ausgefuehrt werden, sondern muss als reiner (escaped) Text erscheinen.
async function runWeekViewXssHardeningUnits(page) {
  console.log('\n=== 1e-5) XSS-Haertung: Wochenansicht-Details ===');

  const sec1 = await page.evaluate(() => {
    window.__az_xss_fired__ = false;
    const empId = '__xss-week-check__';
    state.employers.push({ id: empId, name: 'XSS-Check', hoursMode: 'week', weeklyHours: 40, breakMode: 'none' });
    state.entries.push({
      id: 'xss-1', employerId: empId, date: '2026-06-08', type: 'work',
      start: '<img src=x onerror="window.__az_xss_fired__=true">', end: '10:00',
    });
    state.activeEmployerId = empId;
    document.getElementById('week-employer').innerHTML = `<option value="${empId}">XSS-Check</option>`;
    document.getElementById('week-employer').value = empId;
    document.getElementById('week-input').value = '2026-W24';
    renderWeek();
    const container = document.getElementById('week-content');
    const result = {
      xssFired: window.__az_xss_fired__,
      hasRawImgTag: !!container.querySelector('img'),
      containsEscapedPayload: container.innerHTML.includes('&lt;img'),
    };
    // Aufraeumen
    state.employers = state.employers.filter(e => e.id !== empId);
    state.entries = state.entries.filter(e => e.employerId !== empId);
    delete window.__az_xss_fired__;
    return result;
  });
  assertTrue('SEC1: HTML-Payload in Eintrags-Zeiten wird NICHT ausgefuehrt (kein onerror-Trigger)',
    sec1.xssFired === false, JSON.stringify(sec1));
  assertTrue('SEC1: kein echtes <img>-Element im gerenderten Wochenbericht-DOM',
    sec1.hasRawImgTag === false, JSON.stringify(sec1));
  assertTrue('SEC1: Payload erscheint als escapeter Text (&lt;img ...) statt als HTML',
    sec1.containsEscapedPayload === true, JSON.stringify(sec1));

  // SEC1b: buildWeekHTML() ist der reine Builder, den renderWeek() fuer den Sink nutzt
  // (container.innerHTML = _buildWeekHTMLRaw(...) in app.js). CodeQL hat als Quelle dafuer
  // wkInput.value (isoWeek) markiert -- das <input type="week"> im echten UI lehnt zwar
  // ungueltige Werte selbst ab, aber der Builder selbst darf sich nicht allein darauf
  // verlassen. Direkter Aufruf mit praepariertem isoWeek umgeht die Input-Validierung des
  // Browsers und prueft die Absicherung im Builder selbst.
  const sec1b = await page.evaluate(async () => {
    const { buildWeekHTML } = await import('/modules/render/week.js');
    const { escapeHtml } = await import('/modules/util-format.js');
    const { formatDate } = await import('/modules/util-time.js');
    const { renderSummaryHTML } = await import('/modules/render/summary.js');
    const { DAY_LABELS_LONG } = await import('/modules/compute.js');
    const html = buildWeekHTML(
      {
        emp: { name: 'XSS-Check' },
        isoWeek: '<img src=x onerror="window.__az_xss_fired__=true">',
        dates: ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14'],
        dayModels: Array.from({ length: 7 }, () => ({ workMin: 0, hoursDisplay: '–', detail: '', isToday: false, holiday: null })),
        weekFields: [],
      },
      { escapeHtml, formatDate, renderSummaryHTML, DAY_LABELS_LONG },
    );
    return { html, containsRawImgTag: html.includes('<img src=x onerror='), containsEscapedPayload: html.includes('&lt;img') };
  });
  assertTrue('SEC1b: buildWeekHTML() escaped ein praepariertes isoWeek (kein rohes <img>-Tag im HTML)',
    sec1b.containsRawImgTag === false, sec1b.html.slice(0, 300));
  assertTrue('SEC1b: praepariertes isoWeek erscheint escaped (&lt;img ...) statt als HTML',
    sec1b.containsEscapedPayload === true, sec1b.html.slice(0, 300));
}

async function runRangeVacationStatsUnits(page) {
  console.log('\n=== 1f) Urlaubskonto-Anzeige im Zeitraum-Modal ===');

  // RV1: Typ=Urlaub + Arbeitgeber gewählt -> Box sichtbar mit korrekten Zahlen
  // (genommen=2 aus zwei Urlaubseinträgen im selben Jahr, geplant=30+5=35, offen=35-2=33).
  const rv1 = await page.evaluate(async () => {
    const { updateRangeVacationStats } = await import('/modules/ui/range-entry-modal.js');
    const { escapeHtml } = await import('/modules/util-format.js');
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
    const ctx = { getState: () => ({ employers: [emp], entries }), escapeHtml };
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
    const { escapeHtml } = await import('/modules/util-format.js');
    const emp = { id: '__rvtest__', annualVacation: 30, vacationCarryOver: 5, hiredSince: '' };
    document.getElementById('range-type').value = 'sick';
    const ctx = { getState: () => ({ employers: [emp], entries: [] }), escapeHtml };
    updateRangeVacationStats(ctx);
    return document.getElementById('range-vacation-stats').hidden;
  });
  assertTrue('RV2: Stats-Box ausgeblendet bei Typ=Krankheit', rv2Hidden === true, `hidden=${rv2Hidden}`);

  // RV3: Box wird ausgeblendet, wenn kein Arbeitgeber gewählt ist.
  const rv3Hidden = await page.evaluate(async () => {
    const { updateRangeVacationStats } = await import('/modules/ui/range-entry-modal.js');
    const { escapeHtml } = await import('/modules/util-format.js');
    document.getElementById('range-type').value = 'vacation';
    document.getElementById('range-employer').innerHTML = '';
    const ctx = { getState: () => ({ employers: [], entries: [] }), escapeHtml };
    updateRangeVacationStats(ctx);
    return document.getElementById('range-vacation-stats').hidden;
  });
  assertTrue('RV3: Stats-Box ausgeblendet ohne gewählten Arbeitgeber', rv3Hidden === true, `hidden=${rv3Hidden}`);
}

// ---------- 1g) Freier-Tag / off_day Unit-Tests (v3.9.47) ----------

async function runOffDayUnits(page) {
  console.log('\n=== 1g) Freier-Tag (off_day) Unit-Tests ===');

  // OD1+OD2: computeDayTargetMinutes liefert für einen normalen Montag ein Soll > 0,
  // sinkt aber auf 0, sobald für denselben Tag/Employer ein 'off_day'-Eintrag existiert.
  const od12 = await page.evaluate(() => {
    const emp = { id: '__od12__', hoursMode: 'week', weeklyHours: 40, breakMode: 'none' };
    const before = computeDayTargetMinutes(emp, '2026-06-08'); // Montag
    state.entries.push({ id: 'od12-e', employerId: emp.id, date: '2026-06-08', type: 'off_day' });
    const after = computeDayTargetMinutes(emp, '2026-06-08');
    state.entries = state.entries.filter((e) => e.id !== 'od12-e');
    return { before, after };
  });
  assertTrue('OD1: normaler Montag hat Tages-Soll > 0', od12.before > 0, `${od12.before}`);
  assertEq('OD2: Freier Tag liefert 0 Minuten Tages-Soll (Soll-Ausschluss)', od12.after, 0);

  // OD3+OD4: computeMonthReport zählt den Freien Tag, senkt das Monats-Soll exakt um den
  // Tageswert und lässt die Ist-Stunden unverändert.
  const od34 = await page.evaluate(() => {
    const empId = '__od-report__';
    state.employers.push({ id: empId, name: 'OD-Report', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', annualVacation: 30 });
    state.entries.push({ id: 'od-work', employerId: empId, date: '2026-06-09', type: 'work', start: '09:00', end: '17:00', breakMinutes: 0 });
    const before = computeMonthReport(empId, '2026-06');
    state.entries.push({ id: 'od-off', employerId: empId, date: '2026-06-08', type: 'off_day' });
    const after = computeMonthReport(empId, '2026-06');
    const result = {
      offDayCount: after.offDayEntries.length,
      targetDelta: before.targetMin - after.targetMin,
      workedSame: before.workedMin === after.workedMin,
    };
    state.employers = state.employers.filter((e) => e.id !== empId);
    state.entries = state.entries.filter((e) => e.employerId !== empId);
    return result;
  });
  assertEq('OD3: computeMonthReport zählt 1 Freier-Tag-Eintrag', od34.offDayCount, 1);
  assertTrue('OD4: Monats-Soll sinkt durch den Freien Tag', od34.targetDelta > 0, `delta=${od34.targetDelta}`);
  assertTrue('OD4b: Ist-Stunden bleiben durch den Freien Tag unverändert', od34.workedSame, '');

  // OD5: computeMonthOverview zählt offDayDays sowohl je Arbeitgeber-Zeile als auch in den Totals.
  const od5 = await page.evaluate(() => {
    const empId = '__od-ov__';
    state.employers.push({ id: empId, name: 'OD-Overview', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', annualVacation: 30 });
    state.entries.push({ id: 'od-off2', employerId: empId, date: '2026-06-08', type: 'off_day' });
    const ov = computeMonthOverview('2026-06');
    const row = ov.rows.find((r) => r.employer.id === empId);
    const result = { rowOffDays: row ? row.offDayDays : -1, totalsOffDays: ov.totals.offDayDays };
    state.employers = state.employers.filter((e) => e.id !== empId);
    state.entries = state.entries.filter((e) => e.employerId !== empId);
    return result;
  });
  assertEq('OD5: Übersicht-Zeile zählt 1 Freien Tag', od5.rowOffDays, 1);
  assertAtLeast('OD5: Übersicht-Totals zählen mind. 1 Freien Tag', od5.totalsOffDays, 1);

  // OD6: computeEntryRows liefert für 'off_day' den korrekten Badge- und rightKind-Typ
  // (Grundlage für die Anzeige in der Eintragsliste).
  const od6 = await page.evaluate(() => {
    const entry = { id: 'od-badge', employerId: '__od-badge__', date: '2026-06-08', type: 'off_day' };
    const rows = computeEntryRows([entry], {
      getEmployer, computeWorkMinutes, computeHomeofficeMinutes, computeMonthTargetMinutes, countWorkdaysInMonth,
    });
    return rows[0];
  });
  assertEq('OD6: badgeType = off_day', od6.badgeType, 'off_day');
  assertEq('OD6: rightKind = absence-off_day', od6.rightKind, 'absence-off_day');
}

// ---------- 1h) Änderungsprotokoll (Audit-Log) Unit-Tests (v3.9.47) ----------

async function runAuditLogUnits(page) {
  console.log('\n=== 1h) Änderungsprotokoll (Audit-Log) Unit-Tests ===');

  // AL1: pushAuditLog erzeugt einen Log-Eintrag mit den erwarteten Feldern.
  const al1 = await page.evaluate(() => {
    const s = { auditLog: [] };
    const entry = { id: 'e1', employerId: 'emp1', date: '2026-06-08', type: 'vacation' };
    const log = pushAuditLog(s, { action: 'create', entry, summary: 'Testeintrag', uid: () => 'log-1' });
    return { log, auditLogLength: s.auditLog.length };
  });
  assertEq('AL1: action=create korrekt übernommen', al1.log.action, 'create');
  assertEq('AL1: entryId korrekt übernommen', al1.log.entryId, 'e1');
  assertEq('AL1: employerId korrekt übernommen', al1.log.employerId, 'emp1');
  assertEq('AL1: entryType korrekt übernommen', al1.log.entryType, 'vacation');
  assertEq('AL1: state.auditLog hat genau 1 Eintrag', al1.auditLogLength, 1);

  // AL2: state.auditLog wird additiv angelegt, falls das Feld (Altbestand) noch fehlt.
  const al2HasArray = await page.evaluate(() => {
    const s = {};
    pushAuditLog(s, { action: 'update', entry: { id: 'e2' }, uid: () => 'log-2' });
    return Array.isArray(s.auditLog);
  });
  assertTrue('AL2: state.auditLog wird additiv angelegt (kein Migrations-Eintrag nötig)', al2HasArray, '');

  // AL3: Obergrenze AUDIT_LOG_MAX=500 wird per FIFO eingehalten.
  const al3 = await page.evaluate(() => {
    const s = { auditLog: [] };
    for (let i = 0; i < 505; i++) {
      pushAuditLog(s, { action: 'create', entry: { id: `e${i}` }, uid: () => `log-${i}` });
    }
    return { length: s.auditLog.length, first: s.auditLog[0].entryId, last: s.auditLog[s.auditLog.length - 1].entryId };
  });
  assertEq('AL3: Obergrenze bei 500 Einträgen eingehalten', al3.length, 500);
  assertEq('AL3: älteste Einträge werden entfernt (FIFO)', al3.first, 'e5');
  assertEq('AL3: neuester Eintrag bleibt erhalten', al3.last, 'e504');

  // AL4: formatAuditLogLine liefert lesbaren Text mit Aktion, Typ, Datum, Arbeitgeber, Zusammenfassung.
  const al4 = await page.evaluate(() => {
    const log = { action: 'delete', entryType: 'sick', date: '2026-06-08', summary: 'Testlöschung', employerId: 'emp1' };
    return formatAuditLogLine(log, { getEmployer: () => ({ name: 'Arbeitgeber A' }), formatDateLong: (d) => d });
  });
  assertContains('AL4: Aktion "Gelöscht" enthalten', al4, 'Gelöscht');
  assertContains('AL4: Typ "Krankheit" enthalten', al4, 'Krankheit');
  assertContains('AL4: Arbeitgeber-Name enthalten', al4, 'Arbeitgeber A');
  assertContains('AL4: Zusammenfassung in Klammern enthalten', al4, '(Testlöschung)');

  // AL5: buildAuditLogHTML zeigt höchstens 50 sichtbare Zeilen (MAX_VISIBLE), neueste zuerst.
  const al5 = await page.evaluate(() => {
    const log = [];
    for (let i = 0; i < 60; i++) {
      log.push({ id: `l${i}`, at: new Date(2026, 5, 1, 0, i).toISOString(), action: 'create', entryId: `e${i}`, entryType: 'work', date: '2026-06-01' });
    }
    return buildAuditLogHTML(log, {});
  });
  const al5RowCount = (al5.match(/audit-log-row/g) || []).length;
  assertEq('AL5: höchstens 50 sichtbare Zeilen (MAX_VISIBLE)', al5RowCount, 50);

  // AL6: leeres Audit-Log zeigt einen Empty-State statt einer kaputten Liste.
  const al6 = await page.evaluate(() => buildAuditLogHTML([], {}));
  assertContains('AL6: Empty-State bei leerem Audit-Log', al6, 'Noch keine Änderungen protokolliert');
}

// ---------- 1n) Hilfe-Button "Einstellungen" (Modal) ----------

async function runSettingsHelpUnits(page) {
  console.log('\n=== 1n) Hilfe-Button "Einstellungen" (Modal) ===');

  const before = await page.evaluate(() => {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    const modal = document.getElementById('modal-settings-help');
    return {
      existsBtn: !!document.getElementById('btn-settings-help'),
      existsModal: !!modal,
      hiddenBefore: modal ? modal.classList.contains('hidden') : null,
    };
  });
  assertTrue('SH1: Hilfe-Button #btn-settings-help existiert', before.existsBtn);
  assertTrue('SH2: Modal #modal-settings-help existiert', before.existsModal);
  assertTrue('SH3: Modal ist initial verborgen', before.hiddenBefore, String(before.hiddenBefore));

  const afterOpen = await page.evaluate(() => {
    document.getElementById('btn-settings-help').click();
    const modal = document.getElementById('modal-settings-help');
    return { hidden: modal.classList.contains('hidden'), text: modal.textContent };
  });
  assertTrue('SH4: Modal \u00f6ffnet sich nach Klick auf den Hilfe-Button', !afterOpen.hidden);
  assertContains('SH5: Hilfetext enth\u00e4lt "Feiertage anpassen"', afterOpen.text, 'Feiertage anpassen');
  assertContains('SH6: Hilfetext enth\u00e4lt "Notizvorlagen"', afterOpen.text, 'Notizvorlagen');
  assertContains('SH7: Hilfetext enth\u00e4lt "\u00c4nderungsprotokoll"', afterOpen.text, 'Änderungsprotokoll');
  assertContains('SH8: Hilfetext enth\u00e4lt "Backup-Erinnerung"', afterOpen.text, 'Backup-Erinnerung');

  const afterClose = await page.evaluate(() => {
    const modal = document.getElementById('modal-settings-help');
    const closeBtn = modal.querySelector('[data-close-modal]');
    closeBtn.click();
    return { hidden: modal.classList.contains('hidden') };
  });
  assertTrue('SH9: Modal schlie\u00dft sich \u00fcber den Schlie\u00dfen-Button', afterClose.hidden);
}

// ---------- 1o) Hilfe-Button "Arbeitgeber/Kunden verwalten" (Modal, modusabhaengig) ----------

async function runEmployersHelpUnits(page) {
  console.log('\n=== 1o) Hilfe-Button "Arbeitgeber/Kunden verwalten" (Modal, modusabhaengig) ===');

  const before = await page.evaluate(() => {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    state.settings.appMode = 'employee';
    renderEmployers();
    const modal = document.getElementById('modal-employers-help');
    return {
      existsBtn: !!document.getElementById('btn-employers-help'),
      existsModal: !!modal,
      hiddenBefore: modal ? modal.classList.contains('hidden') : null,
      titleText: document.getElementById('employers-view-title').textContent.trim(),
    };
  });
  assertTrue('EH1: Hilfe-Button #btn-employers-help existiert', before.existsBtn);
  assertTrue('EH2: Modal #modal-employers-help existiert', before.existsModal);
  assertTrue('EH3: Modal ist initial verborgen', before.hiddenBefore, String(before.hiddenBefore));
  assertEq('EH4: Ansicht zeigt "Arbeitgeber verwalten" im Angestellt-Modus', before.titleText, 'Arbeitgeber verwalten');

  const employedOpen = await page.evaluate(() => {
    document.getElementById('btn-employers-help').click();
    const modal = document.getElementById('modal-employers-help');
    return {
      hidden: modal.classList.contains('hidden'),
      modalTitle: document.getElementById('modal-employers-help-title').textContent.trim(),
      employedHidden: document.getElementById('employers-help-employed').classList.contains('hidden'),
      freelanceHidden: document.getElementById('employers-help-freelance').classList.contains('hidden'),
      text: modal.textContent,
    };
  });
  assertTrue('EH5: Modal oeffnet sich nach Klick (Angestellt-Modus)', !employedOpen.hidden);
  assertEq('EH6: Modal-Titel "Hilfe: Arbeitgeber verwalten" im Angestellt-Modus', employedOpen.modalTitle, 'Hilfe: Arbeitgeber verwalten');
  assertTrue('EH7: Arbeitgeber-Textblock sichtbar, Kunden-Textblock verborgen', !employedOpen.employedHidden && employedOpen.freelanceHidden);
  assertContains('EH7b: Hilfetext (Angestellt) enthaelt "Sollstunden"', employedOpen.text, 'Sollstunden');
  assertContains('EH7c: Hilfetext (Angestellt) enthaelt "Pers.-Nr."', employedOpen.text, 'Pers.-Nr.');
  assertContains('EH7d: Hilfetext (Angestellt) enthaelt "Beschäftigt bis"', employedOpen.text, 'Beschäftigt bis');
  assertContains('EH7e: Hilfetext (Angestellt) enthaelt "Ehemalige anzeigen"', employedOpen.text, 'Ehemalige anzeigen');
  assertTrue('EH7f: Hilfetext (Angestellt) enthaelt NICHT mehr veraltetes "Adresse"-Feld', !employedOpen.text.includes('Adresse für den Nachweiskopf'));

  const closeEmployed = await page.evaluate(() => {
    const modal = document.getElementById('modal-employers-help');
    modal.querySelector('[data-close-modal]').click();
    return { hidden: modal.classList.contains('hidden') };
  });
  assertTrue('EH8: Modal schliesst sich ueber den Schliessen-Button (Angestellt)', closeEmployed.hidden);

  const freelanceOpen = await page.evaluate(() => {
    state.settings.appMode = 'freelance';
    renderEmployers();
    document.getElementById('btn-employers-help').click();
    const modal = document.getElementById('modal-employers-help');
    return {
      titleText: document.getElementById('employers-view-title').textContent.trim(),
      modalTitle: document.getElementById('modal-employers-help-title').textContent.trim(),
      employedHidden: document.getElementById('employers-help-employed').classList.contains('hidden'),
      freelanceHidden: document.getElementById('employers-help-freelance').classList.contains('hidden'),
      text: modal.textContent,
      hidden: modal.classList.contains('hidden'),
    };
  });
  assertEq('EH9: Ansicht zeigt "Kunden verwalten" im Freiberufler-Modus', freelanceOpen.titleText, 'Kunden verwalten');
  assertEq('EH9b: Modal-Titel "Hilfe: Kunden verwalten" im Freiberufler-Modus', freelanceOpen.modalTitle, 'Hilfe: Kunden verwalten');
  assertTrue('EH9c: Kunden-Textblock sichtbar, Arbeitgeber-Textblock verborgen', !freelanceOpen.freelanceHidden && freelanceOpen.employedHidden);
  assertContains('EH9d: Hilfetext (Freiberuflich) enthaelt "Stundensatz"', freelanceOpen.text, 'Stundensatz');
  assertContains('EH9e: Hilfetext (Freiberuflich) enthaelt "Pers.-Nr."', freelanceOpen.text, 'Pers.-Nr.');
  assertContains('EH9f: Hilfetext (Freiberuflich) enthaelt "Ehemalige anzeigen"', freelanceOpen.text, 'Ehemalige anzeigen');
  assertTrue('EH9g: Hilfetext (Freiberuflich) behauptet NICHT mehr faelschlich, Sollstunden seien ausgeblendet', !freelanceOpen.text.includes('Sollstunden, Pausenregelung, Urlaubsanspruch und feste Wochenarbeitszeiten sind im Freiberufler-Modus ausgeblendet'));

  const closeFreelanceAndReset = await page.evaluate(() => {
    const modal = document.getElementById('modal-employers-help');
    modal.querySelector('.modal-close').click();
    const hidden = modal.classList.contains('hidden');
    state.settings.appMode = 'employee';
    renderEmployers();
    return { hidden };
  });
  assertTrue('EH10: Modal schliesst sich ueber das X-Icon (Freiberuflich)', closeFreelanceAndReset.hidden);
}

// ---------- 1o-2) Bedienungsanleitung Abschnitt 7 + 12a auf Aktualitaet pruefen ----------

async function runGuideDocUnits(page) {
  console.log('\n=== 1o-2) Bedienungsanleitung: Abschnitt 7 (Arbeitgeber) + 12a (Freiberufler) ===');

  const guide = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('#view-guide details.guide-section'));
    const find = (needle) => sections.find((s) => s.querySelector('summary')?.textContent.includes(needle));
    const sec7 = find('7. Reiter');
    const sec12a = find('12a.');
    return {
      sec7Text: sec7 ? sec7.textContent : null,
      sec12aText: sec12a ? sec12a.textContent : null,
    };
  });
  assertTrue('GD1: Abschnitt 7 gefunden', !!guide.sec7Text);
  assertTrue('GD2: Abschnitt 12a gefunden', !!guide.sec12aText);
  assertContains('GD3: Abschnitt 7 enthaelt "Pers.-Nr."', guide.sec7Text || '', 'Pers.-Nr.');
  assertContains('GD4: Abschnitt 7 enthaelt "Beschaeftigt bis"', guide.sec7Text || '', 'Besch\u00e4ftigt bis');
  assertContains('GD5: Abschnitt 7 enthaelt "Ehemalige anzeigen"', guide.sec7Text || '', 'Ehemalige anzeigen');
  assertContains('GD6: Abschnitt 7 enthaelt "Resturlaubstage Vorjahr"', guide.sec7Text || '', 'Resturlaubstage Vorjahr');
  assertTrue('GD7: Abschnitt 7 enthaelt NICHT mehr veraltetes "Adresse"-Feld', !(guide.sec7Text || '').includes('Adresse f\u00fcr den Nachweiskopf'));
  assertContains('GD8: Abschnitt 12a enthaelt "Pers.-Nr."', guide.sec12aText || '', 'Pers.-Nr.');
  assertContains('GD9: Abschnitt 12a enthaelt "Ehemalige anzeigen"', guide.sec12aText || '', 'Ehemalige anzeigen');
}

// ---------- 1i) Undo (Zeitraum-Erfassung) Unit- + Integrationstest ----------

async function runUndoUnits(page) {
  console.log('\n=== 1i) Undo (Zeitraum-Erfassung) Tests ===');

  // UN1: removeEntriesByIds (reine Logik) entfernt genau die angegebenen IDs.
  const un1 = await page.evaluate(() => {
    const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    return removeEntriesByIds(entries, ['b']).map((e) => e.id);
  });
  assertEq('UN1: removeEntriesByIds entfernt genau die angegebene ID', un1.length, 2);
  assertTrue('UN1: verbleibende IDs sind a und c', un1.join(',') === 'a,c', un1.join(','));

  // UN2: Integration — echte Zeitraum-Erfassung über das Formular, Klick auf "Rückgängig"
  // im Toast entfernt die soeben angelegten Einträge wieder und protokolliert beides im Audit-Log.
  const un2 = await page.evaluate(async () => {
    const empId = '__undo-test__';
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    state.employers.push({ id: empId, name: 'Undo-Test', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', annualVacation: 30 });
    state.activeEmployerId = empId;

    document.getElementById('range-employer').innerHTML = `<option value="${empId}">Undo-Test</option>`;
    document.getElementById('range-employer').value = empId;
    document.getElementById('range-type').value = 'vacation';
    document.getElementById('range-start').value = '2026-07-06'; // Montag
    document.getElementById('range-end').value = '2026-07-08';   // Mittwoch
    document.getElementById('range-skip-weekends-holidays').checked = true;
    document.getElementById('range-note').value = 'Undo-Test';

    document.getElementById('form-range-entry').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 60));

    const afterCreate = state.entries.filter((e) => e.employerId === empId).length;
    const auditAfterCreate = state.auditLog.filter((l) => l.employerId === empId && l.action === 'create').length;

    const toastBtn = document.querySelector('#toast .toast-action');
    const hasUndoButton = !!toastBtn;
    if (toastBtn) toastBtn.click();
    await new Promise((r) => setTimeout(r, 60));

    const afterUndo = state.entries.filter((e) => e.employerId === empId).length;
    const auditAfterUndo = state.auditLog.filter((l) => l.employerId === empId && l.action === 'delete').length;

    state.employers = state.employers.filter((e) => e.id !== empId);
    state.entries = state.entries.filter((e) => e.employerId !== empId);
    state.auditLog = state.auditLog.filter((l) => l.employerId !== empId);

    return { afterCreate, auditAfterCreate, hasUndoButton, afterUndo, auditAfterUndo };
  });
  assertEq('UN2: 3 Urlaubstage werden per Zeitraum-Erfassung angelegt', un2.afterCreate, 3);
  assertEq('UN2: 3 Create-Einträge im Audit-Log', un2.auditAfterCreate, 3);
  assertTrue('UN2: Toast zeigt "Rückgängig"-Aktion an', un2.hasUndoButton, '');
  assertEq('UN2: nach Rückgängig sind alle 3 Einträge wieder entfernt', un2.afterUndo, 0);
  assertEq('UN2: 3 Delete-Einträge im Audit-Log nach Rückgängig', un2.auditAfterUndo, 3);
}

// ---------- 1j) Backup-Erinnerung Unit-Tests (v3.9.47) ----------

async function runBackupReminderUnits(page) {
  console.log('\n=== 1j) Backup-Erinnerung Unit-Tests ===');

  // BR1: Ohne vorhandene Einträge bleibt der Banner ausgeblendet.
  const br1 = await page.evaluate(() => {
    const savedEntries = state.entries.slice();
    const savedSettings = { ...state.settings };
    state.entries = [];
    state.settings.lastBackupAt = null;
    state.settings.backupReminderSnoozeUntil = null;
    updateBackupReminderBanner();
    const hidden = document.getElementById('backup-reminder-banner').classList.contains('hidden');
    state.entries = savedEntries;
    Object.assign(state.settings, savedSettings);
    return hidden;
  });
  assertTrue('BR1: Banner ausgeblendet ohne vorhandene Einträge', br1, '');

  // BR2: Daten vorhanden, noch nie ein Backup gemacht -> Banner sichtbar mit Hinweistext.
  const br2 = await page.evaluate(() => {
    const savedEntries = state.entries.slice();
    const savedSettings = { ...state.settings };
    state.entries = [{ id: 'br-e1', employerId: 'x', date: '2026-06-01', type: 'work' }];
    state.settings.lastBackupAt = null;
    state.settings.backupReminderSnoozeUntil = null;
    updateBackupReminderBanner();
    const banner = document.getElementById('backup-reminder-banner');
    const result = { hidden: banner.classList.contains('hidden'), text: document.getElementById('backup-reminder-text').textContent };
    state.entries = savedEntries;
    Object.assign(state.settings, savedSettings);
    return result;
  });
  assertTrue('BR2: Banner sichtbar ohne bisheriges Backup', !br2.hidden, '');
  assertContains('BR2: Hinweistext nennt "noch kein Backup"', br2.text, 'noch kein Backup');

  // BR3: Letztes Backup vor 20 Tagen (> 14 Tage Schwelle) -> Banner sichtbar mit Tagesangabe.
  const br3 = await page.evaluate(() => {
    const savedEntries = state.entries.slice();
    const savedSettings = { ...state.settings };
    state.entries = [{ id: 'br-e2', employerId: 'x', date: '2026-06-01', type: 'work' }];
    state.settings.lastBackupAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    state.settings.backupReminderSnoozeUntil = null;
    updateBackupReminderBanner();
    const result = { hidden: document.getElementById('backup-reminder-banner').classList.contains('hidden'), text: document.getElementById('backup-reminder-text').textContent };
    state.entries = savedEntries;
    Object.assign(state.settings, savedSettings);
    return result;
  });
  assertTrue('BR3: Banner sichtbar nach 20 Tagen ohne Backup', !br3.hidden, '');
  assertContains('BR3: Hinweistext nennt Tage seit letztem Backup', br3.text, '20 Tage');

  // BR4: Frisches Backup (heute) -> Banner ausgeblendet.
  const br4 = await page.evaluate(() => {
    const savedEntries = state.entries.slice();
    const savedSettings = { ...state.settings };
    state.entries = [{ id: 'br-e3', employerId: 'x', date: '2026-06-01', type: 'work' }];
    state.settings.lastBackupAt = new Date().toISOString();
    state.settings.backupReminderSnoozeUntil = null;
    updateBackupReminderBanner();
    const hidden = document.getElementById('backup-reminder-banner').classList.contains('hidden');
    state.entries = savedEntries;
    Object.assign(state.settings, savedSettings);
    return hidden;
  });
  assertTrue('BR4: Banner ausgeblendet direkt nach frischem Backup', br4, '');

  // BR5: Stummschaltung (Snooze) verdeckt den Banner unabhängig vom Backup-Alter.
  const br5 = await page.evaluate(() => {
    const savedEntries = state.entries.slice();
    const savedSettings = { ...state.settings };
    state.entries = [{ id: 'br-e4', employerId: 'x', date: '2026-06-01', type: 'work' }];
    state.settings.lastBackupAt = null; // würde ohne Snooze den Banner zeigen
    state.settings.backupReminderSnoozeUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    updateBackupReminderBanner();
    const hidden = document.getElementById('backup-reminder-banner').classList.contains('hidden');
    state.entries = savedEntries;
    Object.assign(state.settings, savedSettings);
    return hidden;
  });
  assertTrue('BR5: Banner bleibt bei aktiver Stummschaltung ausgeblendet', br5, '');

  // BR6: exportBackup() schreibt lastBackupAt (Integration mit dem Export-Pfad, ohne echten Download).
  const br6 = await page.evaluate(async () => {
    const { exportBackup } = await import('/modules/backup.js');
    const savedSettings = { ...state.settings };
    state.settings.lastBackupAt = null;
    exportBackup({ getState: () => state, saveState: () => {}, downloadBlob: () => {}, todayISO: () => '2026-06-01', toast: () => {} });
    const written = !!state.settings.lastBackupAt;
    Object.assign(state.settings, savedSettings);
    return written;
  });
  assertTrue('BR6: exportBackup() setzt lastBackupAt', br6, '');
}

// ---------- 1k) Backup-Import: Migrations-Lauf beim Import (v3.9.49) ----------
// Vor v3.9.49 rief importBackup() runMigrations() nicht auf — ein auf einem
// anderen Gerät/einer älteren App-Version exportiertes Backup wurde beim Import
// NICHT auf den aktuellen Schema-Stand gehoben (anders als beim normalen App-Start
// via loadState()). Relevant, weil Backups als Geräte-Brücke ohne Cloud-Sync dienen.

async function runBackupImportMigrationUnits(page) {
  console.log('\n=== 1k) Backup-Import: Migrations-Lauf beim Import (v3.9.49) ===');

  // BI1: Legacy-Backup ohne schemaVersion (doppelte Homeoffice-Einträge am selben Tag,
  // tpl-2 ohne scope, Employer ohne hiredSince/vacationCarryOver) wird beim Import
  // genauso migriert wie beim normalen App-Start — alle drei Migrationsstufen (1→2, 2→3, 3→4).
  page.once('dialog', d => d.accept());
  const bi1 = await page.evaluate(async () => {
    const { importBackup } = await import('/modules/backup.js');
    const { setState, getState, DEFAULT_STATE } = await import('/modules/state.js');

    const legacyBackup = {
      employers: [{ id: 'e1', name: 'Import-Test AG' }],
      entries: [
        { id: 'a', employerId: 'e1', date: '2026-01-15', type: 'homeoffice', segments: [{ start: '09:00', end: '11:00' }] },
        { id: 'b', employerId: 'e1', date: '2026-01-15', type: 'homeoffice', segments: [{ start: '13:00', end: '17:00' }] },
      ],
      archives: [],
      templates: [{ id: 'tpl-2', label: 'Alt', text: 'x' }],
      settings: { state: 'HE' },
      runningTimer: null,
      // Bewusst kein schemaVersion-Feld -> simuliert ein Backup von vor dem Migrations-Layer.
    };
    const file = new File([JSON.stringify(legacyBackup)], 'legacy-backup.json', { type: 'application/json' });

    await new Promise((resolve) => {
      importBackup(file, {
        setState,
        saveState: () => {},
        toast: () => {},
        DEFAULT_STATE,
        normalizeHolidayOverrides: window.normalizeHolidayOverrides,
        runMigrations: window.runMigrations,
        onImport: () => resolve(),
      });
    });

    const s = getState();
    const homeofficeOn15 = s.entries.filter(e => e.type === 'homeoffice' && e.date === '2026-01-15');
    const tpl2 = s.templates.find(t => t.id === 'tpl-2');
    const employer = s.employers.find(e => e.id === 'e1');
    const result = {
      schemaVersion: s.schemaVersion,
      homeofficeCount: homeofficeOn15.length,
      homeofficeSegCount: homeofficeOn15[0]?.segments?.length,
      tplScope: tpl2?.scope,
      hiredSince: employer?.hiredSince,
      vacationCarryOver: employer?.vacationCarryOver,
    };
    // WICHTIG: setState() im echten Modul-Singleton umgangen die App-Referenz (window.state).
    // Ohne Resync würde ein späterer saveState()-Aufruf (z.B. in seedState()) versehentlich
    // diese synthetischen Test-Daten statt der echten App-Daten persistieren.
    setState(window.state);
    return result;
  });
  assertEq('BI1: importierter Legacy-Backup wird auf aktuelle SCHEMA_VERSION gehoben', bi1.schemaVersion, 7);
  assertTrue('BI1: zwei Legacy-Homeoffice-Einträge am selben Tag werden beim Import zu einem zusammengeführt',
    bi1.homeofficeCount === 1, `count=${bi1.homeofficeCount}`);
  assertTrue('BI1: zusammengeführter Eintrag hat beide Segmente',
    bi1.homeofficeSegCount === 2, `segs=${bi1.homeofficeSegCount}`);
  assertEq('BI1: tpl-2 bekommt beim Import scope=employee', bi1.tplScope, 'employee');
  assertEq('BI1: Employer bekommt beim Import hiredSince-Default', bi1.hiredSince, '');
  assertEq('BI1: Employer bekommt beim Import vacationCarryOver-Default', bi1.vacationCarryOver, 0);

  // BI2: Ein Backup, das bereits auf aktueller SCHEMA_VERSION ist, bleibt beim Import
  // unverändert — kein unerwünschter Daten-Drift durch den neuen Migrations-Lauf.
  page.once('dialog', d => d.accept());
  const bi2 = await page.evaluate(async () => {
    const { importBackup } = await import('/modules/backup.js');
    const { setState, getState, DEFAULT_STATE } = await import('/modules/state.js');

    const currentBackup = {
      schemaVersion: 7,
      employers: [{ id: 'e2', name: 'Aktuell GmbH', kind: 'employer', hiredSince: '2025-01-01', vacationCarryOver: 3, employmentEndDate: '', personnelNumber: '' }],
      entries: [{ id: 'x', employerId: 'e2', date: '2026-02-01', type: 'work', start: '09:00', end: '17:00' }],
      archives: [],
      templates: [{ id: 'tpl-1', label: 'A', text: 'a', scope: 'both' }],
      settings: { state: 'HE' },
      runningTimer: null,
    };
    const file = new File([JSON.stringify(currentBackup)], 'current-backup.json', { type: 'application/json' });

    await new Promise((resolve) => {
      importBackup(file, {
        setState,
        saveState: () => {},
        toast: () => {},
        DEFAULT_STATE,
        normalizeHolidayOverrides: window.normalizeHolidayOverrides,
        runMigrations: window.runMigrations,
        onImport: () => resolve(),
      });
    });

    const s = getState();
    const result = {
      schemaVersion: s.schemaVersion,
      employerVacationCarryOver: s.employers.find(e => e.id === 'e2')?.vacationCarryOver,
      entryCount: s.entries.length,
    };
    setState(window.state); // Resync: siehe Kommentar in BI1.
    return result;
  });
  assertEq('BI2: bereits aktuelles Backup bleibt auf schemaVersion=7', bi2.schemaVersion, 7);
  assertEq('BI2: unveränderte Felder bleiben beim Import unverändert', bi2.employerVacationCarryOver, 3);
  assertEq('BI2: Einträge werden beim Import nicht verdoppelt/verloren', bi2.entryCount, 1);
}

// ---------- 1l) State-Robustheit bei defektem localStorage (v3.9.49) ----------
// Vor v3.9.49 fiel loadState() bei kaputtem JSON im Speicher (z.B. durch einen
// abgebrochenen Schreibvorgang) stillschweigend auf einen leeren DEFAULT_STATE
// zurück — ohne jeden Hinweis für den Nutzer. Diese Tests laufen direkt gegen
// modules/state.js und stellen den realen localStorage-Inhalt danach exakt wieder her.

async function runStateCorruptionUnits(page) {
  console.log('\n=== 1l) State-Robustheit bei defektem localStorage (v3.9.49) ===');

  const cs = await page.evaluate(async () => {
    const { loadState, wasLastLoadCorrupted, getCorruptedBackupKey, setState, STORAGE_KEY } = await import('/modules/state.js');
    const helpers = { uid: () => 'x', normalizeSegments: (s) => s, normalizeHolidayOverrides: window.normalizeHolidayOverrides };

    const savedRaw = localStorage.getItem(STORAGE_KEY);
    try {
      // CS1: Speicherinhalt defekt simulieren (kaputtes JSON).
      localStorage.setItem(STORAGE_KEY, '{not valid json!!!');
      // loadState() protokolliert diesen Fall bewusst per console.error (Diagnose für echte
      // Nutzer/Devtools) — hier gezielt unterdrückt, damit der globale console-error-Gate
      // der QA-Suite nicht auf diesen erwarteten, absichtlich ausgelösten Fehler anspringt.
      const origConsoleError = console.error;
      console.error = () => {};
      const fresh = loadState(helpers);
      console.error = origConsoleError;
      const corrupted = wasLastLoadCorrupted();
      const rescueKey = getCorruptedBackupKey();
      const rescuedContent = rescueKey ? localStorage.getItem(rescueKey) : null;
      if (rescueKey) localStorage.removeItem(rescueKey);

      // CS2: Ein direkt folgendes, gültiges Laden muss die Warnung wieder zurücksetzen.
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        schemaVersion: 5, employers: [], entries: [], archives: [], templates: [],
        settings: { state: 'HE' }, runningTimer: null,
      }));
      loadState(helpers);
      const correctedAfterValidLoad = wasLastLoadCorrupted();

      return {
        freshIsEmpty: Array.isArray(fresh.employers) && fresh.employers.length === 0,
        corrupted,
        rescueKeyExists: !!rescueKey,
        rescuedContentMatches: rescuedContent === '{not valid json!!!',
        correctedAfterValidLoad,
      };
    } finally {
      if (savedRaw === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, savedRaw);
      // WICHTIG: loadState() hier ersetzt den Modul-Singleton durch einen von
      // window.state losgelösten Test-State. Resync, damit ein späterer saveState()
      // (z.B. in seedState()) wieder die echten App-Daten persistiert.
      setState(window.state);
    }
  });

  assertTrue('CS1: bei defektem Speicher wird ein leerer Fresh-State zurückgegeben (kein Crash)', cs.freshIsEmpty, '');
  assertTrue('CS1: wasLastLoadCorrupted() meldet den Defekt', cs.corrupted === true, `corrupted=${cs.corrupted}`);
  assertTrue('CS1: eine Rettungskopie wird unter einem Ersatzschlüssel angelegt', cs.rescueKeyExists, '');
  assertTrue('CS1: die Rettungskopie enthält exakt die defekten Rohdaten', cs.rescuedContentMatches, '');
  assertTrue('CS2: nach einem darauffolgenden gültigen Laden ist die Warnung wieder zurückgesetzt',
    cs.correctedAfterValidLoad === false, `corrupted=${cs.correctedAfterValidLoad}`);
}

// ---------- 1m) Gleitzeitkonto Unit-Tests (v3.9.47) ----------

async function runGleitzeitkontoUnits(page) {
  console.log('\n=== 1m) Gleitzeitkonto Unit-Tests ===');

  // GK1: buildGleitzeitkontoHTML berechnet den laufenden (kumulierten) Saldo korrekt
  // und zeigt Titel, Summary und je eine Tabellenzeile pro Monat.
  const gk1 = await page.evaluate(() => {
    const minutesToHM = (m) => {
      const sign = m < 0 ? '-' : '';
      const abs = Math.abs(m);
      return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
    };
    const rows = [
      { ym: '2026-04', workedMin: 9000, targetMin: 9600, balance: -600, cumulativeBalance: -600 },
      { ym: '2026-05', workedMin: 10200, targetMin: 9600, balance: 600, cumulativeBalance: 0 },
      { ym: '2026-06', workedMin: 10800, targetMin: 9600, balance: 1200, cumulativeBalance: 1200 },
    ];
    return buildGleitzeitkontoHTML(rows, { name: 'GK-Test' }, {
      escapeHtml: (s) => String(s),
      minutesToHM,
      formatMonthYear: (ym) => ym,
      renderSummaryHTML,
    });
  });
  assertContains('GK1: Titel nennt Gleitzeitkonto + Mitarbeitername', gk1, 'Gleitzeitkonto – GK-Test');
  assertContains('GK1: aktueller (letzter) kumulierter Saldo 20:00 im Summary', gk1, '20:00');
  assertContains('GK1: Zeile für April enthalten', gk1, '2026-04');
  assertContains('GK1: Zeile für Mai enthalten', gk1, '2026-05');
  assertContains('GK1: Zeile für Juni enthalten', gk1, '2026-06');
  const gk1RowCount = (gk1.match(/data-label="Monat"/g) || []).length;
  assertEq('GK1: genau 3 Tabellenzeilen (eine pro Monat)', gk1RowCount, 3);

  // GK2: leere Zeilen-Liste zeigt einen Empty-State statt einer kaputten Tabelle.
  const gk2 = await page.evaluate(() => buildGleitzeitkontoHTML([], { name: 'X' }, {
    escapeHtml: (s) => s, minutesToHM: (m) => String(m), formatMonthYear: (ym) => ym, renderSummaryHTML,
  }));
  assertContains('GK2: Empty-State bei leerem Zeitraum', gk2, 'Keine Daten für den gewählten Zeitraum');

  // GK3: shiftYearMonth verschiebt Jahr/Monat korrekt, auch über Jahresgrenzen hinweg.
  const gk3 = await page.evaluate(() => ({
    back: shiftYearMonth('2026-01', -1),
    fwd: shiftYearMonth('2026-12', 1),
    same: shiftYearMonth('2026-06', 0),
  }));
  assertEq('GK3: Januar minus 1 Monat = Dezember Vorjahr', gk3.back, '2025-12');
  assertEq('GK3: Dezember plus 1 Monat = Januar Folgejahr', gk3.fwd, '2027-01');
  assertEq('GK3: Verschiebung um 0 liefert denselben Monat', gk3.same, '2026-06');

  // GK4: Integration — renderGleitzeitkonto() befüllt die echte (Kalenderjahr-)Ansicht mit
  // Daten aus computeMonthReport für den aktiven Arbeitgeber. Seit v3.9.48: Jahr-Eingabe statt
  // "Bis Monat + Zeitraum", da das Konto jetzt Kalenderjahre (Jan–Dez) statt rollierender
  // Zeiträume zeigt.
  const gk4 = await page.evaluate(() => {
    const empId = '__gk-integration__';
    state.employers.push({ id: empId, name: 'GK-Integration', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', annualVacation: 30, hiredSince: '2020-01-01' });
    state.activeEmployerId = empId;
    state.entries.push({ id: 'gk-e1', employerId: empId, date: '2026-06-01', type: 'work', start: '09:00', end: '17:00', breakMinutes: 0 });
    document.getElementById('gleitzeitkonto-year').value = '2026';
    renderGleitzeitkonto();
    const html = document.getElementById('gleitzeitkonto-content').innerHTML;
    state.employers = state.employers.filter((e) => e.id !== empId);
    state.entries = state.entries.filter((e) => e.employerId !== empId);
    return html;
  });
  assertContains('GK4: Ansicht zeigt Titel mit Arbeitgebername', gk4, 'GK-Integration');
  assertContains('GK4: Tabelle enthält Januar 2026 (Jahresansicht beginnt im Januar)', gk4, 'Januar 2026');
  assertContains('GK4: Tabelle enthält Dezember 2026 (Jahresansicht endet im Dezember)', gk4, 'Dezember 2026');
  const gk4RowCount = (gk4.match(/data-label="Monat"/g) || []).length;
  assertEq('GK4: genau 12 Tabellenzeilen (Jan–Dez, hiredSince liegt lange vor 2026)', gk4RowCount, 12);

  // GK5: computeGleitzeitkontoRows begrenzt die Jahresansicht ab "Angestellt seit", wenn die
  // Anstellung erst im gewählten Jahr beginnt (Kernfall aus der Nutzeranfrage: Einstellung
  // 01.08.2026, Jahresansicht 2026 darf nicht schon im Januar ein Soll gegen 0h Ist zeigen).
  const gk5 = await page.evaluate(() => {
    const empId = '__gk-hire-midyear__';
    const emp = { id: empId, name: 'GK-Hire', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', hiredSince: '2026-08-01' };
    state.employers.push(emp);
    const result = computeGleitzeitkontoRows(emp, 2026, { state });
    state.employers = state.employers.filter((e) => e.id !== empId);
    return result;
  });
  assertEq('GK5: bei Anstellung ab August zeigt das Jahr nur 5 Monate (Aug–Dez)', gk5.rows.length, 5);
  assertEq('GK5: erste Zeile ist August 2026 (kein Soll für Monate vor Anstellung)', gk5.rows[0].ym, '2026-08');
  assertEq('GK5: effectiveStartYm = Anstellungsmonat', gk5.effectiveStartYm, '2026-08');
  assertEq('GK5: hiredAfterYear ist false (Anstellung liegt im gewählten Jahr)', gk5.hiredAfterYear, false);

  // GK6: Liegt "Angestellt seit" komplett nach dem gewählten Jahr, gibt es keine Zeilen und
  // die Ansicht muss das klar kommunizieren statt eine leere/falsche Tabelle zu zeigen.
  const gk6 = await page.evaluate(() => {
    const empId = '__gk-hire-future__';
    const emp = { id: empId, name: 'GK-Future', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', hiredSince: '2027-03-01' };
    state.employers.push(emp);
    const result = computeGleitzeitkontoRows(emp, 2026, { state });
    state.employers = state.employers.filter((e) => e.id !== empId);
    return result;
  });
  assertEq('GK6: keine Zeilen, wenn Angestellt-seit nach dem gewählten Jahr liegt', gk6.rows.length, 0);
  assertEq('GK6: hiredAfterYear = true', gk6.hiredAfterYear, true);
  const gk6b = await page.evaluate(() => buildGleitzeitkontoHTML([], { name: 'GK-Future' }, {
    escapeHtml: (s) => s, minutesToHM: (m) => String(m), formatMonthYear: (ym) => ym, renderSummaryHTML,
  }, { year: 2026, effectiveStartYm: '2027-03', hiredAfterYear: true }));
  assertContains('GK6b: Hinweistext bei Anstellung nach dem gewählten Jahr', gk6b, 'noch nicht angestellt');

  // GK7: Kumulierter Saldo läuft bewusst über Jahresgrenzen durch (kein Reset zum 1.1., siehe
  // Nutzerentscheidung "Durchlaufend"). Referenzwert wird aus computeMonthReport pro Monat
  // hergeleitet, damit der Test unabhängig von Feiertagsdetails bleibt.
  const gk7 = await page.evaluate(() => {
    const empId = '__gk-crossyear__';
    const emp = { id: empId, name: 'GK-Crossyear', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', hiredSince: '2025-11-01' };
    state.employers.push(emp);
    state.entries.push(
      { id: 'gkx1', employerId: empId, date: '2025-11-03', type: 'work', start: '09:00', end: '17:00', breakMinutes: 30 },
      { id: 'gkx2', employerId: empId, date: '2025-12-03', type: 'work', start: '09:00', end: '17:00', breakMinutes: 30 },
      { id: 'gkx3', employerId: empId, date: '2026-01-05', type: 'work', start: '09:00', end: '17:00', breakMinutes: 30 },
    );
    const rNov = computeMonthReport(empId, '2025-11');
    const rDec = computeMonthReport(empId, '2025-12');
    const rJan = computeMonthReport(empId, '2026-01');
    const expectedJanCumulative = rNov.balance + rDec.balance + rJan.balance;
    const result = computeGleitzeitkontoRows(emp, 2026, { state });
    state.employers = state.employers.filter((e) => e.id !== empId);
    state.entries = state.entries.filter((e) => e.employerId !== empId);
    return { rows: result.rows, effectiveStartYm: result.effectiveStartYm, expectedJanCumulative };
  });
  assertEq('GK7: effectiveStartYm = Anstellungsmonat 2025-11 (vor dem gewählten Jahr)', gk7.effectiveStartYm, '2025-11');
  assertEq('GK7: Jahresansicht 2026 zeigt trotzdem 12 Zeilen (Jan–Dez)', gk7.rows.length, 12);
  assertEq('GK7: Jan-2026-Zeile ist erste angezeigte Zeile', gk7.rows[0].ym, '2026-01');
  assertEq('GK7: kumulierter Saldo im Januar 2026 enthält bereits Nov+Dez 2025 (durchlaufender Saldo über die Jahresgrenze)', gk7.rows[0].cumulativeBalance, gk7.expectedJanCumulative);

  // GK8: Ohne hiredSince fällt die Berechnung auf den Monat des frühesten Eintrags dieses
  // Arbeitgebers zurück (Alt-Arbeitgeber ohne gepflegtes "Angestellt seit"), statt beliebig weit
  // in die Vergangenheit ein Soll zu erzeugen.
  const gk8 = await page.evaluate(() => {
    const empId = '__gk-no-hiredsince__';
    const emp = { id: empId, name: 'GK-Alt', hoursMode: 'week', weeklyHours: 40, breakMode: 'none' };
    state.employers.push(emp);
    state.entries.push({ id: 'gk8-e1', employerId: empId, date: '2025-03-10', type: 'work', start: '09:00', end: '17:00', breakMinutes: 30 });
    const result = computeGleitzeitkontoRows(emp, 2026, { state });
    state.employers = state.employers.filter((e) => e.id !== empId);
    state.entries = state.entries.filter((e) => e.employerId !== empId);
    return result;
  });
  assertEq('GK8: ohne hiredSince wird der Monat des frühesten Eintrags als Startpunkt verwendet', gk8.effectiveStartYm, '2025-03');
  assertEq('GK8: Jahresansicht 2026 zeigt trotzdem alle 12 Monate (Startpunkt liegt vor 2026)', gk8.rows.length, 12);
}


// ---------- Helpers für E2E ----------

/*
 * Seedet state.employers (auch im Freelance-Modus — der Kunde ist dort das "employer"-Objekt)
 * mit einem Work-Entry an heute-Datum, 09:00-16:00 = 7:00 = 420 Minuten.
 */
async function seedState(page, mode, employer, settingsOverrides = {}) {
  await page.evaluate(({ mode, emp, settingsOverrides }) => {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    state.settings.appMode = mode;
    Object.assign(state.settings, settingsOverrides);
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
  }, { mode, emp: employer, settingsOverrides });
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
      else if (k === 'csv') blob = generateCsvBlob(r);
    }
    if (!blob) return null;
    const buf = await blob.arrayBuffer();
    return { size: blob.size, bytes: Array.from(new Uint8Array(buf)) };
  }, { k: kind });
  const size = result?.size ?? -1;
  // CSV ist reiner Text (kompakt), PDF/Word/Übersicht sind Binärformate mit deutlich mehr Overhead.
  const minBytes = kind === 'csv' ? 50 : 500;
  assertAtLeast(`${label} — ${kind} > ${minBytes} bytes`, size, minBytes);
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

function extractCsvText(buf) {
  // UTF-8 mit BOM — BOM entfernen, dann als Text lesen.
  return buf.toString('utf-8').replace(/^\uFEFF/, '');
}

// ---------- 1n) Arbeitgeberwechsel / "Beschäftigt bis" Unit- + Integrationstests (v3.9.55) ----------

async function runEmploymentEndUnits(page) {
  console.log('\n=== 1n) Arbeitgeberwechsel / "Beschäftigt bis" Unit- + Integrationstests (v3.9.55) ===');

  // EE1: isFormerEmployer — Kernfälle (kein Datum, Zukunft, Vergangenheit, exakt heute, fehlendes Feld)
  const ee1 = await page.evaluate(() => {
    const today = '2026-06-15';
    return {
      noDate: isFormerEmployer({ employmentEndDate: '' }, today),
      future: isFormerEmployer({ employmentEndDate: '2026-12-31' }, today),
      past: isFormerEmployer({ employmentEndDate: '2026-01-01' }, today),
      exactlyToday: isFormerEmployer({ employmentEndDate: '2026-06-15' }, today),
      missingField: isFormerEmployer({}, today),
    };
  });
  assertTrue('EE1a: kein employmentEndDate → nicht ehemalig', ee1.noDate === false, `noDate=${ee1.noDate}`);
  assertTrue('EE1b: employmentEndDate in der Zukunft → nicht ehemalig', ee1.future === false, `future=${ee1.future}`);
  assertTrue('EE1c: employmentEndDate in der Vergangenheit → ehemalig', ee1.past === true, `past=${ee1.past}`);
  assertTrue('EE1d: employmentEndDate = heute → noch nicht ehemalig (erst danach)', ee1.exactlyToday === false, `exactlyToday=${ee1.exactlyToday}`);
  assertTrue('EE1e: fehlendes Feld → nicht ehemalig statt Crash', ee1.missingField === false, `missingField=${ee1.missingField}`);

  // EE2: filterVisibleEmployers — Standardfilterung / showAll / gezieltes includeIds
  const ee2 = await page.evaluate(() => {
    const today = '2026-06-15';
    const employers = [
      { id: 'a', name: 'Aktiv', employmentEndDate: '' },
      { id: 'b', name: 'Ehemalig', employmentEndDate: '2026-01-01' },
    ];
    return {
      byDefault: filterVisibleEmployers(employers, today).map((e) => e.id),
      showAll: filterVisibleEmployers(employers, today, { showAll: true }).map((e) => e.id),
      includeIds: filterVisibleEmployers(employers, today, { includeIds: ['b'] }).map((e) => e.id),
    };
  });
  assertEq('EE2a: Standard blendet ehemalige Arbeitgeber aus', JSON.stringify(ee2.byDefault), JSON.stringify(['a']));
  assertEq('EE2b: showAll zeigt auch ehemalige Arbeitgeber', JSON.stringify(ee2.showAll), JSON.stringify(['a', 'b']));
  assertEq('EE2c: includeIds zeigt gezielt einen einzelnen Ehemaligen zusätzlich', JSON.stringify(ee2.includeIds), JSON.stringify(['a', 'b']));

  // EE3: Migration v4→v5 — employmentEndDate wird bei bestehenden Arbeitgebern auf '' defaultet
  const ee3 = await page.evaluate(() => {
    const legacy = {
      schemaVersion: 4,
      employers: [{ id: 'e1', name: 'Alt-Arbeitgeber', hiredSince: '2020-01-01', vacationCarryOver: 0 }],
      entries: [], archives: [], templates: [], settings: { state: 'HE' }, runningTimer: null,
    };
    return runMigrations(legacy);
  });
  assertTrue('EE3a: changed=true, da employmentEndDate fehlte', ee3.changed === true, `changed=${ee3.changed}`);
  assertEq('EE3b: schemaVersion nach Migration = 7', ee3.state.schemaVersion, 7);
  assertEq('EE3c: employmentEndDate defaultet auf leeren String', ee3.state.employers[0].employmentEndDate, '');

  // EE4: computeVacationRemaining — anteilige Kürzung bei Beschäftigungsende
  const ee4 = await page.evaluate(() => {
    // Nur Ende im Jahr (Ende Mitte August → Monate Jan–Aug = 8/12 von 24 Tagen = 16)
    const empEndOnly = { id: 'e1', annualVacation: 24, vacationCarryOver: 0, hiredSince: '2020-01-01', employmentEndDate: '2026-08-15' };
    const endOnly = computeVacationRemaining(empEndOnly, '2026-09', []);
    // Anstellung UND Ende im selben Jahr (März–August → 6/12 von 24 Tagen = 12)
    const empBoth = { id: 'e2', annualVacation: 24, vacationCarryOver: 0, hiredSince: '2026-03-01', employmentEndDate: '2026-08-31' };
    const both = computeVacationRemaining(empBoth, '2026-09', []);
    return { endOnly, both };
  });
  assertEq('EE4a: nur Beschäftigungsende im Jahr → 8/12 von 24 Tagen = 16', ee4.endOnly.annual, 16);
  assertEq('EE4b: Anstellung + Ende im selben Jahr (März–August) → 6/12 von 24 Tagen = 12', ee4.both.annual, 12);

  // EE5: computeGleitzeitkontoRows — Soll-Berechnung endet am "Beschäftigt bis"-Monat
  const ee5 = await page.evaluate(() => {
    const emp = { id: '__ee-gk-end__', name: 'GK-End', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', hiredSince: '2020-01-01', employmentEndDate: '2026-05-20' };
    state.employers.push(emp);
    const result = computeGleitzeitkontoRows(emp, 2026, { state });
    state.employers = state.employers.filter((e) => e.id !== emp.id);
    return result;
  });
  assertEq('EE5a: bei Beschäftigungsende im Mai zeigt das Jahr nur 5 Monate (Jan–Mai)', ee5.rows.length, 5);
  assertEq('EE5b: letzte Zeile ist Mai 2026', ee5.rows[ee5.rows.length - 1].ym, '2026-05');
  assertEq('EE5c: effectiveEndYm = Beschäftigungsende-Monat', ee5.effectiveEndYm, '2026-05');
  assertTrue('EE5d: endedBeforeYear=false, da Ende im gewählten Jahr liegt', ee5.endedBeforeYear === false, '');

  // EE6: computeGleitzeitkontoRows — Beschäftigung endete bereits vor dem gewählten Jahr
  const ee6 = await page.evaluate(() => {
    const emp = { id: '__ee-gk-past__', name: 'GK-Past', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', hiredSince: '2020-01-01', employmentEndDate: '2025-03-01' };
    state.employers.push(emp);
    const result = computeGleitzeitkontoRows(emp, 2026, { state });
    state.employers = state.employers.filter((e) => e.id !== emp.id);
    return result;
  });
  assertEq('EE6a: keine Zeilen, wenn Beschäftigung schon vor dem Jahr endete', ee6.rows.length, 0);
  assertTrue('EE6b: endedBeforeYear=true', ee6.endedBeforeYear === true, '');

  // EE7: buildEmployerCardsHTML — rötlicher Namenshintergrund + "Ehemalig seit"-Badge nur bei Ex-Arbeitgebern
  const ee7 = await page.evaluate(() => {
    const employers = [
      { id: 'a', name: 'Aktiv GmbH', color: '#000', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', employmentEndDate: '' },
      { id: 'b', name: 'Ehemalig GmbH', color: '#000', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', employmentEndDate: '2020-01-01' },
    ];
    return buildEmployerCardsHTML(employers, {
      escapeHtml: (s) => String(s),
      formatMoney: (v) => String(v),
      breakModeLabel: () => '',
      isFreelance: () => false,
      isFormerEmployer,
      todayISO: () => '2026-06-15',
      formatDate: (d) => d,
    });
  });
  assertContains('EE7a: aktiver Arbeitgeber ohne "former"-Klasse und ohne Badge', ee7, 'employer-name">Aktiv GmbH</div>');
  assertContains('EE7b: ehemaliger Arbeitgeber erhält die Klasse employer-name-former', ee7, 'employer-name employer-name-former">Ehemalig GmbH');
  assertContains('EE7c: ehemaliger Arbeitgeber erhält "Ehemalig seit"-Badge mit Enddatum', ee7, 'Ehemalig seit 2020-01-01');

  // EE8: Arbeitgeber-Modal — Validierung blockiert, wenn "Beschäftigt bis" vor "Angestellt seit" liegt
  const ee8 = await page.evaluate(() => {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    const beforeCount = state.employers.length;
    document.getElementById('btn-add-employer').click();
    document.getElementById('employer-name').value = 'EE-Validation-Test';
    document.getElementById('employer-hired-since').value = '2026-01-01';
    document.getElementById('employer-employment-end-date').value = '2025-12-31';
    document.getElementById('form-employer').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const toastText = document.getElementById('toast')?.querySelector('.toast-msg')?.textContent || '';
    const modalStillOpen = !document.getElementById('modal-employer').classList.contains('hidden');
    return { toastText, modalStillOpen, countAfterBlocked: state.employers.length, beforeCount };
  });
  assertContains('EE8a: Validierungsfehler-Toast bei Ende vor Anstellungsbeginn', ee8.toastText, 'darf nicht vor');
  assertTrue('EE8b: Arbeitgeber wird bei ungültigem Datum NICHT gespeichert', ee8.countAfterBlocked === ee8.beforeCount, `vorher=${ee8.beforeCount} nachher=${ee8.countAfterBlocked}`);
  assertTrue('EE8c: Modal bleibt offen, damit die Eingabe korrigiert werden kann', ee8.modalStillOpen, '');

  // EE9: Arbeitgeber-Modal — gültiges Enddatum (nach Anstellungsbeginn) wird gespeichert
  const ee9 = await page.evaluate(() => {
    document.getElementById('employer-employment-end-date').value = '2026-06-30';
    document.getElementById('form-employer').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const saved = state.employers.find((e) => e.name === 'EE-Validation-Test');
    const modalHidden = document.getElementById('modal-employer').classList.contains('hidden');
    return { saved, modalHidden };
  });
  assertTrue('EE9a: Arbeitgeber wird bei gültigem Enddatum gespeichert', !!ee9.saved, JSON.stringify(ee9.saved));
  assertEq('EE9b: employmentEndDate wird korrekt gespeichert', ee9.saved?.employmentEndDate, '2026-06-30');
  assertTrue('EE9c: Modal schließt nach erfolgreichem Speichern', ee9.modalHidden, '');
  await page.evaluate(() => {
    state.employers = state.employers.filter((e) => e.name !== 'EE-Validation-Test');
    saveState();
  });

  // EE10: Dropdown-Filterung — neue Einträge blenden ehemalige Arbeitgeber aus; das Bearbeiten
  // eines bestehenden Eintrags eines Ehemaligen zeigt ihn weiterhin an (Range-Neuanlage: immer ausgeblendet).
  const ee10 = await page.evaluate(() => {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    const empF = { id: '__ee-former__', name: 'EE-Former GmbH', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', annualVacation: 0, hiredSince: '2019-01-01', employmentEndDate: '2020-01-01' };
    const empA = { id: '__ee-active__', name: 'EE-Active GmbH', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', annualVacation: 0, hiredSince: '2019-01-01', employmentEndDate: '' };
    state.employers.push(empF, empA);
    const prevActiveId = state.activeEmployerId;
    state.activeEmployerId = empA.id;
    switchView('tracker');
    renderTracker();

    document.getElementById('btn-add-manual').click();
    const entryOptionsNew = Array.from(document.getElementById('entry-employer').options).map((o) => o.value);
    document.querySelector('#modal-entry .modal-close').click();

    document.getElementById('btn-add-homeoffice').click();
    const hoOptionsNew = Array.from(document.getElementById('ho-employer').options).map((o) => o.value);
    document.querySelector('#modal-homeoffice .modal-close').click();

    document.getElementById('btn-add-range').click();
    const rangeOptionsNew = Array.from(document.getElementById('range-employer').options).map((o) => o.value);
    document.querySelector('#modal-range-entry .modal-close').click();

    const today = todayISO();
    const formerEntryId = '__ee-entry-former__';
    const formerHoId = '__ee-ho-former__';
    state.entries.push({ id: formerEntryId, employerId: empF.id, date: today, type: 'work', start: '09:00', end: '17:00', breakMinutes: 0 });
    state.entries.push({ id: formerHoId, employerId: empF.id, date: today, type: 'homeoffice', start: '09:00', end: '17:00', breakMinutes: 0 });
    setShowFormerEmployers(true);
    document.getElementById('filter-employer').value = '';
    document.getElementById('filter-month').value = '';
    renderEntries();

    const entryCard = document.querySelector(`.entry-card[data-id="${formerEntryId}"]`);
    entryCard && entryCard.click();
    const entryOptionsEdit = Array.from(document.getElementById('entry-employer').options).map((o) => ({ value: o.value, text: o.textContent }));
    const entrySelectedValue = document.getElementById('entry-employer').value;
    document.querySelector('#modal-entry .modal-close').click();

    const hoCard = document.querySelector(`.entry-card[data-id="${formerHoId}"]`);
    hoCard && hoCard.click();
    const hoOptionsEdit = Array.from(document.getElementById('ho-employer').options).map((o) => ({ value: o.value, text: o.textContent }));
    document.querySelector('#modal-homeoffice .modal-close').click();

    setShowFormerEmployers(false);
    state.entries = state.entries.filter((e) => e.id !== formerEntryId && e.id !== formerHoId);
    state.employers = state.employers.filter((e) => e.id !== empF.id && e.id !== empA.id);
    state.activeEmployerId = prevActiveId;
    saveState();
    renderTracker();
    renderEntries();

    return { entryOptionsNew, hoOptionsNew, rangeOptionsNew, entryOptionsEdit, entrySelectedValue, hoOptionsEdit };
  });
  assertTrue('EE10a: neuer Eintrag — ehemaliger Arbeitgeber fehlt in #entry-employer', !ee10.entryOptionsNew.includes('__ee-former__'), JSON.stringify(ee10.entryOptionsNew));
  assertTrue('EE10b: neuer Eintrag — aktiver Arbeitgeber ist wählbar', ee10.entryOptionsNew.includes('__ee-active__'), JSON.stringify(ee10.entryOptionsNew));
  assertTrue('EE10c: neuer Homeoffice-Eintrag — ehemaliger Arbeitgeber fehlt in #ho-employer', !ee10.hoOptionsNew.includes('__ee-former__'), JSON.stringify(ee10.hoOptionsNew));
  assertTrue('EE10d: neuer Zeitraum-Eintrag — ehemaliger Arbeitgeber fehlt in #range-employer (Creation-Only-Ausnahme)', !ee10.rangeOptionsNew.includes('__ee-former__'), JSON.stringify(ee10.rangeOptionsNew));
  assertTrue('EE10e: Bearbeiten eines bestehenden Eintrags — ehemaliger Arbeitgeber bleibt in #entry-employer sichtbar', ee10.entryOptionsEdit.some((o) => o.value === '__ee-former__'), JSON.stringify(ee10.entryOptionsEdit));
  assertEq('EE10f: Bearbeiten — der ehemalige Arbeitgeber des Eintrags ist vorausgewählt', ee10.entrySelectedValue, '__ee-former__');
  assertTrue('EE10g: Bearbeiten zeigt "(ehemalig)"-Hinweis in der Options-Beschriftung', ee10.entryOptionsEdit.some((o) => o.value === '__ee-former__' && o.text.includes('(ehemalig)')), JSON.stringify(ee10.entryOptionsEdit));
  assertTrue('EE10h: Bearbeiten eines bestehenden Homeoffice-Eintrags — ehemaliger Arbeitgeber bleibt in #ho-employer sichtbar', ee10.hoOptionsEdit.some((o) => o.value === '__ee-former__'), JSON.stringify(ee10.hoOptionsEdit));

  // EE11: Die 4 "Ehemalige anzeigen"-Checkboxen spiegeln denselben globalen Zustand konsistent wider
  const ee11 = await page.evaluate(() => {
    setShowFormerEmployers(true);
    const allChecked = [
      'show-former-employers-tracker', 'show-former-employers-entries',
      'show-former-employers-overview', 'show-former-employers-gleitzeitkonto',
    ].map((id) => document.getElementById(id)?.checked);
    setShowFormerEmployers(false);
    const allUnchecked = [
      'show-former-employers-tracker', 'show-former-employers-entries',
      'show-former-employers-overview', 'show-former-employers-gleitzeitkonto',
    ].map((id) => document.getElementById(id)?.checked);
    return { allChecked, allUnchecked };
  });
  assertTrue('EE11a: setShowFormerEmployers(true) markiert alle 4 Checkboxen', ee11.allChecked.every((v) => v === true), JSON.stringify(ee11.allChecked));
  assertTrue('EE11b: setShowFormerEmployers(false) deaktiviert alle 4 Checkboxen wieder', ee11.allUnchecked.every((v) => v === false), JSON.stringify(ee11.allUnchecked));
}

// ---------- 1o) Pers.-Nr. beim Arbeitgeber (v3.9.56) ----------

async function runPersonnelNumberUnits(page) {
  console.log('\n=== 1o) Pers.-Nr. beim Arbeitgeber Unit- + Integrationstests (v3.9.56) ===');

  // PN10: buildEmployerCardsHTML — Pers.-Nr. erscheint im employer-meta-Segment, wenn gesetzt
  const pn10 = await page.evaluate(() => {
    const employers = [
      { id: 'a', name: 'Mit PersNr GmbH', color: '#000', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', employmentEndDate: '', personnelNumber: '48213' },
      { id: 'b', name: 'Ohne PersNr GmbH', color: '#000', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', employmentEndDate: '', personnelNumber: '' },
    ];
    return buildEmployerCardsHTML(employers, {
      escapeHtml: (s) => String(s),
      formatMoney: (v) => String(v),
      breakModeLabel: () => '',
      isFreelance: () => false,
      isFormerEmployer,
      todayISO: () => '2026-06-15',
      formatDate: (d) => d,
    });
  });
  assertContains('PN10a: Arbeitgeber MIT Pers.-Nr. zeigt "Pers.-Nr. 48213" im Meta-Text', pn10, 'Pers.-Nr. 48213');
  assertTrue('PN10b: Arbeitgeber OHNE Pers.-Nr. zeigt keinen "Pers.-Nr."-Abschnitt', !/Ohne PersNr GmbH[\s\S]{0,200}Pers\.-Nr\./.test(pn10), '');

  // PN11: Arbeitgeber-Modal — Pers.-Nr. wird bei Neuanlage korrekt übernommen
  const pn11 = await page.evaluate(() => {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    document.getElementById('btn-add-employer').click();
    document.getElementById('employer-name').value = 'PN-Neu-Test';
    document.getElementById('employer-personnel-number').value = ' 99887 ';
    document.getElementById('form-employer').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const saved = state.employers.find((e) => e.name === 'PN-Neu-Test');
    return { saved };
  });
  assertTrue('PN11a: neuer Arbeitgeber wird gespeichert', !!pn11.saved, JSON.stringify(pn11.saved));
  assertEq('PN11b: Pers.-Nr. wird getrimmt korrekt gespeichert', pn11.saved?.personnelNumber, '99887');

  // PN12: Arbeitgeber-Modal — Bearbeiten eines bestehenden Arbeitgebers zeigt die gespeicherte Pers.-Nr. an und erlaubt Änderung
  const pn12 = await page.evaluate(() => {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    const emp = state.employers.find((e) => e.name === 'PN-Neu-Test');
    const card = document.querySelector(`.employer-card[data-id="${emp.id}"]`);
    card && card.click();
    const populatedValue = document.getElementById('employer-personnel-number').value;
    document.getElementById('employer-personnel-number').value = '11223';
    document.getElementById('form-employer').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const savedAfterEdit = state.employers.find((e) => e.id === emp.id);
    return { populatedValue, savedAfterEdit };
  });
  assertEq('PN12a: Modal zeigt beim Bearbeiten die zuvor gespeicherte Pers.-Nr. an', pn12.populatedValue, '99887');
  assertEq('PN12b: geänderte Pers.-Nr. wird beim erneuten Speichern übernommen', pn12.savedAfterEdit?.personnelNumber, '11223');

  // Aufräumen des Test-Arbeitgebers
  await page.evaluate(() => {
    state.employers = state.employers.filter((e) => e.name !== 'PN-Neu-Test');
    saveState();
  });
}

// ---------- 1p) Arbeitgeber/Kunden-Trennung ueber `kind` (v3.9.58) ----------
// Ein Arbeitnehmer kann parallel Freelancer sein (z.B. Lehrer + abends Nachhilfe). Da
// state.employers eine gemeinsame Liste fuer beide Erwerbsformen ist, muss jeder Eintrag
// per `kind` ('employer'|'client') fest einem Reiter zugeordnet sein, damit sich Arbeitgeber-
// und Kundenliste nicht mischen. Siehe modules/migrations.js (6->7) und modules/ui/employer-modal.js.

async function runEmployerKindUnits(page) {
  console.log('\n=== 1p) Arbeitgeber/Kunden-Trennung (kind) Unit- + Integrationstests (v3.9.58) ===');

  // ET1: Migration 6->7 -- appMode='employee' zum Migrationszeitpunkt -> kind='employer'
  const et1 = await page.evaluate(() => {
    const legacy = {
      schemaVersion: 6,
      employers: [{ id: 'e1', name: 'Alt-AG', hoursMode: 'week', weeklyHours: 40, breakMode: 'none', personnelNumber: '' }],
      entries: [], archives: [], templates: [], settings: { state: 'HE', appMode: 'employee' }, runningTimer: null,
    };
    return runMigrations(legacy);
  });
  assertTrue('ET1a: changed=true, da kind fehlte', et1.changed === true, `changed=${et1.changed}`);
  assertEq('ET1b: schemaVersion nach Migration = 7', et1.state.schemaVersion, 7);
  assertEq('ET1c: appMode=employee zum Migrationszeitpunkt -> kind=employer', et1.state.employers[0].kind, 'employer');

  // ET2: Migration 6->7 -- appMode='freelance' zum Migrationszeitpunkt -> kind='client'
  const et2 = await page.evaluate(() => {
    const legacy = {
      schemaVersion: 6,
      employers: [{ id: 'e1', name: 'Alt-Kunde', hoursMode: 'week', weeklyHours: 0, breakMode: 'none', personnelNumber: '' }],
      entries: [], archives: [], templates: [], settings: { state: 'HE', appMode: 'freelance' }, runningTimer: null,
    };
    return runMigrations(legacy);
  });
  assertEq('ET2: appMode=freelance zum Migrationszeitpunkt -> kind=client', et2.state.employers[0].kind, 'client');

  // ET3: Migration ist idempotent -- bereits gueltiges kind bleibt unangetastet, auch wenn
  // appMode zum (erneuten) Migrationszeitpunkt vom gespeicherten kind abweicht.
  const et3 = await page.evaluate(() => {
    const legacy = {
      schemaVersion: 6,
      employers: [{ id: 'e1', name: 'Bereits klassifiziert', kind: 'client', hoursMode: 'week', weeklyHours: 0, breakMode: 'none' }],
      entries: [], archives: [], templates: [], settings: { state: 'HE', appMode: 'employee' }, runningTimer: null,
    };
    return runMigrations(legacy);
  });
  assertEq('ET3: bereits gesetztes kind bleibt bei erneuter Migration unveraendert', et3.state.employers[0].kind, 'client');

  // ET4: Neuanlage per UI im Angestellt-Modus -> kind wird automatisch auf 'employer' gesetzt.
  const et4 = await page.evaluate(() => {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    state.settings.appMode = 'employee';
    document.getElementById('btn-add-employer').click();
    const kindSelectValue = document.getElementById('employer-kind').value;
    document.getElementById('employer-name').value = 'ET-Neu-AG';
    document.getElementById('form-employer').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const saved = state.employers.find((e) => e.name === 'ET-Neu-AG');
    return { kindSelectValue, saved };
  });
  assertEq('ET4a: Select im Modal steht bei Neuanlage (Angestellt) auf "employer"', et4.kindSelectValue, 'employer');
  assertTrue('ET4b: neuer Arbeitgeber wird gespeichert', !!et4.saved, JSON.stringify(et4.saved));
  assertEq('ET4c: neuer Eintrag bekommt automatisch kind=employer', et4.saved?.kind, 'employer');

  // ET5: Neuanlage per UI im Freiberufler-Modus -> kind wird automatisch auf 'client' gesetzt.
  const et5 = await page.evaluate(() => {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    state.settings.appMode = 'freelance';
    document.getElementById('btn-add-employer').click();
    const kindSelectValue = document.getElementById('employer-kind').value;
    document.getElementById('employer-name').value = 'ET-Neu-Kunde';
    document.getElementById('form-employer').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const saved = state.employers.find((e) => e.name === 'ET-Neu-Kunde');
    state.settings.appMode = 'employee'; // zurueck auf Ausgangsmodus
    return { kindSelectValue, saved };
  });
  assertEq('ET5a: Select im Modal steht bei Neuanlage (Freiberuflich) auf "client"', et5.kindSelectValue, 'client');
  assertEq('ET5b: neuer Eintrag bekommt automatisch kind=client', et5.saved?.kind, 'client');

  // ET6: Manuelle Korrektur -- im Formular kann der Eintragstyp unabhaengig vom aktuellen
  // Modus geaendert werden (z.B. versehentlich im falschen Modus angelegter Eintrag).
  const et6 = await page.evaluate(() => {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    state.settings.appMode = 'employee';
    document.getElementById('btn-add-employer').click();
    document.getElementById('employer-name').value = 'ET-Manuell-Korrigiert';
    document.getElementById('employer-kind').value = 'client'; // manuelle Umkehr trotz Angestellt-Modus
    document.getElementById('form-employer').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const saved = state.employers.find((e) => e.name === 'ET-Manuell-Korrigiert');
    return { saved };
  });
  assertEq('ET6a: manuell auf "client" umgestellter Eintrag wird trotz Angestellt-Modus als kind=client gespeichert', et6.saved?.kind, 'client');

  // ET6b: beim erneuten Bearbeiten zeigt das Formular den zuvor manuell gesetzten Wert an
  // (kein stillschweigendes Zuruecksetzen auf den aktuellen Modus).
  const et6b = await page.evaluate(() => {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    const emp = state.employers.find((e) => e.name === 'ET-Manuell-Korrigiert');
    const card = document.querySelector(`.employer-card[data-id="${emp.id}"]`);
    // Angestellt-Modus zeigt nur kind=employer -- der manuell auf 'client' gesetzte Eintrag
    // ist im Angestellt-Modus daher absichtlich NICHT in der Liste/DOM vorhanden.
    return { cardFoundDespiteWrongTab: !!card, storedKind: emp.kind };
  });
  assertTrue('ET6b: manuell auf client gesetzter Eintrag erscheint im Angestellt-Modus (Reiter Arbeitgeber) nicht mehr', !et6b.cardFoundDespiteWrongTab, '');
  assertEq('ET6c: gespeicherter kind-Wert bleibt client', et6b.storedKind, 'client');

  // ET7: renderEmployers() im Angestellt-Modus zeigt nur kind=employer, kind=client wird ausgeblendet.
  const et7 = await page.evaluate(() => {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    state.settings.appMode = 'employee';
    renderEmployers();
    const ids = Array.from(document.querySelectorAll('#employers-list .employer-card')).map((c) => c.dataset.id);
    const agId = state.employers.find((e) => e.name === 'ET-Neu-AG')?.id;
    const kdId = state.employers.find((e) => e.name === 'ET-Neu-Kunde')?.id;
    return { hasAg: ids.includes(agId), hasKd: ids.includes(kdId) };
  });
  assertTrue('ET7a: Reiter "Arbeitgeber" (Angestellt-Modus) zeigt den kind=employer Eintrag', et7.hasAg, '');
  assertTrue('ET7b: Reiter "Arbeitgeber" (Angestellt-Modus) blendet den kind=client Eintrag aus', !et7.hasKd, '');

  // ET8: renderEmployers() im Freiberufler-Modus zeigt nur kind=client, kind=employer wird ausgeblendet.
  const et8 = await page.evaluate(() => {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    state.settings.appMode = 'freelance';
    renderEmployers();
    const ids = Array.from(document.querySelectorAll('#employers-list .employer-card')).map((c) => c.dataset.id);
    const agId = state.employers.find((e) => e.name === 'ET-Neu-AG')?.id;
    const kdId = state.employers.find((e) => e.name === 'ET-Neu-Kunde')?.id;
    state.settings.appMode = 'employee'; // zurueck auf Ausgangsmodus
    renderEmployers();
    return { hasAg: ids.includes(agId), hasKd: ids.includes(kdId) };
  });
  assertTrue('ET8a: Reiter "Kunde" (Freiberufler-Modus) zeigt den kind=client Eintrag', et8.hasKd, '');
  assertTrue('ET8b: Reiter "Kunde" (Freiberufler-Modus) blendet den kind=employer Eintrag aus', !et8.hasAg, '');

  // ET9: Uebersicht (computeMonthOverview) bleibt unveraendert -- zeigt weiterhin ALLE
  // Eintraege kombiniert, unabhaengig von kind und aktuellem Modus.
  const et9 = await page.evaluate(() => {
    const agId = state.employers.find((e) => e.name === 'ET-Neu-AG')?.id;
    const kdId = state.employers.find((e) => e.name === 'ET-Neu-Kunde')?.id;
    const ov = computeMonthOverview('2026-06');
    const rowIds = ov.rows.map((r) => r.employer.id);
    return { hasAg: rowIds.includes(agId), hasKd: rowIds.includes(kdId) };
  });
  assertTrue('ET9a: Uebersicht enthaelt weiterhin den kind=employer Eintrag', et9.hasAg, '');
  assertTrue('ET9b: Uebersicht enthaelt weiterhin den kind=client Eintrag (kombinierte Ansicht unveraendert)', et9.hasKd, '');

  // Aufräumen der Test-Arbeitgeber/-Kunden.
  await page.evaluate(() => {
    state.employers = state.employers.filter((e) => !['ET-Neu-AG', 'ET-Neu-Kunde', 'ET-Manuell-Korrigiert'].includes(e.name));
    saveState();
  });
}

// ---------- 1q) Einmal-Hinweis nach automatischer kind-Zuordnung (v3.9.59) ----------
// Die kind-Migration (6->7) rät die Zuordnung Arbeitgeber/Kunde anhand des zum
// Migrationszeitpunkt aktiven Modus. Damit eine falsche Vermutung (z.B. Modus stand
// gerade auf "Freiberuflich", obwohl es sich um einen Arbeitgeber handelt) nicht
// unbemerkt bleibt, hinterlegt die Migration state.pendingMigrationNotice, und
// modules/kind-migration-notice.js zeigt beim nächsten Start einen Hinweis-Modal.

async function runKindMigrationNoticeUnits(page) {
  console.log('\n=== 1q) Einmal-Hinweis nach automatischer kind-Zuordnung (v3.9.59) ===');

  // KN1: Migration setzt pendingMigrationNotice, wenn kind fehlte (appMode=employee -> 'employer').
  const kn1 = await page.evaluate(() => {
    const legacy = {
      schemaVersion: 6,
      employers: [{ id: 'e1', name: 'Migrations-AG', hoursMode: 'week', weeklyHours: 40, breakMode: 'none' }],
      entries: [], archives: [], templates: [], settings: { state: 'HE', appMode: 'employee' }, runningTimer: null,
    };
    return runMigrations(legacy);
  });
  assertTrue('KN1a: pendingMigrationNotice ist gesetzt', !!kn1.state.pendingMigrationNotice, JSON.stringify(kn1.state.pendingMigrationNotice));
  assertEq('KN1b: type=kindAutoAssigned', kn1.state.pendingMigrationNotice?.type, 'kindAutoAssigned');
  assertEq('KN1c: toKind=employer (appMode war employee)', kn1.state.pendingMigrationNotice?.toKind, 'employer');
  assertEq('KN1d: names enthält den betroffenen Arbeitgeber', kn1.state.pendingMigrationNotice?.names?.[0], 'Migrations-AG');

  // KN2: Migration setzt KEIN pendingMigrationNotice, wenn alle Einträge bereits ein gültiges kind hatten.
  const kn2 = await page.evaluate(() => {
    const legacy = {
      schemaVersion: 6,
      employers: [{ id: 'e1', name: 'Bereits klassifiziert', kind: 'employer', hoursMode: 'week', weeklyHours: 40, breakMode: 'none' }],
      entries: [], archives: [], templates: [], settings: { state: 'HE', appMode: 'employee' }, runningTimer: null,
    };
    return runMigrations(legacy);
  });
  assertTrue('KN2: kein pendingMigrationNotice, da kind bereits gültig war', !kn2.state.pendingMigrationNotice, JSON.stringify(kn2.state.pendingMigrationNotice));

  // KN3: Mehrere betroffene Einträge -> alle Namen landen in der Liste (appMode=freelance -> 'client').
  const kn3 = await page.evaluate(() => {
    const legacy = {
      schemaVersion: 6,
      employers: [
        { id: 'e1', name: 'Kunde Eins', hoursMode: 'week', weeklyHours: 0, breakMode: 'none' },
        { id: 'e2', name: 'Kunde Zwei', kind: 'client', hoursMode: 'week', weeklyHours: 0, breakMode: 'none' },
        { id: 'e3', name: 'Kunde Drei', hoursMode: 'week', weeklyHours: 0, breakMode: 'none' },
      ],
      entries: [], archives: [], templates: [], settings: { state: 'HE', appMode: 'freelance' }, runningTimer: null,
    };
    return runMigrations(legacy);
  });
  assertEq('KN3a: toKind=client (appMode war freelance)', kn3.state.pendingMigrationNotice?.toKind, 'client');
  assertEq('KN3b: nur die beiden Einträge ohne vorheriges kind werden gemeldet', kn3.state.pendingMigrationNotice?.names?.length, 2);
  assertTrue('KN3c: "Kunde Eins" ist gemeldet', kn3.state.pendingMigrationNotice?.names?.includes('Kunde Eins'), '');
  assertTrue('KN3d: "Kunde Drei" ist gemeldet', kn3.state.pendingMigrationNotice?.names?.includes('Kunde Drei'), '');
  assertTrue('KN3e: bereits klassifiziertes "Kunde Zwei" wird NICHT gemeldet', !kn3.state.pendingMigrationNotice?.names?.includes('Kunde Zwei'), '');

  // KN4: Idempotenz -- erneutes Anwenden von runMigrations auf den bereits migrierten
  // (schemaVersion=7) State darf pendingMigrationNotice nicht erneut setzen/verändern,
  // da die 6->7-Migration nur bei schemaVersion=6 greift (siehe runMigrations: m.from===version).
  const kn4 = await page.evaluate(() => {
    const legacy = {
      schemaVersion: 6,
      employers: [{ id: 'e1', name: 'Idempotenz-AG', hoursMode: 'week', weeklyHours: 40, breakMode: 'none' }],
      entries: [], archives: [], templates: [], settings: { state: 'HE', appMode: 'employee' }, runningTimer: null,
    };
    const first = runMigrations(legacy);
    // Hinweis wie in der App konsumieren (wird nach Anzeige gelöscht) und danach erneut migrieren.
    const consumed = { ...first.state };
    delete consumed.pendingMigrationNotice;
    const second = runMigrations(consumed);
    return { firstNotice: first.state.pendingMigrationNotice, secondNotice: second.state.pendingMigrationNotice, secondChanged: second.changed };
  });
  assertTrue('KN4a: erster Durchlauf setzt den Hinweis', !!kn4.firstNotice, JSON.stringify(kn4.firstNotice));
  assertTrue('KN4b: zweiter Durchlauf auf bereits migriertem State setzt den Hinweis NICHT erneut', !kn4.secondNotice, JSON.stringify(kn4.secondNotice));

  // KN5: maybeShowKindMigrationNotice() zeigt das Modal mit den betroffenen Namen an und
  // löscht danach den State-Eintrag, damit der Hinweis nicht erneut erscheint.
  const kn5 = await page.evaluate(async () => {
    const { maybeShowKindMigrationNotice } = await import('/modules/kind-migration-notice.js');
    document.getElementById('__kmntest')?.remove();
    const host = document.createElement('div');
    host.id = '__kmntest';
    host.innerHTML = '<div id="kmn-modal" class="modal hidden"><div id="kmn-body"></div></div>';
    document.body.appendChild(host);

    const fakeState = { pendingMigrationNotice: { type: 'kindAutoAssigned', toKind: 'employer', names: ['KN5-Testfirma'] } };
    let saveCalls = 0;
    maybeShowKindMigrationNotice({
      state: fakeState,
      saveState: () => { saveCalls += 1; },
      escapeHtml: (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])),
    }, { modalId: 'kmn-modal', containerId: 'kmn-body' });

    const html = document.getElementById('kmn-body').innerHTML;
    const visible = !document.getElementById('kmn-modal').classList.contains('hidden');
    const noticeCleared = !fakeState.pendingMigrationNotice;
    host.remove();
    return { html, visible, noticeCleared, saveCalls };
  });
  assertTrue('KN5a: Modal wird sichtbar', kn5.visible, `visible=${kn5.visible}`);
  assertContains('KN5b: Name des betroffenen Eintrags im Modal-Text', kn5.html, 'KN5-Testfirma');
  assertContains('KN5c: kindLabel "Arbeitgeber" im Modal-Text', kn5.html, 'Arbeitgeber');
  assertTrue('KN5d: pendingMigrationNotice wird nach Anzeige gelöscht', kn5.noticeCleared, '');
  assertEq('KN5e: saveState wird genau einmal aufgerufen', kn5.saveCalls, 1);

  // KN6: Ohne pendingMigrationNotice bleibt das Modal hidden (No-Op).
  const kn6 = await page.evaluate(async () => {
    const { maybeShowKindMigrationNotice } = await import('/modules/kind-migration-notice.js');
    document.getElementById('__kmntest2')?.remove();
    const host = document.createElement('div');
    host.id = '__kmntest2';
    host.innerHTML = '<div id="kmn-modal2" class="modal hidden"><div id="kmn-body2"></div></div>';
    document.body.appendChild(host);

    const fakeState = { pendingMigrationNotice: null };
    let saveCalls = 0;
    maybeShowKindMigrationNotice({
      state: fakeState,
      saveState: () => { saveCalls += 1; },
      escapeHtml: (s) => String(s),
    }, { modalId: 'kmn-modal2', containerId: 'kmn-body2' });
    const hidden = document.getElementById('kmn-modal2').classList.contains('hidden');
    host.remove();
    return { hidden, saveCalls };
  });
  assertTrue('KN6a: Modal bleibt hidden ohne pendingMigrationNotice', kn6.hidden, '');
  assertEq('KN6b: saveState wird nicht aufgerufen', kn6.saveCalls, 0);
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
    personnelNumber: '48213',
  }, { employeeName: 'Max Mustermann' });

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
    assertTrue('PN1: employee pdf-content: Arbeitnehmer/in Max Mustermann', /Arbeitnehmer\/in:\s*Max Mustermann/.test(t), snippet(t));
    assertTrue('PN2: employee pdf-content: Pers.-Nr. 48213 direkt unter dem Namen', /Arbeitnehmer\/in:\s*Max Mustermann\s*Pers\.-Nr\.:\s*48213/.test(t), snippet(t));
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
    assertTrue('PN3: employee word-content: Arbeitnehmer/in Max Mustermann', /Arbeitnehmer\/in:\s*Max Mustermann/.test(t), snippet(t));
    assertTrue('PN4: employee word-content: Pers.-Nr. 48213 direkt unter dem Namen', /Arbeitnehmer\/in:\s*Max Mustermann\s*Pers\.-Nr\.:\s*48213/.test(t), snippet(t));
  }
  const emOv = await checkBlob(page, 'employee', 'overviewPdf');
  if (emOv) {
    const t = await extractPdfText(emOv);
    assertTrue('employee overviewPdf-content: Arbeitgeber A genannt', /Arbeitgeber\s*A/i.test(t), snippet(t));
    assertTrue('employee overviewPdf-content: Ist gesamt sichtbar', /\bIst\b/i.test(t), snippet(t));
    assertTrue('PN5: employee overviewPdf-content: Spalte "Pers.-Nr." vorhanden', /Pers\.-Nr\./.test(t), snippet(t));
    assertTrue('PN6: employee overviewPdf-content: Wert 48213 in der Tabelle', /48213/.test(t), snippet(t));
  }
  const emCsv = await checkBlob(page, 'employee', 'csv');
  if (emCsv) {
    const t = extractCsvText(emCsv);
    assertTrue('employee csv-content: Header-Zeile korrekt', /^Datum;Typ;Beginn;Ende;Pause \(Min\);Stunden;Grund\/Bemerkung/m.test(t), snippet(t));
    assertTrue('employee csv-content: mindestens eine Arbeitszeile (Typ Arbeit)', /;Arbeit;/.test(t), snippet(t));
    assertTrue('employee csv-content: 7:00 (Ist-Stunden) enthalten', /7:00/.test(t), snippet(t));
    assertTrue('PN7: employee csv-content: Kopfzeile Arbeitnehmer/in;Max Mustermann', /^Arbeitnehmer\/in;Max Mustermann$/m.test(t), snippet(t));
    assertTrue('PN8: employee csv-content: Kopfzeile Pers.-Nr.;48213', /^Pers\.-Nr\.;48213$/m.test(t), snippet(t));
    assertTrue('PN9: employee csv-content: Datenkopf "Datum;..." steht NACH den Metadatenzeilen', t.indexOf('Arbeitnehmer/in;Max Mustermann') < t.indexOf('Datum;Typ'), snippet(t));
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

// ---------- SW4: CDN-Library SRI-Hashes vollstaendig + korrekt verdrahtet (v3.9.49) ----------
// Statische Absicherung dafuer, dass modules/lib-loader.js fuer jede in URLS gelistete Library
// tatsaechlich einen sha384-Hash hinterlegt hat und loadScript() ihn (inkl. crossorigin) auch
// tatsaechlich am <script>-Element setzt — ein zukuenftiger Refactor, der eine neue Library in
// URLS aufnimmt, aber INTEGRITY vergisst, wuerde diese Pruefung reissen lassen statt unbemerkt
// zu bleiben.
function runLibIntegritySourceCheck() {
  const libPath = path.join(REPO_ROOT, 'modules/lib-loader.js');
  const src = fs.readFileSync(libPath, 'utf8');

  const urlsMatch = src.match(/const URLS = \{([\s\S]*?)\};/);
  assertTrue('SW4: URLS-Map in lib-loader.js gefunden', !!urlsMatch, libPath);
  const integrityMatch = src.match(/const INTEGRITY = \{([\s\S]*?)\};/);
  assertTrue('SW4: INTEGRITY-Map in lib-loader.js gefunden', !!integrityMatch, libPath);
  if (!urlsMatch || !integrityMatch) return;

  const urlKeys = Array.from(urlsMatch[1].matchAll(/^\s*(\w+):\s*'/gm)).map((m) => m[1]);
  const integrityEntries = Object.fromEntries(
    Array.from(integrityMatch[1].matchAll(/(\w+):\s*'([^']+)'/g)).map((m) => [m[1], m[2]])
  );
  assertTrue(
    'SW4: jede URL in URLS hat einen zugehoerigen sha384-Hash in INTEGRITY',
    urlKeys.length > 0 && urlKeys.every((k) => (integrityEntries[k] || '').startsWith('sha384-')),
    `urlKeys=${JSON.stringify(urlKeys)} integrityKeys=${JSON.stringify(Object.keys(integrityEntries))}`
  );

  assertTrue(
    'SW4: loadScript() setzt integrity und crossOrigin am <script>-Element',
    /s\.integrity\s*=\s*integrity/.test(src) && /s\.crossOrigin\s*=\s*'anonymous'/.test(src),
    libPath
  );
}

// ---------- SEC2: Urlaubskonto-Infofeld im Zeitraum-Modal escaped alle Werte (v3.9.51) ----------
// CodeQL (js/xss-through-dom) hat modules/ui/range-entry-modal.js Zeile 85 gemeldet:
// updateRangeVacationStats() schrieb vr.taken/planned/vr.remaining/year/vr.carryOver unescaped
// per innerHTML. Aktuell sind das immer Zahlen aus computeVacationRemaining() (kein realer
// Angriffsweg), aber als Verteidigung-in-der-Tiefe muessen alle fuenf Werte trotzdem durch
// escapeHtml(String(...)) laufen — diese statische Pruefung verhindert, dass ein zukuenftiger
// Refactor die Absicherung stillschweigend wieder entfernt.
function runRangeVacationStatsEscapingSourceCheck() {
  const modPath = path.join(REPO_ROOT, 'modules/ui/range-entry-modal.js');
  const src = fs.readFileSync(modPath, 'utf8');

  assertTrue(
    'SEC2: updateRangeVacationStats() bezieht escapeHtml aus ctx',
    /const\s*\{\s*escapeHtml\s*\}\s*=\s*ctx/.test(src),
    modPath
  );

  const fnMatch = src.match(/function updateRangeVacationStats\(ctx\)\s*{([\s\S]*?)\n}/);
  assertTrue('SEC2: updateRangeVacationStats() in range-entry-modal.js gefunden', !!fnMatch, modPath);
  if (!fnMatch) return;
  const body = fnMatch[1];
  for (const expr of ['vr.taken', 'planned', 'vr.remaining', 'year', 'vr.carryOver']) {
    const needle = `escapeHtml(String(${expr}))`;
    assertTrue(
      `SEC2: ${expr} wird vor der innerHTML-Ausgabe mit escapeHtml() geschuetzt`,
      body.includes(needle),
      body.slice(0, 400)
    );
  }
}

// ---------- SEC3: Service-Worker-Cache prueft Hostname statt Teilstring (v3.9.51) ----------
// CodeQL (js/incomplete-url-substring-sanitization) hat sw.js Zeile 120 gemeldet: die alte
// Bedingung request.url.includes('unpkg.com') liesse sich durch eine praeparierte URL wie
// https://evil.example.com/unpkg.com/x oder https://unpkg.com.evil.example.com umgehen bzw.
// fehlklassifizieren. isCacheableResponseUrl() ersetzt das durch einen echten new URL(...)
// .hostname-Vergleich. Diese Pruefung stellt sicher, dass die unsichere .includes()-Variante
// nicht versehentlich wieder auftaucht.
function runServiceWorkerHostnameCheckSourceCheck() {
  const swPath = path.join(REPO_ROOT, 'sw.js');
  const src = fs.readFileSync(swPath, 'utf8');

  assertTrue(
    'SEC3: isCacheableResponseUrl() ist definiert und nutzt new URL(...).hostname',
    /function isCacheableResponseUrl\(url\)/.test(src) && /new URL\(url\)\.hostname\s*===\s*'unpkg\.com'/.test(src),
    swPath
  );
  assertTrue(
    'SEC3: fetch-Handler ruft isCacheableResponseUrl() auf statt der alten Teilstring-Pruefung',
    /isCacheableResponseUrl\(request\.url\)/.test(src),
    swPath
  );
  assertTrue(
    'SEC3: die unsichere Teilstring-Pruefung request.url.includes(\'unpkg.com\') kommt nicht mehr vor',
    !/request\.url\.includes\('unpkg\.com'\)/.test(src),
    swPath
  );
}

// ---------- Runner ----------

(async () => {
  console.log(`Regression-Sweep gegen ${BASE_URL}`);
  const t0 = Date.now();
  runServiceWorkerPrecacheCheck();
  runVersionBadgeSyncCheck();
  runActiveUpdateCheckOnLoadCheck();
  runLibIntegritySourceCheck();
  runRangeVacationStatsEscapingSourceCheck();
  runServiceWorkerHostnameCheckSourceCheck();
  const { browser, page } = await boot();
  try {
    await runSelectorUnits(page);
    await runLibIntegrityUnits(page);
    await runMigrationUnits(page);
    await runMigrationChainUnits(page);
    await runVacationRemainingUnits(page);
    await runVacationPlanningUnits(page);
    await runRangeEntryUnits(page);
    await runOvertimeReductionUnits(page);
    await runAbsenceDuplicateGuardUnits(page);
    await runDayExactCreditUnits(page);
    await runWeekViewXssHardeningUnits(page);
    await runRangeVacationStatsUnits(page);
    await runOffDayUnits(page);
    await runAuditLogUnits(page);
    await runSettingsHelpUnits(page);
    await runEmployersHelpUnits(page);
    await runGuideDocUnits(page);
    await runUndoUnits(page);
    await runBackupReminderUnits(page);
    await runBackupImportMigrationUnits(page);
    await runStateCorruptionUnits(page);
    await runGleitzeitkontoUnits(page);
    await runEmploymentEndUnits(page);
    await runPersonnelNumberUnits(page);
    await runEmployerKindUnits(page);
    await runKindMigrationNoticeUnits(page);
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
