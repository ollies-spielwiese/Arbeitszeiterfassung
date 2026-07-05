// @ts-check

/**
 * Reine Zeit- und Datums-Utilities.
 *
 * Kontrakt: Keine Abhängigkeiten auf state, DOM, Storage.
 *   - ISO-Strings folgen dem Muster 'YYYY-MM-DD'.
 *   - Year-Month-Strings folgen 'YYYY-MM'.
 *   - Woche-Strings folgen 'YYYY-Www' (ISO 8601).
 *   - Zeiten sind 'HH:MM' im 24h-Format.
 */

/**
 * Zero-pad auf mindestens zwei Stellen.
 * @param {number|string} n
 * @returns {string}
 */
export function pad(n) { return String(n).padStart(2, '0'); }

/**
 * Heute als ISO-Datum 'YYYY-MM-DD' (lokale Zeitzone).
 * @returns {string}
 */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Aktueller Year-Month-String 'YYYY-MM'.
 * @returns {string}
 */
export function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/**
 * Aktuelle ISO-Woche als 'YYYY-Www'. HTML week input verwendet ISO.
 * @returns {string}
 */
export function currentYearWeek() {
  const d = new Date();
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const isoYear = new Date(firstThursday).getUTCFullYear();
  return `${isoYear}-W${pad(weekNum)}`;
}

/**
 * ISO 'YYYY-MM-DD' → 'DD.MM.YYYY'.
 * @param {string} iso
 * @returns {string}
 */
export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Anzahl ISO-Wochen in einem Jahr (52 oder 53).
 * Ein Jahr hat 53 ISO-Wochen, wenn der 1. Januar oder der 31. Dezember ein Donnerstag ist.
 * @param {number} year
 * @returns {52|53}
 */
export function isoWeeksInYear(year) {
  const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const dec31 = new Date(Date.UTC(year, 11, 31)).getUTCDay();
  return (jan1 === 4 || dec31 === 4) ? 53 : 52;
}

/**
 * ISO-Datum → lokalisierter Langtext ('Mo., 05.07.2026').
 * @param {string} iso
 * @returns {string}
 */
export function formatDateLong(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Year-Month → 'Juli 2026'.
 * @param {string} ym
 * @returns {string}
 */
export function formatMonthYear(ym) {
  const [y, m] = ym.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

/**
 * Minuten → 'H:MM' (mit Minus bei negativ).
 * @param {number} mins
 * @returns {string}
 */
export function minutesToHM(mins) {
  const sign = mins < 0 ? '-' : '';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = Math.round(abs % 60);
  return `${sign}${h}:${pad(m)}`;
}

/**
 * Minuten → Dezimalstunden als deutscher String, z.B. '7,50'.
 * @param {number} mins
 * @returns {string}
 */
export function hoursDecimal(mins) {
  return (mins / 60).toFixed(2).replace('.', ',');
}

/**
 * 'HH:MM' → Minuten seit Mitternacht. Leerer/undef Input → 0.
 * @param {string} hhmm
 * @returns {number}
 */
export function timeToMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * ISO-Datum + n Tage → neues ISO-Datum.
 * @param {string} iso
 * @param {number} days
 * @returns {string}
 */
export function isoDateAdd(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/**
 * Wochentag-Index nach ISO (0=Montag ... 6=Sonntag).
 * @param {string} iso
 * @returns {number}
 */
export function dayOfWeekISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return (dt.getDay() + 6) % 7;
}

/**
 * Date-Objekt → ISO-Datum 'YYYY-MM-DD' (lokale Zeitzone).
 * @param {Date} dt
 * @returns {string}
 */
export function dateISO(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/**
 * Date + n Tage → neues Date-Objekt (Original bleibt unverändert).
 * @param {Date} dt
 * @param {number} n
 * @returns {Date}
 */
export function addDays(dt, n) {
  const c = new Date(dt);
  c.setDate(c.getDate() + n);
  return c;
}

/**
 * Anzahl Tage im Monat.
 * @param {string} ym Year-Month 'YYYY-MM'
 * @returns {number}
 */
export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Alle ISO-Datum-Strings eines Monats in Reihenfolge.
 * @param {string} ym Year-Month 'YYYY-MM'
 * @returns {string[]}
 */
export function monthDates(ym) {
  const days = daysInMonth(ym);
  const [y, m] = ym.split('-').map(Number);
  const list = [];
  for (let d = 1; d <= days; d++) {
    list.push(`${y}-${pad(m)}-${pad(d)}`);
  }
  return list;
}
