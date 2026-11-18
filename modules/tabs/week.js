// @ts-check
/**
 * modules/tabs/week.js (seit v3.15.2, Roadmap 3 Stufe 2)
 *
 * Reiter „Woche“: Auswahl Arbeitgeber und Kalenderwoche, Tageszeilen mit
 * Hinweisen zum Arbeitszeitgesetz und Kilometern, Zusammenfassung Ist/Soll/Saldo.
 * Dazu die Ersatzauswahl Jahr und KW für Browser ohne <input type="week">
 * (iPhone und iPad). Die HTML-Bausteine liegen in modules/render/week.js.
 *
 * Regeln für modules/tabs/: kein Import von app.js, kein window.state,
 * alles Zustandsabhängige über toAppContext(ctx).
 */
import { toAppContext } from '../app-context.js';
import { buildWeekHTML } from '../render/week.js';
import { renderSummaryHTML } from '../render/summary.js';
import { currentYearWeek, isoWeekToDates, isoWeeksInYear, pad } from '../util-time.js';
import { isFormerEmployer, filterVisibleEmployers, isWorkedEntry } from '../compute.js';
import { computeArbzgHints, arbzgHintsForEmployerDay, buildArbzgWeekBadgesHTML, isArbzgHintEnabled } from '../arbzg-hints.js';
import { isFieldServiceActive, entryKm, formatKm } from '../field-service.js';

/**
 * Zeichnet den Reiter Woche.
 * @param {any} ctx
 */
export function renderWeek(ctx) {
  const cx = toAppContext(ctx);
  const sel = /** @type {HTMLSelectElement} */ (document.getElementById('week-employer'));
  const wkInput = /** @type {HTMLInputElement} */ (document.getElementById('week-input'));
  const state = cx.state.get();
  const esc = cx.format.escapeHtml;

  const currentEmp = sel.value;
  const today = cx.data.todayISO();
  const visibleEmployers = filterVisibleEmployers(state.employers, today, {
    showAll: !!cx.ui.showFormerEmployers(),
    includeIds: [currentEmp, state.activeEmployerId],
  });
  sel.innerHTML = state.employers.length
    ? visibleEmployers.map((/** @type {any} */ e) => `<option value="${esc(e.id)}">${esc(e.name)}${isFormerEmployer(e, today) ? ' (ehemalig)' : ''}</option>`).join('')
    : '<option value="">— Kein Arbeitgeber —</option>';
  sel.value = currentEmp || state.activeEmployerId || visibleEmployers[0]?.id || '';

  if (!wkInput.value) wkInput.value = currentYearWeek();

  const empId = sel.value;
  const isoWeek = wkInput.value;
  const container = /** @type {HTMLElement} */ (document.getElementById('week-content'));

  if (!empId || !isoWeek) { container.innerHTML = '<div class="empty-state">Bitte Arbeitgeber und Woche wählen.</div>'; return; }

  const emp = cx.data.employer(empId);
  const dates = isoWeekToDates(isoWeek);
  const stateCode = state.settings.state || 'HE';

  // v3.12.0: Hinweise Arbeitszeitgesetz (alle Arbeitgeber zusammen) für die Tage dieser Woche.
  const arbzgHints = isArbzgHintEnabled(state.settings)
    ? computeArbzgHints(state.entries, state.employers, dates[0], dates[6]) : [];

  let totalMin = 0;
  const fsWeekActive = isFieldServiceActive(state.settings, empId);
  const dayModels = dates.map((d) => {
    const holiday = cx.compute.isHoliday(d, stateCode);
    const dayEntries = state.entries.filter((/** @type {any} */ e) => e.employerId === empId && e.date === d);
    const workMin = dayEntries.filter(isWorkedEntry).reduce((/** @type {number} */ s, /** @type {any} */ e) => s + cx.compute.workMinutes(e), 0);
    totalMin += workMin;
    const has = (/** @type {string} */ type) => dayEntries.some((/** @type {any} */ e) => e.type === type);

    const hoursDisplay = workMin ? cx.format.minutesToHM(workMin) : '–';
    let detail = '';
    if (has('vacation')) detail = 'Urlaub';
    else if (has('sick')) detail = 'Krank';
    else if (has('education_leave')) detail = 'Bildungsurlaub';
    else if (has('overtime_reduction')) detail = 'Überstundenabbau';
    else if (has('homeoffice') && !has('work')) {
      // Reine Home-Office-Tage: Segmente bleiben privat, nur Label anzeigen
      detail = 'Home-Office';
    } else if (dayEntries.length) {
      const parts = [];
      for (const e of dayEntries.filter((/** @type {any} */ e) => e.type === 'work')) parts.push(`${e.start}–${e.end}`);
      if (has('homeoffice')) parts.push('Home-Office');
      detail = parts.join(', ');
    }
    // Außendienst-Nachweis (seit v3.13.0): Kilometer des Tages.
    if (fsWeekActive) {
      const dayKm = dayEntries.reduce((/** @type {number} */ sum, /** @type {any} */ e) => sum + (e.type === 'work' ? entryKm(e) : 0), 0);
      if (dayKm > 0) detail += ` · ${formatKm(dayKm)} km`;
    }

    const arbzgHTML = buildArbzgWeekBadgesHTML(arbzgHintsForEmployerDay(arbzgHints, empId, d), esc);
    return { workMin, hoursDisplay, detail, isToday: d === today, holiday, arbzgHTML };
  });

  const targetMin = cx.compute.weekTargetMinutes(emp, dates);
  const holidaysInWeek = cx.compute.holidaysInRange(dates[0], dates[6], stateCode);

  // Gleiche Tageswerte wie Erfassen und Monat; Wochen über den Monatswechsel nutzen je Tag den eigenen Monat.
  const isCreditableAbsenceDay = (/** @type {string} */ date) => cx.compute.dayTargetMinutes(emp, date) > 0;
  const creditedOf = (/** @type {string} */ type) => state.entries
    .filter((/** @type {any} */ e) => e.employerId === empId && e.type === type && dates.includes(e.date) && isCreditableAbsenceDay(e.date));
  // Überstundenabbau (seit v3.9.46): NICHT gutgeschrieben, ein Gleittag verringert den Saldo.
  const sumCredited = (/** @type {string} */ type) => creditedOf(type)
    .reduce((/** @type {number} */ sum, /** @type {any} */ e) => sum + cx.compute.dayTargetMinutes(emp, e.date), 0);
  const creditedAbsenceMinWeek = Math.round(sumCredited('vacation') + sumCredited('sick') + sumCredited('education_leave'));
  const balance = totalMin + creditedAbsenceMinWeek - targetMin;

  const weekFields = cx.compute.summaryFields({
    workedMin: totalMin,
    targetMin,
    balance,
    hourlyRate: Number(emp.hourlyRate) || 0,
    currency: emp.currency || 'EUR',
    includeAbsences: false, // Woche zeigt keine Urlaub/Krank-Zähler
    includeHolidays: true,
    holidayCount: holidaysInWeek.length,
    creditedAbsenceMin: creditedAbsenceMinWeek,
    // Tageszähler für den Saldo-Tooltip (nur Tage mit tatsächlicher Gutschrift)
    vacationDays: creditedOf('vacation').length,
    sickDays: creditedOf('sick').length,
    educationLeaveDays: creditedOf('education_leave').length,
  });

  container.innerHTML = buildWeekHTML(
    { emp, isoWeek, dates, dayModels, weekFields },
    { escapeHtml: esc, formatDate: cx.format.date, renderSummaryHTML, DAY_LABELS_LONG: cx.data.dayLabelsLong },
  );
}

