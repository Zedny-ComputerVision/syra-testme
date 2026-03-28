FROM python:3.11-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps for OpenCV, YOLO, Tesseract OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    tesseract-ocr \
    curl && \
    rm -rf /var/lib/apt/lists/*

# ── Python dependencies (cached layer) ──────────────────
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --default-timeout=180 --retries 10 -r requirements.txt

# ── Application code ────────────────────────────────────
COPY backend/src/ ./src/
COPY backend/alembic/ ./alembic/
COPY backend/alembic.ini ./alembic.ini
COPY config.yaml ./config.yaml
COPY backend/yolov8n-face.pt ./yolov8n-face.pt
COPY backend/yolov8n.pt ./yolov8n.pt

# ── Storage directories ────────────────────────────────
RUN mkdir -p /app/storage/videos /app/storage/evidence \
             /app/storage/identity /app/storage/reports \
             /app/storage/video_chunks

# ── Non-root user for security ─────────────────────────
RUN groupadd --gid 1000 appuser && \
    useradd --create-home --uid 1000 --gid appuser --shell /bin/bash appuser && \
    mkdir -p /home/appuser/.cache/fontconfig \
             /home/appuser/.config/matplotlib \
             /home/appuser/.config/Ultralytics && \
    chown -R appuser:appuser /app /home/appuser
ENV HOME=/home/appuser \
    XDG_CACHE_HOME=/home/appuser/.cache \
    MPLCONFIGDIR=/home/appuser/.config/matplotlib \
    YOLO_CONFIG_DIR=/home/appuser/.config/Ultralytics
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=10s --start-period=120s --retries=10 \
    CMD curl -f http://127.0.0.1:8000/api/health/db || exit 1

# Production: gunicorn with uvicorn workers for proper process management.
# Do not use --preload here: the SQLAlchemy engine is created at import time,
# and preloading would fork worker processes after the engine/pool already
# exists in the master process. That leads to inherited DB connections and
# intermittent request stalls under load.
# Live proctoring session tracking is process-local today, so the safe
# production default is a single web worker unless a shared session bus is added.
ENV WORKERS=1
CMD ["sh", "-c", "gunicorn src.app.main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --workers ${WORKERS} --timeout 600 --graceful-timeout 120 --keep-alive 5 --access-logfile - --error-logfile - --forwarded-allow-ips '*'"]
