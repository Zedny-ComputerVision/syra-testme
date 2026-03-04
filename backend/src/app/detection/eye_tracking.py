"""Eye tracking / gaze deviation detection using MediaPipe FaceMesh."""

import cv2
import numpy as np
import mediapipe as mp


class EyeTracker:
    def __init__(self, max_deviation: float = 0.13, consecutive_threshold: int = 5):
        self.max_deviation = max_deviation
        self.consecutive_threshold = consecutive_threshold
        self._consecutive_away = 0
        if hasattr(mp, "solutions"):
            self._mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=False, refine_landmarks=True, max_num_faces=1)
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
            return None
        lm = res.multi_face_landmarks[0].landmark

        # Use simple horizontal gaze ratio: (left iris center x vs right)
        left_eye_idx = 468  # left iris center
        right_eye_idx = 473  # right iris center
        nose_idx = 1

        left_x = lm[left_eye_idx].x
        right_x = lm[right_eye_idx].x
        nose_x = lm[nose_idx].x
        eye_center = (left_x + right_x) / 2
        deviation = eye_center - nose_x  # positive => looking right

        if abs(deviation) > self.max_deviation:
            self._consecutive_away += 1
            if self._consecutive_away >= self.consecutive_threshold:
                direction = "right" if deviation > 0 else "left"
                self._consecutive_away = 0
                return {
                    "event_type": "EYE_MOVEMENT",
                    "severity": "MEDIUM",
                    "detail": f"Gaze away from screen ({direction})",
                    "confidence": min(0.95, abs(deviation) * 3),
                }
        else:
            self._consecutive_away = 0
        return None


_tracker = EyeTracker()


def detect_eye_movement(frame_bytes: bytes) -> dict | None:
    return _tracker.process(frame_bytes)
