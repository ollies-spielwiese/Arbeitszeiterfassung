// Gemeinsame Offline-Formatprüfung. Keine Postfach-/Erreichbarkeitsprüfung,
// keine Netzwerkabfrage und keine automatische Korrektur von Adressen.

// Bewusstes App-Profil: ASCII-Dot-Atom + DNS-Hostname, keine vollständige
// RFC-5322-Header-Syntax. Quoted Strings, Address Literals und SMTPUTF8 werden
// als nicht unterstützt erklärt, nicht als grundsätzlich ungültig bezeichnet.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const LOCAL_CHARACTERS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const DOMAIN_CHARACTERS = /^[A-Za-z0-9.-]+$/;

/** @param {string} raw @returns {string} Fehlermeldung, leer bei optional/korrekt. */
export function emailFormatError(raw) {
  const original = String(raw ?? '');
  if (CONTROL_CHARACTERS.test(original)) return 'Bitte Zeilenumbrüche und Steuerzeichen aus der E-Mail-Adresse entfernen.';
  const value = original.trim();
  if (!value) return '';
  if (value.startsWith('"')) return 'E-Mail-Adressen mit einem Teil in Anführungszeichen vor dem @ werden in dieser App derzeit nicht unterstützt.';
  if (!value.includes('@')) return 'Bitte eine E-Mail-Adresse mit @ eingeben, z. B. name@example.de.';
  if (value.indexOf('@') !== value.lastIndexOf('@')) return 'Bitte genau ein @ als Trennzeichen zwischen Name und Domain verwenden.';
  const [local, domain] = value.split('@');
  if (!local) return 'Bitte den Teil vor dem @ ergänzen, z. B. name.';
  if (!domain) return 'Bitte den Teil nach @ ergänzen, z. B. example.de.';
  if (/\s/.test(value)) return 'Bitte das Leerzeichen innerhalb der E-Mail-Adresse entfernen.';
  if (/[^\x00-\x7f]/.test(local)) return 'Internationale Zeichen vor dem @ erfordern SMTPUTF8 und werden in dieser App derzeit nicht unterstützt.';
  if (local.length > 64) return 'Der Teil vor dem @ darf höchstens 64 ASCII-Zeichen lang sein.';
  if (!LOCAL_CHARACTERS.test(local)) return 'Vor dem @ sind Buchstaben, Ziffern und zulässige Sonderzeichen erlaubt, z. B. Punkt, +, -, _ oder Apostroph. Dieses Zeichen bzw. diese Schreibweise wird nicht unterstützt.';
  if (local.startsWith('.') || local.endsWith('.')) return 'Vor dem @ darf kein Punkt am Anfang oder Ende stehen.';
  if (local.includes('..')) return 'Vor dem @ dürfen keine zwei Punkte direkt aufeinander folgen.';
  if (domain.startsWith('[')) return 'IP-Adressen in eckigen Klammern nach dem @ werden in dieser App derzeit nicht unterstützt. Bitte eine Domain-Adresse verwenden.';
  if (/[^\x00-\x7f]/.test(domain)) return 'Für internationale Domains nach dem @ wird derzeit die vom Anbieter bestätigte ASCII-/Punycode-Schreibweise benötigt.';
  if (!DOMAIN_CHARACTERS.test(domain)) return 'Nach dem @ sind in der Domain nur Buchstaben A–Z, Ziffern, Bindestriche und trennende Punkte erlaubt; kein Unterstrich.';
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return 'Nach dem @ dürfen Punkte nur zwischen nicht leeren Domainteilen stehen.';
  const labels = domain.split('.');
  for (const label of labels) {
    if (label.length > 63) return 'Jeder Domainteil nach dem @ darf höchstens 63 ASCII-Zeichen lang sein.';
    if (label.startsWith('-') || label.endsWith('-')) return 'Ein Domainteil nach dem @ darf nicht mit einem Bindestrich beginnen oder enden.';
  }
  // Nach ASCII-Prüfung entsprechen Zeichen den SMTP-Oktetten.
  // 256 Oktette für den SMTP-Pfad einschließlich < und > lassen 254 übrig.
  if (value.length > 254) return 'Die vollständige E-Mail-Adresse darf höchstens 254 ASCII-Zeichen lang sein.';
  // Auch ASCII-Domainteile mit xn-- werden hier nur auf DNS-Label-Syntax
  // geprüft: keine Punycode-Decodierung, IDNA-, DNS- oder Zustellgarantie.
  return '';
}

/** @param {string} raw @returns {string[]} Keine Trennung an Leerzeichen. */
export function splitEmailAddresses(raw) {
  return String(raw ?? '').split(/[,;]/).map(value => value.trim()).filter(Boolean);
}

/** @param {string} raw @returns {string} */
export function emailListError(raw) {
  if (CONTROL_CHARACTERS.test(String(raw ?? ''))) return 'Bitte Zeilenumbrüche und Steuerzeichen aus der Empfängerliste entfernen.';
  const invalid = splitEmailAddresses(raw)
    .map(value => ({ value, error: emailFormatError(value) }))
    .filter(item => item.error);
  return invalid.length
    ? `Bitte diese E-Mail-Adresse${invalid.length > 1 ? 'n' : ''} prüfen: ${invalid.map(item => `${item.value} (${item.error})`).join('; ')}`
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
