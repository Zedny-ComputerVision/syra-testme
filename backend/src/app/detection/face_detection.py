"""Face presence detector using MediaPipe FaceDetection."""

import time
import cv2
import numpy as np
import mediapipe as mp


class FaceDetector:
    def __init__(self, disappeared_threshold: float = 2.0, min_confidence: float = 0.6):
        self.disappeared_threshold = disappeared_threshold
        self.min_confidence = min_confidence
        self._last_seen: float | None = None
        self._disappeared_since: float | None = None
        if hasattr(mp, "solutions"):
            self._mp_face = mp.solutions.face_detection.FaceDetection(
                model_selection=0, min_detection_confidence=min_confidence
            )
        else:
            # Fallback: mediapipe without legacy solutions (keeps server booting; detection becomes no-op)
            self._mp_face = None

    def process(self, frame_bytes: bytes) -> dict | None:
        now = time.time()
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None
        if self._mp_face is None:
            return None

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self._mp_face.process(rgb)
        detections = result.detections or []
        has_face = len(detections) > 0

        if has_face:
            if self._disappeared_since is not None:
                self._disappeared_since = None
                return {
                    "event_type": "FACE_REAPPEARED",
                    "severity": "LOW",
                    "detail": "Face reappeared in frame",
                    "confidence": detections[0].score[0] if detections[0].score else 0.9,
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


_detector = FaceDetector()


def detect_face(frame_bytes: bytes) -> dict | None:
    return _detector.process(frame_bytes)
