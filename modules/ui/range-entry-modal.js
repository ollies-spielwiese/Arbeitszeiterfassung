// modules/ui/range-entry-modal.js
// Range-Entry-Modal ("Zeitraum erfassen" — Option B, Phase 4.9).
// Reine Funktionen mit ctx-DI - kein Modul-State, keine globalen Referenzen.
// Delegiert die eigentliche Tages-Iteration an modules/range-entry.js (reine Logik,
// separat regressionsgetestet) und übernimmt hier nur DOM-Lesen/-Schreiben + Persistenz,
// analog zu modules/ui/entry-modal.js.
//
// ctx = {
//   getState,                 // liefert state (fuer employers, entries, activeEmployerId, settings)
//   saveState,
//   escapeHtml,
//   renderTracker,
//   renderEntries,
//   refreshAll,
//   toast,
//   closeModals,
//   uid,
// }

import { buildRangeEntries, formatRangeEntrySummary } from '../range-entry.js';

export function openRangeEntryModal(ctx) {
  const { getState, escapeHtml } = ctx;
  const state = getState();
  const modal = document.getElementById('modal-range-entry');
  const form = document.getElementById('form-range-entry');
  if (!modal || !form) return;

  const empSel = document.getElementById('range-employer');
  empSel.innerHTML = state.employers.map((e) =>
    `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
  empSel.value = state.activeEmployerId || (state.employers[0] && state.employers[0].id) || '';

  document.getElementById('range-type').value = 'vacation';
  document.getElementById('range-start').value = '';
  document.getElementById('range-end').value = '';
  document.getElementById('range-skip-weekends-holidays').checked = true;
  document.getElementById('range-note').value = '';

  modal.classList.remove('hidden');
}

export function saveRangeEntry(e, ctx) {
  const { getState, saveState, closeModals, renderTracker, renderEntries, toast, uid } = ctx;
  e.preventDefault();
  const state = getState();

  const employerId = document.getElementById('range-employer').value;
  const type = document.getElementById('range-type').value;
  const startISO = document.getElementById('range-start').value;
  const endISO = document.getElementById('range-end').value;
  const skipWeekendsHolidays = document.getElementById('range-skip-weekends-holidays').checked;
  const note = document.getElementById('range-note').value.trim();

  if (!employerId) { toast('Bitte Arbeitgeber wählen'); return; }
  if (!startISO || !endISO) { toast('Bitte Von- und Bis-Datum angeben'); return; }
  if (endISO < startISO) { toast('„Bis" muss nach „Von" liegen'); return; }

  const result = buildRangeEntries({
    startISO, endISO, employerId, type, note,
    skipWeekendsHolidays,
    stateCode: state.settings?.state,
    holidayOverrides: state.settings?.holidayOverrides,
    existingEntries: state.entries,
    uid,
  });

  if (result.toCreate.length) {
    state.entries.push(...result.toCreate);
    saveState();
  }

  closeModals();
  renderTracker();
  renderEntries();
  if (typeof ctx.refreshAll === 'function') ctx.refreshAll();
  toast(formatRangeEntrySummary(result, type));
}
