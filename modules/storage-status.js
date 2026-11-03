// @ts-check
/**
 * modules/storage-status.js (seit v3.14.0)
 *
 * Reine Logik für die Karte „Speicherstatus“ und die Backup-Erinnerung.
 * Kein DOM-Zugriff, keine Browser-APIs. Alle Werte werden übergeben,
 * damit sich die Fälle aus der Vorschau direkt testen lassen.
 *
 * Testfälle der Erinnerung (Vorschau v3.14.0, Stichtag 03.11.2026):
 *   A: Backup vor 3 Tagen, 12 Änderungen            → keine Erinnerung
 *   B: Backup vor 8 Tagen, 0 Änderungen             → keine Erinnerung
 *   C: Backup vor 8 Tagen, 5 Änderungen             → Erinnerung
 *   D: Backup vor 15 Tagen, 23 Änderungen           → Erinnerung
 *   E: noch nie, Daten seit 2 Tagen                 → Erinnerung „noch kein Backup“
 *   F: wie D, aber „Später erinnern“ vor 2 Tagen    → keine Erinnerung
 */

export const BACKUP_REMINDER_FIRST_DELAY_DAYS = 1;
export const BACKUP_REMINDER_INTERVAL_DAYS = 7;
export const BACKUP_REMINDER_SNOOZE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Settings-Felder, die nur Verwaltungsinformationen sind. Ihre Änderung zählt
 * nicht als „Änderung seit dem letzten Backup“.
 */
export const BACKUP_META_SETTINGS = [
  'lastBackupAt',
  'backupReminderSnoozeUntil',
  'backupReminderFirstSeenAt',
  'changesSinceBackup',
  'persistRequestedAt',
  'sollWarningSnoozeUntil',
];

/** Ganze Tage zwischen zwei Zeitpunkten (abgerundet). */
export function daysBetween(fromMs, toMs) {
  return Math.floor((toMs - fromMs) / DAY_MS);
}

/**
 * Liefert den Zähler „Änderungen seit dem letzten Backup“.
 * Fehlt er (Daten aus Versionen vor 3.14.0), gilt: mit Backup 1, damit die
 * bisherige 7-Tage-Erinnerung erhalten bleibt, sonst 0.
 * @param {any} settings
 * @returns {number}
 */
export function normalizeChangesSinceBackup(settings) {
  const s = settings || {};
  const n = s.changesSinceBackup;
  if (typeof n === 'number' && Number.isFinite(n) && n >= 0) return Math.floor(n);
  return s.lastBackupAt ? 1 : 0;
}

/** „1 Änderung“ / „23 Änderungen“ */
export function changesText(n) {
  return n === 1 ? '1 Änderung' : `${n} Änderungen`;
}

/** „vor 1 Tag“ / „vor 15 Tagen“ / „heute“ */
export function agoText(days) {
  if (days <= 0) return 'heute';
  return days === 1 ? 'vor 1 Tag' : `vor ${days} Tagen`;
}

/**
 * Entscheidet, ob die Backup-Erinnerung erscheint, und liefert den Text.
 * Gilt für beide Reiter (Erfassen und Einstellungen) gleich.
 * @param {{ hasData: boolean, lastBackupAt?: string|null, firstSeenAt?: string|null,
 *   changesSinceBackup?: number|null, snoozeUntil?: string|null, now: number }} p
 * @returns {{ show: boolean, reason: string, text: string, days: number|null, changes: number }}
 */
export function computeBackupReminder(p) {
  const changes = normalizeChangesSinceBackup({ changesSinceBackup: p.changesSinceBackup, lastBackupAt: p.lastBackupAt });
  const base = { show: false, reason: '', text: '', days: /** @type {number|null} */ (null), changes };
  if (p.snoozeUntil && new Date(p.snoozeUntil).getTime() > p.now) return { ...base, reason: 'snoozed' };
  if (!p.hasData) return { ...base, reason: 'no-data' };
  if (!p.lastBackupAt) {
    if (!p.firstSeenAt) return { ...base, reason: 'first-seen-pending' };
    const since = daysBetween(new Date(p.firstSeenAt).getTime(), p.now);
    if (since < BACKUP_REMINDER_FIRST_DELAY_DAYS) return { ...base, reason: 'grace' };
    return { ...base, show: true, reason: 'never',
      text: 'Du hast noch kein Backup erstellt. Sichere deine Daten regelmäßig, damit nichts verloren geht.' };
  }
  const days = daysBetween(new Date(p.lastBackupAt).getTime(), p.now);
  if (days < BACKUP_REMINDER_INTERVAL_DAYS) return { ...base, days, reason: 'recent' };
  if (changes <= 0) return { ...base, days, reason: 'unchanged' };
  const hasCounter = typeof p.changesSinceBackup === 'number';
  const text = hasCounter
    ? `Seit deinem letzten Backup ${agoText(days)} gibt es ${changesText(changes)}. Jetzt sichern?`
    : `Dein letztes Backup ist ${days} Tage her. Jetzt sichern?`;
  return { ...base, show: true, days, reason: 'due', text };
}

