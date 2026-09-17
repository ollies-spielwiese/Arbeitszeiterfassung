// modules/share.js
// Share-Flow: Web Share API + Mailto-Fallback + iOS-Two-Stage.
// Reine Funktionen mit ctx-DI - kein Modul-State, keine globalen Referenzen.
//
// ctx (openShareModal / shareReport) = {
//   getCurrentReport,
//   getState,                    // liefert state fuer settings.ownEmail
//   fileNameForReport,
//   formatMonthYear,
//   renderSummaryPlaintext,
//   getSummaryFields,
//   generateWordBlob,
//   generatePdfBlob,
//   downloadBlob,
//   toast,
//   escapeHtml,
//   closeModals,
// }
//
// ctx (shareOverviewPdf) = {
//   getCurrentOverview,
//   generateOverviewPdfBlob,
//   fileNameForOverview,
//   formatMonthYear,
//   downloadBlob,
//   toast,
// }
//
// ctx (openOverviewShareModal) = {
//   getCurrentOverview,
//   getState,                    // liefert state fuer settings.ownEmail
//   fileNameForOverview,
//   formatMonthYear,
//   renderSummaryPlaintext,
//   getOverviewSummaryFields,
//   generateOverviewPdfBlob,
//   downloadBlob,
//   toast,
//   escapeHtml,
//   closeModals,
// }

function isIOSPlatform() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    || /iPad|iPhone|iPod/i.test(navigator.userAgentData?.platform || '');
}

function buildMailBody(report, ctx) {
  const { formatMonthYear, renderSummaryPlaintext, getSummaryFields } = ctx;
  const summaryLines = renderSummaryPlaintext(getSummaryFields({
    workedMin: report.workedMin,
    targetMin: report.targetMin,
    balance: report.balance,
    vacationDays: report.vacationEntries.length,
    sickDays: report.sickEntries.length,
    overtimeReductionDays: (report.overtimeReductionEntries || []).length,
    hourlyRate: Number(report.employer.hourlyRate) || 0,
    currency: report.employer.currency || 'EUR',
  }));
  return `Sehr geehrte Damen und Herren,

anbei der Arbeitszeitnachweis für ${formatMonthYear(report.ym)}.

Zusammenfassung:
${summaryLines.join('\n')}

Mit freundlichen Grüßen`;
}

function buildOverviewMailBody(ov, ctx) {
  const { formatMonthYear, renderSummaryPlaintext, getOverviewSummaryFields } = ctx;
  const summaryLines = renderSummaryPlaintext(getOverviewSummaryFields(ov));
  return `Sehr geehrte Damen und Herren,

anbei die Monatsübersicht für ${formatMonthYear(ov.ym)}.

Zusammenfassung:
${summaryLines.join('\n')}

Mit freundlichen Grüßen`;
}

function buildMailto(emails, subject, body, filename) {
  const to = emails.map(encodeURIComponent).join(',');
  return `mailto:${to}`
    + `?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body + '\n\nBitte den Anhang „' + filename + '“ hinzufügen.')}`;
}

// Baut die Empfaenger-Karten (Checkbox-Kacheln + manuelles Eingabefeld + "Nur teilen"-Option),
// die sowohl im Monat- als auch im Uebersicht-Freigabe-Dialog identisch verwendet werden.
function buildRecipientCardsHTML(emailRecipients, escapeHtml) {
  const cards = [];
  cards.push(`
    <div class="share-hint">Mehrere Empfänger möglich – die E-Mail-App öffnet sich mit allen Adressen im An-Feld.</div>
  `);
  cards.push(...emailRecipients.map((rc) => `
    <label class="recipient-card">
      <input type="checkbox" class="recipient-check" data-email="${escapeHtml(rc.email)}" />
      <div class="recipient-icon">${rc.icon}</div>
      <div class="recipient-info">
        <div class="recipient-name">${escapeHtml(rc.label)}</div>
        <div class="recipient-email">${escapeHtml(rc.email)}</div>
      </div>
    </label>
  `));

  cards.push(`
    <div class="recipient-manual">
      <label for="share-manual-emails" class="recipient-manual-label">Weitere E-Mail-Adressen (durch Komma getrennt)</label>
      <input type="text" id="share-manual-emails" placeholder="z. B. buero@firma.de, chef@firma.de" autocomplete="off" />
    </div>
  `);

  cards.push(`
    <label class="recipient-card recipient-system">
      <input type="radio" name="share-mode" id="share-mode-system" />
      <div class="recipient-icon">📤</div>
      <div class="recipient-info">
        <div class="recipient-name">Nur teilen (System-Dialog)</div>
        <div class="recipient-email">iOS/Android Teilen-Dialog – ohne E-Mail-Empfänger</div>
      </div>
    </label>
  `);

  return cards.join('');
}

