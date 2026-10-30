// modules/arbzg-hints.js
// Hinweis Arbeitszeitgesetz (seit v3.12.0).
// Prüft über ALLE Arbeitgeber zusammen (Kunden im Freiberufler-Modus zählen nicht):
//   1) Tageshöchstzeit: mehr als 10 Std. Arbeit am Kalendertag (§ 3 ArbZG; Zeiten mehrerer
//      Arbeitgeber werden nach § 2 Abs. 1 ArbZG zusammengerechnet).
//   2) Ruhezeit: weniger als 11 Std. zwischen dem Arbeitsende eines Tages und dem
//      Arbeitsbeginn des Folgetages (§ 5 ArbZG).
// Es ist nur ein Hinweis: Speichern bleibt immer möglich, nichts an Ist/Soll/Saldo ändert sich.
// Bewusst NICHT geprüft: 6-Monats-Durchschnitt, Wochengrenze, Sonntagsregeln, Tarif-Ausnahmen.
// Ein laufender Timer zählt nicht; geprüft werden nur gespeicherte Einträge.
// Grenzwerte stehen in ARBZG_RULES, damit z. B. eine künftige Wochenhöchstarbeitszeit
// (Referentenentwurf vom 18.06.2026) ergänzt werden kann.

export const ARBZG_RULES = {
  maxDailyMinutes: 10 * 60,
  minRestMinutes: 11 * 60,
  dailyLaw: '§ 3 ArbZG',
  restLaw: '§ 5 ArbZG',
};

const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Ist der Hinweis eingeschaltet? Fehlt das Feld (ältere Daten), gilt: eingeschaltet. */
export function isArbzgHintEnabled(settings) {
  return !(settings && settings.arbzgHintsEnabled === false);
}

function toMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function fmtHM(min) {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function fmtClock(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function formatArbzgDate(iso) {
  const [y, mo, d] = iso.split('-');
  return `${d}.${mo}.${y}`;
}

export function formatArbzgDateWeekday(iso) {
  const dt = new Date(`${iso}T12:00:00`);
  return `${WEEKDAYS_SHORT[dt.getDay()]}, ${formatArbzgDate(iso)}`;
}

function addDays(iso, n) {
  const dt = new Date(`${iso}T12:00:00`);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * Arbeitsintervalle eines Eintrags in Minuten ab 00:00 des Eintragsdatums.
 * Über Mitternacht reichende Zeiten enden nach 1440. Präsenz: ein Intervall
 * (Pause liegt darin), Home-Office: je Segment ein Intervall.
 */
export function workIntervals(entry) {
  if (!entry) return [];
  const raw = entry.type === 'homeoffice'
    ? (Array.isArray(entry.segments) ? entry.segments : [])
    : (entry.type === 'work' ? [{ start: entry.start, end: entry.end }] : []);
  const out = [];
  for (const s of raw) {
    const a = toMin(s && s.start), b = toMin(s && s.end);
    if (a === null || b === null || a === b) continue;
    out.push({ start: a, end: b > a ? b : b + 1440 });
  }
  return out;
}

/** Netto-Arbeitsminuten (wie computeWorkMinutes in compute.js). */
export function netWorkMinutes(entry) {
  const iv = workIntervals(entry);
  const gross = iv.reduce((s, x) => s + (x.end - x.start), 0);
  if (entry && entry.type === 'work') return Math.max(0, gross - (Number(entry.breakMinutes) || 0));
  return gross;
}

function eligibleEntries(entries, employers) {
  const byId = new Map((employers || []).map(e => [e.id, e]));
  return (entries || []).filter(e => {
    if (!e || (e.type !== 'work' && e.type !== 'homeoffice')) return false;
    const emp = byId.get(e.employerId);
    return !!emp && emp.kind !== 'client';
  });
}

/**
 * Alle Hinweise im Zeitraum [from, to] (ISO-Daten, inklusive).
 * Ergebnis sortiert nach Datum, je Datum zuerst Tageshöchstzeit, dann Ruhezeit.
 *   { type: 'daily', date, totalMin, limitMin, parts: [{ employerId, name, min }] }
 *   { type: 'rest', date, prevDate, restMin, limitMin, prevEnd, nextStart,
 *     prevEmployerId, prevName, nextEmployerId, nextName }
 */
export function computeArbzgHints(entries, employers, from, to, rules = ARBZG_RULES) {
  const names = new Map((employers || []).map(e => [e.id, e.name]));
  const list = eligibleEntries(entries, employers);
  const byDate = new Map();
  for (const e of list) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  const hints = [];
  const dates = [...byDate.keys()].filter(d => (!from || d >= from) && (!to || d <= to)).sort();
  for (const date of dates) {
    const dayEntries = byDate.get(date);
    // 1) Tageshöchstzeit über alle Arbeitgeber.
    const perEmp = new Map();
    for (const e of dayEntries) perEmp.set(e.employerId, (perEmp.get(e.employerId) || 0) + netWorkMinutes(e));
    const totalMin = [...perEmp.values()].reduce((s, m) => s + m, 0);
    if (totalMin > rules.maxDailyMinutes) {
      const parts = [...perEmp.entries()]
        .filter(([, min]) => min > 0)
        .map(([employerId, min]) => ({ employerId, name: names.get(employerId) || '', min }));
      hints.push({ type: 'daily', date, totalMin, limitMin: rules.maxDailyMinutes, parts });
    }
    // 2) Ruhezeit zum Vortag.
    const prevDate = addDays(date, -1);
    const prevEntries = byDate.get(prevDate);
    if (prevEntries) {
      let last = null, first = null;
      for (const e of prevEntries) for (const iv of workIntervals(e)) {
        if (!last || iv.end > last.end) last = { end: iv.end, employerId: e.employerId };
      }
      for (const e of dayEntries) for (const iv of workIntervals(e)) {
        if (!first || iv.start < first.start) first = { start: iv.start, employerId: e.employerId };
      }
      if (last && first) {
        const restMin = first.start + 1440 - last.end;
        if (restMin >= 0 && restMin < rules.minRestMinutes) {
          hints.push({
            type: 'rest', date, prevDate, restMin, limitMin: rules.minRestMinutes,
            prevEnd: fmtClock(last.end), nextStart: fmtClock(first.start),
            prevEmployerId: last.employerId, prevName: names.get(last.employerId) || '',
            nextEmployerId: first.employerId, nextName: names.get(first.employerId) || '',
          });
        }
      }
    }
  }
  return hints;
}

/**
 * Hinweise für einen noch nicht gespeicherten Eintrag im Dialog: der Kandidat ersetzt den
 * Eintrag mit gleicher id. Geprüft werden das Datum selbst und die Ruhezeit zum Folgetag.
 */
export function computeArbzgHintsForCandidate(entries, employers, candidate) {
  if (!candidate || !candidate.date || !candidate.employerId) return [];
  const others = (entries || []).filter(e => !(candidate.id && e.id === candidate.id));
  const all = [...others, candidate];
  const next = addDays(candidate.date, 1);
  return computeArbzgHints(all, employers, candidate.date, next)
    .filter(h => h.date === candidate.date || (h.type === 'rest' && h.date === next));
}

function partsText(parts) {
  return parts.map(p => `${p.name} ${fmtHM(p.min)}`).join(' + ');
}

/** Ausführlicher Hinweistext für den Eintragsdialog (Klartext, ohne HTML). */
export function arbzgDialogText(h) {
  if (h.type === 'daily') {
    const multi = h.parts.length > 1;
    return `Am ${formatArbzgDate(h.date)} kommst du${multi ? ' über alle Arbeitgeber' : ''} auf ${fmtHM(h.totalMin)} Std. (${partsText(h.parts)}). `
      + `Erlaubt sind höchstens ${fmtHM(h.limitMin).replace(':00', '')} Std. pro Tag (${ARBZG_RULES.dailyLaw}`
      + `${multi ? ', Zeiten mehrerer Arbeitgeber werden nach § 2 zusammengerechnet' : ''}).`;
  }
  return `Zwischen Arbeitsende am ${formatArbzgDate(h.prevDate)} um ${h.prevEnd} (${h.prevName}) und Arbeitsbeginn am `
    + `${formatArbzgDate(h.date)} um ${h.nextStart} (${h.nextName}) liegen nur ${fmtHM(h.restMin)} Std. Ruhezeit. `
    + `Vorgeschrieben sind mindestens ${fmtHM(h.limitMin).replace(':00', '')} Std. (${ARBZG_RULES.restLaw}).`;
}

/** Kurzform für Woche und Übersicht. */
export function arbzgShortLabel(h) {
  return h.type === 'daily'
    ? `${fmtHM(h.totalMin)} Std. am Tag`
    : `${fmtHM(h.restMin)} Std. Ruhezeit`;
}

export function arbzgLimitLabel(h) {
  return h.type === 'daily'
    ? `max. ${fmtHM(h.limitMin).replace(':00', '')} Std.`
    : `min. ${fmtHM(h.limitMin).replace(':00', '')} Std.`;
}

export function arbzgComposition(h) {
  return h.type === 'daily'
    ? partsText(h.parts)
    : `Ende ${h.prevEnd} ${h.prevName} → Beginn ${h.nextStart} ${h.nextName}`;
}

/** Hinweise eines Tages, die in der Woche eines bestimmten Arbeitgebers erscheinen. */
export function arbzgHintsForEmployerDay(hints, employerId, date) {
  return (hints || []).filter(h => h.date === date && (h.type === 'daily'
    ? h.parts.some(p => p.employerId === employerId)
    : h.nextEmployerId === employerId));
}

/** HTML für den Hinweis im Dialog. escapeHtml wird injiziert. */
export function buildArbzgDialogHTML(hints, escapeHtml) {
  if (!hints || !hints.length) return '';
  return hints.map(h => `<p class="arbzg-hint-text"><strong>Hinweis Arbeitszeitgesetz:</strong> ${escapeHtml(arbzgDialogText(h))}</p>`).join('')
    + '<p class="arbzg-hint-text arbzg-hint-foot">Du kannst trotzdem speichern.</p>';
}

/** HTML-Badges für eine Tageskarte in der Woche. */
export function buildArbzgWeekBadgesHTML(hints, escapeHtml) {
  if (!hints || !hints.length) return '';
  return hints.map(h => `<div class="arbzg-week" data-testid="arbzg-week-${h.type}">`
    + `<span class="arbzg-badge">⚠ ArbZG: ${escapeHtml(arbzgShortLabel(h))}</span>`
    + `<div class="arbzg-week-detail">${escapeHtml(arbzgComposition(h))} (${escapeHtml(arbzgLimitLabel(h))})</div></div>`).join('');
}

/** HTML-Block für die Monatsübersicht. */
export function buildArbzgOverviewHTML(hints, monthLabel, escapeHtml) {
  if (!hints || !hints.length) return '';
  const rows = hints.map(h => `
          <tr>
            <td class="arbzg-date">${escapeHtml(formatArbzgDateWeekday(h.date))}</td>
            <td><strong>${escapeHtml(arbzgShortLabel(h).replace(/ (am Tag|Ruhezeit)$/, ''))}</strong> ${h.type === 'daily' ? 'am Tag' : 'Ruhezeit'} <span class="arbzg-nowrap">(${escapeHtml(arbzgLimitLabel(h))})</span></td>
            <td>${escapeHtml(arbzgComposition(h))}</td>
          </tr>`).join('');
  const count = hints.length === 1 ? '1 Hinweis' : `${hints.length} Hinweise`;
  return `
    <div class="arbzg-block" data-testid="arbzg-overview">
      <h4>Arbeitszeitgesetz: ${count} im ${escapeHtml(monthLabel)}</h4>
      <div class="arbzg-block-sub">Alle Arbeitgeber zusammen · Hinweis, keine Sperre · in den Einstellungen abschaltbar</div>
      <div class="report-table-wrap">
        <table class="arbzg-table">
          <thead><tr><th>Tag</th><th>Hinweis</th><th>Zusammensetzung</th></tr></thead>
          <tbody>${rows}
          </tbody>
        </table>
      </div>
    </div>`;
}
