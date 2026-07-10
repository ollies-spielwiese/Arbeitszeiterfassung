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
    hourlyRate: Number(report.employer.hourlyRate) || 0,
    currency: report.employer.currency || 'EUR',
  }));
  return `Sehr geehrte Damen und Herren,

anbei der Arbeitszeitnachweis für ${formatMonthYear(report.ym)}.

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
  const recipientList = document.getElementById('share-recipients');

  const emp = r.employer;
  const state = getState();
  const emailRecipients = [];
  const own = state.settings.ownEmail;
  if (own) emailRecipients.push({ label: 'An mich selbst', email: own, icon: '👤' });
  const contacts = (emp.contacts || []).filter(c => c.email);
  contacts.forEach(c => emailRecipients.push({ label: c.name || 'Ansprechpartner', email: c.email, icon: '📧' }));

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

  recipientList.innerHTML = cards.join('');

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

  const sendBtn = document.getElementById('share-send-btn');
  if (sendBtn) {
    const clone = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(clone, sendBtn);
    clone.addEventListener('click', () => {
      const useSystem = document.getElementById('share-mode-system')?.checked;
      const picked = Array.from(recipientList.querySelectorAll('.recipient-check:checked'))
        .map(cb => cb.dataset.email).filter(Boolean);
      const manualRaw = (document.getElementById('share-manual-emails')?.value || '').trim();
      const manual = manualRaw ? manualRaw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean) : [];
      const emails = Array.from(new Set([...picked, ...manual]));

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
              showMailtoStage2(mailto, emails.length, filename, { closeModals });
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

export function showMailtoStage2(mailto, count, filename, ctx) {
  const { closeModals } = ctx;
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
    btn.addEventListener('click', () => closeModals());
  });
  const a = content.querySelector('#mailto-open-btn');
  if (a) {
    a.addEventListener('click', () => {
      setTimeout(() => closeModals(), 300);
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
