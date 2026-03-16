"""Forbidden object detection using YOLOv8 nano."""

import logging
import os
import threading
import cv2
import numpy as np

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover - optional dependency in lightweight envs
    YOLO = None

# Comprehensive list of forbidden objects during exams
FORBIDDEN_LABELS = {
    "cell phone",
    "book",
    "laptop",
    "remote",          # Remote controls (confusable with phones)
    "keyboard",        # External keyboards (cheating aid)
    "mouse",           # Computer mouse
    "tablet",          # YOLO often classifies tablets as laptops, but include for coverage
    "headphones",      # Earphones / headphones
    "earphones",
}
_model = None
_model_load_failed = False
_lock = threading.Lock()
OBJECT_MODEL_PATH = os.environ.get("YOLO_OBJECT_MODEL", "yolov8n.pt")
logger = logging.getLogger(__name__)


class ObjectDetector:
    def __init__(self, forbidden_labels: set[str] = None, confidence_threshold: float = 0.65):
        self.forbidden_labels = forbidden_labels or FORBIDDEN_LABELS
        self.confidence_threshold = confidence_threshold
        self._warned_unavailable = False

    def _get_model(self):
        global _model, _model_load_failed
        if _model is not None:
            return _model
        if YOLO is None or _model_load_failed:
            return None
        with _lock:
            if _model is not None:
                return _model
            if _model_load_failed:
                return None
            try:
                _model = YOLO(OBJECT_MODEL_PATH)
            except Exception as exc:
                logger.warning("Failed to load YOLO object model from %s: %s", OBJECT_MODEL_PATH, exc)
                _model_load_failed = True
                return None
        return _model

    def process_ndarray(self, frame: np.ndarray) -> list[dict]:
        """Detect forbidden objects in an already-decoded frame (avoids re-decode)."""
        if frame is None:
            return []
        model = self._get_model()
        if model is None:
            if not self._warned_unavailable:
                logger.warning("Object detection model unavailable - detection disabled")
                self._warned_unavailable = True
            return []

        results = model.predict(frame, verbose=False, conf=self.confidence_threshold, imgsz=640)
        alerts = []
        seen: set[str] = set()
        for r in results:
            for cls_id, conf in zip(r.boxes.cls, r.boxes.conf):
                label = r.names[int(cls_id)]
                if label in self.forbidden_labels and label not in seen:
                    seen.add(label)
                    alerts.append({
                        "event_type": "FORBIDDEN_OBJECT",
                        "severity": "HIGH",
                        "detail": f"Forbidden object detected: {label}",
                        "confidence": float(conf),
                    })
        return alerts

    def process(self, frame_bytes: bytes) -> list[dict]:
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        return self.process_ndarray(frame)


def preload():
    """Eagerly load the object detection model so the first frame has no cold-start delay."""
    global _model, _model_load_failed
    if _model is not None or YOLO is None or _model_load_failed:
        return
    with _lock:
        if _model is not None or _model_load_failed:
            return
        try:
            _model = YOLO(OBJECT_MODEL_PATH)
            logger.info("YOLO object model pre-loaded from %s", OBJECT_MODEL_PATH)
        except Exception as exc:
            logger.warning("Failed to pre-load YOLO object model from %s: %s", OBJECT_MODEL_PATH, exc)
            _model_load_failed = True
