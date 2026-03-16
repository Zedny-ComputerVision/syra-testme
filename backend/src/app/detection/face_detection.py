"""Face presence detector using YOLOv8 face detection."""

import logging
import time
import cv2
import numpy as np

from ._yolo_face import get_face_model
from .camera_cover import analyze_camera_cover

logger = logging.getLogger(__name__)


class FaceDetector:
    def __init__(
        self,
        disappeared_threshold: float = 3.0,
        min_confidence: float = 0.6,
        camera_cover_hard_luma: float = 20.0,
        camera_cover_soft_luma: float = 40.0,
        camera_cover_stddev_max: float = 16.0,
        camera_cover_hard_consecutive_frames: int = 1,
        camera_cover_soft_consecutive_frames: int = 2,
    ):
        self.disappeared_threshold = disappeared_threshold
        self.min_confidence = min_confidence
        self.camera_cover_hard_luma = camera_cover_hard_luma
        self.camera_cover_soft_luma = camera_cover_soft_luma
        self.camera_cover_stddev_max = camera_cover_stddev_max
        self.camera_cover_hard_consecutive_frames = max(1, int(camera_cover_hard_consecutive_frames))
        self.camera_cover_soft_consecutive_frames = max(1, int(camera_cover_soft_consecutive_frames))
        self._last_seen: float | None = None
        self._disappeared_since: float | None = None
        self._hard_cover_frames = 0
        self._soft_cover_frames = 0
        self._camera_blocked = False
        self._warned_unavailable = False

    def process(self, frame_bytes: bytes) -> dict | None:
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None
        camera_cover = analyze_camera_cover(
            frame,
            hard_luma=self.camera_cover_hard_luma,
            soft_luma=self.camera_cover_soft_luma,
            stddev_max=self.camera_cover_stddev_max,
        )

        model = get_face_model()
        if model is None:
            if not self._warned_unavailable:
                logger.warning("Face detection model unavailable - detection disabled")
                self._warned_unavailable = True
            return None

        results = model.predict(frame, verbose=False, conf=self.min_confidence, imgsz=640)
        confidences = [float(conf) for r in results for conf in r.boxes.conf]
        return self.process_detections(len(confidences), confidences, camera_cover=camera_cover)

    def process_detections(
        self,
        face_count: int,
        confidences: list[float],
        *,
        camera_cover: dict[str, float | bool] | None = None,
    ) -> dict | None:
        """Process pre-computed YOLO results; avoids duplicate model inference when
        orchestrator shares a single YOLO call across face and multi-face detectors."""
        now = time.time()
        has_face = face_count > 0

        if has_face:
            self._hard_cover_frames = 0
            self._soft_cover_frames = 0
            self._camera_blocked = False
            if self._disappeared_since is not None:
                self._disappeared_since = None
                return {
                    "event_type": "FACE_REAPPEARED",
                    "severity": "LOW",
                    "detail": "Face reappeared in frame",
                    "confidence": confidences[0] if confidences else 0.9,
                }
            self._last_seen = now
            return None

        if camera_cover:
            hard_blocked = bool(camera_cover.get("hard_blocked"))
            soft_blocked = bool(camera_cover.get("soft_blocked"))
            self._hard_cover_frames = self._hard_cover_frames + 1 if hard_blocked else 0
            self._soft_cover_frames = self._soft_cover_frames + 1 if soft_blocked else 0
            if (
                not self._camera_blocked
                and (
                    self._hard_cover_frames >= self.camera_cover_hard_consecutive_frames
                    or self._soft_cover_frames >= self.camera_cover_soft_consecutive_frames
                )
            ):
                self._camera_blocked = True
                return {
                    "event_type": "CAMERA_COVERED",
                    "severity": "HIGH",
                    "detail": "Camera view is blocked or too dark",
                    "confidence": 0.97 if hard_blocked else 0.92,
                    "meta": {
                        "avg_luma": round(float(camera_cover.get("avg_luma", 0.0)), 2),
                        "stddev": round(float(camera_cover.get("stddev", 0.0)), 2),
                    },
                }
            if not soft_blocked:
                self._camera_blocked = False
        else:
            self._hard_cover_frames = 0
            self._soft_cover_frames = 0
            self._camera_blocked = False

        # no face
        if self._disappeared_since is None:
            self._disappeared_since = now
        elapsed = now - self._disappeared_since
        absence_threshold = min(self.disappeared_threshold, 1.0) if self._camera_blocked else self.disappeared_threshold
        if elapsed >= absence_threshold:
            return {
                "event_type": "FACE_DISAPPEARED",
                "severity": "HIGH",
                "detail": f"Face not detected for {elapsed:.1f}s",
                "confidence": 0.9,
            }
        return None

