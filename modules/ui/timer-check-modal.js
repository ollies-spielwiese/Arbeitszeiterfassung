// @ts-check
/**
 * modules/ui/timer-check-modal.js (seit v3.15.6)
 *
 * Dialog „Timer prüfen“: erscheint, wenn „Ende“ bei einem Timer mit 12 Stunden oder mehr
 * Laufzeit gedrückt wird. Man wählt das tatsächliche Ende oder lässt den Timer weiterlaufen.
 * Die Regeln stehen in modules/timer-check.js, gespeichert wird über den Rückruf
 * (endWork mit festem Ende), damit es nur einen Speicherweg gibt.
 */
import { toAppContext } from '../app-context.js';
import {
  suggestTimerEnd, validateTimerEnd, parseLocalDateTime, describeTimerResult,
  timerElapsedMinutes, toDateInput, toTimeInput, formatHM, formatDayDate, PRESENCE_MAX_MIN,
} from '../timer-check.js';

/** @param {string} id */
const el = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @param {any} ctx
 * @param {(endDate: Date) => void} onSave
 * @param {Date} [now]
 */
export function openTimerCheckModal(ctx, onSave, now) {
  const cx = toAppContext(ctx);
  const st = cx.state.get();
  const r = st.runningTimer;
  if (!r) return;
  const modal = el('modal-timer-check');
  if (!modal) return;
  const at = now || new Date();
  const emp = cx.data.employer(r.employerId);
  const start = new Date(r.startISO);
  const type = r.type === 'homeoffice' ? 'homeoffice' : 'work';
  const elapsed = timerElapsedMinutes(r.startISO, at);
  const dayTargetMin = emp ? Number(cx.compute.dayTargetMinutes(emp, toDateInput(start))) || 0 : 0;
  const suggestion = suggestTimerEnd({ startISO: r.startISO, type, now: at, dayTargetMin, breakMode: emp?.breakMode });

  const tooLong = type === 'work' && elapsed >= PRESENCE_MAX_MIN;
  const empName = emp ? `, ${emp.name}` : '';
  const msg = el('timer-check-message');
  msg.textContent = '';
  msg.append('Der Timer läuft seit ');
  const b = document.createElement('b');
  b.textContent = `${formatHM(elapsed)} Std.`;
  msg.append(b);
  msg.append(` (Beginn ${formatDayDate(start)}, ${toTimeInput(start)}${empName}). `
    + (tooLong ? 'Eine Präsenz-Schicht kann höchstens 24 Std. dauern.' : 'Stimmt das Ende?'));

  const dateInput = /** @type {HTMLInputElement} */ (el('timer-check-date'));
  const timeInput = /** @type {HTMLInputElement} */ (el('timer-check-time'));
  dateInput.value = toDateInput(suggestion);
  timeInput.value = toTimeInput(suggestion);
  dateInput.min = toDateInput(start);
  dateInput.max = toDateInput(at);

  const result = el('timer-check-result');
  const error = el('timer-check-error');
  const update = () => {
    const end = parseLocalDateTime(dateInput.value, timeInput.value);
    const err = validateTimerEnd({ startISO: r.startISO, type, end, now: new Date() });
    error.textContent = err || '';
    error.classList.toggle('hidden', !err);
    result.textContent = !err && end ? describeTimerResult({ startISO: r.startISO, type, end, breakMode: emp?.breakMode }) : '';
    return err ? null : end;
  };
  dateInput.oninput = update;
  timeInput.oninput = update;
  update();

  const saveBtn = el('btn-timer-check-save');
  saveBtn.onclick = () => {
    const end = update();
    if (!end) return;
    modal.classList.add('hidden');
    onSave(end);
  };
  modal.classList.remove('hidden');
  try { timeInput.focus(); } catch (e) { /* ohne Fokus weiter */ }
}
