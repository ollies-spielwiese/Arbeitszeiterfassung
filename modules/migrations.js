// @ts-check
/// <reference path="../types.js" />

/**
 * State-Migrations-Layer.
 *
 * Kontrakt (siehe docs/ARCHITECTURE.md § Migrations-Kontrakt):
 *   - SCHEMA_VERSION ist die einzige Wahrheit für das aktuelle Schema.
 *   - migrations[] enthält {from, to, fn}, jede Migration hebt die Version um genau 1.
 *   - Jede Migration ist idempotent bei doppelter Anwendung.
 *   - runMigrations(state, helpers) iteriert vom state.schemaVersion (Default 1) bis SCHEMA_VERSION.
 *
 * Helpers werden per Dependency-Injection reingereicht, damit dieses Modul keine
 * eigenen Utility-Abhängigkeiten hat.
 */

export const SCHEMA_VERSION = 4;

/**
 * v3.5-Migration: Führt mehrere Home-Office-Einträge pro (employerId, date) zu einem
 * einzigen zusammen. Segmente werden konsolidiert (sortiert, überlappende gemergt),
 * Notes zusammengehängt. Alle anderen Einträge bleiben unberührt.
 * Idempotent — mehrfaches Laufen verändert das Ergebnis nicht.
 *
 * @param {Array<any>} entries
 * @param {{uid:()=>string, normalizeSegments:(segs:Array<{start:string,end:string}>)=>Array<{start:string,end:string}>}} helpers
 * @returns {Array<any>}
 */
export function migrateHomeofficeEntries(entries, helpers) {
  const { uid, normalizeSegments } = helpers;
  const byKey = new Map();
  const others = [];
  for (const e of entries) {
    if (!e || e.type !== 'homeoffice') { others.push(e); continue; }
    const key = `${e.employerId}||${e.date}`;
    const segs = Array.isArray(e.segments) && e.segments.length
      ? e.segments
      : (e.start && e.end ? [{ start: e.start, end: e.end }] : []);
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: e.id || uid(),
        employerId: e.employerId,
        date: e.date,
        type: 'homeoffice',
        segments: segs.map(s => ({ start: s.start, end: s.end })),
        note: e.note || '',
        createdAt: e.createdAt || new Date().toISOString(),
      });
    } else {
      const acc = byKey.get(key);
      acc.segments = acc.segments.concat(segs.map(s => ({ start: s.start, end: s.end })));
      if (e.note && !acc.note) acc.note = e.note;
      else if (e.note && !acc.note.includes(e.note)) acc.note = `${acc.note} · ${e.note}`;
      if (e.createdAt && e.createdAt < acc.createdAt) acc.createdAt = e.createdAt;
    }
  }
  const merged = [];
  for (const acc of byKey.values()) {
    acc.segments = normalizeSegments(acc.segments);
    merged.push(acc);
  }
  return others.concat(merged);
}

/**
 * Registrierte State-Migrationen. Reihenfolge = Ausführungsreihenfolge.
 * Jede Migration muss idempotent sein: doppelte Ausführung darf keine
 * neuen Änderungen erzeugen.
 *
 * @type {Array<{from:number, to:number, fn:(state:any, helpers:any)=>any}>}
 */
export const migrations = [
  {
    from: 1, to: 2,
    // v3.5: Home-Office-Einträge pro (employerId,date) zu einem konsolidieren.
    fn: (s, helpers) => {
      const entries = Array.isArray(s.entries) ? s.entries : [];
      return { ...s, entries: migrateHomeofficeEntries(entries, helpers) };
    },
  },
  {
    from: 2, to: 3,
    // v3.7.1: Templates ohne scope bekommen 'both'; bekannte tpl-2 wird 'employee'.
    fn: (s) => {
      const templates = (s.templates || []).map(t => {
        if (t.scope === 'both' || t.scope === 'employee' || t.scope === 'freelance') return t;
        const scope = (t.id === 'tpl-2') ? 'employee' : 'both';
        return { ...t, scope };
      });
      return { ...s, templates };
    },
  },
  {
    from: 3, to: 4,
    // v3.9.31: Neue Employer-Felder hiredSince (Datum, leer=null) und vacationCarryOver (Zahl, default 0).
    // Ohne Migration bleiben die Felder undefined — diese Migration setzt sichere Defaults für bestehende Employer.
    fn: (s) => {
      const employers = (s.employers || []).map(e => ({
        ...e,
        hiredSince: (typeof e.hiredSince === 'string') ? e.hiredSince : '',
        vacationCarryOver: (Number.isFinite(e.vacationCarryOver) && e.vacationCarryOver >= 0)
          ? Math.floor(e.vacationCarryOver)
          : 0,
      }));
      return { ...s, employers };
    },
  },
];

/**
 * Führt alle Migrationen ab state.schemaVersion (default 1) bis SCHEMA_VERSION aus.
 * Gibt migrierten State und `changed` zurück; changed=true zwingt loadState zum
 * Persistieren, damit die Migration dauerhaft ist.
 *
 * @param {any} s Roh-State (möglicherweise ohne schemaVersion)
 * @param {{uid:()=>string, normalizeSegments:(segs:Array<{start:string,end:string}>)=>Array<{start:string,end:string}>}} helpers
 * @returns {{state: any, changed: boolean}}
 */
export function runMigrations(s, helpers) {
  let version = Number(s.schemaVersion) || 1;
  let current = s;
  let changed = false;
  for (const m of migrations) {
    if (m.from === version && m.to <= SCHEMA_VERSION) {
      const before = JSON.stringify(current);
      current = m.fn(current, helpers);
      current.schemaVersion = m.to;
      version = m.to;
      if (JSON.stringify(current) !== before) changed = true;
    }
  }
  if (current.schemaVersion !== SCHEMA_VERSION) {
    current.schemaVersion = SCHEMA_VERSION;
    changed = true;
  }
  return { state: current, changed };
}
