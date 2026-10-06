// background.js — MV3 service worker
// Central brain: registers tracked emails, polls the tracker server for open events,
// and answers status queries from the popup.

const SERVER = "http://localhost:8000"; // local tracker backend (email_tracker.py)
const POLL_INTERVAL_MS = 30 * 1000;     // poll open events every 30s

// ---------- helpers ----------
async function getTracked() {
  const { tracked = {} } = await chrome.storage.local.get("tracked");
  return tracked;
}

async function saveTracked(tracked) {
  await chrome.storage.local.set({ tracked });
}

async function upsertEmail(record) {
  const tracked = await getTracked();
  tracked[record.token] = record;
  await saveTracked(tracked);
}

async function refreshStatuses() {
  const tracked = await getTracked();
  const tokens = Object.keys(tracked);
  if (!tokens.length) return;

  for (const token of tokens) {
    try {
      const res = await fetch(`${SERVER}/events/${token}`);
      if (!res.ok) continue;
      const events = await res.json(); // [{ts, ip, ua}, ...]
      const rec = tracked[token];
      if (!rec) continue;
      rec.opens = events.length;
      rec.opened = events.length > 0;
      rec.lastOpened = events.length ? events[events.length - 1].ts : null;
      tracked[token] = rec;
    } catch (e) {
      // server offline — keep last known state
    }
  }
  await saveTracked(tracked);
}

// ---------- message API for content scripts / popup ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      // Called by injected page scripts when a compose window sends an email
      case "REGISTER_EMAIL": {
        const token = crypto.randomUUID().replace(/-/g, "");
        const pixelUrl = `${SERVER}/open/${token}/t.gif`;
        const record = {
          token,
          to: msg.to || [],
          subject: msg.subject || "(no subject)",
          sentAt: Date.now(),
          opened: false,
          opens: 0,
          lastOpened: null,
        };
        await upsertEmail(record);
        sendResponse({ ok: true, token, pixelUrl });
        break;
      }

      case "GET_STATUS": {
        const tracked = await getTracked();
        sendResponse({ ok: true, tracked });
        break;
      }

      case "REFRESH": {
        await refreshStatuses();
        sendResponse({ ok: true, tracked: await getTracked() });
        break;
      }

      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true; // keep response channel open (async)
});

// ---------- periodic polling ----------
// Note: the "alarms" permission is intentionally NOT used to keep the manifest
// minimal; instead we poll while the service worker is alive and whenever the
// popup opens (popup.html sends a REFRESH message).
setInterval(refreshStatuses, POLL_INTERVAL_MS);
