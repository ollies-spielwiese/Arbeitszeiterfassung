// modules/ui/field-service-ui.js
// Außendienst-Nachweis (seit v3.13.0): DOM-Anbindung für Eintragsdialog, Reiter „Erfassen“
// und Einstellungen. Logik liegt in modules/field-service.js und modules/sunday-hints.js.
//
// ctx = {
//   getState, saveState, escapeHtml, getEmployer, todayISO, holidayOf(iso),
//   computeSuggestedBreak, openEntryModal, renderTracker, refreshAll, toast, uid,
//   minutesToHM, computeWorkMinutes,
// }

import {
  getFieldServiceSettings, isFieldServiceActive, visibleActivities, findActivity,
  activityLabelOf, isTripEntry, entryKm, buildEntryFieldServiceData, newActivityId,
  fieldServicePrefix, formatKm, FS_LABEL_MAX,
} from '../field-service.js';
import { computeSundayHintsForCandidate, buildSundayHintParagraphs, isSundayHintEnabled } from '../sunday-hints.js';
import { pushAuditLog } from '../audit-log.js';
import { splitAcrossMidnight, pad } from '../util-time.js';
import { toAppContext } from '../app-context.js';

const $ = (id) => /** @type {any} */ (document.getElementById(id));

/** Normalisierte Einstellungen in den State zurückschreiben (vollständige Struktur). */
function writeFs(state, patch) {
  const cur = getFieldServiceSettings(state.settings);
  const next = { ...cur, ...patch };
  state.settings.fieldService = {
    enabled: !!next.enabled,
    employerIds: [...next.employerIds],
    activities: next.activities.map(a => ({ id: a.id, label: a.label, builtin: !!a.builtin, hidden: !!a.hidden, isTrip: !!a.isTrip })),
    kmEnabled: !!next.kmEnabled,
    kmRate: next.kmRate,
    defaultVehicle: next.defaultVehicle,
    kmPrompt: next.kmPrompt,
    showTodayList: !!next.showTodayList,
  };
}

function chipsHTML(fs, selectedId, selectedLabel, escapeHtml, prefix) {
  const list = visibleActivities(fs);
  const items = list.map(a => ({ id: a.id, label: a.label, custom: !a.builtin }));
  if (selectedId && !items.some(a => a.id === selectedId)) {
    const a = findActivity(fs, selectedId);
    items.push({ id: selectedId, label: (a && a.label) || selectedLabel || selectedId, custom: true });
  }
  return items.map(a => `<button type="button" class="fs-chip${a.custom ? ' fs-chip-custom' : ''}${a.id === selectedId ? ' active' : ''}" data-activity="${escapeHtml(a.id)}" data-label="${escapeHtml(a.label)}" aria-pressed="${a.id === selectedId}" data-testid="${prefix}-${escapeHtml(a.id)}">${escapeHtml(a.label)}</button>`).join('');
}

/* ---------------- Eintragsdialog ---------------- */

let entryMoreOpen = false;

export function syncEntryFieldService(entry, opts, ctx) {
  opts = opts || {};
  const state = toAppContext(ctx).state.get();
  const fs = getFieldServiceSettings(state.settings);
  const nb = opts.nextBlock || null;
  const act = $('entry-fs-activity');
  if (!act) return;
  act.value = (entry && entry.activity) || '';
  act.dataset.label = (entry && entry.activityLabel) || '';
  $('entry-fs-location').value = (entry && entry.location) || '';
  $('entry-fs-km').value = entry && entryKm(entry) > 0 ? formatKm(entryKm(entry)) : '';
  $('entry-fs-vehicle').value = (entry && (entry.vehicle === 'company' || entry.vehicle === 'private')) ? entry.vehicle : fs.defaultVehicle;
  if (nb) {
    if (nb.employerId) $('entry-employer').value = nb.employerId;
    if (nb.date) $('entry-date').value = nb.date;
    if (nb.start) $('entry-start').value = nb.start;
  }
  entryMoreOpen = !!(entry && ((entry.note && String(entry.note).trim()) || (entry.overtimeReason && String(entry.overtimeReason).trim())));
  refreshEntryFieldService(ctx);
}