// Verdrahtet die Wechselwirkung zwischen Empfaenger-Checkboxen, manuellem Eingabefeld
// und der "Nur teilen"-Systemoption (gegenseitiger Ausschluss). Identisch fuer beide Dialoge.
function wireRecipientInteractions(recipientList) {
  const systemRadio = document.getElementById('share-mode-system');
  const checks = recipientList.querySelectorAll('.recipient-check');
  if (systemRadio) {
    systemRadio.addEventListener('change', () => {
      if (systemRadio.checked) {
        checks.forEach(cb => cb.checked = false);
        const manual = document.getElementById('share-manual-emails');
        if (manual) manual.value = '';
      }
    });
  }
  checks.forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked && systemRadio) systemRadio.checked = false;
  }));
  const manualInput = document.getElementById('share-manual-emails');
  if (manualInput) manualInput.addEventListener('input', () => {
    if (manualInput.value.trim() && systemRadio) systemRadio.checked = false;
  });
}

// Liest die aktuelle Empfaenger-Auswahl (System-Dialog vs. E-Mail-Adressen) aus dem DOM.
function readRecipientSelection(recipientList) {
  const useSystem = document.getElementById('share-mode-system')?.checked;
  const picked = Array.from(recipientList.querySelectorAll('.recipient-check:checked'))
    .map(cb => cb.dataset.email).filter(Boolean);
  const manualRaw = (document.getElementById('share-manual-emails')?.value || '').trim();
  const manual = manualRaw ? manualRaw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean) : [];
  const emails = Array.from(new Set([...picked, ...manual]));
  return { useSystem, emails };
}

export function openShareModal(ctx) {
  const {
    getCurrentReport, getState, escapeHtml,
    fileNameForReport, formatMonthYear,
    renderSummaryPlaintext, getSummaryFields,
    generateWordBlob, generatePdfBlob,
    downloadBlob, toast, closeModals,
  } = ctx;

  const r = getCurrentReport();
  if (!r) return;
  const modal = document.getElementById('modal-share');
  const content = modal.querySelector('.modal-content');
  // Defensiver Reset: falls zuvor der Uebersicht-Dialog offen war, ist das Markup
  // aktuell OVERVIEW_SHARE_MODAL_HTML (kein Format-Radio) — ohne diesen Reset wuerde
  // der folgende Zugriff auf 'input[name="share-format"]' fehlschlagen.
  resetShareModalContent(content, closeModals, SHARE_MODAL_DEFAULT_HTML);
  const recipientList = document.getElementById('share-recipients');

  const emp = r.employer;
  const state = getState();
  const emailRecipients = [];
  const own = state.settings.ownEmail;
  if (own) emailRecipients.push({ label: 'An mich selbst', email: own, icon: '👤' });
  const contacts = (emp.contacts || []).filter(c => c.email);
  contacts.forEach(c => emailRecipients.push({ label: c.name || 'Ansprechpartner', email: c.email, icon: '📧' }));

  recipientList.innerHTML = buildRecipientCardsHTML(emailRecipients, escapeHtml);
  wireRecipientInteractions(recipientList);

  const sendBtn = document.getElementById('share-send-btn');
  if (sendBtn) {
    const clone = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(clone, sendBtn);
    clone.addEventListener('click', () => {
      const { useSystem, emails } = readRecipientSelection(recipientList);

      const format = document.querySelector('input[name="share-format"]:checked').value;

      if (!useSystem && emails.length === 0) {
        toast('Bitte mindestens einen Empfänger wählen oder „Nur teilen“ anklicken');
        return;
      }

      if (!useSystem && emails.length > 0) {
        const rep = getCurrentReport();
        if (!rep) return;
        const filename = fileNameForReport(rep, format);
        const subject = `Arbeitszeitnachweis ${formatMonthYear(rep.ym)} – ${rep.employer.name}`;
        const body = buildMailBody(rep, ctx);
        const mailto = buildMailto(emails, subject, body, filename);

        if (isIOSPlatform()) {
          (async () => {
            try {
              const blob = format === 'docx' ? await generateWordBlob(rep) : await generatePdfBlob(rep);
              downloadBlob(blob, filename);
              showMailtoStage2(mailto, emails.length, filename, { closeModals, restoreHtml: SHARE_MODAL_DEFAULT_HTML });
            } catch (err) {
              console.error(err);
              toast('Datei-Erstellung fehlgeschlagen: ' + err.message);
            }
          })();
          return;
        }

        try { window.location.href = mailto; } catch (e) { console.warn('mailto failed', e); }
        (async () => {
          try {
            const blob = format === 'docx' ? await generateWordBlob(rep) : await generatePdfBlob(rep);
            downloadBlob(blob, filename);
            toast(emails.length === 1
              ? 'E-Mail-App geöffnet – Datei heruntergeladen, bitte anhängen'
              : `E-Mail-App geöffnet mit ${emails.length} Empfängern – Datei heruntergeladen`);
          } catch (err) {
            console.error(err);
            toast('Datei-Erstellung fehlgeschlagen: ' + err.message);
          }
        })();
        closeModals();
        return;
      }

      closeModals();
      shareReport(format, [], ctx);
    });
  }

  modal.classList.remove('hidden');
}

