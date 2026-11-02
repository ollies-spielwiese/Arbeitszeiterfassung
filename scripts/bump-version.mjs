#!/usr/bin/env node
/**
 * scripts/bump-version.mjs
 *
 * Setzt die Versionsnummer an allen Stellen auf einmal:
 *   - modules/constants.js   APP_VERSION und neuer CHANGELOG-Eintrag oben
 *   - package.json           "version"
 *   - package-lock.json      "version" (Wurzel und packages[""])
 *   - index.html             #app-version-badge
 *   - sw.js                  CACHE_NAME (arbeitszeit-vX-Y-Z)
 *
 * Aufruf:
 *   node scripts/bump-version.mjs 3.13.1 --item "Punkt 1" --item "Punkt 2"
 *   node scripts/bump-version.mjs --check
 *   node scripts/bump-version.mjs 3.13.1 --item "…" --dry-run
 *
 * Die reinen Funktionen (readVersions, checkVersions, bumpSources, …) werden
 * auch von scripts/regression.mjs getestet. Sie arbeiten nur auf Strings.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const VERSION_FILES = {
  constants: 'modules/constants.js',
  pkg: 'package.json',
  lock: 'package-lock.json',
  index: 'index.html',
  sw: 'sw.js',
};

const RE = {
  appVersion: /export const APP_VERSION = '([^']+)';/,
  changelogStart: /export const CHANGELOG = \[\n/,
  firstChangelogVersion: /export const CHANGELOG = \[\n\s*\{ version: '([^']+)'/,
  pkgVersion: /^(\{\s*\n\s*"name": "[^"]+",\s*\n\s*"version": ")([^"]+)(")/,
  lockRootPackage: /("packages": \{\s*\n\s*"": \{\s*\n\s*"name": "[^"]+",\s*\n\s*"version": ")([^"]+)(")/,
  badge: /(id="app-version-badge"[^>]*>v)([^<]+)(<)/,
  cacheName: /(const CACHE_NAME = 'arbeitszeit-v)([^']+)(')/,
};

/** Prüft das Format X.Y.Z (nur Ziffern). */
export function isValidVersion(v) {
  return typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v);
}

