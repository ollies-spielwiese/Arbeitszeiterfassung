// modules/export/km-pdf.js
// Kilometer-Aufstellung als PDF (seit v3.13.0, Außendienst-Nachweis).
// Aufstellung dienstlicher Fahrten für die Reisekostenabrechnung, Strecke in km,
// ohne Kilometerstand. Pure Funktion: alles über ctx, kein DOM-Zugriff.
//
// ctx = { jsPDF, state, formatDateLong, formatMonthYear }

import { getEmployerLetterhead } from '../employer-address.js';
import { formatKm, formatEuro, FS_VEHICLE_LABELS } from '../field-service.js';

const BLUE = [0, 82, 155];
const SUM_FILL = [248, 250, 252];
const TOTAL_FILL = [230, 238, 248];

/**
 * Zeilen der Einzelnachweis-Tabelle inkl. Tagessummen und Gesamtzeile.
 * @param {any} fsm report.fieldService
 * @param {(iso:string)=>string} formatDateLong
 * @param {string} monthLabel
 */
export function buildKmTableBody(fsm, formatDateLong, monthLabel) {
  const body = [];
  const trips = fsm.trips || [];
  const showAmount = trips.some(t => t.vehicle === 'private');
  const money = (t) => (t.vehicle === 'company' ? '—' : formatEuro(t.amount));
  const sumCell = (content, fill) => ({ content, styles: { fontStyle: 'bold', fillColor: fill } });
  let i = 0;
  while (i < trips.length) {
    const date = trips[i].date;
    const day = [];
    while (i < trips.length && trips[i].date === date) day.push(trips[i++]);
    for (const t of day) {
      body.push([
        formatDateLong(t.date),
        `${t.start}-${t.end}`,
        t.from || '—',
        t.to || '—',
        t.reason,
        formatKm(t.km),
        showAmount ? money(t) : '—',
      ]);
    }
    if (day.length > 1) {
      const km = day.reduce((s, t) => s + t.km, 0);
      const amt = day.reduce((s, t) => s + t.amount, 0);
      body.push([
        { content: `Summe ${formatDateLong(date)}`, colSpan: 5, styles: { fontStyle: 'bold', fillColor: SUM_FILL } },
        sumCell(formatKm(km), SUM_FILL),
        sumCell(showAmount ? formatEuro(amt) : '—', SUM_FILL),
      ]);
    }
  }
  body.push([
    { content: `Gesamt ${monthLabel}`, colSpan: 5, styles: { fontStyle: 'bold', fillColor: TOTAL_FILL } },
    sumCell(formatKm(fsm.km), TOTAL_FILL),
    sumCell(showAmount ? formatEuro(fsm.amount) : '—', TOTAL_FILL),
  ]);
  return body;
}

/** Text der Fahrzeug-Zeile. */
export function kmVehicleLine(fsm) {
  const rate = `Kilometersatz ${formatEuro(fsm.rate)} pro km`;
  const hasPrivate = fsm.kmPrivate > 0;
  const hasCompany = fsm.kmCompany > 0;
  if (hasPrivate && hasCompany) return `${FS_VEHICLE_LABELS.private} (${rate}) und ${FS_VEHICLE_LABELS.company}`;
  if (hasCompany) return `${FS_VEHICLE_LABELS.company} (nur Kilometer, kein Betrag)`;
  return `${FS_VEHICLE_LABELS.private} · ${rate}`;
}

