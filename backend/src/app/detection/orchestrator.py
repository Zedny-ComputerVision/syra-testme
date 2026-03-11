"""Proctoring Orchestrator.

Coordinates all detection modules: face, multi-face, eye tracking,
mouth detection, object detection, and audio VAD.
Collects alerts via AlertLogger with cooldown support.

Optimisations:
  - YOLO runs ONCE per frame; results are shared with both FaceDetector and
    MultiFaceDetector via their process_detections() helpers.
  - MediaPipe-based detectors (eye, head pose, mouth, face verification) are
    skipped entirely when YOLO reports no face in frame, saving significant CPU.
  - Object detection (slow YOLOv8n general model) is throttled: runs every
    `_obj_detect_interval` frames (default 3) instead of every frame.
"""
import math
import logging

import cv2
import numpy as np

from ._yolo_face import get_face_model
from .face_detection import FaceDetector
from .multi_face import MultiFaceDetector
from .eye_tracking import EyeTracker
from .mouth_detection import MouthMonitor
from .object_detection import ObjectDetector
from .audio_detection import AudioMonitor
from .alert_logger import AlertLogger
from .face_verification import FaceVerifier
from .head_pose import HeadPoseDetector

logger = logging.getLogger(__name__)

DEFAULT_ORCHESTRATOR_CONFIG = {
    "face_detection": True,
    "multi_face": True,
    "eye_tracking": True,
    "mouth_detection": False,
    "object_detection": True,
    "audio_detection": True,
    "head_pose_detection": True,
    "face_min_confidence": 0.6,
    "multi_face_consecutive": 1,
    "object_detect_interval": 3,
    "max_face_absence_sec": 3,
    "eye_deviation_deg": 12,
    "cheating_consecutive_frames": 5,
    "eye_consecutive": 5,
    "eye_pitch_min_rad": -0.5,
    "eye_pitch_max_rad": 0.2,
    "eye_yaw_min_rad": None,
    "eye_yaw_max_rad": None,
    "eye_change_threshold_rad": 0.2,
    "mouth_open_threshold": 0.35,
    "object_confidence_threshold": 0.5,
    "audio_rms_threshold": 0.08,
    "audio_consecutive_chunks": 2,
    "audio_window": 5,
    "face_signature": None,
    "face_verify_threshold": 0.15,
    "face_verify": True,
    "head_pose_yaw_deg": 20,
    "head_pose_pitch_deg": 20,
    "head_pose_consecutive": 5,
    "head_yaw_min_rad": None,
    "head_yaw_max_rad": None,
    "head_pitch_min_rad": None,
    "head_pitch_max_rad": None,
    "pose_change_threshold_rad": 0.1,
    "max_alerts_before_autosubmit": None,
    "max_score_before_autosubmit": None,
    "violation_weights": {"HIGH": 3, "MEDIUM": 2, "LOW": 1},
}


def _warn_invalid_config(key: str, value, fallback) -> None:
    logger.warning("Invalid proctoring config for %s=%r. Using default %r.", key, value, fallback)