export function refreshEntryFieldService(ctx) {
  const cx = toAppContext(ctx);
  const state = cx.state.get();
  const form = $('form-entry');
  const block = $('entry-fs-block');
  if (!form || !block) return;
  const type = $('entry-type').value;
  const empId = $('entry-employer').value;
  const active = type === 'work' && isFieldServiceActive(state.settings, empId);
  block.classList.toggle('hidden', !active);
  $('entry-more-toggle').classList.toggle('hidden', !active);
  $('entry-save-next-row').classList.toggle('hidden', !active);
  const note = $('entry-note').value.trim();
  const ot = $('entry-overtime-reason').value.trim();
  if (note || ot) entryMoreOpen = true;
  form.classList.toggle('fs-collapsed', active && !entryMoreOpen);
  $('entry-more-toggle').setAttribute('aria-expanded', String(entryMoreOpen));
  $('entry-more-toggle').querySelector('.fs-more-arrow').textContent = entryMoreOpen ? '▾' : '▸';
  if (!active) return;
  const fs = getFieldServiceSettings(state.settings);
  const act = $('entry-fs-activity');
  $('entry-fs-chips').innerHTML = chipsHTML(fs, act.value, act.dataset.label, cx.format.escapeHtml, 'chip-entry-activity');
  const a = findActivity(fs, act.value);
  const showKm = !!(a && a.isTrip && fs.kmEnabled);
  $('entry-fs-km-row').classList.toggle('hidden', !showKm);
}

/** Werte aus dem Dialog lesen (null, wenn für den Arbeitgeber nicht aktiv). */
export function readEntryFieldService(state, employerId) {
  if (!isFieldServiceActive(state.settings, employerId)) return null;
  const act = $('entry-fs-activity');
  if (!act) return null;
  const fs = getFieldServiceSettings(state.settings);
  return buildEntryFieldServiceData(fs, {
    activity: act.value,
    activityLabel: act.dataset.label || '',
    location: $('entry-fs-location').value,
    km: $('entry-fs-km').value,
    vehicle: $('entry-fs-vehicle').value,
  });
}

/* ---------------- Reiter „Erfassen“ ---------------- */

let trackerPick = '';

export function renderTrackerFieldService(ctx, mode) {
  const cx = toAppContext(ctx);
  const state = cx.state.get();
  const wrap = $('tracker-fs');
  if (!wrap) return;
  const r = state.runningTimer;
  const empId = r ? r.employerId : state.activeEmployerId;
  const isHO = r ? r.type === 'homeoffice' : mode === 'homeoffice';
  const active = !isHO && isFieldServiceActive(state.settings, empId);
  const fs = getFieldServiceSettings(state.settings);
  const liveLabel = document.querySelector('#live-status .live-label');
  wrap.classList.toggle('hidden', !active);
  if (liveLabel) liveLabel.textContent = 'Läuft seit';
  if (active) {
    $('tracker-fs-pick').classList.toggle('hidden', !!r);
    $('tracker-fs-switch').classList.toggle('hidden', !r);
    if (!r) {
      if (trackerPick && !visibleActivities(fs).some(a => a.id === trackerPick)) trackerPick = '';
      $('tracker-fs-chips').innerHTML = chipsHTML(fs, trackerPick, '', cx.format.escapeHtml, 'chip-tracker-activity');
    } else {
      const sw = $('tracker-fs-switch-chips');
      sw.innerHTML = chipsHTML(fs, r.activity || '', r.activityLabel || '', cx.format.escapeHtml, 'chip-switch-activity');
      sw.querySelectorAll('.fs-chip.active').forEach((b) => { b.disabled = true; });
      const label = activityLabelOf(r, fs);
      if (liveLabel && label) liveLabel.textContent = `${label} läuft seit`;
      const loc = String(r.location || '').trim();
      const lt = $('live-time');
      if (lt && loc && !lt.textContent.endsWith(` · ${loc}`)) lt.textContent = `${lt.textContent} · ${loc}`;
    }
  }
  renderTrackerSundayHint(ctx, empId, isHO);
  renderTrackerToday(ctx, active, fs, empId);
}

