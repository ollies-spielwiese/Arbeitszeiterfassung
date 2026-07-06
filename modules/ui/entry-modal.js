// modules/ui/entry-modal.js
// Entry-Modal (Zeit erfassen/bearbeiten).
// Reine Funktionen mit ctx-DI - kein Modul-State, keine globalen Referenzen.
// Phase 4.8 — openEntryModal nutzt computeFormFields aus selectors.js;
// die Modal-Funktion ist reiner Renderer der Feld-Definitionen.
//
// ctx = {
//   getState,                 // liefert state (fuer employers, entries, activeEmployerId)
//   saveState,
//   getEmployer,
//   todayISO,
//   dayOfWeekISO,
//   DAY_KEYS,
//   DAY_LABELS_LONG,
//   escapeHtml,
//   populateTemplatePicker,
//   computeSuggestedBreak,
//   computeFormFields,        // Phase 4.8 — Selector fuer Feld-Definitionen
//   renderTracker,
//   renderEntries,
//   toast,
//   closeModals,
//   uid,
// }

export function openEntryModal(entry, opts, ctx) {
  opts = opts || {};
  const { escapeHtml, populateTemplatePicker, computeFormFields } = ctx;
  const modal = document.getElementById('modal-entry');
  const form = document.getElementById('form-entry');

  const fields = computeFormFields(entry, opts);

  document.getElementById('modal-entry-title').textContent = fields.title;

  const empSel = document.getElementById('entry-employer');
  empSel.innerHTML = fields.employerOptions.map((e) =>
    `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');

  const v = fields.values;
  form.querySelector('#entry-id').value = v.id;
  empSel.value = v.employerId || '';
  form.querySelector('#entry-date').value = v.date;
  form.querySelector('#entry-type').value = v.type;
  form.querySelector('#entry-start').value = v.start;
  form.querySelector('#entry-end').value = v.end;
  form.querySelector('#entry-break').value = v.breakMinutes;
  form.querySelector('#entry-overtime-reason').value = v.overtimeReason;
  form.querySelector('#entry-note').value = v.note;

  document.getElementById('btn-delete-entry').classList.toggle('hidden', !fields.showDeleteButton);

  populateTemplatePicker('entry-overtime-tpl');
  populateTemplatePicker('entry-note-tpl');
  updateEntryTypeFields();
  updateBreakHint(ctx);
  updateScheduleFillVisibility(ctx);

  modal.classList.remove('hidden');
}

export function updateScheduleFillVisibility(ctx) {
  const { getEmployer, DAY_KEYS, DAY_LABELS_LONG, dayOfWeekISO } = ctx;
  const empId = document.getElementById('entry-employer').value;
  const emp = getEmployer(empId);
  const dateVal = document.getElementById('entry-date').value;
  const type = document.getElementById('entry-type').value;
  const row = document.getElementById('schedule-fill-row');
  if (!row) return;
  if (type !== 'work' || !emp || !dateVal || !emp.schedule) { row.classList.add('hidden'); return; }
  const key = DAY_KEYS[dayOfWeekISO(dateVal)];
  const day = emp.schedule[key];
  if (day?.enabled && day.start && day.end) {
    row.classList.remove('hidden');
    const btn = document.getElementById('btn-apply-schedule');
    btn.textContent = `📅 Vorschlag: ${DAY_LABELS_LONG[DAY_KEYS.indexOf(key)]} ${day.start}–${day.end}${day.break ? ` (${day.break} Min Pause)` : ''}`;
  } else {
    row.classList.add('hidden');
  }
}

export function applyScheduleToEntry(ctx) {
  const { getEmployer, DAY_KEYS, dayOfWeekISO, toast } = ctx;
  const empId = document.getElementById('entry-employer').value;
  const emp = getEmployer(empId);
  const dateVal = document.getElementById('entry-date').value;
  if (!emp || !emp.schedule || !dateVal) return;
  const key = DAY_KEYS[dayOfWeekISO(dateVal)];
  const day = emp.schedule[key];
  if (!day?.enabled || !day.start || !day.end) return;
  document.getElementById('entry-start').value = day.start;
  document.getElementById('entry-end').value = day.end;
  document.getElementById('entry-break').value = day.break || 0;
  updateBreakHint(ctx);
  toast('Wochenschema übernommen');
}

export function updateEntryTypeFields() {
  const type = document.getElementById('entry-type').value;
  document.getElementById('work-fields').style.display = type === 'work' ? 'block' : 'none';
}

export function updateBreakHint(ctx) {
  const { getEmployer, computeSuggestedBreak } = ctx;
  const empId = document.getElementById('entry-employer').value;
  const emp = getEmployer(empId);
  const start = document.getElementById('entry-start').value;
  const end = document.getElementById('entry-end').value;
  const hintEl = document.getElementById('break-hint');
  if (!emp || !start || !end) { hintEl.textContent = ''; return; }
  const suggested = computeSuggestedBreak(start, end, emp.breakMode);
  const labels = { legal: 'Gesetzlich', flex: 'Gleitzeit', manual: 'Manuell', none: 'Ohne Pause' };
  const modeLabel = labels[emp.breakMode] || '';
  if (emp.breakMode === 'none') {
    hintEl.textContent = `Modell: ${modeLabel}`;
  } else if (suggested !== null && suggested > 0) {
    hintEl.textContent = `Modell ${modeLabel} • Empfehlung: ${suggested} Min`;
  } else {
    hintEl.textContent = `Modell: ${modeLabel}`;
  }
}

export function saveEntry(e, ctx) {
  const { getState, saveState, closeModals, renderTracker, renderEntries, toast, uid } = ctx;
  e.preventDefault();
  const state = getState();
  const id = document.getElementById('entry-id').value;
  const type = document.getElementById('entry-type').value;
  const employerId = document.getElementById('entry-employer').value;
  const date = document.getElementById('entry-date').value;

  if (!employerId) { toast('Bitte Arbeitgeber wählen'); return; }
  if (!date) { toast('Bitte Datum wählen'); return; }

  const entryData = {
    employerId,
    date,
    type,
    start: type === 'work' ? document.getElementById('entry-start').value : '',
    end: type === 'work' ? document.getElementById('entry-end').value : '',
    breakMinutes: type === 'work' ? (parseInt(document.getElementById('entry-break').value) || 0) : 0,
    overtimeReason: type === 'work' ? document.getElementById('entry-overtime-reason').value.trim() : '',
    note: document.getElementById('entry-note').value.trim(),
  };

  if (type === 'work' && (!entryData.start || !entryData.end)) {
    toast('Bitte Beginn und Ende angeben');
    return;
  }

  if (id) {
    const idx = state.entries.findIndex(x => x.id === id);
    if (idx >= 0) state.entries[idx] = { ...state.entries[idx], ...entryData };
  } else {
    state.entries.push({ id: uid(), createdAt: new Date().toISOString(), ...entryData });
  }
  saveState();
  closeModals();
  renderTracker();
  renderEntries();
  toast('Gespeichert');
}

export function deleteEntry(ctx) {
  const { getState, saveState, closeModals, renderTracker, renderEntries, toast } = ctx;
  const state = getState();
  const id = document.getElementById('entry-id').value;
  if (!id) return;
  if (!confirm('Diesen Eintrag wirklich löschen?')) return;
  state.entries = state.entries.filter(e => e.id !== id);
  saveState();
  closeModals();
  renderTracker();
  renderEntries();
  toast('Gelöscht');
}
