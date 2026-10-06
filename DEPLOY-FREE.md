# Tracking External Recipients — 100% Free

The extension + `email_tracker.py` work locally, but **external recipients can
only "ping" your tracker if the server is reachable from the public internet
over HTTPS** (most mail clients refuse to load plain-HTTP images, and Gmail
proxies images over HTTPS only).

You do **not** need to buy a domain or a VPS. The whole stack fits in free
tiers:

| Piece                | Free option                                              | Cost |
|----------------------|----------------------------------------------------------|------|
| Tracker backend      | Google Cloud Run / Railway / Fly.io                      | $0   |
| HTTPS certificate    | Provided automatically by all three above                | $0   |
| Database             | SQLite file bundled with the app (fine for personal use) | $0   |
| Sending emails       | Your existing Gmail/Outlook account via the extension    | $0   |

Pick **one** of the options below (~5–10 minutes each). All of them serve the
same API the extension expects: `GET /open/<token>/t.gif` and
`GET /events/<token>`.

---

## Option A — Google Cloud Run (recommended: generous free tier, real HTTPS URL)

Cloud Run gives you `https://<name>-<hash>.run.app` — free TLS, enough free
requests for personal tracking.

**Prerequisite:** Docker installed locally + a Google account +
[`gcloud` CLI](https://cloud.google.com/sdk/docs/install).

1. Create a folder with these 3 files:

   `email_tracker.py` — copy from this repo (it already reads the `$PORT`
   env var that Cloud Run injects, so no edits needed).

   `requirements.txt`:
   ```
   # stdlib only — nothing to install
   ```

   `Dockerfile`:
   ```dockerfile
   FROM python:3.12-slim
   WORKDIR /app
   COPY email_tracker.py .
   ENV PORT=8000
   EXPOSE 8000
   CMD ["python", "email_tracker.py"]
   ```

2. Deploy (one-time `gcloud auth login` + `gcloud init` first):

   ```bash
   gcloud run deploy email-tracker \
     --source . \
     --region us-central1 \
     --allow-unauthenticated \
     --memory-limit 256Mi
   ```

3. Note the printed URL, e.g.
   `https://email-tracker-abc123xyz.run.app`.

4. Point the extension at it: click the toolbar icon → paste the URL into the
   **Tracker server URL** box → **Save**. No reinstall needed.

> ⚠️ Cloud Run's filesystem is ephemeral: events are lost on container restart.
> For persistence, mount a free-tier Cloud SQL / Firestore later, or accept
> history resets (the unique tokens keep new tracking working regardless).

---

## Option B — Railway (simplest: deploy straight from GitHub)

Railway's free trial + Hobby-friendly usage model; gives
`https://<app>.up.railway.app`.

1. Push this repo (with `email_tracker.py`, plus the `Dockerfile` from Option A,
   or a `Procfile` containing `web: python email_tracker.py`) to GitHub.
2. On [railway.app](https://railway.app): **New Project → Deploy from GitHub
   repo** → pick your repo. It auto-detects Python/Docker and sets `$PORT`.
3. In the service: **Settings → Networking → Generate Domain**.
4. Paste that `https://…up.railway.app` URL into the extension popup → Save.

---

## Option C — Fly.io (free allowance, tiny machines)

```bash
fly launch --no-deploy          # creates fly.toml from the Dockerfile
fly deploy
fly open                        # shows https://<name>.fly.dev
```

Paste the `https://….fly.dev` URL into the extension popup → Save.

---

## Verify it works with external recipients

1. Send yourself (or a willing friend) an email from Gmail web with the
   extension active — the pixel is injected automatically.
2. Have the recipient open the email **with images enabled**, or test the
   endpoint directly from any machine:
   ```bash
   curl -A "Mozilla/5.0" "https://YOUR-TRACKER/open/<token>/t.gif"
   curl "https://YOUR-TRACKER/events/<token>"   # should list the hit
   ```
3. Open the extension popup → the email flips to **✓ Opened** with timestamp.

---

## Why each piece must be free-tier-friendly

- **HTTPS is mandatory**: Outlook/Gmail block mixed-content (http) images in
  emails served over https, so a bare-VPS http server silently breaks
  tracking. Cloud Run/Railway/Fly give HTTPS with zero config.
- **No fixed IP or domain needed**: the pixel URL uses whatever hostname the
  PaaS assigns you.
- **SQLite is enough**: personal volumes (hundreds of opens/month) fit well
  inside every free tier above.

## Honest limitations (unchanged by deployment)

- Receivers with **"don't show images"** enabled never trigger the pixel →
  false negatives.
- Security scanners (Microsoft Defender O365 "safe links/images", Barracuda,
  Proofpoint) prefetch images before a human reads them → false positives.
  Corporate recipients often look "opened" instantly for this reason.
- Some providers (Apple Mail privacy, Outlook) route image loads through their
  own proxies → IP/location data becomes unreliable.
- **Legal note:** undisclosed tracking may violate GDPR/ePrivacy/CAN-SPAM-style
  rules depending on jurisdiction and context. For cold outreach, add a brief
  disclosure line in your signature.
