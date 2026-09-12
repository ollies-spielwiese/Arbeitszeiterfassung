// modules/kind-migration-notice.js
// Einmaliger Hinweis nach der kind-Migration (Schema 6→7, seit v3.9.58): Wenn die
// Zuordnung Arbeitgeber/Kunde für bestehende Einträge automatisch anhand des zum
// Zeitpunkt der Migration aktiven Modus vorgenommen wurde, zeigt dieses Modul beim
// nächsten App-Start einen Hinweis, damit die Zuordnung nicht unbemerkt falsch bleibt
// (siehe modules/migrations.js, from:6 to:7 — pendingMigrationNotice).
//
// Reine Funktion mit ctx-DI — kein Modul-State, keine globalen Referenzen.
//
// ctx = {
//   state,       // liefert state.pendingMigrationNotice
//   saveState,   // persistiert das Löschen des Hinweises (nur einmal anzeigen)
//   escapeHtml,
// }

export function maybeShowKindMigrationNotice(ctx, opts = {}) {
  const { state, saveState, escapeHtml } = ctx;
  const notice = state && state.pendingMigrationNotice;
  if (!notice || notice.type !== 'kindAutoAssigned') return;

  const modalId = opts.modalId || 'modal-kind-migration-notice';
  const containerId = opts.containerId || 'kind-migration-notice-content';
  const modal = document.getElementById(modalId);
  const container = document.getElementById(containerId);
  if (!modal || !container) return;

  const names = Array.isArray(notice.names) ? notice.names : [];
  if (!names.length) {
    // Nichts zu melden — Hinweis trotzdem konsumieren, damit er nicht erneut geprüft wird.
    delete state.pendingMigrationNotice;
    if (typeof saveState === 'function') saveState();
    return;
  }

  const kindLabel = notice.toKind === 'client' ? 'Kunde' : 'Arbeitgeber';
  const modeLabel = notice.toKind === 'client' ? 'Freiberuflich' : 'Angestellt';
  const intro = names.length === 1
    ? 'Für folgenden Eintrag wurde automatisch die Zuordnung'
    : 'Für folgende Einträge wurde automatisch die Zuordnung';

  container.innerHTML = `
    <p>Mit diesem Update wurde die Unterscheidung zwischen Arbeitgeber und Kunde eingeführt.
    ${intro} <strong>${escapeHtml(kindLabel)}</strong> vorgenommen, da zum Zeitpunkt der
    Umstellung der Modus „${escapeHtml(modeLabel)}“ aktiv war:</p>
    <ul>${names.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
    <p>Falls das nicht stimmt: kurz in den passenden Modus wechseln, den Eintrag öffnen
    und im Feld „Eintragstyp“ korrigieren.</p>
  `;
  modal.classList.remove('hidden');

  // Einmalig: Hinweis aus dem State entfernen, sobald er angezeigt wurde, damit er
  // nach dem Schließen (oder einem Reload) nicht erneut erscheint.
  delete state.pendingMigrationNotice;
  if (typeof saveState === 'function') saveState();
}