/**
 * Inhalt, der für „Änderungen seit dem letzten Backup“ zählt: alle Daten ohne
 * Verwaltungsfelder, Protokoll und laufende Stoppuhr.
 * @param {any} state
 * @returns {string}
 */
export function contentFingerprint(state) {
  if (!state || typeof state !== 'object') return '';
  const settings = { ...(state.settings || {}) };
  for (const k of BACKUP_META_SETTINGS) delete settings[k];
  const { auditLog, runningTimer, schemaVersion, pendingMigrationNotice, ...rest } = state;
  return JSON.stringify({ ...rest, settings });
}

/**
 * Erkennt Apple-Browser (Safari am Mac sowie alle Browser auf iPhone und iPad),
 * für die die 7-Tage-Regel von WebKit gilt.
 * @param {string} ua
 * @param {number} [maxTouchPoints]
 */
export function isAppleWebKit(ua, maxTouchPoints = 0) {
  const s = String(ua || '');
  if (/iPhone|iPad|iPod/.test(s)) return true;
  if (/Macintosh/.test(s) && maxTouchPoints > 1) return true; // iPadOS meldet sich als Mac
  return /Safari\//.test(s) && !/Chrome\/|Chromium\/|CriOS|FxiOS|EdgiOS|Edg\/|OPR\/|Android/.test(s);
}

/**
 * Zustand der Karte „Speicherstatus“.
 * @param {{ apiAvailable: boolean, persisted: boolean|null, appleWebKit: boolean, standalone: boolean }} p
 * @returns {{ key: 'granted'|'safari'|'other'|'unknown', badge: string, badgeClass: string, text: string, showRequestButton: boolean }}
 */
export function storageStatusInfo(p) {
  if (!p.apiAvailable || p.persisted === null) {
    return { key: 'unknown', badge: 'unbekannt', badgeClass: 'st-neutral', showRequestButton: false,
      text: 'Speicherstatus kann in diesem Browser nicht geprüft werden. Regelmäßige Backups schützen.' };
  }
  if (p.persisted) {
    return { key: 'granted', badge: 'aktiv', badgeClass: 'st-ok', showRequestButton: false,
      text: 'Der Browser löscht die Daten nicht automatisch. Backups schützen trotzdem bei Gerätewechsel oder Verlust.' };
  }
  if (p.appleWebKit && !p.standalone) {
    return { key: 'safari', badge: 'nicht gewährt', badgeClass: 'st-warn', showRequestButton: true,
      text: 'In Safari können Daten nach 7 Tagen ohne Nutzung gelöscht werden. Tipp: App zum Home-Bildschirm hinzufügen. Regelmäßige Backups schützen zusätzlich.' };
  }
  return { key: 'other', badge: 'nicht gewährt', badgeClass: 'st-warn', showRequestButton: true,
    text: 'Bei knappem Gerätespeicher kann der Browser Daten löschen. Regelmäßige Backups schützen.' };
}

/**
 * Soll der dauerhafte Speicher jetzt angefordert werden?
 * Nach dem ersten gespeicherten Eintrag einmal, als installierte App bei jedem Start.
 * @param {{ apiAvailable: boolean, persisted: boolean|null, hasEntries: boolean,
 *   persistRequestedAt?: string|null, standalone: boolean, requestedThisSession: boolean }} p
 */
export function shouldRequestPersist(p) {
  if (!p.apiAvailable || p.persisted !== false || p.requestedThisSession) return false;
  if (p.standalone) return true;
  return p.hasEntries && !p.persistRequestedAt;
}

/** „19.10.2026 (vor 15 Tagen)“ oder „noch keins“ */
export function lastBackupText(lastBackupAt, now) {
  if (!lastBackupAt) return 'noch keins';
  const d = new Date(lastBackupAt);
  if (Number.isNaN(d.getTime())) return 'noch keins';
  const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  return `${date} (${agoText(daysBetween(d.getTime(), now))})`;
}

/** „ca. 0,4 MB“ / „unter 0,1 MB“ */
export function sizeText(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unbekannt';
  const mb = bytes / (1024 * 1024);
  if (mb < 0.05) return 'unter 0,1 MB';
  return `ca. ${mb.toFixed(1).replace('.', ',')} MB`;
}
