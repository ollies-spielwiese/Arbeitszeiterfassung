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

import { buildRangeEntries, formatRangeEntrySummary, removeEntriesByIds } from '../range-entry.js';
import { computeVacationRemaining, computeEducationLeaveYear, filterVisibleEmployers } from '../compute.js';
import { pushAuditLog } from '../audit-log.js';
import { autoGrowTextarea } from './autogrow.js';

export function openRangeEntryModal(ctx) {
  const { getState, escapeHtml, todayISO } = ctx;
  const state = getState();
  const modal = document.getElementById('modal-range-entry');
  const form = document.getElementById('form-range-entry');
  if (!modal || !form) return;

  // Seit v3.9.55: Zeitraum-Erfassung ist stets eine NEUE Erfassung — ehemalige
  // Arbeitgeber werden hier immer ausgeblendet (keine Bearbeiten-Ausnahme).
  const visibleEmployers = filterVisibleEmployers(state.employers, todayISO());
  const empSel = document.getElementById('range-employer');
  empSel.innerHTML = visibleEmployers.map((e) =>
    `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)}</option>`).join('');
  const activeIsVisible = visibleEmployers.some((e) => e.id === state.activeEmployerId);
  empSel.value = (activeIsVisible ? state.activeEmployerId : '') || (visibleEmployers[0] && visibleEmployers[0].id) || '';

  document.getElementById('range-type').value = 'vacation';
  document.getElementById('range-start').value = '';
  document.getElementById('range-end').value = '';
  document.getElementById('range-skip-weekends-holidays').checked = true;
  document.getElementById('range-note').value = '';

  modal.classList.remove('hidden');
  autoGrowTextarea(document.getElementById('range-note'));
  updateRangeVacationStats(ctx);
}

/**
 * Aktualisiert das Urlaubskonto-Info-Feld im Zeitraum-Modal: bereits genommene
 * Urlaubstage, geplanter Jahresanspruch (Jahresurlaub + Resturlaub Vorjahr) und
 * daraus resultierend noch nicht erfasste Urlaubstage. Nur relevant für
 * Typ=Urlaub — bei Krankheit oder fehlendem Arbeitgeber bleibt das Feld leer.
 * Jahr wird aus dem Von-Datum abgeleitet (Fallback: aktuelles Kalenderjahr),
 * Stichtag ist bewusst der 31.12., damit auch bereits erfasste künftige
 * Urlaubstage im selben Jahr mitgezählt werden (nicht nur Tage bis heute).
 */
export function updateRangeVacationStats(ctx) {
  const { escapeHtml } = ctx;
  const box = document.getElementById('range-vacation-stats');
  if (!box) return;
  const empSel = document.getElementById('range-employer');
  const typeSel = document.getElementById('range-type');
  const startInput = document.getElementById('range-start');
  const employerId = empSel && empSel.value;
  const type = typeSel && typeSel.value;

  if (type === 'education_leave' && employerId) {
    renderEducationLeaveStats(box, ctx, employerId, startInput && startInput.value);
    return;
  }

  if (type !== 'vacation' || !employerId) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }

  const state = ctx.getState();
  const emp = (state.employers || []).find((e) => e.id === employerId);
  if (!emp) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }

  const startVal = startInput && startInput.value;
  const year = (startVal && startVal.length >= 4) ? startVal.slice(0, 4) : String(new Date().getFullYear());
  const vr = computeVacationRemaining(emp, `${year}-12`, state.entries || []);
  const planned = vr.annual + vr.carryOver;

  box.hidden = false;
  box.innerHTML =
    `<div class="range-vacation-stats-line">Bereits genommen: <strong>${escapeHtml(String(vr.taken))}</strong> Tage · ` +
    `Urlaubsanspruch: <strong>${escapeHtml(String(planned))}</strong> Tage · ` +
    `Noch nicht erfasst: <strong>${escapeHtml(String(vr.remaining))}</strong> Tage</div>` +
    `<div class="range-vacation-stats-hint">Urlaubsjahr ${escapeHtml(String(year))}` +
    `${vr.prorated ? ' · anteilig' : ''}` +
    `${vr.carryOver ? ` · davon ${escapeHtml(String(vr.carryOver))} Tage Resturlaub Vorjahr` : ''}</div>`;
}

