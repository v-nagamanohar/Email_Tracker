// injected/outlook-inject.js — runs in the Outlook web (outlook.office.com / live.com) page context.
// Same strategy as Gmail: append an invisible pixel to the compose body iframe.

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

  function findComposeFrames() {
    // Outlook's editor is an iframe with aria-label/role for message body,
    // or class "editingArea"/"ReadFormRegion"; selectors evolve, so we scan all iframes.
    return Array.from(document.querySelectorAll("iframe")).filter((f) => {
      try {
        const d = f.contentDocument;
        return d && d.body && (d.body.isContentEditable || d.body.contentEditable === "true");
      } catch (e) {
        return false;
      }
    });
  }

  function recipientsFromPage() {
    const emails = [];
    // To/CC chips render as spans/divs with role="tag" or aria labels containing addresses.
    document.querySelectorAll('[role="tag"], .ms-wl__li__div, span[aria-label*="@"]').forEach((n) => {
      const m = (n.getAttribute("aria-label") || n.textContent || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (m) emails.push(m[0]);
    });
    return [...new Set(emails)];
  }

  function subjectFromPage() {
    const input = document.querySelector('input[aria-label*="Subject" i], textarea[aria-label*="Subject" i]');
    return input ? (input.value || "").trim() : "";
  }

  async function injectPixel() {
    const frames = findComposeFrames();
    if (!frames.length) return;
    const frame = frames[frames.length - 1]; // most recently focused editor
    const doc = frame.contentDocument;
    const to = recipientsFromPage();
    if (!to.length) return;

    const resp = await postToExtension("REGISTER_EMAIL", { to, subject: subjectFromPage() });
    if (!resp || !resp.pixelUrl) return;
    if (doc.body.querySelector(`img[src="${resp.pixelUrl}"]`)) return;
    if (doc.body.querySelector("img[data-et]") ) return; // one tracked pixel per draft

    const img = doc.createElement("img");
    img.src = resp.pixelUrl;
    img.alt = "";
    img.setAttribute("data-et", "1");
    img.width = 1;
    img.height = 1;
    img.style.cssText = "width:1px;height:1px;border:0;display:block;opacity:0;";
    doc.body.appendChild(img);
  }

  const observer = new MutationObserver(() => injectPixel());
  observer.observe(document.body, { childList: true, subtree: true });

  // Also refresh when a Send button is clicked (best-effort final pass).
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest('button,[role="button"]');
    if (t && /^send/i.test((t.textContent || "").trim())) injectPixel();
  }, true);
})();
