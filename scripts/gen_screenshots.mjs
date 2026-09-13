import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:8765';

const VIEWS = [
  { view: 'tracker', file: 'erfassen' },
  { view: 'entries', file: 'eintraege' },
  { view: 'week', file: 'woche' },
  { view: 'report', file: 'monat' },
  { view: 'overview', file: 'uebersicht' },
  { view: 'vacation-planning', file: 'urlaubsplanung' },
  { view: 'gleitzeitkonto', file: 'gleitzeitkonto' },
  { view: 'employers', file: 'arbeitgeber' },
  { view: 'archive', file: 'archiv' },
  { view: 'guide', file: 'anleitung' },
  { view: 'settings', file: 'einstellungen' },
];

// Aktuelles echtes Datum der Sandbox: 2026-09-13. Feste Referenz statt
// new Date() im Skript, damit die erzeugten Beispieldaten nachvollziehbar
// und stabil um "heute" verteilt sind.
const TODAY = '2026-09-13';

async function seed(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(() => document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')));

  await page.evaluate((today) => {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    state.settings.appMode = 'employee';
    state.settings.state = 'HE';
    state.settings.lastBackupAt = new Date().toISOString();

    const schedule = {
      mon: { enabled: true, start: '09:00', end: '17:00', breakMinutes: 30 },
      tue: { enabled: true, start: '09:00', end: '17:00', breakMinutes: 30 },
      wed: { enabled: true, start: '09:00', end: '17:00', breakMinutes: 30 },
      thu: { enabled: true, start: '09:00', end: '17:00', breakMinutes: 30 },
      fri: { enabled: true, start: '09:00', end: '15:00', breakMinutes: 30 },
      sat: { enabled: false, start: '', end: '', breakMinutes: 0 },
      sun: { enabled: false, start: '', end: '', breakMinutes: 0 },
    };

    state.employers = [
      {
        id: 'e1', kind: 'employer', name: 'Musterfirma GmbH', color: '#2563eb',
        personnelNumber: '48213',
        contacts: [{ name: 'Personalabteilung', email: 'hr@musterfirma.de' }],
        hoursMode: 'week', weeklyHours: 40,
        employmentScope: 'vollzeit', workTimeModel: 'gleitzeit',
        breakMode: 'legal', annualVacation: 30, vacationCarryOver: 3,
        schedule, hiredSince: '2026-01-01',
      },
      {
        id: 'e2', kind: 'employer', name: 'Alt-Arbeitgeber KG', color: '#64748b',
        personnelNumber: '10042',
        hoursMode: 'week', weeklyHours: 30,
        employmentScope: 'teilzeit', parttimePercent: 75, fullTimeReferenceHours: 40,
        workTimeModel: 'klassisch',
        breakMode: 'legal', annualVacation: 25,
        schedule, hiredSince: '2018-01-01', employmentEndDate: '2023-02-28',
      },
    ];
    state.activeEmployerId = 'e1';

    const entries = [];
    let seq = 1;
    const addWork = (date, start, end, breakMinutes, overtimeReason) => {
      entries.push({
        id: 'seed-' + (seq++), employerId: 'e1', date, type: 'work',
        start, end, breakMinutes,
        ...(overtimeReason ? { overtimeReason } : {}),
        createdAt: new Date(date + 'T18:00:00').toISOString(),
      });
    };
    const addAbsence = (date, type) => {
      entries.push({ id: 'seed-' + (seq++), employerId: 'e1', date, type, createdAt: new Date(date + 'T08:00:00').toISOString() });
    };

    // Werktage Jan–Sep 2026: an den meisten Tagen laut Plan, an einigen mit
    // Überstunden, damit das Gleitzeitkonto einen positiven, wachsenden
    // Saldo über das Jahr zeigt.
    for (let month = 1; month <= 9; month++) {
      const mm = String(month).padStart(2, '0');
      const daysInMonth = new Date(2026, month, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(2026, month - 1, day);
        const dow = d.getDay(); // 0=So..6=Sa
        if (dow === 0 || dow === 6) continue;
        const dd = String(day).padStart(2, '0');
        const date = `2026-${mm}-${dd}`;
        if (date > today) continue;
        // Urlaub in KW7 (Februar) und 2 Krankheitstage im Mai simulieren.
        if (date >= '2026-02-09' && date <= '2026-02-13') { addAbsence(date, 'vacation'); continue; }
        if (date === '2026-05-06' || date === '2026-05-07') { addAbsence(date, 'sick'); continue; }
        // Jeden ersten Montag im Monat mit Überstunden bis 18:30.
        if (dow === 1 && day <= 7) { addWork(date, '09:00', '18:30', 30, 'Projektabschluss'); continue; }
        addWork(date, '09:00', '17:00', 30);
      }
    }
    // Geplanter Urlaub in der Zukunft (Dezember 2026) für die Urlaubsplanung.
    ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-28', '2026-12-29', '2026-12-30'].forEach((d) => addAbsence(d, 'vacation'));

    state.entries = entries;
    state.archives = [];
    state.templates = state.templates && state.templates.length ? state.templates : [
      { id: 't1', label: 'Projektabschluss', text: 'Projektabschluss', scope: 'both' },
    ];
    state.auditLog = state.auditLog || [];
    saveState();
  }, TODAY);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(() => document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')));

  // Report-Monat auf September 2026 setzen und August 2026 archivieren, damit
  // der Archiv-Reiter einen echten Eintrag zeigt.
  await page.evaluate(() => {
    switchView('report');
    const reportMonth = document.getElementById('report-month');
    reportMonth.value = '2026-08';
    renderReport();
  });
  await page.waitForTimeout(80);
  await page.click('#btn-archive-month').catch(() => {});
  await page.waitForTimeout(150);
  // Dialog (falls vorhanden) bestätigen, falls confirm() nicht automatisch bejaht wurde.
  await page.evaluate(() => {
    const reportMonth = document.getElementById('report-month');
    reportMonth.value = '2026-09';
    renderReport();
  });
  const archiveCount = await page.evaluate(() => (state.archives || []).length);
  console.log('Archive-Einträge nach Seed:', archiveCount);
  await page.evaluate(() => {
    const toastEl = document.getElementById('toast');
    if (toastEl) toastEl.classList.add('hidden');
  });
}

async function shootAll(page, prefix) {
  for (const { view, file } of VIEWS) {
    await page.evaluate((v) => {
      document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
      const toastEl = document.getElementById('toast');
      if (toastEl) toastEl.classList.add('hidden');
      switchView(v);
    }, view);
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const active = document.querySelector('.tab.active');
      if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    await page.waitForTimeout(50);
    await page.screenshot({ path: `/tmp/az_repo/screenshots/${prefix}_${file}.png`, fullPage: true });
    console.log('OK', `${prefix}_${file}.png`);
  }
}

async function run() {
  const browser = await chromium.launch();

  // Desktop: 1440x900 @2x -> 2880x1800 (wie bisherige Screenshots).
  const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  desktopCtx.on('dialog', (d) => d.accept());
  const desktopPage = await desktopCtx.newPage();
  await seed(desktopPage);
  await shootAll(desktopPage, 'desktop');
  await desktopCtx.close();

  // Mobil: 390x844 @3x -> 1170x2532 (iPhone-Auflösung, wie bisher).
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  mobileCtx.on('dialog', (d) => d.accept());
  const mobilePage = await mobileCtx.newPage();
  await seed(mobilePage);
  await shootAll(mobilePage, 'mobile');
  await mobileCtx.close();

  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
