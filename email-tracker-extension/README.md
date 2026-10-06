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

## Step-by-step usage guide

### Step 0 — Requirements
- Google Chrome (or Brave / Edge) desktop browser
- Python 3 installed on your machine
- A Gmail or Outlook.com account signed in in the browser

### Step 1 — Start the tracking server
From the repo root (`/workspace`, i.e. one level above this folder):
```bash
python3 email_tracker.py            # starts on http://localhost:8000
```
Leave this terminal open while you use the extension — it is both the pixel
host and the event log. (Verify it's up: `curl http://localhost:8000/events` should return `[]`.)

### Step 2 — Install the extension in Chrome
1. In the address bar go to `chrome://extensions` and press Enter.
2. Toggle **Developer mode** ON (top-right switch).
3. Click **Load unpacked** (top-left button).
4. Select this `email-tracker-extension` folder (the one containing `manifest.json`).
5. Pin the "Email Open Tracker" icon to the toolbar (puzzle-piece icon → pin).

> Edge users: same flow at `edge://extensions`. Firefox doesn't support
> `chrome://` loading of MV3 unpacked extensions the same way — use Chrome.

### Step 3 — Send a tracked email
1. Open [Gmail](https://mail.google.com) or [Outlook web](https://outlook.live.com) and sign in.
2. Click **Compose** / **New mail**, write your message, enter the recipient.
3. Press **Send** as usual. The extension automatically appends an invisible
   1×1 GIF (`http://localhost:8000/open/<token>/t.gif`) to the outgoing body
   and registers the email with a unique token.
4. You can confirm in the popup that the email appears in the list.

⚠️ For the pixel URL to be reachable by the *receiver*, localhost only works for
testing yourself (see Step 5). For real external recipients, do the
"going live" steps below first.

### Step 4 — Check open status
Click the toolbar icon. Each tracked email shows:
- **Opened ✓** — with number of opens and last-open timestamp (+ opening IP/UA from `/events/<token>`)
- **Not opened ✗** — pixel never loaded (either unread, or images blocked)
Press **Refresh** to re-poll the server; the popup also auto-refreshes when opened.

### Step 5 — Test it end-to-end without a real recipient
Send an email to **yourself**, then simulate the receiver's mail client fetching the pixel:
```bash
# grab the token from the popup, or from chrome.storage via background logs, then:
curl -A "Mozilla/5.0" "http://localhost:8000/open/<token>/t.gif"
```
Reopen the popup → the email flips to **Opened ✓**. All hits are logged in
`events.db` and viewable at `http://localhost:8000/events`.

### Going live for real recipients (production)
`localhost` pixels can't be reached from anyone else's machine, and HTTPS pages
(Gmail/Outlook) block `http` pixels as mixed content. To track real external emails:
1. Deploy `email_tracker.py` on a server with a domain + HTTPS (e.g. behind Caddy/nginx or a PaaS like Railway/Fly.io).
2. Edit `SERVER` at the top of `background.js`:
   ```js
   const SERVER = "https://tracker.yourdomain.com";
   ```
3. Add that domain to `host_permissions` in `manifest.json`, reload the extension at `chrome://extensions`.
4. Optionally change the port default with `python3 email_tracker.py --port 8000`.

### Sending a tracked email from the CLI instead of the browser
The backend has a built-in sender (useful if you don't want DOM injection):
```bash
python3 email_tracker.py --send recipient@example.com \
    --server tracker.yourdomain.com \
    --from-addr you@gmail.com --smtp-host smtp.gmail.com --smtp-port 587
```
(You'll need an SMTP password/app password; set it via env or extend the script.)

### Uninstalling / disabling
`chrome://extensions` → toggle the extension off, or click **Remove**. Delete `events.db` to wipe all logs.

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
