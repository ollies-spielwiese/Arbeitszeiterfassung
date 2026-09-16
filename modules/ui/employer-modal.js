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
      updateScheduleFlexibleHint();
    });
  });
  updateScheduleFlexibleHint();
}

/** Blendet den Hinweis "kein festes Wochenschema" ein, sobald kein einziger Wochentag im Grid
 * aktiviert ist (seit v3.9.83). Betrifft nur die Anzeige/Aufklaerung - die Berechnung selbst
 * (siehe countWorkdaysInMonth/computeElapsedMonthProgress in compute.js) behandelt 0 aktivierte
 * Tage bei hoursMode='week' bereits als gueltigen "flexibel verteilt"-Zustand. */
function updateScheduleFlexibleHint() {
  const hintEl = document.getElementById('schedule-flexible-hint');
  if (!hintEl) return;
  const anyEnabled = !!document.querySelector('#schedule-grid .day-toggle:checked');
  hintEl.hidden = anyEnabled;
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
  const yearlyRow = document.getElementById('row-yearly-hours');
  if (yearlyRow) yearlyRow.style.display = mode === 'year' ? '' : 'none';
}

/* ---------- Arbeitszeitmodell (Beschäftigungsart / Arbeitszeitorganisation, Phase 3.9.72) ----------
 * Beschäftigungsart (employmentScope) und Arbeitszeitorganisation (workTimeModel) sind rein
 * beschreibende/klassifizierende Felder — sie ändern NICHT die Soll-Stunden-Berechnung in
 * compute.js. Die einzige aktive Verknüpfung: der Beschäftigungsgrad (%) kann bequemerweise die
 * „Sollstunden / Woche" vorausfüllen, aber NUR wenn Beschäftigungsart=Teilzeit UND
 * Sollstunden-Eingabe=„Pro Woche" ist. In allen anderen Kombinationen (Minijob/Midijob, oder
 * Sollstunden-Eingabe=Monat/Jahr) ist der Prozentsatz ein rein informatives, manuell gepflegtes
 * Feld — Vermeidung von unklaren impliziten Umrechnungen bei Monats-/Jahreswerten.
 */

export const EMPLOYMENT_SCOPE_LABELS = {
  vollzeit: 'Vollzeit',
  teilzeit: 'Teilzeit',
  minijob: 'Minijob',
  midijob: 'Midijob',
};

export const WORKTIME_MODEL_LABELS = {
  klassisch: 'Klassisch',
  gleitzeit: 'Gleitzeit',
  vertrauensarbeitszeit: 'Vertrauensarbeitszeit',
  jahresarbeitszeit: 'Jahresarbeitszeit',
  vier_tage_woche: 'Vier-Tage-Woche',
  schichtarbeit: 'Schichtarbeit',
  jobsharing: 'Jobsharing',
  arbeit_auf_abruf: 'Arbeit auf Abruf (KAPOVAZ)',
};

/** Baut die kombinierte Anzeige-Bezeichnung, z. B. "Teilzeit, 60 % · Gleitzeit". Exportiert,
 * damit Export-Module (PDF/Word/CSV) dieselbe Formatierung ohne Duplikation nutzen können. */
export function formatEmploymentModelSummary(employer) {
  if (!employer) return '';
  const scope = employer.employmentScope || 'vollzeit';
  const model = employer.workTimeModel || 'klassisch';
  const scopeLabel = EMPLOYMENT_SCOPE_LABELS[scope] || scope;
  const modelLabel = WORKTIME_MODEL_LABELS[model] || model;
  let text = scopeLabel;
  if (scope === 'teilzeit' && employer.parttimePercent) {
    text += `, ${employer.parttimePercent} %`;
  }
  text += ` · ${modelLabel}`;
  return text;
}

function _readEmploymentModelFormState() {
  return {
    scope: document.getElementById('employer-employment-scope').value,
    model: document.getElementById('employer-worktime-model').value,
    hoursMode: document.getElementById('employer-hours-mode').value,
    percent: parseFloat(document.getElementById('employer-parttime-percent').value) || 0,
    reference: parseFloat(document.getElementById('employer-fulltime-reference').value) || 40,
    weekly: parseFloat(document.getElementById('employer-weekly-hours').value) || 0,
  };
}

/** Aktualisiert Sichtbarkeit von Prozent-/Referenz-Zeile, den ArbZG-Hinweis für die
 * Vier-Tage-Woche und die zusammengefasste "Anzeige"-Zeile. Löst KEINE Neuberechnung der
 * Stunden/Prozent-Werte aus — das übernehmen die spezifischen handle*-Funktionen unten. */
