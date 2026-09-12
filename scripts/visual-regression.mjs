#!/usr/bin/env node
/**
 * Arbeitszeiterfassung — Visuelle Regressionstests
 *
 * Nimmt Screenshots einzelner View-Container in definierten, deterministischen
 * App-Zuständen auf und vergleicht sie pixelweise gegen committete Baseline-
 * PNGs in visual-baselines/. Ersetzt Wegwerf-Skripte, die bisher pro Session
 * neu geschrieben und vor dem Commit wieder gelöscht wurden — diese Baselines
 * bleiben dauerhaft im Repo und wachsen mit der App.
 *
 * Ausführung:
 *   node scripts/visual-regression.mjs             # vergleicht gegen Baselines
 *   node scripts/visual-regression.mjs --update     # schreibt neue Baselines
 *
 * Env: BASE_URL (default http://localhost:8765), HEADLESS (default 1)
 *
 * Determinismus:
 *   - Datum/Uhrzeit wird per page.clock.setFixedTime auf einen festen Anker
 *     (Montag, 14.09.2026, 09:00) eingefroren — "heute" ändert sich nie,
 *     unabhängig davon, wann der Lauf tatsächlich stattfindet.
 *   - Zustand (Employer/Kunde + Einträge) wird direkt ins geladene state-
 *     Objekt geschrieben und per saveState() persistiert (wie in regression.mjs).
 *   - Animationen/Transitions/Caret werden per injiziertem CSS deaktiviert.
 *   - Es wird NUR der jeweilige View-Container gescreenshottet (#view-<name>),
 *     nie die ganze Seite — damit ändert der Versions-Badge im Header (der bei
 *     praktisch jedem Commit hochgezählt wird) NIE einen Baseline-Diff.
 *
 * Toleranz: bewusst großzügig gewählt, um Font-Rendering-Unterschiede
 * zwischen Sandbox und GitHub-Actions-Runner zu tolerieren, ohne echte
 * Layout-/Farb-Regressionen zu übersehen. Bei Verdacht auf falsch-positive
 * Treffer: visual-diffs/<name>-diff.png ansehen (rot = abweichende Pixel).
 *
 * Exit-Code: 0 = alle Snapshots im Toleranzbereich (oder --update erfolgreich),
 * 1 = mind. eine Abweichung außerhalb der Toleranz oder fehlende Baseline.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BASELINE_DIR = path.join(REPO_ROOT, 'visual-baselines');
const DIFF_DIR = path.join(REPO_ROOT, 'visual-diffs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8765';
const HEADLESS = process.env.HEADLESS !== '0';
const UPDATE = process.argv.includes('--update');

const ANCHOR_DATE = '2026-09-14T09:00:00'; // fester Montag — nie "heute"
const VIEWPORT = { width: 1280, height: 1000 };

// Max. Anteil abweichender Pixel, bevor ein Snapshot als "rot" gilt.
const MAX_DIFF_RATIO = 0.01; // 1 % — deckt Sub-Pixel-Antialiasing-Rauschen zwischen Sandbox und CI-Runner ab (empirisch: bis zu 0.89 % bei identischer Schrift), faengt aber reale Regressionen (mehrere % durch Layoutbruch/Font-Substitution) weiterhin ab
// Pro-Pixel-Farbtoleranz für pixelmatch (0..1) — höher = toleranter ggü. Anti-Aliasing.
const PIXELMATCH_THRESHOLD = 0.25;

const DISABLE_ANIMATIONS_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  html, body, * {
    font-family: "Noto Sans", sans-serif !important;
  }
`;

async function boot() {
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--font-render-hinting=none', '--disable-font-subpixel-positioning', '--disable-lcd-text'],
  });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'de-DE' });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(ANCHOR_DATE));
  await page.goto(BASE_URL + '/?nc=' + Date.now(), { waitUntil: 'commit', timeout: 15000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  await page.waitForFunction(
    () => typeof state !== 'undefined' && typeof getSummaryFields === 'function',
    null,
    { timeout: 15000 }
  );
  await page.addStyleTag({ content: DISABLE_ANIMATIONS_CSS });
  await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));
  return { browser, context, page };
}

async function seed(page, { mode, employers, entries, settingsOverrides = {} }) {
  await page.evaluate(({ mode, employers, entries, settingsOverrides }) => {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    state.settings.appMode = mode;
    Object.assign(state.settings, settingsOverrides);
    state.employers = employers;
    state.activeEmployerId = employers.find(e => e.kind !== 'client')?.id
      ?? (employers[0] ? employers[0].id : null);
    state.entries = entries;
    saveState();
  }, { mode, employers, entries, settingsOverrides });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof getSummaryFields === 'function');
  await page.clock.setFixedTime(new Date(ANCHOR_DATE)); // defensiv nach Reload erneut fixieren
  await page.addStyleTag({ content: DISABLE_ANIMATIONS_CSS });
  await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));
}

async function gotoView(page, viewName) {
  await page.evaluate(v => switchView(v), viewName);
  await page.waitForTimeout(150);
}

// ---------- Deterministische Datensätze ----------

const FREELANCE_DATASET = {
  mode: 'freelance',
  employers: [
    { id: 'vis-c1', name: 'Kunde Visual GmbH', kind: 'client', hourlyRate: 42, currency: 'EUR', targetHours: 0, weeklySchedule: null },
  ],
  entries: [
    { id: 'vr1', employerId: 'vis-c1', date: '2026-09-14', type: 'work', start: '09:00', end: '17:00', breakMinutes: 30, note: 'Visual-Baseline', createdAt: '2026-09-14T09:00:00.000Z' },
  ],
};

const EMPLOYEE_DATASET = {
  mode: 'employee',
  employers: [
    { id: 'vis-e1', name: 'Arbeitgeber Visual GmbH', kind: 'employer', targetHours: 160, weeklySchedule: null, annualVacation: 30, vacationCarryOver: 0, hiredSince: '2020-01-01', personnelNumber: '4711' },
    { id: 'vis-c2', name: 'Kunde Visual Zwei', kind: 'client', hourlyRate: 55, currency: 'EUR', targetHours: 0, weeklySchedule: null },
  ],
  entries: [
    { id: 'vr2', employerId: 'vis-e1', date: '2026-09-14', type: 'work', start: '09:00', end: '17:00', breakMinutes: 30, note: 'Visual-Baseline', createdAt: '2026-09-14T09:00:00.000Z' },
    { id: 'vr3', employerId: 'vis-c2', date: '2026-09-15', type: 'work', start: '10:00', end: '14:00', breakMinutes: 0, note: 'Visual-Baseline', createdAt: '2026-09-15T09:00:00.000Z' },
  ],
};

// name → { dataset, view, clip?, afterSeed?(page) }
const SNAPSHOTS = [
  { name: 'freelance-tracker', dataset: FREELANCE_DATASET, view: 'tracker', clip: '#view-tracker' },
  { name: 'employee-tracker', dataset: EMPLOYEE_DATASET, view: 'tracker', clip: '#view-tracker' },
  { name: 'employee-week', dataset: EMPLOYEE_DATASET, view: 'week', clip: '#view-week' },
  { name: 'employee-report', dataset: EMPLOYEE_DATASET, view: 'report', clip: '#view-report' },
  { name: 'employee-overview', dataset: EMPLOYEE_DATASET, view: 'overview', clip: '#view-overview' },
  {
    name: 'employee-help-employers-modal',
    dataset: EMPLOYEE_DATASET,
    view: 'employers',
    clip: '#modal-employers-help .modal-content',
    afterSeed: async (page) => {
      await page.evaluate(() => document.getElementById('btn-employers-help').click());
      await page.waitForTimeout(100);
    },
  },
];

// ---------- Vergleich ----------

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function comparePng(baselineBuf, actualBuf) {
  const baseline = PNG.sync.read(baselineBuf);
  const actual = PNG.sync.read(actualBuf);
  const width = Math.max(baseline.width, actual.width);
  const height = Math.max(baseline.height, actual.height);
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    return { sizeMismatch: true, baselineSize: `${baseline.width}x${baseline.height}`, actualSize: `${actual.width}x${actual.height}` };
  }
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(baseline.data, actual.data, diff.data, width, height, {
    threshold: PIXELMATCH_THRESHOLD,
  });
  const ratio = mismatched / (width * height);
  return { sizeMismatch: false, mismatched, ratio, diffPng: diff, width, height };
}

async function run() {
  ensureDir(BASELINE_DIR);
  if (!UPDATE) ensureDir(DIFF_DIR);

  const { browser, page } = await boot();
  let failed = 0;
  let created = 0;
  let lastDatasetKey = null;

  console.log(`Visuelle Regression gegen ${BASE_URL} (${UPDATE ? 'UPDATE' : 'VERGLEICH'}, Anker ${ANCHOR_DATE})`);

  for (const snap of SNAPSHOTS) {
    const datasetKey = JSON.stringify(snap.dataset.employers.map(e => e.id));
    if (datasetKey !== lastDatasetKey) {
      await seed(page, snap.dataset);
      lastDatasetKey = datasetKey;
    }
    await gotoView(page, snap.view);
    if (snap.afterSeed) await snap.afterSeed(page);

    const locator = page.locator(snap.clip).first();
    const count = await locator.count();
    if (count === 0) {
      console.log(`[ FEHLT ] ${snap.name} — Element "${snap.clip}" nicht gefunden`);
      failed++;
      continue;
    }
    const actualBuf = await locator.screenshot();
    const baselinePath = path.join(BASELINE_DIR, `${snap.name}.png`);

    if (UPDATE) {
      fs.writeFileSync(baselinePath, actualBuf);
      console.log(`[ NEU   ] ${snap.name} — Baseline geschrieben`);
      created++;
      continue;
    }

    if (!fs.existsSync(baselinePath)) {
      console.log(`[ FEHLT ] ${snap.name} — keine Baseline vorhanden (mit --update erzeugen)`);
      failed++;
      continue;
    }

    const baselineBuf = fs.readFileSync(baselinePath);
    const result = comparePng(baselineBuf, actualBuf);

    if (result.sizeMismatch) {
      console.log(`[ FAIL  ] ${snap.name} — Bildgröße geändert: Baseline ${result.baselineSize} vs. aktuell ${result.actualSize}`);
      ensureDir(DIFF_DIR);
      fs.writeFileSync(path.join(DIFF_DIR, `${snap.name}-actual.png`), actualBuf);
      failed++;
      continue;
    }

    const ok = result.ratio <= MAX_DIFF_RATIO;
    const pct = (result.ratio * 100).toFixed(3);
    if (ok) {
      console.log(`[  OK   ] ${snap.name} — ${result.mismatched} abweichende Pixel (${pct} %)`);
    } else {
      console.log(`[ FAIL  ] ${snap.name} — ${result.mismatched} abweichende Pixel (${pct} % > Toleranz ${(MAX_DIFF_RATIO * 100).toFixed(2)} %)`);
      ensureDir(DIFF_DIR);
      fs.writeFileSync(path.join(DIFF_DIR, `${snap.name}-actual.png`), actualBuf);
      fs.writeFileSync(path.join(DIFF_DIR, `${snap.name}-diff.png`), PNG.sync.write(result.diffPng));
      failed++;
    }
  }

  await browser.close();

  console.log('\n=== Ergebnis ===');
  if (UPDATE) {
    console.log(`${created}/${SNAPSHOTS.length} Baselines geschrieben nach ${path.relative(REPO_ROOT, BASELINE_DIR)}/`);
    process.exit(failed > 0 ? 1 : 0);
  } else {
    console.log(`${SNAPSHOTS.length - failed}/${SNAPSHOTS.length} Snapshots OK — ${failed} Abweichung(en)`);
    if (failed > 0) console.log(`Diff-Bilder liegen in ${path.relative(REPO_ROOT, DIFF_DIR)}/`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

run().catch(err => {
  console.error('Visuelle Regression fehlgeschlagen:', err);
  process.exit(1);
});
