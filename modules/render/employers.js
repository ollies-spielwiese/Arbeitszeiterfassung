// modules/render/employers.js
// Pure Builder für die Arbeitgeber-/Kunden-Karten-Liste.
// Event-Handler und DOM-Wiring bleiben im aufrufenden Code (app.js).
//
// ctx = {
//   escapeHtml,
//   formatMoney,
//   breakModeLabel,
//   isFreelance,
// }

export function buildEmployerCardsHTML(employers, ctx) {
  const { escapeHtml, formatMoney, breakModeLabel, isFreelance } = ctx;
  const showRate = isFreelance();

  return employers.map(e => {
    const hoursDesc = e.hoursMode === 'week' ? `${e.weeklyHours || 0} h/Woche` : `${e.monthlyHours || 0} h/Monat`;
    const contacts = (e.contacts || []).filter(c => c.name || c.email).map(c => c.name || c.email).join(', ');
    const rateDesc = showRate && e.hourlyRate ? ` • ${formatMoney(e.hourlyRate, e.currency)}/h` : '';
    return `
      <div class="employer-card" data-id="${e.id}">
        <div class="employer-color" style="background:${e.color}"></div>
        <div class="employer-info">
          <div class="employer-name">${escapeHtml(e.name)}</div>
          <div class="employer-meta">
            ${hoursDesc} • ${breakModeLabel(e.breakMode)}${rateDesc}${e.phone ? ` • ☎ ${escapeHtml(e.phone)}` : ''}
          </div>
          ${contacts ? `<div class="employer-meta">👤 ${escapeHtml(contacts)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}
