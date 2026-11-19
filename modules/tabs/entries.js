// @ts-check
/**
 * modules/tabs/entries.js (seit v3.15.1, Roadmap 3 Stufe 2)
 *
 * Reiter „Einträge“: Filter nach Arbeitgeber und Monat, Liste der Einträge,
 * Klick öffnet den passenden Dialog. Die HTML-Bausteine liegen in
 * modules/render/entries.js, die Zeilenberechnung in modules/selectors.js.
 *
 * Regeln für modules/tabs/: kein Import von app.js, kein window.state,
 * alles Zustandsabhängige über toAppContext(ctx).
 */
import { toAppContext } from '../app-context.js';
import { buildEntriesHTML } from '../render/entries.js';
import { computeEntryRows } from '../selectors.js';
import { currentYearMonth, formatDateLong } from '../util-time.js';
import { isFormerEmployer, filterVisibleEmployers } from '../compute.js';
import { getNightShiftRule } from '../night-shift.js';
import { applyDataColors } from '../util-format.js';

/**
 * @param {any} ctx
 */
export function renderEntries(ctx) {
  const cx = toAppContext(ctx);
  const filterSel = /** @type {HTMLSelectElement|null} */ (document.getElementById('filter-employer'));
  const monthInput = /** @type {HTMLInputElement|null} */ (document.getElementById('filter-month'));
  const container = document.getElementById('entries-list');
  if (!filterSel || !monthInput || !container) return;
  const formerCb = /** @type {HTMLInputElement|null} */ (document.getElementById('show-former-employers-entries'));
  const showFormer = !!cx.ui.showFormerEmployers();
  if (formerCb) formerCb.checked = showFormer;
  const esc = cx.format.escapeHtml;
  const state = cx.state.get();

  const currentEmpFilter = filterSel.value;
  const today = cx.data.todayISO();
  const visibleEmployers = filterVisibleEmployers(state.employers, today, {
    showAll: showFormer,
    includeIds: [currentEmpFilter],
  });
  filterSel.innerHTML =
    `<option value="">Alle Arbeitgeber</option>` +
    visibleEmployers.map((/** @type {any} */ e) => `<option value="${esc(e.id)}">${esc(e.name)}${isFormerEmployer(e, today) ? ' (ehemalig)' : ''}</option>`).join('');
  filterSel.value = currentEmpFilter || '';

  if (!monthInput.value) monthInput.value = currentYearMonth();

  const empFilter = filterSel.value;
  const monthFilter = monthInput.value;

  let list = [...state.entries];
  if (empFilter) list = list.filter((e) => e.employerId === empFilter);
  else if (!showFormer) list = list.filter((e) => !isFormerEmployer(cx.data.employer(e.employerId), today));
  if (monthFilter) list = list.filter((e) => e.date.startsWith(monthFilter));

  list.sort((a, b) => b.date.localeCompare(a.date) || (b.start || '').localeCompare(a.start || ''));

  if (!list.length) {
    container.innerHTML = '<div class="empty-state">Keine Einträge in diesem Zeitraum.</div>';
    return;
  }

  const rows = computeEntryRows(list, {
    getEmployer: cx.data.employer,
    computeWorkMinutes: cx.compute.workMinutes,
    computeHomeofficeMinutes: cx.compute.homeofficeMinutes,
    computeMonthTargetMinutes: cx.compute.monthTargetMinutes,
    countWorkdaysInMonth: cx.compute.workdaysInMonth,
    allEntries: state.entries,
    nightShiftRule: getNightShiftRule(state.settings),
    minutesToHM: cx.format.minutesToHM,
  });
  container.innerHTML = buildEntriesHTML(rows, {
    escapeHtml: esc,
    formatDateLong,
    minutesToHM: cx.format.minutesToHM,
  });
  applyDataColors(container);

  container.querySelectorAll('.entry-card').forEach((card) => {
    const el = /** @type {HTMLElement} */ (card);
    el.addEventListener('click', () => {
      const entry = cx.state.get().entries.find((/** @type {any} */ e) => e.id === el.dataset.id);
      if (!entry) return;
      if (entry.type === 'homeoffice') cx.ui.openHomeofficeModal(entry);
      else cx.ui.openEntryModal(entry);
    });
  });
}
