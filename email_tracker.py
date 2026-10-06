#!/usr/bin/env python3
"""
Minimal email open-tracker demo.

How it works:
  1. You send an HTML email that contains a hidden 1x1 tracking pixel:
       <img src="https://YOUR-SERVER/track/<token>.gif" width="1" height="1" ... />
  2. When (and if) the recipient's mail client loads remote images, it requests
     that URL from this server.
  3. This server logs the hit (timestamp + IP + User-Agent = "opened") and
     returns a transparent GIF so the email still renders fine.

Run:   python3 email_tracker.py            # starts on port 8000
Test:  curl -A "Mozilla/5.0" "http://localhost:8000/track/abc123.gif"
View:  curl http://localhost:8000/events
Send:  python3 email_tracker.py --send you@recipient.com --server yourdomain.com
"""

import argparse
import json
import secrets
import smtplib
import sqlite3
import sys
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

DB_PATH = Path(__file__).with_name("events.db")

# Smallest valid transparent 1x1 GIF (43 bytes)
TRANSPARENT_GIF = bytes.fromhex(
    "47494638396101000100800000000000ffffff21f90401000000002c00000000"
    "010001000002024401003b"
)


def init_db():
    con = sqlite3.connect(DB_PATH)
    con.execute(
        """CREATE TABLE IF NOT EXISTS events (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             token TEXT NOT NULL,
             ts TEXT NOT NULL,
             ip TEXT,
             user_agent TEXT
           )"""
    )
    con.commit()
    return con


class TrackerHandler(BaseHTTPRequestHandler):
    def _cors(self):
        # Allow the Chrome extension (chrome-extension:// origin) to poll /events.
        self.send_header("Access-Control-Allow-Origin", "*")

    def do_GET(self):
        path = self.path.strip("/")
        if path.startswith("track/") or path.startswith("open/"):
            # Accept both /track/<token>.gif and /open/<token>/t.gif (extension format)
            raw = path.split("/", 1)[1]
            token = raw.split("/")[0].removesuffix(".gif") or "unknown"
            con = sqlite3.connect(DB_PATH)
            con.execute(
                "INSERT INTO events (token, ts, ip, user_agent) VALUES (?,?,?,?)",
                (
                    token,
                    datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    self.client_address[0],
                    self.headers.get("User-Agent", ""),
                ),
            )
            con.commit()
            con.close()
            print(f"[OPEN] token={token} ip={self.client_address[0]} ua={self.headers.get('User-Agent','')}")
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "image/gif")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(TRANSPARENT_GIF)))
            self.end_headers()
            self.wfile.write(TRANSPARENT_GIF)
        elif path.startswith("events/"):
            # Per-token event list used by the extension popup/background.
            token = path[len("events/"):]
            con = sqlite3.connect(DB_PATH)
            rows = [dict(ts=r[0], ip=r[1], ua=r[2])
                    for r in con.execute(
                        "SELECT ts, ip, user_agent FROM events WHERE token=? ORDER BY id", (token,)
                    )]
            con.close()
            body = json.dumps(rows).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif path == "events":
            con = sqlite3.connect(DB_PATH)
            rows = [dict(token=r[0], ts=r[1], ip=r[2], ua=r[3])
                    for r in con.execute("SELECT token, ts, ip, user_agent FROM events ORDER BY id")]
            con.close()
            body = json.dumps(rows, indent=2).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def log_message(self, *args):  # quieter default logging
        pass


def build_email(to_addr: str, token: str, server: str) -> MIMEText:
    """Build a sample tracked email. The <img> tag IS the tracker."""
    html = f"""
    <html><body>
      <p>Hi! This is a test email.</p>
      <p>Did you know? This message contains an invisible tracking pixel.</p>
      <img src="https://{server}/track/{token}.gif" width="1" height="1"
           alt="" style="display:none" />
    </body></html>
    """
    msg = MIMEText(html, "html")
    msg["Subject"] = "Email tracker demo"
    msg["To"] = to_addr
    return msg


def send_email(to_addr: str, server: str, smtp_host: str, smtp_port: int, from_addr: str):
    token = secrets.token_hex(8)  # unique per-message ID
    msg = build_email(to_addr, token, server)
    msg["From"] = from_addr
    with smtplib.SMTP(smtp_host, smtp_port) as s:
        s.starttls()
        user = input("SMTP user: ")
        pw = input("SMTP password: ")
        s.login(user, pw)
        s.send_message(msg)
    print(f"Sent! Track token: {token}")
    print(f"Watch hits at: https://{server}/events")


def main():
    parser = argparse.ArgumentParser(description="Tiny email open tracker")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--send", metavar="TO", help="Send a test tracked email instead of running the server")
    parser.add_argument("--server", default="yourdomain.com", help="Public hostname of THIS tracker (used in the pixel URL)")
    parser.add_argument("--smtp-host", default="smtp.gmail.com")
    parser.add_argument("--smtp-port", type=int, default=587)
    parser.add_argument("--from-addr", default="me@gmail.com")
    args = parser.parse_args()

    init_db()

    if args.send:
        send_email(args.send, args.server, args.smtp_host, args.smtp_port, args.from_addr)
        return

    print(f"Tracking server listening on :{args.port}")
    print(f"Pixel URL pattern: http://localhost:{args.port}/track/<token>.gif")
    print(f"Events endpoint:   http://localhost:{args.port}/events")
    HTTPServer(("0.0.0.0", args.port), TrackerHandler).serve_forever()


if __name__ == "__main__":
    main()