/** Vergleicht zwei Versionen: >0 wenn a größer, <0 wenn kleiner, 0 bei Gleichheit. */
export function compareVersionStrings(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function toCacheSuffix(v) { return v.replace(/\./g, '-'); }
export function fromCacheSuffix(s) { return s.replace(/-/g, '.'); }

/**
 * Liest alle Versionsangaben aus den Quelltexten.
 * @param {{constants:string,pkg:string,lock:string,index:string,sw:string}} src
 * @returns {Array<{file:string,label:string,version:string|null}>}
 */
export function readVersions(src) {
  const m = (re, s) => { const r = s.match(re); return r ? r : null; };
  const out = [];
  const av = m(RE.appVersion, src.constants);
  out.push({ file: VERSION_FILES.constants, label: 'APP_VERSION', version: av ? av[1] : null });
  const cl = m(RE.firstChangelogVersion, src.constants);
  out.push({ file: VERSION_FILES.constants, label: 'CHANGELOG (oberster Eintrag)', version: cl ? cl[1] : null });
  const pv = m(RE.pkgVersion, src.pkg);
  out.push({ file: VERSION_FILES.pkg, label: 'version', version: pv ? pv[2] : null });
  const lv = m(RE.pkgVersion, src.lock);
  out.push({ file: VERSION_FILES.lock, label: 'version (Zeile 3)', version: lv ? lv[2] : null });
  const lp = m(RE.lockRootPackage, src.lock);
  out.push({ file: VERSION_FILES.lock, label: 'packages[""].version (Zeile 9)', version: lp ? lp[2] : null });
  const bd = m(RE.badge, src.index);
  out.push({ file: VERSION_FILES.index, label: 'Badge', version: bd ? bd[2] : null });
  const cn = m(RE.cacheName, src.sw);
  out.push({ file: VERSION_FILES.sw, label: 'CACHE_NAME', version: cn ? fromCacheSuffix(cn[2]) : null });
  return out;
}

/**
 * Prüft, ob alle Stellen gefunden wurden und dieselbe Version haben.
 * @returns {{ok:boolean, version:string|null, problems:string[], entries:ReturnType<typeof readVersions>}}
 */
export function checkVersions(src) {
  const entries = readVersions(src);
  const problems = [];
  for (const e of entries) {
    if (!e.version) problems.push(`${e.file} ${e.label}: nicht gefunden`);
  }
  const found = entries.filter(e => e.version);
  const distinct = [...new Set(found.map(e => e.version))];
  if (distinct.length > 1) {
    const ref = found[0].version;
    for (const e of found) {
      if (e.version !== ref) problems.push(`${e.file} ${e.label}: ${e.version} statt ${ref}`);
    }
  }
  return { ok: problems.length === 0, version: distinct.length === 1 ? distinct[0] : null, problems, entries };
}

/** Escaped einen Text für ein JS-String-Literal in einfachen Anführungszeichen. */
export function toSingleQuotedLiteral(text) {
  return "'" + String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ') + "'";
}

/** Baut den CHANGELOG-Eintrag im Stil von constants.js. */
export function buildChangelogEntry(version, items) {
  const lines = items.map(it => `    ${toSingleQuotedLiteral(it)},`);
  return `  { version: '${version}', items: [\n${lines.join('\n')}\n  ] },\n`;
}

/**
 * Setzt die neue Version in allen Quelltexten.
 * Wirft einen Error mit verständlicher Meldung, wenn etwas nicht passt.
 * @returns {{src:{constants:string,pkg:string,lock:string,index:string,sw:string}, from:string, to:string, changes:Array<{file:string,label:string,before:string,after:string}>}}
 */
export function bumpSources(src, newVersion, items) {
  if (!isValidVersion(newVersion)) {
    throw new Error(`Ungültige Version „${newVersion}“. Erwartet wird X.Y.Z, zum Beispiel 3.13.1.`);
  }
  const list = (items || []).map(s => String(s).trim()).filter(Boolean);
  if (list.length === 0) {
    throw new Error('Mindestens ein Changelog-Punkt ist Pflicht (--item "…").');
  }
  const check = checkVersions(src);
  if (!check.ok) {
    throw new Error('Die Versionsangaben sind nicht einheitlich:\n  ' + check.problems.join('\n  '));
  }
  const from = /** @type {string} */ (check.version);
  if (compareVersionStrings(newVersion, from) <= 0) {
    throw new Error(`Neue Version ${newVersion} muss größer sein als die aktuelle ${from}.`);
  }

  const changes = [];
  const out = { ...src };

  out.constants = out.constants
    .replace(RE.appVersion, `export const APP_VERSION = '${newVersion}';`)
    .replace(RE.changelogStart, (m) => m + buildChangelogEntry(newVersion, list));
  changes.push({ file: VERSION_FILES.constants, label: 'APP_VERSION', before: from, after: newVersion });
  changes.push({ file: VERSION_FILES.constants, label: 'CHANGELOG', before: '', after: `+ ${list.length} ${list.length === 1 ? 'Punkt' : 'Punkte'}` });

  out.pkg = out.pkg.replace(RE.pkgVersion, `$1${newVersion}$3`);
  changes.push({ file: VERSION_FILES.pkg, label: 'version', before: from, after: newVersion });

  out.lock = out.lock
    .replace(RE.pkgVersion, `$1${newVersion}$3`)
    .replace(RE.lockRootPackage, `$1${newVersion}$3`);
  changes.push({ file: VERSION_FILES.lock, label: 'Zeile 3, 9', before: from, after: newVersion });

  out.index = out.index.replace(RE.badge, `$1${newVersion}$3`);
  changes.push({ file: VERSION_FILES.index, label: 'Badge', before: 'v' + from, after: 'v' + newVersion });

  out.sw = out.sw.replace(RE.cacheName, `$1${toCacheSuffix(newVersion)}$3`);
  changes.push({ file: VERSION_FILES.sw, label: 'CACHE_NAME', before: 'arbeitszeit-v' + toCacheSuffix(from), after: 'arbeitszeit-v' + toCacheSuffix(newVersion) });

  const after = checkVersions(out);
  if (!after.ok || after.version !== newVersion) {
    throw new Error('Nach dem Ersetzen sind die Versionen nicht einheitlich:\n  ' + after.problems.join('\n  '));
  }
  return { src: out, from, to: newVersion, changes };
}

/**
 * Listet Module unter modules/, die nicht in der ASSETS-Liste von sw.js stehen.
 * @param {string} swSrc
 * @param {string[]} moduleFiles relative Pfade wie 'modules/foo.js'
 */
export function findModulesMissingInAssets(swSrc, moduleFiles) {
  return moduleFiles.filter(f => !swSrc.includes(`'./${f}'`));
}

/* ---------------------------------------------------------------- CLI */

function listModuleFiles(root) {
  const res = [];
  const walk = (rel) => {
    for (const ent of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = rel + '/' + ent.name;
      if (ent.isDirectory()) walk(r);
      else if (ent.name.endsWith('.js')) res.push(r);
    }
  };
  walk('modules');
  return res.sort();
}

export function readSourcesFrom(root) {
  /** @type {any} */
  const src = {};
  for (const [key, rel] of Object.entries(VERSION_FILES)) {
    src[key] = fs.readFileSync(path.join(root, rel), 'utf8');
  }
  return src;
}

function parseArgs(argv) {
  const args = { version: null, items: [], check: false, dryRun: false, root: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') args.check = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--item') args.items.push(argv[++i] ?? '');
    else if (a.startsWith('--item=')) args.items.push(a.slice(7));
    else if (a === '--root') args.root = argv[++i];
    else if (!args.version && !a.startsWith('--')) args.version = a;
    else throw new Error(`Unbekanntes Argument: ${a}`);
  }
  return args;
}

