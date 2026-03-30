"""Face verification using neural embeddings with a landmark fallback.

Primary path: DeepFace Facenet512 produces a 512-D L2-normalized embedding.
Fallback path: a 40-point MediaPipe FaceMesh landmark vector.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

_deepface_model_name = os.environ.get("DEEPFACE_MODEL", "Facenet512")
_deepface_warned = False
_DeepFace = None
_deepface_checked = False
_HAAR_FACE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

# 40 stable landmark indices covering all facial regions
_LANDMARK_INDICES = [
    33, 133, 160, 144, 362, 263, 387, 373,
    468, 473,
    70, 63, 66, 105, 296, 300, 334, 293,
    1, 4, 197, 98, 327,
    61, 291, 13, 14, 78, 308,
    152, 172, 136, 356, 397,
    234, 454, 93, 323,
    10, 151,
]
assert len(_LANDMARK_INDICES) == 40


def _get_deepface_class():
    global _DeepFace, _deepface_checked
    if _deepface_checked:
        return _DeepFace
    _deepface_checked = True
    try:
        from deepface import DeepFace as deepface_class

        _DeepFace = deepface_class
        logger.info("DeepFace face verification available (model=%s)", _deepface_model_name)
    except Exception as exc:
        logger.warning("DeepFace unavailable (%s) - falling back to landmark verification", exc)
        _DeepFace = None
    return _DeepFace


def _landmark_vector(landmarks) -> Optional[np.ndarray]:
    if not landmarks:
        return None
    pts = np.array(
        [[landmarks[i].x, landmarks[i].y, landmarks[i].z] for i in _LANDMARK_INDICES],
        dtype=np.float32,
    )
    pts -= pts.mean(axis=0)
    scale = np.linalg.norm(pts)
    if scale < 1e-8:
        return None
    pts /= scale
    return pts.flatten()


def _embedding_via_deepface(
    frame_bgr: np.ndarray,
    *,
    detector_backend: str = "skip",
) -> Optional[list[float]]:
    """Extract a 512-D embedding via DeepFace."""
    global _deepface_warned
    deepface_class = _get_deepface_class()
    if deepface_class is None:
        return None
    try:
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        result = deepface_class.represent(
            img_path=frame_rgb,
            model_name=_deepface_model_name,
            detector_backend=detector_backend,
            enforce_detection=False,
            align=True,
        )
        if result and isinstance(result, list) and "embedding" in result[0]:
            emb = np.array(result[0]["embedding"], dtype=np.float32)
            norm = np.linalg.norm(emb)
            if norm > 1e-8:
                emb /= norm
            return emb.tolist()
    except Exception as exc:
        if not _deepface_warned:
            logger.warning(
                "DeepFace represent() failed (backend=%s): %s - falling back to landmarks",
                detector_backend,
                exc,
            )
            _deepface_warned = True
    return None


def _embedding_via_landmarks(frame_bgr: np.ndarray) -> Optional[list[float]]:
    """Fallback: 40-point MediaPipe FaceMesh landmark embedding."""
    try:
        import mediapipe as mp

        if hasattr(mp, "solutions"):
            mesh = mp.solutions.face_mesh.FaceMesh(
                static_image_mode=True, refine_landmarks=True, max_num_faces=1
            )
            rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            res = mesh.process(rgb)
            if not res.multi_face_landmarks:
                return None
            vec = _landmark_vector(res.multi_face_landmarks[0].landmark)
            return vec.tolist() if vec is not None else None

        # Fallback: new tasks API (mediapipe >= 0.10.30)
        if hasattr(mp, "tasks") and hasattr(mp.tasks, "vision"):
            return _embedding_via_tasks_api(frame_bgr)

        return None
    except Exception:
        return None


def _embedding_via_tasks_api(frame_bgr: np.ndarray) -> Optional[list[float]]:
    """Use the new mediapipe.tasks.vision.FaceLandmarker API."""
    try:
        import mediapipe as mp
        import os
        model_path = os.path.join(os.path.dirname(__file__), "face_landmarker.task")
        if not os.path.exists(model_path):
            return None
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=model_path),
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
            num_faces=1,
        )
        with mp.tasks.vision.FaceLandmarker.create_from_options(options) as landmarker:
            rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect(image)
            if not result.face_landmarks:
                return None
            landmarks = result.face_landmarks[0]
            pts = np.array(
                [[lm.x, lm.y, lm.z] for i, lm in enumerate(landmarks) if i in _LANDMARK_INDICES],
                dtype=np.float32,
            )
            pts -= pts.mean(axis=0)
            scale = np.linalg.norm(pts)
            if scale < 1e-8:
                return None
            pts /= scale
            return pts.flatten().tolist()
    except Exception:
        return None


def _embedding_via_haar(frame_bgr: np.ndarray) -> Optional[list[float]]:
    """Last-resort grayscale face crop embedding used when richer models are unavailable."""
    try:
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        faces = _HAAR_FACE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(24, 24))
        if len(faces) == 0:
            return None
        x, y, w, h = max(faces, key=lambda f: int(f[2]) * int(f[3]))
        pad = int(max(w, h) * 0.25)
        x0 = max(0, x - pad)
        y0 = max(0, y - pad)
        x1 = min(frame_bgr.shape[1], x + w + pad)
        y1 = min(frame_bgr.shape[0], y + h + pad)
        face_crop = frame_bgr[y0:y1, x0:x1]
        if face_crop.size == 0:
            return None
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA)
        gray = cv2.equalizeHist(gray)
        vec = gray.astype(np.float32).flatten()
        norm = np.linalg.norm(vec)
        if norm < 1e-8:
            return None
        vec /= norm
        return vec.tolist()
    except Exception:
        return None


def compute_face_signature(frame_bytes: bytes) -> Optional[list[float]]:
    """Return a face embedding list or None if no face is found."""
    np_arr = np.frombuffer(frame_bytes, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if frame is None:
        return None
    emb = _embedding_via_deepface(frame, detector_backend="opencv")
    if emb is not None:
        return emb
    return _embedding_via_landmarks(frame)


def compute_face_signature_detected(frame_bgr: np.ndarray) -> Optional[list[float]]:
    """Compute a face embedding with detection/alignment suitable for ID cards."""
    deepface_class = _get_deepface_class()
    if deepface_class is not None:
        try:
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            result = deepface_class.represent(
                img_path=frame_rgb,
                model_name=_deepface_model_name,
                detector_backend="opencv",
                enforce_detection=False,
                align=True,
            )
            if result and isinstance(result, list) and "embedding" in result[0]:
                emb = np.array(result[0]["embedding"], dtype=np.float32)
                norm = np.linalg.norm(emb)
                if norm > 1e-8:
                    emb /= norm
                return emb.tolist()
        except Exception as exc:
            logger.warning("DeepFace with detection failed: %s - trying landmarks", exc)
    return _embedding_via_landmarks(frame_bgr)


def compute_landmark_signature(frame_bgr: np.ndarray) -> Optional[list[float]]:
    """Return a 120-D MediaPipe FaceMesh landmark embedding from a BGR ndarray."""
    return _embedding_via_landmarks(frame_bgr)


def cosine_distance(v1: np.ndarray, v2: np.ndarray) -> float:
    if v1 is None or v2 is None:
        return 1.0
    denom = np.linalg.norm(v1) * np.linalg.norm(v2)
    if denom == 0:
        return 1.0
    return float(np.clip(1.0 - np.dot(v1, v2) / denom, 0.0, 1.0))


class FaceVerifier:
    """Compare a live face against a pre-enrolled identity embedding."""

    _DEEPFACE_THRESHOLD = float(os.environ.get("DEEPFACE_VERIFY_THRESHOLD", "0.30"))
    _LANDMARK_THRESHOLD = 0.18
    _HAAR_THRESHOLD = 0.18

    def __init__(self, baseline: list[float] | None, threshold: float | None = None, enabled: bool = True):
        self.enabled = enabled and baseline is not None
        self.baseline = np.array(baseline, dtype=np.float32) if baseline is not None else None
        self._use_deepface = _get_deepface_class() is not None and (baseline is not None and len(baseline) == 512)
        self._use_haar = baseline is not None and len(baseline) == 4096

        if self._use_deepface:
            # DeepFace 512-D cosine distance has different characteristics than
            # the 40-landmark vector — always use the DeepFace-specific threshold
            # so that the generic config value (designed for landmarks) doesn't
            # make identity matching unreasonably strict and produce false mismatches.
            self.threshold = self._DEEPFACE_THRESHOLD
        elif self._use_haar:
            # Keep a minimum floor when the enrolled identity had to fall back to
            # a low-fidelity Haar crop so live frames can still be compared.
            self.threshold = max(float(threshold) if threshold is not None else self._LANDMARK_THRESHOLD, self._HAAR_THRESHOLD)
        elif threshold is not None:
            self.threshold = float(threshold)
        else:
            self.threshold = self._LANDMARK_THRESHOLD

        try:
            import mediapipe as mp

            self._mesh = (
                mp.solutions.face_mesh.FaceMesh(
                    static_image_mode=False, refine_landmarks=True, max_num_faces=1
                )
                if hasattr(mp, "solutions")
                else None
            )
        except Exception:
            self._mesh = None

        self._mismatching = False
        self._consecutive_mismatches = 0
        self._consecutive_required = 2
        self._warned_unavailable = False

    def _get_live_embedding(self, frame: np.ndarray) -> Optional[np.ndarray]:
        if self._use_deepface:
            emb = _embedding_via_deepface(frame, detector_backend="opencv")
            if emb is not None:
                return np.array(emb, dtype=np.float32)
        if self._use_haar:
            emb = _embedding_via_haar(frame)
            if emb is not None:
                return np.array(emb, dtype=np.float32)
        if self._mesh is None:
            return None
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = self._mesh.process(rgb)
        if not res.multi_face_landmarks:
            return None
        vec = _landmark_vector(res.multi_face_landmarks[0].landmark)
        return vec if vec is not None else None

    def _compare_embedding(self, live_vec: np.ndarray) -> dict | None:
        if self.baseline is None or self.baseline.shape != live_vec.shape:
            logger.warning(
                "Skipping face verification because enrolled/live embedding shapes differ: baseline=%s live=%s",
                None if self.baseline is None else tuple(self.baseline.shape),
                tuple(live_vec.shape),
            )
            return None
        dist = cosine_distance(self.baseline, live_vec)

        if dist > self.threshold:
            self._consecutive_mismatches += 1
            if self._mismatching:
                return None
            if self._consecutive_mismatches >= self._consecutive_required:
                self._mismatching = True
                method = "neural" if self._use_deepface else ("haar" if self._use_haar else "landmark")
                return {
                    "event_type": "FACE_MISMATCH",
                    "severity": "HIGH",
                    "detail": f"Live face differs from verified identity (dist={dist:.3f}, method={method})",
                    "confidence": min(0.99, dist / self.threshold),
                    "meta": {"distance": dist, "method": method},
                }
            return None

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

    def process_ndarray(self, frame: np.ndarray) -> dict | None:
        if not self.enabled or self.baseline is None:
            return None
        if frame is None:
            return None

        live_vec = self._get_live_embedding(frame)
        if live_vec is None:
            return None
        return self._compare_embedding(live_vec)

    def process_landmarks(self, landmarks, frame: np.ndarray | None = None) -> dict | None:
        """Use pre-computed FaceMesh landmarks and fall back to DeepFace when a frame is available."""
        if not self.enabled or self.baseline is None:
            return None
        live_vec = None
        if self._use_deepface and frame is not None:
            emb = _embedding_via_deepface(frame, detector_backend="opencv")
            if emb is not None:
                live_vec = np.array(emb, dtype=np.float32)
        if live_vec is None and landmarks is not None:
            vec = _landmark_vector(landmarks)
            if vec is not None:
                live_vec = vec
        if live_vec is None:
            return None
        return self._compare_embedding(live_vec)

    def process(self, frame_bytes: bytes) -> dict | None:
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        return self.process_ndarray(frame)
