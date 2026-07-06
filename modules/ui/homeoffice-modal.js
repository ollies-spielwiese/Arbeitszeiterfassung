// modules/ui/homeoffice-modal.js
// Home-Office-Modal (Multi-Segment-Erfassung).
// Reine Funktionen mit ctx-DI - kein Modul-State, keine globalen Referenzen.
//
// ctx = {
//   getState,                       // liefert state (entries, employers, activeEmployerId)
//   saveState,
//   getEmployer,
//   escapeHtml,
//   todayISO,
//   formatDate,
//   populateTemplatePicker,
//   buildHomeofficeSegmentsHTML,    // pure HTML-Builder aus render/tracker.js
//   computeHomeofficeMinutes,
//   minutesToHM,
//   hhmmToMinutes,
//   normalizeSegments,              // pure Funktion (app.js besitzt, wird auch von Migration genutzt)
//   renderTracker,
//   renderEntries,
//   renderWeek,
//   renderReport,
//   closeModals,
//   toast,
//   uid,
// }

export function openHomeofficeModal(entry, opts, ctx) {
  opts = opts || {};
  const { getState, escapeHtml, todayISO, populateTemplatePicker } = ctx;
  const state = getState();
  const modal = document.getElementById('modal-homeoffice');
  const title = document.getElementById('modal-homeoffice-title');
  const empSel = document.getElementById('ho-employer');
  const dateInput = document.getElementById('ho-date');
  const noteInput = document.getElementById('ho-note');
  const idInput = document.getElementById('ho-id');
  const delBtn = document.getElementById('btn-delete-homeoffice');

  empSel.innerHTML = state.employers
    .map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');

  if (entry && entry.id) {
    title.textContent = 'Home-Office-Tag bearbeiten';
    idInput.value = entry.id;
    empSel.value = entry.employerId || state.activeEmployerId || '';
    dateInput.value = entry.date || todayISO();
    noteInput.value = entry.note || '';
    const segs = Array.isArray(entry.segments) && entry.segments.length
      ? entry.segments.map(s => ({ start: s.start || '', end: s.end || '' }))
      : (entry.start && entry.end ? [{ start: entry.start, end: entry.end }] : [{ start: '', end: '' }]);
    modal.dataset.segments = JSON.stringify(segs);
    delBtn.classList.remove('hidden');
  } else {
    title.textContent = 'Home-Office-Tag';
    idInput.value = '';
    const preferredEmp = opts.employerId || state.activeEmployerId || state.employers[0]?.id || '';
    empSel.value = preferredEmp;
    dateInput.value = opts.date || todayISO();
    noteInput.value = '';
    const existing = state.entries.find(x =>
      x.type === 'homeoffice' && x.employerId === empSel.value && x.date === dateInput.value
    );
    if (existing) {
      title.textContent = 'Home-Office-Tag bearbeiten';
      idInput.value = existing.id;
      noteInput.value = existing.note || '';
      const segs = Array.isArray(existing.segments) && existing.segments.length
        ? existing.segments.map(s => ({ start: s.start || '', end: s.end || '' }))
        : [{ start: '', end: '' }];
      segs.push({ start: '', end: '' });
      modal.dataset.segments = JSON.stringify(segs);
      delBtn.classList.remove('hidden');
    } else {
      modal.dataset.segments = JSON.stringify([{ start: '', end: '' }]);
      delBtn.classList.add('hidden');
    }
  }

  updateHomeofficeContext(ctx);
  renderHomeofficeSegments(ctx);
  populateTemplatePicker('ho-note-tpl');
  modal.classList.remove('hidden');
}

export function updateHomeofficeContext(ctx) {
  const { getState, getEmployer, escapeHtml, formatDate } = ctx;
  const el = document.getElementById('ho-context');
  if (!el) return;
  const empId = document.getElementById('ho-employer').value;
  const dateISO = document.getElementById('ho-date').value;
  const currentId = document.getElementById('ho-id').value;
  const emp = getEmployer(empId);
  const empName = emp ? emp.name : '—';
  let dateLabel = '—';
  if (dateISO) {
    try {
      const d = new Date(dateISO + 'T00:00:00');
      const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()];
      dateLabel = `${wd}. ${formatDate(dateISO)}`;
    } catch (e) { dateLabel = formatDate(dateISO); }
  }
  const state = getState();
  const existing = state.entries.find(x =>
    x.type === 'homeoffice' && x.employerId === empId && x.date === dateISO && x.id !== currentId
  );
  const hint = (currentId || existing)
    ? 'Weitere Blöcke werden zu diesem Tag hinzugefügt.'
    : 'Neuer Eintrag — spätere Blöcke landen automatisch im selben Eintrag.';
  el.innerHTML = `
    <div class="ho-context-line">${escapeHtml(dateLabel)} · ${escapeHtml(empName)}</div>
    <div class="ho-context-hint">${hint}</div>
  `;
}

export function readHomeofficeSegmentsFromDom() {
  const container = document.getElementById('ho-segments');
  const rows = container.querySelectorAll('.ho-segment-row');
  const segs = [];
  rows.forEach(row => {
    const start = row.querySelector('input[data-seg-start]').value || '';
    const end = row.querySelector('input[data-seg-end]').value || '';
    segs.push({ start, end });
  });
  return segs;
}