export function generateKmPdfBlob(report, ctx) {
  const { jsPDF, state, formatDateLong, formatMonthYear } = ctx;
  const fsm = report.fieldService;
  if (!fsm) throw new Error('Außendienst-Nachweis ist für diesen Arbeitgeber nicht aktiv');
  const monthLabel = formatMonthYear(report.ym);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const X = 15;
  let y = 20;
  const blue = () => doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  blue();
  doc.text('Kilometer-Aufstellung', X, y);
  doc.setTextColor(0);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(`${report.employer.name} – ${monthLabel}`, X, y);
  y += 6;

  const kv = (k, v) => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    const w = doc.getTextWidth(k);
    doc.text(k, X, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(v, 180 - w - 1);
    doc.text(lines, X + w + 1, y);
    y += Math.max(1, lines.length) * 5 + 1;
  };
  const letterhead = getEmployerLetterhead(report.employer);
  kv('Arbeitgeber: ', letterhead ? letterhead.singleLine : report.employer.name);
  const empName = (state.settings.employeeName || '').trim();
  if (empName) kv('Arbeitnehmer/in: ', empName);
  const pn = (report.employer.personnelNumber || '').trim();
  if (pn) kv('Pers.-Nr.: ', pn);
  kv('Fahrzeug: ', kmVehicleLine(fsm));
  y += 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  blue();
  doc.text('Zusammenfassung', X, y);
  doc.setTextColor(0);
  y += 5;
  const summary = [
    ['Dienstliche Fahrten', String(fsm.trips.length)],
    ['Fahrtage', String(fsm.tripDays)],
    ['Kilometer gesamt', `${formatKm(fsm.km)} km`],
  ];
  if (fsm.kmCompany > 0 && fsm.kmPrivate > 0) {
    summary.push(['davon Privat-PKW', `${formatKm(fsm.kmPrivate)} km`]);
    summary.push(['davon Dienstwagen', `${formatKm(fsm.kmCompany)} km`]);
  }
  if (fsm.kmPrivate > 0) summary.push(['Erstattungsbetrag (Privat-PKW)', formatEuro(fsm.amount)]);
  doc.autoTable({
    startY: y, body: summary, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 1.2 },
    columnStyles: { 0: { cellWidth: 70 }, 1: { fontStyle: 'bold' } },
    margin: { left: X },
  });
  y = doc.lastAutoTable.finalY + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  blue();
  doc.text('Einzelnachweis', X, y);
  doc.setTextColor(0);
  doc.autoTable({
    startY: y + 2,
    head: [['Datum', 'Zeit', 'Von', 'Nach / Einsatzort', 'Anlass', 'km', 'Betrag']],
    body: buildKmTableBody(fsm, formatDateLong, monthLabel),
    styles: { fontSize: 8.5, cellPadding: 1.8, overflow: 'linebreak' },
    headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 25 }, 1: { cellWidth: 20 }, 2: { cellWidth: 36 }, 3: { cellWidth: 38 },
      4: { cellWidth: 23 }, 5: { cellWidth: 12, halign: 'right' }, 6: { cellWidth: 26, halign: 'right' },
    },
    margin: { left: X, right: X, bottom: 20 },
    didParseCell: (d) => { if (d.section === 'head' && d.column.index >= 5) d.cell.styles.halign = 'right'; },
  });
  y = doc.lastAutoTable.finalY + 7;

  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  const foot = doc.splitTextToSize('Aufstellung dienstlicher Fahrten für die Reisekostenabrechnung (Strecke in km, ohne Kilometerstand). Fahrten zwischen Wohnung und erster Tätigkeitsstätte sind nicht enthalten. Bei Dienstwagen werden nur Kilometer ausgewiesen, kein Betrag.', 180);
  doc.text(foot, X, y);
  y += foot.length * 4.5 + 3;
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100);
  doc.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, X, y);
  y += 18;
  if (y > 270) { doc.addPage(); y = 30; }
  const pageW = doc.internal.pageSize.getWidth();
  const sigW = 70;
  doc.setDrawColor(150);
  doc.line(X, y, X + sigW, y);
  doc.line(pageW - X - sigW, y, pageW - X, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(empName ? `${empName} – Unterschrift / Datum` : 'Unterschrift Arbeitnehmer / Datum', X, y);
  doc.text('Unterschrift Arbeitgeber / Datum', pageW - X - sigW, y);

  const total = doc.internal.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    const parts = ['Kilometer-Aufstellung', report.employer.name];
    if (empName) parts.push(empName);
    parts.push(`Monat ${monthLabel}`, `Seite ${p} von ${total}`);
    doc.text(parts.join(' – '), pageW / 2, pageH - 8, { align: 'center' });
    doc.setTextColor(0);
  }
  return doc.output('blob');
}
