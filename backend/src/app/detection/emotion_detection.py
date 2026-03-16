"""Stress / emotion detection via FaceMesh landmark geometry.

Detects sustained stress cues using two facial action units:

  1. BROW FURROW — distance between inner brow landmarks (107 ↔ 336) normalised
     by inter-ocular distance.  When brows draw together and down, this ratio
     decreases below the candidate's personal baseline.

  2. LIP COMPRESSION — mouth width (landmark 61 ↔ 291) normalised by face width
     (outer eye corners 33 ↔ 263).  A compressed mouth narrows this ratio below
     baseline.

Both measurements are calibrated against the first `_CALIBRATION_FRAMES` frames
so the baseline is per-candidate, eliminating bias from naturally furrowed brows
or naturally narrow mouths.

Alert logic:
  - A 30-frame (≈3 s at 10 fps) rolling Z-score is computed for each feature.
  - If Z-score < -2.0 for EITHER feature for longer than `stress_threshold_sec`
    (default 15 s), a STRESS_DETECTED LOW alert fires.
  - Re-fires every `cooldown_sec` (default 60 s) while stress persists.
"""

from __future__ import annotations

import logging
import time
from collections import deque

import cv2
import numpy as np
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import mediapipe as mp
    _MP_AVAILABLE = hasattr(mp, "solutions")
except Exception:
    mp = None  # type: ignore
    _MP_AVAILABLE = False

# ── Landmark indices ────────────────────────────────────────────────────────
_LEFT_INNER_BROW = 107   # left inner brow corner
_RIGHT_INNER_BROW = 336  # right inner brow corner
_LEFT_EYE_OUTER = 33     # left eye outer corner (for inter-ocular distance)
_RIGHT_EYE_OUTER = 263   # right eye outer corner
_LEFT_MOUTH = 61         # left mouth corner
_RIGHT_MOUTH = 291       # right mouth corner

_CALIBRATION_FRAMES = 30  # frames used to build per-candidate baseline
_Z_STRESS_THRESHOLD = -2.0  # below this → stress feature active
_ROLLING_WINDOW = 30         # frames in rolling Z-score window


