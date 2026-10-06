# Email Open Tracker — Chrome Extension (Manifest V3)

A Snov.io-style browser extension that tells you **whether the receiver opened
your email**, working inside **Gmail** and **Outlook on the web**.

It works exactly like commercial open trackers:

```
 You compose in Gmail/Outlook          Receiver opens the email
        │                                     │
        ▼                                     ▼
 Extension injects 1×1 invisible ──► Tracker server logs hit
 pixel with a unique token          (time, IP, User-Agent)
        │                                     │
        ▼                                     ▼
 Popup dashboard ◄──── polls ──── /events/<token> (JSON + CORS)
 "Opened ✓ / Not opened ✗"
```

## Contents

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest: content script on mail.google.com + outlook, popup, injected page scripts |
| `background.js` | Service worker: mints a unique token per outgoing email, stores records in `chrome.storage.local`, polls the tracker server |
| `content.js` | Bridge between page-context scripts and the background worker |
| `injected/gmail-inject.js` | Watches Gmail compose windows, appends the hidden pixel `<img>` to the message body before Send |
| `injected/outlook-inject.js` | Same for Outlook web (outlook.office.com / outlook.live.com) |
| `popup.html` / `popup.js` | Dashboard listing every tracked email with Opened ✓ / Not opened ✗, open count and last-open time |
| `../email_tracker.py` | The backend server (pixel endpoint + event log + JSON API) |

## Setup & run

1. **Start the backend** (already included in this repo):
   ```bash
   python3 email_tracker.py            # listens on :8000
   ```
2. **Load the extension**: open `chrome://extensions` → enable *Developer mode*
   → *Load unpacked* → select this `email-tracker-extension` folder.
3. Open Gmail or Outlook web, compose an email and hit **Send** — the extension
   registers it and slips a transparent 1×1 GIF (`http://localhost:8000/open/<token>/t.gif`)
   into the body.
4. Click the toolbar icon to see live status; press **Refresh** to re-poll the server.

### Testing without a real recipient
```bash
curl http://localhost:8000/open/<token>/t.gif   # simulates the receiver loading the pixel
```
The popup will then show the email as **Opened ✓**.

## Honest limitations (same for Snov.io, Mailtrack, HubSpot…)

- **False negatives**: if the receiver blocks remote images (Apple Mail default,
  Outlook desktop default), the pixel never loads → shows "not opened" even if they read it.
- **False positives**: Gmail's image proxy and security scanners prefetch images,
  so "opened" may fire without a human actually reading.
- **Public server required for real tracking**: `localhost` only works for your own testing.
  Deploy `email_tracker.py` behind HTTPS on a real domain and change `SERVER` in `background.js`.
  (An https page can't load an http pixel — mixed content.)
- **Gmail/Outlook DOM selectors change over time**; the injected scripts use several
  fallback selectors but may need updating after a webmail redesign.
- **Legal/ethical**: silently tracking people may violate privacy laws (GDPR, state
  wiretap/eavesdropping acts). Use for legitimate sales/recruiting outreach and disclose where required.

## Ideas for v2

- Desktop Gmail/Outlook support via an IMAP/SMTP BCC-pixel relay instead of DOM injection
- Push notifications (WebSocket) when an email is opened, badge on the toolbar icon
- Link-click tracking and location/device inference from the opening IP
- Hosted multi-user backend with auth, replacing the local SQLite demo
