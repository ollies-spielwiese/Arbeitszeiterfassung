// modules/export/csv.js
// Reine CSV-Export-Funktion (seit v3.9.47).
// Erzeugt einen CSV-Blob aus einem Monatsreport — ein Zeile pro Eintrag
// (Arbeit, Home-Office, Urlaub, Krankheit, Überstundenabbau, Freier Tag).
// Kein DOM-Zugriff, keine globalen Abhängigkeiten - alles über ctx.
//
// ctx = {
//   formatDate, minutesToHM,
//   computeWorkMinutes, computeHomeofficeMinutes,
//   employeeName,   // seit v3.9.56: state.settings.employeeName (getrimmt), fuer Kopf-Metadatenzeile
//   isFreelance, formatEmploymentModelSummary,   // seit v3.9.73: Arbeitszeitmodell-Zusammenfassung
// }

import { reportMode } from '../report-mode.js';
import { getEmployerLetterhead } from '../employer-address.js';
import { activityLabelOf, entryKm, entryVehicle, formatKm, FS_VEHICLE_LABELS } from '../field-service.js';
import { isSundayISO } from '../sunday-hints.js';
const CSV_HEADER = ['Datum', 'Typ', 'Beginn', 'Ende', 'Pause (Min)', 'Stunden', 'Grund/Bemerkung'];
// Zusatzspalten Außendienst-Nachweis (seit v3.13.0)
const CSV_FS_HEADER = ['Tätigkeit', 'Einsatzort', 'Sonn/Feiertag', 'Kilometer', 'Fahrzeug'];

const TYPE_LABELS = {
  work: 'Arbeit',
  homeoffice: 'Home-Office',
  vacation: 'Urlaub',
  sick: 'Krankheit',
  education_leave: 'Bildungsurlaub',
  overtime_reduction: 'Überstundenabbau',
  off_day: 'Freier Tag',
};

/**
 * Escaped ein einzelnes CSV-Feld nach RFC 4180 (Semikolon-getrennt, Excel-de-DE-üblich).
 * @param {string|number} value
 * @returns {string}
 */
