// @ts-check
/**
 * modules/timer-check.js (seit v3.15.6)
 *
 * Regeln für den Dialog „Timer prüfen“. Läuft ein Timer 12 Stunden oder länger,
 * speichert „Ende“ nicht mehr sofort, sondern fragt nach dem tatsächlichen Ende.
 * Grund: Ein vergessener Präsenz-Timer über 24 Stunden wurde bisher still auf den
 * Rest unter 24 Stunden gekürzt (25 Std. ergaben 1 Std.), ein vergessener
 * Home-Office-Timer erzeugte ganze Tage 00:00–24:00.
 *
 * Reine Funktionen ohne DOM, damit sie direkt testbar sind. Soll, Ist und Saldo
 * rechnen unverändert; hier wird nur das Ende des Timers bestimmt.
 */
import { legalBreakMinutes } from './compute.js';

/** Ab dieser Laufzeit öffnet „Ende“ den Dialog (Entscheidung vom 19.11.2026). */
export const TIMER_CHECK_THRESHOLD_MIN = 12 * 60;
/** Ein Präsenz-Eintrag speichert nur Uhrzeiten und kann daher keine 24 Stunden umfassen. */
export const PRESENCE_MAX_MIN = 24 * 60;
/** Ersatz-Soll für den Vorschlag, wenn der Starttag kein Soll hat (Wochenende, Feiertag). */
const FALLBACK_TARGET_MIN = 8 * 60;

/**
 * Laufzeit in ganzen Minuten.
 * @param {string} startISO
 * @param {Date} now
 */
export function timerElapsedMinutes(startISO, now) {
  const ms = now.getTime() - new Date(startISO).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

/**
 * Muss „Ende“ den Dialog öffnen?
 * @param {string} startISO
 * @param {Date} now
 */
export function needsTimerCheck(startISO, now) {
  return timerElapsedMinutes(startISO, now) >= TIMER_CHECK_THRESHOLD_MIN;
}

/**
 * Pause, die zur Netto-Zeit passt (§ 4 ArbZG): erst nach 6 Std. 30 Min., nach 9 Std. 45 Min.
 * Gerechnet auf die Brutto-Zeit inklusive Pause, wie computeSuggestedBreak.
 * @param {number} netMin
 */
function breakForNet(netMin) {
  let b = legalBreakMinutes(netMin);
  const b2 = legalBreakMinutes(netMin + b);
  if (b2 > b) b = b2;
  return b;
}

/**
 * Vorschlag für das tatsächliche Ende.
 * - Präsenz ab 24 Std.: Beginn + Tages-Soll + passende Pause (Pause nur bei Pausenmodus
 *   „gesetzlich“/„flexibel“), höchstens jetzt.
 * - Sonst: jetzt (auf die Minute abgerundet).
 * @param {{startISO:string, type?:string, now:Date, dayTargetMin?:number, breakMode?:string}} p
 * @returns {Date}
 */
export function suggestTimerEnd(p) {
  const now = new Date(Math.floor(p.now.getTime() / 60000) * 60000);
  const elapsed = timerElapsedMinutes(p.startISO, now);
  const isPresence = p.type !== 'homeoffice';
  if (!isPresence || elapsed < PRESENCE_MAX_MIN) return now;
  const target = p.dayTargetMin && p.dayTargetMin > 0 ? Math.round(p.dayTargetMin) : FALLBACK_TARGET_MIN;
  const withBreak = p.breakMode === 'none' || p.breakMode === 'manual' ? 0 : breakForNet(target);
  const start = new Date(p.startISO);
  const end = new Date(start.getTime() + (target + withBreak) * 60000);
  return end.getTime() > now.getTime() ? now : end;
}

/**
 * Prüft das gewählte Ende. Liefert einen Fehlertext oder null.
 * @param {{startISO:string, type?:string, end:Date|null, now:Date}} p
 * @returns {string|null}
 */
export function validateTimerEnd(p) {
  if (!p.end || Number.isNaN(p.end.getTime())) return 'Bitte Datum und Uhrzeit für das Ende angeben.';
  const start = new Date(p.startISO);
  const durMin = Math.floor((p.end.getTime() - start.getTime()) / 60000);
  if (durMin < 1) return 'Das Ende muss nach dem Beginn liegen.';
  if (p.end.getTime() > p.now.getTime() + 59999) return 'Das Ende darf nicht in der Zukunft liegen.';
  if (p.type !== 'homeoffice' && durMin >= PRESENCE_MAX_MIN) {
    return 'Eine Präsenz-Schicht kann höchstens 24 Std. dauern. Bitte ein früheres Ende wählen.';
  }
  return null;
}

/**
 * „YYYY-MM-DD“ und „HH:MM“ (lokale Zeit) zu Date, sonst null.
 * @param {string} dateStr
 * @param {string} timeStr
 */
export function parseLocalDateTime(dateStr, timeStr) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  const t = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || ''));
  if (!d || !t) return null;
  const dt = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, '0');

/** @param {Date} d */
export function toDateInput(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
/** @param {Date} d */
export function toTimeInput(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }

/** @param {number} min */
export function formatHM(min) {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${pad2(m % 60)}`;
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
/** @param {Date} d */
export function formatDayDate(d) {
  return `${WD[d.getDay()]}, ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * Text „Ergebnis: …“ unter den Eingabefeldern.
 * @param {{startISO:string, type?:string, end:Date, breakMode?:string}} p
 */
export function describeTimerResult(p) {
  const start = new Date(p.startISO);
  const gross = Math.floor((p.end.getTime() - start.getTime()) / 60000);
  const sameDay = toDateInput(start) === toDateInput(p.end);
  const range = sameDay
    ? `${formatDayDate(start)}, ${toTimeInput(start)}–${toTimeInput(p.end)}`
    : `${formatDayDate(start)}, ${toTimeInput(start)} – ${formatDayDate(p.end)}, ${toTimeInput(p.end)}`;
  if (p.type === 'homeoffice') {
    const days = Math.round((new Date(toDateInput(p.end) + 'T12:00:00').getTime() - new Date(toDateInput(start) + 'T12:00:00').getTime()) / 86400000) + 1;
    return `Ergebnis: ${range} = ${formatHM(gross)} Std.${days > 1 ? `, verteilt auf ${days} Tage` : ''}`;
  }
  const brk = p.breakMode === 'none' || p.breakMode === 'manual' ? 0 : legalBreakMinutes(gross);
  const brkText = brk ? `Pause ${brk} Min., netto ${formatHM(gross - brk)} Std.` : 'ohne Pause';
  return `Ergebnis: ${range} = ${formatHM(gross)} Std., ${brkText}`;
}
