// @ts-check
/**
 * modules/night-shift.js (seit v3.15.8)
 *
 * Zuordnung von Nachtarbeit über Mitternacht zu Kalendertagen. Die gespeicherten
 * Einträge bleiben unverändert; diese Funktionen verteilen die Minuten nur beim Rechnen.
 *
 * Regeln (Einstellung settings.nightShiftDay, gilt für alle Arbeitgeber):
 *   'start'    (Standard) Die ganze Schicht zählt zum Tag des Schichtbeginns.
 *              Präsenz wie bisher. Home-Office: Ein Block ab 00:00 zählt zum Vortag,
 *              wenn dort beim selben Arbeitgeber ein Home-Office-Block um 24:00 endet.
 *   'calendar' Jede Minute zählt an ihrem Kalendertag. Home-Office wie bisher.
 *              Präsenz über Mitternacht wird um 24:00 geteilt, die Pause anteilig nach
 *              der Bruttozeit (auf ganze Minuten gerundet, der Rest am Folgetag).
 *
 * Rein: kein DOM, kein Zustand. Echte Minuten mit Sommer- und Winterzeit (modules/dst.js).
 */
import { realMinutes } from './dst.js';
import { timeToMinutes, isoDateAdd, shiftYearMonth } from './util-time.js';

/** @typedef {'start'|'calendar'} NightShiftRule */

/**
 * Regel aus den Einstellungen. Fehlt das Feld, gilt 'start'.
 * @param {any} settings
 * @returns {NightShiftRule}
 */
export function getNightShiftRule(settings) {
  return settings && settings.nightShiftDay === 'calendar' ? 'calendar' : 'start';
}

/**
 * Minuten zwischen zwei Uhrzeiten am Datum (Ende vor Beginn = Folgetag).
 * @param {string} dateISO
 * @param {string} start
 * @param {string} end
 */
function span(dateISO, start, end) {
  const real = realMinutes(dateISO, start, end);
  if (real !== null) return Math.max(0, real);
  let m = timeToMinutes(end) - timeToMinutes(start);
  if (m < 0) m += 1440;
  return Math.max(0, m);
}

/** @param {any} seg */
function validSeg(seg) { return !!(seg && seg.start && seg.end); }

/**
 * Netto-Minuten eines Home-Office-Eintrags.
 * @param {any} entry
 */
function homeofficeTotal(entry) {
  if (!entry || !Array.isArray(entry.segments)) return 0;
  return entry.segments.filter(validSeg).reduce((s, g) => s + span(entry.date, g.start, g.end), 0);
}

/**
 * Hat der Arbeitgeber am Datum einen Home-Office-Block, der um 24:00 endet?
 * @param {Array<any>} entries
 * @param {string} employerId
 * @param {string} dateISO
 */
function endsAtMidnight(entries, employerId, dateISO) {
  return entries.some((e) => e && e.type === 'homeoffice' && e.employerId === employerId && e.date === dateISO
    && Array.isArray(e.segments) && e.segments.some((g) => validSeg(g) && g.end === '24:00'));
}

/**
 * Block ab 00:00, der bei der Regel 'start' zum Vortag zählt (oder null).
 * @param {any} entry Home-Office-Eintrag
 * @param {Array<any>} entries alle Einträge
 * @returns {{start:string, end:string, minutes:number, date:string}|null}
 */
export function carriedHomeofficeSegment(entry, entries) {
  if (!entry || entry.type !== 'homeoffice' || !Array.isArray(entry.segments) || !entry.date) return null;
  const seg = entry.segments.find((g) => validSeg(g) && g.start === '00:00');
  if (!seg) return null;
  const prev = isoDateAdd(entry.date, -1);
  if (!endsAtMidnight(entries || [], entry.employerId, prev)) return null;
  return { start: seg.start, end: seg.end, minutes: span(entry.date, seg.start, seg.end), date: prev };
}

/**
 * Teilt eine Präsenz über Mitternacht für die Regel 'calendar'.
 * @param {any} entry
 * @returns {Array<{date:string, minutes:number}>|null} null, wenn nicht über Mitternacht
 */
export function splitWorkByCalendar(entry) {
  if (!entry || entry.type !== 'work' || !entry.start || !entry.end || !entry.date) return null;
  if (entry.end === '24:00' || timeToMinutes(entry.end) >= timeToMinutes(entry.start)) return null;
  const next = isoDateAdd(entry.date, 1);
  const g1 = span(entry.date, entry.start, '24:00');
  const g2 = span(next, '00:00', entry.end);
  const gross = g1 + g2;
  if (gross <= 0) return null;
  const pause = Math.min(Math.max(0, Number(entry.breakMinutes) || 0), gross);
  const b1 = Math.round(pause * g1 / gross);
  const b2 = pause - b1;
  return [
    { date: entry.date, minutes: Math.max(0, g1 - b1) },
    { date: next, minutes: Math.max(0, g2 - b2) },
  ];
}

/**
 * Anteile eines Arbeitseintrags je Kalendertag. Andere Typen: [].
 * Die Summe der Anteile entspricht immer computeWorkMinutes(entry), außer bei einer
 * Pause länger als die Bruttozeit (dann 0 wie bisher).
 * @param {any} entry
 * @param {Array<any>} entries alle Einträge (für Home-Office-Ketten)
 * @param {NightShiftRule} rule
 * @returns {Array<{date:string, minutes:number}>}
 */
