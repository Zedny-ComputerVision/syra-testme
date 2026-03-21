"""Proctoring Orchestrator.

Coordinates all detection modules: face, multi-face, eye tracking,
mouth detection, object detection, audio VAD, liveness, face verification,
emotion/stress detection, attention scoring, gaze heatmap, and risk scoring.

Optimisations:
  - YOLO runs ONCE per frame; results are shared with both FaceDetector and
    MultiFaceDetector via their process_detections() helpers.
  - MediaPipe-based detectors (eye, head pose, mouth, face verification, liveness,
    emotion) are skipped entirely when YOLO reports no face in frame.
  - Object detection (YOLOv8n general model) is throttled: runs every
    `_obj_detect_interval` frames (default 3) instead of every frame.
  - Head pose runs BEFORE eye tracking so its angles can compensate iris gaze.
  - Multi-face detector receives the current grayscale frame for optical-flow
    motion checks (to distinguish real people from posters/photos).
  - Gaze samples are accumulated every 10 frames for heatmap visualisation.
"""
import math
import logging
from concurrent.futures import ThreadPoolExecutor, Future

import cv2
import numpy as np

try:
    import mediapipe as _mp
    _MP_AVAILABLE = hasattr(_mp, "solutions")
except Exception:
    _mp = None
    _MP_AVAILABLE = False

from ._yolo_face import get_face_model
from .camera_cover import analyze_camera_cover
from .face_detection import FaceDetector
from .multi_face import MultiFaceDetector
from .eye_tracking import EyeTracker
from .mouth_detection import MouthMonitor
from .object_detection import ObjectDetector
from .audio_detection import AudioMonitor
from .alert_logger import AlertLogger
from .face_verification import FaceVerifier
from .head_pose import HeadPoseDetector
from .liveness import LivenessDetector
from .emotion_detection import EmotionMonitor

logger = logging.getLogger(__name__)

# Module-level cached FaceMesh instance — shared across all orchestrator instances
# to avoid re-loading the model for each new proctoring session.
_SHARED_FACE_MESH = None


def prewarm_shared_mesh() -> None:
    """Pre-load FaceMesh model at startup so first frame has no cold-start lag."""
    global _SHARED_FACE_MESH
    if not _MP_AVAILABLE or _SHARED_FACE_MESH is not None:
        return
    try:
        _SHARED_FACE_MESH = _mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            refine_landmarks=True,
            max_num_faces=1,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        # Run a dummy frame to trigger internal model loading
        dummy = np.zeros((120, 160, 3), dtype=np.uint8)
        _SHARED_FACE_MESH.process(dummy)
        logger.info("Shared FaceMesh pre-warmed and cached at module level")
    except Exception as exc:
        logger.warning("Failed to prewarm shared FaceMesh: %s", exc)
        _SHARED_FACE_MESH = None