function renderTrackerSundayHint(ctx, empId, isHO) {
  const cx = toAppContext(ctx);
  const el = $('tracker-sunday-hint');
  if (!el) return;
  const state = cx.state.get();
  const hide = () => { el.innerHTML = ''; el.classList.add('hidden'); };
  if (!empId || !isSundayHintEnabled(state.settings)) return hide();
  const today = cx.data.todayISO();
  const r = state.runningTimer;
  const candidate = { id: '__tracker__', employerId: empId, date: today, type: isHO ? 'homeoffice' : 'work', start: '00:00', end: '00:01', segments: [{ start: '00:00', end: '00:01' }] };
  const hints = computeSundayHintsForCandidate(state.entries, state.employers, candidate, cx.compute.holidayOf);
  if (!hints.length) return hide();
  el.innerHTML = buildSundayHintParagraphs(hints, cx.format.escapeHtml).replace(/Mit diesem Eintrag an/g, 'Einschließlich heute an');
  el.classList.remove('hidden');
}

function renderTrackerToday(ctx, active, fs, empId) {
  const cx = toAppContext(ctx);
  const el = $('tracker-fs-today');
  if (!el) return;
  const state = cx.state.get();
  if (!active || !fs.showTodayList) { el.innerHTML = ''; el.classList.add('hidden'); return; }
  const today = cx.data.todayISO();
  const blocks = state.entries
    .filter(e => e.type === 'work' && e.employerId === empId && e.date === today)
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const r = state.runningTimer;
  if (!blocks.length && !r) { el.innerHTML = ''; el.classList.add('hidden'); return; }
  const esc = cx.format.escapeHtml;
  const rows = blocks.map((e) => {
    const desc = fieldServicePrefix(e, fs) || 'Arbeit';
    const missingKm = isTripEntry(e, fs) && fs.kmEnabled && !(entryKm(e) > 0);
    return `<li class="fs-today-row" data-entry-id="${esc(e.id)}"><span class="fs-today-time">${esc(e.start)}–${esc(e.end)}</span><span class="fs-today-desc">${esc(desc)}${missingKm ? ' <button type="button" class="fs-link" data-fs-km-for="' + esc(e.id) + '">km eintragen</button>' : ''}</span><span class="fs-today-dur">${cx.format.minutesToHM(cx.compute.workMinutes(e))}</span></li>`;
  });
  if (r && r.type !== 'homeoffice' && r.employerId === empId) {
    const d = new Date(r.startISO);
    const label = activityLabelOf(r, fs) || 'Arbeit';
    const loc = String(r.location || '').trim();
    rows.push(`<li class="fs-today-row fs-today-running"><span class="fs-today-time">${pad(d.getHours())}:${pad(d.getMinutes())}–…</span><span class="fs-today-desc">${esc(label)}${loc ? ' · ' + esc(loc) : ''}</span><span class="fs-today-dur">läuft</span></li>`);
  }
  el.innerHTML = `<h3>Heute</h3><ul class="fs-today-list" data-testid="list-fs-today">${rows.join('')}</ul>`;
  el.classList.remove('hidden');
}

/** Startdaten für den Timer (Tätigkeit/Einsatzort), nur Präsenz und aktiver Arbeitgeber. */
export function getTrackerStartFieldService(state, employerId, mode) {
  if (mode === 'homeoffice' || !isFieldServiceActive(state.settings, employerId)) return {};
  const fs = getFieldServiceSettings(state.settings);
  const a = findActivity(fs, trackerPick);
  const loc = String(($('tracker-fs-location') && $('tracker-fs-location').value) || '').trim().slice(0, 120);
  const out = {};
  if (a) { out.activity = a.id; out.activityLabel = a.label; }
  if (loc) out.location = loc;
  return out;
}

export function resetTrackerPick() {
  trackerPick = '';
  if ($('tracker-fs-location')) $('tracker-fs-location').value = '';
}

/** Daten des laufenden Timers für den gespeicherten Block. */
export function fieldServiceFromTimer(state, r) {
  if (!r || r.type === 'homeoffice' || !isFieldServiceActive(state.settings, r.employerId)) return {};
  const out = {};
  if (r.activity) { out.activity = r.activity; out.activityLabel = r.activityLabel || ''; }
  if (r.location) out.location = r.location;
  const fs = getFieldServiceSettings(state.settings);
  const a = findActivity(fs, r.activity);
  if (a && a.isTrip && fs.kmEnabled) out.vehicle = fs.defaultVehicle;
  return out;
}