function pad(s, n) { return (s + ' '.repeat(n)).slice(0, Math.max(n, s.length)); }

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error('Fehler: ' + e.message); process.exit(2); }
  const root = args.root ? path.resolve(args.root) : path.resolve(here, '..');
  const src = readSourcesFrom(root);

  const missing = findModulesMissingInAssets(src.sw, listModuleFiles(root));

  if (args.check) {
    const res = checkVersions(src);
    for (const e of res.entries) console.log(`${pad(e.file, 22)} ${pad(e.label, 32)} ${e.version ?? '–'}`);
    for (const f of missing) console.log(`Warnung: ${f} fehlt in der ASSETS-Liste von sw.js`);
    if (!res.ok) {
      console.error('FEHLER: Versionen nicht einheitlich:\n  ' + res.problems.join('\n  '));
      process.exit(1);
    }
    console.log(`OK: alle ${res.entries.length} Stellen auf ${res.version}`);
    return;
  }

  if (!args.version) {
    console.error('Aufruf: node scripts/bump-version.mjs X.Y.Z --item "…" [--item "…"] [--dry-run]\n       node scripts/bump-version.mjs --check');
    process.exit(2);
  }

  let result;
  try { result = bumpSources(src, args.version, args.items); }
  catch (e) { console.error('Fehler: ' + e.message); process.exit(1); }

  for (const c of result.changes) {
    const arrow = c.before ? `${c.before} -> ${c.after}` : c.after;
    console.log(`${pad(c.file, 22)} ${pad(c.label, 14)} ${arrow}`);
  }
  for (const f of missing) console.log(`Warnung: ${f} fehlt in der ASSETS-Liste von sw.js`);

  if (args.dryRun) {
    console.log('Probelauf: keine Datei geändert.');
    return;
  }
  for (const [key, rel] of Object.entries(VERSION_FILES)) {
    // @ts-ignore
    if (result.src[key] !== src[key]) fs.writeFileSync(path.join(root, rel), result.src[key], 'utf8');
  }
  console.log(`OK: ${Object.keys(VERSION_FILES).length} Dateien geändert: ${result.from} → ${result.to}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
