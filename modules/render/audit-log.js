// modules/render/audit-log.js
// Reiner HTML-Builder für die Änderungsprotokoll-Liste (Einstellungen-Ansicht, seit v3.9.47).
// Kein DOM-Zugriff, keine Mutation — reine String-Erzeugung aus state.auditLog + ctx.

import { formatAuditLogLine } from '../audit-log.js';

const MAX_VISIBLE = 50;

/**
 * @param {Array<any>} auditLog state.auditLog (chronologisch, älteste zuerst)
 * @param {{getEmployer?:(id:string)=>any, formatDateLong?:(iso:string)=>string, escapeHtml:(s:string)=>string}} ctx
 * @returns {string}
 */
export function buildAuditLogHTML(auditLog, ctx) {
  const { getEmployer, formatDateLong, escapeHtml } = ctx || {};
  const esc = escapeHtml || ((s) => String(s));
  if (!Array.isArray(auditLog) || !auditLog.length) {
    return `<div class="audit-log-empty">Noch keine Änderungen protokolliert.</div>`;
  }
  const recent = auditLog.slice(-MAX_VISIBLE).slice().reverse();
  return recent.map((log) => {
    const line = formatAuditLogLine(log, { getEmployer, formatDateLong });
    let time = '';
    try {
      time = new Date(log.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (_e) { time = log.at || ''; }
    return `<div class="audit-log-row"><span>${esc(line)}</span><span class="audit-log-time">${esc(time)}</span></div>`;
  }).join('');
}
