/**
 * modules/bootstrap.js
 *
 * Event-Wiring (Phase 3.10b, aus app.js extrahiert).
 *
 * Verdrahtet ALLE addEventListener-Calls auf UI-Elemente und startet
 * das initiale Rendering. Nimmt ctx mit allen benötigten Handler-Referenzen
 * (state, saveState, Renderer, Modal-Öffner, Export/Backup, Toast, Storage,
 * SW-Init, What's-New).
 *
 * Aufruf in app.js:
 *   import { wireEvents } from './modules/bootstrap.js';
 *   document.addEventListener('DOMContentLoaded', () => wireEvents({ state, ... }));
 *
 * WICHTIG: Der DOMContentLoaded-Handler muss in app.js registriert werden,
 * nicht hier. In type=module (defer-Semantik) lädt bootstrap.js nachträglich,
 * das Event wäre dann schon gefeuert und die App würde nicht booten.
 */

/**
 * wireEvents(ctx) — registriert alle addEventListener-Calls auf UI-Elemente.
 * WICHTIG: darf NUR aus einem DOMContentLoaded-Handler heraus aufgerufen werden.
 * Ein separater DOMContentLoaded-Registrar innerhalb dieses Moduls würde in
 * type=module (defer-Semantik) das Event verpassen und die App bootet nicht.
 */
