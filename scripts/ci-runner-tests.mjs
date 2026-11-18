// v3.14.1: ubuntu-latest wechselte im November 2026 auf 26.04, das Playwright 1.59
// nicht unterstützt. Die Jobs liefen deshalb übergangsweise fest auf ubuntu-24.04.
// Seit v3.14.4: Playwright 1.65.1 (Ubuntu 26.04 unterstützt seit 1.61), die Jobs
// laufen wieder auf ubuntu-latest. Der Test stellt sicher, dass beides zusammenpasst.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PINNED_RUNNER = 'ubuntu-latest';
/** Erste Playwright-Version mit Unterstützung für Ubuntu 26.04 (ubuntu-latest). */
export const MIN_PLAYWRIGHT_FOR_LATEST = [1, 61, 0];

/** Vergleicht "1.65.1" mit [1, 61, 0]; true, wenn mindestens so neu. */
export function isAtLeast(version, min) {
  const v = String(version).replace(/^[^\d]*/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < min.length; i++) {
    if ((v[i] || 0) > min[i]) return true;
    if ((v[i] || 0) < min[i]) return false;
  }
  return true;
}

/** Zerlegt eine Workflow-Datei in Jobs mit runs-on und Playwright-Nutzung. */
export function parseWorkflowJobs(text) {
  const jobs = [];
  let cur = null;
  let inJobs = false;
  for (const line of String(text).split('\n')) {
    if (/^jobs:\s*$/.test(line)) { inJobs = true; continue; }
    if (!inJobs) continue;
    const m = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (m) { cur = { id: m[1], runsOn: null, playwright: false }; jobs.push(cur); continue; }
    if (!cur) continue;
    const r = line.match(/^ {4}runs-on:\s*(\S+)/);
    if (r) cur.runsOn = r[1];
    if (/playwright install/.test(line)) cur.playwright = true;
  }
  return jobs;
}

export async function runCiRunnerTests({ assertEq }) {
  console.log('\n=== v3.14.1/v3.14.4: CI-Abbild für Playwright-Jobs ===');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const pw = (pkg.devDependencies && pkg.devDependencies.playwright) || (pkg.dependencies && pkg.dependencies.playwright);
  assertEq('CI Playwright-Version fest angegeben', /^\d+\.\d+\.\d+$/.test(String(pw)), true);
  assertEq(`CI Playwright ${pw} unterstützt ubuntu-latest (26.04)`, isAtLeast(pw, MIN_PLAYWRIGHT_FOR_LATEST), true);
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  assertEq('CI package-lock.json hat dieselbe Playwright-Version', lock.packages['node_modules/playwright'].version, pw);
  assertEq('CI Versionsvergleich 1.59.0 zu alt', isAtLeast('1.59.0', MIN_PLAYWRIGHT_FOR_LATEST), false);
  assertEq('CI Versionsvergleich 1.61.0 reicht', isAtLeast('1.61.0', MIN_PLAYWRIGHT_FOR_LATEST), true);
  assertEq('CI Versionsvergleich 2.0.0 reicht', isAtLeast('2.0.0', MIN_PLAYWRIGHT_FOR_LATEST), true);
  const sample = 'jobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx playwright install chromium\n  b:\n    runs-on: ubuntu-24.04\n';
  assertEq('CI Parser erkennt Jobs', JSON.stringify(parseWorkflowJobs(sample)),
    JSON.stringify([{ id: 'a', runsOn: 'ubuntu-latest', playwright: true }, { id: 'b', runsOn: 'ubuntu-24.04', playwright: false }]));
  const dir = path.join(ROOT, '.github', 'workflows');
  let count = 0;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.yml')).sort()) {
    for (const job of parseWorkflowJobs(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      if (!job.playwright) continue;
      count++;
      assertEq(`CI ${f}/${job.id} läuft auf ${PINNED_RUNNER}`, job.runsOn, PINNED_RUNNER);
    }
  }
  assertEq('CI Anzahl Playwright-Jobs', count, 4);
}
