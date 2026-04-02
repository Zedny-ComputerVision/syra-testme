"""Audio Voice Activity Detection (VAD) — WebRTC VAD primary, spectral fallback.

Primary path: Google's WebRTC VAD (webrtcvad-wheels package).
  - VAD aggressiveness mode 2 (balanced false-positive/false-negative trade-off)
  - Processes 30 ms frames at 16 000 Hz int16 PCM
  - If ≥ 60 % of frames in a chunk are speech → AUDIO_ANOMALY
  - Very low CPU cost (~0.1 ms per frame)

Fallback path (if webrtcvad not installed): spectral energy approach:
  - RMS, Zero-Crossing Rate, and speech-band (300–3400 Hz) energy ratio
  - Adaptive baseline adapts to room noise
  - Three simultaneous criteria must pass to reduce false positives

Client must send 16 000 Hz int16 PCM (audioCapture.js downsamples before sending).
"""

from __future__ import annotations

import logging
import numpy as np

logger = logging.getLogger(__name__)

# ─── Primary: WebRTC VAD ───────────────────────────────────────────────────────
_webrtcvad_available = False
try:
    import webrtcvad as _webrtcvad
    _webrtcvad_available = True
    logger.info("WebRTC VAD available — using hardware-accelerated speech detection")
except Exception as _e:
    logger.warning("webrtcvad unavailable (%s) — falling back to spectral VAD", _e)

_VAD_SAMPLE_RATE = 16_000   # Hz — must match client-side TARGET_RATE
_VAD_FRAME_MS = 30          # ms — webrtcvad supports 10, 20, 30
_VAD_FRAME_SAMPLES = _VAD_SAMPLE_RATE * _VAD_FRAME_MS // 1000   # = 480
_VAD_FRAME_BYTES = _VAD_FRAME_SAMPLES * 2                       # int16 = 960 bytes
_VAD_SPEECH_RATIO_THRESHOLD = 0.55  # 55%+ of frames must be speech to trigger

# ─── Fallback: spectral constants ─────────────────────────────────────────────
_SPEECH_BAND_LOW_HZ = 300
_SPEECH_BAND_HIGH_HZ = 3400
_SPEECH_BAND_RATIO_MIN = 0.30


def _speech_band_ratio(pcm: np.ndarray, sample_rate: int = _VAD_SAMPLE_RATE) -> float:
    n = len(pcm)
    if n < 64:
        return 0.0
    nfft = 1 << (n - 1).bit_length()
    spectrum = np.abs(np.fft.rfft(pcm, n=nfft)) ** 2
    freqs = np.fft.rfftfreq(nfft, d=1.0 / sample_rate)
    total_energy = float(np.sum(spectrum))
    if total_energy < 1e-12:
        return 0.0
    mask = (freqs >= _SPEECH_BAND_LOW_HZ) & (freqs <= _SPEECH_BAND_HIGH_HZ)
    return float(np.sum(spectrum[mask])) / total_energy


