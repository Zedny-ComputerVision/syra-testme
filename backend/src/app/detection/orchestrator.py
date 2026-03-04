"""Proctoring Orchestrator.

Coordinates all detection modules: face, multi-face, eye tracking,
mouth detection, object detection, and audio VAD.
Collects alerts via AlertLogger with cooldown support.
"""
from .face_detection import detect_face, FaceDetector
from .multi_face import detect_multiple_faces, MultiFaceDetector
from .eye_tracking import detect_eye_movement, EyeTracker
from .mouth_detection import detect_mouth_movement, MouthMonitor
from .object_detection import detect_forbidden_objects, ObjectDetector
from .audio_detection import detect_audio, AudioMonitor
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
        cfg = config or {}
        # detectors with config
        self.face_detector = FaceDetector(disappeared_threshold=cfg.get("max_face_absence_sec", 5))
        self.multi_detector = MultiFaceDetector(cooldown=5.0)
        self.eye_tracker = EyeTracker(max_deviation=cfg.get("eye_deviation_deg", 12) / 57.3)  # convert deg to rad approx
        self.mouth_monitor = MouthMonitor(open_threshold=cfg.get("mouth_open_threshold", 0.35))
        self.object_detector = ObjectDetector()
        self.audio_monitor = AudioMonitor(noise_threshold=cfg.get("audio_rms_threshold", 0.08))
        self.face_verifier = FaceVerifier(
            baseline=cfg.get("face_signature"),
            threshold=cfg.get("face_verify_threshold", 0.15),
            enabled=cfg.get("face_verify", True),
        )
        self.head_pose = HeadPoseDetector(
            yaw_thresh_deg=cfg.get("head_pose_yaw_deg", 20),
            pitch_thresh_deg=cfg.get("head_pose_pitch_deg", 20),
            consecutive=cfg.get("head_pose_consecutive", 5),
        )
        self.max_alerts = cfg.get("max_alerts_before_autosubmit")
        self.max_score = cfg.get("max_score_before_autosubmit")
        self.score_weights = cfg.get("violation_weights") or {"HIGH": 3, "MEDIUM": 2, "LOW": 1}

    def process_frame(self, frame_bytes: bytes) -> list[dict]:
        """Run all visual detectors on a single frame.

        Returns list of alert events that passed cooldown filtering.
        """
        self.face_checks += 1

        face_event = self.face_detector.process(frame_bytes)
        multi_event = self.multi_detector.process(frame_bytes)
        eye_event = self.eye_tracker.process(frame_bytes)
        mouth_event = self.mouth_monitor.process(frame_bytes)
        object_events = self.object_detector.process(frame_bytes)
        verify_event = self.face_verifier.process(frame_bytes)
        pose_event = self.head_pose.process(frame_bytes)

        self.alert_logger.add(face_event)
        self.alert_logger.add(multi_event)
        self.alert_logger.add(eye_event)
        self.alert_logger.add(mouth_event)
        self.alert_logger.add(verify_event)
        self.alert_logger.add(pose_event)
        for obj_ev in object_events:
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
