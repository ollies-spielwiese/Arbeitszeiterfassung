// modules/render/archive.js
// Pure Builder für die Archiv-Kartenliste.
// Event-Handler-Wiring bleibt in app.js (jede Karte hat data-attributes).
//
// ctx = {
//   escapeHtml,
//   formatMonthYear,
//   minutesToHM,
// }

export function buildArchiveHTML(archives, ctx) {
  const { escapeHtml, formatMonthYear, minutesToHM } = ctx;
  const sorted = [...archives].sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));

  return sorted.map(a => {
    const s = a.snapshot;
    return `
      <div class="archive-card">
        <div class="archive-header">
          <div>
            <div class="archive-title">${escapeHtml(s.employer.name)}</div>
            <div class="employer-meta">${formatMonthYear(a.yearMonth)} • ${minutesToHM(s.workedMin)} / ${minutesToHM(s.targetMin)} • Saldo ${s.balance >= 0 ? '+' : ''}${minutesToHM(s.balance)}</div>
          </div>
        </div>
        <div class="archive-actions">
          <button class="btn-secondary" data-action="word" data-id="${a.id}">Word</button>
          <button class="btn-secondary" data-action="pdf" data-id="${a.id}">PDF</button>
          <button class="btn-danger" data-action="delete" data-id="${a.id}">Löschen</button>
        </div>
      </div>
    `;
  }).join('');
}
