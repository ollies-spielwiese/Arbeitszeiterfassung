// modules/ui/employer-modal.js
// Arbeitgeber-Modal (Anlegen/Bearbeiten/Löschen inkl. Wochenplan-Grid).
// Reine Funktionen mit ctx-DI - kein Modul-State, keine globalen Referenzen.
//
// ctx = {
//   getState,               // liefert state (employers, entries, activeEmployerId, runningTimer, settings)
//   saveState,
//   getEmployer,
//   defaultSchedule,        // (weeklyHours) => schedule (aus modules/compute.js via app.js-Wrapper)
//   L,                      // Localization-Lookup L(key)
//   isFreelance,
//   uid,
//   closeModals,
//   renderEmployers,
//   renderTracker,
//   toast,
// }

import { DAY_KEYS, DAY_LABELS } from '../compute.js';

export function buildScheduleGrid(schedule) {
  const container = document.getElementById('schedule-grid');
  container.innerHTML = DAY_KEYS.map((k, i) => {
    const s = schedule[k] || { enabled: false, start: '', end: '', break: 0 };
    return `
      <div class="schedule-day" data-day="${k}">
        <div class="day-label">
          <label style="display:flex;align-items:center;gap:0.35rem;font-weight:600;">
            <input type="checkbox" class="day-toggle" ${s.enabled ? 'checked' : ''} />
            ${DAY_LABELS[i]}
          </label>
        </div>
        <input type="time" class="day-start" value="${s.start || ''}" ${s.enabled ? '' : 'disabled'} />
        <input type="time" class="day-end" value="${s.end || ''}" ${s.enabled ? '' : 'disabled'} />
        <input type="number" class="day-break" min="0" value="${s.break || 0}" style="width: 4rem;" placeholder="Pause" title="Pause in Minuten" ${s.enabled ? '' : 'disabled'} />
      </div>
    `;
  }).join('');

  container.querySelectorAll('.schedule-day').forEach(row => {
    const toggle = row.querySelector('.day-toggle');
    toggle.addEventListener('change', () => {
      row.querySelectorAll('input[type="time"], input[type="number"]').forEach(inp => inp.disabled = !toggle.checked);
    });
  });
}

export function readScheduleFromGrid() {
  const rows = document.querySelectorAll('#schedule-grid .schedule-day');
  const schedule = {};
  rows.forEach(row => {
    const k = row.dataset.day;
    schedule[k] = {
      enabled: row.querySelector('.day-toggle').checked,
      start: row.querySelector('.day-start').value,
      end: row.querySelector('.day-end').value,
      break: parseInt(row.querySelector('.day-break').value) || 0,
    };
  });
  return schedule;
}

export function updateHoursModeVisibility() {
  const mode = document.getElementById('employer-hours-mode').value;
  document.getElementById('row-weekly-hours').style.display = mode === 'week' ? '' : 'none';
  document.getElementById('row-monthly-hours').style.display = mode === 'month' ? '' : 'none';
}

export function openEmployerModal(emp, ctx) {
  const { getState, defaultSchedule, L, isFreelance } = ctx;
  const state = getState();
  const modal = document.getElementById('modal-employer');
  const isNew = !emp;
  document.getElementById('modal-employer-title').textContent = isNew ? L('newEmployer') : L('editEmployer');
  // Neue Employer/Kunden: Im Freelance-Modus keine Soll-Stunden vorbelegen.
  const freelanceDefault = isFreelance();
  const defWeekly = freelanceDefault ? 0 : 40;
  const defMonthly = freelanceDefault ? 0 : 160;
  const e = emp || {
    id: '', name: '', color: '#3b82f6', phone: '',
    contacts: [{ name:'', email:'' }, { name:'', email:'' }],
    hoursMode: 'week', weeklyHours: defWeekly, monthlyHours: defMonthly,
    breakMode: 'legal', annualVacation: 0, hiredSince: '', vacationCarryOver: 0,
    hourlyRate: 0, currency: (state.settings && state.settings.currency) || 'EUR',
    schedule: defaultSchedule(defWeekly),
    notes: '',
  };
  document.getElementById('employer-id').value = e.id;
  document.getElementById('employer-name').value = e.name;
  document.getElementById('employer-color').value = e.color;
  document.getElementById('employer-phone').value = e.phone || '';
  const contacts = e.contacts || [];
  document.getElementById('employer-contact1-name').value = contacts[0]?.name || '';
  document.getElementById('employer-contact1-email').value = contacts[0]?.email || '';
  document.getElementById('employer-contact2-name').value = contacts[1]?.name || '';
  document.getElementById('employer-contact2-email').value = contacts[1]?.email || '';
  document.getElementById('employer-hours-mode').value = e.hoursMode || 'week';
  // WICHTIG: Nicht `|| 40` — sonst überschreibt der Fallback einen explizit gespeicherten 0-Wert.
  document.getElementById('employer-weekly-hours').value = (e.weeklyHours != null ? e.weeklyHours : defWeekly);
  document.getElementById('employer-monthly-hours').value = (e.monthlyHours != null ? e.monthlyHours : defMonthly);
  document.getElementById('employer-break-mode').value = e.breakMode || 'legal';
  document.getElementById('employer-annual-vacation').value = e.annualVacation || 0;
  document.getElementById('employer-hired-since').value = e.hiredSince || '';
  document.getElementById('employer-vacation-carryover').value = e.vacationCarryOver || 0;
  document.getElementById('employer-notes').value = e.notes || '';
  const rateEl = document.getElementById('employer-hourly-rate');
  if (rateEl) rateEl.value = e.hourlyRate ? String(e.hourlyRate) : '';
  const curEl = document.getElementById('employer-currency');
  if (curEl) curEl.value = e.currency || (state.settings && state.settings.currency) || 'EUR';
  // Namens-Label und Abrechnungs-Sichtbarkeit dem aktuellen Modus anpassen
  const nameLbl = document.querySelector('label[for="employer-name"]');
  if (nameLbl) nameLbl.textContent = L('employerName');
  document.getElementById('fs-employer-billing').classList.toggle('hidden', !isFreelance());
  buildScheduleGrid(e.schedule || defaultSchedule(e.weeklyHours != null ? e.weeklyHours : defWeekly));
  updateHoursModeVisibility();
  document.getElementById('btn-delete-employer').classList.toggle('hidden', isNew);
  modal.classList.remove('hidden');
}

