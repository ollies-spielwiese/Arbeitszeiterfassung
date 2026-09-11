/**
 * @file modules/compute.js
 * @description Reine Rechenlogik: Arbeitszeit-Minuten, Ziel-Minuten, Monatsbericht, Monatsübersicht.
 * State-Zugriffe laufen nur ueber den optionalen ctx-Parameter, damit das Modul testbar bleibt.
 *
 * @typedef {import('../types.js').AZEntry} AZEntry
 * @typedef {import('../types.js').AZEmployer} AZEmployer
 * @typedef {import('../types.js').AZMonthReport} AZMonthReport
 * @typedef {import('../types.js').AZMonthOverview} AZMonthOverview
 */

import { pad, timeToMinutes, dayOfWeekISO, monthDates, shiftYearMonth } from './util-time.js';
import { getHolidays, getHolidaysInRange } from './holidays.js';

/* ---------- Konstanten (Single Source of Truth) ---------- */

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const DAY_LABELS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const MONTH_LABELS_LONG = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/* ---------- Reine Arbeitszeit-Berechnung ---------- */

/**
 * Netto-Minuten eines Home-Office-Eintrags = Summe aller gueltigen Segmente.
 * @param {AZEntry} entry
 * @returns {number}
 */
export function computeHomeofficeMinutes(entry) {
  if (!entry || !Array.isArray(entry.segments)) return 0;
  let total = 0;
  for (const seg of entry.segments) {
    if (!seg || !seg.start || !seg.end) continue;
    let m = timeToMinutes(seg.end) - timeToMinutes(seg.start);
    if (m < 0) m += 24 * 60;
    if (m > 0) total += m;
  }
  return total;
}

/**
 * Netto-Arbeitsminuten eines Eintrags (work oder homeoffice). Andere Typen liefern 0.
 * @param {AZEntry} entry
 * @returns {number}
 */
export function computeWorkMinutes(entry) {
  if (!entry) return 0;
  if (entry.type === 'homeoffice') return computeHomeofficeMinutes(entry);
  if (entry.type !== 'work' || !entry.start || !entry.end) return 0;
  let mins = timeToMinutes(entry.end) - timeToMinutes(entry.start);
  if (mins < 0) mins += 24 * 60;
  mins -= (entry.breakMinutes || 0);
  return Math.max(0, mins);
}

/**
 * Ist der Eintrag geleistete Arbeitszeit (work oder homeoffice)?
 * @param {AZEntry} entry
 * @returns {boolean}
 */
export function isWorkedEntry(entry) {
  return !!(entry && (entry.type === 'work' || entry.type === 'homeoffice'));
}

/**
 * Gesetzliche Mindest-Pause in Minuten (ArbZG §4) abhaengig von Brutto-Arbeitszeit.
 * @param {number} workMinutesBeforeBreak
 * @returns {number}
 */
export function legalBreakMinutes(workMinutesBeforeBreak) {
  if (workMinutesBeforeBreak > 9 * 60) return 45;
  if (workMinutesBeforeBreak > 6 * 60) return 30;
  return 0;
}

/**
 * Automatische Pausen-Vorschlaege basierend auf Brutto-Arbeitszeit.
 * @param {string} startHHMM
 * @param {string} endHHMM
 * @param {string} breakMode 'none' | 'manual' | 'auto'
 * @returns {number|null}
 */
export function computeSuggestedBreak(startHHMM, endHHMM, breakMode) {
  if (breakMode === 'none' || breakMode === 'manual') return null;
  if (!startHHMM || !endHHMM) return null;
  let gross = timeToMinutes(endHHMM) - timeToMinutes(startHHMM);
  if (gross < 0) gross += 24 * 60;
  return legalBreakMinutes(gross);
}

/**
 * Default-Wochenplan (Mo-Fr 9:00-x:00, Sa/So aus).
 * @param {number} weeklyHours
 * @returns {Record<string, {enabled:boolean,start:string,end:string,break:number}>}
 */
