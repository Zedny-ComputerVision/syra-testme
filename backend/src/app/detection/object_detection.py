"""Forbidden object detection using YOLOv8 nano."""

import logging
import os
import cv2
import numpy as np

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover - optional dependency in lightweight envs
    YOLO = None

FORBIDDEN_LABELS = {"cell phone", "book", "laptop"}
_model = None
_model_load_failed = False
OBJECT_MODEL_PATH = os.environ.get("YOLO_OBJECT_MODEL", "yolov8n.pt")
logger = logging.getLogger(__name__)


class ObjectDetector:
    def __init__(self, forbidden_labels: set[str] = None, confidence_threshold: float = 0.5):
        self.forbidden_labels = forbidden_labels or FORBIDDEN_LABELS
        self.confidence_threshold = confidence_threshold
        self._model = None
        self._warned_unavailable = False

    def _get_model(self):
        global _model, _model_load_failed
        if _model is not None:
            return _model
        if YOLO is None or _model_load_failed:
            return None
        try:
            _model = YOLO(OBJECT_MODEL_PATH)
        except Exception as exc:
            logger.warning("Failed to load YOLO object model from %s: %s", OBJECT_MODEL_PATH, exc)
            _model_load_failed = True
            return None
        return _model

    def process(self, frame_bytes: bytes) -> list[dict]:
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return []
        model = self._get_model()
        if model is None:
            if not self._warned_unavailable:
                logger.warning("Object detection model unavailable - detection disabled")
                self._warned_unavailable = True
            return []

        results = model.predict(frame, verbose=False, conf=self.confidence_threshold, imgsz=416)
        alerts = []
        for r in results:
            for cls_id, conf in zip(r.boxes.cls, r.boxes.conf):
                label = r.names[int(cls_id)]
                if label in self.forbidden_labels:
                    alerts.append({
                        "event_type": "FORBIDDEN_OBJECT",
                        "severity": "HIGH",
                        "detail": f"Forbidden object detected: {label}",
                        "confidence": float(conf),
                    })
        return alerts
