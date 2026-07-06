// modules/ui/templates.js
// Notiz-Vorlagen-Verwaltung: Filter nach App-Modus, Picker-Befuellung,
// Liste im Settings-Tab, Modal (Anlegen/Bearbeiten/Loeschen).
// Reine Funktionen mit ctx-DI - kein Modul-State, keine globalen Referenzen.
//
// ctx = {
//   getState,          // liefert state (templates)
//   saveState,
//   getAppMode,        // 'employee' | 'freelance'
//   isFreelance,
//   escapeHtml,
//   uid,
//   closeModals,
//   toast,
// }

/**
 * Filtert Templates nach aktivem App-Modus.
 * scope 'both' immer sichtbar, 'employee' nur im Angestellt-Modus,
 * 'freelance' nur im Freelance-Modus. Kein scope = 'both' (defensiv).
 */
export function templateMatchesMode(tpl, ctx) {
  const s = tpl && tpl.scope;
  if (!s || s === 'both') return true;
  return s === ctx.getAppMode();
}

export function populateTemplatePicker(selectId, ctx) {
  const { getState, escapeHtml } = ctx;
  const state = getState();
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const visible = state.templates.filter(t => templateMatchesMode(t, ctx));
  sel.innerHTML = '<option value="">Vorlage einfügen …</option>' +
    visible.map(t => `<option value="${escapeHtml(t.text)}">${escapeHtml(t.label)}</option>`).join('');
  sel.value = '';
}

export function renderTemplates(ctx) {
  const { getState, saveState, escapeHtml, toast } = ctx;
  const state = getState();
  const container = document.getElementById('templates-list');
  if (!container) return;
  if (!state.templates.length) {
    container.innerHTML = '<div class="empty-state" style="padding:1rem;">Keine Vorlagen.</div>';
    return;
  }
  container.innerHTML = state.templates.map(t => {
    const scope = t.scope || 'both';
    const scopeLabel = scope === 'employee' ? 'Nur Angestellt' : scope === 'freelance' ? 'Nur Freiberuflich' : 'Beide Modi';
    const scopeCls = `tpl-scope tpl-scope-${scope}`;
    return `
    <div class="template-card" data-id="${t.id}">
      <div class="template-body" data-role="edit">
        <div class="label">${escapeHtml(t.label)} <span class="${scopeCls}">${scopeLabel}</span></div>
        <div class="preview">${escapeHtml(t.text)}</div>
      </div>
      <button type="button" class="template-delete" data-role="delete" aria-label="Vorlage löschen" title="Vorlage löschen">✕</button>
    </div>
  `;
  }).join('');
  container.querySelectorAll('.template-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('[data-role="edit"]').addEventListener('click', () => {
      openTemplateModal(state.templates.find(t => t.id === id), ctx);
    });
    card.querySelector('[data-role="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      const tpl = state.templates.find(t => t.id === id);
      if (!tpl) return;
      if (!confirm(`Vorlage „${tpl.label}“ wirklich löschen?`)) return;
      state.templates = state.templates.filter(t => t.id !== id);
      saveState();
      renderTemplates(ctx);
      toast('Vorlage gelöscht');
    });
  });
}

export function openTemplateModal(tpl, ctx) {
  const { isFreelance } = ctx;
  const modal = document.getElementById('modal-template');
  const isNew = !tpl;
  document.getElementById('modal-template-title').textContent = isNew ? 'Neue Vorlage' : 'Vorlage bearbeiten';
  document.getElementById('template-id').value = tpl?.id || '';
  document.getElementById('template-label').value = tpl?.label || '';
  document.getElementById('template-text').value = tpl?.text || '';
  // Vor-Belegung des Scope-Feldes: bestehende Vorlage uebernehmen; bei neuer Vorlage sinnvoller Default
  const scopeSel = document.getElementById('template-scope');
  if (scopeSel) {
    if (isNew) {
      // Beim Neuanlegen im Freelance-Modus 'freelance' vorschlagen, sonst 'both'
      scopeSel.value = isFreelance() ? 'freelance' : 'both';
    } else {
      const s = tpl.scope;
      scopeSel.value = (s === 'employee' || s === 'freelance') ? s : 'both';
    }
  }
  document.getElementById('btn-delete-template').classList.toggle('hidden', isNew);
  modal.classList.remove('hidden');
}

export function saveTemplate(ev, ctx) {
  ev.preventDefault();
  const { getState, saveState, uid, closeModals, toast } = ctx;
  const state = getState();
  const id = document.getElementById('template-id').value;
  const scopeVal = document.getElementById('template-scope')?.value;
  const scope = (scopeVal === 'employee' || scopeVal === 'freelance') ? scopeVal : 'both';
  const data = {
    label: document.getElementById('template-label').value.trim(),
    text: document.getElementById('template-text').value.trim(),
    scope,
  };
  if (!data.label || !data.text) { toast('Bitte Bezeichnung und Text angeben'); return; }
  if (id) {
    const idx = state.templates.findIndex(t => t.id === id);
    if (idx >= 0) state.templates[idx] = { ...state.templates[idx], ...data };
  } else {
    state.templates.push({ id: uid(), ...data });
  }
  saveState();
  closeModals();
  renderTemplates(ctx);
  toast('Gespeichert');
}

export function deleteTemplate(ctx) {
  const { getState, saveState, closeModals, toast } = ctx;
  const state = getState();
  const id = document.getElementById('template-id').value;
  if (!id) return;
  if (!confirm('Vorlage löschen?')) return;
  state.templates = state.templates.filter(t => t.id !== id);
  saveState();
  closeModals();
  renderTemplates(ctx);
  toast('Gelöscht');
}
