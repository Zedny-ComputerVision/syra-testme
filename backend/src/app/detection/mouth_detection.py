"""Detect speaking (mouth open) using MediaPipe FaceMesh."""

import cv2
import numpy as np
try:
    import mediapipe as mp
except Exception:  # pragma: no cover - optional dependency in lightweight envs
    mp = None


class MouthMonitor:
    def __init__(self, open_threshold: float = 0.35, consecutive_threshold: int = 6):
        self.open_threshold = open_threshold
        self.consecutive_threshold = consecutive_threshold
        self._consecutive_talking = 0
        if hasattr(mp, "solutions"):
            self._mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1)
        else:
            self._mesh = None

    def process(self, frame_bytes: bytes) -> dict | None:
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None
        if self._mesh is None:
            return None
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = self._mesh.process(rgb)
        if not res.multi_face_landmarks:
            self._consecutive_talking = 0
            return None

        lm = res.multi_face_landmarks[0].landmark
        upper = lm[13]
        lower = lm[14]
        chin = lm[152]
        forehead = lm[10]
        mouth_open = abs(lower.y - upper.y) / max(1e-5, abs(chin.y - forehead.y))

        if mouth_open > self.open_threshold:
            self._consecutive_talking += 1
            if self._consecutive_talking >= self.consecutive_threshold:
                self._consecutive_talking = 0
                return {
                    "event_type": "MOUTH_MOVEMENT",
                    "severity": "LOW",
                    "detail": "Speaking detected",
                    "confidence": min(0.95, mouth_open * 2),
                }
        else:
            self._consecutive_talking = 0
        return None


_monitor = MouthMonitor()


def detect_mouth_movement(frame_bytes: bytes) -> dict | None:
    return _monitor.process(frame_bytes)
