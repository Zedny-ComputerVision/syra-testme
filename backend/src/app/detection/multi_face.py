"""Multiple face detection using YOLOv8 face detection."""

import time
import cv2
import numpy as np

from ._yolo_face import get_face_model


class MultiFaceDetector:
    def __init__(self, max_faces: int = 1, consecutive_threshold: int = 2, cooldown: float = 5.0, min_confidence: float = 0.6):
        self.max_faces = max_faces
        self.consecutive_threshold = consecutive_threshold
        self.cooldown = cooldown
        self.min_confidence = min_confidence
        self._consecutive_count = 0
        self._last_alert = 0.0

    def process(self, frame_bytes: bytes) -> dict | None:
        now = time.time()
        if now - self._last_alert < self.cooldown:
            return None

        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None

        model = get_face_model()
        if model is None:
            return None

        results = model.predict(frame, verbose=False, conf=self.min_confidence, imgsz=640)
        confidences = [float(conf) for r in results for conf in r.boxes.conf]
        return self.process_detections(len(confidences), confidences)

    def process_detections(self, face_count: int, confidences: list[float]) -> dict | None:
        """Process pre-computed YOLO results; avoids duplicate model inference when
        orchestrator shares a single YOLO call across face and multi-face detectors."""
        now = time.time()
        if now - self._last_alert < self.cooldown:
            return None

        if face_count > self.max_faces:
            self._consecutive_count += 1
            if self._consecutive_count >= self.consecutive_threshold:
                self._last_alert = now
                self._consecutive_count = 0
                avg_conf = sum(confidences) / face_count if confidences else 0.8
                return {
                    "event_type": "MULTIPLE_FACES",
                    "severity": "HIGH",
                    "detail": f"{face_count} faces detected in frame",
                    "confidence": min(0.99, avg_conf),
                }
        else:
            self._consecutive_count = 0
        return None


_detector = MultiFaceDetector()


def detect_multiple_faces(frame_bytes: bytes) -> dict | None:
    return _detector.process(frame_bytes)
