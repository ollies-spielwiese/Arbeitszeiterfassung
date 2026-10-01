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

/** Erst bei Blur prüfen; nach einem Fehler während der Korrektur aktualisieren.
 * @param {HTMLElement} element @param {boolean} [multiple] */
export function wireEmailField(element, multiple = false) {
  if (!element) return;
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
  element.addEventListener('blur', () => validateEmailField(element, multiple));
  element.addEventListener('input', () => {
    if (element.getAttribute('aria-invalid') === 'true') validateEmailField(element, multiple);
  });
}
