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
// }

const CSV_HEADER = ['Datum', 'Typ', 'Beginn', 'Ende', 'Pause (Min)', 'Stunden', 'Grund/Bemerkung'];

const TYPE_LABELS = {
  work: 'Arbeit',
  homeoffice: 'Home-Office',
  vacation: 'Urlaub',
  sick: 'Krankheit',
  overtime_reduction: 'Überstundenabbau',
  off_day: 'Freier Tag',
};

/**
 * Escaped ein einzelnes CSV-Feld nach RFC 4180 (Semikolon-getrennt, Excel-de-DE-üblich).
 * @param {string|number} value
 * @returns {string}
 */
function csvField(value) {
  const s = value === undefined || value === null ? '' : String(value);
  if (/[";\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * @param {any} report Ergebnis von computeMonthReport()
 * @param {{formatDate:(iso:string)=>string, minutesToHM:(m:number)=>string, computeWorkMinutes:(e:any)=>number, computeHomeofficeMinutes:(e:any)=>number, employeeName?:string}} ctx
 * @returns {Blob}
 */
export function generateCsvBlob(report, ctx) {
  const { formatDate, minutesToHM, computeWorkMinutes, computeHomeofficeMinutes, employeeName } = ctx;

  const rows = [];

  (report.workEntries || []).forEach((e) => {
    const mins = computeWorkMinutes(e);
    rows.push([e.date, TYPE_LABELS.work, e.start || '', e.end || '', e.breakMinutes ?? '', minutesToHM(mins), e.overtimeReason || e.note || '']);
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
  const formattedRows = rows.map((r) => [formatDate(r[0]), ...r.slice(1)]);

  // Kopf-Metadatenzeilen (Arbeitnehmer/in, Pers.-Nr.) — nur wenn jeweils gesetzt, seit v3.9.56.
  const empName = (employeeName || '').trim();
  const personnelNumber = (report.employer.personnelNumber || '').trim();
  const metaRows = [];
  if (empName) metaRows.push(['Arbeitnehmer/in', empName]);
  if (personnelNumber) metaRows.push(['Pers.-Nr.', personnelNumber]);

  const tableRows = [CSV_HEADER, ...formattedRows];
  const allRows = metaRows.length ? [...metaRows, [], ...tableRows] : tableRows;
  const lines = allRows.map((row) => row.map(csvField).join(';'));
  // BOM für Excel-de-DE (UTF-8-Erkennung von Umlauten in geöffneten CSVs).
  const csvContent = '\uFEFF' + lines.join('\r\n') + '\r\n';
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
}
