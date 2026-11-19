// @ts-check
/**
 * modules/tabs/tracker.js (seit v3.15.4, Roadmap 3 Stufe 2)
 *
 * Reiter „Erfassen“: Auswahl Arbeitgeber, Knöpfe Start und Ende, Sekundenanzeige
 * des laufenden Timers, Umschalter Präsenz oder Home-Office und die Kacheln
 * „Diesen Monat“. Der Umschalter und die Sekundenanzeige leben nur in diesem
 * Modul (nicht gespeichert). Der Erfassen-Dialog (modules/ui/entry-modal.js)
 * und die Außendienst-Bausteine (modules/ui/field-service-ui.js) bleiben, wo
 * sie sind. Das HTML der Kacheln liegt in modules/render/tracker.js.
 *
 * Regeln für modules/tabs/: kein Import von app.js, kein window.state,
 * alles Zustandsabhängige über toAppContext(ctx).
 */
import { toAppContext } from '../app-context.js';
import { filterVisibleEmployers, isFormerEmployer } from '../compute.js';
import { findEntryConflict, ENTRY_CONFLICT_MESSAGE } from '../entry-conflicts.js';
import { splitAcrossMidnight, pad, currentYearMonth } from '../util-time.js';
import { getFieldServiceSettings, formatKm, formatEuro } from '../field-service.js';
import {
  renderTrackerFieldService, getTrackerStartFieldService, resetTrackerPick,
  fieldServiceFromTimer, tripsMissingKm, openKmModal,
} from '../ui/field-service-ui.js';
import { buildTodaySummaryHTML } from '../render/tracker.js';
import { renderSummaryHTML } from '../render/summary.js';
import { updateSollWarningBanner } from '../ui/soll-warning-banner-ui.js';
import { needsTimerCheck } from '../timer-check.js';
import { openTimerCheckModal } from '../ui/timer-check-modal.js';

/** Präsenz oder Home-Office (nicht gespeichert). */
let currentMode = 'praesenz';
/** @type {ReturnType<typeof setInterval>|null} */
let liveTimerInterval = null;

/** @param {string} id */
const el = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** Aktueller Modus des Umschalters ('praesenz' oder 'homeoffice'). */
export function getCurrentMode() { return currentMode; }

/**
 * Zeichnet den Reiter Erfassen.
 * @param {any} ctx
 */
