"""Face presence detector using YOLOv8 face detection."""

import logging
import time
import cv2
import numpy as np

from ._yolo_face import get_face_model

logger = logging.getLogger(__name__)


class FaceDetector:
    def __init__(self, disappeared_threshold: float = 3.0, min_confidence: float = 0.6):
        self.disappeared_threshold = disappeared_threshold
        self.min_confidence = min_confidence
        self._last_seen: float | None = None
        self._disappeared_since: float | None = None
        self._warned_unavailable = False

    def process(self, frame_bytes: bytes) -> dict | None:
        now = time.time()
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None

        model = get_face_model()
        if model is None:
            if not self._warned_unavailable:
                logger.warning("Face detection model unavailable - detection disabled")
                self._warned_unavailable = True
            return None

        results = model.predict(frame, verbose=False, conf=self.min_confidence, imgsz=640)
        confidences = [float(conf) for r in results for conf in r.boxes.conf]
        return self.process_detections(len(confidences), confidences)

    def process_detections(self, face_count: int, confidences: list[float]) -> dict | None:
        """Process pre-computed YOLO results; avoids duplicate model inference when
        orchestrator shares a single YOLO call across face and multi-face detectors."""
        now = time.time()
        has_face = face_count > 0

        if has_face:
            if self._disappeared_since is not None:
                self._disappeared_since = None
                return {
                    "event_type": "FACE_REAPPEARED",
                    "severity": "LOW",
                    "detail": "Face reappeared in frame",
                    "confidence": confidences[0] if confidences else 0.9,
                }
            self._last_seen = now
            return None

        # no face
        if self._disappeared_since is None:
            self._disappeared_since = now
        elapsed = now - self._disappeared_since
        if elapsed >= self.disappeared_threshold:
            return {
                "event_type": "FACE_DISAPPEARED",
                "severity": "HIGH",
                "detail": f"Face not detected for {elapsed:.1f}s",
                "confidence": 0.9,
            }
        return None

