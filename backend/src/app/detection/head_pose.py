"""Head pose estimation with sustained suspicious-pose detection."""

from typing import Optional
import logging

import cv2
import numpy as np

try:
    import mediapipe as mp
except Exception:  # pragma: no cover - optional dependency in lightweight envs
    mp = None

logger = logging.getLogger(__name__)


class HeadPoseDetector:
    def __init__(
        self,
        yaw_thresh_deg: float = 20.0,
        pitch_thresh_deg: float = 20.0,
        consecutive: int = 5,
        yaw_min_rad: float | None = None,
        yaw_max_rad: float | None = None,
        pitch_min_rad: float | None = None,
        pitch_max_rad: float | None = None,
        change_threshold_rad: float = 0.1,
    ):
        yaw_abs = abs(float(np.radians(yaw_thresh_deg)))
        pitch_abs = abs(float(np.radians(pitch_thresh_deg)))

        self.yaw_min_rad = float(-yaw_abs if yaw_min_rad is None else yaw_min_rad)
        self.yaw_max_rad = float(yaw_abs if yaw_max_rad is None else yaw_max_rad)
        self.pitch_min_rad = float(-pitch_abs if pitch_min_rad is None else pitch_min_rad)
        self.pitch_max_rad = float(pitch_abs if pitch_max_rad is None else pitch_max_rad)

        self.consecutive = int(max(1, consecutive))
        self.change_threshold_rad = float(max(1e-6, change_threshold_rad))

        self._consecutive_bad = 0
        self._prev_pitch: float | None = None
        self._prev_yaw: float | None = None
        self._warned_unavailable = False
        self._mesh = (
            mp.solutions.face_mesh.FaceMesh(static_image_mode=False, refine_landmarks=True, max_num_faces=1)
            if hasattr(mp, "solutions")
            else None
        )

    def _pose_angles(self, frame, landmarks) -> Optional[tuple[float, float, float]]:
        """Return (yaw, pitch, roll) in radians."""
        h, w, _ = frame.shape
        pts_2d = np.array(
            [
                (landmarks[1].x * w, landmarks[1].y * h),      # Nose tip
                (landmarks[152].x * w, landmarks[152].y * h),  # Chin
                (landmarks[33].x * w, landmarks[33].y * h),    # Left eye corner
                (landmarks[263].x * w, landmarks[263].y * h),  # Right eye corner
                (landmarks[61].x * w, landmarks[61].y * h),    # Left mouth corner
                (landmarks[291].x * w, landmarks[291].y * h),  # Right mouth corner
            ],
            dtype="double",
        )

        pts_3d = np.array(
            [
                (0.0, 0.0, 0.0),
                (0.0, -330.0, -65.0),
                (-225.0, 170.0, -135.0),
                (225.0, 170.0, -135.0),
                (-150.0, -150.0, -125.0),
                (150.0, -150.0, -125.0),
            ],
            dtype="double",
        )

        focal_length = float(w)
        center = (w / 2.0, h / 2.0)
        camera_matrix = np.array(
            [
                [focal_length, 0.0, center[0]],
                [0.0, focal_length, center[1]],
                [0.0, 0.0, 1.0],
            ],
            dtype="double",
        )
        dist_coeffs = np.zeros((4, 1))

        success, rotation_vector, translation_vector = cv2.solvePnP(
            pts_3d, pts_2d, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
        )
        if not success:
            return None

        rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
        pose_mat = cv2.hconcat((rotation_matrix, translation_vector))
        _, _, _, _, _, _, euler_angles = cv2.decomposeProjectionMatrix(pose_mat)

        pitch_rad = float(np.radians(euler_angles[0][0]))
        yaw_rad = float(np.radians(euler_angles[1][0]))
        roll_rad = float(np.radians(euler_angles[2][0]))
        return yaw_rad, pitch_rad, roll_rad

    def _pose_reasons(self, yaw_rad: float, pitch_rad: float) -> list[str]:
        reasons: list[str] = []
        if pitch_rad < self.pitch_min_rad:
            reasons.append("LOOKING_DOWN")
        elif pitch_rad > self.pitch_max_rad:
            reasons.append("LOOKING_UP")

        if yaw_rad < self.yaw_min_rad:
            reasons.append("LOOKING_RIGHT")
        elif yaw_rad > self.yaw_max_rad:
            reasons.append("LOOKING_LEFT")
        return reasons

    def _is_stationary(self, yaw_rad: float, pitch_rad: float) -> bool:
        if self._prev_yaw is None or self._prev_pitch is None:
            return False
        return (
            abs(self._prev_yaw - yaw_rad) < self.change_threshold_rad
            and abs(self._prev_pitch - pitch_rad) < self.change_threshold_rad
        )

    def process(self, frame_bytes: bytes) -> dict | None:
        if self._mesh is None:
            if not self._warned_unavailable:
                logger.warning("Head pose model unavailable - detection disabled")
                self._warned_unavailable = True
            return None

        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = self._mesh.process(rgb)
        if not res.multi_face_landmarks:
            self._consecutive_bad = 0
            self._prev_pitch = None
            self._prev_yaw = None
            return None

        angles = self._pose_angles(frame, res.multi_face_landmarks[0].landmark)
        if angles is None:
            return None

        yaw_rad, pitch_rad, roll_rad = angles
        reasons = self._pose_reasons(yaw_rad, pitch_rad)

        if reasons:
            if self._is_stationary(yaw_rad, pitch_rad):
                self._consecutive_bad += 1
            else:
                self._consecutive_bad = 1

            if self._consecutive_bad >= self.consecutive:
                self._consecutive_bad = 0
                pitch_over = max(0.0, self.pitch_min_rad - pitch_rad, pitch_rad - self.pitch_max_rad)
                yaw_over = max(0.0, self.yaw_min_rad - yaw_rad, yaw_rad - self.yaw_max_rad)
                pitch_span = max(1e-6, self.pitch_max_rad - self.pitch_min_rad)
                yaw_span = max(1e-6, self.yaw_max_rad - self.yaw_min_rad)
                confidence = min(0.99, 0.55 + ((pitch_over / pitch_span) + (yaw_over / yaw_span)) / 2.0)

                self._prev_pitch = pitch_rad
                self._prev_yaw = yaw_rad
                return {
                    "event_type": "HEAD_POSE",
                    "severity": "MEDIUM",
                    "detail": f"Suspicious head pose ({', '.join(reasons)})",
                    "confidence": confidence,
                    "meta": {
                        "reasons": reasons,
                        "yaw_rad": yaw_rad,
                        "pitch_rad": pitch_rad,
                        "roll_rad": roll_rad,
                        "yaw_deg": float(np.degrees(yaw_rad)),
                        "pitch_deg": float(np.degrees(pitch_rad)),
                        "roll_deg": float(np.degrees(roll_rad)),
                    },
                }
        else:
            self._consecutive_bad = 0

        self._prev_pitch = pitch_rad
        self._prev_yaw = yaw_rad
        return None