export function persistHomeofficeSegmentsToState() {
  const modal = document.getElementById('modal-homeoffice');
  modal.dataset.segments = JSON.stringify(readHomeofficeSegmentsFromDom());
}

export function renderHomeofficeSegments(ctx) {
  const { buildHomeofficeSegmentsHTML } = ctx;
  const modal = document.getElementById('modal-homeoffice');
  const container = document.getElementById('ho-segments');
  let segs;
  try { segs = JSON.parse(modal.dataset.segments || '[]'); } catch (e) { segs = []; }
  container.innerHTML = buildHomeofficeSegmentsHTML(segs);
  updateHomeofficeLiveTotal(ctx);
}

export function addHomeofficeSegment(ctx) {
  persistHomeofficeSegmentsToState();
  const modal = document.getElementById('modal-homeoffice');
  const segs = JSON.parse(modal.dataset.segments || '[]');
  segs.push({ start: '', end: '' });
  modal.dataset.segments = JSON.stringify(segs);
  renderHomeofficeSegments(ctx);
}

export function removeHomeofficeSegment(idx, ctx) {
  persistHomeofficeSegmentsToState();
  const modal = document.getElementById('modal-homeoffice');
  const segs = JSON.parse(modal.dataset.segments || '[]');
  segs.splice(idx, 1);
  if (!segs.length) segs.push({ start: '', end: '' });
  modal.dataset.segments = JSON.stringify(segs);
  renderHomeofficeSegments(ctx);
}

export function updateHomeofficeLiveTotal(ctx) {
  const { computeHomeofficeMinutes, minutesToHM } = ctx;
  const el = document.getElementById('ho-live-total');
  if (!el) return;
  const segs = readHomeofficeSegmentsFromDom();
  const totalMin = computeHomeofficeMinutes({ segments: segs });
  el.textContent = minutesToHM(totalMin);
}

export function saveHomeoffice(e, ctx) {
  const {
    getState, saveState, hhmmToMinutes, normalizeSegments,
    renderTracker, renderEntries, renderWeek, renderReport,
    closeModals, toast, uid,
  } = ctx;
  if (e && e.preventDefault) e.preventDefault();
  const state = getState();
  const id = document.getElementById('ho-id').value;
  const employerId = document.getElementById('ho-employer').value;
  const date = document.getElementById('ho-date').value;
  const note = document.getElementById('ho-note').value.trim();
  const rawSegs = readHomeofficeSegmentsFromDom();
  const segments = rawSegs
    .filter(s => s.start && s.end)
    .map(s => ({ start: s.start, end: s.end }));

  if (!employerId) { toast('Bitte Arbeitgeber wählen'); return; }
  if (!date) { toast('Bitte Datum wählen'); return; }
  if (!segments.length) { toast('Bitte mindestens einen Arbeitsblock erfassen'); return; }

  for (const s of segments) {
    const sm = hhmmToMinutes(s.start);
    const em = hhmmToMinutes(s.end);
    if (em <= sm) {
      toast(`Ungültiger Block ${s.start}–${s.end}: Ende muss nach Beginn liegen. Für Über-Mitternacht bitte zwei Blöcke erfassen (bis 23:59 und ab 00:00 am Folgetag).`);
      return;
    }
  }

  const targetIdx = state.entries.findIndex(x =>
    x.type === 'homeoffice' && x.employerId === employerId && x.date === date && x.id !== id
  );
  const editingIdx = id ? state.entries.findIndex(x => x.id === id) : -1;

  if (id && editingIdx >= 0 && targetIdx < 0) {
    state.entries[editingIdx] = {
      ...state.entries[editingIdx],
      employerId, date, type: 'homeoffice',
      segments: normalizeSegments(segments),
      note,
      start: undefined, end: undefined, breakMinutes: undefined, overtimeReason: undefined,
    };
  } else if (targetIdx >= 0) {
    const target = state.entries[targetIdx];
    const existingSegs = Array.isArray(target.segments) ? target.segments
      : (target.start && target.end ? [{ start: target.start, end: target.end }] : []);
    target.segments = normalizeSegments([...existingSegs, ...segments]);
    target.type = 'homeoffice';
    target.start = undefined; target.end = undefined;
    target.breakMinutes = undefined; target.overtimeReason = undefined;
    if (note && !target.note) target.note = note;
    else if (note && target.note && !target.note.includes(note)) target.note = `${target.note} · ${note}`;
    if (editingIdx >= 0 && editingIdx !== targetIdx) {
      state.entries.splice(editingIdx, 1);
    }
  } else {
    state.entries.push({
      id: uid(),
      employerId, date, type: 'homeoffice',
      segments: normalizeSegments(segments),
      note,
      createdAt: new Date().toISOString(),
    });
  }
  saveState();
  closeModals();
  renderTracker();
  renderEntries();
  renderWeek();
  renderReport();
  toast('Gespeichert');
}

export function deleteHomeoffice(ctx) {
  const {
    getState, saveState, renderTracker, renderEntries, renderWeek, renderReport,
    closeModals, toast,
  } = ctx;
  const state = getState();
  const id = document.getElementById('ho-id').value;
  if (!id) return;
  if (!confirm('Diesen Home-Office-Tag wirklich löschen?')) return;
  state.entries = state.entries.filter(e => e.id !== id);
  saveState();
  closeModals();
  renderTracker();
  renderEntries();
  renderWeek();
  renderReport();
  toast('Gelöscht');
}