/**
 * Tätigkeit wechseln: laufenden Block lückenlos beenden und neuen starten.
 * @returns {any|null} gespeicherter Block
 */
export function switchActivity(newId, ctx) {
  const cx = toAppContext(ctx);
  const state = cx.state.get();
  const r = state.runningTimer;
  if (!r || r.type === 'homeoffice') return null;
  const fs = getFieldServiceSettings(state.settings);
  const a = findActivity(fs, newId);
  if (!a) return null;
  const nextLocEl = $('tracker-fs-next-location');
  const nextLoc = String((nextLocEl && nextLocEl.value) || '').trim().slice(0, 120);
  const now = new Date();
  const start = new Date(r.startISO);
  const parts = splitAcrossMidnight(start, now);
  let saved = null;
  if (parts.length && (now.getTime() - start.getTime()) >= 60000) {
    const startHHMM = parts[0].start;
    const endHHMM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const emp = cx.data.employer(r.employerId);
    const suggested = cx.compute.suggestedBreak(startHHMM, endHHMM, emp && emp.breakMode);
    saved = {
      id: cx.data.uid(), employerId: r.employerId, date: parts[0].date, type: 'work',
      start: startHHMM, end: endHHMM, breakMinutes: suggested || 0, overtimeReason: '', note: '',
      ...fieldServiceFromTimer(state, r),
      createdAt: now.toISOString(),
    };
    state.entries.push(saved);
    pushAuditLog(state, { action: 'create', entry: saved, uid: cx.data.uid });
  }
  state.runningTimer = {
    employerId: r.employerId,
    startISO: saved ? now.toISOString() : r.startISO,
    type: 'work', activity: a.id, activityLabel: a.label,
    ...(nextLoc ? { location: nextLoc } : {}),
  };
  if (nextLocEl) nextLocEl.value = '';
  cx.state.save();
  cx.render.tracker();
  if (typeof cx.render.all === 'function') cx.render.all();
  cx.ui.toast(`${a.label} gestartet`);
  if (saved && isTripEntry(saved, fs) && fs.kmEnabled && fs.kmPrompt === 'switch') openKmModal([saved], ctx);
  return saved;
}

/** Fahrten von heute ohne Kilometer (ohne die angegebene ID). */
export function tripsMissingKm(state, employerId, date, exceptId) {
  const fs = getFieldServiceSettings(state.settings);
  if (!fs.kmEnabled || !isFieldServiceActive(state.settings, employerId)) return [];
  return state.entries
    .filter(e => e.type === 'work' && e.employerId === employerId && e.date === date && e.id !== exceptId && isTripEntry(e, fs) && !(entryKm(e) > 0))
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
}

let kmModalIds = [];

export function openKmModal(entries, ctx) {
  const cx = toAppContext(ctx);
  const modal = $('modal-fs-km');
  if (!modal || !entries || !entries.length) return;
  const state = cx.state.get();
  const fs = getFieldServiceSettings(state.settings);
  const esc = cx.format.escapeHtml;
  kmModalIds = entries.map(e => e.id);
  $('fs-km-rows').innerHTML = entries.map((e, i) => `
    <div class="form-row fs-km-row" data-km-id="${esc(e.id)}">
      <label for="fs-km-input-${i}">${esc(e.start)}–${esc(e.end)} ${esc(activityLabelOf(e, fs) || 'Fahrt')}${e.location ? ' · ' + esc(e.location) : ''}</label>
      <input type="text" inputmode="decimal" id="fs-km-input-${i}" data-km-input placeholder="km" value="${entryKm(e) > 0 ? esc(formatKm(entryKm(e))) : ''}" data-testid="input-fs-km-${i}" />
    </div>`).join('');
  modal.classList.remove('hidden');
  const first = modal.querySelector('[data-km-input]');
  if (first) try { first.focus(); } catch (_) {}
}

function closeKmModal() {
  const modal = $('modal-fs-km');
  if (modal) modal.classList.add('hidden');
  kmModalIds = [];
}