export function saveEmployer(ev, ctx) {
  ev.preventDefault();
  const { getState, saveState, uid, closeModals, renderEmployers, renderTracker, toast } = ctx;
  const state = getState();
  const id = document.getElementById('employer-id').value;
  const data = {
    name: document.getElementById('employer-name').value.trim(),
    color: document.getElementById('employer-color').value,
    phone: document.getElementById('employer-phone').value.trim(),
    contacts: [
      {
        name: document.getElementById('employer-contact1-name').value.trim(),
        email: document.getElementById('employer-contact1-email').value.trim(),
      },
      {
        name: document.getElementById('employer-contact2-name').value.trim(),
        email: document.getElementById('employer-contact2-email').value.trim(),
      },
    ],
    hoursMode: document.getElementById('employer-hours-mode').value,
    weeklyHours: parseFloat(document.getElementById('employer-weekly-hours').value) || 0,
    monthlyHours: parseFloat(document.getElementById('employer-monthly-hours').value) || 0,
    breakMode: document.getElementById('employer-break-mode').value,
    annualVacation: parseInt(document.getElementById('employer-annual-vacation').value) || 0,
    hiredSince: document.getElementById('employer-hired-since').value || '',
    vacationCarryOver: parseInt(document.getElementById('employer-vacation-carryover').value) || 0,
    hourlyRate: parseFloat(document.getElementById('employer-hourly-rate')?.value) || 0,
    currency: document.getElementById('employer-currency')?.value || 'EUR',
    schedule: readScheduleFromGrid(),
    notes: document.getElementById('employer-notes').value.trim(),
  };
  if (!data.name) { toast('Bitte Namen eingeben'); return; }
  if (id) {
    const idx = state.employers.findIndex(e => e.id === id);
    if (idx >= 0) state.employers[idx] = { ...state.employers[idx], ...data };
  } else {
    const newEmp = { id: uid(), ...data };
    state.employers.push(newEmp);
    if (!state.activeEmployerId) state.activeEmployerId = newEmp.id;
  }
  saveState();
  closeModals();
  renderEmployers();
  renderTracker();
  toast('Gespeichert');
}

export function deleteEmployer(ctx) {
  const { getState, saveState, getEmployer, closeModals, renderEmployers, renderTracker, toast } = ctx;
  const state = getState();
  const id = document.getElementById('employer-id').value;
  if (!id) return;
  const emp = getEmployer(id);
  const hasEntries = state.entries.some(e => e.employerId === id);
  const msg = hasEntries
    ? `„${emp.name}" hat bereits Zeiteinträge. Diese werden mit gelöscht. Fortfahren?`
    : `Arbeitgeber „${emp.name}" wirklich löschen?`;
  if (!confirm(msg)) return;
  state.employers = state.employers.filter(e => e.id !== id);
  state.entries = state.entries.filter(e => e.employerId !== id);
  if (state.activeEmployerId === id) state.activeEmployerId = state.employers[0]?.id || null;
  if (state.runningTimer?.employerId === id) state.runningTimer = null;
  saveState();
  closeModals();
  renderEmployers();
  renderTracker();
  toast('Gelöscht');
}
