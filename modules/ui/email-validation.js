// Gemeinsame Offline-Formatprüfung. Keine Postfach-/Erreichbarkeitsprüfung,
// keine Netzwerkabfrage und keine automatische Korrektur von Adressen.

/** @param {string} raw @returns {string} Fehlermeldung, leer bei optional/korrekt. */
export function emailFormatError(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (/\s/.test(value)) return 'Bitte das Leerzeichen innerhalb der E-Mail-Adresse entfernen.';
  if (!value.includes('@')) return 'Bitte eine E-Mail-Adresse mit @ eingeben, z. B. name@example.de.';
  if (value.endsWith('@') && value.split('@').length === 2) {
    return 'Bitte den Teil nach @ ergänzen, z. B. example.de.';
  }
  // Browser-Standard statt eigener restriktiver Regex. Auch Plus-Adressen
  // und lokale Domains sind erlaubt; ein gültiges Format garantiert kein Postfach.
  const probe = document.createElement('input');
  probe.type = 'email';
  probe.value = value;
  return probe.validity.valid ? '' : 'Bitte eine gültig formatierte E-Mail-Adresse eingeben, z. B. name@example.de.';
}

/** @param {string} raw @returns {string[]} Keine Trennung an Leerzeichen. */
export function splitEmailAddresses(raw) {
  return String(raw ?? '').split(/[,;]/).map(value => value.trim()).filter(Boolean);
}

/** @param {string} raw @returns {string} */
export function emailListError(raw) {
  const invalid = splitEmailAddresses(raw).filter(value => emailFormatError(value));
  return invalid.length
    ? `Bitte diese E-Mail-Adresse${invalid.length > 1 ? 'n' : ''} prüfen: ${invalid.join('; ')}.`
    : '';
}

/** @param {HTMLElement} element @param {string} message @returns {boolean} */
export function setEmailError(element, message) {
  if (!element) return true;
  const error = document.getElementById(`${element.id}-error`);
  element.setAttribute('aria-invalid', String(Boolean(message)));
  // Text statt HTML: auch gespeicherte/importierte Adressen sind untrusted.
  if (error) error.textContent = message;
  return !message;
}

/** @param {HTMLElement} element @param {boolean} [multiple] @returns {boolean} */
export function validateEmailField(element, multiple = false) {
  if (!element) return true;
  const input = /** @type {HTMLInputElement} */ (element);
  return setEmailError(input, multiple ? emailListError(input.value) : emailFormatError(input.value));
}

// Blur-Hinweise können das Klickziel verschieben (insbesondere in WebKit).
// Nur während einer primären Zeigeraktion bis Click-Capture zurückstellen:
// Dann steht das Ziel fest, vor der nativen Formular-/Submit-Prüfung.
/** @type {number|null} */
let pointerId = null;
let pointerGeneration = 0;
let pointerListenersInstalled = false;
/** @type {Map<HTMLElement, boolean>} */
const pendingBlur = new Map();

function flushPendingBlur() {
  const fields = [...pendingBlur];
  pendingBlur.clear();
  fields.forEach(([element, multiple]) => {
    if (element.isConnected && element.getClientRects().length) validateEmailField(element, multiple);
  });
}

function installPointerCoordination() {
  if (pointerListenersInstalled) return;
  pointerListenersInstalled = true;
  document.addEventListener('pointerdown', event => {
    if (event.isPrimary && event.button === 0) {
      pointerId = event.pointerId;
      pointerGeneration++;
    }
  }, true);
  document.addEventListener('click', () => {
    pointerId = null;
    flushPendingBlur();
  }, true);
  /** @param {PointerEvent} event */
  const finish = event => {
    if (event.pointerId !== pointerId) return;
    // Auch bei Abbruch/Loslassen ohne click keinen Feldhinweis verlieren.
    // Touch kann nach pointerup noch mousedown/blur/click auslösen. Deshalb
    // die laufende Aktivierung erst im click-Handler oder danach beenden.
    const releasedId = pointerId;
    const releasedGeneration = pointerGeneration;
    setTimeout(() => {
      if (pointerId === releasedId && pointerGeneration === releasedGeneration) {
        pointerId = null;
        flushPendingBlur();
      }
    }, 0);
  };
  document.addEventListener('pointerup', finish, true);
  document.addEventListener('pointercancel', finish, true);
  window.addEventListener('blur', () => {
    pointerId = null;
    flushPendingBlur();
  });
}

/** Erst bei Blur prüfen; nach einem Fehler während der Korrektur aktualisieren.
 * @param {HTMLElement} element @param {boolean} [multiple] */
export function wireEmailField(element, multiple = false) {
  if (!element) return;
  installPointerCoordination();
  // Native E-Mail-Validierung kann submit schon vor saveEmployer verhindern.
  // Nur ihre Sprechblase ersetzen; alle übrigen Formularregeln unverändert lassen.
  element.addEventListener('invalid', event => {
    event.preventDefault();
    validateEmailField(element, multiple);
    const input = /** @type {HTMLInputElement} */ (element);
    const firstInvalid = input.form
      ? Array.from(input.form.querySelectorAll('input[type="email"]'))
        .find(field => emailFormatError(/** @type {HTMLInputElement} */ (field).value))
      : null;
    (/** @type {HTMLElement} */ (firstInvalid) || element).focus();
  });
  element.addEventListener('blur', () => {
    if (pointerId !== null) pendingBlur.set(element, multiple);
    else validateEmailField(element, multiple);
  });
  element.addEventListener('input', () => {
    if (element.getAttribute('aria-invalid') === 'true') validateEmailField(element, multiple);
  });
}
