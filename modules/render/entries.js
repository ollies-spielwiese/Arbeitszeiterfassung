// modules/render/entries.js
// Pure Builder für die Einträge-Liste (Präsenz, Home-Office, Urlaub, Krank).
// Nimmt eine bereits gefilterte und sortierte Liste sowie einen Kontext mit
// Formattern und Selectors — kein DOM-Zugriff, keine Seiteneffekte.
//
// ctx = {
//   escapeHtml,
//   formatDateLong,
//   minutesToHM,
//   getEmployer,
//   computeWorkMinutes,
//   computeHomeofficeMinutes,
//   computeMonthTargetMinutes,
//   countWorkdaysInMonth,
// }

export function buildEntriesHTML(list, ctx) {
  const {
    escapeHtml,
    formatDateLong,
    minutesToHM,
    getEmployer,
    computeWorkMinutes,
    computeHomeofficeMinutes,
    computeMonthTargetMinutes,
    countWorkdaysInMonth,
  } = ctx;

  return list.map(e => {
    const emp = getEmployer(e.employerId);
    const color = emp?.color || '#3b82f6';
    let right, details, typeBadge = '';

    if (e.type === 'work') {
      const mins = computeWorkMinutes(e);
      const dailyTarget = emp ? computeMonthTargetMinutes(emp, e.date.slice(0, 7)) / countWorkdaysInMonth(e.date.slice(0, 7), emp) : 0;
      const isOvertime = mins > dailyTarget && dailyTarget > 0;
      right = `<span class="entry-hours ${isOvertime ? 'overtime' : ''}">${minutesToHM(mins)}</span>`;
      details = `${e.start}–${e.end}${e.breakMinutes ? ` • Pause ${e.breakMinutes} Min` : ''}${emp ? ` • ${escapeHtml(emp.name)}` : ''}`;
      if (e.overtimeReason) typeBadge = `<span class="entry-badge overtime">Überstunden</span>`;
    } else if (e.type === 'homeoffice') {
      const mins = computeHomeofficeMinutes(e);
      const segCount = Array.isArray(e.segments) ? e.segments.filter(s => s && s.start && s.end).length : 0;
      right = `<span class="entry-hours">${minutesToHM(mins)}</span>`;
      details = `Home-Office • ${segCount} ${segCount === 1 ? 'Block' : 'Blöcke'}${emp ? ` • ${escapeHtml(emp.name)}` : ''}`;
      typeBadge = `<span class="entry-badge homeoffice">Home-Office</span>`;
    } else if (e.type === 'vacation') {
      right = `<span class="entry-hours absence">Urlaub</span>`;
      details = emp ? escapeHtml(emp.name) : '';
      typeBadge = `<span class="entry-badge vacation">Urlaub</span>`;
    } else {
      right = `<span class="entry-hours absence">Krank</span>`;
      details = emp ? escapeHtml(emp.name) : '';
      typeBadge = `<span class="entry-badge sick">Krank</span>`;
    }

    const note = [e.overtimeReason && `Grund: ${e.overtimeReason}`, e.note].filter(Boolean).join(' • ');

    return `
      <div class="entry-card" style="border-left-color: ${color}" data-id="${e.id}" data-testid="entry-${e.id}">
        <div class="entry-header">
          <div class="entry-date">${formatDateLong(e.date)}${typeBadge}</div>
          ${right}
        </div>
        <div class="entry-details">${details}</div>
        ${note ? `<div class="entry-note">${escapeHtml(note)}</div>` : ''}
      </div>
    `;
  }).join('');
}