export function csvField(value) {
  let s = value === undefined || value === null ? '' : String(value);
  // Seit v3.15.6: Schutz gegen Formeln in Excel/LibreOffice. Freitext, der mit =, +, -, @,
  // Tab oder Wagenrücklauf beginnt, bekommt ein Hochkomma vorangestellt. Zahlen, Zeiten und
  // Beträge der App (z. B. „-0:30“, „-12,50“) bleiben unverändert und damit Zahlen.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d[\d.,:]*$/.test(s)) s = "'" + s;
  if (/[";\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * @param {any} report Ergebnis von computeMonthReport()
 * @param {{formatDate:(iso:string)=>string, minutesToHM:(m:number)=>string, computeWorkMinutes:(e:any)=>number, computeHomeofficeMinutes:(e:any)=>number, employeeName?:string, isFreelance?:()=>boolean, formatEmploymentModelSummary?:(e:any)=>string}} ctx
 * @returns {Blob}
 */
export function generateCsvBlob(report, ctx) {
  const { formatDate, minutesToHM, computeWorkMinutes, computeHomeofficeMinutes, employeeName } = ctx;

  const rows = [];
  // Außendienst-Nachweis (seit v3.13.0): Zusatzspalten nur, wenn für den Arbeitgeber aktiv.
  const fsm = report.fieldService || null;
  const holidayDates = new Set((report.holidays || []).map(h => h.date));
  const sunHol = (d) => (isSundayISO(d) ? (holidayDates.has(d) ? 'Sonntag, Feiertag' : 'Sonntag') : (holidayDates.has(d) ? 'Feiertag' : ''));

  (report.workEntries || []).forEach((e) => {
    const mins = computeWorkMinutes(e);
    const row = [e.date, TYPE_LABELS.work, e.start || '', e.end || '', e.breakMinutes ?? '', minutesToHM(mins), e.overtimeReason || e.note || ''];
    if (fsm) {
      const km = entryKm(e);
      row.push(activityLabelOf(e, fsm.settings), e.location || '', sunHol(e.date), km > 0 ? formatKm(km) : '', km > 0 ? FS_VEHICLE_LABELS[entryVehicle(e, fsm.settings)] : '');
    }
    rows.push(row);
  });
  (report.homeofficeEntries || []).forEach((e) => {
    const mins = computeHomeofficeMinutes(e);
    const segs = Array.isArray(e.segments) ? e.segments : [];
    const start = segs.length ? segs[0].start : '';
    const end = segs.length ? segs[segs.length - 1].end : '';
    rows.push([e.date, TYPE_LABELS.homeoffice, start, end, '', minutesToHM(mins), e.note || '']);
  });
  (report.vacationEntries || []).forEach((e) => {
    rows.push([e.date, TYPE_LABELS.vacation, '', '', '', '', e.note || '']);
  });
  (report.educationLeaveEntries || []).forEach((e) => {
    rows.push([e.date, TYPE_LABELS.education_leave, '', '', '', '', e.note || '']);
  });
  (report.sickEntries || []).forEach((e) => {
    rows.push([e.date, TYPE_LABELS.sick, '', '', '', '', e.note || '']);
  });
  (report.overtimeReductionEntries || []).forEach((e) => {
    rows.push([e.date, TYPE_LABELS.overtime_reduction, '', '', '', '', e.note || '']);
  });
  (report.offDayEntries || []).forEach((e) => {
    rows.push([e.date, TYPE_LABELS.off_day, '', '', '', '', e.note || '']);
  });

  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const formattedRows = rows.map((r) => {
    const out = [formatDate(r[0]), ...r.slice(1)];
    // Nicht-Präsenz-Zeilen: nur Sonn/Feiertag füllen (Home-Office kann Sonntagsarbeit sein).
    if (fsm && out.length === CSV_HEADER.length) out.push('', '', r[1] === TYPE_LABELS.homeoffice ? sunHol(r[0]) : '', '', '');
    return out;
  });

  // Kopf-Metadatenzeilen (Arbeitnehmer/in, Pers.-Nr.) — nur wenn jeweils gesetzt, seit v3.9.56.
  const empName = (employeeName || '').trim();
  const personnelNumber = (report.employer.personnelNumber || '').trim();
  const metaRows = [];
  const csvFreelance = reportMode(report.employer) === 'freelance';
  if (empName) metaRows.push([csvFreelance ? 'Freiberufler/in' : 'Arbeitnehmer/in', empName]);
  if (personnelNumber) metaRows.push(['Pers.-Nr.', personnelNumber]);
  // Firmenbezeichnung + Adresse (seit v3.10.0) als eine Metazeile.
  const letterhead = getEmployerLetterhead(report.employer);
  if (letterhead) metaRows.push([csvFreelance ? 'Kunde' : 'Arbeitgeber', letterhead.singleLine]);
  // Arbeitszeitmodell (nur im Angestellt-Modus relevant, seit v3.9.73).
  if (!csvFreelance) {
    const modelSummary = typeof ctx.formatEmploymentModelSummary === 'function'
      ? ctx.formatEmploymentModelSummary(report.employer)
      : '';
    if (modelSummary) metaRows.push(['Arbeitszeitmodell', modelSummary]);
    // Abgeltung bei Austritt (seit v3.9.99), nur im Monat von „Beschäftigt bis“.
    const xp = report.exitPayout;
    if (xp) {
      metaRows.push(['Beschäftigt bis', formatDate(xp.endDate)]);
      if (xp.vacationDays > 0) metaRows.push(['Urlaubsabgeltung (Tage)', String(xp.vacationDays).replace('.', ',')]);
      if (xp.overtimeMin > 0) metaRows.push(['Ausbezahlte Überstunden', minutesToHM(xp.overtimeMin)]);
    }
  }

  // Nachtschicht über den Monatsrand (seit v3.15.9), wie in PDF und Word.
  for (const t of (report.nightShiftNotes || [])) metaRows.push(['Nachtschicht', t]);

  const header = fsm ? [...CSV_HEADER, ...CSV_FS_HEADER] : CSV_HEADER;
  if (fsm && fsm.km > 0) {
    metaRows.push(['Kilometer gesamt', formatKm(fsm.km)]);
    if (fsm.amount > 0) metaRows.push(['Kilometer-Betrag (EUR)', fsm.amount.toFixed(2).replace('.', ',')]);
  }
  const tableRows = [header, ...formattedRows];
  const allRows = metaRows.length ? [...metaRows, [], ...tableRows] : tableRows;
  const lines = allRows.map((row) => row.map(csvField).join(';'));
  // BOM für Excel-de-DE (UTF-8-Erkennung von Umlauten in geöffneten CSVs).
  const csvContent = '\uFEFF' + lines.join('\r\n') + '\r\n';
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
}
