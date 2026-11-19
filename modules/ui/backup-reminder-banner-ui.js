// @ts-check
/**
 * modules/ui/backup-reminder-banner-ui.js (seit v3.15.4, Roadmap 3 Stufe 2)
 *
 * Banner „Backup-Erinnerung“ in den Reitern Einstellungen und Erfassen (seit
 * v3.9.47, Kadenz überarbeitet in v3.9.68, zweites Ziel seit v3.14.0). Beide
 * Banner zeigen denselben Text.
 *   - Wurde noch nie ein Backup erstellt, erscheint die erste Erinnerung erst
 *     am Folgetag. Der Referenzzeitpunkt dafür wird einmalig in
 *     settings.backupReminderFirstSeenAt festgehalten (additives Feld, kein
 *     Migrations-Eintrag nötig).
 *   - Danach gilt ein fester Rhythmus seit dem letzten Backup, und zwar nur,
 *     wenn es seitdem Änderungen gibt.
 * Die Entscheidung steckt in modules/storage-status.js (computeBackupReminder).
 */
import { toAppContext } from '../app-context.js';
import { computeBackupReminder } from '../storage-status.js';
import { maybeRequestPersist } from './storage-status-ui.js';

/** DOM-Ziele des Banners (Einstellungen, Erfassen). */
export const BACKUP_REMINDER_TARGETS = Object.freeze([
  Object.freeze({ bannerId: 'backup-reminder-banner', textId: 'backup-reminder-text' }),
  Object.freeze({ bannerId: 'backup-reminder-banner-tracker', textId: 'backup-reminder-text-tracker' }),
]);

/**
 * Aktualisiert beide Banner und fragt bei Bedarf nach dauerhaftem Speicher.
 * @param {any} ctx
 */
export function updateBackupReminderBanner(ctx) {
  const cx = toAppContext(ctx);
  const st = cx.state.get();
  const settings = /** @type {import('../../types.js').AZSettings} */ (st.settings || {});
  const now = Date.now();
  const hasData = Array.isArray(st.entries) && st.entries.length > 0;
  // Referenzzeitpunkt für die Ein-Tag-Schonfrist einmalig festhalten.
  if (hasData && !settings.lastBackupAt && !settings.backupReminderFirstSeenAt
      && !(settings.backupReminderSnoozeUntil && new Date(settings.backupReminderSnoozeUntil).getTime() > now)) {
    settings.backupReminderFirstSeenAt = new Date(now).toISOString();
    cx.state.save();
  }
  const res = computeBackupReminder({
    hasData,
    lastBackupAt: settings.lastBackupAt,
    firstSeenAt: settings.backupReminderFirstSeenAt,
    changesSinceBackup: settings.changesSinceBackup,
    snoozeUntil: settings.backupReminderSnoozeUntil,
    now,
  });
  for (const t of BACKUP_REMINDER_TARGETS) {
    const banner = document.getElementById(t.bannerId);
    const textEl = document.getElementById(t.textId);
    if (!banner || !textEl) continue;
    banner.classList.toggle('hidden', !res.show);
    if (res.show) textEl.textContent = res.text;
  }
  try { maybeRequestPersist(cx).catch((err) => console.error(err)); } catch (err) { console.error(err); }
}
