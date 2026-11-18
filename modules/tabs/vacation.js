// @ts-check
/**
 * modules/tabs/vacation.js (seit v3.15.3, Roadmap 3 Stufe 2)
 *
 * Reiter „Urlaubsplanung“: Jahresauswahl, Kacheln (Anspruch, genommen, Zukunft,
 * noch nicht erfasst), Bildungsurlaub, Kalender mit Monatsnavigation ‹ ›,
 * Monatstabelle und Knopf „Urlaubsbescheinigung“ (§ 6 Abs. 2 BUrlG, seit v3.9.99).
 * Die HTML-Bausteine liegen in modules/render/vacation-planning.js und
 * modules/render/vacation-calendar.js, das PDF in
 * modules/export/vacation-certificate-pdf.js (Kontext: exports.vacationCertificatePdf).
 *
 * Regeln für modules/tabs/: kein Import von app.js, kein window.state,
 * alles Zustandsabhängige über toAppContext(ctx).
 */
import { toAppContext } from '../app-context.js';
import { buildVacationPlanningHTML } from '../render/vacation-planning.js';
import { buildVacationCalendarHTML } from '../render/vacation-calendar.js';
import { renderSummaryHTML } from '../render/summary.js';
import {
  computeYearlyVacationPlanning, computeVacationRemaining, computeEducationLeaveYear,
  computeVacationCalendarMonth, MONTH_LABELS_LONG,
} from '../compute.js';
import { shiftYearMonth } from '../util-time.js';

// Seit v3.9.86: angezeigter Monat (YYYY-MM) im Kalender. Nicht gespeichert; bei
// einem Jahreswechsel zurück auf den aktuellen Monat (falls im gewählten Jahr),
// sonst auf Januar (siehe renderVacationPlanning).
/** @type {string|null} */
let calendarYm = null;

/** @returns {HTMLSelectElement|null} */
const yearSelect = () => /** @type {HTMLSelectElement|null} */ (document.getElementById('vacation-planning-year'));

/**
 * HTML des Kalenders für calendarYm.
 * @param {any} cx
 * @param {any} emp
 */
function calendarHTML(cx, emp) {
  const ym = /** @type {string} */ (calendarYm);
  const st = cx.state.get();
  const stateCode = st.settings?.state || 'HE';
  const calendarMonth = computeVacationCalendarMonth(emp, ym, st.entries, cx.data.todayISO(), stateCode, st.settings?.holidayOverrides);
  const monthLabel = `${MONTH_LABELS_LONG[parseInt(ym.slice(5, 7), 10) - 1]} ${ym.slice(0, 4)}`;
  return buildVacationCalendarHTML(calendarMonth, { escapeHtml: cx.format.escapeHtml, monthLabel });
}

/**
 * Zeichnet den Reiter Urlaubsplanung.
 * @param {any} ctx
 */
export function renderVacationPlanning(ctx) {
  const cx = toAppContext(ctx);
  const yearInput = /** @type {HTMLSelectElement} */ (yearSelect());
  const year = Math.max(1900, Math.min(2100, parseInt(yearInput.value, 10) || new Date().getFullYear()));
  cx.ui.populateYearSelect(yearInput, year);
  const container = /** @type {HTMLElement} */ (document.getElementById('vacation-planning-content'));

  cx.data.ensureActiveEmployer();
  const st = cx.state.get();
  const emp = cx.data.employer(st.activeEmployerId);
  if (!emp) {
    container.innerHTML = `<div class="empty-state">Bitte zuerst einen ${cx.format.label('employer')} anlegen.</div>`;
    return;
  }

  const today = cx.data.todayISO();
  const vp = computeYearlyVacationPlanning(emp, year, st.entries, today);
  const vr = computeVacationRemaining(emp, `${year}-12`, st.entries);

  // Kalendermonat: passt der zuletzt angezeigte Monat nicht zum gewählten Jahr,
  // gilt der aktuelle Monat (falls im gewählten Jahr), sonst Januar.
  if (!calendarYm || calendarYm.slice(0, 4) !== String(year)) {
    calendarYm = String(year) === today.slice(0, 4) ? today.slice(0, 7) : `${year}-01`;
  }

  container.innerHTML = buildVacationPlanningHTML(vp, vr, emp, {
    escapeHtml: cx.format.escapeHtml,
    renderSummaryHTML,
    monthLabels: MONTH_LABELS_LONG,
    calendarHTML: calendarHTML(cx, emp),
    educationLeave: computeEducationLeaveYear(emp, year, st.entries, today, st.settings?.state || 'HE'),
  });

  wireCalendarNav(cx);
  const certBtn = document.getElementById('btn-export-vacation-certificate');
  if (certBtn) certBtn.addEventListener('click', () => exportVacationCertificatePdf(cx));
}

/**
 * Knopf „Urlaubsbescheinigung“: PDF für den aktiven Arbeitgeber.
 * @param {any} ctx
 */
export async function exportVacationCertificatePdf(ctx) {
  const cx = toAppContext(ctx);
  cx.data.ensureActiveEmployer();
  const emp = cx.data.employer(cx.state.get().activeEmployerId);
  if (!emp) return;
  try {
    const blob = await cx.exports.vacationCertificatePdf(emp);
    const empSlug = (emp.name || 'Arbeitgeber').replace(/[^\p{L}\p{N}]+/gu, '_');
    cx.exports.download(blob, `Urlaubsbescheinigung_${empSlug}_${String(emp.employmentEndDate).slice(0, 4)}.pdf`);
    cx.ui.toast('Urlaubsbescheinigung als PDF heruntergeladen');
  } catch (err) {
    console.error(err);
    cx.ui.toast('PDF-Export fehlgeschlagen: ' + (/** @type {Error} */ (err)).message);
  }
}

/**
 * Verschiebt den Kalender um ±1 Monat, begrenzt auf Januar bis Dezember des
 * gewählten Jahres (Kacheln und Monatstabelle beziehen sich auf genau dieses Jahr).
 * @param {any} cx
 * @param {number} delta
 */
function stepCalendarMonth(cx, delta) {
  const ym = /** @type {string} */ (calendarYm);
  const yearInput = yearSelect();
  const selected = yearInput ? yearInput.value : ym.slice(0, 4);
  const candidate = shiftYearMonth(ym, delta);
  if (candidate.slice(0, 4) !== String(selected)) return;
  calendarYm = candidate;
  renderCalendarOnly(cx);
}

/** @param {any} cx */
function wireCalendarNav(cx) {
  const prevBtn = document.getElementById('btn-vacation-calendar-prev');
  const nextBtn = document.getElementById('btn-vacation-calendar-next');
  if (prevBtn) prevBtn.addEventListener('click', () => stepCalendarMonth(cx, -1));
  if (nextBtn) nextBtn.addEventListener('click', () => stepCalendarMonth(cx, 1));
}

/**
 * Zeichnet nur den Kalender neu (‹ ›), Kacheln und Monatstabelle bleiben stehen.
 * @param {any} cx
 */
function renderCalendarOnly(cx) {
  const emp = cx.data.employer(cx.state.get().activeEmployerId);
  const calendarContainer = document.querySelector('#vacation-planning-content .vacation-calendar');
  if (!emp || !calendarContainer) { renderVacationPlanning(cx); return; }
  calendarContainer.outerHTML = calendarHTML(cx, emp);
  wireCalendarNav(cx);
}