// Freigabe-Dialog fuer den Reiter "Uebersicht" (Monatsauswertung ueber alle Arbeitgeber).
// Baugleich zu openShareModal (Empfaenger-Kacheln, manuelle Adressen, "Nur teilen"-Option,
// Mailto-/iOS-Stage2-Fallback) — einzige inhaltliche Abweichung: die Uebersicht kennt keine
// Formatwahl (es gibt bisher nur PDF, kein Word-Export fuer die aggregierte Auswertung), die
// Format-Zeile zeigt deshalb nur eine deaktivierte "PDF"-Option statt einer echten Wahl. Die
// Arbeitgeber-Kontakte ALLER in der Uebersicht enthaltenen Arbeitgeber werden angezeigt
// (mit Firmenname in Klammern zur Unterscheidung), da die Uebersicht mehrere Arbeitgeber
// zusammenfasst statt wie im Monat-Dialog genau einen.
export function openOverviewShareModal(ctx) {
  const {
    getCurrentOverview, getState, escapeHtml,
    fileNameForOverview, formatMonthYear,
    generateOverviewPdfBlob,
    downloadBlob, toast, closeModals,
  } = ctx;

  const ov = getCurrentOverview();
  if (!ov) return;
  const modal = document.getElementById('modal-share');
  const content = modal.querySelector('.modal-content');
  // Immer auf das Uebersicht-Markup zuruecksetzen — falls zuvor der Monat-Dialog
  // offen war, enthaelt #modal-share sonst noch die Format-Radios/Empfaenger-Logik
  // des Monat-Dialogs.
  resetShareModalContent(content, closeModals, OVERVIEW_SHARE_MODAL_HTML);
  const recipientList = document.getElementById('share-recipients');

  const state = getState();
  const emailRecipients = [];
  const seenEmails = new Set();
  const own = state.settings.ownEmail;
  if (own) { emailRecipients.push({ label: 'An mich selbst', email: own, icon: '👤' }); seenEmails.add(own); }
  (ov.rows || []).forEach((row) => {
    const emp = row && row.employer;
    if (!emp) return;
    (emp.contacts || []).filter(c => c.email).forEach((c) => {
      if (seenEmails.has(c.email)) return;
      seenEmails.add(c.email);
      emailRecipients.push({ label: `${c.name || 'Ansprechpartner'} (${emp.name})`, email: c.email, icon: '📧' });
    });
  });

  recipientList.innerHTML = buildRecipientCardsHTML(emailRecipients, escapeHtml);
  wireRecipientInteractions(recipientList);

  const sendBtn = document.getElementById('share-send-btn');
  if (sendBtn) {
    const clone = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(clone, sendBtn);
    clone.addEventListener('click', () => {
      const { useSystem, emails } = readRecipientSelection(recipientList);

      if (!useSystem && emails.length === 0) {
        toast('Bitte mindestens einen Empfänger wählen oder „Nur teilen“ anklicken');
        return;
      }

      if (!useSystem && emails.length > 0) {
        const cur = getCurrentOverview();
        if (!cur) return;
        const filename = fileNameForOverview(cur, 'pdf');
        const subject = `Arbeitszeit-Übersicht ${formatMonthYear(cur.ym)}`;
        const body = buildOverviewMailBody(cur, ctx);
        const mailto = buildMailto(emails, subject, body, filename);

        if (isIOSPlatform()) {
          (async () => {
            try {
              const blob = await generateOverviewPdfBlob(cur);
              downloadBlob(blob, filename);
              showMailtoStage2(mailto, emails.length, filename, { closeModals, restoreHtml: OVERVIEW_SHARE_MODAL_HTML });
            } catch (err) {
              console.error(err);
              toast('Datei-Erstellung fehlgeschlagen: ' + err.message);
            }
          })();
          return;
        }

        try { window.location.href = mailto; } catch (e) { console.warn('mailto failed', e); }
        (async () => {
          try {
            const blob = await generateOverviewPdfBlob(cur);
            downloadBlob(blob, filename);
            toast(emails.length === 1
              ? 'E-Mail-App geöffnet – Datei heruntergeladen, bitte anhängen'
              : `E-Mail-App geöffnet mit ${emails.length} Empfängern – Datei heruntergeladen`);
          } catch (err) {
            console.error(err);
            toast('Datei-Erstellung fehlgeschlagen: ' + err.message);
          }
        })();
        closeModals();
        return;
      }

      closeModals();
      shareOverviewPdf(ctx);
    });
  }

  modal.classList.remove('hidden');
}

