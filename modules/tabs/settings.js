// @ts-check
/**
 * modules/tabs/settings.js (seit v3.15.5, Roadmap 3 Stufe 2)
 *
 * Reiter „Einstellungen“: Name, E-Mail, Bundesland, Hinweise
 * Arbeitszeitgesetz, Modus, Feiertage, Notizvorlagen, Sollstunden-Warnung,
 * Speicherstatus, Backup-Ordner und Protokoll. Dazu die Sichtbarkeit der
 * modusabhängigen Bereiche (auch in Erfassen und im Arbeitgeber-Dialog);
 * andere Module erreichen sie über den Kontext: render.modeVisibility.
 * Backup erstellen und einlesen liegt in modules/ui/backup-ui.js.
 *
 * Regeln für modules/tabs/: kein Import von app.js, kein window.state,
 * alles Zustandsabhängige über toAppContext(ctx).
 */
import { toAppContext } from '../app-context.js';
import { isArbzgHintEnabled } from '../arbzg-hints.js';
import { getNightShiftRule } from '../night-shift.js';
import { buildAuditLogHTML } from '../render/audit-log.js';
import { formatDateLong } from '../util-time.js';
import { validateEmailField } from '../ui/email-validation.js';
import { renderFieldServiceSettings } from '../ui/field-service-ui.js';
import { renderStorageStatus } from '../ui/storage-status-ui.js';
import { renderHolidayList } from '../ui/holiday-overrides.js';
import { renderTemplates } from '../ui/templates.js';
import { updateBackupReminderBanner } from '../ui/backup-reminder-banner-ui.js';
import { renderBackupFolderSection } from '../ui/backup-ui.js';

/** @param {string} id */
const inputEl = (id) => /** @type {HTMLInputElement|null} */ (document.getElementById(id));

/**
 * Zeichnet den Reiter Einstellungen.
 * @param {any} ctx
 */
export function renderSettings(ctx) {
  const cx = toAppContext(ctx);
  const settings = cx.state.get().settings;
  /** @type {HTMLInputElement} */ (inputEl('setting-employee-name')).value = settings.employeeName || '';
  const emailEl = /** @type {HTMLInputElement} */ (inputEl('setting-own-email'));
  emailEl.value = settings.ownEmail || '';
  validateEmailField(emailEl);
  /** @type {HTMLInputElement} */ (inputEl('setting-state')).value = settings.state || 'HE';
  const arbzgCb = inputEl('setting-arbzg-hints');
  if (arbzgCb) arbzgCb.checked = isArbzgHintEnabled(settings);
  try { renderFieldServiceSettings(cx); } catch (err) { console.error(err); }
  try { renderStorageStatus(cx).catch((err) => console.error(err)); } catch (err) { console.error(err); }
  // Nachtschicht über Mitternacht (seit v3.15.8)
  const nightRule = getNightShiftRule(settings);
  document.querySelectorAll('input[name="setting-night-shift"]').forEach((r) => {
    const radio = /** @type {HTMLInputElement} */ (r);
    radio.checked = (radio.value === nightRule);
  });
  // Modus-Radios
  const mode = cx.data.appMode();
  document.querySelectorAll('input[name="setting-app-mode"]').forEach((r) => {
    const radio = /** @type {HTMLInputElement} */ (r);
    radio.checked = (radio.value === mode);
  });
  const yearInput = inputEl('holiday-year');
  if (yearInput && !yearInput.value) {
    yearInput.value = String(new Date().getFullYear());
  }
  renderHolidayList(cx);
  renderTemplates(cx);
  updateModeVisibility(cx);
  renderAuditLog(cx);
  updateBackupReminderBanner(cx);
  renderBackupFolderSection(cx);
  syncSollWarningSettingsUI(cx);
}

/**
 * Spiegelt die Einstellungen der Sollstunden-Warnung (Häkchen und Auswahl der
 * Schwelle) in die Oberfläche; bei jedem Öffnen der Einstellungen.
 * @param {any} cx gebauter Kontext
 */
function syncSollWarningSettingsUI(cx) {
  const settings = cx.state.get().settings;
  ['month', 'gleitzeit'].forEach((basis) => {
    const enabledKey = basis === 'month' ? 'sollWarningMonthEnabled' : 'sollWarningGleitzeitEnabled';
    const thresholdKey = basis === 'month' ? 'sollWarningMonthThresholdPct' : 'sollWarningGleitzeitThresholdPct';
    const enabledCb = inputEl(`setting-sw-${basis}-enabled`);
    if (enabledCb) enabledCb.checked = !!settings[enabledKey];
    const current = Number(settings[thresholdKey]) || 0;
    document.querySelectorAll(`.sw-chip[data-target="${basis}"]`).forEach((btn) => {
      btn.classList.toggle('active', Number(/** @type {HTMLElement} */ (btn).dataset.value) === current);
    });
    const customInput = inputEl(`setting-sw-${basis}-threshold-custom`);
    if (customInput) customInput.value = current ? String(current) : '';
  });
}

/**
 * Zentraler Sichtbarkeits-Schalter für modusabhängige Bereiche. Wird beim
 * Zeichnen der Einstellungen, beim Moduswechsel und nach einem Import
 * aufgerufen.
 * @param {any} ctx
 */
export function updateModeVisibility(ctx) {
  const cx = toAppContext(ctx);
  const freelance = cx.data.isFreelance();
  /** @param {string} id @param {boolean} hidden */
  const toggle = (id, hidden) => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', hidden); };
  // Einstellungen: Bundesland, Feiertage und Sollstunden-Warnung im Modus Freiberuflich ausblenden
  toggle('settings-block-state', freelance);
  toggle('settings-block-holidays', freelance);
  toggle('settings-block-sw', freelance);
  // Erfassen: Knopf „+ Urlaub / Krankheit“ im Modus Freiberuflich verstecken
  const btnAbsence = document.getElementById('btn-add-absence');
  if (btnAbsence) btnAbsence.style.display = freelance ? 'none' : '';
  // Arbeitgeber-Dialog: Urlaubsanspruch, Bildungsurlaub und Arbeitszeitmodell
  // gelten nur für angestellte Arbeitsverhältnisse.
  toggle('employer-vacation-row', freelance);
  toggle('employer-education-leave-row', freelance);
  toggle('fs-employer-employment-model', freelance);
  // Reiter-Beschriftung Arbeitgeber oder Kunden
  const tabEmployers = document.querySelector('[data-view="employers"]');
  if (tabEmployers) tabEmployers.textContent = cx.format.label('employers');
  // Beschriftung des Namensfelds nach Hauptmodus
  const empNameLabel = document.getElementById('settings-employee-name-label');
  if (empNameLabel) empNameLabel.textContent = freelance ? 'Freiberufler/in – Name' : 'Arbeitnehmer/in – Name';
  // Eintragstyp „Arbeitgeber“ heißt im Hauptmodus Freiberuflich „Nebenerwerb“
  const employerKindOption = document.getElementById('employer-kind-option-employer');
  if (employerKindOption) employerKindOption.textContent = freelance ? 'Arbeitgeber (Modus „Nebenerwerb“)' : 'Arbeitgeber (Modus „Angestellt“)';
}

/**
 * Zeichnet das Protokoll in den Einstellungen.
 * @param {any} ctx
 */
export function renderAuditLog(ctx) {
  const cx = toAppContext(ctx);
  const container = document.getElementById('audit-log-list');
  if (!container) return;
  container.innerHTML = buildAuditLogHTML(cx.state.get().auditLog, {
    escapeHtml: cx.format.escapeHtml,
    getEmployer: cx.data.employer,
    formatDateLong,
  });
}