def _coerce_bool(key: str, value, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    _warn_invalid_config(key, value, default)
    return default


def _coerce_float(key: str, value, default, *, min_value=None, max_value=None, allow_none: bool = False):
    if value is None and allow_none:
        return None
    if value is None:
        return default
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        _warn_invalid_config(key, value, default)
        return default
    if min_value is not None and numeric < min_value:
        _warn_invalid_config(key, value, default)
        return default
    if max_value is not None and numeric > max_value:
        _warn_invalid_config(key, value, default)
        return default
    return numeric


def _coerce_int(key: str, value, default, *, min_value=None, allow_none: bool = False):
    if value is None and allow_none:
        return None
    if value is None:
        return default
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        _warn_invalid_config(key, value, default)
        return default
    if min_value is not None and numeric < min_value:
        _warn_invalid_config(key, value, default)
        return default
    return numeric


def _coerce_score_weights(value) -> dict[str, int]:
    default = DEFAULT_ORCHESTRATOR_CONFIG["violation_weights"]
    if not isinstance(value, dict):
        if value is not None:
            _warn_invalid_config("violation_weights", value, default)
        return default.copy()
    normalized: dict[str, int] = {}
    for severity in ("HIGH", "MEDIUM", "LOW"):
        normalized[severity] = _coerce_int(
            f"violation_weights.{severity}",
            value.get(severity),
            default[severity],
            min_value=1,
        )
    return normalized


def _validate_config(config: dict | None) -> dict:
    if config is None:
        return DEFAULT_ORCHESTRATOR_CONFIG.copy()
    if not isinstance(config, dict):
        logger.warning("Invalid proctoring config payload %r. Using defaults.", config)
        return DEFAULT_ORCHESTRATOR_CONFIG.copy()

    validated = DEFAULT_ORCHESTRATOR_CONFIG.copy()
    for key in (
        "face_detection",
        "multi_face",
        "eye_tracking",
        "mouth_detection",
        "object_detection",
        "audio_detection",
        "head_pose_detection",
        "face_verify",
    ):
        validated[key] = _coerce_bool(key, config.get(key), DEFAULT_ORCHESTRATOR_CONFIG[key])

    for key in ("face_min_confidence", "object_confidence_threshold"):
        validated[key] = _coerce_float(key, config.get(key), DEFAULT_ORCHESTRATOR_CONFIG[key], min_value=0.0, max_value=1.0)

    for key in ("max_face_absence_sec", "eye_deviation_deg", "mouth_open_threshold", "audio_rms_threshold", "face_verify_threshold", "pose_change_threshold_rad", "eye_change_threshold_rad"):
        validated[key] = _coerce_float(key, config.get(key), DEFAULT_ORCHESTRATOR_CONFIG[key], min_value=0.0)

    for key in ("eye_pitch_min_rad", "eye_pitch_max_rad", "eye_yaw_min_rad", "eye_yaw_max_rad", "head_yaw_min_rad", "head_yaw_max_rad", "head_pitch_min_rad", "head_pitch_max_rad"):
        validated[key] = _coerce_float(key, config.get(key), DEFAULT_ORCHESTRATOR_CONFIG[key], allow_none=True)

    for key in ("object_detect_interval", "multi_face_consecutive", "cheating_consecutive_frames", "eye_consecutive", "audio_consecutive_chunks", "audio_window", "head_pose_yaw_deg", "head_pose_pitch_deg", "head_pose_consecutive"):
        validated[key] = _coerce_int(key, config.get(key), DEFAULT_ORCHESTRATOR_CONFIG[key], min_value=1)

    validated["max_alerts_before_autosubmit"] = _coerce_int(
        "max_alerts_before_autosubmit",
        config.get("max_alerts_before_autosubmit"),
        DEFAULT_ORCHESTRATOR_CONFIG["max_alerts_before_autosubmit"],
        min_value=1,
        allow_none=True,
    )
    validated["max_score_before_autosubmit"] = _coerce_int(
        "max_score_before_autosubmit",
        config.get("max_score_before_autosubmit"),
        DEFAULT_ORCHESTRATOR_CONFIG["max_score_before_autosubmit"],
        min_value=1,
        allow_none=True,
    )
    validated["face_signature"] = config.get("face_signature")
    validated["violation_weights"] = _coerce_score_weights(config.get("violation_weights"))
    return validated


class ProctoringOrchestrator:
    def __init__(self, config: dict | None = None):
        self.alert_logger = AlertLogger()
        self.alert_count = 0
        self.face_checks = 0
        self.violation_score = 0
        self.event_counts: dict[str, int] = {}
        self._frame_count = 0
        cfg = _validate_config(config)

        self.enable_face_detection = bool(cfg.get("face_detection", True))
        self.enable_multi_face = bool(cfg.get("multi_face", True))
        self.enable_eye_tracking = bool(cfg.get("eye_tracking", True))
        self.enable_mouth_detection = bool(cfg.get("mouth_detection", False))
        self.enable_object_detection = bool(cfg.get("object_detection", True))
        self.enable_audio_detection = bool(cfg.get("audio_detection", True))
        self.enable_head_pose = bool(cfg.get("head_pose_detection", True))

        # Minimum YOLO confidence for face detection (shared for face + multi-face)
        self._face_conf: float = float(cfg.get("face_min_confidence", 0.6))
        # Object detection throttle: run every N frames
        self._obj_detect_interval: int = int(cfg.get("object_detect_interval", 3))

        # detectors with config
        self.face_detector = FaceDetector(
            disappeared_threshold=cfg.get("max_face_absence_sec", 3),
            min_confidence=self._face_conf,
        )
        self.multi_detector = MultiFaceDetector(
            consecutive_threshold=cfg.get("multi_face_consecutive", 1),
            cooldown=5.0,
            min_confidence=self._face_conf,
        )

        eye_dev_rad = float(math.radians(cfg.get("eye_deviation_deg", 12)))
        cheating_consecutive = int(cfg.get("cheating_consecutive_frames", 5))
        self.eye_tracker = EyeTracker(
            max_deviation=eye_dev_rad,
            consecutive_threshold=cfg.get("eye_consecutive", cheating_consecutive),
            pitch_min=cfg.get("eye_pitch_min_rad", -0.5),
            pitch_max=cfg.get("eye_pitch_max_rad", 0.2),
            yaw_min=cfg.get("eye_yaw_min_rad", -eye_dev_rad),
            yaw_max=cfg.get("eye_yaw_max_rad", eye_dev_rad),
            change_threshold=cfg.get("eye_change_threshold_rad", 0.2),
        )

        self.mouth_monitor = MouthMonitor(open_threshold=cfg.get("mouth_open_threshold", 0.35))
        self.object_detector = ObjectDetector(
            confidence_threshold=cfg.get("object_confidence_threshold", 0.5),
        )
        self.audio_monitor = AudioMonitor(
            noise_threshold=cfg.get("audio_rms_threshold", 0.08),
            consecutive_threshold=cfg.get("audio_consecutive_chunks", 2),
            window=cfg.get("audio_window", 5),
        )
        self.face_verifier = FaceVerifier(
            baseline=cfg.get("face_signature"),
            threshold=cfg.get("face_verify_threshold", 0.15),
            enabled=cfg.get("face_verify", True),
        )
        self.head_pose = HeadPoseDetector(
            yaw_thresh_deg=cfg.get("head_pose_yaw_deg", 20),
            pitch_thresh_deg=cfg.get("head_pose_pitch_deg", 20),
            consecutive=cfg.get("head_pose_consecutive", cheating_consecutive),
            yaw_min_rad=cfg.get("head_yaw_min_rad"),
            yaw_max_rad=cfg.get("head_yaw_max_rad"),
            pitch_min_rad=cfg.get("head_pitch_min_rad"),
            pitch_max_rad=cfg.get("head_pitch_max_rad"),
            change_threshold_rad=cfg.get("pose_change_threshold_rad", 0.1),
        )
        self.max_alerts = cfg.get("max_alerts_before_autosubmit")
        self.max_score = cfg.get("max_score_before_autosubmit")
        self.score_weights = cfg.get("violation_weights") or {"HIGH": 3, "MEDIUM": 2, "LOW": 1}

    def process_frame(self, frame_bytes: bytes) -> list[dict]:
        """Run all visual detectors on a single frame.

        YOLO face detection runs once and its results are forwarded to both
        FaceDetector and MultiFaceDetector.  MediaPipe-based detectors are
        skipped when no face is present.  Object detection runs every
        _obj_detect_interval frames to reduce CPU load.

        Returns list of alert events that passed cooldown filtering.
        """
        self.face_checks += 1
        self._frame_count += 1

        # ── 1. Decode frame once ─────────────────────────────────────────────
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return []

        # ── 2. Single YOLO pass for face/multi-face ──────────────────────────
        face_count = 0
        face_confidences: list[float] = []
        face_model_available = False
        if self.enable_face_detection or self.enable_multi_face:
            model = get_face_model()
            if model is not None:
                face_model_available = True
                results = model.predict(frame, verbose=False, conf=self._face_conf, imgsz=640)
                face_confidences = [float(c) for r in results for c in r.boxes.conf]
                face_count = len(face_confidences)

        if self.enable_face_detection and face_model_available:
            self.alert_logger.add(self.face_detector.process_detections(face_count, face_confidences))
        if self.enable_multi_face and face_model_available:
            self.alert_logger.add(self.multi_detector.process_detections(face_count, face_confidences))

        # ── 3. MediaPipe detectors — skip when no face visible ───────────────
        if face_count > 0:
            if self.enable_eye_tracking:
                self.alert_logger.add(self.eye_tracker.process(frame_bytes))
            if self.enable_mouth_detection:
                self.alert_logger.add(self.mouth_monitor.process(frame_bytes))
            if self.enable_head_pose:
                self.alert_logger.add(self.head_pose.process(frame_bytes))
            # Face verification handles its own enabled flag
            self.alert_logger.add(self.face_verifier.process(frame_bytes))

        # ── 4. Object detection — throttled ──────────────────────────────────
        if self.enable_object_detection and (self._frame_count % self._obj_detect_interval == 0):
            for obj_ev in self.object_detector.process(frame_bytes):
                self.alert_logger.add(obj_ev)

        alerts = self.alert_logger.drain()
        self.alert_count += len(alerts)
        for alert in alerts:
            sev = (alert.get("severity") or "LOW").upper()
            self.violation_score += self.score_weights.get(sev, 1)
            et = alert.get("event_type", "UNKNOWN")
            self.event_counts[et] = self.event_counts.get(et, 0) + 1
        return alerts

    def process_audio(self, audio_bytes: bytes) -> list[dict]:
        """Process an audio chunk through VAD."""
        if not self.enable_audio_detection:
            return []
        event = self.audio_monitor.process(audio_bytes)
        self.alert_logger.add(event)
        alerts = self.alert_logger.drain()
        self.alert_count += len(alerts)
        for alert in alerts:
            sev = (alert.get("severity") or "LOW").upper()
            self.violation_score += self.score_weights.get(sev, 1)
            et = alert.get("event_type", "UNKNOWN")
            self.event_counts[et] = self.event_counts.get(et, 0) + 1
        return alerts

    def get_summary(self) -> dict:
        return {
            "face_checks": self.face_checks,
            "alerts_fired": self.alert_count,
            "violation_score": self.violation_score,
            "event_counts": self.event_counts,
        }