// Statisches Ursprungs-Markup von #modal-share .modal-content (siehe index.html).
// showMailtoStage2() ersetzt diesen Inhalt vorübergehend durch die "Fast fertig"-
// Ansicht; beim Verlassen dieser Ansicht muss GENAU dieses Markup wiederhergestellt
// werden, sonst bleibt der Freigabe-Dialog beim naechsten Oeffnen leer/defekt, weil
// #share-recipients, #share-send-btn und die Format-Radios fehlen.
// Bei Aenderungen am Formular in index.html bitte auch hier nachziehen.
const SHARE_MODAL_DEFAULT_HTML = `
    <div class="modal-header">
      <h3>Auswertung versenden</h3>
      <button class="modal-close" data-close-modal>✕</button>
    </div>
    <div class="form-row">
      <label>Format</label>
      <div class="radio-row">
        <label><input type="radio" name="share-format" value="docx" checked /> Word</label>
        <label><input type="radio" name="share-format" value="pdf" /> PDF</label>
      </div>
    </div>
    <div class="form-row">
      <label>Empfänger</label>
      <div id="share-recipients" class="recipient-list"></div>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" data-close-modal>Abbrechen</button>
      <button type="button" class="btn-primary" id="share-send-btn">Senden / Teilen</button>
    </div>
  `;

// Analoges Markup fuer den Uebersicht-Freigabe-Dialog — gleicher Aufbau (Format-Zeile,
// Empfaenger-Zeile, Aktionen), aber die Format-Zeile zeigt nur die deaktivierte Option
// "PDF", da die Uebersicht bisher keinen Word-Export anbietet. Bei Aenderungen an
// SHARE_MODAL_DEFAULT_HTML bitte pruefen, ob diese Struktur nachgezogen werden muss.
const OVERVIEW_SHARE_MODAL_HTML = `
    <div class="modal-header">
      <h3>Auswertung versenden</h3>
      <button class="modal-close" data-close-modal>✕</button>
    </div>
    <div class="form-row">
      <label>Format</label>
      <div class="radio-row">
        <label><input type="radio" name="share-format-overview" value="pdf" checked disabled /> PDF</label>
      </div>
    </div>
    <div class="form-row">
      <label>Empfänger</label>
      <div id="share-recipients" class="recipient-list"></div>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" data-close-modal>Abbrechen</button>
      <button type="button" class="btn-primary" id="share-send-btn">Senden / Teilen</button>
    </div>
  `;

// Stellt das urspruengliche Freigabe-Formular wieder her, nachdem showMailtoStage2()
// den Dialoginhalt ueberschrieben hatte. Ohne diesen Reset wuerde ein erneutes
// Oeffnen des Dialogs (openShareModal/openOverviewShareModal) auf fehlende Elemente
// treffen und abstuerzen. `html` waehlt zwischen Monat- und Uebersicht-Markup.
function resetShareModalContent(content, closeModals, html = SHARE_MODAL_DEFAULT_HTML) {
  content.innerHTML = html;
  content.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModals());
  });
}