export function refreshEmploymentModelUI() {
  const s = _readEmploymentModelFormState();
  const percentRow = document.getElementById('row-parttime-percent');
  const refRow = document.getElementById('row-fulltime-reference');
  const showPercent = s.scope === 'teilzeit';
  const showRef = s.scope === 'vollzeit' || s.scope === 'teilzeit';
  if (percentRow) percentRow.classList.toggle('hidden', !showPercent);
  if (refRow) refRow.classList.toggle('hidden', !showRef);

  const warnRow = document.getElementById('row-worktime-warning');
  const warnText = document.getElementById('worktime-warning-text');
  if (warnRow && warnText) {
    let warn = '';
    if (s.model === 'vier_tage_woche' && s.weekly > 0) {
      const perDay = s.weekly / 4;
      if (perDay > 10) {
        warn = `Achtung: ${perDay.toFixed(1)} Std./Tag bei 4 Arbeitstagen überschreiten die gesetzliche Höchstarbeitszeit (ArbZG § 3: max. 10 Std./Tag).`;
      } else if (perDay > 8) {
        warn = `Hinweis: ${perDay.toFixed(1)} Std./Tag bei 4 Arbeitstagen liegen über der regulären 8-Std.-Grenze (ArbZG § 3) — nur mit Ausgleich innerhalb von 6 Monaten zulässig.`;
      }
    }
    warnRow.hidden = !warn;
    warnText.textContent = warn;
  }

  const summaryEl = document.getElementById('employment-model-summary');
  if (summaryEl) {
    summaryEl.textContent = formatEmploymentModelSummary({
      employmentScope: s.scope,
      workTimeModel: s.model,
      parttimePercent: s.percent,
    });
  }
}

/** Prozent → Stunden: nur aktiv bei Teilzeit + Sollstunden-Eingabe "Pro Woche". Prozent bleibt
 * dabei führend (Empfehlung aus dem Vorschlagsdokument), Stunden folgen. */
export function handlePartTimePercentInput() {
  const s = _readEmploymentModelFormState();
  if (s.scope === 'teilzeit' && s.hoursMode === 'week') {
    const percent = Math.min(99, Math.max(1, s.percent || 1));
    const hours = Math.round(s.reference * percent / 100 * 2) / 2;
    document.getElementById('employer-weekly-hours').value = hours;
  }
  refreshEmploymentModelUI();
}

/** Vollzeit-Referenz geändert: Prozent bleibt fest, Stunden werden auf Basis der neuen
 * Referenz neu berechnet (gleiche Regel wie bei der Prozent-Eingabe). */
export function handleFullTimeReferenceInput() {
  handlePartTimePercentInput();
}

/** Sollstunden/Woche manuell geändert → Prozentsatz nachziehen (nur Teilzeit + Wochen-Modus). */
export function handleWeeklyHoursInputForModel() {
  const s = _readEmploymentModelFormState();
  if (s.scope === 'teilzeit' && s.hoursMode === 'week' && s.reference > 0) {
    const percent = Math.min(99, Math.max(1, Math.round((s.weekly / s.reference) * 100)));
    document.getElementById('employer-parttime-percent').value = percent;
  }
  refreshEmploymentModelUI();
}

export function handleEmploymentScopeChange() {
  refreshEmploymentModelUI();
}

/** Arbeitszeitorganisation geändert: bei "Jahresarbeitszeit" bequem die Sollstunden-Eingabe
 * automatisch auf "Pro Jahr" umstellen (überschreibbar). */