export function defaultSchedule(weeklyHours = 40) {
  const perDay = weeklyHours / 5;
  const h = Math.floor(perDay);
  const m = Math.round((perDay - h) * 60);
  const endH = 9 + h;
  const endM = m;
  const startTime = '09:00';
  const endTime = `${pad(endH)}:${pad(endM)}`;
  return {
    mon: { enabled: true, start: startTime, end: endTime, break: perDay > 6 ? 30 : 0 },
    tue: { enabled: true, start: startTime, end: endTime, break: perDay > 6 ? 30 : 0 },
    wed: { enabled: true, start: startTime, end: endTime, break: perDay > 6 ? 30 : 0 },
    thu: { enabled: true, start: startTime, end: endTime, break: perDay > 6 ? 30 : 0 },
    fri: { enabled: true, start: startTime, end: endTime, break: perDay > 6 ? 30 : 0 },
    sat: { enabled: false, start: '', end: '', break: 0 },
    sun: { enabled: false, start: '', end: '', break: 0 },
  };
}

/* ---------- Ziel-Minuten (Soll) ---------- */

/**
 * @typedef {object} AZComputeCtx
 * @property {string} [stateCode] Bundesland (z.B. 'HE')
 * @property {any}    [holidayOverrides] normalizeHolidayOverrides-kompatibles Objekt
 * @property {object} [state] voller State fuer Aggregat-Funktionen (Monatsbericht/Overview)
 * @property {Set<string>|string[]} [offDayDates] Daten (YYYY-MM-DD) mit type='off_day' fuer
 *   diesen Employer — werden wie Feiertage vom Soll ausgenommen (seit v3.9.47, "Freier Tag").
 */

/**
 * Mischt ctx.offDayDates in ein bestehendes Feiertags-Set, damit 'off_day'-Tage ueberall dort,
 * wo bereits gegen Feiertage geprueft wird (holidays.has(d)), automatisch ebenfalls als Soll=0
 * behandelt werden — ohne jede Aufrufstelle einzeln anzupassen.
 * @param {Set<string>} holidays
 * @param {AZComputeCtx} [ctx]
 * @returns {Set<string>}
 */
function mergeOffDayDates(holidays, ctx) {
  const offDayDates = ctx && ctx.offDayDates;
  if (offDayDates) {
    for (const d of offDayDates) holidays.add(d);
  }
  return holidays;
}

/**
 * Soll-Minuten fuer einen Monat.
 * Bei hoursMode='month' anteilig um Wochentag-Feiertage reduziert.
 * Bei hoursMode='week' Summe ueber Werktage (ohne Feiertage) x perDay.
 * @param {AZEmployer} employer
 * @param {string} ym
 * @param {AZComputeCtx} [ctx]
 * @returns {number}
 */
export function computeMonthTargetMinutes(employer, ym, ctx) {
  const stateCode = (ctx && ctx.stateCode) || 'HE';
  const overrides = ctx && ctx.holidayOverrides;
  const holidays = mergeOffDayDates(new Set(getHolidaysInRange(`${ym}-01`, `${ym}-31`, stateCode, overrides).map(h => h.date)), ctx);
  const dates = monthDates(ym);

  if (employer.hoursMode === 'month' || !employer.hoursMode) {
    const monthlyMin = Math.round((employer.monthlyHours || 0) * 60);
    if (!monthlyMin) return 0;
    const weekdays = dates.filter(d => dayOfWeekISO(d) < 5);
    const weekdayHolidays = weekdays.filter(d => holidays.has(d));
    if (!weekdays.length) return monthlyMin;
    const perDay = monthlyMin / weekdays.length;
    return Math.round(monthlyMin - weekdayHolidays.length * perDay);
  }

  const schedule = employer.schedule || defaultSchedule(employer.weeklyHours || 40);
  const activeDays = DAY_KEYS.filter(k => schedule[k]?.enabled);
  const perDayMin = {};
  if (activeDays.length) {
    for (const k of DAY_KEYS) {
      const s = schedule[k];
      if (!s?.enabled) { perDayMin[k] = 0; continue; }
      if (s.start && s.end) {
        let gross = timeToMinutes(s.end) - timeToMinutes(s.start);
        if (gross < 0) gross += 24 * 60;
        perDayMin[k] = gross - (s.break || 0);
      } else {
        perDayMin[k] = Math.round(((employer.weeklyHours || 0) * 60) / activeDays.length);
      }
    }
  } else {
    const perDay = Math.round(((employer.weeklyHours || 0) * 60) / 5);
    ['mon','tue','wed','thu','fri'].forEach(k => perDayMin[k] = perDay);
    ['sat','sun'].forEach(k => perDayMin[k] = 0);
  }

  let total = 0;
  for (const d of dates) {
    if (holidays.has(d)) continue;
    const key = DAY_KEYS[dayOfWeekISO(d)];
    total += (perDayMin[key] || 0);
  }
  return total;
}

