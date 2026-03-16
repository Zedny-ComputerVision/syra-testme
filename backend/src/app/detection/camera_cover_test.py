from __future__ import annotations

import unittest

import numpy as np

from .camera_cover import analyze_camera_cover


class CameraCoverTest(unittest.TestCase):
    def test_detects_hard_camera_cover(self):
        frame = np.zeros((120, 120, 3), dtype=np.uint8)

        result = analyze_camera_cover(frame)

        self.assertTrue(result["hard_blocked"])
        self.assertTrue(result["soft_blocked"])
        self.assertLess(result["avg_luma"], 1.0)

    def test_detects_soft_camera_cover_for_dark_flat_frame(self):
        frame = np.full((120, 120, 3), 32, dtype=np.uint8)

        result = analyze_camera_cover(frame)

        self.assertFalse(result["hard_blocked"])
        self.assertTrue(result["soft_blocked"])
        self.assertLess(result["stddev"], 1.0)

    def test_does_not_flag_normal_bright_frame(self):
        frame = np.zeros((120, 120, 3), dtype=np.uint8)
        frame[:, :60] = 200
        frame[:, 60:] = 90

        result = analyze_camera_cover(frame)

        self.assertFalse(result["hard_blocked"])
        self.assertFalse(result["soft_blocked"])


if __name__ == "__main__":
    unittest.main()