export function wireEvents(ctx) {
  const {
    // State + Storage
    state, saveState, storage,
    // Views + Rendering
    switchView, renderTracker, renderEntries, renderEmployers, renderReport,
    renderTemplates, renderWeek, renderOverview, renderHolidayList,
    // Tracker/Timer + Mode
    startWork, endWork, setMode, updateModeVisibility,
    // Entry Modal
    openEntryModal, saveEntry, deleteEntry,
    updateEntryTypeFields, updateScheduleFillVisibility, updateBreakHint,
    applyScheduleToEntry,
    // Homeoffice Modal
    openHomeofficeModal, saveHomeoffice, deleteHomeoffice,
    addHomeofficeSegment, updateHomeofficeContext,
    removeHomeofficeSegment, updateHomeofficeLiveTotal,
    // Employer Modal
    openEmployerModal, saveEmployer, deleteEmployer,
    updateHoursModeVisibility,
    // Template Modal
    openTemplateModal, saveTemplate, deleteTemplate,
    // Holiday Modal
    openHolidayModal, saveHoliday,
    // Export
    exportWord, exportPdf, exportOverviewPdf,
    openShareModal, shareOverviewPdf, archiveCurrentMonth,
    // Backup
    exportBackup, importBackup,
    // UI-Utilities
    toast, closeModals, escapeHtml,
    // Compute-Helpers (für Entry-Form-Live-Berechnung)
    getEmployer, computeSuggestedBreak,
    // Week-Input Fallback
    installWeekInputFallback,
    // Lifecycle
    maybeShowWhatsNew, initServiceWorkerUpdates,
  } = ctx;

  // Tab nav
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

    // Tracker
    document.getElementById('active-employer').addEventListener('change', (e) => {
      if (state.runningTimer) { toast('Nicht möglich während laufender Zeiterfassung'); e.target.value = state.activeEmployerId; return; }
      state.activeEmployerId = e.target.value;
      saveState();
      renderTracker();
    });
    document.getElementById('btn-start').addEventListener('click', startWork);
    document.getElementById('btn-end').addEventListener('click', endWork);
    document.getElementById('btn-add-manual').addEventListener('click', () => openEntryModal(null, { presetType: 'work' }));
    document.getElementById('btn-add-absence').addEventListener('click', () => openEntryModal(null, { presetType: 'vacation' }));

    // Mode-Toggle (Präsenz / Home-Office)
    const modeP = document.getElementById('mode-praesenz');
    const modeH = document.getElementById('mode-homeoffice');
    if (modeP) modeP.addEventListener('click', () => {
      if (state.runningTimer) { toast('Nicht möglich während laufender Zeiterfassung'); return; }
      setMode('praesenz');
    });
    if (modeH) modeH.addEventListener('click', () => {
      if (state.runningTimer) { toast('Nicht möglich während laufender Zeiterfassung'); return; }
      setMode('homeoffice');
    });

    // Home-Office Modal
    const btnAddHO = document.getElementById('btn-add-homeoffice');
    if (btnAddHO) btnAddHO.addEventListener('click', () => openHomeofficeModal(null, {}));
    const formHO = document.getElementById('form-homeoffice');
    if (formHO) formHO.addEventListener('submit', saveHomeoffice);
    const btnDelHO = document.getElementById('btn-delete-homeoffice');
    if (btnDelHO) btnDelHO.addEventListener('click', deleteHomeoffice);
    const btnHoAdd = document.getElementById('btn-ho-add-segment');
    if (btnHoAdd) btnHoAdd.addEventListener('click', addHomeofficeSegment);
    const hoEmpSel = document.getElementById('ho-employer');
    const hoDateInput = document.getElementById('ho-date');
    if (hoEmpSel) hoEmpSel.addEventListener('change', updateHomeofficeContext);
    if (hoDateInput) hoDateInput.addEventListener('change', updateHomeofficeContext);
    const hoSegments = document.getElementById('ho-segments');
    if (hoSegments) {
      // Delegation: Segment entfernen
      hoSegments.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove-segment]');
        if (!btn) return;
        const idx = parseInt(btn.dataset.removeSegment, 10);
        if (!Number.isNaN(idx)) removeHomeofficeSegment(idx);
      });
      // Delegation: Live-Total bei Input-Änderung
      hoSegments.addEventListener('input', (e) => {
        if (e.target.matches('input[type="time"]')) updateHomeofficeLiveTotal();
      });
      hoSegments.addEventListener('change', (e) => {
        if (e.target.matches('input[type="time"]')) updateHomeofficeLiveTotal();
      });
    }

    // Entry modal
    document.getElementById('form-entry').addEventListener('submit', saveEntry);
    document.getElementById('btn-delete-entry').addEventListener('click', deleteEntry);
    document.getElementById('entry-type').addEventListener('change', updateEntryTypeFields);
    document.getElementById('entry-employer').addEventListener('change', () => { updateScheduleFillVisibility(); updateBreakHint(); });
    document.getElementById('entry-date').addEventListener('change', updateScheduleFillVisibility);
    document.getElementById('btn-apply-schedule').addEventListener('click', applyScheduleToEntry);
    ['entry-start', 'entry-end'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        const empId = document.getElementById('entry-employer').value;
        const emp = getEmployer(empId);
        const start = document.getElementById('entry-start').value;
        const end = document.getElementById('entry-end').value;
        if (emp && start && end && emp.breakMode !== 'manual' && emp.breakMode !== 'none') {
          const suggested = computeSuggestedBreak(start, end, emp.breakMode);
          if (suggested !== null && (emp.breakMode === 'legal' || parseInt(document.getElementById('entry-break').value) === 0)) {
            document.getElementById('entry-break').value = suggested;
          }
        }
        updateBreakHint();
      });
    });

    // Template pickers in entry form
    document.querySelectorAll('.template-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) return;
        const targetId = e.target.dataset.target;
        const targetEl = document.getElementById(targetId);
        const current = targetEl.value.trim();
        targetEl.value = current ? `${current}\n${val}` : val;
        e.target.value = '';
        targetEl.focus();
      });
    });

    // Employer modal
    document.getElementById('btn-add-employer').addEventListener('click', () => openEmployerModal(null));
    document.getElementById('form-employer').addEventListener('submit', saveEmployer);
    document.getElementById('btn-delete-employer').addEventListener('click', deleteEmployer);
    document.getElementById('employer-hours-mode').addEventListener('change', updateHoursModeVisibility);

    // Template modal
    document.getElementById('btn-add-template').addEventListener('click', () => openTemplateModal(null));
    document.getElementById('form-template').addEventListener('submit', saveTemplate);
    document.getElementById('btn-delete-template').addEventListener('click', deleteTemplate);

    // Filters
    document.getElementById('filter-employer').addEventListener('change', renderEntries);
    document.getElementById('filter-month').addEventListener('change', renderEntries);
    document.getElementById('week-employer').addEventListener('change', renderWeek);
    installWeekInputFallback(); // iOS Safari has no native week picker
    document.getElementById('week-input').addEventListener('change', renderWeek);
    document.getElementById('report-employer').addEventListener('change', renderReport);
    document.getElementById('report-month').addEventListener('change', renderReport);
    document.getElementById('overview-month').addEventListener('change', renderOverview);

    // Report actions
    document.getElementById('btn-export-word').addEventListener('click', exportWord);
    document.getElementById('btn-export-pdf').addEventListener('click', exportPdf);
    document.getElementById('btn-share').addEventListener('click', openShareModal);
    document.getElementById('btn-archive-month').addEventListener('click', archiveCurrentMonth);

    // Overview actions
    document.getElementById('btn-export-overview-pdf').addEventListener('click', exportOverviewPdf);
    document.getElementById('btn-share-overview').addEventListener('click', shareOverviewPdf);

    // Settings
    document.getElementById('setting-employee-name').addEventListener('change', (e) => {
      state.settings.employeeName = e.target.value.trim(); saveState();
    });
    document.getElementById('setting-own-email').addEventListener('change', (e) => {
      state.settings.ownEmail = e.target.value.trim(); saveState();
    });
    document.getElementById('setting-state').addEventListener('change', (e) => {
      state.settings.state = e.target.value; saveState();
      // Recompute if any view depends on it
      renderTracker();
      renderHolidayList();
    });

    // Modus-Umschalter
    document.querySelectorAll('input[name="setting-app-mode"]').forEach((r) => {
      r.addEventListener('change', (e) => {
        if (!e.target.checked) return;
        state.settings.appMode = e.target.value === 'freelance' ? 'freelance' : 'employee';
        saveState();
        updateModeVisibility();
        // Views neu rendern, da Labels sich ändern können
        renderTracker();
        renderEmployers();
        renderEntries();
        renderTemplates();
        if (typeof renderOverview === 'function') { try { renderOverview(); } catch (err) {} }
      });
    });

    // Holiday overrides
    const holidayYear = document.getElementById('holiday-year');
    if (holidayYear) holidayYear.addEventListener('change', renderHolidayList);
    const addHolidayBtn = document.getElementById('btn-add-holiday-override');
    if (addHolidayBtn) addHolidayBtn.addEventListener('click', () => openHolidayModal(null));
    const formHoliday = document.getElementById('form-holiday');
    if (formHoliday) formHoliday.addEventListener('submit', saveHoliday);

    // Backup
    document.getElementById('btn-export-backup').addEventListener('click', exportBackup);
    document.getElementById('btn-import-backup').addEventListener('click', () => document.getElementById('input-backup-file').click());
    document.getElementById('input-backup-file').addEventListener('change', (e) => {
      if (e.target.files[0]) importBackup(e.target.files[0]);
      e.target.value = '';
    });

    // Close modal
    document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeModals));
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', (e) => {
      if (e.target === m) closeModals();
    }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

    // Warn if not persistent
    if (!storage.isPersistent) {
      const banner = document.createElement('div');
      banner.style.cssText = 'background:#fef3c7;color:#92400e;padding:0.65rem 1rem;font-size:0.85rem;text-align:center;border-bottom:1px solid #fbbf24;';
      banner.innerHTML = '⚠️ Vorschaumodus – Daten werden nur während der Sitzung behalten. Auf dem Handy/Tablet installiert bleiben Daten dauerhaft gespeichert.';
      document.body.insertBefore(banner, document.body.firstChild);
    }

    renderTracker();
    updateModeVisibility();

    // Show what's new on first start of a new version
    maybeShowWhatsNew();

  initServiceWorkerUpdates();
}
