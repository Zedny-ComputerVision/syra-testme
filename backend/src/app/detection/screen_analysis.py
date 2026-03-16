"""Screen content analysis via OCR.

Runs Tesseract OCR on screen captures to detect forbidden content:
  - Remote desktop / VNC software (TeamViewer, AnyDesk, RDP, Parsec…)
  - AI/cheating sites (ChatGPT, Chegg, Brainly, WolframAlpha…)
  - Code editors / IDEs that shouldn't be open during an exam

OCR is applied to a downscaled grayscale image for speed.  The full
1280-wide capture is processed via PSM-11 (sparse text) so partial
window titles in the task-bar are still caught.

Latency: ~150–400 ms on a modern CPU (Tesseract 5 LSTM).
"""

from __future__ import annotations

import logging

import cv2
import numpy as np
from typing import Optional

logger = logging.getLogger(__name__)

# ── Keyword lists ──────────────────────────────────────────────────────────────

_REMOTE_DESKTOP_KEYWORDS = [
    "teamviewer", "anydesk", "vnc viewer", "vnc connect", "remote desktop",
    "logmein", "splashtop", "chrome remote desktop", "parsec", "rustdesk",
    "ultraviewer", "ammyy", "remote utilities",
]

_FORBIDDEN_SITE_KEYWORDS = [
    "chatgpt", "claude.ai", "claude ", "gemini ", "bard.google", "copilot",
    "chegg", "coursehero", "course hero", "brainly", "quizlet", "quizizz",
    "wolframalpha", "wolfram alpha", "photomath", "mathway", "slader",
    "studocu", "scribd", "pastebin", "hastebin", "pastecode",
]

_CODE_EDITOR_KEYWORDS = [
    "visual studio code", "vscode", "pycharm", "intellij idea", "eclipse ide",
    "jupyter notebook", "jupyter lab", "anaconda", "spyder", "sublime text",
    "notepad++", "atom editor", "code::blocks", "dev-c++",
]

# ── Tesseract availability ─────────────────────────────────────────────────────
_tesseract_available = False
try:
    import pytesseract as _tess
    # Quick smoke test
    _tess.get_tesseract_version()
    _tesseract_available = True
    logger.info("pytesseract available — screen content analysis enabled")
except Exception as _e:
    logger.warning("pytesseract unavailable (%s) — screen content analysis disabled", _e)


def analyze_screen(frame_bgr: np.ndarray) -> Optional[dict]:
    """OCR a screen frame and return an alert dict if forbidden content found.

    Returns None if nothing suspicious is detected or Tesseract is unavailable.
    """
    if not _tesseract_available:
        return None
    try:
        h, w = frame_bgr.shape[:2]
        # Downscale to max 1280 px wide; keeps OCR fast while preserving text
        scale = min(1.0, 1280.0 / max(w, 1))
        if scale < 1.0:
            frame_bgr = cv2.resize(
                frame_bgr,
                (int(w * scale), int(h * scale)),
                interpolation=cv2.INTER_AREA,
            )
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        # PSM 11 = sparse text; OEM 3 = LSTM neural net
        text: str = _tess.image_to_string(gray, config="--psm 11 --oem 3").lower()

        for kw in _REMOTE_DESKTOP_KEYWORDS:
            if kw in text:
                return {
                    "event_type": "REMOTE_DESKTOP_DETECTED",
                    "severity": "HIGH",
                    "detail": f"Remote desktop software detected on screen: '{kw}'",
                    "confidence": 0.92,
                    "meta": {"keyword": kw},
                }

        for kw in _FORBIDDEN_SITE_KEYWORDS:
            if kw in text:
                return {
                    "event_type": "FORBIDDEN_CONTENT",
                    "severity": "HIGH",
                    "detail": f"Forbidden website / AI tool detected on screen: '{kw}'",
                    "confidence": 0.90,
                    "meta": {"keyword": kw},
                }

        for kw in _CODE_EDITOR_KEYWORDS:
            if kw in text:
                return {
                    "event_type": "FORBIDDEN_APPLICATION",
                    "severity": "MEDIUM",
                    "detail": f"Code editor / IDE detected on screen: '{kw}'",
                    "confidence": 0.85,
                    "meta": {"keyword": kw},
                }
    except Exception as exc:
        logger.debug("Screen analysis OCR failed: %s", exc)
    return None


def analyze_screen_bytes(frame_bytes: bytes) -> Optional[dict]:
    """Convenience wrapper: accept raw JPEG/PNG bytes."""
    np_arr = np.frombuffer(frame_bytes, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if frame is None:
        return None
    return analyze_screen(frame)
