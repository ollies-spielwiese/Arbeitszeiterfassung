// modules/audit-log.js
// Reine Audit-Log-Helfer (Änderungsprotokoll pro Eintrag, seit v3.9.47).
// Kein DOM-Zugriff, kein State-Import — state wird als Parameter übergeben (DI-Prinzip wie
// bei den anderen modules/ui/*-Helfern). state.auditLog ist ein additives Feld: kein
// Migrations-Eintrag nötig (siehe docs/ARCHITECTURE.md "Migrations-Kontrakt").
//
// @typedef {import('../types.js').AZEntry} AZEntry

/**
 * @typedef {Object} AZAuditLogEntry
 * @property {string} id
 * @property {string} at ISO-Timestamp
 * @property {'create'|'update'|'delete'} action
 * @property {string} entryId Betroffene AZEntry.id
 * @property {string} [employerId]
 * @property {string} [date] 'YYYY-MM-DD'
 * @property {string} [entryType] z.B. 'work', 'vacation', 'off_day', ...
 * @property {string} [summary] Kurze menschliche Zusammenfassung der Änderung
 */

// Obergrenze gegen unbegrenztes Wachstum im localStorage/Backup — älteste Einträge werden
// beim Überschreiten entfernt (FIFO), analog zu anderen begrenzten Listen in der App.
export const AUDIT_LOG_MAX = 500;

/**
 * Fügt einen Audit-Log-Eintrag hinzu. Legt state.auditLog an, falls noch nicht vorhanden
 * (Altbestände ohne das Feld bekommen es additiv beim ersten Schreibzugriff).
 * @param {any} state
 * @param {{action:'create'|'update'|'delete', entry:any, summary?:string, uid?:()=>string}} params
 * @returns {AZAuditLogEntry|null} Der erzeugte Log-Eintrag (oder null bei fehlenden Pflichtfeldern).
 */
export function pushAuditLog(state, params) {
  if (!state || !params) return null;
  const { action, entry, summary, uid } = params;
  if (!entry || !entry.id || !action) return null;
  if (!Array.isArray(state.auditLog)) state.auditLog = [];

  const logEntry = {
    id: typeof uid === 'function' ? uid() : `log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    at: new Date().toISOString(),
    action,
    entryId: entry.id,
    employerId: entry.employerId,
    date: entry.date,
    entryType: entry.type,
    summary: summary || '',
  };
  state.auditLog.push(logEntry);

  if (state.auditLog.length > AUDIT_LOG_MAX) {
    state.auditLog.splice(0, state.auditLog.length - AUDIT_LOG_MAX);
  }
  return logEntry;
}

const ACTION_LABELS = { create: 'Angelegt', update: 'Geändert', delete: 'Gelöscht' };
const TYPE_LABELS = {
  work: 'Arbeit', homeoffice: 'Home-Office', vacation: 'Urlaub', sick: 'Krankheit',
  overtime_reduction: 'Überstundenabbau', off_day: 'Freier Tag',
};

/**
 * Formatiert einen Audit-Log-Eintrag für die Anzeige (Einstellungen-Ansicht), neueste zuerst
 * werden vom Aufrufer sortiert — diese Funktion baut nur die einzelne Zeile.
 * @param {AZAuditLogEntry} log
 * @param {{getEmployer?:(id:string)=>any, formatDateLong?:(iso:string)=>string}} [ctx]
 * @returns {string}
 */
export function formatAuditLogLine(log, ctx) {
  const { getEmployer, formatDateLong } = ctx || {};
  const actionLabel = ACTION_LABELS[log.action] || log.action;
  const typeLabel = TYPE_LABELS[log.entryType] || log.entryType || '';
  const dateLabel = (formatDateLong && log.date) ? formatDateLong(log.date) : (log.date || '');
  const emp = (typeof getEmployer === 'function' && log.employerId) ? getEmployer(log.employerId) : null;
  const parts = [actionLabel, typeLabel, dateLabel].filter(Boolean);
  if (emp) parts.push(emp.name);
  const line = parts.join(' · ');
  return log.summary ? `${line} (${log.summary})` : line;
}
