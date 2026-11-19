// Gespeicherte Liste der Typecheck-Meldungen (seit v3.15.10). Reine Funktionen ohne Dateizugriff,
// damit scripts/unit/typecheck.cases.mjs sie direkt prüfen kann.

/**
 * Zählt tsc-Meldungen je Datei und Meldungstext, ohne Zeilen- und Spaltennummer —
 * so bleibt die Liste stabil, wenn sich nur Code darüber verschiebt.
 * @param {string[]} errorLines z.B. "modules/x.js(12,5): error TS2339: Property 'value' …"
 * @returns {Record<string, Record<string, number>>}
 */
export function countMessages(errorLines) {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const line of errorLines) {
    const m = /^(.+?)\(\d+,\d+\): error (TS\d+: .*)$/.exec(line.trim());
    const file = m ? m[1].replace(/\\/g, '/') : '(ohne Datei)';
    const msg = m ? m[2] : line.trim();
    out[file] = out[file] || {};
    out[file][msg] = (out[file][msg] || 0) + 1;
  }
  return sortCounts(out);
}

/** Sortiert Dateien und Meldungen, damit die gespeicherte Liste diff-freundlich bleibt. */
export function sortCounts(counts) {
  const out = {};
  for (const f of Object.keys(counts).sort()) {
    out[f] = {};
    for (const k of Object.keys(counts[f]).sort()) out[f][k] = counts[f][k];
  }
  return out;
}

/** Summe aller Meldungen. */
export function totalOf(counts) {
  let n = 0;
  for (const f of Object.keys(counts)) for (const k of Object.keys(counts[f])) n += counts[f][k];
  return n;
}

/**
 * Vergleicht aktuelle Zählung mit der gespeicherten Liste.
 * added: Meldungen, die neu sind oder häufiger vorkommen; removed: abgebaute Meldungen.
 * @returns {{added: Array<{file:string,msg:string,count:number}>, removed: Array<{file:string,msg:string,count:number}>}}
 */
export function compareCounts(current, baseline) {
  const added = [], removed = [];
  const files = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  for (const file of [...files].sort()) {
    const cur = current[file] || {}, base = baseline[file] || {};
    const msgs = new Set([...Object.keys(cur), ...Object.keys(base)]);
    for (const msg of [...msgs].sort()) {
      const d = (cur[msg] || 0) - (base[msg] || 0);
      if (d > 0) added.push({ file, msg, count: d });
      else if (d < 0) removed.push({ file, msg, count: -d });
    }
  }
  return { added, removed };
}
