// v3.9.97: Bildungsurlaub (HBUG Hessen) — Berechnung, Kontingent, Erfassung, Ansichten, Exporte.
// Zusätzlich Absicherung der Aufräumarbeiten aus dem Audit (Root-Icons, Tab-Bezeichnung).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function runEducationLeaveTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.9.97: Bildungsurlaub ===');
  const check = (name, value, expected) => assertEq(`BU ${name}`, JSON.stringify(value), JSON.stringify(expected));
  const context = await browser.newContext({ timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => check(`Browserfehler: ${e.message}`, true, false));
  await page.clock.install({ time: new Date('2026-11-11T10:00:00+01:00') });
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => typeof window.renderTracker === 'function');
    const results = await page.evaluate(async () => {
      const C = await import('/modules/compute.js');
      const S = await import('/modules/selectors.js');
      const R = await import('/modules/range-entry.js');
      const { findEntryConflict } = await import('/modules/entry-conflicts.js');
      const { validateBackup } = await import('/modules/backup-validation.js');
      const { generateCsvBlob } = await import('/modules/export/csv.js');
      const out = [], test = (n, v, e) => out.push([n, v, e]);
      const off = Object.fromEntries(C.DAY_KEYS.map(k => [k, { enabled: false, start: '', end: '', break: 0 }]));
      // Rechenbeispiel aus der Vorschau: 24 h/Woche, 5-Tage-Woche (4:48 pro Tag), Hessen.
      const emp = { id: 'bu', name: 'Muster GmbH', kind: 'employer', color: '#123456', contacts: [],
        hoursMode: 'week', weeklyHours: 24, monthlyHours: 0, schedule: off, hiredSince: '2024-08-01',
        employmentEndDate: '', annualVacation: 28, breakMode: 'none' };
      const entries = [];
      for (let d = 2; d <= 30; d++) {
        const iso = `2026-11-${String(d).padStart(2, '0')}`;
        const dow = new Date(iso + 'T12:00:00').getDay();
        if (dow === 0 || dow === 6) continue;
        if (d >= 9 && d <= 13) entries.push({ id: 'b' + d, employerId: 'bu', date: iso, type: 'education_leave', note: 'Seminar' });
        else entries.push({ id: 'w' + d, employerId: 'bu', date: iso, type: 'work', start: '09:00', end: '13:48', breakMinutes: 0 });
      }
      const ctx = { state: { employers: [emp], entries, settings: { state: 'HE' } } };
      const r = C.computeMonthReport('bu', '2026-11', ctx);
      test('Soll November (21 × 4:48)', r.targetMin, 6048);
      test('Ist November (16 × 4:48)', r.workedMin, 4608);
      test('Gutschrift (5 × 4:48)', r.creditedAbsenceMin, 1440);
      test('Saldo ±0', r.balance, 0);
      test('educationLeaveEntries', r.educationLeaveEntries.length, 5);
      test('kein Urlaubseintrag', r.vacationEntries.length, 0);
      const ov = C.computeMonthOverview('2026-11', ctx);
      test('Übersicht educationLeaveDays', ov.totals.educationLeaveDays, 5);

      // Urlaubsanspruch bleibt unberührt.
      const withBU = C.computeVacationRemaining(emp, '2026-11', entries);
      const withoutBU = C.computeVacationRemaining(emp, '2026-11', entries.filter(e => e.type !== 'education_leave'));
      test('Resturlaub unverändert', withBU.remaining, withoutBU.remaining);
      const vp = C.computeYearlyVacationPlanning(emp, 2026, entries, '2026-11-11');
      test('Urlaubsplanung zählt keinen BU', vp.totalYear, 0);

      // Kontingent.
      let el = C.computeEducationLeaveYear(emp, 2026, entries, '2026-11-11');
      test('Anspruch 5-Tage-Woche', el.entitlement, 5);
      test('genommen bis Stichtag', el.taken, 3);
      test('eingegeben (Zukunft)', el.upcoming, 2);
      test('verfügbar', el.remaining, 0);
      test('nicht überschritten', el.exceeded, false);
      el = C.computeEducationLeaveYear(emp, 2026, [...entries, { id: 'x', employerId: 'bu', date: '2026-12-01', type: 'education_leave' }], '2026-11-11');
      test('6. Tag → überschritten', [el.total, el.exceeded, el.remaining], [6, true, 0]);
      test('anderes Jahr leer', C.computeEducationLeaveYear(emp, 2027, entries, '2026-11-11').total, 0);
      const three = { ...emp, schedule: { ...off, mon: { enabled: true, start: '08:00', end: '16:00', break: 0 }, tue: { enabled: true, start: '08:00', end: '16:00', break: 0 }, wed: { enabled: true, start: '08:00', end: '16:00', break: 0 } } };
      test('Anspruch 3-Tage-Woche', C.computeEducationLeaveYear(three, 2026, [], '2026-11-11').entitlement, 3);
      test('hoursMode month → 5', C.computeEducationLeaveYear({ ...emp, hoursMode: 'month' }, 2026, [], '2026-11-11').entitlement, 5);
      // Wartezeit (6 Monate).
      const shortEmp = { ...emp, hiredSince: '2026-08-01', employmentEndDate: '2026-10-31' };
      el = C.computeEducationLeaveYear(shortEmp, 2026, [], '2026-11-11');
      test('Wartezeit nicht erreicht (Ende vor Ablauf)', [el.notEligible, el.entitlement, el.eligibleFrom], [true, 0, '2027-02-01']);
      el = C.computeEducationLeaveYear({ ...emp, hiredSince: '2026-08-01' }, 2026, [], '2026-11-11');
      test('Wartezeit über Jahresende', [el.notEligible, el.entitlement], [true, 0]);
      el = C.computeEducationLeaveYear({ ...emp, hiredSince: '2026-08-01' }, 2027, [], '2026-11-11');
      test('Folgejahr berechtigt', [el.notEligible, el.entitlement, el.eligibleFrom], [false, 5, '2027-02-01']);
      el = C.computeEducationLeaveYear({ ...emp, hiredSince: '2026-03-15' }, 2026, [], '2026-11-11');
      test('Wartezeit im Jahr abgelaufen', [el.notEligible, el.eligibleFrom], [false, '2026-09-15']);
      test('ohne Arbeitgeber', C.computeEducationLeaveYear(null, 2026, [], '2026-11-11').entitlement, 0);

      // Zeitraum-Erfassung.
      let n = 0;
      const range = R.buildRangeEntries({ startISO: '2026-11-09', endISO: '2026-11-15', employerId: 'bu', type: 'education_leave',
        skipWeekendsHolidays: true, stateCode: 'HE', holidayOverrides: {}, existingEntries: [], uid: () => 'id' + (n++) });
      test('Zeitraum Mo–So → 5 Einträge', range.toCreate.map(e => [e.date, e.type]), [
        ['2026-11-09', 'education_leave'], ['2026-11-10', 'education_leave'], ['2026-11-11', 'education_leave'],
        ['2026-11-12', 'education_leave'], ['2026-11-13', 'education_leave']]);
      test('Zusammenfassung Plural', R.formatRangeEntrySummary(range, 'education_leave').includes('5 Bildungsurlaubstage'), true);

      // Konfliktschutz und Backup-Validierung.
      test('Konflikt Arbeit an BU-Tag', !!findEntryConflict(entries, { id: 'new', employerId: 'bu', date: '2026-11-10', type: 'work' }), true);
      test('Konflikt BU an Arbeitstag', !!findEntryConflict(entries, { id: 'new', employerId: 'bu', date: '2026-11-02', type: 'education_leave' }), true);
      const backup = { schemaVersion: 7, employers: [emp], entries, archives: [], templates: [], auditLog: [],
        settings: { state: 'HE', appMode: 'employee' }, activeEmployerId: 'bu', runningTimer: null };
      let accepted = true; try { validateBackup(backup); } catch { accepted = false; }
      test('Backup mit education_leave akzeptiert', accepted, true);

      // Zusammenfassung, Tooltip, Eintragsliste.
      const sctx = { isFreelance: () => false, minutesToHM: m => `${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, '0')}`, hoursDecimal: m => (m / 60).toFixed(2), formatMoney: v => String(v) };
      const base = { workedMin: 4608, targetMin: 6048, balance: 0, creditedAbsenceMin: 1440, vacationDays: 0, sickDays: 0, overtimeReductionDays: 0, mode: 'employee' };
      const f1 = S.getSummaryFields({ ...base, educationLeaveDays: 5 }, sctx).find(f => f.key === 'educationLeave');
      test('Kachel Bildungsurlaub', f1 && [f1.label, f1.value], ['Bildungsurlaub', '5 Tage']);
      test('keine Kachel ohne BU', S.getSummaryFields({ ...base, educationLeaveDays: 0 }, sctx).some(f => f.key === 'educationLeave'), false);
      test('Tooltip nennt BU', (S.buildBalanceTooltipText(1440, 0, 0, sctx.minutesToHM, 5) || '').includes('5 Bildungsurlaubstage'), true);
      test('Tooltip drei Arten', (S.buildBalanceTooltipText(1440, 1, 1, sctx.minutesToHM, 1) || '').includes('1 Urlaubstag, 1 Krankheitstag und 1 Bildungsurlaubstag'), true);
      const rows = S.computeEntryRows([entries.find(e => e.type === 'education_leave')], { getEmployer: () => emp,
        computeWorkMinutes: () => 0, computeHomeofficeMinutes: () => 0, computeMonthTargetMinutes: () => 0, countWorkdaysInMonth: () => 0 });
      test('Eintragszeile', [rows[0].rightKind, rows[0].badgeType], ['absence-education_leave', 'education_leave']);

      // CSV-Export.
      const blob = generateCsvBlob(r, { formatDate: d => d, minutesToHM: sctx.minutesToHM, computeWorkMinutes: () => 288, computeHomeofficeMinutes: () => 0, employeeName: 'Max' });
      const csv = await blob.text();
      test('CSV enthält 5 BU-Zeilen', (csv.match(/Bildungsurlaub/g) || []).length, 5);
      return out;
    });
    for (const [n, v, e] of results) check(n, v, e);

    // UI: Auswahlfelder, Urlaubsplanung, Monatsbericht, Zeitraum-Dialog.
    await page.evaluate(() => {
      const off = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(k => [k, { enabled: false, start: '', end: '', break: 0 }]));
      const s = window.state;
      s.settings.appMode = 'employee'; s.settings.state = 'HE';
      s.employers = [{ id: 'bu', name: 'Muster GmbH', kind: 'employer', color: '#123456', contacts: [], hoursMode: 'week', weeklyHours: 24, monthlyHours: 0,
        schedule: off, hiredSince: '2024-08-01', employmentEndDate: '', annualVacation: 28, breakMode: 'none' }];
      s.activeEmployerId = 'bu';
      s.entries = ['09', '10', '11'].map(d => ({ id: 'b' + d, employerId: 'bu', date: `2026-11-${d}`, type: 'education_leave', note: '' }));
      window.saveState();
    });
    await page.reload();
    await page.waitForFunction(() => typeof window.renderTracker === 'function');
    await page.evaluate(() => document.getElementById('modal-whatsnew')?.classList.add('hidden'));
    check('Option im Einzel-Dialog', await page.locator('#entry-type option[value="education_leave"], #absence-type option[value="education_leave"], select option[value="education_leave"]').count() >= 2, true);
    await page.evaluate(() => window.switchView('vacation-planning'));
    const block = await page.locator('[data-testid="education-leave-block"]').innerText();
    check('Urlaubsplanung Block', [block.includes('Bildungsurlaub 2026'), block.includes('5 Tage'), block.toLowerCase().includes('noch verfügbar')], [true, true, true]);
    check('Urlaubsplanung Rest 2 Tage', /Noch verfügbar\s*2 Tage/i.test(block), true);
    await page.evaluate(() => { const m = document.getElementById('report-month'); window.switchView('report'); m.value = '2026-11'; m.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(200);
    const report = await page.locator('#report-content').innerText();
    check('Monatsbericht Kachel', /Bildungsurlaub\s*3 Tage/i.test(report), true);
    await page.evaluate(() => window.switchView('tracker'));
    await page.click('#btn-add-range');
    await page.selectOption('#range-type', 'education_leave');
    await page.fill('#range-start', '2026-11-12');
    await page.dispatchEvent('#range-start', 'change');
    await page.fill('#range-end', '2026-11-13');
    await page.dispatchEvent('#range-end', 'change');
    const stats = await page.locator('#range-vacation-stats').innerText();
    check('Zeitraum-Dialog Vorschau', [stats.includes('Anspruch 5'), stats.includes('bereits erfasst: 3'), stats.includes('nach diesem Eintrag: 5 von 5')], [true, true, true]);
    await page.fill('#range-end', '2026-11-17');
    await page.dispatchEvent('#range-end', 'change');
    check('Zeitraum-Dialog Überschreitung', (await page.locator('#range-vacation-stats').innerText()).includes('überschritten'), true);
  } finally {
    await context.close();
  }

  // Aufräumen (Audit): Root-Icons entfernt, Service Worker verweist nicht mehr darauf, Tab-Name korrekt.
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const sw = await readFile(path.join(root, 'sw.js'), 'utf8');
  check('SW ohne Root-Icons', /'\.\/icon-(192|512)(-maskable)?\.png'/.test(sw), false);
  let rootIconExists = true;
  try { await readFile(path.join(root, 'icon-192.png')); } catch { rootIconExists = false; }
  check('Root-Icon entfernt', rootIconExists, false);
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  check('kein „Tracker“ im Nutzertext', html.includes('„Tracker“'), false);
}
