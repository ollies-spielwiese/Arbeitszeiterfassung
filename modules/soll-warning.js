// modules/soll-warning.js
// Sollstunden-Warnung (seit v3.9.78) — Bausteine "Monats-Saldo" und "Gleitzeitkonto-Saldo".
// Reine Berechnungsfunktionen ohne DOM-Zugriff, analog zu modules/compute.js.
//
// Vergleicht |Saldo| / Referenz-Soll gegen eine vom Nutzer eingestellte Prozentschwelle
// (state.settings.sollWarningMonthEnabled/ThresholdPct, sollWarningGleitzeitEnabled/ThresholdPct)
// und liefert strukturierte Warnobjekte, aus denen Banner-Text und Kachel-Hervorhebung
// erzeugt werden (siehe modules/render/soll-warning-banner.js, modules/selectors.js
// getSummaryFields, modules/render/gleitzeitkonto.js buildGleitzeitkontoHTML).

/**
 * Mindest-Referenz-Soll (Minuten), unterhalb dessen keine Bewertung erfolgt. Verhindert eine
 * durch Division durch einen sehr kleinen Nenner verzerrte (scheinbar riesige) Prozentangabe,
 * z. B. im ersten Teilmonat eines neuen Arbeitsverhältnisses.
 */
export const MIN_TARGET_MIN_FOR_EVALUATION = 60;

/**
 * Mindest-Schwelle (Prozent) fuer den Monats-Saldo-Baustein (seit v3.9.80). Eine vom Nutzer
 * eingestellte Schwelle wird fuer die WARNBEWERTUNG nie kleiner als dieser Wert gewertet
 * (die UI/Einstellung selbst zeigt weiterhin den eingegebenen Wert, siehe clampMonthThresholdPct).
 * Grund: Bei sehr niedrigen Schwellen (z.B. 3 %) waere schon ein einzelner, vollstaendig fehlender
 * Arbeitstag am Monatsanfang ein Fehlalarm, selbst mit dem Mindest-Arbeitstage-Schutz (siehe
 * computeMinElapsedWorkdaysForThreshold) — 10 % ist die niedrigste bereits bestehende Preset-Chip
 * und schliesst diese Luecke rechnerisch vollstaendig (siehe docs/ARCHITECTURE.md Abschnitt 11).
 */
export const MONTH_THRESHOLD_MIN_PCT = 10;

/**
 * Mindest-Betrags-Abweichung (Minuten) fuer den Monats-Saldo-Baustein (seit v3.9.80). Ergaenzender
 * Schutz zusätzlich zum Mindest-Arbeitstage-Schutz und zur Prozent-Mindestschwelle: eine winzige
 * absolute Abweichung (z. B. wenige Minuten durch Rundung) loest auch dann keine Warnung aus, wenn
 * sie prozentual auffaellig wirkt (moeglich bei einem sehr kleinen anteiligen Soll am Monatsanfang).
 */
export const MIN_ABSOLUTE_DEVIATION_MIN = 30;

/**
 * Wendet MONTH_THRESHOLD_MIN_PCT auf eine eingestellte Monats-Schwelle an. 0 (deaktiviert) bleibt
 * unveraendert 0.
 * @param {number} thresholdPct
 * @returns {number}
 */
export function clampMonthThresholdPct(thresholdPct) {
  const v = Number(thresholdPct) || 0;
  if (v <= 0) return v;
  return Math.max(v, MONTH_THRESHOLD_MIN_PCT);
}

/**
 * Mindestanzahl bereits vergangener Arbeitstage im Monat, bevor der Monats-Saldo-Baustein
 * ueberhaupt bewertet wird ("Mindest-Arbeitstage-Schutz", seit v3.9.80). Verhindert, dass ein
 * einzelner fehlender Arbeitstag am Monatsanfang allein schon die Schwelle ueberschreitet:
 * ein fehlender Tag verursacht genau 100/N Prozent Abweichung bei N vergangenen Arbeitstagen,
 * also muss N > 100/threshold sein, damit ein einzelner Tag NICHT ausreicht.
 * @param {number} thresholdPct Bereits ggf. per clampMonthThresholdPct gefloorte Schwelle
 * @returns {number}
 */
export function computeMinElapsedWorkdaysForThreshold(thresholdPct) {
  const effective = clampMonthThresholdPct(thresholdPct);
  if (effective <= 0) return Infinity;
  return Math.floor(100 / effective) + 1;
}

