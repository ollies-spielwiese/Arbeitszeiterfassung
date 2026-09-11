/**
 * @file modules/range-entry.js
 * @description Reine Logik für die Bulk-Erfassung von Abwesenheits-Einträgen
 * (Urlaub/Krankheit) über einen Zeitraum "Von … bis …" (Option B, Phase 4.9).
 *
 * Reines Modul: kein DOM-Zugriff, kein State-Write. Nimmt die benötigten
 * State-Ausschnitte als Parameter und liefert die zu erzeugenden Entries
 * plus eine Zusammenfassung zurück — der Aufrufer (UI-Layer) übernimmt
 * das tatsächliche `state.entries.push(...)` + `saveState()`.
 *
 * compute/*-Grenze (siehe docs/ARCHITECTURE.md): dieses Modul importiert
 * ausschließlich aus util-time.js und holidays.js, nie aus render/* oder ui/*.
 *
 * @typedef {import('../types.js').AZEntry} AZEntry
 */

import { isoDateAdd, dayOfWeekISO } from './util-time.js';
import { isHoliday } from './holidays.js';

/**
 * @typedef {object} AZRangeEntryResult
 * @property {AZEntry[]} toCreate - neu anzulegende Entries (noch ohne Persistenz).
 * @property {number} totalDays - Anzahl Kalendertage im Zeitraum (inklusiv).
 * @property {number} created - Anzahl tatsächlich zu erzeugender Entries (== toCreate.length).
 * @property {number} skippedWeekend - übersprungene Tage wegen Wochenende.
 * @property {number} skippedHoliday - übersprungene Tage wegen Feiertag.
 * @property {number} skippedExisting - übersprungene Tage, weil bereits ein Entry existiert.
 */

/**
 * Berechnet die anzulegenden Entries für einen Datumsbereich, ohne den State zu mutieren.
 *
 * @param {object} params
 * @param {string} params.startISO 'YYYY-MM-DD'
 * @param {string} params.endISO 'YYYY-MM-DD' (inklusiv, >= startISO)
 * @param {string} params.employerId
 * @param {'vacation'|'sick'|'overtime_reduction'|'off_day'} params.type
 * @param {string} [params.note]
 * @param {boolean} [params.skipWeekendsHolidays] Default true.
 * @param {string} params.stateCode Bundesland-Code, z. B. 'HE' (für Feiertagsprüfung).
 * @param {import('./holidays.js').AZHolidayOverrides} [params.holidayOverrides]
 * @param {AZEntry[]} [params.existingEntries] state.entries — wird nach employerId+date geprüft.
 * @param {() => string} params.uid Id-Generator (aus ctx, wie bei saveEntry).
 * @returns {AZRangeEntryResult}
 */
export function buildRangeEntries(params) {
  const {
    startISO, endISO, employerId, type,
    note = '', skipWeekendsHolidays = true,
    stateCode, holidayOverrides,
    existingEntries = [], uid,
  } = params || {};

  const result = { toCreate: [], totalDays: 0, created: 0, skippedWeekend: 0, skippedHoliday: 0, skippedExisting: 0 };

  if (!startISO || !endISO || !employerId || !(type === 'vacation' || type === 'sick' || type === 'overtime_reduction' || type === 'off_day')) return result;
  if (endISO < startISO) return result;

  const existingDates = new Set(
    existingEntries.filter(e => e && e.employerId === employerId).map(e => e.date)
  );

  let cursor = startISO;
  // Obergrenze gegen versehentliche Endlos-/Riesenbereiche (10 Jahre reichen für jeden realistischen Anwendungsfall).
  let guard = 0;
  const GUARD_MAX = 3660;

  while (cursor <= endISO && guard < GUARD_MAX) {
    guard++;
    result.totalDays++;

    const dow = dayOfWeekISO(cursor); // 0=Montag ... 6=Sonntag
    const isWeekend = dow === 5 || dow === 6;
    const holiday = skipWeekendsHolidays ? isHoliday(cursor, stateCode, holidayOverrides) : null;

    if (skipWeekendsHolidays && isWeekend) {
      result.skippedWeekend++;
    } else if (skipWeekendsHolidays && holiday) {
      result.skippedHoliday++;
    } else if (existingDates.has(cursor)) {
      result.skippedExisting++;
    } else {
      result.toCreate.push({
        id: typeof uid === 'function' ? uid() : `range-${cursor}-${Math.random().toString(36).slice(2)}`,
        employerId,
        date: cursor,
        type,
        note,
        createdAt: new Date().toISOString(),
      });
      // Verhindert Duplikate innerhalb desselben Laufs (z. B. falls ein Aufrufer den Bereich doppelt füttert).
      existingDates.add(cursor);
    }

    cursor = isoDateAdd(cursor, 1);
  }

  result.created = result.toCreate.length;
  return result;
}

/**
 * Baut die Zusammenfassungs-Toast-Nachricht aus einem AZRangeEntryResult.
 * @param {AZRangeEntryResult} r
 * @param {'vacation'|'sick'|'overtime_reduction'|'off_day'} type
 * @returns {string}
 */
export function formatRangeEntrySummary(r, type) {
  const LABELS = {
    vacation: ['Urlaubstag', 'Urlaubstage'],
    sick: ['Krankheitstag', 'Krankheitstage'],
    overtime_reduction: ['Überstundenabbau-Tag', 'Überstundenabbau-Tage'],
    off_day: ['Freier Tag', 'Freie Tage'],
  };
  const [label, labelPlural] = LABELS[type] || LABELS.vacation;
  const n = r.created;
  const parts = [`${n} ${n === 1 ? label : labelPlural} angelegt`];
  const skipParts = [];
  if (r.skippedWeekend || r.skippedHoliday) {
    const wh = r.skippedWeekend + r.skippedHoliday;
    skipParts.push(`${wh} Tag${wh === 1 ? '' : 'e'} übersprungen (Wochenende/Feiertag)`);
  }
  if (r.skippedExisting) {
    skipParts.push(`${r.skippedExisting} Tag${r.skippedExisting === 1 ? '' : 'e'} übersprungen (bereits belegt)`);
  }
  if (skipParts.length) parts.push(skipParts.join(', '));
  return parts.join(', ');
}

/**
 * Entfernt Entries mit den angegebenen ids aus einer Entry-Liste (reine Funktion, mutiert das
 * Eingabe-Array nicht). Grundlage für die "Rückgängig"-Aktion nach einer Zeitraum-Erfassung
 * (Option B, Phase 4.9b) — der Aufrufer (UI-Layer) übergibt die ids der zuvor per
 * buildRangeEntries() erzeugten Entries und schreibt das Ergebnis zurück nach state.entries.
 * @param {AZEntry[]} entries
 * @param {string[]} ids
 * @returns {AZEntry[]}
 */
export function removeEntriesByIds(entries, ids) {
  if (!Array.isArray(entries) || !Array.isArray(ids) || !ids.length) return entries;
  const idSet = new Set(ids);
  return entries.filter(e => !idSet.has(e.id));
}
