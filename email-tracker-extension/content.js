// content.js — runs in the isolated world on Gmail / Outlook web pages.
// Its job: bridge between the page-context injected scripts (which see the DOM)
// and the extension's background service worker (which owns storage + server calls).

const IS_GMAIL = location.hostname === "mail.google.com";
const INJECTED_FILE = IS_GMAIL ? "injected/gmail-inject.js" : "injected/outlook-inject.js";

// 1. Inject the page-context script so it can observe the compose/send DOM.
const el = document.createElement("script");
el.src = chrome.runtime.getURL(INJECTED_FILE);
(document.head || document.documentElement).appendChild(el);
el.onload = () => el.remove();

// 2. Relay messages: page script -> background -> page script.
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== "email-tracker-page") return;

  if (data.type === "REGISTER_EMAIL") {
    // Ask the background worker to mint a token + pixel URL for this email.
    const resp = await chrome.runtime.sendMessage({
      type: "REGISTER_EMAIL",
      to: data.to,
      subject: data.subject,
    });
    // Hand the pixel URL back into the page context so it can append the <img>
    // to the outgoing email body before/at send time.
    window.postMessage(
      { source: "email-tracker-ext", type: "PIXEL_READY", requestId: data.requestId, pixelUrl: resp.pixelUrl, token: resp.token },
      "*"
    );
  }

  if (data.type === "GET_TRACKED_SUMMARY") {
    const resp = await chrome.runtime.sendMessage({ type: "REFRESH" });
    window.postMessage(
      { source: "email-tracker-ext", type: "TRACKED_SUMMARY", requestId: data.requestId, tracked: resp.tracked },
      "*"
    );
  }
});