/** Prüft, ob der Browser <input type="week"> nativ unterstützt (iOS fällt auf 'text' zurück). */
export function supportsWeekInput() {
  const test = document.createElement('input');
  try { test.type = 'week'; } catch (e) { return false; }
  return test.type === 'week';
}

/**
 * Ersetzt das Wochenfeld durch zwei Auswahlfelder (Jahr und KW), falls der
 * Browser type="week" nicht nativ darstellt – vor allem iPhone und iPad.
 * Das Original bleibt versteckt erhalten und löst weiter 'change' aus.
 * @param {any} ctx
 * @param {{ force?: boolean }} [opts] force: auch bei nativer Unterstützung (für Tests)
 */
export function installWeekInputFallback(ctx, opts = {}) {
  toAppContext(ctx);
  if (!opts.force && supportsWeekInput()) return;

  const original = /** @type {HTMLInputElement|null} */ (document.getElementById('week-input'));
  if (!original || original.dataset.fallback === 'true' || !original.parentNode) return;

  const wrap = document.createElement('span');
  wrap.className = 'week-fallback';
  wrap.style.cssText = 'display:grid;grid-template-columns:6.5rem 1fr;gap:0.4rem;align-items:center;min-width:0;';

  const yearSel = document.createElement('select');
  const weekSel = document.createElement('select');
  yearSel.setAttribute('aria-label', 'Jahr');
  weekSel.setAttribute('aria-label', 'Kalenderwoche');
  yearSel.style.minWidth = '0';
  weekSel.style.minWidth = '0';

  const initial = original.value || currentYearWeek();
  const [initYearStr, initWeekStr] = initial.split('-W');
  const initYear = parseInt(initYearStr, 10);
  const initWeek = parseInt(initWeekStr, 10);

  const thisYear = new Date().getFullYear();
  for (let y = thisYear - 3; y <= thisYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    if (y === initYear) opt.selected = true;
    yearSel.appendChild(opt);
  }

  /** @param {number} selectedWeek */
  function rebuildWeeks(selectedWeek) {
    weekSel.innerHTML = '';
    const total = isoWeeksInYear(parseInt(yearSel.value, 10));
    for (let w = 1; w <= total; w++) {
      const opt = document.createElement('option');
      opt.value = pad(w);
      opt.textContent = 'KW ' + pad(w);
      if (w === selectedWeek) opt.selected = true;
      weekSel.appendChild(opt);
    }
  }
  rebuildWeeks(initWeek);

  // Verstecktes Original beibehalten für renderWeek-Kompatibilität
  original.type = 'hidden';
  original.dataset.fallback = 'true';
  original.value = `${yearSel.value}-W${weekSel.value}`;

  function pushValue() {
    if (!original) return;
    original.value = `${yearSel.value}-W${weekSel.value}`;
    original.dispatchEvent(new Event('change', { bubbles: true }));
  }
  yearSel.addEventListener('change', () => {
    rebuildWeeks(parseInt(weekSel.value, 10) || 1);
    pushValue();
  });
  weekSel.addEventListener('change', pushValue);

  wrap.appendChild(yearSel);
  wrap.appendChild(weekSel);
  original.parentNode.insertBefore(wrap, original.nextSibling);
}
