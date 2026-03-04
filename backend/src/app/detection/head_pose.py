"""Head pose estimation using a minimal 3D model and solvePnP."""

import cv2
import numpy as np
import mediapipe as mp
from typing import Optional


class HeadPoseDetector:
    def __init__(self, yaw_thresh_deg: float = 20.0, pitch_thresh_deg: float = 20.0, consecutive: int = 5):
        self.yaw_thresh = yaw_thresh_deg
        self.pitch_thresh = pitch_thresh_deg
        self.consecutive = consecutive
        self._count = 0
        self._mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=False, refine_landmarks=True, max_num_faces=1) if hasattr(mp, "solutions") else None

    def _pose_angles(self, frame, landmarks) -> Optional[tuple[float, float, float]]:
        h, w, _ = frame.shape
        pts_2d = np.array([
            (landmarks[1].x * w, landmarks[1].y * h),    # nose tip
            (landmarks[152].x * w, landmarks[152].y * h),  # chin
            (landmarks[263].x * w, landmarks[263].y * h),  # right eye corner
            (landmarks[33].x * w, landmarks[33].y * h),    # left eye corner
            (landmarks[291].x * w, landmarks[291].y * h),  # right mouth
            (landmarks[61].x * w, landmarks[61].y * h),    # left mouth
        ], dtype="double")

        pts_3d = np.array([
            (0.0, 0.0, 0.0),     # nose
            (0.0, -63.6, -12.5),  # chin
            (43.3, 32.7, -26.0),  # eye right
            (-43.3, 32.7, -26.0), # eye left
            (28.9, -28.9, -24.1), # mouth right
            (-28.9, -28.9, -24.1),# mouth left
        ], dtype="double")

        focal_length = w
        center = (w / 2, h / 2)
        camera_matrix = np.array([[focal_length, 0, center[0]],
                                  [0, focal_length, center[1]],
                                  [0, 0, 1]], dtype="double")
        dist_coeffs = np.zeros((4, 1))

        success, rvec, tvec = cv2.solvePnP(pts_3d, pts_2d, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE)
        if not success:
            return None

        rmat, _ = cv2.Rodrigues(rvec)
        sy = np.sqrt(rmat[0, 0] * rmat[0, 0] + rmat[1, 0] * rmat[1, 0])
        singular = sy < 1e-6
        if not singular:
            x = np.arctan2(rmat[2, 1], rmat[2, 2])
            y = np.arctan2(-rmat[2, 0], sy)
            z = np.arctan2(rmat[1, 0], rmat[0, 0])
        else:
            x = np.arctan2(-rmat[1, 2], rmat[1, 1])
            y = np.arctan2(-rmat[2, 0], sy)
            z = 0
        pitch = float(np.degrees(x))
        yaw = float(np.degrees(y))
        roll = float(np.degrees(z))
        return yaw, pitch, roll

    def process(self, frame_bytes: bytes) -> dict | None:
        if self._mesh is None:
            return None
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = self._mesh.process(rgb)
        if not res.multi_face_landmarks:
            return None

        angles = self._pose_angles(frame, res.multi_face_landmarks[0].landmark)
        if angles is None:
            return None
        yaw, pitch, roll = angles
        if abs(yaw) > self.yaw_thresh or abs(pitch) > self.pitch_thresh:
            self._count += 1
            if self._count >= self.consecutive:
                self._count = 0
                direction = "left" if yaw < 0 else "right" if abs(yaw) >= abs(pitch) else ("down" if pitch < 0 else "up")
                return {
                    "event_type": "HEAD_POSE",
                    "severity": "MEDIUM",
                    "detail": f"Head pose exceeds limit (yaw={yaw:.1f}, pitch={pitch:.1f})",
                    "confidence": min(0.99, (abs(yaw) + abs(pitch)) / (self.yaw_thresh + self.pitch_thresh)),
                    "meta": {"yaw": yaw, "pitch": pitch, "roll": roll, "direction": direction},
                }
        else:
            self._count = 0
        return None