function saveKmModal(ctx) {
  const cx = toAppContext(ctx);
  const state = cx.state.get();
  const fs = getFieldServiceSettings(state.settings);
  document.querySelectorAll('#fs-km-rows [data-km-id]').forEach((row) => {
    const id = /** @type {any} */ (row).dataset.kmId;
    const input = /** @type {any} */ (row.querySelector('[data-km-input]'));
    const e = state.entries.find(x => x.id === id);
    if (!e || !input) return;
    const data = buildEntryFieldServiceData(fs, { activity: e.activity, activityLabel: e.activityLabel, location: e.location, km: input.value, vehicle: e.vehicle });
    e.km = data.km;
    e.vehicle = data.vehicle || e.vehicle || fs.defaultVehicle;
    pushAuditLog(state, { action: 'update', entry: e, summary: 'Kilometer', uid: cx.data.uid });
  });
  cx.state.save();
  closeKmModal();
  cx.render.tracker();
  if (typeof cx.render.all === 'function') cx.render.all();
  cx.ui.toast('Kilometer gespeichert');
}

/* ---------------- Einstellungen ---------------- */

export function renderFieldServiceSettings(ctx) {
  const cx = toAppContext(ctx);
  const state = cx.state.get();
  const block = $('settings-block-fieldservice');
  if (!block) return;
  const fs = getFieldServiceSettings(state.settings);
  const esc = cx.format.escapeHtml;
  $('setting-sunday-hint').checked = isSundayHintEnabled(state.settings);
  $('setting-sunday-hint').disabled = state.settings.arbzgHintsEnabled === false;
  $('setting-fs-enabled').checked = fs.enabled;
  block.classList.toggle('fs-off', !fs.enabled);
  const emps = (state.employers || []).filter(e => e.kind !== 'client');
  $('setting-fs-employers').innerHTML = emps.length
    ? emps.map(e => `<label class="checkbox-row fs-emp"><input type="checkbox" data-fs-emp="${esc(e.id)}" ${fs.employerIds.includes(e.id) ? 'checked' : ''} data-testid="checkbox-fs-emp-${esc(e.id)}" /><span>${esc(e.name)}</span></label>`).join('')
    : '<span class="hint">Noch kein Arbeitgeber angelegt.</span>';
  $('setting-fs-activities').innerHTML = fs.activities.map(a => a.builtin
    ? `<button type="button" class="fs-chip fs-chip-builtin${a.hidden ? ' fs-chip-hidden' : ' active'}" data-fs-builtin="${esc(a.id)}" aria-pressed="${!a.hidden}" title="${a.hidden ? 'Ausgeblendet – antippen zum Einblenden' : 'Antippen zum Ausblenden'}" data-testid="chip-setting-activity-${esc(a.id)}">${esc(a.label)}</button>`
    : `<button type="button" class="fs-chip fs-chip-custom${a.hidden ? ' fs-chip-hidden' : ''}" data-fs-edit="${esc(a.id)}" data-testid="chip-setting-activity-${esc(a.id)}">${esc(a.label)} <span aria-hidden="true">✎</span></button>`).join('')
    + '<button type="button" class="fs-chip fs-chip-add" id="btn-fs-add-activity" data-testid="button-fs-add-activity">+ Eigene Tätigkeit</button>';
  $('setting-fs-km').checked = fs.kmEnabled;
  const rateEl = $('setting-fs-rate');
  if (document.activeElement !== rateEl) rateEl.value = fs.kmRate.toFixed(2).replace('.', ',');
  $('setting-fs-vehicle').value = fs.defaultVehicle;
  document.querySelectorAll('[data-fs-prompt]').forEach((b) => {
    const on = /** @type {any} */ (b).dataset.fsPrompt === fs.kmPrompt;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  $('setting-fs-today').checked = fs.showTodayList;
}

function openActivityModal(id, ctx) {
  const state = toAppContext(ctx).state.get();
  const fs = getFieldServiceSettings(state.settings);
  const a = id ? findActivity(fs, id) : null;
  $('fs-activity-id').value = a ? a.id : '';
  $('fs-activity-label').value = a ? a.label : '';
  $('fs-activity-trip').checked = !!(a && a.isTrip);
  $('fs-activity-hidden').checked = !!(a && a.hidden);
  $('fs-activity-hidden-row').classList.toggle('hidden', !a);
  $('btn-fs-activity-delete').classList.toggle('hidden', !a);
  $('modal-fs-activity-title').textContent = a ? 'Tätigkeit bearbeiten' : 'Eigene Tätigkeit';
  $('fs-activity-delete-hint').textContent = a
    ? `Zählt immer als Arbeitszeit. Beim Löschen behalten alte Einträge den Namen „${a.label}“; neue Einträge können sie nicht mehr wählen.`
    : 'Zählt immer als Arbeitszeit. Beim Löschen behalten alte Einträge den Namen.';
  $('modal-fs-activity').classList.remove('hidden');
  try { $('fs-activity-label').focus(); } catch (_) {}
}

function saveActivity(ctx) {
  const cx = toAppContext(ctx);
  const state = cx.state.get();
  const fs = getFieldServiceSettings(state.settings);
  const id = $('fs-activity-id').value;
  const label = String($('fs-activity-label').value || '').replace(/\s+/g, ' ').trim().slice(0, FS_LABEL_MAX);
  if (!label) { cx.ui.toast('Bitte eine Bezeichnung eingeben'); return; }
  const clash = fs.activities.find(a => a.id !== id && a.label.toLowerCase() === label.toLowerCase());
  if (clash) { cx.ui.toast('Diese Tätigkeit gibt es schon'); return; }
  const isTrip = !!$('fs-activity-trip').checked;
  const hidden = !!$('fs-activity-hidden').checked;
  let activities = fs.activities;
  if (id) activities = activities.map(a => a.id === id ? { ...a, label, isTrip, hidden } : a);
  else activities = [...activities, { id: newActivityId(activities), label, builtin: false, hidden: false, isTrip }];
  writeFs(state, { activities });
  cx.state.save();
  $('modal-fs-activity').classList.add('hidden');
  renderFieldServiceSettings(ctx);
  cx.ui.toast('Tätigkeit gespeichert');
}

function deleteActivity(ctx) {
  const cx = toAppContext(ctx);
  const state = cx.state.get();
  const fs = getFieldServiceSettings(state.settings);
  const id = $('fs-activity-id').value;
  const a = findActivity(fs, id);
  if (!a || a.builtin) return;
  if (!confirm(`Tätigkeit „${a.label}“ löschen? Alte Einträge behalten den Namen.`)) return;
  writeFs(state, { activities: fs.activities.filter(x => x.id !== id) });
  cx.state.save();
  $('modal-fs-activity').classList.add('hidden');
  renderFieldServiceSettings(ctx);
  cx.ui.toast('Tätigkeit gelöscht');
}

/* ---------------- Verdrahtung ---------------- */

export function wireFieldServiceUI(ctx) {
  const cx = toAppContext(ctx);
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const afterSettings = () => { cx.state.save(); renderFieldServiceSettings(ctx); try { cx.render.tracker(); } catch (_) {} };

  // Eintragsdialog
  on('entry-fs-chips', 'click', (e) => {
    const btn = e.target.closest('[data-activity]');
    if (!btn) return;
    const act = $('entry-fs-activity');
    if (act.value === btn.dataset.activity) { act.value = ''; act.dataset.label = ''; }
    else { act.value = btn.dataset.activity; act.dataset.label = btn.dataset.label || ''; }
    refreshEntryFieldService(ctx);
  });
  on('entry-more-toggle', 'click', () => {
    entryMoreOpen = !entryMoreOpen;
    refreshEntryFieldService(ctx);
    if (entryMoreOpen) { const n = $('entry-note'); if (n) n.dispatchEvent(new Event('input')); }
  });
  on('entry-type', 'change', () => refreshEntryFieldService(ctx));
  on('entry-employer', 'change', () => refreshEntryFieldService(ctx));
  on('btn-save-next-entry', 'click', () => {
    const form = $('form-entry');
    if (typeof cx.extra.saveEntryAndNext === 'function') cx.extra.saveEntryAndNext({ preventDefault() {}, target: form });
  });

  // Reiter „Erfassen“
  on('tracker-fs-chips', 'click', (e) => {
    const btn = e.target.closest('[data-activity]');
    if (!btn) return;
    trackerPick = trackerPick === btn.dataset.activity ? '' : btn.dataset.activity;
    cx.render.tracker();
  });
  on('tracker-fs-switch-chips', 'click', (e) => {
    const btn = e.target.closest('[data-activity]');
    if (!btn || btn.disabled) return;
    switchActivity(btn.dataset.activity, ctx);
  });
  on('tracker-fs-today', 'click', (e) => {
    const km = e.target.closest('[data-fs-km-for]');
    if (km) {
      const ent = cx.state.get().entries.find(x => x.id === km.dataset.fsKmFor);
      if (ent) openKmModal([ent], ctx);
      return;
    }
    const row = e.target.closest('[data-entry-id]');
    if (row) {
      const ent = cx.state.get().entries.find(x => x.id === row.dataset.entryId);
      if (ent) cx.ui.openEntryModal(ent);
    }
  });
  document.querySelectorAll('[data-fs-km-close]').forEach(el => el.addEventListener('click', closeKmModal));
  on('btn-fs-km-save', 'click', () => saveKmModal(ctx));

  // Einstellungen
  on('setting-sunday-hint', 'change', (e) => {
    cx.state.get().settings.sundayHintEnabled = !!e.target.checked;
    afterSettings();
  });
  on('setting-fs-enabled', 'change', (e) => { const state = cx.state.get(); writeFs(state, { enabled: !!e.target.checked }); afterSettings(); });
  on('setting-fs-employers', 'change', (e) => {
    const cb = e.target.closest('[data-fs-emp]');
    if (!cb) return;
    const state = cx.state.get();
    const fs = getFieldServiceSettings(state.settings);
    const set = new Set(fs.employerIds);
    if (cb.checked) set.add(cb.dataset.fsEmp); else set.delete(cb.dataset.fsEmp);
    writeFs(state, { employerIds: [...set] });
    afterSettings();
  });
  on('setting-fs-activities', 'click', (e) => {
    const state = cx.state.get();
    const b = e.target.closest('[data-fs-builtin]');
    if (b) {
      const fs = getFieldServiceSettings(state.settings);
      const id = b.dataset.fsBuiltin;
      const vis = fs.activities.filter(a => !a.hidden);
      const target = fs.activities.find(a => a.id === id);
      if (target && !target.hidden && vis.length <= 1) { cx.ui.toast('Mindestens eine Tätigkeit muss sichtbar bleiben'); return; }
      writeFs(state, { activities: fs.activities.map(a => a.id === id ? { ...a, hidden: !a.hidden } : a) });
      afterSettings();
      return;
    }
    const ed = e.target.closest('[data-fs-edit]');
    if (ed) { openActivityModal(ed.dataset.fsEdit, ctx); return; }
    if (e.target.closest('#btn-fs-add-activity')) openActivityModal('', ctx);
  });
  on('form-fs-activity', 'submit', (e) => { e.preventDefault(); saveActivity(ctx); });
  on('btn-fs-activity-delete', 'click', () => deleteActivity(ctx));
  on('setting-fs-km', 'change', (e) => { writeFs(cx.state.get(), { kmEnabled: !!e.target.checked }); afterSettings(); });
  on('setting-fs-rate', 'change', (e) => {
    const n = Number(String(e.target.value || '').replace(/[^\d,.]/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 10) { cx.ui.toast('Bitte einen Kilometersatz zwischen 0 und 10 € eingeben'); renderFieldServiceSettings(ctx); return; }
    writeFs(cx.state.get(), { kmRate: Math.round(n * 100) / 100 });
    afterSettings();
  });
  on('setting-fs-vehicle', 'change', (e) => { writeFs(cx.state.get(), { defaultVehicle: e.target.value === 'company' ? 'company' : 'private' }); afterSettings(); });
  document.querySelectorAll('[data-fs-prompt]').forEach(b => b.addEventListener('click', () => {
    writeFs(cx.state.get(), { kmPrompt: /** @type {any} */ (b).dataset.fsPrompt === 'end' ? 'end' : 'switch' });
    afterSettings();
  }));
  on('setting-fs-today', 'change', (e) => { writeFs(cx.state.get(), { showTodayList: !!e.target.checked }); afterSettings(); });
}

