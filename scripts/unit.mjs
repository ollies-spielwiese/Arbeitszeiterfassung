// Unit-Tests in Node (seit v3.15.10): führt alle scripts/unit/*.cases.mjs ohne Browser aus,
// je einmal mit TZ=Europe/Berlin und TZ=America/New_York. Dieselben Fallsammlungen laufen
// zusätzlich in der Regression im Browser (dst-, timer-check- und night-shift-tests).
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const ZONES = ['Europe/Berlin', 'America/New_York'];

async function runChild() {
  const load = (n) => import(pathToFileURL(path.join(root, 'modules', n)).href);
  const files = readdirSync(path.join(here, 'unit')).filter(f => f.endsWith('.cases.mjs')).sort();
  let ok = 0, fail = 0;
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(here, 'unit', f)).href);
    let rows;
    try { rows = await mod.cases(load); } catch (e) { console.log(`[FEHLER] ${f}: ${e && e.stack || e}`); fail++; continue; }
    for (const [name, value, expected] of rows) {
      const label = `${process.env.TZ} · ${f.replace('.cases.mjs', '')} · ${name}`;
      if (isDeepStrictEqual(value, expected)) { ok++; console.log(`[  OK  ] ${label}`); }
      else { fail++; console.log(`[FEHLER] ${label}\n         erwartet: ${JSON.stringify(expected)}\n         erhalten: ${JSON.stringify(value)}`); }
    }
  }
  console.log(`#UNIT ${ok} ${fail}`);
  process.exit(fail ? 1 : 0);
}

function runParent() {
  const t0 = Date.now();
  let ok = 0, fail = 0;
  for (const tz of ZONES) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TZ: tz, AZ_UNIT_CHILD: '1' }, encoding: 'utf8' });
    const lines = (r.stdout || '').split('\n');
    const sum = lines.find(l => l.startsWith('#UNIT '));
    for (const l of lines) if (l && !l.startsWith('#UNIT ')) console.log(l);
    // state.js meldet in Node erwartungsgemäß den Ersatzspeicher im Arbeitsspeicher.
    const err = (r.stderr || '').split('\n').filter(l => l.trim() && !l.includes('using in-memory fallback')).join('\n');
    if (err) console.log(err);
    if (!sum) { fail++; console.log(`[FEHLER] ${tz}: kein Ergebnis (Exit ${r.status})`); continue; }
    const [, a, b] = sum.split(' ').map(Number);
    ok += a; fail += b;
  }
  const total = ok + fail;
  console.log('\n=== Ergebnis ===');
  console.log(`${ok}/${total} Unit-Checks OK — ${fail} Fehler — ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(fail ? 1 : 0);
}

if (process.env.AZ_UNIT_CHILD) await runChild(); else runParent();