/**
 * Soll-Minuten fuer eine Kalenderwoche (7 ISO-Daten).
 * @param {AZEmployer} employer
 * @param {string[]} weekDates
 * @param {AZComputeCtx} [ctx]
 * @returns {number}
 */
export function computeWeekTargetMinutes(employer, weekDates, ctx) {
  const stateCode = (ctx && ctx.stateCode) || 'HE';
  const overrides = ctx && ctx.holidayOverrides;
  const holidays = mergeOffDayDates(new Set(weekDates.flatMap(d => {
    const y = Number(d.slice(0, 4));
    return getHolidays(y, stateCode, overrides).map(h => h.date);
  })), ctx);

  if (employer.hoursMode === 'week') {
    const perDayMin = weekModePerDayMinutesMap(employer);
    let total = 0;
    for (const d of weekDates) {
      if (holidays.has(d)) continue;
      const key = DAY_KEYS[dayOfWeekISO(d)];
      total += (perDayMin[key] || 0);
    }
    return total;
  }

  // month mode: monthlyHours * 12/52, minus Wochentag-Feiertage anteilig
  const weeklyMin = Math.round((employer.monthlyHours || 0) * 60 * 12 / 52);
  const holidayCount = weekDates.filter(d => holidays.has(d) && dayOfWeekISO(d) < 5).length;
  const perDay = weeklyMin / 5;
  return Math.max(0, Math.round(weeklyMin - holidayCount * perDay));
}

/**
 * Baut die Minuten-je-Wochentag-Karte fuer einen hoursMode='week'-Arbeitgeber aus
 * dessen individuellem Wochenschema (employer.schedule) bzw. defaultSchedule als
 * Fallback. Single Source of Truth fuer computeWeekTargetMinutes UND
 * computeDayTargetMinutes, damit beide bei unregelmaessigen Zeitplaenen exakt
 * dieselben Tageswerte liefern.
 * @param {AZEmployer} employer
 * @returns {Record<string, number>}
 */
function weekModePerDayMinutesMap(employer) {
  const schedule = employer.schedule || defaultSchedule(employer.weeklyHours || 40);
  const activeDays = DAY_KEYS.filter(k => schedule[k]?.enabled);
  /** @type {Record<string, number>} */
  const perDayMin = {};
  if (activeDays.length) {
    for (const k of DAY_KEYS) {
      const s = schedule[k];
      if (!s?.enabled) { perDayMin[k] = 0; continue; }
      if (s.start && s.end) {
        let gross = timeToMinutes(s.end) - timeToMinutes(s.start);
        if (gross < 0) gross += 24 * 60;
        perDayMin[k] = gross - (s.break || 0);
      } else {
        perDayMin[k] = Math.round(((employer.weeklyHours || 0) * 60) / activeDays.length);
      }
    }
  } else {
    const perDay = Math.round(((employer.weeklyHours || 0) * 60) / 5);
    ['mon','tue','wed','thu','fri'].forEach(k => perDayMin[k] = perDay);
    ['sat','sun'].forEach(k => perDayMin[k] = 0);
  }
  return perDayMin;
}

