// modules/render/employers.js
// Pure Builder für die Arbeitgeber-/Kunden-Karten-Liste.
// Event-Handler und DOM-Wiring bleiben im aufrufenden Code (app.js).
//
// ctx = {
//   escapeHtml,
//   formatMoney,
//   breakModeLabel,
//   isFreelance,
//   isFormerEmployer,   // seit v3.9.55, aus modules/compute.js
//   todayISO,           // seit v3.9.55, () => 'YYYY-MM-DD'
//   formatDate,         // seit v3.9.55, fuer die 'Ehemalig seit ...'-Badge
// }

export function buildEmployerCardsHTML(employers, ctx) {
  const { escapeHtml, formatMoney, breakModeLabel, isFreelance, isFormerEmployer, todayISO, formatDate } = ctx;
  const showRate = isFreelance();
  const today = typeof todayISO === 'function' ? todayISO() : '';

  return employers.map(e => {
    const hoursDesc = e.hoursMode === 'week' ? `${e.weeklyHours || 0} h/Woche` : `${e.monthlyHours || 0} h/Monat`;
    const contacts = (e.contacts || []).filter(c => c.name || c.email).map(c => c.name || c.email).join(', ');
    const rateDesc = showRate && e.hourlyRate ? ` • ${formatMoney(e.hourlyRate, e.currency)}/h` : '';
    const former = typeof isFormerEmployer === 'function' && today ? isFormerEmployer(e, today) : false;
    const nameClass = former ? 'employer-name employer-name-former' : 'employer-name';
    const formerBadge = former
      ? `<span class="employer-former-badge">Ehemalig seit ${escapeHtml(formatDate ? formatDate(e.employmentEndDate) : e.employmentEndDate)}</span>`
      : '';
    return `
      <div class="employer-card" data-id="${e.id}">
        <div class="employer-color" style="background:${e.color}"></div>
        <div class="employer-info">
          <div class="${nameClass}">${escapeHtml(e.name)}${formerBadge}</div>
          <div class="employer-meta">
            ${hoursDesc} • ${breakModeLabel(e.breakMode)}${rateDesc}${e.phone ? ` • ☎ ${escapeHtml(e.phone)}` : ''}
          </div>
          ${contacts ? `<div class="employer-meta">👤 ${escapeHtml(contacts)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}
