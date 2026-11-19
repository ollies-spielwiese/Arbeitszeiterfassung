#!/usr/bin/env node
// Phase 4.9 — tsc --noEmit Wrapper mit DOM-Rausch-Filter.
//
// Warum ein Wrapper: tsc meldet bei checkJs mit lib.dom vielfach TS2339
// fuer Properties wie 'value', 'checked', 'dataset' auf HTMLElement, weil
// getElementById() nur HTMLElement zurueckgibt. Diese Zugriffe sind stabil
// (statische IDs im index.html), also filtern wir sie weg und lassen nur
// echte Bug-Typ-Fehler durch.
//
// Exit-Code: 0 wenn nur Rausch-Fehler, 1 wenn echte Fehler bleiben.
//
// Seit v3.15.10 zusätzlich: alle Meldungen (auch das gefilterte Rauschen) werden je Datei und
// Meldungstext mit scripts/fixtures/typecheck-baseline.json verglichen. Jede neue oder häufigere
// Meldung lässt den Lauf scheitern. Abgebaute Meldungen sind erwünscht; die Liste wird dann mit
// `npm run -s typecheck -- --update` neu geschrieben.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { countMessages, compareCounts, totalOf } from './typecheck-baseline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// DOM-Properties, die auf HTMLElement/Element/EventTarget als "does not exist"
// gemeldet werden, aber im echten Code sicher sind (Cast auf HTMLInputElement/etc.
// waere die saubere Loesung, ist aber nicht Ziel von Phase 4.9).
const NOISE_PROPS = [
  'value', 'checked', 'dataset', 'files', 'type', 'disabled',
  'selectedOptions', 'closest', 'matches', 'src', 'innerHTML',
  'textContent', 'href', 'style', 'classList', 'placeholder',
  'min', 'max', 'step', 'form', 'name', 'title', 'alt',
  'open', 'content', 'selected', 'elements', 'remove', 'reset',
  'submit', 'focus', 'blur', 'click', 'scrollIntoView',
  'checkValidity', 'reportValidity', 'setCustomValidity', 'validity',
  'labels', 'autofocus', 'readonly', 'required', 'pattern',
  'options', 'multiple', 'rows', 'cols', 'wrap',
];

const noiseRegex = new RegExp(
  `TS2339: Property '(?:${NOISE_PROPS.join('|')})' does not exist on type '(?:HTMLElement|Element|EventTarget|Node)`
);

const tscBin = path.join(projectRoot, 'node_modules', '.bin', 'tsc');
const res = spawnSync(tscBin, ['--noEmit'], {
  cwd: projectRoot,
  encoding: 'utf8',
});

const raw = (res.stdout || '') + (res.stderr || '');
const lines = raw.split(/\r?\n/).filter(Boolean);

const errorLines = lines.filter((l) => /error TS\d+/.test(l));
if (res.error || res.signal || res.status === null ||
    (res.status !== 0 && (res.status !== 2 || errorLines.length === 0))) {
  console.error('[typecheck] Compiler konnte nicht erfolgreich ausgeführt werden:', res.error || res.signal || res.status, raw);
  process.exit(1);
}
const realErrors = errorLines.filter((l) => !noiseRegex.test(l));
const noiseCount = errorLines.length - realErrors.length;

const baselineFile = path.join(projectRoot, 'scripts', 'fixtures', 'typecheck-baseline.json');
const counts = countMessages(errorLines);
if (process.argv.includes('--update')) {
  writeFileSync(baselineFile, JSON.stringify(counts, null, 2) + '\n');
  console.log(`[typecheck] Liste neu geschrieben: ${totalOf(counts)} Meldungen`);
}
const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : {};
const { added, removed } = compareCounts(counts, baseline);
const addedN = added.reduce((a, x) => a + x.count, 0);
const removedN = removed.reduce((a, x) => a + x.count, 0);

console.log(`[typecheck] gesamt: ${errorLines.length} Meldungen, Liste: ${totalOf(baseline)}`);
console.log(`[typecheck] neue Meldungen: ${addedN}`);
console.log(`[typecheck] abgebaut: ${removedN}`);
console.log(`[typecheck] DOM-Rauschen (gefiltert): ${noiseCount}`);
console.log(`[typecheck] echte Fehler: ${realErrors.length}`);

if (realErrors.length > 0) {
  console.log('\n[typecheck] Echte Fehler:');
  for (const l of realErrors) console.log('  ' + l);
  process.exit(1);
}

if (addedN > 0) {
  console.log('\n[typecheck] Neu gegenüber scripts/fixtures/typecheck-baseline.json:');
  for (const a of added) console.log(`  ${a.file}: ${a.msg} (+${a.count})`);
  process.exit(1);
}
if (removedN > 0) {
  console.log('[typecheck] Hinweis: Meldungen abgebaut — Liste mit `npm run -s typecheck -- --update` aktualisieren.');
}

process.exit(0);
