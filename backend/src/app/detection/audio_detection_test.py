from __future__ import annotations

import unittest

import numpy as np

from .audio_detection import AudioMonitor


def pcm_bytes(samples: np.ndarray) -> bytes:
    clipped = np.clip(samples, -1.0, 1.0)
    return (clipped * 32767).astype(np.int16).tobytes()


class AudioDetectionTest(unittest.TestCase):
    def test_requires_sustained_speech_like_chunks_for_audio_anomaly(self):
        monitor = AudioMonitor(
            noise_threshold=0.2,
            consecutive_threshold=2,
            speech_consecutive_chunks=2,
            speech_min_rms=0.03,
            speech_baseline_multiplier=1.2,
        )
        quiet = np.zeros(16000, dtype=np.float32)
        speech = 0.08 * np.sin(2 * np.pi * 220 * np.linspace(0, 1, 16000, endpoint=False)).astype(np.float32)

        self.assertIsNone(monitor.process(pcm_bytes(quiet)))
        self.assertIsNone(monitor.process(pcm_bytes(speech)))
        event = monitor.process(pcm_bytes(speech))

        self.assertIsNotNone(event)
        self.assertEqual("AUDIO_ANOMALY", event["event_type"])

    def test_loud_audio_uses_consecutive_threshold(self):
        monitor = AudioMonitor(noise_threshold=0.05, consecutive_threshold=2, speech_consecutive_chunks=3)
        noise = np.random.default_rng(42).normal(0, 0.12, 16000).astype(np.float32)

        self.assertIsNone(monitor.process(pcm_bytes(noise)))
        event = monitor.process(pcm_bytes(noise))

        self.assertIsNotNone(event)
        self.assertEqual("LOUD_AUDIO", event["event_type"])


if __name__ == "__main__":
    unittest.main()
