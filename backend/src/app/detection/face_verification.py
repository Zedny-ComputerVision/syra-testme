"""Face verification using lightweight FaceMesh landmark embeddings."""

import logging
import cv2
import numpy as np
from typing import Optional

try:
    import mediapipe as mp
except Exception:  # pragma: no cover - optional dependency in lightweight envs
    mp = None

logger = logging.getLogger(__name__)
_signature_warned_unavailable = False


def _landmark_vector(landmarks) -> Optional[np.ndarray]:
    if not landmarks:
        return None
    # Select a small, stable subset of landmarks (eyes, nose, mouth corners, chin)
    idx = [33, 263, 1, 61, 291, 199, 17, 152]  # left eye, right eye, nose tip, mouth corners, nose bridge, chin
    pts = np.array([[landmarks[i].x, landmarks[i].y, landmarks[i].z] for i in idx], dtype=np.float32)
    # Normalize: center and scale to unit max-norm
    pts -= pts.mean(axis=0)
    norm = np.linalg.norm(pts, axis=1).max()
    if norm == 0:
        return None
    pts /= norm
    return pts.flatten()


def compute_face_signature(frame_bytes: bytes) -> Optional[list[float]]:
    """Return a normalized landmark embedding list or None if no face."""
    global _signature_warned_unavailable
    np_arr = np.frombuffer(frame_bytes, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if frame is None:
        return None
    if mp is None or not hasattr(mp, "solutions"):
        if not _signature_warned_unavailable:
            logger.warning("Face verification MediaPipe unavailable - signature extraction disabled")
            _signature_warned_unavailable = True
        return None
    mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=True, refine_landmarks=True, max_num_faces=1)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    res = mesh.process(rgb)
    if not res.multi_face_landmarks:
        return None
    vec = _landmark_vector(res.multi_face_landmarks[0].landmark)
    return vec.tolist() if vec is not None else None


def cosine_distance(v1: np.ndarray, v2: np.ndarray) -> float:
    if v1 is None or v2 is None:
        return 1.0
    denom = np.linalg.norm(v1) * np.linalg.norm(v2)
    if denom == 0:
        return 1.0
    return float(np.clip(1.0 - np.dot(v1, v2) / denom, 0.0, 1.0))


class FaceVerifier:
    def __init__(self, baseline: list[float] | None, threshold: float = 0.15, enabled: bool = True):
        self.enabled = enabled and baseline is not None
        self.baseline = np.array(baseline, dtype=np.float32) if baseline is not None else None
        self.threshold = threshold
        self._mesh = (
            mp.solutions.face_mesh.FaceMesh(static_image_mode=False, refine_landmarks=True, max_num_faces=1)
            if mp is not None and hasattr(mp, "solutions")
            else None
        )
        self._mismatching = False
        self._consecutive_mismatches = 0
        self._consecutive_required = 2
        self._warned_unavailable = False

    def process(self, frame_bytes: bytes) -> dict | None:
        if not self.enabled or self.baseline is None:
            return None
        if self._mesh is None:
            if not self._warned_unavailable:
                logger.warning("Face verification model unavailable - detection disabled")
                self._warned_unavailable = True
            return None
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = self._mesh.process(rgb)
        if not res.multi_face_landmarks:
            return None
        live_vec = _landmark_vector(res.multi_face_landmarks[0].landmark)
        if live_vec is None:
            return None
        dist = cosine_distance(self.baseline, live_vec)
        if dist > self.threshold:
            self._consecutive_mismatches += 1
            if self._consecutive_mismatches >= self._consecutive_required:
                self._mismatching = True
                return {
                    "event_type": "FACE_MISMATCH",
                    "severity": "HIGH",
                    "detail": f"Live face differs from verified identity (dist={dist:.3f})",
                    "confidence": min(0.99, dist / self.threshold),
                    "meta": {"distance": dist},
                }
            return None
        # Face matches — reset consecutive counter
        self._consecutive_mismatches = 0
        if self._mismatching and dist <= self.threshold * 0.8:
            self._mismatching = False
            return {
                "event_type": "FACE_MATCH_RECOVERED",
                "severity": "MEDIUM",
                "detail": "Identity match restored",
                "confidence": max(0.5, 1 - dist),
                "meta": {"distance": dist},
            }
        return None
