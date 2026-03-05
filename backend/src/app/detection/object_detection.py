"""Forbidden object detection using YOLOv8 nano."""

import cv2
import numpy as np

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover - optional dependency in lightweight envs
    YOLO = None

FORBIDDEN_LABELS = {"cell phone", "book", "laptop"}
_model = None


class ObjectDetector:
    def __init__(self, forbidden_labels: set[str] = None, confidence_threshold: float = 0.5):
        self.forbidden_labels = forbidden_labels or FORBIDDEN_LABELS
        self.confidence_threshold = confidence_threshold
        self._model = None

    def _get_model(self):
        global _model
        if _model is not None:
            return _model
        if YOLO is None:
            return None
        _model = YOLO("yolov8n.pt")  # downloads weights on first run
        return _model

    def process(self, frame_bytes: bytes) -> list[dict]:
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return []
        model = self._get_model()
        if model is None:
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


_detector = ObjectDetector()


def detect_forbidden_objects(frame_bytes: bytes) -> list[dict]:
    return _detector.process(frame_bytes)