/**
 * @typedef {Object} SollWarning
 * @property {'month'|'gleitzeitkonto'} basis
 * @property {'over'|'under'} direction
 * @property {number} balance Saldo in Minuten (Vorzeichen: + = über Soll, - = unter Soll)
 * @property {number} targetMin Referenz-Soll in Minuten
 * @property {number} pct Betrags-Prozentsatz (gerundet) = |balance| / targetMin * 100
 * @property {number} thresholdPct Eingestellte Schwelle in Prozent
 */

/**
 * Prüft einen einzelnen Saldo/Soll-Wert gegen eine Schwelle.
 * @param {number} balance Saldo in Minuten
 * @param {number} targetMin Referenz-Soll in Minuten
 * @param {number} thresholdPct Schwelle in Prozent (1–100)
 * @param {'month'|'gleitzeitkonto'} basis
 * @returns {SollWarning|null} null, wenn Schwelle nicht erreicht/deaktiviert oder Datenbasis zu klein
 */
export function evaluateSollWarning(balance, targetMin, thresholdPct, basis) {
  const threshold = Number(thresholdPct) || 0;
  const target = Number(targetMin) || 0;
  if (threshold <= 0) return null;
  if (target < MIN_TARGET_MIN_FOR_EVALUATION) return null;
  const bal = Number(balance) || 0;
  const pct = (Math.abs(bal) / target) * 100;
  if (pct < threshold) return null;
  return {
    basis,
    direction: bal >= 0 ? 'over' : 'under',
    balance: bal,
    targetMin: target,
    pct: Math.round(pct),
    thresholdPct: threshold,
  };
}

/**
 * Baut den kurzen Erklärungstext für Tooltip/Banner aus einem Warnobjekt.
 * @param {SollWarning} w
 * @returns {string}
 */
export function formatSollWarningTooltipText(w) {
  const directionLabel = w.direction === 'over' ? 'über' : 'unter';
  const basisLabel = w.basis === 'month' ? 'deinem Monats-Soll' : 'deinem bisherigen Jahres-Soll';
  return `⚠ ${w.pct} % ${directionLabel} ${basisLabel} (Schwelle: ${w.thresholdPct} %).`;
}

/**
 * Kombiniert evaluateSollWarning + formatSollWarningTooltipText für die Kachel-Hervorhebung
 * (Monat-Tab, Gleitzeitkonto-Tab). Liefert null, wenn keine Warnung vorliegt.
 * @param {number} balance
 * @param {number} targetMin
 * @param {number} thresholdPct
 * @param {'month'|'gleitzeitkonto'} basis
 * @returns {(SollWarning & {tooltipText:string})|null}
 */
export function buildBalanceWarningInfo(balance, targetMin, thresholdPct, basis) {
  const w = evaluateSollWarning(balance, targetMin, thresholdPct, basis);
  if (!w) return null;
  return { ...w, tooltipText: formatSollWarningTooltipText(w) };
}

/**
 * Ermittelt alle aktiven Sollstunden-Warnungen über alle sichtbaren (nicht-ehemaligen)
 * Arbeitgeber — Grundlage für den Warn-Banner. Wertet je Arbeitgeber Monats- und/oder
 * Gleitzeitkonto-Baustein aus (sofern jeweils aktiviert). Im Freiberufler-Modus immer leer
 * (kein Soll/Saldo-Konzept dort).
 * @param {{state:object, computeMonthReport:(empId:string, ym:string)=>any,
 *          computeGleitzeitkontoRows:(emp:any, year:number)=>{rows:Array<any>},
 *          computeGleitzeitkontoWindow?:(emp:any, today:string)=>{balance:number, targetMin:number},
 *          computeElapsedMonthProgress?:(emp:any, ym:string, today:string)=>{elapsedWorkdays:number, totalWorkdays:number, proratedTargetMin:number},
 *          isFormerEmployer?:(emp:any, today:string)=>boolean}} ctx
 * @param {{ym:string, year:number, today:string}} period aktueller Monat/Jahr/Tag
 * @returns {Array<SollWarning & {employer:any, ym:string}>}
 */
