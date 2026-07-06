// modules/ui/holiday-overrides.js
// Feiertag-Overrides-UI: Liste (Base + Custom), Aktions-Handler, Modal.
// Reine Funktionen mit ctx-DI - kein Modul-State, keine globalen Referenzen.
//
// ctx = {
//   getState,               // liefert state (settings.holidayOverrides, settings.state)
//   saveState,
//   normalizeHolidayOverrides,
//   escapeHtml,
//   formatDate,
//   closeModals,
//   toast,
// }
//
// getBaseHolidays und ensureHolidayOverrides sind exportiert, damit
// app.js oder andere Aufrufer sie via Wrapper wiederverwenden koennen.

import { easterSunday } from '../holidays.js';
import { dateISO, addDays } from '../util-time.js';

export function ensureHolidayOverrides(ctx) {
  const { getState, normalizeHolidayOverrides } = ctx;
  const state = getState();
  state.settings.holidayOverrides = normalizeHolidayOverrides(state.settings.holidayOverrides);
  return state.settings.holidayOverrides;
}

/* Compute the plain (non-overridden) holidays for a year and stateCode. */
export function getBaseHolidays(year, stateCode) {
  const list = [];
  const easter = easterSunday(year);
  list.push({ date: `${year}-01-01`, name: 'Neujahr' });
  list.push({ date: dateISO(addDays(easter, -2)), name: 'Karfreitag' });
  list.push({ date: dateISO(addDays(easter, 1)),  name: 'Ostermontag' });
  list.push({ date: `${year}-05-01`, name: 'Tag der Arbeit' });
  list.push({ date: dateISO(addDays(easter, 39)), name: 'Christi Himmelfahrt' });
  list.push({ date: dateISO(addDays(easter, 50)), name: 'Pfingstmontag' });
  list.push({ date: `${year}-10-03`, name: 'Tag der Deutschen Einheit' });
  list.push({ date: `${year}-12-25`, name: '1. Weihnachtsfeiertag' });
  list.push({ date: `${year}-12-26`, name: '2. Weihnachtsfeiertag' });
  if (['BW','BY','ST'].includes(stateCode)) list.push({ date: `${year}-01-06`, name: 'Heilige Drei Könige' });
  if (stateCode === 'BE' && year >= 2019) list.push({ date: `${year}-03-08`, name: 'Internationaler Frauentag' });
  if (stateCode === 'MV' && year >= 2023) list.push({ date: `${year}-03-08`, name: 'Internationaler Frauentag' });
  if (['BW','BY','HE','NW','RP','SL','SN','TH'].includes(stateCode)) list.push({ date: dateISO(addDays(easter, 60)), name: 'Fronleichnam' });
  if (['SL','BY'].includes(stateCode)) list.push({ date: `${year}-08-15`, name: 'Mariä Himmelfahrt' });
  if (stateCode === 'TH' && year >= 2019) list.push({ date: `${year}-09-20`, name: 'Weltkindertag' });
  if (year === 2017) {
    list.push({ date: `${year}-10-31`, name: 'Reformationstag' });
  } else {
    const refStates = ['BB','MV','SN','ST','TH','HB','HH','NI','SH'];
    if (refStates.includes(stateCode)) list.push({ date: `${year}-10-31`, name: 'Reformationstag' });
  }
  if (['BW','BY','NW','RP','SL'].includes(stateCode)) list.push({ date: `${year}-11-01`, name: 'Allerheiligen' });
  if (stateCode === 'SN') {
    const nov23 = new Date(year, 10, 23);
    const dow = nov23.getDay();
    const diff = ((dow - 3 + 7) % 7) || 7;
    list.push({ date: dateISO(addDays(nov23, -diff)), name: 'Buß- und Bettag' });
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export function renderHolidayList(ctx) {
  const { getState, escapeHtml, formatDate } = ctx;
  const state = getState();
  const container = document.getElementById('holiday-list');
  if (!container) return;
  const stateCode = state.settings.state || 'HE';
  const yearInput = document.getElementById('holiday-year');
  const year = Math.max(1900, Math.min(2100, parseInt(yearInput?.value || new Date().getFullYear(), 10) || new Date().getFullYear()));
  const ov = ensureHolidayOverrides(ctx);

  const base = getBaseHolidays(year, stateCode);
  const rows = base.map(h => {
    const disabled = ov.disable.includes(h.date);
    const renamedTo = ov.rename[h.date] || null;
    return {
      kind: 'base',
      date: h.date,
      original: h.name,
      display: disabled ? h.name : (renamedTo || h.name),
      disabled,
      renamed: !!renamedTo,
    };
  });
  const yearPrefix = `${year}-`;
  ov.add
    .filter(x => x.date.startsWith(yearPrefix) && (!x.stateCode || x.stateCode === stateCode))
    .forEach(x => rows.push({ kind: 'custom', date: x.date, display: x.name, stateCode: x.stateCode || '' }));
  rows.sort((a, b) => a.date.localeCompare(b.date));

  if (!rows.length) {
    container.innerHTML = '<div class="empty-state" style="padding:1rem;">Keine Feiertage in diesem Jahr.</div>';
    return;
  }

  container.innerHTML = rows.map(r => {
    const dateLabel = formatDate(r.date);
    if (r.kind === 'base') {
      const badges = [];
      if (r.disabled) badges.push('<span class="holiday-tag holiday-tag-disabled">deaktiviert</span>');
      if (r.renamed && !r.disabled) badges.push('<span class="holiday-tag holiday-tag-renamed">umbenannt</span>');
      const actions = r.disabled
        ? `<button type="button" class="btn-secondary btn-small" data-holiday-action="enable" data-date="${r.date}">Aktivieren</button>`
        : `<button type="button" class="btn-secondary btn-small" data-holiday-action="rename" data-date="${r.date}">Umbenennen</button>
           <button type="button" class="btn-secondary btn-small" data-holiday-action="disable" data-date="${r.date}">Deaktivieren</button>`;
      const resetBtn = (r.renamed || r.disabled)
        ? `<button type="button" class="btn-secondary btn-small" data-holiday-action="reset" data-date="${r.date}">Zurücksetzen</button>`
        : '';
      return `
        <div class="holiday-row ${r.disabled ? 'is-disabled' : ''}">
          <div class="holiday-main">
            <div class="holiday-date">${dateLabel}</div>
            <div class="holiday-name">${escapeHtml(r.display)} ${badges.join(' ')}</div>
          </div>
          <div class="holiday-actions">${actions} ${resetBtn}</div>
        </div>`;
    }
    return `
      <div class="holiday-row is-custom">
        <div class="holiday-main">
          <div class="holiday-date">${dateLabel}</div>
          <div class="holiday-name">${escapeHtml(r.display)} <span class="holiday-tag holiday-tag-custom">${r.stateCode ? escapeHtml(r.stateCode) : 'eigener'}</span></div>
        </div>
        <div class="holiday-actions">
          <button type="button" class="btn-secondary btn-small" data-holiday-action="edit-custom" data-date="${r.date}">Bearbeiten</button>
          <button type="button" class="btn-secondary btn-small" data-holiday-action="delete-custom" data-date="${r.date}">Löschen</button>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('[data-holiday-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-holiday-action');
      const date = btn.getAttribute('data-date');
      handleHolidayAction(action, date, ctx);
    });
  });
}

export function handleHolidayAction(action, date, ctx) {
  const { getState, saveState, toast } = ctx;
  const state = getState();
  const ov = ensureHolidayOverrides(ctx);
  if (action === 'disable') {
    if (!ov.disable.includes(date)) ov.disable.push(date);
    saveState(); renderHolidayList(ctx);
    toast('Feiertag deaktiviert');
  } else if (action === 'enable') {
    ov.disable = ov.disable.filter(d => d !== date);
    saveState(); renderHolidayList(ctx);
    toast('Feiertag wieder aktiv');
  } else if (action === 'reset') {
    ov.disable = ov.disable.filter(d => d !== date);
    delete ov.rename[date];
    saveState(); renderHolidayList(ctx);
    toast('Zurückgesetzt');
  } else if (action === 'rename') {
    const current = ov.rename[date] || (getBaseHolidays(Number(date.slice(0,4)), state.settings.state || 'HE').find(h => h.date === date)?.name || '');
    const next = prompt('Neue Bezeichnung:', current);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) { delete ov.rename[date]; } else { ov.rename[date] = trimmed.slice(0, 60); }
    saveState(); renderHolidayList(ctx);
    toast('Umbenannt');
  } else if (action === 'delete-custom') {
    if (!confirm('Diesen Feiertag löschen?')) return;
    ov.add = ov.add.filter(x => x.date !== date);
    saveState(); renderHolidayList(ctx);
    toast('Gelöscht');
  } else if (action === 'edit-custom') {
    const existing = ov.add.find(x => x.date === date);
    if (existing) openHolidayModal(existing, ctx);
  }
}

export function openHolidayModal(existing, ctx) {
  const modal = document.getElementById('modal-holiday');
  document.getElementById('modal-holiday-title').textContent = existing ? 'Feiertag bearbeiten' : 'Feiertag hinzufügen';
  document.getElementById('holiday-original-date').value = existing?.date || '';
  document.getElementById('holiday-date').value = existing?.date || `${document.getElementById('holiday-year').value}-01-01`;
  document.getElementById('holiday-name').value = existing?.name || '';
  document.getElementById('holiday-state').value = existing?.stateCode || '';
  modal.classList.remove('hidden');
}

export function saveHoliday(ev, ctx) {
  ev.preventDefault();
  const { saveState, closeModals, toast } = ctx;
  const originalDate = document.getElementById('holiday-original-date').value;
  const date = document.getElementById('holiday-date').value;
  const name = document.getElementById('holiday-name').value.trim();
  const stateCode = document.getElementById('holiday-state').value || '';
  if (!date || !name) { toast('Datum und Bezeichnung angeben'); return; }
  const ov = ensureHolidayOverrides(ctx);
  if (originalDate) {
    const idx = ov.add.findIndex(x => x.date === originalDate);
    if (idx >= 0) ov.add[idx] = { date, name: name.slice(0, 60), stateCode };
    else ov.add.push({ date, name: name.slice(0, 60), stateCode });
  } else {
    if (ov.add.some(x => x.date === date && (x.stateCode || '') === stateCode)) {
      toast('Existiert bereits');
      return;
    }
    ov.add.push({ date, name: name.slice(0, 60), stateCode });
  }
  saveState();
  closeModals();
  renderHolidayList(ctx);
  toast('Gespeichert');
}
