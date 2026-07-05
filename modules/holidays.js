/**
 * @file modules/holidays.js
 * @description Deutsche Feiertage (offline, alle 16 Bundesländer) + User-Overrides.
 * Reines Modul ohne globale Abhängigkeiten. State wird als Parameter reingereicht.
 *
 * @typedef {import('../types.js').AZHoliday} AZHoliday
 * @typedef {{ add: {date:string,name:string,stateCode?:string}[], disable: string[], rename: Record<string,string> }} AZHolidayOverrides
 */

import { dateISO, addDays } from './util-time.js';

/* ---------- Holiday Overrides (user-editable, offline) ---------- */

/**
 * Normalisiert (defensiv) ein Overrides-Objekt.
 * @param {any} ov
 * @returns {AZHolidayOverrides}
 */
export function normalizeHolidayOverrides(ov) {
  const base = { add: [], disable: [], rename: {} };
  if (!ov || typeof ov !== 'object') return base;
  return {
    add: Array.isArray(ov.add) ? ov.add.filter(x => x && x.date && x.name) : [],
    disable: Array.isArray(ov.disable) ? ov.disable.filter(x => typeof x === 'string') : [],
    rename: ov.rename && typeof ov.rename === 'object' ? { ...ov.rename } : {},
  };
}

/**
 * Wendet User-Overrides auf eine berechnete Feiertagsliste an.
 * add: extra Feiertage. Wenn stateCode am Entry gesetzt ist, nur bei Match anwenden (leer = alle BL).
 * disable: ISO-Daten entfernen.
 * rename: ISO-Datum -> neuer Name.
 * @param {AZHoliday[]} list
 * @param {string} stateCode
 * @param {AZHolidayOverrides} [overrides]
 * @returns {AZHoliday[]}
 */
export function applyHolidayOverrides(list, stateCode, overrides) {
  const ov = normalizeHolidayOverrides(overrides);
  const disable = new Set(ov.disable || []);
  const rename = ov.rename || {};
  let out = list
    .filter(h => !disable.has(h.date))
    .map(h => rename[h.date] ? { ...h, name: rename[h.date] } : h);
  const seen = new Set(out.map(h => h.date));
  for (const extra of ov.add || []) {
    if (extra.stateCode && extra.stateCode !== stateCode) continue;
    if (seen.has(extra.date)) continue;
    out.push({ date: extra.date, name: extra.name });
    seen.add(extra.date);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- German Holidays (offline) ----------
 * Uses Gauss's Easter algorithm. No network needed.
 * State codes match Bundesland ISO. */

/**
 * Ostersonntag nach Gaußscher Osterformel.
 * @param {number} year
 * @returns {Date}
 */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Liefert alle Feiertage für Jahr + Bundesland (16 BL unterstützt).
 * @param {number} year z.B. 2026
 * @param {string} stateCode ISO-Code, z.B. 'HE'
 * @param {AZHolidayOverrides} [overrides]
 * @returns {AZHoliday[]}
 */
export function getHolidays(year, stateCode, overrides) {
  const list = [];
  const easter = easterSunday(year);

  // Bundesweit
  list.push({ date: `${year}-01-01`, name: 'Neujahr' });
  list.push({ date: dateISO(addDays(easter, -2)), name: 'Karfreitag' });
  list.push({ date: dateISO(addDays(easter, 1)),  name: 'Ostermontag' });
  list.push({ date: `${year}-05-01`, name: 'Tag der Arbeit' });
  list.push({ date: dateISO(addDays(easter, 39)), name: 'Christi Himmelfahrt' });
  list.push({ date: dateISO(addDays(easter, 50)), name: 'Pfingstmontag' });
  list.push({ date: `${year}-10-03`, name: 'Tag der Deutschen Einheit' });
  list.push({ date: `${year}-12-25`, name: '1. Weihnachtsfeiertag' });
  list.push({ date: `${year}-12-26`, name: '2. Weihnachtsfeiertag' });

  // Heilige Drei Könige: BW, BY, ST
  if (['BW','BY','ST'].includes(stateCode)) {
    list.push({ date: `${year}-01-06`, name: 'Heilige Drei Könige' });
  }
  // Internationaler Frauentag: BE (ab 2019), MV (ab 2023)
  if (stateCode === 'BE' && year >= 2019) list.push({ date: `${year}-03-08`, name: 'Internationaler Frauentag' });
  if (stateCode === 'MV' && year >= 2023) list.push({ date: `${year}-03-08`, name: 'Internationaler Frauentag' });

  // Fronleichnam: BW, BY, HE, NW, RP, SL, (partial: SN, TH)
  if (['BW','BY','HE','NW','RP','SL','SN','TH'].includes(stateCode)) {
    list.push({ date: dateISO(addDays(easter, 60)), name: 'Fronleichnam' });
  }
  // Mariä Himmelfahrt: BY (partial), SL
  if (['SL','BY'].includes(stateCode)) {
    list.push({ date: `${year}-08-15`, name: 'Mariä Himmelfahrt' });
  }
  // Weltkindertag: TH (ab 2019)
  if (stateCode === 'TH' && year >= 2019) list.push({ date: `${year}-09-20`, name: 'Weltkindertag' });

  // Reformationstag: bundesweit 2017 (500 Jahre), sonst BB, MV, SN, SH, ST, TH; seit 2018 auch HB, HH, NI, SH
  if (year === 2017) {
    list.push({ date: `${year}-10-31`, name: 'Reformationstag' });
  } else {
    const refStates = ['BB','MV','SN','ST','TH','HB','HH','NI','SH'];
    if (refStates.includes(stateCode)) list.push({ date: `${year}-10-31`, name: 'Reformationstag' });
  }
  // Allerheiligen: BW, BY, NW, RP, SL
  if (['BW','BY','NW','RP','SL'].includes(stateCode)) {
    list.push({ date: `${year}-11-01`, name: 'Allerheiligen' });
  }
  // Buß- und Bettag: SN
  if (stateCode === 'SN') {
    // Mittwoch vor dem 23. November
    const nov23 = new Date(year, 10, 23);
    const dow = nov23.getDay();
    const diff = ((dow - 3 + 7) % 7) || 7;
    list.push({ date: dateISO(addDays(nov23, -diff)), name: 'Buß- und Bettag' });
  }

  return applyHolidayOverrides(list.sort((a, b) => a.date.localeCompare(b.date)), stateCode, overrides);
}

/**
 * Alle Feiertage in einem ISO-Datumsbereich [startISO, endISO].
 * @param {string} startISO
 * @param {string} endISO
 * @param {string} stateCode
 * @param {AZHolidayOverrides} [overrides]
 * @returns {AZHoliday[]}
 */
export function getHolidaysInRange(startISO, endISO, stateCode, overrides) {
  const startYear = Number(startISO.slice(0, 4));
  const endYear = Number(endISO.slice(0, 4));
  const all = [];
  for (let y = startYear; y <= endYear; y++) {
    all.push(...getHolidays(y, stateCode, overrides));
  }
  return all.filter(h => h.date >= startISO && h.date <= endISO);
}

/**
 * Prüft, ob ein Datum ein Feiertag im Bundesland ist.
 * Gibt den Feiertag zurück (truthy) oder null.
 * @param {string} iso 'YYYY-MM-DD'
 * @param {string} stateCode z.B. 'HE'
 * @param {AZHolidayOverrides} [overrides]
 * @returns {AZHoliday|null}
 */
export function isHoliday(iso, stateCode, overrides) {
  const year = Number(iso.slice(0, 4));
  return getHolidays(year, stateCode, overrides).find(h => h.date === iso) || null;
}
