from __future__ import annotations

import unittest
from unittest.mock import patch

from .face_detection import FaceDetector
from .multi_face import MultiFaceDetector


class FaceSignalTest(unittest.TestCase):
    def test_camera_cover_alerts_before_face_disappearance(self):
        detector = FaceDetector(
            disappeared_threshold=3.0,
            camera_cover_hard_consecutive_frames=1,
            camera_cover_soft_consecutive_frames=2,
        )
        cover = {
            "avg_luma": 8.0,
            "stddev": 0.8,
            "hard_blocked": True,
            "soft_blocked": True,
        }

        with patch("src.app.detection.face_detection.time.time", side_effect=[10.0, 11.2, 12.3]):
            first = detector.process_detections(0, [], camera_cover=cover)
            second = detector.process_detections(0, [], camera_cover=cover)
            third = detector.process_detections(0, [], camera_cover=cover)

        self.assertEqual("CAMERA_COVERED", first["event_type"])
        self.assertIsNone(second)
        self.assertEqual("FACE_DISAPPEARED", third["event_type"])

    def test_multi_face_ignores_tiny_secondary_detection(self):
        detector = MultiFaceDetector(consecutive_threshold=1, min_confidence=0.45, min_area_ratio=0.01)
        frame_shape = (1000, 1000, 3)
        boxes = [
            [100, 100, 500, 700],
            [10, 10, 40, 50],
        ]

        event = detector.process_detections(
            2,
            [0.95, 0.91],
            boxes=boxes,
            frame_shape=frame_shape,
        )

        self.assertIsNone(event)

    def test_multi_face_alerts_for_multiple_qualified_faces(self):
        detector = MultiFaceDetector(consecutive_threshold=2, min_confidence=0.45, min_area_ratio=0.01)
        frame_shape = (1000, 1000, 3)
        boxes = [
            [100, 100, 420, 720],
            [520, 120, 860, 760],
        ]

        with patch("src.app.detection.multi_face.time.time", side_effect=[10.0, 11.0]):
            first = detector.process_detections(2, [0.93, 0.9], boxes=boxes, frame_shape=frame_shape)
            second = detector.process_detections(2, [0.93, 0.9], boxes=boxes, frame_shape=frame_shape)

        self.assertIsNone(first)
        self.assertEqual("MULTIPLE_FACES", second["event_type"])


if __name__ == "__main__":
    unittest.main()
