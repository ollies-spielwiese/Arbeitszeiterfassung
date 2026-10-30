// modules/employer-address.js
// Firmenbezeichnung und Firmenadresse eines Arbeitgebers/Kunden (seit v3.10.0).
// Pure Helfer ohne DOM-Zugriff: Der Kurzname (emp.name) bleibt für Auswahlfelder, Reiter,
// Dateinamen und E-Mail-Betreff; die Nachweise (PDF, Word, CSV, Gleitzeitkonto-PDF,
// Urlaubsbescheinigung) zeigen zusätzlich die volle Firmenbezeichnung mit Adresse.

export const LEGAL_NAME_MAX_LINES = 2;
export const ADDRESS_FIELD_MAX = 120;

/**
 * Normalisiert die Firmenbezeichnung: Zeilen trimmen, leere Zeilen entfernen, höchstens
 * zwei Zeilen und je Zeile höchstens 120 Zeichen.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeLegalName(raw) {
  return String(raw == null ? '' : raw)
    .split(/\r?\n/)
    .map(l => l.trim().slice(0, ADDRESS_FIELD_MAX))
    .filter(Boolean)
    .slice(0, LEGAL_NAME_MAX_LINES)
    .join('\n');
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeAddressField(raw) {
  return String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().slice(0, ADDRESS_FIELD_MAX);
}

/**
 * Briefkopf-Zeilen für Nachweise. Liefert null, wenn weder Firmenbezeichnung noch Adresse
 * gepflegt sind (dann bleiben alle Exporte wie bisher).
 * Nur Adresse ohne Firmenbezeichnung: erste Zeile ist der Kurzname.
 * @param {any} emp
 * @returns {{companyLines:string[], addressLines:string[], lines:string[], singleLine:string}|null}
 */
export function getEmployerLetterhead(emp) {
  if (!emp) return null;
  const legal = normalizeLegalName(emp.legalName);
  const street = normalizeAddressField(emp.street);
  const cityLine = [normalizeAddressField(emp.postalCode), normalizeAddressField(emp.city)].filter(Boolean).join(' ');
  const addressLines = [street, cityLine].filter(Boolean);
  if (!legal && !addressLines.length) return null;
  const companyLines = legal ? legal.split('\n') : [String(emp.name || '').trim()].filter(Boolean);
  const lines = [...companyLines, ...addressLines];
  return { companyLines, addressLines, lines, singleLine: lines.join(', ') };
}
