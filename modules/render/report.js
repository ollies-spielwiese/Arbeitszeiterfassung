// modules/render/report.js
// Pure Builder für Monatsbericht-HTML.
// Phase 4.9.2 Debug: window.__AZ_LAST_REPORT wird gesetzt, damit der User console.log(window.__AZ_LAST_REPORT) machen kann, um die aktuellen Rohwerte zu inspizieren.
// Nimmt das computeMonthReport-Ergebnis + Kontext (Formatter, Selectors, Renderer)
// und liefert ein reines HTML-Fragment zurück. Kein DOM-Zugriff, keine Seiteneffekte.
//
// ctx = {
//   escapeHtml,
//   formatDateLong,
//   formatDate,
//   formatMonthYear,
//   minutesToHM,
//   computeWorkMinutes,
//   computeHomeofficeMinutes,
//   getSummaryFields,
//   renderSummaryHTML,
// }

export function buildReportHTML(r, ctx) {
  const {
    escapeHtml,
    formatDateLong,
    formatDate,
    formatMonthYear,
    minutesToHM,
    computeWorkMinutes,
    computeHomeofficeMinutes,
    getSummaryFields,
    renderSummaryHTML,
  } = ctx;

  // Gemeinsame, chronologisch sortierte Zeilen aus Arbeit + Home-Office
  const combined = [
    ...r.workEntries.map(e => ({ e, isHO: false })),
    ...r.homeofficeEntries.map(e => ({ e, isHO: true })),
  ].sort((a, b) => a.e.date.localeCompare(b.e.date));

  const rows = combined.map(({ e, isHO }) => {
    if (isHO) {
      const mins = computeHomeofficeMinutes(e);
      return `
        <tr class="row-homeoffice">
          <td data-label="Datum">${formatDateLong(e.date)}</td>
          <td data-label="Zeit"><span class="cell-badge homeoffice">Home-Office</span></td>
          <td class="num" data-label="Pause (Min)">—</td>
          <td class="num" data-label="Std.">${minutesToHM(mins)}</td>
          <td data-label="Grund Überstunden"></td>
          <td data-label="Bemerkung">${escapeHtml(e.note || '')}</td>
        </tr>
      `;
    }
    const mins = computeWorkMinutes(e);
    return `
      <tr>
        <td data-label="Datum">${formatDateLong(e.date)}</td>
        <td data-label="Zeit">${e.start}–${e.end}</td>
        <td class="num" data-label="Pause (Min)">${e.breakMinutes || 0}</td>
        <td class="num" data-label="Std.">${minutesToHM(mins)}</td>
        <td data-label="Grund Überstunden">${escapeHtml(e.overtimeReason || '')}</td>
        <td data-label="Bemerkung">${escapeHtml(e.note || '')}</td>
      </tr>
    `;
  }).join('');

  const holidayList = r.holidays.length
    ? `<div class="entry-note" style="margin-top: 0.75rem;">Feiertage im Monat: ${r.holidays.map(h => `${formatDate(h.date)} ${escapeHtml(h.name)}`).join(' · ')}</div>`
    : '';

  const homeofficeFooter = r.homeofficeEntries.length
    ? `<div class="report-footer-note">davon Home-Office: ${r.homeofficeEntries.length} ${r.homeofficeEntries.length === 1 ? 'Tag' : 'Tage'} · ${minutesToHM(r.homeofficeMin)}</div>`
    : '';

  // Modus pro Arbeitgeber ableiten: hat der Arbeitgeber vertragliche Sollstunden,
  // wird der Report als employee behandelt — unabhängig vom globalen App-Mode.
  // Nur wenn KEINE Sollstunden hinterlegt sind, greift der Freelance-Modus
  // (kein Soll/Saldo/Urlaub/Krank im Summary).
  const empHasTarget =
    (Number(r.employer.weeklyHours) || 0) > 0 ||
    (Number(r.employer.monthlyHours) || 0) > 0;
  // Debug-Bridge für Fehlersuche v3.9.24
  try { if (typeof window !== 'undefined') /** @type {any} */(window).__AZ_LAST_REPORT = { employer: r.employer.name, ym: r.ym, workedMin: r.workedMin, targetMin: r.targetMin, creditedAbsenceMin: r.creditedAbsenceMin, dailyTargetMin: r.dailyTargetMin, workdays: r.workdays, balance: r.balance, vacationDays: r.vacationEntries.length, sickDays: r.sickEntries.length, hoursMode: r.employer.hoursMode, weeklyHours: r.employer.weeklyHours, monthlyHours: r.employer.monthlyHours }; } catch (_) {}
  const mrFields = getSummaryFields({
    workedMin: r.workedMin,
    targetMin: r.targetMin,
    balance: r.balance,
    vacationDays: r.vacationEntries.length,
    sickDays: r.sickEntries.length,
    hourlyRate: Number(r.employer.hourlyRate) || 0,
    currency: r.employer.currency || 'EUR',
    mode: empHasTarget ? 'employee' : 'freelance',
  });

  return `
    <div class="report-header">
      <h3>${escapeHtml(r.employer.name)}</h3>
      <div class="subtitle">${formatMonthYear(r.ym)}</div>
    </div>
    <div class="summary-grid">
      ${renderSummaryHTML(mrFields)}
    </div>
    ${holidayList}
    ${rows ? `
      <table class="report-table">
        <thead><tr><th>Datum</th><th>Zeit</th><th>Pause (Min)</th><th>Std.</th><th>Grund Überstunden</th><th>Bemerkung</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${homeofficeFooter}
    ` : '<div class="empty-state">Keine Arbeitszeiten in diesem Monat.</div>'}
  `;
}