/**
 * Tagesgenaues Soll (in Minuten) fuer EINEN Kalendertag eines Arbeitgebers.
 *
 * Hintergrund: Die Urlaub/Krank/Ueberstundenabbau-Gutschrift rechnete bislang
 * pauschal mit einem Wochen- bzw. Monatsdurchschnitt (weeklyHours/5 bzw.
 * monthlyHours/Werktage). Bei einem GLEICHMAESSIGEN Wochenschema (jeder
 * Werktag gleich viele Stunden) ist das identisch zum tatsaechlichen
 * Tages-Soll. Bei einem UNREGELMAESSIGEN Wochenschema (z.B. Mo 8h, Mi 4h,
 * Fr 6h) weicht der Durchschnitt vom echten Tages-Soll ab, was zu einem
 * falsch wirkenden Saldo an Abwesenheitstagen fuehrt.
 *
 * Diese Funktion liefert stattdessen das ECHTE, tagesgenaue Soll aus dem
 * individuellen Wochenschema (employer.schedule bzw. defaultSchedule als
 * Fallback) — nur fuer hoursMode='week'. Feiertage liefern 0. Fuer
 * hoursMode='month' gibt es kein individuelles Tagesschema; Aufrufer bleiben
 * dort bei ihrer bisherigen (unveraenderten) Durchschnittsformel.
 *
 * @param {AZEmployer} employer
 * @param {string} dateISO
 * @param {AZComputeCtx} [ctx]
 * @returns {number}
 */
export function computeDayTargetMinutes(employer, dateISO, ctx) {
  const stateCode = (ctx && ctx.stateCode) || 'HE';
  const overrides = ctx && ctx.holidayOverrides;
  const year = Number(dateISO.slice(0, 4));
  const isHol = getHolidays(year, stateCode, overrides).some(h => h.date === dateISO);
  const offDayDates = ctx && ctx.offDayDates;
  const isOffDay = !!offDayDates && (offDayDates instanceof Set ? offDayDates.has(dateISO) : offDayDates.includes(dateISO));
  if (isHol || isOffDay) return 0;
  const perDayMin = weekModePerDayMinutesMap(employer);
  const key = DAY_KEYS[dayOfWeekISO(dateISO)];
  return perDayMin[key] || 0;
}

/**
 * Anzahl Arbeitstage im Monat (Werktage minus Feiertage) — mindestens 1.
 * @param {string} ym
 * @param {AZEmployer|null} employer
 * @param {AZComputeCtx} [ctx]
 * @returns {number}
 */
export function countWorkdaysInMonth(ym, employer, ctx) {
  const stateCode = (ctx && ctx.stateCode) || 'HE';
  const overrides = ctx && ctx.holidayOverrides;
  const holidays = mergeOffDayDates(new Set(getHolidaysInRange(`${ym}-01`, `${ym}-31`, stateCode, overrides).map(h => h.date)), ctx);
  const dates = monthDates(ym);
  if (employer && employer.hoursMode === 'week') {
    const schedule = employer.schedule || defaultSchedule(employer.weeklyHours || 40);
    return dates.filter(d => !holidays.has(d) && schedule[DAY_KEYS[dayOfWeekISO(d)]]?.enabled).length || 1;
  }
  return dates.filter(d => dayOfWeekISO(d) < 5 && !holidays.has(d)).length || 1;
}

/* ---------- Monatsbericht + Monatsuebersicht ---------- */

/**
 * Zentraler Monatsbericht fuer einen Arbeitgeber.
 * @param {string} employerId
 * @param {string} ym
 * @param {AZComputeCtx} [ctx] muss ctx.state enthalten
 * @returns {AZMonthReport|null}
 */
/**
 * Berechnet Urlaubs-Kontostand für einen Employer.
 *
 * Kontrakt:
 *   - Grundlage: annualVacation (Jahresanspruch) + vacationCarryOver (Vorjahr).
 *   - Genommen: alle vacation-Einträge des Kalenderjahres von ym mit date <= letzter Tag von ym.
 *   - remaining = annualVacation + carryOver - taken
 *   - Wenn hiredSince im gleichen Jahr liegt: annualVacation wird anteilig gekürzt (pro Monat 1/12).
 *     Bei hiredSince='' oder Vorjahr: voller Jahresanspruch.
 *   - Bei negativem Ergebnis: 0 (kein Überbezug in Zahl, App zeigt Warnung).
 *
 * @param {any} emp Employer-Objekt (mit annualVacation, vacationCarryOver, hiredSince)
 * @param {string} ym Monat im Format YYYY-MM — bestimmt Kalenderjahr und Stichtag
 * @param {Array<any>} allEntries Alle Einträge (state.entries) — werden employer-/jahresgefiltert
 * @returns {{annual:number, carryOver:number, taken:number, remaining:number, prorated:boolean, hiredMonth:number|null}}
 */
