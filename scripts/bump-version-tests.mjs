/**
 * scripts/bump-version-tests.mjs
 *
 * Tests für scripts/bump-version.mjs (reine String-Funktionen und CLI in
 * einem Temp-Ordner). Läuft in Node, ohne Browser.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  VERSION_FILES, isValidVersion, compareVersionStrings, readVersions, checkVersions,
  bumpSources, buildChangelogEntry, toSingleQuotedLiteral, findModulesMissingInAssets, readSourcesFrom,
} from './bump-version.mjs';

/** Kleine, vollständige Beispielquellen mit Version 3.13.0. */
function sampleSources(v = '3.13.0') {
  const dash = v.replace(/\./g, '-');
  return {
    constants: `/** Kopf */\n\nexport const APP_VERSION = '${v}';\nexport const LAST_SEEN_VERSION_KEY = 'x';\n\n/* Changelog */\nexport const CHANGELOG = [\n  { version: '${v}', items: [\n    'Alt.',\n  ] },\n];\n`,
    pkg: `{\n  "name": "arbeitszeiterfassung",\n  "version": "${v}",\n  "private": true\n}\n`,
    lock: `{\n  "name": "arbeitszeiterfassung",\n  "version": "${v}",\n  "lockfileVersion": 3,\n  "requires": true,\n  "packages": {\n    "": {\n      "name": "arbeitszeiterfassung",\n      "version": "${v}",\n      "devDependencies": {}\n    },\n    "node_modules/x": {\n      "version": "${v}"\n    }\n  }\n}\n`,
    index: `<h1>Arbeitszeit <span class="app-version" id="app-version-badge" aria-label="Version">v${v}</span></h1>\n`,
    sw: `const CACHE_NAME = 'arbeitszeit-v${dash}';\nconst ASSETS = [\n  './modules/state.js',\n];\n`,
  };
}

function throwsWith(fn, needle) {
  try { fn(); return false; } catch (e) { return String(e && e.message).includes(needle); }
}

