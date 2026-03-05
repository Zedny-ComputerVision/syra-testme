"""Multiple face detection using MediaPipe FaceDetection."""

import time
import cv2
import numpy as np
try:
    import mediapipe as mp
except Exception:  # pragma: no cover - optional dependency in lightweight envs
    mp = None


class MultiFaceDetector:
    def __init__(self, max_faces: int = 1, consecutive_threshold: int = 2, cooldown: float = 5.0):
        self.max_faces = max_faces
        self.consecutive_threshold = consecutive_threshold
        self.cooldown = cooldown
        self._consecutive_count = 0
        self._last_alert = 0.0
        if hasattr(mp, "solutions"):
            self._mp_face = mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.6)
        else:
            self._mp_face = None

    def process(self, frame_bytes: bytes) -> dict | None:
        now = time.time()
        if now - self._last_alert < self.cooldown:
            return None
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None
        if self._mp_face is None:
            return None
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        detections = self._mp_face.process(rgb).detections or []
        detected_faces = len(detections)

        if detected_faces > self.max_faces:
            self._consecutive_count += 1
            if self._consecutive_count >= self.consecutive_threshold:
                self._last_alert = now
                self._consecutive_count = 0
                return {
                    "event_type": "MULTIPLE_FACES",
                    "severity": "HIGH",
                    "detail": f"{detected_faces} faces detected in frame",
                    "confidence": min(0.99, sum(d.score[0] for d in detections if d.score) / detected_faces) if detected_faces else 0.8,
                }
        else:
            self._consecutive_count = 0
        return None


_detector = MultiFaceDetector()


def detect_multiple_faces(frame_bytes: bytes) -> dict | None:
    return _detector.process(frame_bytes)
