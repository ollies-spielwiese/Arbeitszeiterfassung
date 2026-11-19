// MIG7 (seit v3.15.10): ein Backup im Schema 1 läuft über den echten Import-Weg der App
// (Dateiauswahl → prepareImportedState → runMigrations) bis Schema 7. Dieselben Daten und die
// Handrechnung stehen in scripts/unit/migration.cases.mjs; dort laufen die Fälle auch in Node.
import { LEGACY_BACKUP } from './unit/migration.cases.mjs';

export async function runMigrationTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.15.10: Migrationskette Schema 1 → 7 (MIG7) ===');
  const check = (name, value, expected) => assertEq(`MIG7 ${name}`, JSON.stringify(value), JSON.stringify(expected));
  const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'Europe/Berlin' });
  const page = await context.newPage();
  page.on('pageerror', e => check(`Browserfehler ${e.message}`, true, false));
  page.on('dialog', d => d.accept());
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => typeof window.renderTracker === 'function');
    // Rechenfälle aus der Node-Sammlung zusätzlich im Browser
    const rows = await page.evaluate(async () => {
      const m = await import('/scripts/unit/migration.cases.mjs');
      return m.cases((n) => import('/modules/' + n));
    });
    for (const [n, v, e] of rows) check(`Browser: ${n.replace(/^MIG7 /, '')}`, v, e);
    await page.locator('#input-backup-file').setInputFiles({
      name: 'altes-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(LEGACY_BACKUP)),
    });
    await page.waitForFunction(() => window.state.schemaVersion === 7 && window.state.employers.some(e => e.name === 'Muster GmbH'));
    const r = await page.evaluate(() => {
      const s = window.state;
      const rep = window.computeMonthReport('m', '2026-11');
      return {
        ho: s.entries.filter(e => e.type === 'homeoffice' && e.date === '2026-11-02').map(e => e.segments),
        kind: s.employers[0].kind,
        scope: (s.templates.find(t => t.id === 'tpl-2') || {}).scope,
        sums: [rep.workedMin, rep.homeofficeMin, rep.targetMin, rep.creditedAbsenceMin, rep.balance],
        stored: JSON.parse(localStorage.getItem('arbeitszeit_v1') || '{}').schemaVersion,
      };
    });
    check('Import: Home-Office 02.11. ein Eintrag mit zwei Abschnitten', r.ho, [[{ start: '08:00', end: '12:00' }, { start: '12:30', end: '16:30' }]]);
    check('Import: Arbeitgeber und Vorlage', [r.kind, r.scope], ['employer', 'employee']);
    check('Import: Summen November 2026', r.sums, [960, 480, 9828, 468, -8400]);
    check('Import: gespeichert mit Schema 7', r.stored, 7);
  } finally {
    await context.close();
  }
}
