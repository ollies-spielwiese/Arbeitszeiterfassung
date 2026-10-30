// modules/export/vacation-certificate-pdf.js
// Urlaubsbescheinigung nach § 6 Abs. 2 BUrlG als PDF (seit v3.9.99). Bescheinigt den im
// Kalenderjahr des Beschäftigungsendes gewährten und abgegoltenen Urlaub, damit ein neuer
// Arbeitgeber Doppelansprüche nach § 6 Abs. 1 BUrlG anrechnen kann. Die App erstellt eine
// Vorlage aus den eigenen Aufzeichnungen; rechtsverbindlich ist die vom Arbeitgeber
// unterschriebene Fassung (Unterschriftsfeld am Ende).
// Kein DOM-Zugriff, keine globalen Abhängigkeiten – alles über ctx.
//
// ctx = { jsPDF, formatDate, todayISO }
import { getEmployerLetterhead } from '../employer-address.js';

function wrapText(doc, text, x, y, maxWidth, lineHeight = 5) {
  const split = doc.splitTextToSize(text, maxWidth);
  doc.text(split, x, y);
  return y + split.length * lineHeight;
}

/** @param {number} n */
export function formatVacationDays(n) {
  const v = Number(n) || 0;
  const str = String(Math.round(v * 100) / 100).replace('.', ',');
  return `${str} ${v === 1 ? 'Tag' : 'Tage'}`;
}

/**
 * Tabellenzeilen der Bescheinigung (auch für Regressionstests exportiert).
 * @param {ReturnType<typeof import('../compute.js').computeVacationCertificate>} cert
 * @returns {string[][]}
 */
export function buildVacationCertificateRows(cert) {
  if (!cert) return [];
  const rows = [
    ['Vertraglicher Jahresurlaub', formatVacationDays(cert.annualContract)],
    [`Urlaubsanspruch ${cert.year}${cert.prorated ? ` (anteilig ${cert.months}/12)` : ''}`, formatVacationDays(cert.entitlement)],
  ];
  if (cert.carryOver > 0) rows.push(['Übertrag aus dem Vorjahr', formatVacationDays(cert.carryOver)]);
  rows.push([`Im Kalenderjahr ${cert.year} gewährter Urlaub`, formatVacationDays(cert.grantedDays)]);
  rows.push(['Abgegoltener Urlaub (§ 7 Abs. 4 BUrlG)', formatVacationDays(cert.payoutDays)]);
  rows.push(['Gewährt oder abgegolten insgesamt', formatVacationDays(cert.totalGrantedOrPaid)]);
  rows.push(['Verbleibender Resturlaub', formatVacationDays(cert.remaining)]);
  return rows;
}

/**
 * @param {any} cert Ergebnis von computeVacationCertificate
 * @param {any} emp
 * @param {{employeeName?:string}} meta
 * @param {{jsPDF:any, formatDate:(iso:string)=>string, todayISO:()=>string}} ctx
 */
export function generateVacationCertificatePdfBlob(cert, emp, meta, ctx) {
  const { jsPDF, formatDate, todayISO } = ctx;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 20;
  const width = 170;
  let y = 25;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Urlaubsbescheinigung', marginX, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(90);
  doc.text(`gemäß § 6 Abs. 2 Bundesurlaubsgesetz (BUrlG) – Kalenderjahr ${cert.year}`, marginX, y);
  doc.setTextColor(0);
  y += 12;

  const period = cert.hiredSince
    ? `${formatDate(cert.hiredSince)} – ${formatDate(cert.endDate)}`
    : `bis ${formatDate(cert.endDate)}`;
  const metaLines = [
    ['Arbeitnehmer/in', (meta && meta.employeeName) || '—'],
  ];
  if (emp.personnelNumber) metaLines.push(['Pers.-Nr.', String(emp.personnelNumber)]);
  // Seit v3.10.0: volle Firmenbezeichnung mit Adresse, sofern gepflegt.
  const letterhead = getEmployerLetterhead(emp);
  metaLines.push(['Arbeitgeber', letterhead ? letterhead.lines.join('\n') : (emp.name || '—')]);
  metaLines.push(['Beschäftigungszeitraum', period]);
  doc.setFontSize(11);
  metaLines.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, marginX, y);
    doc.setFont('helvetica', 'normal');
    y = wrapText(doc, value, marginX + 50, y, width - 50, 5.5);
    y += 1;
  });
  y += 5;

  doc.setFontSize(11);
  y = wrapText(doc, `Hiermit wird bescheinigt, dass im Kalenderjahr ${cert.year} folgender Urlaub gewährt bzw. abgegolten wurde:`, marginX, y, width, 5.5);
  y += 3;

  const body = buildVacationCertificateRows(cert);
  const totalIdx = body.findIndex(r => r[0] === 'Gewährt oder abgegolten insgesamt');
  doc.autoTable({
    startY: y,
    body,
    theme: 'grid',
    styles: { fontSize: 11, cellPadding: 3, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 50, halign: 'right' } },
    margin: { left: marginX, right: marginX },
    didParseCell: (data) => {
      if (data.row.index === totalIdx) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [241, 245, 249]; }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  doc.setFontSize(10);
  if (cert.grantedDates.length) {
    y = wrapText(doc, `Gewährte Urlaubstage: ${cert.grantedDates.map(d => formatDate(d)).join(', ')}`, marginX, y, width, 5);
    y += 3;
  }
  if (cert.payoutExceeds) {
    doc.setTextColor(185, 28, 28);
    y = wrapText(doc, 'Hinweis: Die abgegoltenen Tage übersteigen den rechnerisch offenen Resturlaub. Bitte mit der Lohnabrechnung abgleichen.', marginX, y, width, 5);
    doc.setTextColor(0);
    y += 3;
  }
  doc.setFontSize(9);
  doc.setTextColor(90);
  y = wrapText(doc, 'Bildungsurlaub, Krankheitstage und Gleitzeit-Überstundenabbau sind nicht enthalten. Diese Vorlage wurde mit der Arbeitszeit-App aus den eigenen Aufzeichnungen erstellt; maßgeblich ist die vom Arbeitgeber ausgestellte und unterschriebene Bescheinigung.', marginX, y, width, 4.5);
  doc.setTextColor(0);

  // Unterschriftsfelder
  const sigY = Math.max(y + 30, 240);
  doc.setDrawColor(120);
  doc.line(marginX, sigY, marginX + 70, sigY);
  doc.line(marginX + 95, sigY, marginX + width, sigY);
  doc.setFontSize(9);
  doc.text('Ort, Datum', marginX, sigY + 5);
  doc.text('Stempel und Unterschrift Arbeitgeber', marginX + 95, sigY + 5);

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Erstellt am ${formatDate(todayISO())}`, marginX, 287);
  doc.setTextColor(0);
  return doc.output('blob');
}
