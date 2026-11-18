// v3.14.1: Jobs, die Playwright installieren, müssen auf einem festen
// Ubuntu-Abbild laufen. ubuntu-latest wechselte im November 2026 auf 26.04,
// das Playwright 1.59 nicht unterstützt. Ein Wechsel des Abbilds geht nur
// zusammen mit einem Playwright-Update und neuen Bild-Vergleichsbasen.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PINNED_RUNNER = 'ubuntu-24.04';

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
  console.log('\n=== v3.14.1: CI-Abbild für Playwright-Jobs ===');
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
