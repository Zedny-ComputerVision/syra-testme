"""Eye tracking / sustained gaze-away detection using MediaPipe FaceMesh."""

import logging
import cv2
import numpy as np

try:
    import mediapipe as mp
except Exception:  # pragma: no cover - optional dependency in lightweight envs
    mp = None

logger = logging.getLogger(__name__)


class EyeTracker:
    def __init__(
        self,
        max_deviation: float | None = 0.13,
        consecutive_threshold: int = 5,
        pitch_min: float | None = None,
        pitch_max: float | None = None,
        yaw_min: float | None = None,
        yaw_max: float | None = None,
        change_threshold: float = 0.2,
    ):
        deviation = abs(float(max_deviation if max_deviation is not None else 0.13))

        self.pitch_min = float(-0.5 if pitch_min is None else pitch_min)
        self.pitch_max = float(0.2 if pitch_max is None else pitch_max)
        self.yaw_min = float(-deviation if yaw_min is None else yaw_min)
        self.yaw_max = float(deviation if yaw_max is None else yaw_max)
        self.change_threshold = float(max(1e-6, change_threshold))

        self.consecutive_threshold = int(max(1, consecutive_threshold))
        self._consecutive_away = 0

        self._prev_left_pitch: float | None = None
        self._prev_left_yaw: float | None = None
        self._prev_right_pitch: float | None = None
        self._prev_right_yaw: float | None = None
        self._warned_unavailable = False

        if hasattr(mp, "solutions"):
            self._mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=False, refine_landmarks=True, max_num_faces=1)
        else:
            self._mesh = None

    def _reset_tracking(self) -> None:
        self._consecutive_away = 0
        self._prev_left_pitch = None
        self._prev_left_yaw = None
        self._prev_right_pitch = None
        self._prev_right_yaw = None

    @staticmethod
    def _calculate_eye_gaze(landmarks, eye_side: str = "left") -> tuple[float, float]:
        """Return (pitch, yaw) eye angles in radians."""
        if eye_side == "left":
            eye_center = landmarks[468]  # Left iris center
            eye_left = landmarks[33]
            eye_right = landmarks[133]
        else:
            eye_center = landmarks[473]  # Right iris center
            eye_left = landmarks[362]
            eye_right = landmarks[263]

        eye_width = abs(eye_right.x - eye_left.x)
        horizontal_ratio = (eye_center.x - eye_left.x) / eye_width if eye_width > 0 else 0.5

        yaw_deg = (horizontal_ratio - 0.5) * 60.0
        pitch_deg = (eye_center.y - (eye_left.y + eye_right.y) / 2.0) * 60.0

        return float(np.radians(pitch_deg)), float(np.radians(yaw_deg))

    def _is_out_of_range(self, pitch: float, yaw: float) -> bool:
        return (
            pitch < self.pitch_min
            or pitch > self.pitch_max
            or yaw < self.yaw_min
            or yaw > self.yaw_max
        )

    def _is_stable(self, cur_pitch: float, cur_yaw: float, prev_pitch: float | None, prev_yaw: float | None) -> bool:
        if prev_pitch is None or prev_yaw is None:
            return False
        return (
            abs(cur_pitch - prev_pitch) < self.change_threshold
            and abs(cur_yaw - prev_yaw) < self.change_threshold
        )

    def process(self, frame_bytes: bytes) -> dict | None:
        if self._mesh is None:
            if not self._warned_unavailable:
                logger.warning("Eye tracking model unavailable - detection disabled")
                self._warned_unavailable = True
            return None

        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = self._mesh.process(rgb)
        if not res.multi_face_landmarks:
            self._reset_tracking()
            return None

        lm = res.multi_face_landmarks[0].landmark
        left_pitch, left_yaw = self._calculate_eye_gaze(lm, "left")
        right_pitch, right_yaw = self._calculate_eye_gaze(lm, "right")

        left_out = self._is_out_of_range(left_pitch, left_yaw)
        right_out = self._is_out_of_range(right_pitch, right_yaw)
        bad_left = left_out and (
            self._prev_left_pitch is None
            or self._is_stable(left_pitch, left_yaw, self._prev_left_pitch, self._prev_left_yaw)
        )
        bad_right = right_out and (
            self._prev_right_pitch is None
            or self._is_stable(right_pitch, right_yaw, self._prev_right_pitch, self._prev_right_yaw)
        )

        self._prev_left_pitch = left_pitch
        self._prev_left_yaw = left_yaw
        self._prev_right_pitch = right_pitch
        self._prev_right_yaw = right_yaw

        if bad_left or bad_right:
            self._consecutive_away += 1
            if self._consecutive_away >= self.consecutive_threshold:
                self._consecutive_away = 0

                avg_yaw = (left_yaw + right_yaw) / 2.0
                avg_pitch = (left_pitch + right_pitch) / 2.0
                if avg_yaw < self.yaw_min:
                    direction = "right"
                elif avg_yaw > self.yaw_max:
                    direction = "left"
                elif avg_pitch < self.pitch_min:
                    direction = "down"
                elif avg_pitch > self.pitch_max:
                    direction = "up"
                else:
                    direction = "away"

                yaw_over = max(0.0, self.yaw_min - avg_yaw, avg_yaw - self.yaw_max)
                pitch_over = max(0.0, self.pitch_min - avg_pitch, avg_pitch - self.pitch_max)
                yaw_span = max(1e-6, self.yaw_max - self.yaw_min)
                pitch_span = max(1e-6, self.pitch_max - self.pitch_min)
                confidence = min(0.95, 0.5 + ((yaw_over / yaw_span) + (pitch_over / pitch_span)) / 2.0)

                return {
                    "event_type": "EYE_MOVEMENT",
                    "severity": "MEDIUM",
                    "detail": f"Sustained eye gaze away from screen ({direction})",
                    "confidence": confidence,
                    "meta": {
                        "direction": direction,
                        "left_eye": {"pitch_rad": left_pitch, "yaw_rad": left_yaw},
                        "right_eye": {"pitch_rad": right_pitch, "yaw_rad": right_yaw},
                    },
                }
        else:
            self._consecutive_away = 0

        return None

