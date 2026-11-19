// @ts-check
/**
 * modules/dst.js (seit v3.15.7)
 *
 * Sommer- und Winterzeit nach deutscher Zeit (EU-Regel, unabhängig von der Gerätezeitzone):
 *   Sommerzeit ab letztem Sonntag im März, 01:00 UTC (02:00 → 03:00),
 *   Winterzeit ab letztem Sonntag im Oktober, 01:00 UTC (03:00 → 02:00).
 * Einträge speichern weiter Uhrzeiten („22:00“–„06:00“). Diese Funktionen rechnen daraus die
 * tatsächlich vergangene Zeit.
 * Sonderfälle:
 *   - doppelte Stunde im Oktober (02:00–02:59): gilt als erster Durchgang (noch Sommerzeit),
 *   - fehlende Stunde im März (02:00–02:59): gilt wie die Uhrzeit eine Stunde später,
 *   - „24:00“ ist 00:00 am Folgetag.
 * Rein, ohne DOM.
 */

const MIN = 60000;

/** Letzter Sonntag eines Monats (0-basiert), 01:00 UTC, als ms. */
function lastSundayUtc(year, month) {
  const last = new Date(Date.UTC(year, month + 1, 0));
  const day = last.getUTCDate() - last.getUTCDay();
  return Date.UTC(year, month, day, 1, 0);
}

/**
 * Abstand deutscher Zeit zu UTC in Minuten (60 Winterzeit, 120 Sommerzeit).
 * @param {number} utcMs
 */
export function germanOffsetMin(utcMs) {
  const y = new Date(utcMs).getUTCFullYear();
  return utcMs >= lastSundayUtc(y, 2) && utcMs < lastSundayUtc(y, 9) ? 120 : 60;
}

/** @param {string} hhmm */
function parseClock(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** @param {string} iso */
function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : null;
}

/**
 * Uhrzeit an einem Datum (deutsche Zeit) → UTC-Millisekunden, sonst null.
 * @param {string} dateISO
 * @param {string} hhmm
 * @param {number} [dayOffset] Tage dazu (1 = Folgetag)
 * @returns {number|null}
 */
export function germanWallToUtc(dateISO, hhmm, dayOffset = 0) {
  const d = parseDate(dateISO), t = parseClock(hhmm);
  if (!d || t === null) return null;
  const naive = Date.UTC(d[0], d[1], d[2] + dayOffset, 0, t);
  const summer = naive - 120 * MIN;
  if (germanOffsetMin(summer) === 120) return summer;
  const winter = naive - 60 * MIN;
  if (germanOffsetMin(winter) === 60) return winter;
  return winter; // fehlende Stunde im März: zählt wie eine Stunde später
}

/**
 * Tatsächliche Minuten zwischen Beginn und Ende am Datum. Liegt das Ende vor dem Beginn,
 * ist es am Folgetag. Gleiche Uhrzeiten ergeben 0. Ohne gültiges Datum: null.
 * @param {string} dateISO
 * @param {string} start
 * @param {string} end
 * @returns {number|null}
 */
export function realMinutes(dateISO, start, end) {
  const s = parseClock(start), e = parseClock(end);
  if (s === null || e === null || !parseDate(dateISO)) return null;
  if (e === s) return 0;
  const a = germanWallToUtc(dateISO, start);
  const b = germanWallToUtc(dateISO, end, e < s ? 1 : 0);
  if (a === null || b === null) return null;
  return Math.round((b - a) / MIN);
}

/**
 * Unterschied zur reinen Uhrzeit-Rechnung in Minuten (+60 Winterzeit, −60 Sommerzeit, sonst 0).
 * @param {string} dateISO
 * @param {string} start
 * @param {string} end
 */
export function dstShiftMinutes(dateISO, start, end) {
  const s = parseClock(start), e = parseClock(end);
  const real = realMinutes(dateISO, start, end);
  if (real === null || s === null || e === null || e === s) return 0;
  let clock = e - s;
  if (clock < 0) clock += 1440;
  return real - clock;
}

/**
 * Verschiebung eines ganzen Eintrags (Präsenz: Beginn–Ende, Home-Office: alle Blöcke).
 * @param {any} entry
 */
export function entryDstShift(entry) {
  if (!entry || !entry.date) return 0;
  if (entry.type === 'work') return dstShiftMinutes(entry.date, entry.start, entry.end);
  if (entry.type === 'homeoffice' && Array.isArray(entry.segments)) {
    return entry.segments.reduce((sum, g) => sum + (g ? dstShiftMinutes(entry.date, g.start, g.end) : 0), 0);
  }
  return 0;
}

/**
 * Schild-Text „+1:00“ / „−1:00“.
 * @param {number} shift
 */
export function formatDstShift(shift) {
  const a = Math.abs(Math.round(shift));
  return `${shift < 0 ? '\u2212' : '+'}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}