export function showMailtoStage2(mailto, count, filename, ctx) {
  const { closeModals, restoreHtml } = ctx;
  const modal = document.getElementById('modal-share');
  const content = modal.querySelector('.modal-content');
  if (!content) return;
  const label = count === 1
    ? `Datei „${filename}“ heruntergeladen. Jetzt E-Mail-App öffnen und die Datei anhängen.`
    : `Datei „${filename}“ heruntergeladen. Jetzt öffnet sich die E-Mail-App mit ${count} Empfängern – bitte die Datei anhängen.`;
  content.innerHTML = `
    <div class="modal-header">
      <h3>Fast fertig</h3>
      <button class="modal-close" data-close-modal>✕</button>
    </div>
    <div class="mailto-stage2">
      <div class="mailto-stage2-icon">✉️</div>
      <p class="mailto-stage2-text">${label}</p>
      <a class="btn-primary mailto-stage2-btn" id="mailto-open-btn" href="${mailto.replace(/"/g, '&quot;')}">E-Mail-App öffnen</a>
      <button type="button" class="btn-secondary" data-close-modal>Fertig / Abbrechen</button>
    </div>
  `;
  content.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      resetShareModalContent(content, closeModals, restoreHtml);
      closeModals();
    });
  });
  const a = content.querySelector('#mailto-open-btn');
  if (a) {
    a.addEventListener('click', () => {
      setTimeout(() => {
        resetShareModalContent(content, closeModals, restoreHtml);
        closeModals();
      }, 300);
    });
  }
}

export async function shareReport(format, recipientEmails, ctx) {
  const {
    getCurrentReport, fileNameForReport, formatMonthYear,
    generateWordBlob, generatePdfBlob, downloadBlob, toast,
  } = ctx;

  const r = getCurrentReport();
  if (!r) return;

  const emails = Array.isArray(recipientEmails)
    ? recipientEmails.filter(Boolean)
    : (recipientEmails ? [recipientEmails] : []);

  let blob, filename, mimeType;
  try {
    if (format === 'docx') {
      blob = await generateWordBlob(r);
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      filename = fileNameForReport(r, 'docx');
    } else {
      blob = await generatePdfBlob(r);
      mimeType = 'application/pdf';
      filename = fileNameForReport(r, 'pdf');
    }
  } catch (err) {
    console.error(err); toast('Erstellung fehlgeschlagen: ' + err.message); return;
  }

  const subject = `Arbeitszeitnachweis ${formatMonthYear(r.ym)} – ${r.employer.name}`;
  const body = buildMailBody(r, ctx);

  if (emails.length > 0) {
    const mailto = buildMailto(emails, subject, body, filename);
    const a = document.createElement('a');
    a.href = mailto;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    downloadBlob(blob, filename);

    toast(emails.length === 1
      ? 'E-Mail-App öffnet sich – Datei heruntergeladen, bitte anhängen'
      : `E-Mail-App öffnet mit ${emails.length} Empfängern – Datei heruntergeladen`);
    return;
  }

  const file = new File([blob], filename, { type: mimeType });
  const shareData = { title: subject, text: body, files: [file] };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share(shareData);
      toast('Geteilt');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('Web Share failed, falling back', err);
    }
  }

  downloadBlob(blob, filename);
  toast(`Datei „${filename}“ heruntergeladen`);
}

export async function shareOverviewPdf(ctx) {
  const {
    getCurrentOverview, generateOverviewPdfBlob, fileNameForOverview,
    formatMonthYear, downloadBlob, toast,
  } = ctx;

  const ov = getCurrentOverview();
  if (!ov) return;
  try {
    const blob = await generateOverviewPdfBlob(ov);
    const filename = fileNameForOverview(ov, 'pdf');
    const file = new File([blob], filename, { type: 'application/pdf' });
    const shareData = {
      title: `Arbeitszeit-Übersicht ${formatMonthYear(ov.ym)}`,
      text: `Monatsübersicht – alle Arbeitgeber – ${formatMonthYear(ov.ym)}`,
      files: [file],
    };
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share(shareData);
    } else {
      downloadBlob(blob, filename);
      toast('Datei heruntergeladen (Teilen wird nicht unterstützt)');
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error(err);
    toast('Teilen fehlgeschlagen: ' + err.message);
  }
}
