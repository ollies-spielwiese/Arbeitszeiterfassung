// @ts-check
/**
 * modules/tabs/employers.js (seit v3.15.5, Roadmap 3 Stufe 2)
 *
 * Reiter „Arbeitgeber“ (im Modus Freiberuflich „Kunden“): Liste der Karten,
 * Beschriftung von Reiter und Überschrift, Klick öffnet den Dialog. Seit
 * v3.9.58 liegen Arbeitgeber und Kunden in derselben Liste, werden hier aber
 * nach ihrem festen Feld kind getrennt angezeigt. Das HTML der Karten liegt in
 * modules/render/employers.js, der Dialog in modules/ui/employer-modal.js.
 *
 * Regeln für modules/tabs/: kein Import von app.js, kein window.state,
 * alles Zustandsabhängige über toAppContext(ctx).
 */
import { toAppContext } from '../app-context.js';
import { isFormerEmployer } from '../compute.js';
import { buildEmployerCardsHTML } from '../render/employers.js';
import { openEmployerModal } from '../ui/employer-modal.js';
import { applyDataColors } from '../util-format.js';

/**
 * Beschriftung der Pausenregel auf der Karte.
 * @param {string} mode
 * @returns {string}
 */
function breakModeLabel(mode) {
  return /** @type {Record<string, string>} */ ({
    legal: 'Pause gesetzlich', manual: 'Pause manuell',
    flex: 'Gleitzeit', none: 'Ohne Pause',
  })[mode] || mode;
}

/**
 * Zeichnet den Reiter Arbeitgeber.
 * @param {any} ctx
 */
export function renderEmployers(ctx) {
  const cx = toAppContext(ctx);
  const L = cx.format.label;
  const escapeHtml = cx.format.escapeHtml;
  const container = /** @type {HTMLElement} */ (document.getElementById('employers-list'));
  // Reiter-Beschriftung an den Modus anpassen
  const empTabBtn = document.querySelector('.tab[data-view="employers"]');
  if (empTabBtn) empTabBtn.textContent = L('employers');
  const empViewTitle = document.getElementById('employers-view-title');
  if (empViewTitle) empViewTitle.textContent = `${L('employers')} verwalten`;
  const wantedKind = cx.data.isFreelance() ? 'client' : 'employer';
  /** @type {any[]} */
  const employers = cx.state.get().employers;
  const relevantEmployers = employers.filter((e) => (e.kind === 'employer' || e.kind === 'client') ? e.kind === wantedKind : true);
  if (!relevantEmployers.length) {
    container.innerHTML = `<div class="empty-state">Noch kein ${escapeHtml(L('employer'))} angelegt.<br><br>Klicken Sie oben auf „+ Neu", um zu starten.</div>`;
    return;
  }
  container.innerHTML = buildEmployerCardsHTML(relevantEmployers, {
    escapeHtml,
    formatMoney: cx.format.money,
    breakModeLabel,
    isFreelance: cx.data.isFreelance,
    isFormerEmployer,
    todayISO: cx.data.todayISO,
    formatDate: cx.format.date,
  });
  applyDataColors(container);

  container.querySelectorAll('.employer-card').forEach((card) => {
    card.addEventListener('click', () => {
      const emp = cx.data.employer(/** @type {HTMLElement} */ (card).dataset.id);
      if (emp) openEmployerModal(emp, cx);
    });
  });
}