export function renderTracker(ctx) {
  const cx = toAppContext(ctx);
  const L = cx.format.label;
  cx.data.ensureActiveEmployer();
  const st = cx.state.get();
  const sel = el('active-employer');
  const activeEmployerLabel = document.getElementById('active-employer-label');
  if (activeEmployerLabel) activeEmployerLabel.textContent = L('activeEmployer');
  const formerCb = /** @type {HTMLInputElement|null} */ (document.getElementById('show-former-employers-tracker'));
  if (formerCb) formerCb.checked = !!cx.ui.showFormerEmployers();
  const formerEmployersLabel = document.getElementById('former-employers-tracker-label');
  if (formerEmployersLabel) formerEmployersLabel.textContent = L('formerEmployers');
  const today = cx.data.todayISO();
  const escapeHtml = cx.format.escapeHtml;
  const visibleEmployers = filterVisibleEmployers(st.employers, today, {
    showAll: !!cx.ui.showFormerEmployers(),
    includeIds: [st.activeEmployerId],
  });
  sel.innerHTML = st.employers.length
    ? visibleEmployers.map((e) => `<option value="${escapeHtml(e.id)}" ${e.id === st.activeEmployerId ? 'selected' : ''}>${escapeHtml(e.name)}${isFormerEmployer(e, today) ? ' (ehemalig)' : ''}</option>`).join('')
    : `<option value="">— Bitte ${L('employer')} anlegen —</option>`;

  const hint = document.getElementById('onboarding-hint');
  if (hint) {
    hint.classList.toggle('hidden', !!st.employers.length);
    if (!st.employers.length) {
      hint.innerHTML = `<strong>Willkommen 👋</strong><br>Bitte legen Sie zuerst unter <em>${L('employers')}</em> mindestens ${cx.data.isFreelance() ? 'einen Kunden' : 'einen Arbeitgeber'} an. Danach können Sie hier Ihre Arbeitszeiten erfassen.`;
    }
  }

  const running = st.runningTimer;
  const hasEmployers = st.employers.length > 0;
  const activeEmp = cx.data.employer(st.activeEmployerId);
  const activeIsFormer = isFormerEmployer(activeEmp, today);
  /** @type {HTMLButtonElement} */ (el('btn-start')).disabled = !!running || !hasEmployers || activeIsFormer;
  /** @type {HTMLButtonElement} */ (el('btn-end')).disabled = !running;

  const liveEl = el('live-status');
  if (running) {
    const emp = cx.data.employer(running.employerId);
    el('live-time').textContent =
      `${emp ? emp.name + ' • ' : ''}${new Date(running.startISO).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    liveEl.classList.remove('hidden');
    startLiveTimer(cx);
  } else {
    liveEl.classList.add('hidden');
    stopLiveTimer();
  }

  renderTodaySummary(cx);
  updateSollWarningBanner(cx);

  // Umschalter beim Wechsel in den Reiter immer auf Präsenz zurücksetzen (nicht gespeichert),
  // außer der laufende Timer ist bereits im Home-Office-Modus.
  setMode(cx, running && running.type === 'homeoffice' ? 'homeoffice' : 'praesenz');
}

/** @param {any} cx gebauter Kontext */
function startLiveTimer(cx) {
  stopLiveTimer();
  const update = () => {
    const r = cx.state.get().runningTimer;
    if (!r) return;
    const diff = Date.now() - new Date(r.startISO).getTime();
    const s = Math.floor(diff / 1000);
    el('live-duration').textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };
  update();
  liveTimerInterval = setInterval(update, 1000);
}

function stopLiveTimer() {
  if (liveTimerInterval) { clearInterval(liveTimerInterval); liveTimerInterval = null; }
}

/** True, solange die Sekundenanzeige läuft (für Tests). */
export function isLiveTimerRunning() { return liveTimerInterval !== null; }

/** @param {any} cx gebauter Kontext */
function renderTodaySummary(cx) {
  const empId = cx.state.get().activeEmployerId;
  const container = el('today-summary');
  if (!empId) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  const emp = cx.data.employer(empId);
  const ym = currentYearMonth();
  const report = cx.compute.monthReport(empId, ym);
  const { workedMin, targetMin, balance } = report;

  const summaryFields = cx.compute.summaryFields({
    workedMin,
    targetMin,
    balance,
    vacationDays: report.vacationEntries.length,
    sickDays: report.sickEntries.length,
    educationLeaveDays: (report.educationLeaveEntries || []).length,
    overtimeReductionDays: report.overtimeReductionEntries.length,
    hourlyRate: Number(emp.hourlyRate) || 0,
    currency: emp.currency || 'EUR',
  });

  // Außendienst-Nachweis (seit v3.13.0): zusätzliche Kacheln, nur wenn aktiv und Daten vorhanden.
  const fsm = report.fieldService;
  if (fsm && (fsm.tripMin > 0 || fsm.km > 0)) {
    if (fsm.tripMin > 0) summaryFields.push({ kind: 'time', key: 'fsTrip', label: 'davon Fahrt', valueHM: cx.format.minutesToHM(fsm.tripMin) });
    if (fsm.km > 0) summaryFields.push({ kind: 'text', key: 'fsKm', label: 'Kilometer', value: `${formatKm(fsm.km)} km` });
    if (fsm.amount > 0) summaryFields.push({ kind: 'text', key: 'fsAmount', label: 'Kilometer-Betrag', value: formatEuro(fsm.amount) });
  }

  container.innerHTML = buildTodaySummaryHTML({ ym, summaryFields }, {
    formatMonthYear: cx.format.monthYear,
    renderSummaryHTML,
  });
}

/**
 * Knopf „Start“.
 * @param {any} ctx
 */
export function startWork(ctx) {
  const cx = toAppContext(ctx);
  const st = cx.state.get();
  if (!st.activeEmployerId) { cx.ui.toast('Bitte zuerst einen Arbeitgeber anlegen'); return; }
  if (st.runningTimer) return;
  if (findEntryConflict(st.entries, { employerId: st.activeEmployerId, date: cx.data.todayISO(), type: 'work' })) {
    cx.ui.toast(ENTRY_CONFLICT_MESSAGE); return;
  }
  st.runningTimer = {
    employerId: st.activeEmployerId,
    startISO: new Date().toISOString(),
    type: currentMode === 'homeoffice' ? 'homeoffice' : 'work',
    // Außendienst-Nachweis (seit v3.13.0): Tätigkeit und Einsatzort des ersten Blocks.
    ...getTrackerStartFieldService(st, st.activeEmployerId, currentMode),
  };
  resetTrackerPick();
  cx.state.save();
  renderTracker(cx);
  cx.ui.toast(currentMode === 'homeoffice' ? 'Home-Office-Block gestartet' : 'Arbeitsbeginn erfasst');
}

/**
 * Knopf „Ende“.
 * Seit v3.15.6: Läuft der Timer 12 Stunden oder länger, öffnet sich zuerst der Dialog
 * „Timer prüfen“ (modules/ui/timer-check-modal.js). Dessen Speichern ruft endWork mit
 * festem Ende (opts.endDate) erneut auf.
 * @param {any} ctx
 * @param {{endDate?: Date}} [opts]
 */
export function endWork(ctx, opts) {
  const cx = toAppContext(ctx);
  const st = cx.state.get();
  const r = st.runningTimer;
  if (!r) return;
  const startDate = new Date(r.startISO);
  const fixedEnd = opts && opts.endDate instanceof Date ? opts.endDate : null;
  if (!fixedEnd && needsTimerCheck(r.startISO, new Date())) {
    openTimerCheckModal(cx, (endDate) => endWork(ctx, { endDate }));
    return;
  }
  const endDate = fixedEnd || new Date();
  const parts = splitAcrossMidnight(startDate, endDate);
  if (!parts.length) { cx.ui.toast('Bitte mindestens eine Minute erfassen.'); return; }
  // Seit v3.15.6: Präsenz speichert nur am Starttag, also wird nur dieser Tag geprüft.
  // Home-Office bucht auf jeden Kalendertag und prüft weiterhin alle.
  const checkParts = r.type === 'homeoffice' ? parts : parts.slice(0, 1);
  if (checkParts.some((p) => findEntryConflict(st.entries, { employerId: r.employerId, date: p.date, type: r.type || 'work' }))) {
    cx.ui.toast(ENTRY_CONFLICT_MESSAGE + ' Der Timer bleibt erhalten.'); return;
  }

  if (r.type === 'homeoffice') {
    // Für jeden Kalendertag: Segment am bestehenden Home-Office-Eintrag anhängen oder neuen anlegen
    for (const p of parts) {
      const existing = st.entries.find((e) =>
        e.type === 'homeoffice' && e.employerId === r.employerId && e.date === p.date
      );
      if (existing) {
        const prev = Array.isArray(existing.segments) ? existing.segments : [];
        existing.segments = cx.compute.normalizeSegments([...prev, { start: p.start, end: p.end }]);
      } else {
        st.entries.push({
          id: cx.data.uid(),
          employerId: r.employerId,
          date: p.date,
          type: 'homeoffice',
          segments: [{ start: p.start, end: p.end }],
          note: '',
          createdAt: new Date().toISOString(),
        });
      }
    }
    st.runningTimer = null;
    cx.state.save();
    renderTracker(cx);
    cx.render.entries();
    cx.render.week();
    cx.render.report();
    cx.ui.toast(parts.length > 1
      ? `Home-Office-Block auf ${parts.length} Tage verteilt gespeichert`
      : 'Home-Office-Block gespeichert');
    return;
  }

  // Präsenz: bei Über-Mitternacht das Ende einfach als HH:MM stehen lassen —
  // die Arbeitszeit-Berechnung rechnet bereits +24h, wenn end < start.
  // (Bewusste Entscheidung: Präsenz-Übernachtungen sind arbeitsrechtlich sinnvoller
  // als ein Eintrag am Start-Tag mit Endzeit über Mitternacht abgebildet.)
  const dateISO = parts[0].date;
  const startHHMM = parts[0].start;
  const endHHMM = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;

  const emp = cx.data.employer(r.employerId);
  const suggestedBreak = cx.compute.suggestedBreak(startHHMM, endHHMM, emp?.breakMode, dateISO);

  /** @type {import('../../types.js').AZEntry} */
  const entry = {
    id: cx.data.uid(),
    employerId: r.employerId,
    date: dateISO,
    type: 'work',
    start: startHHMM,
    end: endHHMM,
    breakMinutes: suggestedBreak || 0,
    overtimeReason: '',
    note: '',
    ...fieldServiceFromTimer(st, r),
    createdAt: new Date().toISOString(),
  };
  st.entries.push(entry);
  st.runningTimer = null;
  cx.state.save();
  renderTracker(cx);

  cx.ui.openEntryModal(entry, { justEnded: true });
  // Außendienst (seit v3.13.0): bei „erst bei Arbeitsende“ fehlende Kilometer der Fahrten von heute abfragen.
  const fsSettings = getFieldServiceSettings(st.settings);
  if (fsSettings.kmPrompt === 'end') {
    const missing = tripsMissingKm(st, r.employerId, dateISO, entry.id);
    if (missing.length) openKmModal(missing, cx);
  }
}

/**
 * Umschalter Präsenz oder Home-Office.
 * @param {any} ctx
 * @param {string} mode
 */
export function setMode(ctx, mode) {
  const cx = toAppContext(ctx);
  currentMode = mode === 'homeoffice' ? 'homeoffice' : 'praesenz';
  const btnP = document.getElementById('mode-praesenz');
  const btnH = document.getElementById('mode-homeoffice');
  if (!btnP || !btnH) return;
  const isHO = currentMode === 'homeoffice';
  btnP.classList.toggle('active', !isHO);
  btnH.classList.toggle('active', isHO);
  btnP.setAttribute('aria-checked', String(!isHO));
  btnH.setAttribute('aria-checked', String(isHO));
  try { renderTrackerFieldService(cx, currentMode); } catch (err) { console.error(err); }
}
