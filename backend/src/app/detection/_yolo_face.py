"""Shared YOLOv8 face detection model loader.

Both face_detection.py and multi_face.py import from here so the model
is only loaded into memory once.

Set YOLO_FACE_MODEL env var to the full path of your .pt weights file, e.g.:
  YOLO_FACE_MODEL=/path/to/yolov8-face/weights/yolov8n-face.pt
"""

import os

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover
    YOLO = None

# Override via env var; falls back to filename (works if file is in cwd or YOLO cache)
FACE_MODEL_PATH = os.environ.get("YOLO_FACE_MODEL", "yolov8n-face.pt")
_model = None


def get_face_model():
    """Return (and lazily load) the shared YOLO face model, or None if unavailable."""
    global _model
    if _model is not None:
        return _model
    if YOLO is None:
        return None
    _model = YOLO(FACE_MODEL_PATH)
    return _model