export function computeVacationRemaining(emp, ym, allEntries) {
  if (!emp) return { annual: 0, carryOver: 0, taken: 0, remaining: 0, prorated: false, hiredMonth: null };
  const annualBase = Math.max(0, parseInt(emp.annualVacation) || 0);
  const carryOver = Math.max(0, parseInt(emp.vacationCarryOver) || 0);
  const year = ym.slice(0, 4);
  const yearNum = parseInt(year, 10);
  const lastDayOfMonth = new Date(yearNum, parseInt(ym.slice(5, 7), 10), 0).getDate();
  const stichtag = `${ym}-${String(lastDayOfMonth).padStart(2, '0')}`;

  // Anteilige Kürzung bei Anstellung im laufenden Jahr
  let annual = annualBase;
  let prorated = false;
  let hiredMonth = null;
  if (emp.hiredSince && typeof emp.hiredSince === 'string' && emp.hiredSince.length >= 7) {
    const hiredYear = emp.hiredSince.slice(0, 4);
    if (hiredYear === year) {
      hiredMonth = parseInt(emp.hiredSince.slice(5, 7), 10);
      const monthsWorked = 13 - hiredMonth; // Mai=5 → 8 Monate
      annual = Math.round((annualBase * monthsWorked) / 12);
      prorated = true;
    }
  }

  // Genommene Urlaubstage im Kalenderjahr bis Stichtag
  const taken = (allEntries || []).filter(e =>
    e.type === 'vacation' &&
    e.employerId === emp.id &&
    e.date && e.date.startsWith(year) &&
    e.date <= stichtag
  ).length;

  const remaining = Math.max(0, annual + carryOver - taken);
  return { annual, carryOver, taken, remaining, prorated, hiredMonth };
}

/**
 * Jahresübersicht der Urlaubsplanung fuer einen einzelnen Arbeitgeber:
 * teilt alle Urlaubs-Eintraege eines Kalenderjahres pro Monat in bereits
 * vergangene ("genommen", date <= today) und noch bevorstehende, aber
 * bereits im System erfasste ("eingegeben", date > today) Tage auf.
 *
 * Kontrakt:
 *   - Grundlage: alle Eintraege mit type='vacation' und employerId=emp.id,
 *     deren date im angegebenen Kalenderjahr liegt.
 *   - Pro Eintrag zaehlt genau 1 Tag im jeweiligen Monat (0-basiert intern,
 *     im Ergebnis 1-basiert als month:1..12).
 *   - Vergleich date <= today (ISO-String-Vergleich) entscheidet taken/upcoming.
 *   - today wird bewusst als Parameter uebergeben (kein Date.now() im Modul),
 *     damit die Funktion deterministisch und regressionstestbar bleibt.
 *
 * @param {any} emp Employer-Objekt (mind. id)
 * @param {number|string} year Kalenderjahr, z.B. 2026
 * @param {Array<any>} allEntries Alle Eintraege (state.entries)
 * @param {string} today Stichtag im ISO-Format YYYY-MM-DD (i.d.R. todayISO())
 * @returns {{year:string, months:Array<{month:number, taken:number, upcoming:number}>, totalTaken:number, totalUpcoming:number, totalYear:number}}
 */
export function computeYearlyVacationPlanning(emp, year, allEntries, today) {
  const yearStr = String(year);
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, taken: 0, upcoming: 0 }));
  if (emp) {
    (allEntries || []).forEach((e) => {
      if (!e || e.type !== 'vacation' || e.employerId !== emp.id) return;
      if (!e.date || !e.date.startsWith(yearStr)) return;
      const monthIdx = parseInt(e.date.slice(5, 7), 10) - 1;
      if (monthIdx < 0 || monthIdx > 11) return;
      if (today && e.date <= today) months[monthIdx].taken++;
      else months[monthIdx].upcoming++;
    });
  }
  const totalTaken = months.reduce((s, m) => s + m.taken, 0);
  const totalUpcoming = months.reduce((s, m) => s + m.upcoming, 0);
  return { year: yearStr, months, totalTaken, totalUpcoming, totalYear: totalTaken + totalUpcoming };
}

