// injected/gmail-inject.js — runs in the Gmail page context.
// Strategy: when a compose window is open, append an invisible tracking pixel
// to the compose body BEFORE the user hits Send. We detect "sent" by watching
// for the compose window closing + undo snackbar, and we also add the pixel
// proactively as soon as the extension hands back a PIXEL_READY message.

(() => {
  if (window.__emailTrackerInjected) return;
  window.__emailTrackerInjected = true;

  let requestId = 0;
  const pending = new Map();

  function postToExtension(type, payload = {}) {
    return new Promise((resolve) => {
      const id = ++requestId;
      pending.set(id, resolve);
      window.postMessage({ source: "email-tracker-page", type, requestId: id, ...payload }, "*");
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "email-tracker-ext") return;
    const cb = pending.get(data.requestId);
    if (cb) { pending.delete(data.requestId); cb(data); }
  });

  // ---- DOM helpers ----------------------------------------------------
  function findComposeWindows() {
    // Gmail compose dialogs use div[role="dialog"] with class "nH" wrappers;
    // the iframe editor has class "vM" / aria-label "Message Body".
    return Array.from(document.querySelectorAll('div[role="dialog"]')).filter((d) =>
      d.querySelector('iframe[arialabel], iframe[class*="vM"], iframe[name="to"]') ||
      d.querySelector('td.aP.nU span[email]') // recipient row present
    );
  }

  function recipientsOf(dialog) {
    const emails = [];
    dialog.querySelectorAll('td.aP.nU span[email], div[auid] span[email]').forEach((s) => {
      if (s.getAttribute("email")) emails.push(s.getAttribute("email"));
    });
    return [...new Set(emails)];
  }

  function subjectOf(dialog) {
    const h = dialog.querySelector('h2[data-field="subject"]');
    return h ? h.textContent.trim() : "";
  }

  function bodyFrameOf(dialog) {
    return dialog.querySelector('iframe'); // first iframe in compose = editor
  }

  // ---- pixel injection ------------------------------------------------
  async function injectPixelInto(dialog) {
    if (dialog.dataset.etDone === "1") return; // one pixel per compose session
    const to = recipientsOf(dialog);
    const subject = subjectOf(dialog);
    if (!to.length) return;

    const resp = await postToExtension("REGISTER_EMAIL", { to, subject });
    if (!resp || !resp.pixelUrl) return;

    const frame = bodyFrameOf(dialog);
    if (!frame || !frame.contentDocument) return;
    const doc = frame.contentDocument;
    if (doc.body.querySelector(`img[src="${resp.pixelUrl}"]`)) return;

    const img = doc.createElement("img");
    img.src = resp.pixelUrl;
    img.width = 1;
    img.height = 1;
    img.alt = "";
    img.style.cssText = "width:1px;height:1px;border:0;display:block;opacity:0;";
    doc.body.appendChild(img);
    dialog.dataset.etDone = "1";
  }

  // Reset the "done" flag when a NEW compose window appears.
  const seen = new WeakSet();
  const observer = new MutationObserver(() => {
    document.querySelectorAll('div[role="dialog"]').forEach((d) => {
      if (!seen.has(d)) {
        seen.add(d);
        d.dataset.etDone = "0";
        // When the user focuses/sends, ensure pixel exists just before send.
        d.addEventListener("click", (e) => {
          const btn = e.target.closest && e.target.closest('div[Trix-PrimaryAction], td.L3, u[id*="send"]');
          const isSend =
            (btn && /send/i.test(btn.textContent || "")) ||
            (e.target.innerText === "Send");
          if (isSend) injectPixelInto(d); // best-effort final pass
        }, true);
      }
    });
    // Proactive injection: keep open compose windows topped up with a pixel.
    findComposeWindows().forEach(injectPixelInto);
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