/**
 * Kontingent-Anzeige für Bildungsurlaub im Zeitraum-Dialog (seit v3.9.97): Anspruch des Jahres,
 * bereits erfasste Tage und Vorschau nach dem Anlegen (über buildRangeEntries, ohne State-Mutation).
 * @param {HTMLElement} box
 * @param {any} ctx
 * @param {string} employerId
 * @param {string} startVal
 */
function renderEducationLeaveStats(box, ctx, employerId, startVal) {
  const { escapeHtml } = ctx;
  const state = ctx.getState();
  const emp = (state.employers || []).find((x) => x.id === employerId);
  if (!emp) { box.hidden = true; box.innerHTML = ''; return; }
  const year = (startVal && startVal.length >= 4) ? startVal.slice(0, 4) : String(new Date().getFullYear());
  const el = computeEducationLeaveYear(emp, year, state.entries || [], typeof ctx.todayISO === 'function' ? ctx.todayISO() : todayISOLocal());
  const endEl = /** @type {HTMLInputElement|null} */ (document.getElementById('range-end'));
  const skipEl = /** @type {HTMLInputElement|null} */ (document.getElementById('range-skip-weekends-holidays'));
  const endVal = endEl ? endEl.value : '';
  let after = null;
  if (startVal && endVal && endVal >= startVal) {
    const preview = buildRangeEntries({
      startISO: startVal, endISO: endVal, employerId, type: 'education_leave',
      skipWeekendsHolidays: skipEl ? skipEl.checked : true,
      stateCode: state.settings?.state, holidayOverrides: state.settings?.holidayOverrides,
      existingEntries: state.entries || [], uid: () => 'preview',
    });
    after = el.total + preview.toCreate.filter((x) => x.date.startsWith(year)).length;
  }
  const s = (n) => escapeHtml(String(n));
  let html = `<div class="range-vacation-stats-line">Bildungsurlaub ${s(year)}: Anspruch <strong>${s(el.entitlement)}</strong> Tage · ` +
    `bereits erfasst: <strong>${s(el.total)}</strong> Tage` +
    (after !== null ? ` · nach diesem Eintrag: <strong>${s(after)} von ${s(el.entitlement)}</strong> Tagen` : '') + `</div>`;
  const hints = ['Bezahlte Freistellung (HBUG): das Tages-Soll wird gutgeschrieben, der Urlaubsanspruch bleibt unberührt.'];
  if (el.notEligible) hints.push(`Wartezeit: Anspruch erst ab ${s(el.eligibleFrom ? el.eligibleFrom.split('-').reverse().join('.') : '')}.`);
  if (after !== null && after > el.entitlement) hints.push('Achtung: Das Kontingent wird überschritten.');
  html += `<div class="range-vacation-stats-hint">${hints.join(' ')}</div>`;
  box.hidden = false;
  box.innerHTML = html;
}

function todayISOLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  const summary = formatRangeEntrySummary(result, type);

  if (result.toCreate.length) {
    const createdIds = result.toCreate.map((en) => en.id);
    state.entries.push(...result.toCreate);
    result.toCreate.forEach((en) => pushAuditLog(state, { action: 'create', entry: en, summary: 'Zeitraum-Erfassung', uid }));
    saveState();

    closeModals();
    renderTracker();
    renderEntries();
    if (typeof ctx.refreshAll === 'function') ctx.refreshAll();

    // Undo (Option B, Phase 4.9b): entfernt genau die soeben angelegten Entries wieder,
    // ohne dass der Nutzer jeden Tag einzeln löschen muss. Reine Logik in removeEntriesByIds().
    toast(summary, {
      actionLabel: 'Rückgängig',
      onAction: () => {
        const s = getState();
        const toRemove = s.entries.filter((en) => createdIds.includes(en.id));
        s.entries = removeEntriesByIds(s.entries, createdIds);
        toRemove.forEach((en) => pushAuditLog(s, { action: 'delete', entry: en, summary: 'Rückgängig (Zeitraum-Erfassung)', uid }));
        saveState();
        renderTracker();
        renderEntries();
        if (typeof ctx.refreshAll === 'function') ctx.refreshAll();
        toast('Rückgängig gemacht');
      },
    });
    return;
  }

  closeModals();
  renderTracker();
  renderEntries();
  if (typeof ctx.refreshAll === 'function') ctx.refreshAll();
  toast(summary);
}