export function computeMonthReport(employerId, ym, ctx) {
  const state = ctx && ctx.state;
  if (!state) return null;
  const emp = state.employers.find(e => e.id === employerId);
  if (!emp) return null;

  const stateCode = state.settings?.state || 'HE';
  const overrides = state.settings?.holidayOverrides;

  const entries = state.entries
    .filter(e => e.employerId === employerId && e.date.startsWith(ym))
    .sort((a, b) => a.date.localeCompare(b.date));

  const workEntries = entries.filter(e => e.type === 'work');
  const homeofficeEntries = entries.filter(e => e.type === 'homeoffice');
  const vacationEntries = entries.filter(e => e.type === 'vacation');
  const sickEntries = entries.filter(e => e.type === 'sick');
  const overtimeReductionEntries = entries.filter(e => e.type === 'overtime_reduction');
  // 'off_day' ("Kein Arbeitstag", seit v3.9.47): kein Urlaub/Krank/Abbau, sondern ein Tag, der
  // laut Vertrag/Schema ohnehin nicht gearbeitet wird (z.B. bei unregelmaessigen Wochenmodellen).
  // Wird komplett aus dem Soll herausgenommen (siehe mergeOffDayDates in computeMonthTargetMinutes
  // / computeDayTargetMinutes / countWorkdaysInMonth) statt wie Urlaub/Krank gutgeschrieben zu werden.
  const offDayEntries = entries.filter(e => e.type === 'off_day');
  const offDayDates = new Set(offDayEntries.map(e => e.date));
  const innerCtx = { stateCode, holidayOverrides: overrides, offDayDates };

  const workedMin = workEntries.reduce((s, e) => s + computeWorkMinutes(e), 0)
    + homeofficeEntries.reduce((s, e) => s + computeHomeofficeMinutes(e), 0);
  const homeofficeMin = homeofficeEntries.reduce((s, e) => s + computeHomeofficeMinutes(e), 0);
  const targetMin = computeMonthTargetMinutes(emp, ym, innerCtx);
  const workdays = countWorkdaysInMonth(ym, emp, innerCtx);
  // Berechnungsregel Urlaub/Krank/Überstundenabbau.
  //
  // Formel (seit v3.9.45 tagesgenau bei hoursMode='week'):
  //   hoursMode='week' (Default): Gutschrift = echtes Tages-Soll aus dem individuellen
  //     Wochenschema (employer.schedule bzw. defaultSchedule) für den jeweiligen Wochentag
  //     des Abwesenheitseintrags — siehe computeDayTargetMinutes().
  //   hoursMode='month':          perWorkdayMin = monthlyHours × 60 / Werktage Mo–Fr im Monat
  //     (unverändert — es gibt im Monatsmodus kein individuelles Tagesschema).
  //   Gutschrift an Sa/So/Feiertag = 0
  //
  // Rechtlicher Kontext (§ 3 EntgFG, Grundsatz "Krank wie gearbeitet"):
  //   - Fall 1 (feste Zeiten Mo–Fr gleichmäßig): ABGEDECKT.
  //   - Fall 2 (Schichtdienst mit Tagesplan):     ABGEDECKT bei hoursMode='week' mit individuellem
  //     Wochenschema (jeder Wochentag bekommt sein eigenes, echtes Tages-Soll gutgeschrieben).
  //   - Fall 3 (unregelmäßig / Gleitzeit):        ABGEDECKT — tagesgenau statt Durchschnitt.
  //   - Konzentrierte Teilzeit (z.B. nur Di/Mi/Do aktiv): ABGEDECKT bei hoursMode='week',
  //     sofern die inaktiven Tage im Wochenschema als nicht aktiviert hinterlegt sind
  //     (dann liefert computeDayTargetMinutes für Mo/Fr korrekt 0).
  //   - hoursMode='month' ohne Wochenschema: weiterhin NICHT tagesgenau (Durchschnitt).
  //
  // Details: docs/ARCHITECTURE.md → "Berechnungsregel Urlaub/Krank".
  const monthHolidays = new Set(getHolidaysInRange(`${ym}-01`, `${ym}-31`, stateCode, overrides).map(h => h.date));
  const monthWorkdayDates = monthDates(ym).filter(d => dayOfWeekISO(d) < 5 && !monthHolidays.has(d));
  const isWeekModeCredit = emp.hoursMode === 'week' || (!emp.hoursMode && !emp.monthlyHours);
  const perWorkdayMin = (() => {
    if (isWeekModeCredit) {
      return Math.round(((Number(emp.weeklyHours) || 0) * 60) / 5);
    }
    // hoursMode='month'
    if (monthWorkdayDates.length === 0) return 0;
    return Math.round(((Number(emp.monthlyHours) || 0) * 60) / monthWorkdayDates.length);
  })();
  const dailyTargetMin = perWorkdayMin; // für Rückwärtskompatibilität im Report (Durchschnitt, siehe oben)
  const isCreditableAbsenceDate = (dateISO) => {
    const dow = dayOfWeekISO(dateISO);
    if (dow > 4) return false; // Sa/So
    if (monthHolidays.has(dateISO)) return false; // Feiertag
    return true;
  };
  // Tagesgenaue Summe für hoursMode='week' (via computeDayTargetMinutes), sonst weiterhin
  // der bisherige Durchschnitt (perWorkdayMin) pro kreditierbarem Tag.
  const sumCreditedAbsenceMin = (arr) => arr.reduce((sum, e) => {
    if (!isCreditableAbsenceDate(e.date)) return sum;
    if (isWeekModeCredit) return sum + computeDayTargetMinutes(emp, e.date, innerCtx);
    return sum + perWorkdayMin;
  }, 0);
  // Gleitzeit-Überstundenabbau (seit v3.9.46): ANDERS als Urlaub/Krank NICHT gutgeschrieben.
  // Urlaub/Krank sind gesetzlich als "wie gearbeitet" zu vergüten (§ 3 EntgFG) und dürfen den
  // Saldo nicht belasten. Ein Überstundenabbau-Tag ("Gleittag") hat den GEGENTEILIGEN Zweck:
  // er soll ein zuvor aufgebautes Zeitguthaben tatsächlich verbrauchen. Ist(0) an diesem Tag
  // bleibt daher bewusst ungedeckt gegen das Tages-Soll, wodurch der Saldo um genau diesen
  // Betrag sinkt — das ist der eigentliche "Abbau". overtime_reduction zählt weiterhin bewusst
  // NICHT in computeVacationRemaining/computeYearlyVacationPlanning, da es kein Urlaubstag ist
  // und den Urlaubsanspruch nicht mindert.
  const creditedAbsenceMin = sumCreditedAbsenceMin(vacationEntries)
    + sumCreditedAbsenceMin(sickEntries);
  const balance = workedMin + creditedAbsenceMin - targetMin;

  const overtimeEntries = workEntries.filter(e => e.overtimeReason);
  const holidays = getHolidaysInRange(`${ym}-01`, `${ym}-31`, stateCode, overrides);
  const vacationRemaining = computeVacationRemaining(emp, ym, state.entries);

  return {
    employer: emp, ym, entries, workEntries, homeofficeEntries, vacationEntries, sickEntries, overtimeReductionEntries, offDayEntries, overtimeEntries,
    workedMin, homeofficeMin, targetMin, creditedAbsenceMin, balance, dailyTargetMin, holidays, workdays,
    vacationRemaining,
  };
}

