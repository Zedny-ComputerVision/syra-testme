"""Audio / Voice Activity Detection (VAD) with anomaly detection."""

import numpy as np


class AudioMonitor:
    def __init__(self, noise_threshold: float = 0.08, consecutive_threshold: int = 2, window: int = 5):
        self.noise_threshold = noise_threshold
        self.consecutive_threshold = consecutive_threshold
        self.window = window
        self._consecutive_noise = 0
        self._recent_rms: list[float] = []

    def process(self, audio_bytes: bytes) -> dict | None:
        if not audio_bytes or len(audio_bytes) < 4:
            return None
        try:
            pcm = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        except Exception:
            return None
        if pcm.size == 0:
            return None
        rms = float(np.sqrt(np.mean(pcm ** 2)))
        peak = float(np.max(np.abs(pcm)))
        self._recent_rms.append(rms)
        if len(self._recent_rms) > self.window:
            self._recent_rms.pop(0)

        # Loud audio (short burst)
        if rms > self.noise_threshold:
            self._consecutive_noise += 1
            if self._consecutive_noise >= self.consecutive_threshold:
                self._consecutive_noise = 0
                return {
                    "event_type": "LOUD_AUDIO",
                    "severity": "LOW",
                    "detail": f"Loud audio detected (rms={rms:.3f})",
                    "confidence": min(0.99, rms / self.noise_threshold),
                }
        else:
            self._consecutive_noise = 0
            # Anomaly check only when audio is NOT a loud burst to avoid
            # double-firing on the same chunk (mutual exclusion).
            if peak > 0.98 or sum(r > self.noise_threshold for r in self._recent_rms) >= max(3, self.window // 2):
                return {
                    "event_type": "AUDIO_ANOMALY",
                    "severity": "MEDIUM",
                    "detail": f"Audio anomaly (rms={rms:.3f}, peak={peak:.3f})",
                    "confidence": min(0.99, max(peak, rms / (self.noise_threshold + 1e-6))),
                }

        return None


_monitor = AudioMonitor()


def detect_audio(chunk_bytes: bytes) -> dict | None:
    return _monitor.process(chunk_bytes)
