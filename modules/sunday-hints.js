// modules/sunday-hints.js
// Hinweis Sonn- und Feiertagsarbeit (seit v3.13.0), §§ 9–11 ArbZG.
// Reine Funktionen. Zählt Sonntage mit Arbeit über alle Arbeitgeber (ohne Kunden),
// Präsenz und Home-Office zählen. Nur ein Hinweis, Speichern bleibt möglich.
// Mindestens freie Sonntage pro Jahr: § 11 Abs. 1 ArbZG = 15, per Tarifvertrag nach
// § 12 Satz 1 Nr. 2 ArbZG reduzierbar auf 10 (z. B. Gaststätten), 8 (Rundfunk, Theater),
// 6 (Filmtheater, Tierhaltung). Es gilt der strengste Wert der Arbeitgeber mit Sonntagsarbeit.

export const SUNDAY_MIN_FREE_DEFAULT = 15;
export const SUNDAY_MIN_FREE_OPTIONS = Object.freeze([15, 10, 8, 6]);

const COUNTED_TYPES = new Set(['work', 'homeoffice']);

export function isSundayHintEnabled(settings) {
  if (!settings) return true;
  if (settings.arbzgHintsEnabled === false) return false;
  return settings.sundayHintEnabled !== false;
}

export function isSundayISO(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

export function countSundaysInYear(year) {
  let n = 0;
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    if (d.getUTCDay() === 0) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export function normalizeMinFreeSundays(v) {
  const n = Number(v);
  return SUNDAY_MIN_FREE_OPTIONS.includes(n) ? n : SUNDAY_MIN_FREE_DEFAULT;
}

function hasTime(e) {
  if (e.type === 'work') return !!(e.start && e.end);
  if (e.type === 'homeoffice') return Array.isArray(e.segments) ? e.segments.some(s => s && s.start && s.end) : true;
  return false;
}

/**
 * Sonntage mit Arbeit in einem Jahr (alle Arbeitgeber, ohne Kunden).
 * @param {any[]} entries
 * @param {any[]} employers
 * @param {number} year
 * @param {any} [candidate] ungespeicherter Eintrag (ersetzt Eintrag mit gleicher id)
 */
export function computeSundayStats(entries, employers, year, candidate) {
  const empById = new Map((employers || []).map(e => [e.id, e]));
  const eligible = (e) => {
    if (!e || !COUNTED_TYPES.has(e.type) || !hasTime(e)) return false;
    const emp = empById.get(e.employerId);
    if (!emp || emp.kind === 'client') return false;
    return isSundayISO(e.date) && Number(e.date.slice(0, 4)) === year;
  };
  let list = (entries || []);
  if (candidate && candidate.id) list = list.filter(e => e.id !== candidate.id);
  if (candidate) list = [...list, candidate];
  const dates = new Set();
  const empIds = new Set();
  for (const e of list) {
    if (!eligible(e)) continue;
    dates.add(e.date);
    empIds.add(e.employerId);
  }
  let minFree = 0;
  for (const id of empIds) minFree = Math.max(minFree, normalizeMinFreeSundays(empById.get(id).minFreeSundays));
  if (!minFree) minFree = SUNDAY_MIN_FREE_DEFAULT;
  const total = countSundaysInYear(year);
  const worked = dates.size;
  return { year, total, worked, free: total - worked, minFree, dates: [...dates].sort() };
}

/**
 * Hinweise für einen Eintrag im Dialog.
 * @param {any[]} entries
 * @param {any[]} employers
 * @param {any} candidate {id, employerId, date, type, start, end | segments}
 * @param {(iso:string)=>({name:string}|null)} [holidayOf]
 * @returns {Array<any>}
 */
export function computeSundayHintsForCandidate(entries, employers, candidate, holidayOf) {
  if (!candidate || !COUNTED_TYPES.has(candidate.type) || !candidate.date) return [];
  const emp = (employers || []).find(e => e.id === candidate.employerId);
  if (!emp || emp.kind === 'client') return [];
  const sunday = isSundayISO(candidate.date);
  const hol = typeof holidayOf === 'function' ? holidayOf(candidate.date) : null;
  if (!sunday && !hol) return [];
  const hints = [];
  const base = 'Arbeit an Sonn- und Feiertagen ist nur in Ausnahmefällen erlaubt (§§ 9, 10 ArbZG).';
  if (sunday) {
    hints.push({ kind: 'sunday', text: `${base} Ersatzruhetag innerhalb von zwei Wochen, die diesen Tag einschließen (§ 11 Abs. 3).`, holidayName: hol ? hol.name : '' });
  } else {
    hints.push({ kind: 'holiday', holidayName: hol.name, text: `${base} Ersatzruhetag innerhalb von acht Wochen, die diesen Tag einschließen (§ 11 Abs. 3).` });
  }
  if (sunday) {
    const year = Number(candidate.date.slice(0, 4));
    const st = computeSundayStats(entries, employers, year, candidate);
    hints.push({ kind: 'count', stats: st, level: st.free < st.minFree ? 'below' : (st.free === st.minFree ? 'limit' : 'ok'), text: sundayCountText(st) });
  }
  return hints;
}

export function sundayCountText(st) {
  const head = `Mit diesem Eintrag an ${st.worked} von ${st.total} Sonntagen gearbeitet`;
  if (st.free < st.minFree) {
    return `${head} (alle Arbeitgeber) – höchstens noch ${st.free} frei. Mindestens ${st.minFree} müssen beschäftigungsfrei bleiben (§ 11 Abs. 1 ArbZG).`;
  }
  if (st.free === st.minFree) {
    return `${head} – genau ${st.minFree} bleiben frei. Jeder weitere Sonntag mit Arbeit unterschreitet § 11 Abs. 1 ArbZG.`;
  }
  return `${head} – noch ${st.free} frei, mindestens ${st.minFree} müssen beschäftigungsfrei bleiben (§ 11 Abs. 1 ArbZG).`;
}

/** HTML-Absätze für den Hinweisbereich im Dialog (ohne Fußzeile). */
export function buildSundayHintParagraphs(hints, escapeHtml) {
  return (hints || []).map((h) => {
    if (h.kind === 'count') {
      return `<p class="arbzg-hint-text" data-testid="hint-sunday-count"><strong>Freie Sonntage ${h.stats.year}:</strong> ${escapeHtml(h.text)}</p>`;
    }
    const title = h.kind === 'sunday'
      ? (h.holidayName ? `Sonntag (${h.holidayName})` : 'Sonntag')
      : `Feiertag (${h.holidayName})`;
    return `<p class="arbzg-hint-text" data-testid="hint-sunday-${h.kind}"><strong>${escapeHtml(title)}:</strong> ${escapeHtml(h.text)}</p>`;
  }).join('');
}
