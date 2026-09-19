// modules/ui/autogrow.js
// Automatisch mitwachsende Bemerkungsfelder (Textareas), die ihre Hoehe an den
// Inhalt anpassen statt intern zu scrollen. Reine DOM-Utility ohne ctx-Abhaengigkeiten —
// wird von bootstrap.js (Live-Eingabe + Vorlagen-Einfuegen) und den Modal-Modulen
// (entry-modal.js, range-entry-modal.js, homeoffice-modal.js) fuer die Initialbefuellung
// bestehender Werte beim Oeffnen genutzt.
// Eingefuehrt fuer: "Bemerkung"-Felder in Zeit erfassen/bearbeiten, Zeitraum erfassen,
// Home-Office-Tag (v3.9.89).

/**
 * Passt die Hoehe einer Textarea an ihren aktuellen Inhalt an. Nimmt bewusst
 * HTMLElement (statt HTMLTextAreaElement) entgegen, da Aufrufer meist ueber
 * document.getElementById() (Rueckgabetyp HTMLElement) hereinreichen und die
 * Funktion ohnehin nur generische Element-Eigenschaften (style, scrollHeight)
 * anfasst.
 * @param {HTMLElement|null|undefined} el
 */
export function autoGrowTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * Registriert 'input'-Listener fuer die uebergebenen Textarea-IDs, die die
 * Hoehe live an den Inhalt anpassen. Ruft einmalig auch direkt auf, damit
 * bereits vorbefuellte Werte (z. B. beim Laden) korrekt hoch sind.
 * @param {string[]} ids
 */
export function wireAutoGrowTextareas(ids) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => autoGrowTextarea(el));
  });
}
