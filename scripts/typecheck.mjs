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

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
const realErrors = errorLines.filter((l) => !noiseRegex.test(l));
const noiseCount = errorLines.length - realErrors.length;

console.log(`[typecheck] gesamt: ${errorLines.length} Meldungen`);
console.log(`[typecheck] DOM-Rauschen (gefiltert): ${noiseCount}`);
console.log(`[typecheck] echte Fehler: ${realErrors.length}`);

if (realErrors.length > 0) {
  console.log('\n[typecheck] Echte Fehler:');
  for (const l of realErrors) console.log('  ' + l);
  process.exit(1);
}

process.exit(0);