DEFAULT_ORCHESTRATOR_CONFIG = {
    "face_detection": True,
    "multi_face": True,
    "eye_tracking": True,
    "mouth_detection": False,
    "object_detection": True,
    "audio_detection": True,
    "head_pose_detection": True,
    "face_min_confidence": 0.45,
    # Require 1 consecutive frame for instant multi-face detection
    "multi_face_consecutive": 1,
    "object_detect_interval": 2,
    # Wait 2 s before flagging a disappeared face
    "max_face_absence_sec": 2.0,
    # Eye tracking: ±20° yaw (was 12° ≈ 7.4° which caused massive false positives)
    "eye_deviation_deg": 20,
    "cheating_consecutive_frames": 3,
    "eye_consecutive": 3,
    # Symmetric pitch range ±20° (old defaults were asymmetric -28°/+11°)
    "eye_pitch_min_rad": None,
    "eye_pitch_max_rad": None,
    "eye_yaw_min_rad": None,
    "eye_yaw_max_rad": None,
    "eye_change_threshold_rad": 0.2,
    "mouth_open_threshold": 0.35,
    # Object detection: 0.45 balances sensitivity and false-positive rate at 640x480 input
    "object_confidence_threshold": 0.45,
    "audio_rms_threshold": 0.08,
    "audio_consecutive_chunks": 2,
    "audio_speech_consecutive_chunks": 2,
    "audio_speech_min_rms": 0.03,
    "audio_speech_baseline_multiplier": 1.35,
    "audio_window": 5,
    # Area ratio: 0.008 stays — but multi_face_consecutive raised to 2 for resilience
    "multi_face_min_area_ratio": 0.008,
    # Camera cover: raised all thresholds to reduce false negatives
    "camera_cover_hard_luma": 30.0,
    "camera_cover_soft_luma": 55.0,
    "camera_cover_stddev_max": 22.0,
    "camera_cover_hard_consecutive_frames": 1,
    "camera_cover_soft_consecutive_frames": 2,
    "face_signature": None,
    # Face verify threshold: raised slightly (0.15 → 0.18) because 40-landmark vector
    # has more discriminative power and is less noisy than the old 8-landmark vector.
    "face_verify_threshold": 0.18,
    "face_verify": True,
    "head_pose_yaw_deg": 25,
    "head_pose_pitch_deg": 25,
    "head_pose_consecutive": 3,
    "head_yaw_min_rad": None,
    "head_yaw_max_rad": None,
    "head_pitch_min_rad": None,
    "head_pitch_max_rad": None,
    "pose_change_threshold_rad": 0.1,
    # Liveness detection (EAR blink + anti-replay)
    "liveness_detection": True,
    "no_blink_threshold_sec": 15.0,   # alert if no blink for 15 s
    "eyes_closed_threshold_sec": 3.0, # alert if eyes closed for 3 s
    # Emotion / stress detection
    "emotion_detection": True,
    "stress_threshold_sec": 8.0,      # sustained stress cue before alerting
    "stress_cooldown_sec": 60.0,
    # Gaze heatmap: accumulate one sample every N frames
    "gaze_sample_interval": 10,
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
        "liveness_detection",
        "emotion_detection",
    ):
        validated[key] = _coerce_bool(key, config.get(key), DEFAULT_ORCHESTRATOR_CONFIG[key])

    for key in ("face_min_confidence", "object_confidence_threshold"):
        validated[key] = _coerce_float(key, config.get(key), DEFAULT_ORCHESTRATOR_CONFIG[key], min_value=0.0, max_value=1.0)

    for key in ("max_face_absence_sec", "eye_deviation_deg", "mouth_open_threshold", "audio_rms_threshold", "face_verify_threshold", "pose_change_threshold_rad", "eye_change_threshold_rad", "multi_face_min_area_ratio", "audio_speech_min_rms", "audio_speech_baseline_multiplier", "camera_cover_hard_luma", "camera_cover_soft_luma", "camera_cover_stddev_max", "no_blink_threshold_sec", "eyes_closed_threshold_sec", "stress_threshold_sec", "stress_cooldown_sec"):
        validated[key] = _coerce_float(key, config.get(key), DEFAULT_ORCHESTRATOR_CONFIG[key], min_value=0.0)

    for key in ("eye_pitch_min_rad", "eye_pitch_max_rad", "eye_yaw_min_rad", "eye_yaw_max_rad", "head_yaw_min_rad", "head_yaw_max_rad", "head_pitch_min_rad", "head_pitch_max_rad"):
        validated[key] = _coerce_float(key, config.get(key), DEFAULT_ORCHESTRATOR_CONFIG[key], allow_none=True)

    for key in ("object_detect_interval", "multi_face_consecutive", "cheating_consecutive_frames", "eye_consecutive", "audio_consecutive_chunks", "audio_speech_consecutive_chunks", "audio_window", "head_pose_yaw_deg", "head_pose_pitch_deg", "head_pose_consecutive", "camera_cover_hard_consecutive_frames", "camera_cover_soft_consecutive_frames", "gaze_sample_interval"):
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

        # Attention / presence counters
        self._frames_with_face: int = 0      # frames where YOLO detected a face
        self._frames_attentive: int = 0       # face present AND no EYE_MOVEMENT alert this frame
        self._frames_eye_away: int = 0        # frames with a gaze-away alert

        # Gaze heatmap: list of (x, y) normalised positions sampled every N frames
        self._gaze_samples: list[tuple[float, float]] = []
        self._gaze_sample_interval: int = 10  # overridden from config below

        cfg = _validate_config(config)

        self.enable_face_detection = bool(cfg.get("face_detection", True))
        self.enable_multi_face = bool(cfg.get("multi_face", True))
        self.enable_eye_tracking = bool(cfg.get("eye_tracking", True))
        self.enable_mouth_detection = bool(cfg.get("mouth_detection", False))
        self.enable_object_detection = bool(cfg.get("object_detection", True))
        self.enable_audio_detection = bool(cfg.get("audio_detection", True))
        self.enable_head_pose = bool(cfg.get("head_pose_detection", True))
        self.enable_liveness = bool(cfg.get("liveness_detection", True))
        self.enable_emotion = bool(cfg.get("emotion_detection", True))
        self._gaze_sample_interval = int(cfg.get("gaze_sample_interval", 10))

        # Minimum YOLO confidence for face detection (shared for face + multi-face)
        self._face_conf: float = float(cfg.get("face_min_confidence", 0.6))
        # Object detection throttle: run every N frames
        self._obj_detect_interval: int = int(cfg.get("object_detect_interval", 3))

        # detectors with config
        self.face_detector = FaceDetector(
            disappeared_threshold=cfg.get("max_face_absence_sec", 3.0),
            min_confidence=self._face_conf,
            camera_cover_hard_luma=cfg.get("camera_cover_hard_luma", 30.0),
            camera_cover_soft_luma=cfg.get("camera_cover_soft_luma", 55.0),
            camera_cover_stddev_max=cfg.get("camera_cover_stddev_max", 22.0),
            camera_cover_hard_consecutive_frames=cfg.get("camera_cover_hard_consecutive_frames", 1),
            camera_cover_soft_consecutive_frames=cfg.get("camera_cover_soft_consecutive_frames", 2),
        )
        self.multi_detector = MultiFaceDetector(
            consecutive_threshold=cfg.get("multi_face_consecutive", 2),
            cooldown=5.0,
            min_confidence=self._face_conf,
            min_area_ratio=cfg.get("multi_face_min_area_ratio", 0.008),
        )

        eye_dev_rad = float(math.radians(cfg.get("eye_deviation_deg", 20)))
        cheating_consecutive = int(cfg.get("cheating_consecutive_frames", 5))
        self.eye_tracker = EyeTracker(
            max_deviation=eye_dev_rad,
            consecutive_threshold=cfg.get("eye_consecutive", cheating_consecutive),
            # Pass None so EyeTracker uses its own symmetric default (±deviation)
            pitch_min=cfg.get("eye_pitch_min_rad"),
            pitch_max=cfg.get("eye_pitch_max_rad"),
            yaw_min=cfg.get("eye_yaw_min_rad"),
            yaw_max=cfg.get("eye_yaw_max_rad"),
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
            speech_consecutive_chunks=cfg.get("audio_speech_consecutive_chunks", 2),
            speech_min_rms=cfg.get("audio_speech_min_rms", 0.03),
            speech_baseline_multiplier=cfg.get("audio_speech_baseline_multiplier", 1.35),
        )
        self.face_verifier = FaceVerifier(
            baseline=cfg.get("face_signature"),
            threshold=cfg.get("face_verify_threshold", 0.18),
            enabled=cfg.get("face_verify", True),
        )
        self.head_pose = HeadPoseDetector(
            yaw_thresh_deg=cfg.get("head_pose_yaw_deg", 25),
            pitch_thresh_deg=cfg.get("head_pose_pitch_deg", 25),
            consecutive=cfg.get("head_pose_consecutive", cheating_consecutive),
            yaw_min_rad=cfg.get("head_yaw_min_rad"),
            yaw_max_rad=cfg.get("head_yaw_max_rad"),
            pitch_min_rad=cfg.get("head_pitch_min_rad"),
            pitch_max_rad=cfg.get("head_pitch_max_rad"),
            change_threshold_rad=cfg.get("pose_change_threshold_rad", 0.1),
        )
        self.liveness_detector = LivenessDetector(
            no_blink_threshold_sec=float(cfg.get("no_blink_threshold_sec", 25.0)),
            eyes_closed_threshold_sec=float(cfg.get("eyes_closed_threshold_sec", 3.0)),
            enabled=self.enable_liveness,
        )
        self.emotion_monitor = EmotionMonitor(
            stress_threshold_sec=float(cfg.get("stress_threshold_sec", 15.0)),
            cooldown_sec=float(cfg.get("stress_cooldown_sec", 60.0)),
            enabled=self.enable_emotion,
        )

        # ── Shared FaceMesh — reuse module-level cached instance if available,
        # otherwise create a per-orchestrator instance as fallback.
        self._shared_mesh = _SHARED_FACE_MESH
        if self._shared_mesh is None and _MP_AVAILABLE:
            try:
                self._shared_mesh = _mp.solutions.face_mesh.FaceMesh(
                    static_image_mode=False,
                    refine_landmarks=True,
                    max_num_faces=1,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
            except Exception as exc:
                logger.warning("Shared FaceMesh init failed: %s — detectors will use own instances", exc)

        self.max_alerts = cfg.get("max_alerts_before_autosubmit")
        self.max_score = cfg.get("max_score_before_autosubmit")
        self.score_weights = cfg.get("violation_weights") or {"HIGH": 3, "MEDIUM": 2, "LOW": 1}

        # Thread pool for running object detection in parallel with face pipeline
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="obj_detect")

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
        self._cached_rgb = None  # lazily computed BGR→RGB (shared by FaceMesh)

        # ── 1b. Kick off object detection in parallel (independent of face) ──
        obj_future: Future | None = None
        if self.enable_object_detection and (self._frame_count % self._obj_detect_interval == 0):
            obj_future = self._executor.submit(self.object_detector.process_ndarray, frame)

        # ── 2. Single YOLO pass for face/multi-face ──────────────────────────
        face_count = 0
        face_confidences: list[float] = []
        face_boxes: list[list[float]] = []
        face_model_available = False
        camera_cover = analyze_camera_cover(frame)
        if self.enable_face_detection or self.enable_multi_face:
            model = get_face_model()
            if model is not None:
                face_model_available = True
                results = model.predict(frame, verbose=False, conf=self._face_conf, imgsz=640)
                face_confidences = [float(c) for r in results for c in r.boxes.conf]
                face_boxes = [
                    [float(coord) for coord in box.tolist()]
                    for r in results
                    for box in getattr(r.boxes, "xyxy", [])
                ]
                face_count = len(face_confidences)

        if face_model_available and face_count > 0:
            logger.info("Frame %d: YOLO detected %d face(s), confidences=%s", self._frame_count, face_count, [round(c, 2) for c in face_confidences])

        if self.enable_face_detection and face_model_available:
            self.alert_logger.add(
                self.face_detector.process_detections(
                    face_count,
                    face_confidences,
                    camera_cover=camera_cover,
                )
            )
        # Pre-compute grayscale only when multi-face needs optical-flow
        if self.enable_multi_face and face_model_available:
            curr_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            self.alert_logger.add(
                self.multi_detector.process_detections(
                    face_count,
                    face_confidences,
                    boxes=face_boxes,
                    frame_shape=frame.shape,
                    curr_gray=curr_gray,
                )
            )
            # Update multi-detector's previous frame for next iteration
            self.multi_detector._prev_gray = curr_gray

        # ── 3. MediaPipe detectors — skip when no face visible ───────────────
        # Run shared FaceMesh ONCE, pass landmarks to all detectors.
        # Head pose runs FIRST so its angles can compensate eye-tracking gaze.
        if face_count > 0:
            self._frames_with_face += 1
            eye_away_this_frame = False

            # Single FaceMesh pass for all landmark-based detectors
            shared_lm = None
            if self._shared_mesh is not None:
                if self._cached_rgb is None:
                    self._cached_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mesh_result = self._shared_mesh.process(self._cached_rgb)
                if mesh_result.multi_face_landmarks:
                    shared_lm = mesh_result.multi_face_landmarks[0].landmark

            # 3a. Head pose (must come before eye tracking for compensation)
            if self.enable_head_pose:
                if shared_lm is not None:
                    self.alert_logger.add(self.head_pose.process_landmarks(shared_lm, frame.shape))
                else:
                    self.alert_logger.add(self.head_pose.process_ndarray(frame))

            # 3b. Eye tracking with head-pose compensation
            if self.enable_eye_tracking:
                if shared_lm is not None:
                    eye_alert = self.eye_tracker.process_landmarks(
                        shared_lm,
                        head_yaw_rad=self.head_pose.last_yaw_rad if self.enable_head_pose else None,
                        head_pitch_rad=self.head_pose.last_pitch_rad if self.enable_head_pose else None,
                    )
                else:
                    eye_alert = self.eye_tracker.process_ndarray(
                        frame,
                        head_yaw_rad=self.head_pose.last_yaw_rad if self.enable_head_pose else None,
                        head_pitch_rad=self.head_pose.last_pitch_rad if self.enable_head_pose else None,
                    )
                self.alert_logger.add(eye_alert)
                if eye_alert is not None:
                    eye_away_this_frame = True
                    self._frames_eye_away += 1

                # Accumulate gaze heatmap sample every N frames
                if (
                    self._frame_count % self._gaze_sample_interval == 0
                    and self.eye_tracker.last_gaze_normalized is not None
                ):
                    self._gaze_samples.append(self.eye_tracker.last_gaze_normalized)
                    if len(self._gaze_samples) > 5000:
                        self._gaze_samples = self._gaze_samples[-5000:]

            if not eye_away_this_frame:
                self._frames_attentive += 1

            if self.enable_mouth_detection:
                if shared_lm is not None:
                    self.alert_logger.add(self.mouth_monitor.process_landmarks(shared_lm))
                else:
                    self.alert_logger.add(self.mouth_monitor.process_ndarray(frame))

            # 3c. Liveness — blink detection + anti-replay
            if self.enable_liveness:
                if shared_lm is not None:
                    for ev in self.liveness_detector.process_landmarks(shared_lm):
                        self.alert_logger.add(ev)
                else:
                    for ev in self.liveness_detector.process_ndarray(frame):
                        self.alert_logger.add(ev)

            # 3d. Emotion / stress detection
            if self.enable_emotion:
                if shared_lm is not None:
                    for ev in self.emotion_monitor.process_landmarks(shared_lm):
                        self.alert_logger.add(ev)
                else:
                    for ev in self.emotion_monitor.process_ndarray(frame):
                        self.alert_logger.add(ev)

            # Face verification — passes landmarks + frame (DeepFace needs raw pixels)
            if shared_lm is not None:
                self.alert_logger.add(self.face_verifier.process_landmarks(shared_lm, frame=frame))
            else:
                self.alert_logger.add(self.face_verifier.process_ndarray(frame))

        # ── 4. Collect parallel object detection results ──────────────────────
        if obj_future is not None:
            try:
                obj_events = obj_future.result(timeout=2.0)
                if obj_events:
                    logger.info("Frame %d: Object detection found %d forbidden object(s): %s", self._frame_count, len(obj_events), [e.get("detail") for e in obj_events])
                for obj_ev in obj_events:
                    self.alert_logger.add(obj_ev)
            except Exception as obj_err:
                logger.warning("Object detection failed: %s", obj_err)

        alerts = self.alert_logger.drain()
        self.alert_count += len(alerts)
        for alert in alerts:
            sev = (alert.get("severity") or "LOW").upper()
            self.violation_score += self.score_weights.get(sev, 1)
            et = alert.get("event_type", "UNKNOWN")
            self.event_counts[et] = self.event_counts.get(et, 0) + 1
        return alerts

    def process_audio(self, audio_bytes: bytes, sample_rate: int | None = None) -> list[dict]:
        """Process an audio chunk through VAD.

        sample_rate: client-reported rate (must be 16 000 Hz for WebRTC VAD).
        """
        if not self.enable_audio_detection:
            return []
        event = self.audio_monitor.process(audio_bytes, sample_rate=sample_rate)
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
        total_frames = max(1, self.face_checks)
        face_pct = round(self._frames_with_face / total_frames * 100, 1)
        attention_pct = round(self._frames_attentive / total_frames * 100, 1)
        eye_away_pct = round(self._frames_eye_away / total_frames * 100, 1)

        # Absence percentage: frames where face was absent
        absence_pct = max(0.0, 100.0 - face_pct)

        # High-signal event counts for risk score
        face_mismatch_count = self.event_counts.get("FACE_MISMATCH", 0)
        multi_face_count = self.event_counts.get("MULTIPLE_FACES", 0)
        browser_events = sum(
            self.event_counts.get(et, 0)
            for et in (
                "TAB_SWITCH", "COPY_PASTE_ATTEMPT", "SHORTCUT_BLOCKED",
                "DEV_TOOLS_OPEN", "VIRTUAL_MACHINE", "REMOTE_DESKTOP_DETECTED",
                "FORBIDDEN_CONTENT",
            )
        )

        # Risk score (0-100): weighted combination of signals
        risk_score = min(
            100,
            int(
                self.violation_score * 1.5
                + absence_pct * 0.25
                + face_mismatch_count * 8
                + multi_face_count * 4
                + browser_events * 2
                + eye_away_pct * 0.2
            ),
        )

        return {
            "face_checks": self.face_checks,
            "alerts_fired": self.alert_count,
            "violation_score": self.violation_score,
            "event_counts": self.event_counts,
            # Attention & presence
            "face_present_pct": face_pct,
            "attention_pct": attention_pct,
            "eye_away_pct": eye_away_pct,
            # Composite risk
            "risk_score": risk_score,
            # Gaze heatmap samples — list of [x, y] in [0,1]×[0,1]
            "gaze_samples": [[round(x, 4), round(y, 4)] for x, y in self._gaze_samples],
        }