/**
 * Monatsuebersicht ueber alle Arbeitgeber.
 * @param {string} ym
 * @param {AZComputeCtx} [ctx] muss ctx.state enthalten
 * @returns {AZMonthOverview}
 */
export function computeMonthOverview(ym, ctx) {
  const state = ctx && ctx.state;
  if (!state) return { ym, rows: [], totals: { workedMin: 0, targetMin: 0, balance: 0, vacationDays: 0, sickDays: 0, overtimeReductionDays: 0, offDayDays: 0, workEntriesCount: 0 } };

  const rows = state.employers.map(emp => {
    const r = computeMonthReport(emp.id, ym, ctx);
    if (!r) return null;
    return {
      employer: emp,
      workedMin: r.workedMin,
      targetMin: r.targetMin,
      balance: r.balance,
      vacationDays: r.vacationEntries.length,
      sickDays: r.sickEntries.length,
      overtimeReductionDays: r.overtimeReductionEntries.length,
      offDayDays: r.offDayEntries.length,
      workEntriesCount: r.workEntries.length,
    };
  }).filter(Boolean);

  const totals = rows.reduce((acc, row) => ({
    workedMin: acc.workedMin + row.workedMin,
    targetMin: acc.targetMin + row.targetMin,
    balance: acc.balance + row.balance,
    vacationDays: acc.vacationDays + row.vacationDays,
    sickDays: acc.sickDays + row.sickDays,
    overtimeReductionDays: acc.overtimeReductionDays + row.overtimeReductionDays,
    offDayDays: acc.offDayDays + row.offDayDays,
    workEntriesCount: acc.workEntriesCount + row.workEntriesCount,
  }), { workedMin: 0, targetMin: 0, balance: 0, vacationDays: 0, sickDays: 0, overtimeReductionDays: 0, offDayDays: 0, workEntriesCount: 0 });

  return { ym, rows, totals };
}

