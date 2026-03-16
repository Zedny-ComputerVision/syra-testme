"""Liveness detection via Eye Aspect Ratio (EAR) blink analysis.

Catches two fraud scenarios:
  1. VIDEO REPLAY — A recording of the candidate is played in front of the camera.
     Real people blink every 3–6 seconds; a video may have natural blinks but
     NO_BLINK alerts after 25+ seconds of face-present, blink-absent frames act
     as a secondary signal combined with face verification.

  2. PHOTO ATTACK — A static photo is held in front of the camera.
     Photos never blink → NO_BLINK fires after 25 seconds.

Eye Aspect Ratio (EAR) formula (Soukupová & Čech, 2016):
    EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
Where p1–p6 are six specific FaceMesh landmarks around each eye.

    - Open eyes: EAR ≈ 0.25–0.40
    - Blink (frame):  EAR < 0.20
    - Sustained closed (sleeping/cheating): EAR < 0.18 for 3+ seconds

MediaPipe FaceMesh landmark indices used:
    Left eye:  33(p1), 160(p2), 158(p3), 133(p4), 153(p5), 144(p6)
    Right eye: 362(p1), 385(p2), 387(p3), 263(p4), 373(p5), 380(p6)
"""

from __future__ import annotations

import logging
import time
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

# Landmark indices for EAR computation
_LEFT_EYE = [33, 160, 158, 133, 153, 144]
_RIGHT_EYE = [362, 385, 387, 263, 373, 380]

_EAR_BLINK_THRESHOLD = 0.20   # Below this → eye is closing
_EAR_CLOSED_THRESHOLD = 0.18  # Below this for multiple frames → sustained close


def _eye_aspect_ratio(landmarks, eye_indices: list[int]) -> float:
    """Compute EAR from 6 FaceMesh landmark points."""
    p = [landmarks[i] for i in eye_indices]
    # Vertical distances
    a = np.linalg.norm(np.array([p[1].x - p[5].x, p[1].y - p[5].y]))
    b = np.linalg.norm(np.array([p[2].x - p[4].x, p[2].y - p[4].y]))
    # Horizontal distance
    c = np.linalg.norm(np.array([p[0].x - p[3].x, p[0].y - p[3].y]))
    if c < 1e-6:
        return 0.0
    return float((a + b) / (2.0 * c))


class LivenessDetector:
    """Detect blinks and alert on suspicious blink patterns.

    Parameters
    ----------
    no_blink_threshold_sec:
        Seconds of face-present, non-blinking time before a NO_BLINK alert.
        Default 25 s — real people blink every 3–6 s; 25 s is very conservative.
    eyes_closed_threshold_sec:
        Seconds of continuously closed eyes (EAR < closed_threshold) before
        an EYES_CLOSED alert.  Default 3.0 s.
    """

    def __init__(
        self,
        no_blink_threshold_sec: float = 25.0,
        eyes_closed_threshold_sec: float = 3.0,
        enabled: bool = True,
    ):
        self.no_blink_threshold_sec = no_blink_threshold_sec
        self.eyes_closed_threshold_sec = eyes_closed_threshold_sec
        self.enabled = enabled

        self._mesh: Optional[object] = None
        self._warned_unavailable = False

        if _MP_AVAILABLE:
            try:
                self._mesh = mp.solutions.face_mesh.FaceMesh(
                    static_image_mode=False,
                    refine_landmarks=True,
                    max_num_faces=1,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
            except Exception as exc:
                logger.warning("LivenessDetector: FaceMesh init failed: %s", exc)

        # Timing state
        self._last_blink_time: float = time.time()
        self._face_present_since: float | None = None
        self._closed_since: float | None = None

        # Blink state machine
        self._blink_frames = 0   # consecutive low-EAR frames
        self._blink_count = 0    # total blinks detected

        # Alert cooldown
        self._last_no_blink_alert: float = 0.0
        self._last_eyes_closed_alert: float = 0.0
        _NO_BLINK_COOLDOWN = 15.0    # re-alert every 15 s if still no blink
        _EYES_CLOSED_COOLDOWN = 8.0  # re-alert every 8 s if still closed
        self._no_blink_cooldown = _NO_BLINK_COOLDOWN
        self._eyes_closed_cooldown = _EYES_CLOSED_COOLDOWN

    def process_ndarray(self, frame: np.ndarray) -> list[dict]:
        """Process a frame; returns 0–2 alert dicts."""
        if not self.enabled:
            return []
        if self._mesh is None:
            if not self._warned_unavailable:
                logger.warning("LivenessDetector: MediaPipe unavailable — liveness disabled")
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

        now = time.time()

        if lm is None:
            self._face_present_since = None
            self._closed_since = None
            self._blink_frames = 0
            return []

        if self._face_present_since is None:
            self._face_present_since = now

        left_ear = _eye_aspect_ratio(lm, _LEFT_EYE)
        right_ear = _eye_aspect_ratio(lm, _RIGHT_EYE)
        avg_ear = (left_ear + right_ear) / 2.0

        alerts: list[dict] = []

        # Blink detection
        if avg_ear < _EAR_BLINK_THRESHOLD:
            self._blink_frames += 1
        else:
            if self._blink_frames >= 1:
                self._blink_count += 1
                self._last_blink_time = now
            self._blink_frames = 0

        # Sustained eyes closed
        if avg_ear < _EAR_CLOSED_THRESHOLD:
            if self._closed_since is None:
                self._closed_since = now
            closed_duration = now - self._closed_since
            if (
                closed_duration >= self.eyes_closed_threshold_sec
                and (now - self._last_eyes_closed_alert) >= self._eyes_closed_cooldown
            ):
                self._last_eyes_closed_alert = now
                alerts.append({
                    "event_type": "EYES_CLOSED",
                    "severity": "LOW",
                    "detail": f"Eyes closed for {closed_duration:.1f}s",
                    "confidence": min(0.95, closed_duration / self.eyes_closed_threshold_sec * 0.7),
                    "meta": {"ear": avg_ear, "closed_sec": closed_duration},
                })
        else:
            self._closed_since = None

        # No blink anti-replay
        face_present_sec = now - (self._face_present_since or now)
        time_since_blink = now - self._last_blink_time

        if (
            face_present_sec >= self.no_blink_threshold_sec
            and time_since_blink >= self.no_blink_threshold_sec
            and (now - self._last_no_blink_alert) >= self._no_blink_cooldown
        ):
            self._last_no_blink_alert = now
            alerts.append({
                "event_type": "NO_BLINK",
                "severity": "MEDIUM",
                "detail": f"No blink detected for {time_since_blink:.0f}s — possible video/photo attack",
                "confidence": min(0.90, time_since_blink / 60.0),
                "meta": {
                    "time_since_blink_sec": time_since_blink,
                    "blink_count": self._blink_count,
                    "ear": avg_ear,
                },
            })

        return alerts

    def process(self, frame_bytes: bytes) -> list[dict]:
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return []
        return self.process_ndarray(frame)