export function handleWorkTimeModelChange() {
  const model = document.getElementById('employer-worktime-model').value;
  if (model === 'jahresarbeitszeit') {
    const hoursModeEl = document.getElementById('employer-hours-mode');
    if (hoursModeEl.value !== 'year') {
      hoursModeEl.value = 'year';
      updateHoursModeVisibility();
    }
  }
  refreshEmploymentModelUI();
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
  const defaultKind = isFreelance() ? 'client' : 'employer';
  const e = emp || {
    id: '', kind: defaultKind, name: '', color: '#3b82f6', phone: '', personnelNumber: '',
    contacts: [{ name:'', email:'' }, { name:'', email:'' }],
    hoursMode: 'week', weeklyHours: defWeekly, monthlyHours: defMonthly, yearlyHours: 0,
    breakMode: 'legal', annualVacation: 0, hiredSince: '', employmentEndDate: '', vacationCarryOver: 0,
    hourlyRate: 0, currency: (state.settings && state.settings.currency) || 'EUR',
    schedule: defaultSchedule(defWeekly),
    employmentScope: 'vollzeit', fullTimeReferenceHours: 40, parttimePercent: 100, workTimeModel: 'klassisch',
    notes: '',
  };
  document.getElementById('employer-id').value = e.id;
  const kindEl = document.getElementById('employer-kind');
  if (kindEl) kindEl.value = (e.kind === 'employer' || e.kind === 'client') ? e.kind : defaultKind;
  document.getElementById('employer-name').value = e.name;
  document.getElementById('employer-color').value = e.color;
  document.getElementById('employer-phone').value = e.phone || '';
  document.getElementById('employer-personnel-number').value = e.personnelNumber || '';
  const contacts = e.contacts || [];
  document.getElementById('employer-contact1-name').value = contacts[0]?.name || '';
  document.getElementById('employer-contact1-email').value = contacts[0]?.email || '';
  document.getElementById('employer-contact2-name').value = contacts[1]?.name || '';
  document.getElementById('employer-contact2-email').value = contacts[1]?.email || '';
  document.getElementById('employer-hours-mode').value = e.hoursMode || 'week';
  // WICHTIG: Nicht `|| 40` — sonst überschreibt der Fallback einen explizit gespeicherten 0-Wert.
  document.getElementById('employer-weekly-hours').value = (e.weeklyHours != null ? e.weeklyHours : defWeekly);
  document.getElementById('employer-monthly-hours').value = (e.monthlyHours != null ? e.monthlyHours : defMonthly);
  document.getElementById('employer-yearly-hours').value = (e.yearlyHours != null && e.yearlyHours
    ? e.yearlyHours
    : Math.round(((e.monthlyHours != null ? e.monthlyHours : defMonthly) * 12) * 10) / 10);
  // Arbeitszeitmodell-Felder: bei Altdatensätzen ohne diese Felder wird sinnvoll migriert
  // (Referenz 40h, Beschäftigungsart aus vorhandenen Wochenstunden abgeleitet).
  const fullTimeReference = (e.fullTimeReferenceHours != null ? e.fullTimeReferenceHours : 40);
  document.getElementById('employer-fulltime-reference').value = fullTimeReference;
  const effWeekly = (e.weeklyHours != null ? e.weeklyHours : defWeekly);
  const derivedScope = e.employmentScope || (effWeekly > 0 && effWeekly < fullTimeReference ? 'teilzeit' : 'vollzeit');
  document.getElementById('employer-employment-scope').value = derivedScope;
  const derivedPercent = (e.parttimePercent != null
    ? e.parttimePercent
    : (fullTimeReference > 0 ? Math.min(99, Math.max(1, Math.round((effWeekly / fullTimeReference) * 100))) : 60));
  document.getElementById('employer-parttime-percent').value = derivedPercent;
  document.getElementById('employer-worktime-model').value = e.workTimeModel || 'klassisch';
  document.getElementById('employer-break-mode').value = e.breakMode || 'legal';
  document.getElementById('employer-annual-vacation').value = e.annualVacation || 0;
  document.getElementById('employer-hired-since').value = e.hiredSince || '';
  const endDateEl = document.getElementById('employer-employment-end-date');
  if (endDateEl) endDateEl.value = e.employmentEndDate || '';
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
  refreshEmploymentModelUI();
  document.getElementById('btn-delete-employer').classList.toggle('hidden', isNew);
  modal.classList.remove('hidden');
}

export function saveEmployer(ev, ctx) {
  ev.preventDefault();
  const { getState, saveState, uid, closeModals, renderEmployers, renderTracker, toast } = ctx;
  const state = getState();
  const id = document.getElementById('employer-id').value;
  const kindVal = document.getElementById('employer-kind')?.value;
  const data = {
    kind: (kindVal === 'client') ? 'client' : 'employer',
    name: document.getElementById('employer-name').value.trim(),
    color: document.getElementById('employer-color').value,
    phone: document.getElementById('employer-phone').value.trim(),
    personnelNumber: document.getElementById('employer-personnel-number').value.trim(),
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
    yearlyHours: parseFloat(document.getElementById('employer-yearly-hours').value) || 0,
    employmentScope: document.getElementById('employer-employment-scope').value,
    fullTimeReferenceHours: parseFloat(document.getElementById('employer-fulltime-reference').value) || 40,
    parttimePercent: parseInt(document.getElementById('employer-parttime-percent').value, 10) || 0,
    workTimeModel: document.getElementById('employer-worktime-model').value,
    breakMode: document.getElementById('employer-break-mode').value,
    annualVacation: parseInt(document.getElementById('employer-annual-vacation').value) || 0,
    hiredSince: document.getElementById('employer-hired-since').value || '',
    employmentEndDate: document.getElementById('employer-employment-end-date')?.value || '',
    vacationCarryOver: parseInt(document.getElementById('employer-vacation-carryover').value) || 0,
    hourlyRate: parseFloat(document.getElementById('employer-hourly-rate')?.value) || 0,
    currency: document.getElementById('employer-currency')?.value || 'EUR',
    schedule: readScheduleFromGrid(),
    notes: document.getElementById('employer-notes').value.trim(),
  };
  // Sollstunden-Eingabe "Pro Jahr": monthlyHours wird aus yearlyHours / 12 abgeleitet (gleichmäßige
  // Verteilung), damit die bestehende Monats-Logik in compute.js unverändert weiterverwendet werden
  // kann — yearlyHours bleibt zusätzlich zur Wiederanzeige/Bearbeitung gespeichert.
  if (data.hoursMode === 'year') {
    data.monthlyHours = Math.round((data.yearlyHours / 12) * 10) / 10;
  }
  if (!data.name) { toast('Bitte Namen eingeben'); return; }
  if (data.hiredSince && data.employmentEndDate && data.employmentEndDate < data.hiredSince) {
    toast('„Beschäftigt bis" darf nicht vor „Angestellt seit" liegen');
    return;
  }
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
