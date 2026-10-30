// SPDX-License-Identifier: MIT
// Bildungsurlaub nach Landesrecht (seit v3.11.0). Reine Daten + reine Funktionen, ohne DOM.
//
// Stand 30.10.2026, geprueft an der KMK-Uebersicht "Bildungsfreistellung in den Laendern"
// (Stand Oktober 2025) und den Landesgesetzen. Modelliert werden Tage, Zeitraum (1 oder 2
// Kalenderjahre), Beginn des 2-Jahres-Zeitraums, Wartezeit und Gueltigkeitsbeginn.
// Nicht modelliert (laeuft ueber den abweichenden Anspruch beim Arbeitgeber): Betriebsgroessen-
// Grenzen, Uebertrag/Ansparen mit Zustimmung des Arbeitgebers, Sonderregeln fuer Auszubildende.
//
// period:
//   'year'  — 1 Kalenderjahr
//   'odd'   — 2 Kalenderjahre, beginnend am 1. Januar eines ungeraden Jahres (RP, MV)
//   'hire'  — 2 aufeinanderfolgende Kalenderjahre ab dem Eintrittsjahr (BB, HB, HH);
//             ohne "Angestellt seit" wie 'odd'
// evenHireHalf: Eintritt im geraden Jahr → in diesem Jahr nur die Haelfte (MV, § 5 BfG M-V)

/** @typedef {{law:string, lawLong:string, days:number, period:'year'|'odd'|'hire', waitMonths:number, validFrom?:string, evenHireHalf?:boolean, note?:string}} EducationLeaveRule */

/** @type {Record<string, Array<EducationLeaveRule>>} */
export const EDUCATION_LEAVE_RULES = {
  BW: [{ law: 'BzG BW', lawLong: 'Bildungszeitgesetz Baden-Württemberg (BzG BW)', days: 5, period: 'year', waitMonths: 12, note: 'Betriebe mit weniger als 10 Beschäftigten sind ausgenommen.' }],
  BY: [],
  BE: [{ law: 'BiZeitG', lawLong: 'Berliner Bildungszeitgesetz (BiZeitG)', days: 5, period: 'year', waitMonths: 6 }],
  BB: [{ law: 'BbgWBG', lawLong: 'Brandenburgisches Weiterbildungsgesetz (BbgWBG)', days: 10, period: 'hire', waitMonths: 6 }],
  HB: [{ law: 'BremBZG', lawLong: 'Bremisches Bildungszeitgesetz (BremBZG)', days: 10, period: 'hire', waitMonths: 6 }],
  HH: [{ law: 'HmbBUG', lawLong: 'Hamburgisches Bildungsurlaubsgesetz (HmbBUG)', days: 10, period: 'hire', waitMonths: 6 }],
  HE: [{ law: 'HBUG', lawLong: 'Hessisches Bildungsurlaubsgesetz (HBUG)', days: 5, period: 'year', waitMonths: 6 }],
  MV: [{ law: 'BfG M-V', lawLong: 'Bildungsfreistellungsgesetz Mecklenburg-Vorpommern (BfG M-V)', days: 10, period: 'odd', waitMonths: 6, evenHireHalf: true }],
  NI: [
    { law: 'NBildUG', lawLong: 'Niedersächsisches Bildungsurlaubsgesetz (NBildUG)', days: 5, period: 'year', waitMonths: 6 },
    { law: 'NBildZG', lawLong: 'Niedersächsisches Bildungszeitgesetz (NBildZG)', days: 5, period: 'year', waitMonths: 6, validFrom: '2027-01-01' },
  ],
  NW: [{ law: 'AWbG', lawLong: 'Arbeitnehmerweiterbildungsgesetz NRW (AWbG)', days: 5, period: 'year', waitMonths: 6, note: 'Gilt nur in Betrieben mit mehr als 10 Beschäftigten.' }],
  RP: [{ law: 'BFG', lawLong: 'Bildungsfreistellungsgesetz Rheinland-Pfalz (BFG)', days: 10, period: 'odd', waitMonths: 6, note: 'In Betrieben mit weniger als 5 Beschäftigten besteht kein Anspruch.' }],
  SL: [{ law: 'SBFG', lawLong: 'Saarländisches Bildungsfreistellungsgesetz (SBFG)', days: 5, period: 'year', waitMonths: 6 }],
  SN: [{ law: 'SächsQZG', lawLong: 'Sächsisches Qualifizierungszeitgesetz (SächsQZG)', days: 3, period: 'year', waitMonths: 6, validFrom: '2027-01-01' }],
  ST: [{ law: 'BiFreistG', lawLong: 'Bildungsfreistellungsgesetz Sachsen-Anhalt (BiFreistG)', days: 5, period: 'year', waitMonths: 6, note: 'In Betrieben mit weniger als 5 Beschäftigten besteht kein Anspruch.' }],
  SH: [{ law: 'WBG', lawLong: 'Weiterbildungsgesetz Schleswig-Holstein (WBG)', days: 5, period: 'year', waitMonths: 6 }],
  TH: [{ law: 'ThürBfG', lawLong: 'Thüringer Bildungsfreistellungsgesetz (ThürBfG)', days: 5, period: 'year', waitMonths: 6, note: 'In Betrieben mit weniger als 5 Beschäftigten besteht kein Anspruch.' }],
};

/**
 * Gueltige Regel eines Bundeslands fuer ein Kalenderjahr (oder null, wenn kein Gesetz gilt).
 * Unbekannter oder fehlender Code → Hessen (Standard der App).
 * @param {string|undefined|null} stateCode
 * @param {number|string} year
 * @returns {EducationLeaveRule|null}
 */
export function getEducationLeaveRule(stateCode, year) {
  const code = stateCode && Object.prototype.hasOwnProperty.call(EDUCATION_LEAVE_RULES, stateCode) ? stateCode : 'HE';
  const start = `${String(year)}-01-01`;
  let found = null;
  for (const r of EDUCATION_LEAVE_RULES[code]) {
    if (!r.validFrom || r.validFrom <= start) found = r;
  }
  return found;
}

/** Erstes Jahr, in dem im Land eine Regel gilt (fuer Hinweise wie "ab 2027"), sonst null. */
export function getEducationLeaveFirstYear(stateCode) {
  const list = (stateCode && EDUCATION_LEAVE_RULES[stateCode]) || [];
  if (!list.length) return null;
  const vf = list[0].validFrom;
  return vf ? Number(vf.slice(0, 4)) : null;
}

/**
 * Zeitraum (Start- und Endjahr), zu dem ein Kalenderjahr gehoert.
 * @param {EducationLeaveRule|null} rule
 * @param {number} year
 * @param {number|null} hireYear
 * @returns {{startYear:number, endYear:number}}
 */
export function getEducationLeavePeriod(rule, year, hireYear) {
  if (!rule || rule.period === 'year') return { startYear: year, endYear: year };
  if (rule.period === 'hire' && hireYear && hireYear <= year) {
    const start = year - ((year - hireYear) % 2);
    return { startYear: start, endYear: start + 1 };
  }
  // 'odd' (und 'hire' ohne Eintrittsjahr): Zeitraum beginnt im ungeraden Jahr.
  if (rule.evenHireHalf && hireYear && hireYear === year && year % 2 === 0) {
    return { startYear: year, endYear: year };
  }
  const start = year % 2 === 1 ? year : year - 1;
  return { startYear: start, endYear: start + 1 };
}
