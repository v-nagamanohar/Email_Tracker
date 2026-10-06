# Deploy email_tracker.py to Cloud Run / Railway / Fly.io as-is.
# The app reads the $PORT env var these platforms inject (defaults to 8000).
FROM python:3.12-slim

WORKDIR /app
COPY email_tracker.py .

ENV PORT=8000
EXPOSE 8000

# Keep the SQLite file in /data if you mount a volume; otherwise it lives on
# the ephemeral container filesystem (fine for personal use).
CMD ["python", "email_tracker.py"]