export function runBumpVersionTests({ assertEq, assertTrue, repoRoot }) {
  const P = 'VB';

  // Format und Vergleich
  assertTrue(`${P}: 3.13.1 ist gültig`, isValidVersion('3.13.1'));
  assertTrue(`${P}: 3.13 ist ungültig`, !isValidVersion('3.13'));
  assertTrue(`${P}: v3.13.1 ist ungültig`, !isValidVersion('v3.13.1'));
  assertTrue(`${P}: 3.13.1-beta ist ungültig`, !isValidVersion('3.13.1-beta'));
  assertTrue(`${P}: 3.13.10 > 3.13.9 (numerisch, nicht als Text)`, compareVersionStrings('3.13.10', '3.13.9') > 0);
  assertTrue(`${P}: 3.14.0 > 3.13.9`, compareVersionStrings('3.14.0', '3.13.9') > 0);
  assertEq(`${P}: 3.13.0 = 3.13.0`, compareVersionStrings('3.13.0', '3.13.0'), 0);

  // Lesen und Prüfen
  const src = sampleSources();
  const read = readVersions(src);
  assertEq(`${P}: 7 Stellen erkannt`, read.length, 7);
  assertEq(`${P}: alle Stellen auf 3.13.0`, read.every(e => e.version === '3.13.0'), true);
  assertEq(`${P}: Check OK bei einheitlichen Quellen`, checkVersions(src).ok, true);

  const broken = { ...src, index: src.index.replace('v3.13.0', 'v3.12.0') };
  const bc = checkVersions(broken);
  assertEq(`${P}: Check erkennt abweichenden Badge`, bc.ok, false);
  assertTrue(`${P}: Meldung nennt index.html`, bc.problems.some(p => p.includes('index.html') && p.includes('3.12.0')));

  const lock9 = { ...src, lock: src.lock.replace('"version": "3.13.0",\n      "devDependencies"', '"version": "3.12.9",\n      "devDependencies"') };
  assertEq(`${P}: Check erkennt abweichende Zeile 9 in package-lock.json`, checkVersions(lock9).ok, false);

  const noCache = { ...src, sw: src.sw.replace("CACHE_NAME = 'arbeitszeit-v3-13-0'", "CACHE_NAME = 'other'") };
  const nc = checkVersions(noCache);
  assertTrue(`${P}: fehlender CACHE_NAME wird gemeldet`, !nc.ok && nc.problems.some(p => p.includes('sw.js') && p.includes('nicht gefunden')));

  // Bump
  const res = bumpSources(src, '3.13.1', ['Neu: Skript für die Versionsnummer.', "Mit 'Apostroph' und \\Backslash"]);
  assertEq(`${P}: von 3.13.0`, res.from, '3.13.0');
  assertEq(`${P}: nach 3.13.1`, res.to, '3.13.1');
  const after = checkVersions(res.src);
  assertEq(`${P}: nach dem Bump alles einheitlich`, after.ok && after.version, '3.13.1');
  assertTrue(`${P}: CACHE_NAME mit Bindestrichen`, res.src.sw.includes("CACHE_NAME = 'arbeitszeit-v3-13-1'"));
  assertTrue(`${P}: Badge mit v-Präfix`, res.src.index.includes('>v3.13.1<'));
  assertTrue(`${P}: neuer CHANGELOG-Eintrag steht oben`,
    res.src.constants.indexOf("version: '3.13.1'") < res.src.constants.indexOf("version: '3.13.0'"));
  assertTrue(`${P}: Umlaute bleiben direkt in UTF-8`, res.src.constants.includes('für die Versionsnummer') && !res.src.constants.includes('\\u00fc'));
  assertTrue(`${P}: Abhängigkeiten in package-lock.json bleiben unverändert`, res.src.lock.includes('"node_modules/x": {\n      "version": "3.13.0"'));
  assertEq(`${P}: 6 Änderungszeilen`, res.changes.length, 6);
  assertTrue(`${P}: package.json bleibt gültiges JSON`, JSON.parse(res.src.pkg).version === '3.13.1');
  assertTrue(`${P}: package-lock.json bleibt gültiges JSON`, JSON.parse(res.src.lock).packages[''].version === '3.13.1');

  // Erzeugter CHANGELOG ist gültiges JavaScript mit den Originaltexten
  const literal = toSingleQuotedLiteral("Mit 'Apostroph' und \\Backslash");
  // eslint-disable-next-line no-new-func
  assertEq(`${P}: Literal mit Apostroph und Backslash ist korrekt escaped`, new Function('return ' + literal)(), "Mit 'Apostroph' und \\Backslash");
  const entry = buildChangelogEntry('9.9.9', ['A', 'B']);
  // eslint-disable-next-line no-new-func
  const parsed = new Function('return [' + entry + ']')();
  assertEq(`${P}: Changelog-Eintrag ist gültiges JavaScript`, JSON.stringify(parsed), JSON.stringify([{ version: '9.9.9', items: ['A', 'B'] }]));

  // Abbrüche
  assertTrue(`${P}: kleinere Version wird abgelehnt`, throwsWith(() => bumpSources(src, '3.12.9', ['x']), 'muss größer sein'));
  assertTrue(`${P}: gleiche Version wird abgelehnt`, throwsWith(() => bumpSources(src, '3.13.0', ['x']), 'muss größer sein'));
  assertTrue(`${P}: ungültiges Format wird abgelehnt`, throwsWith(() => bumpSources(src, '3.13', ['x']), 'Ungültige Version'));
  assertTrue(`${P}: fehlender Changelog-Punkt wird abgelehnt`, throwsWith(() => bumpSources(src, '3.13.1', []), 'Changelog-Punkt'));
  assertTrue(`${P}: leerer Changelog-Punkt wird abgelehnt`, throwsWith(() => bumpSources(src, '3.13.1', ['  ']), 'Changelog-Punkt'));
  assertTrue(`${P}: uneinheitliche Altstände werden abgelehnt`, throwsWith(() => bumpSources(broken, '3.13.1', ['x']), 'nicht einheitlich'));

  // ASSETS-Warnung
  assertEq(`${P}: fehlendes Modul in ASSETS wird erkannt`,
    JSON.stringify(findModulesMissingInAssets(src.sw, ['modules/state.js', 'modules/neu.js'])), JSON.stringify(['modules/neu.js']));

  // Echte Repo-Dateien: einheitlich
  const real = checkVersions(readSourcesFrom(repoRoot));
  assertTrue(`${P}: Repo-Dateien haben überall dieselbe Version`, real.ok, real.problems.join(' | '));

  // CLI in einem Temp-Ordner
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-'));
  try {
    for (const [key, rel] of Object.entries(VERSION_FILES)) {
      fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
      // @ts-ignore
      fs.writeFileSync(path.join(tmp, rel), src[key], 'utf8');
    }
    fs.writeFileSync(path.join(tmp, 'modules/state.js'), '', 'utf8');
    fs.writeFileSync(path.join(tmp, 'modules/neu.js'), '', 'utf8');
    const script = path.join(repoRoot, 'scripts/bump-version.mjs');
    const run = (...a) => spawnSync(process.execPath, [script, '--root', tmp, ...a], { encoding: 'utf8' });

    const chk = run('--check');
    assertEq(`${P}: CLI --check Exit-Code 0`, chk.status, 0);
    assertTrue(`${P}: CLI --check warnt vor fehlendem Modul in ASSETS`, chk.stdout.includes('modules/neu.js fehlt'));

    const dry = run('3.13.1', '--item', 'x', '--dry-run');
    assertEq(`${P}: CLI Probelauf Exit-Code 0`, dry.status, 0);
    assertEq(`${P}: CLI Probelauf ändert nichts`, fs.readFileSync(path.join(tmp, 'sw.js'), 'utf8'), src.sw);

    const noItem = run('3.13.1');
    assertEq(`${P}: CLI ohne --item Exit-Code 1`, noItem.status, 1);

    const ok = run('3.13.1', '--item', 'Neu: Skript für die Versionsnummer.');
    assertEq(`${P}: CLI Bump Exit-Code 0`, ok.status, 0);
    assertTrue(`${P}: CLI meldet 5 geänderte Dateien`, ok.stdout.includes('OK: 5 Dateien geändert: 3.13.0 → 3.13.1'));
    assertEq(`${P}: CLI Dateien danach einheitlich`, checkVersions(readSourcesFrom(tmp)).version, '3.13.1');

    fs.writeFileSync(path.join(tmp, 'index.html'), src.index, 'utf8');
    const chk2 = run('--check');
    assertEq(`${P}: CLI --check Exit-Code 1 bei Abweichung`, chk2.status, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
