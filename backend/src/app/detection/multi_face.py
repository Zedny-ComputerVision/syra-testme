"""Multiple face detection using YOLOv8 face detection.

Enhancements over the original:
  - Optical-flow motion check: if an extra face box shows zero motion across
    3 consecutive frames it is very likely a static image/poster.  Its alert
    severity is downgraded to MEDIUM and confidence is halved.
  - Area filter (min_area_ratio) unchanged — still filters tiny background faces.
"""

from __future__ import annotations

import logging
import time
import cv2
import numpy as np

from ._yolo_face import get_face_model

logger = logging.getLogger(__name__)

_MOTION_THRESHOLD = 1.5   # mean optical-flow magnitude below which box is "static"
_MOTION_HISTORY = 3       # consecutive static frames before confidence downgrade


class MultiFaceDetector:
    def __init__(
        self,
        max_faces: int = 1,
        consecutive_threshold: int = 2,
        cooldown: float = 5.0,
        min_confidence: float = 0.6,
        min_area_ratio: float = 0.008,
    ):
        self.max_faces = max_faces
        self.consecutive_threshold = consecutive_threshold
        self.cooldown = cooldown
        self.min_confidence = min_confidence
        self.min_area_ratio = min_area_ratio
        self._consecutive_count = 0
        self._last_alert = 0.0
        self._warned_unavailable = False

        # For optical-flow motion check
        self._prev_gray: np.ndarray | None = None
        self._static_frames: int = 0

    def _motion_in_box(self, prev_gray: np.ndarray, curr_gray: np.ndarray, box: list[float]) -> float:
        """Return mean Farnebäck optical-flow magnitude inside the face bounding box."""
        h, w = curr_gray.shape[:2]
        x1, y1, x2, y2 = max(0, int(box[0])), max(0, int(box[1])), min(w, int(box[2])), min(h, int(box[3]))
        if x2 <= x1 or y2 <= y1:
            return 0.0
        try:
            flow = cv2.calcOpticalFlowFarneback(
                prev_gray[y1:y2, x1:x2], curr_gray[y1:y2, x1:x2], None,
                pyr_scale=0.5, levels=2, winsize=8, iterations=2,
                poly_n=5, poly_sigma=1.1, flags=0,
            )
            return float(np.mean(np.sqrt(flow[..., 0] ** 2 + flow[..., 1] ** 2)))
        except Exception:
            return 0.0

    def process(self, frame_bytes: bytes) -> dict | None:
        now = time.time()
        if now - self._last_alert < self.cooldown:
            return None
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None
        model = get_face_model()
        if model is None:
            if not self._warned_unavailable:
                logger.warning("Multi-face detection model unavailable - detection disabled")
                self._warned_unavailable = True
            return None
        results = model.predict(frame, verbose=False, conf=self.min_confidence, imgsz=640)
        confidences = [float(conf) for r in results for conf in r.boxes.conf]
        boxes = [
            [float(coord) for coord in box.tolist()]
            for r in results
            for box in getattr(r.boxes, "xyxy", [])
        ]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        result = self.process_detections(
            len(confidences), confidences,
            boxes=boxes, frame_shape=frame.shape,
            curr_gray=gray,
        )
        self._prev_gray = gray
        return result

    def process_detections(
        self,
        face_count: int,
        confidences: list[float],
        *,
        boxes: list[list[float]] | None = None,
        frame_shape=None,
        curr_gray: np.ndarray | None = None,
    ) -> dict | None:
        """Process pre-computed YOLO results (called by orchestrator with shared YOLO pass)."""
        now = time.time()
        if now - self._last_alert < self.cooldown:
            return None

        qualified_confidences: list[float] = []
        qualified_boxes: list[list[float]] = []

        if boxes and frame_shape is not None:
            frame_area = max(1.0, float(frame_shape[0] * frame_shape[1]))
            for conf, box in zip(confidences, boxes):
                x1, y1, x2, y2 = box
                area_ratio = (max(0.0, float(x2) - float(x1)) * max(0.0, float(y2) - float(y1))) / frame_area
                if float(conf) >= self.min_confidence and area_ratio >= self.min_area_ratio:
                    qualified_confidences.append(float(conf))
                    qualified_boxes.append(box)
            qualified_count = len(qualified_confidences)
        else:
            qualified_count = face_count
            qualified_confidences = list(confidences)
            qualified_boxes = boxes or []

        if qualified_count > self.max_faces:
            # ── Optical-flow motion check for extra faces ─────────────────────
            motion_ok = True
            if (
                self._prev_gray is not None
                and curr_gray is not None
                and len(qualified_boxes) > self.max_faces
            ):
                extra_boxes = qualified_boxes[self.max_faces:]
                max_motion = max(
                    (self._motion_in_box(self._prev_gray, curr_gray, b) for b in extra_boxes),
                    default=0.0,
                )
                self._static_frames = self._static_frames + 1 if max_motion < _MOTION_THRESHOLD else 0
                if self._static_frames >= _MOTION_HISTORY:
                    motion_ok = False  # extra face is probably a static poster/photo

            self._consecutive_count += 1
            if self._consecutive_count >= self.consecutive_threshold:
                self._last_alert = now
                self._consecutive_count = 0
                avg_conf = sum(qualified_confidences) / qualified_count if qualified_count > 0 else 0.0
                return {
                    "event_type": "MULTIPLE_FACES",
                    "severity": "HIGH" if motion_ok else "MEDIUM",
                    "detail": (
                        f"{qualified_count} faces detected in frame"
                        + ("" if motion_ok else " (extra face appears static — possible poster/photo)")
                    ),
                    "confidence": min(0.99, avg_conf * (1.0 if motion_ok else 0.5)),
                    "meta": {"face_count": qualified_count, "motion_ok": motion_ok},
                }
        else:
            self._consecutive_count = 0
            self._static_frames = 0
        return None