export function computeActiveSollWarnings(ctx, period) {
  const { state, computeMonthReport, computeGleitzeitkontoRows, computeGleitzeitkontoWindow, computeElapsedMonthProgress, isFormerEmployer } = ctx;
  const settings = (state && state.settings) || {};
  if (settings.appMode === 'freelance') return [];
  const monthOn = !!settings.sollWarningMonthEnabled;
  const gleitzeitOn = !!settings.sollWarningGleitzeitEnabled;
  if (!monthOn && !gleitzeitOn) return [];

  const results = [];
  (state.employers || []).forEach((emp) => {
    if (typeof isFormerEmployer === 'function' && isFormerEmployer(emp, period.today)) return;
    // Kunde/Auftraggeber ohne vertragliche Sollstunden -> keine Bewertung möglich.
    const hasTarget = (Number(emp.weeklyHours) || 0) > 0 || (Number(emp.monthlyHours) || 0) > 0;
    if (!hasTarget) return;

    if (monthOn) {
      const r = computeMonthReport(emp.id, period.ym);
      if (r) {
        // Mindest-Arbeitstage-Schutz + Prozent-Mindestschwelle (seit v3.9.80): ohne diese wuerde
        // am Monatsanfang das VOLLE Monats-Soll gegen ein erst teilweise gearbeitetes Ist verglichen
        // und schon ein einzelner fehlender Arbeitstag koennte einen Fehlalarm ausloesen.
        let effectiveThresholdPct = settings.sollWarningMonthThresholdPct;
        let targetForEval = r.targetMin;
        let balanceToDate = r.balance;
        let guardOk = true;
        if (typeof computeElapsedMonthProgress === 'function') {
          const progress = computeElapsedMonthProgress(emp, period.ym, period.today);
          effectiveThresholdPct = clampMonthThresholdPct(settings.sollWarningMonthThresholdPct);
          const minDays = computeMinElapsedWorkdaysForThreshold(effectiveThresholdPct);
          guardOk = progress.elapsedWorkdays >= minDays;
          if (guardOk) {
            targetForEval = progress.proratedTargetMin;
            balanceToDate = r.workedMin + r.creditedAbsenceMin - progress.proratedTargetMin;
          }
        }
        // Zusaetzlicher Betrags-Schutz: eine winzige absolute Abweichung loest nie eine Warnung aus,
        // selbst wenn sie bei sehr kleinem anteiligem Soll prozentual auffaellig wirken wuerde.
        if (guardOk && Math.abs(balanceToDate) >= MIN_ABSOLUTE_DEVIATION_MIN) {
          const w = evaluateSollWarning(balanceToDate, targetForEval, effectiveThresholdPct, 'month');
          if (w) results.push({ ...w, employer: emp, ym: period.ym });
        }
      }
    }
    if (gleitzeitOn) {
      // Seit v3.9.81 bewertet die Gleitzeitkonto-Warnung ein rollierendes 3-Monats-Fenster
      // (computeGleitzeitkontoRollingWindow) statt des vollen Kalenderjahres-Saldos, damit ein
      // echter, aktueller Rückstand nicht durch lange zurückliegende positive Historie
      // "verdünnt" wird und unter der Warnschwelle verschwindet. Fallback auf das alte
      // volle-Jahr-Verhalten, falls ctx.computeGleitzeitkontoWindow fehlt (z. B. in älteren
      // Aufrufern/Regressionstests, die nur computeGleitzeitkontoRows bereitstellen).
      if (typeof computeGleitzeitkontoWindow === 'function') {
        const win = computeGleitzeitkontoWindow(emp, period.today);
        if (win && Math.abs(win.balance) >= MIN_ABSOLUTE_DEVIATION_MIN) {
          const w = evaluateSollWarning(win.balance, win.targetMin, settings.sollWarningGleitzeitThresholdPct, 'gleitzeitkonto');
          if (w) results.push({ ...w, employer: emp, ym: period.ym });
        }
      } else {
        const gk = computeGleitzeitkontoRows(emp, period.year);
        const rows = gk && gk.rows;
        if (rows && rows.length) {
          const last = rows[rows.length - 1];
          const w = evaluateSollWarning(last.cumulativeBalance, last.cumulativeTargetMin, settings.sollWarningGleitzeitThresholdPct, 'gleitzeitkonto');
          if (w) results.push({ ...w, employer: emp, ym: last.ym });
        }
      }
    }
  });
  return results;
}