class EmotionMonitor:
    """Detect sustained facial stress cues.

    Parameters
    ----------
    stress_threshold_sec : float
        How long (seconds) the stress signal must persist before alerting.
        Default 15 s — ignores momentary concentration bursts.
    cooldown_sec : float
        Minimum seconds between consecutive STRESS_DETECTED alerts.
        Default 60 s.
    enabled : bool
        Master switch.
    """

    def __init__(
        self,
        stress_threshold_sec: float = 15.0,
        cooldown_sec: float = 60.0,
        enabled: bool = True,
    ):
        self.stress_threshold_sec = stress_threshold_sec
        self.cooldown_sec = cooldown_sec
        self.enabled = enabled

        self._mesh: Optional[object] = None
        self._warned_unavailable = False

        if _MP_AVAILABLE:
            try:
                self._mesh = mp.solutions.face_mesh.FaceMesh(
                    static_image_mode=False,
                    refine_landmarks=False,
                    max_num_faces=1,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
            except Exception as exc:
                logger.warning("EmotionMonitor: FaceMesh init failed: %s", exc)

        # Calibration buffers
        self._calib_brow: list[float] = []
        self._calib_lip: list[float] = []
        self._brow_mean: float | None = None
        self._brow_std: float | None = None
        self._lip_mean: float | None = None
        self._lip_std: float | None = None

        # Rolling Z-score windows
        self._brow_zscores: deque[float] = deque(maxlen=_ROLLING_WINDOW)
        self._lip_zscores: deque[float] = deque(maxlen=_ROLLING_WINDOW)

        # Stress timing
        self._stress_since: float | None = None
        self._last_alert_time: float = 0.0

    # ── Internal geometry helpers ───────────────────────────────────────────

    @staticmethod
    def _dist(a, b) -> float:
        return float(np.hypot(a.x - b.x, a.y - b.y))

    def _compute_features(self, lm) -> tuple[float, float] | None:
        """Return (brow_ratio, lip_ratio) or None if face geometry is invalid."""
        iod = self._dist(lm[_LEFT_EYE_OUTER], lm[_RIGHT_EYE_OUTER])
        if iod < 1e-6:
            return None
        brow_width = self._dist(lm[_LEFT_INNER_BROW], lm[_RIGHT_INNER_BROW])
        brow_ratio = brow_width / iod

        face_width = iod  # re-use IOD as face-width normaliser
        lip_width = self._dist(lm[_LEFT_MOUTH], lm[_RIGHT_MOUTH])
        lip_ratio = lip_width / face_width

        return brow_ratio, lip_ratio

    def _zscore(self, value: float, mean: float, std: float) -> float:
        if std < 1e-6:
            return 0.0
        return (value - mean) / std

    # ── Public API ──────────────────────────────────────────────────────────

    def process_ndarray(self, frame: np.ndarray) -> list[dict]:
        """Process a decoded frame; returns 0 or 1 STRESS_DETECTED alert."""
        if not self.enabled:
            return []
        if self._mesh is None:
            if not self._warned_unavailable:
                logger.warning("EmotionMonitor: MediaPipe unavailable — stress detection disabled")
                self._warned_unavailable = True
            return []

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = self._mesh.process(rgb)
        lm = res.multi_face_landmarks[0].landmark if res.multi_face_landmarks else None
        return self.process_landmarks(lm)

    def process_landmarks(self, lm) -> list[dict]:
        """Process pre-computed FaceMesh landmarks (skips redundant FaceMesh inference)."""
        if not self.enabled:
            return []

        if lm is None:
            self._stress_since = None
            return []

        features = self._compute_features(lm)
        if features is None:
            return []
        brow_ratio, lip_ratio = features

        now = time.time()
        alerts: list[dict] = []

        # Calibration phase
        if self._brow_mean is None:
            self._calib_brow.append(brow_ratio)
            self._calib_lip.append(lip_ratio)
            if len(self._calib_brow) >= _CALIBRATION_FRAMES:
                arr_b = np.array(self._calib_brow, dtype=float)
                arr_l = np.array(self._calib_lip, dtype=float)
                self._brow_mean = float(arr_b.mean())
                self._brow_std = float(arr_b.std()) + 1e-6
                self._lip_mean = float(arr_l.mean())
                self._lip_std = float(arr_l.std()) + 1e-6
            return []

        # Z-score computation
        brow_z = self._zscore(brow_ratio, self._brow_mean, self._brow_std)  # type: ignore[arg-type]
        lip_z = self._zscore(lip_ratio, self._lip_mean, self._lip_std)       # type: ignore[arg-type]
        self._brow_zscores.append(brow_z)
        self._lip_zscores.append(lip_z)

        if len(self._brow_zscores) < _ROLLING_WINDOW:
            return []

        avg_brow_z = float(np.mean(self._brow_zscores))
        avg_lip_z = float(np.mean(self._lip_zscores))
        stress_active = avg_brow_z < _Z_STRESS_THRESHOLD or avg_lip_z < _Z_STRESS_THRESHOLD

        # Stress duration tracking
        if stress_active:
            if self._stress_since is None:
                self._stress_since = now
            stress_duration = now - self._stress_since
            if (
                stress_duration >= self.stress_threshold_sec
                and (now - self._last_alert_time) >= self.cooldown_sec
            ):
                self._last_alert_time = now
                dominant = "brow furrow" if avg_brow_z < avg_lip_z else "lip compression"
                alerts.append({
                    "event_type": "STRESS_DETECTED",
                    "severity": "LOW",
                    "detail": (
                        f"Sustained stress cue detected for {stress_duration:.0f}s "
                        f"(primary signal: {dominant})"
                    ),
                    "confidence": min(0.75, 0.4 + stress_duration / 120.0),
                    "meta": {
                        "brow_z": round(avg_brow_z, 3),
                        "lip_z": round(avg_lip_z, 3),
                        "stress_sec": round(stress_duration, 1),
                    },
                })
        else:
            self._stress_since = None

        return alerts

    def process(self, frame_bytes: bytes) -> list[dict]:
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return []
        return self.process_ndarray(frame)