class AudioMonitor:
    def __init__(
        self,
        noise_threshold: float = 0.08,
        consecutive_threshold: int = 2,
        window: int = 5,
        speech_consecutive_chunks: int = 2,
        speech_min_rms: float = 0.03,
        speech_baseline_multiplier: float = 1.35,
        sample_rate: int = _VAD_SAMPLE_RATE,
        vad_aggressiveness: int = 2,  # 0 (least) – 3 (most aggressive)
    ):
        self.noise_threshold = noise_threshold
        self.consecutive_threshold = consecutive_threshold
        self.window = window
        self.speech_consecutive_chunks = speech_consecutive_chunks
        self.speech_min_rms = speech_min_rms
        self.speech_baseline_multiplier = speech_baseline_multiplier
        self.sample_rate = sample_rate
        self._client_sample_rate = sample_rate  # Original client rate — never mutated
        self._sample_rate_locked = False  # Lock after first audio chunk

        # WebRTC VAD instance
        self._vad = None
        if _webrtcvad_available:
            try:
                self._vad = _webrtcvad.Vad(vad_aggressiveness)
            except Exception as exc:
                logger.warning("Failed to initialise WebRTC VAD: %s", exc)

        # State
        self._consecutive_noise = 0
        self._consecutive_speech = 0
        self._recent_rms: list[float] = []
        self._baseline_rms: float | None = None
        self._baseline_init_chunks = 0
        self._baseline_stable = False

    # ── Primary: WebRTC VAD ────────────────────────────────────────────────────
    def _webrtc_speech_ratio(self, audio_bytes: bytes) -> float | None:
        """Return fraction of 30 ms frames classified as speech by WebRTC VAD.

        Returns None if audio can't be processed (wrong length / sample rate).
        """
        if self._vad is None:
            return None
        # Only process audio at 16 000 Hz
        if self.sample_rate != _VAD_SAMPLE_RATE:
            return None
        speech_frames = 0
        total_frames = 0
        for i in range(0, len(audio_bytes) - _VAD_FRAME_BYTES + 1, _VAD_FRAME_BYTES):
            frame = audio_bytes[i: i + _VAD_FRAME_BYTES]
            if len(frame) == _VAD_FRAME_BYTES:
                try:
                    if self._vad.is_speech(frame, _VAD_SAMPLE_RATE):
                        speech_frames += 1
                    total_frames += 1
                except Exception:
                    pass
        if total_frames == 0:
            return None
        return speech_frames / total_frames

    # ── Fallback: spectral VAD ─────────────────────────────────────────────────
    def _spectral_speech_check(self, pcm: np.ndarray, rms: float) -> bool:
        zcr = float(np.mean(np.abs(np.diff(np.signbit(pcm)).astype(np.float32))))
        band_ratio = _speech_band_ratio(pcm, self.sample_rate)
        baseline = max(self._baseline_rms or 0.0, 1e-4)
        speech_threshold = max(self.speech_min_rms, baseline * self.speech_baseline_multiplier)
        return (
            rms >= speech_threshold
            and 0.01 <= zcr <= 0.20
            and band_ratio >= _SPEECH_BAND_RATIO_MIN
        )

    def process(self, audio_bytes: bytes, sample_rate: int | None = None) -> dict | None:
        if not audio_bytes or len(audio_bytes) < 4:
            return None

        # Accept client-reported sample rate only on the first chunk, then lock it
        if sample_rate is not None:
            sr = int(sample_rate)
            if not self._sample_rate_locked:
                if 8000 <= sr <= 96000:
                    self.sample_rate = sr
                    self._client_sample_rate = sr
                else:
                    logger.warning("Rejected invalid initial sample rate %d Hz — keeping %d Hz", sr, self.sample_rate)
                self._sample_rate_locked = True
            elif sr != self._client_sample_rate:
                logger.warning("Ignoring sample rate change %d→%d Hz mid-session (locked at first value)", sr, self._client_sample_rate)

        try:
            pcm_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
            # Resample to 16 kHz if needed (WebRTC VAD requires exactly 16 kHz).
            # Always check _client_sample_rate (immutable) so resampling runs on
            # every chunk, not just the first one.
            if self._client_sample_rate != _VAD_SAMPLE_RATE and self._client_sample_rate > 0:
                ratio = _VAD_SAMPLE_RATE / self._client_sample_rate
                new_len = max(1, int(len(pcm_int16) * ratio))
                indices = np.linspace(0, len(pcm_int16) - 1, new_len).astype(int)
                pcm_int16 = pcm_int16[indices]
                # Rebuild raw bytes at 16 kHz for WebRTC VAD
                audio_bytes = pcm_int16.tobytes()
                self.sample_rate = _VAD_SAMPLE_RATE
            pcm = pcm_int16.astype(np.float32) / 32768.0
        except Exception:
            return None
        if pcm.size == 0:
            return None

        rms = float(np.sqrt(np.mean(pcm ** 2)))
        peak = float(np.max(np.abs(pcm)))

        # Adaptive baseline
        self._recent_rms.append(rms)
        if len(self._recent_rms) > self.window:
            self._recent_rms.pop(0)
        if self._baseline_rms is None:
            self._baseline_rms = rms
        elif rms < self.noise_threshold:
            alpha = 0.1 if not self._baseline_stable else 0.05
            self._baseline_rms = self._baseline_rms * (1 - alpha) + rms * alpha
            self._baseline_init_chunks += 1
            if self._baseline_init_chunks >= 30:
                self._baseline_stable = True
        else:
            self._baseline_rms = self._baseline_rms * 0.98 + min(rms, self._baseline_rms * 1.5) * 0.02

        # ── Loud audio burst ──────────────────────────────────────────────────
        if rms > self.noise_threshold:
            self._consecutive_noise += 1
            if self._consecutive_noise >= self.consecutive_threshold:
                self._consecutive_noise = 0
                self._consecutive_speech = 0
                return {
                    "event_type": "LOUD_AUDIO",
                    "severity": "LOW",
                    "detail": f"Loud audio detected (rms={rms:.3f})",
                    "confidence": min(0.99, rms / self.noise_threshold),
                }
        else:
            self._consecutive_noise = 0

        # ── Speech detection: WebRTC VAD (primary) ────────────────────────────
        speech_ratio = self._webrtc_speech_ratio(audio_bytes)

        if speech_ratio is not None:
            # WebRTC VAD path — highly accurate
            speech_like = speech_ratio >= _VAD_SPEECH_RATIO_THRESHOLD
        else:
            # Spectral fallback
            speech_like = self._spectral_speech_check(pcm, rms)

        if speech_like:
            self._consecutive_speech += 1
            if self._consecutive_speech >= self.speech_consecutive_chunks:
                self._consecutive_speech = 0
                method = "webrtcvad" if (speech_ratio is not None) else "spectral"
                detail = (
                    f"Sustained speech detected ({speech_ratio:.0%} of frames, method={method})"
                    if speech_ratio is not None
                    else f"Sustained speech-like audio (rms={rms:.3f}, method={method})"
                )
                return {
                    "event_type": "AUDIO_ANOMALY",
                    "severity": "MEDIUM",
                    "detail": detail,
                    "confidence": min(0.99, max(speech_ratio or rms, peak)),
                    "meta": {
                        "rms": rms,
                        "speech_ratio": speech_ratio,
                        "method": method,
                    },
                }
        else:
            self._consecutive_speech = 0

        return None
