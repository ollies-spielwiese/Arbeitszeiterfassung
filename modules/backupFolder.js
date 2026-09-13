// modules/backupFolder.js
// Backup-Ordner (File System Access API) — persistente Ordner-Auswahl für
// automatisierte Backups. Nur Chromium (Chrome/Edge Desktop + Android)
// unterstützt showDirectoryPicker; Safari/iOS/Firefox nicht (Stand 2026).
// Dort bleibt der bisherige Download-Weg aus modules/backup.js bestehen —
// siehe die Apple/Safari-Hinweistexte in app.js#renderBackupFolderSection.
//
// Der FileSystemDirectoryHandle ist NICHT Teil des exportierten Backup-JSON
// (geräte-/browserspezifisch, nicht sinnvoll übertragbar) und wird separat
// in einer eigenen kleinen IndexedDB-Datenbank gehalten.

const DB_NAME = 'az-backup-folder';
const STORE_NAME = 'handles';
const DB_VERSION = 1;
const HANDLE_KEY = 'backupFolderHandle';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB nicht verfügbar')); return; }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** True nur auf Browsern mit File-System-Access-API (Chrome/Edge). */
export function isFolderPickerSupported() {
  // @ts-ignore — showDirectoryPicker ist experimentell und nicht in TS-DOM-Typen enthalten
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Speichert den Directory-Handle persistent (überschreibt einen evtl. vorhandenen). */
export async function storeFolderHandle(handle) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Liefert den gespeicherten Directory-Handle oder null, falls keiner existiert. */
export async function getStoredFolderHandle() {
  try {
    const db = await openDb();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch (e) {
    return null;
  }
}

/** Entfernt den gespeicherten Directory-Handle (z.B. vor Neuauswahl). */
export async function clearFolderHandle() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) { /* ignore */ }
}

/** Öffnet den nativen Ordner-Dialog und speichert die Auswahl. Wirft bei Abbruch (AbortError). */
export async function chooseFolder() {
  // @ts-ignore — showDirectoryPicker ist experimentell und nicht in TS-DOM-Typen enthalten
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await storeFolderHandle(handle);
  return handle;
}

/**
 * Prüft die Schreibberechtigung für einen Handle.
 * `request: true` fordert sie aktiv an (braucht eine echte User-Geste, z.B.
 * einen Button-Klick) — ohne das Flag wird nur stumm geprüft (queryPermission).
 * Rückgabe: 'granted' | 'denied' | 'prompt'.
 */
export async function queryFolderPermission(handle, { request = false } = {}) {
  if (!handle || typeof handle.queryPermission !== 'function') return 'denied';
  const opts = { mode: 'readwrite' };
  let perm;
  try {
    perm = await handle.queryPermission(opts);
  } catch (e) {
    return 'denied';
  }
  if (perm !== 'granted' && request && typeof handle.requestPermission === 'function') {
    try {
      perm = await handle.requestPermission(opts);
    } catch (e) {
      return 'denied';
    }
  }
  return perm;
}

/** Schreibt `content` als Datei `filename` in den gewählten Ordner. */
export async function writeBackupToFolder(handle, filename, content) {
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}
