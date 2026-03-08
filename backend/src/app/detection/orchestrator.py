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


class ProctoringOrchestrator:
    def __init__(self, config: dict | None = None):
        self.alert_logger = AlertLogger()
        self.alert_count = 0
        self.face_checks = 0
        self.violation_score = 0
        self.event_counts: dict[str, int] = {}
        self._frame_count = 0
        cfg = config or {}

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
        self.multi_detector = MultiFaceDetector(cooldown=5.0, min_confidence=self._face_conf)

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
        if self.enable_face_detection or self.enable_multi_face:
            model = get_face_model()
            if model is not None:
                results = model.predict(frame, verbose=False, conf=self._face_conf, imgsz=640)
                face_confidences = [float(c) for r in results for c in r.boxes.conf]
                face_count = len(face_confidences)

        if self.enable_face_detection:
            self.alert_logger.add(self.face_detector.process_detections(face_count, face_confidences))
        if self.enable_multi_face:
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
