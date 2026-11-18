// v3.14.1: Prüfsummen für Berichte, CSV, Übersicht und Gleitzeitkonto.
//
// Zweck: Umbauten ohne fachliche Änderung (Roadmap 3) dürfen keine einzige
// Zahl verändern. Mit festem Datum (18.11.2026, Europe/Berlin) werden für jeden
// Arbeitgeber und jeden Monat der Bericht, die CSV, die Übersicht und das
// Gleitzeitkonto erzeugt und je Bereich zu einer SHA-256-Prüfsumme verdichtet.
//
// Aufruf von Hand (Server muss laufen):
//   BASE_URL=http://localhost:8766 node scripts/report-snapshot.mjs [backup.json]
//   BASE_URL=http://localhost:8766 node scripts/report-snapshot.mjs --update
// Ohne Datei wird scripts/fixtures/test-backup-muster.json verwendet.
// --update schreibt die erwarteten Werte neu. Das ist nur nach einer bewussten
// fachlichen Änderung zulässig.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SNAPSHOT_FIXTURE = path.join(HERE, 'fixtures', 'test-backup-muster.json');
export const SNAPSHOT_EXPECTED = path.join(HERE, 'fixtures', 'report-snapshot.expected.json');
export const SNAPSHOT_TIME = '2026-11-18T10:00:00+01:00';

/**
 * Lädt ein Backup in eine neue Seite und berechnet die Prüfsummen.
 * @param {import('playwright').Browser} browser
 * @param {string} baseURL
 * @param {string} backupJson
 */
export async function computeReportSnapshot(browser, baseURL, backupJson) {
  const context = await browser.newContext({ timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.clock.setFixedTime(new Date(SNAPSHOT_TIME));
  try {
    await page.goto(baseURL);
    await page.evaluate((d) => localStorage.setItem('arbeitszeit_v1', d), backupJson);
    await page.reload();
    await page.waitForFunction(() => typeof window.getCurrentReport === 'function' && typeof window.getCurrentGleitzeitkonto === 'function');
    return await page.evaluate(async () => {
      const hash = async (s) => {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
        return [...new Uint8Array(buf)].map((v) => v.toString(16).padStart(2, '0')).join('').slice(0, 12);
      };
      const st = window.state;
      const months = [...new Set(st.entries.map((e) => String(e.date).slice(0, 7)))].sort();
      const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))];
      const all = { bericht: '', csv: '', uebersicht: '', gleitzeit: '' };
      let reports = 0;
      const sel = document.getElementById('report-employer');
      const prevActive = st.activeEmployerId;
      for (const emp of st.employers) {
        if (![...sel.options].some((o) => o.value === emp.id)) {
          const o = document.createElement('option'); o.value = emp.id; sel.appendChild(o);
        }
        sel.value = emp.id;
        for (const ym of months) {
          document.getElementById('report-month').value = ym;
          const r = window.getCurrentReport();
          if (!r) continue;
          all.bericht += JSON.stringify(r);
          all.csv += await window.generateCsvBlob(r).text();
          if (r.workEntries && r.workEntries.length) reports++;
        }
        st.activeEmployerId = emp.id;
        for (const y of years) {
          document.getElementById('gleitzeitkonto-year').value = String(y);
          all.gleitzeit += JSON.stringify(window.getCurrentGleitzeitkonto());
        }
      }
      st.activeEmployerId = prevActive;
      for (const ym of months) {
        document.getElementById('overview-month').value = ym;
        all.uebersicht += JSON.stringify(window.getCurrentOverview());
      }
      return {
        entries: st.entries.length, employers: st.employers.length, months: months.length, reports,
        bericht: await hash(all.bericht), csv: await hash(all.csv),
        uebersicht: await hash(all.uebersicht), gleitzeit: await hash(all.gleitzeit),
      };
    });
  } finally {
    await context.close();
  }
}

/** Regression: Prüfsummen der Testdaten müssen den erwarteten Werten entsprechen. */
export async function runReportSnapshotTests(browser, baseURL, { assertEq }) {
  console.log('\n=== v3.14.1: Prüfsummen Berichte (Umbau ohne fachliche Änderung) ===');
  const expected = JSON.parse(fs.readFileSync(SNAPSHOT_EXPECTED, 'utf8'));
  const actual = await computeReportSnapshot(browser, baseURL, fs.readFileSync(SNAPSHOT_FIXTURE, 'utf8'));
  for (const key of Object.keys(expected)) {
    assertEq(`Prüfsumme ${key}`, String(actual[key]), String(expected[key]));
  }
}

// Direkter Aufruf
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { chromium } = await import('playwright');
  const args = process.argv.slice(2);
  const update = args.includes('--update');
  const file = args.find((a) => !a.startsWith('--')) || SNAPSHOT_FIXTURE;
  const baseURL = process.env.BASE_URL || 'http://localhost:8766';
  const browser = await chromium.launch();
  try {
    const result = await computeReportSnapshot(browser, baseURL, fs.readFileSync(file, 'utf8'));
    console.log(JSON.stringify(result, null, 2));
    if (update) {
      if (file !== SNAPSHOT_FIXTURE) throw new Error('--update nur mit den Standard-Testdaten');
      fs.writeFileSync(SNAPSHOT_EXPECTED, JSON.stringify(result, null, 2) + '\n');
      console.log('Erwartete Werte geschrieben: ' + path.relative(process.cwd(), SNAPSHOT_EXPECTED));
    }
  } finally {
    await browser.close();
  }
}