export function attributeWorkedMinutes(entry, entries, rule) {
  if (!entry || !entry.date) return [];
  if (entry.type === 'work') {
    if (!entry.start || !entry.end) return [];
    if (rule === 'calendar') {
      const parts = splitWorkByCalendar(entry);
      if (parts) return parts;
    }
    const gross = span(entry.date, entry.start, entry.end);
    return [{ date: entry.date, minutes: Math.max(0, gross - (Number(entry.breakMinutes) || 0)) }];
  }
  if (entry.type === 'homeoffice') {
    const total = homeofficeTotal(entry);
    if (rule === 'start') {
      const carried = carriedHomeofficeSegment(entry, entries);
      if (carried) {
        const own = Math.max(0, total - carried.minutes);
        return [{ date: carried.date, minutes: carried.minutes }, { date: entry.date, minutes: own }];
      }
    }
    return [{ date: entry.date, minutes: total }];
  }
  return [];
}

/**
 * Gearbeitete Minuten je Tag im Zeitraum [from, to] (inklusive). Einträge vom Vortag
 * und vom Folgetag des Zeitraums werden berücksichtigt, ihre Anteile aber nur gezählt,
 * wenn sie im Zeitraum liegen.
 * @param {Array<any>} entries Einträge, die infrage kommen (z. B. ein Arbeitgeber)
 * @param {Array<any>} allEntries alle Einträge (für Home-Office-Ketten)
 * @param {NightShiftRule} rule
 * @param {string} from
 * @param {string} to
 * @param {{type?:'work'|'homeoffice'}} [opts]
 * @returns {Map<string, number>}
 */
export function minutesByDate(entries, allEntries, rule, from, to, opts) {
  const lo = isoDateAdd(from, -1);
  const hi = isoDateAdd(to, 1);
  const type = opts && opts.type;
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const e of entries || []) {
    if (!e || !e.date || e.date < lo || e.date > hi) continue;
    if (e.type !== 'work' && e.type !== 'homeoffice') continue;
    if (type && e.type !== type) continue;
    for (const p of attributeWorkedMinutes(e, allEntries, rule)) {
      if (p.date < from || p.date > to || !p.minutes) continue;
      out.set(p.date, (out.get(p.date) || 0) + p.minutes);
    }
  }
  return out;
}

/**
 * Summe der Minuten aus minutesByDate.
 * @param {Map<string, number>} map
 */
export function sumMinutes(map) {
  let s = 0;
  for (const v of map.values()) s += v;
  return s;
}

/**
 * Verschobene Anteile eines Eintrags: alle Anteile, die nicht am Datum des Eintrags zählen.
 * @param {any} entry
 * @param {Array<any>} entries
 * @param {NightShiftRule} rule
 * @returns {Array<{date:string, minutes:number}>}
 */
export function movedParts(entry, entries, rule) {
  return attributeWorkedMinutes(entry, entries, rule).filter((p) => p.date !== entry.date);
}

/**
 * Datum „TT.MM.“ aus ISO.
 * @param {string} iso
 */
function dayMonth(iso) {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
}

/**
 * Text für das Schild in der Eintragsliste, oder '' wenn nichts verschoben wird.
 * @param {any} entry
 * @param {Array<any>} entries
 * @param {NightShiftRule} rule
 * @param {(min:number)=>string} minutesToHM
 */
export function nightShiftBadgeText(entry, entries, rule, minutesToHM) {
  if (!entry) return '';
  if (rule === 'start' && entry.type === 'homeoffice') {
    const c = carriedHomeofficeSegment(entry, entries);
    return c ? `${c.start}\u2013${c.end} zählt zum ${dayMonth(c.date)}` : '';
  }
  if (rule === 'calendar' && entry.type === 'work') {
    const parts = splitWorkByCalendar(entry);
    return parts ? `verteilt: ${minutesToHM(parts[0].minutes)} / ${minutesToHM(parts[1].minutes)}` : '';
  }
  return '';
}

/**
 * Hinweise für den Monatsbericht: Anteile, die über den Monatsrand verschoben werden.
 * @param {Array<any>} entries Einträge des Arbeitgebers
 * @param {Array<any>} allEntries alle Einträge
 * @param {NightShiftRule} rule
 * @param {string} ym 'YYYY-MM'
 * @param {{formatDate:(iso:string)=>string, minutesToHM:(min:number)=>string}} fmt
 * @returns {Array<string>}
 */
export function monthBoundaryNotes(entries, allEntries, rule, ym, fmt) {
  const from = `${ym}-01`;
  const lo = isoDateAdd(from, -1);
  const hi = `${shiftYearMonth(ym, 1)}-01`;
  /** @type {Array<string>} */
  const notes = [];
  for (const e of entries || []) {
    if (!e || !e.date || e.date < lo || e.date > hi) continue;
    for (const p of movedParts(e, allEntries, rule)) {
      const inEntry = e.date.startsWith(ym);
      const inPart = p.date.startsWith(ym);
      if (inEntry === inPart) continue;
      if (rule === 'start' && e.type === 'homeoffice') {
        const c = carriedHomeofficeSegment(e, allEntries);
        if (c) notes.push(`Home-Office ${c.start}\u2013${c.end} am ${fmt.formatDate(e.date)} zählt zum ${fmt.formatDate(c.date)} (Tag des Schichtbeginns).`);
      } else if (e.type === 'work') {
        notes.push(`Präsenz ${e.start}\u2013${e.end} vom ${fmt.formatDate(e.date)}: ${fmt.minutesToHM(p.minutes)} zählen zum ${fmt.formatDate(p.date)} (nach Kalendertag).`);
      }
    }
  }
  return notes;
}