/**
 * Baut die Zeilen fuer die Gleitzeitkonto-Ansicht eines Kalenderjahres (Januar-Dezember), seit
 * v3.9.48. Der kumulierte Saldo laeuft bewusst ueber Jahresgrenzen hinweg durch (kein Reset zum
 * 1.1.) und startet am fruehesten bekannten Zeitpunkt:
 *   1. employer.hiredSince (Monat), falls gesetzt — das ist die verlaessliche Quelle.
 *   2. sonst der Monat des fruehesten Eintrags dieses Arbeitgebers (fuer Alt-Arbeitgeber ohne
 *      gepflegtes "Angestellt seit").
 *   3. sonst (kein hiredSince, keine Eintraege) der 1. Januar des gewaehlten Jahres selbst.
 * Monate vor diesem Startpunkt werden weder berechnet noch als Zeile zurueckgegeben — sie waeren
 * sonst ein rechnerisches, aber unrealistisches Soll gegen ein Ist von 0 (siehe Diskussion
 * "Bis Monat sinnvoll?" in RELEASE.md / README.md).
 * @param {AZEmployer} emp
 * @param {number} year z.B. 2026
 * @param {AZComputeCtx} ctx muss ctx.state enthalten (fuer computeMonthReport)
 * @returns {{rows: Array<{ym:string, workedMin:number, targetMin:number, balance:number, cumulativeBalance:number}>, effectiveStartYm: string, hiredAfterYear: boolean}}
 */
export function computeGleitzeitkontoRows(emp, year, ctx) {
  const state = ctx && ctx.state;
  const yearStartYm = `${year}-01`;
  const yearEndYm = `${year}-12`;

  let boundaryYm = null;
  if (emp && typeof emp.hiredSince === 'string' && emp.hiredSince.length >= 7) {
    boundaryYm = emp.hiredSince.slice(0, 7);
  } else if (emp && state && Array.isArray(state.entries)) {
    for (const e of state.entries) {
      if (e.employerId !== emp.id || !e.date) continue;
      const ym = e.date.slice(0, 7);
      if (!boundaryYm || ym < boundaryYm) boundaryYm = ym;
    }
  }
  const effectiveStartYm = boundaryYm || yearStartYm;

  if (effectiveStartYm > yearEndYm) {
    // "Angestellt seit" liegt komplett nach dem gewaehlten Jahr.
    return { rows: [], effectiveStartYm, hiredAfterYear: true };
  }

  let cumulative = 0;
  let cursor = effectiveStartYm;
  const rows = [];
  while (cursor <= yearEndYm) {
    const r = computeMonthReport(emp.id, cursor, ctx);
    if (r) {
      cumulative += r.balance;
      if (cursor >= yearStartYm) {
        rows.push({ ym: cursor, workedMin: r.workedMin, targetMin: r.targetMin, balance: r.balance, cumulativeBalance: cumulative });
      }
    }
    cursor = shiftYearMonth(cursor, 1);
  }
  return { rows, effectiveStartYm, hiredAfterYear: false };
}
