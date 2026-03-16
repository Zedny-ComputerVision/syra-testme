"""Shared YOLOv8 face detection model loader.

Both face_detection.py and multi_face.py import from here so the model
is only loaded into memory once.

Set YOLO_FACE_MODEL env var to the full path of your .pt weights file, e.g.:
  YOLO_FACE_MODEL=/path/to/yolov8-face/weights/yolov8n-face.pt
"""

import logging
import os
import threading

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover
    YOLO = None

# Override via env var; falls back to filename (works if file is in cwd or YOLO cache)
FACE_MODEL_PATH = os.environ.get("YOLO_FACE_MODEL", "yolov8n-face.pt")
_model = None
_model_load_failed = False
_lock = threading.Lock()
logger = logging.getLogger(__name__)


def get_face_model():
    """Return (and lazily load) the shared YOLO face model, or None if unavailable."""
    global _model, _model_load_failed
    if _model is not None:
        return _model
    if YOLO is None or _model_load_failed:
        return None
    with _lock:
        # Double-check after acquiring lock — another thread may have loaded it
        if _model is not None:
            return _model
        if _model_load_failed:
            return None
        try:
            _model = YOLO(FACE_MODEL_PATH)
            logger.info("YOLO face model loaded from %s", FACE_MODEL_PATH)
        except Exception as exc:
            logger.warning("Failed to load YOLO face model from %s: %s", FACE_MODEL_PATH, exc)
            _model_load_failed = True
            return None
    return _model


def preload():
    """Eagerly load the face model so the first frame has no cold-start delay."""
    get_face_model()
