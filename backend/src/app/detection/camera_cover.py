"""Camera-cover heuristics based on frame brightness, variance, and edge entropy.

Three-tier detection:
  hard_blocked  — average luma ≤ hard_luma (absolute darkness; almost certain cover)
  soft_blocked  — low luma AND low variance (uniform dark surface)
  edge_blocked  — very low edge-response entropy (catches solid-colour covers that are
                  not pitch-black, e.g. grey cloth, tape, or dark sticky notes)
"""

from __future__ import annotations

import cv2
import numpy as np


def analyze_camera_cover(
    frame: np.ndarray,
    *,
    hard_luma: float = 30.0,
    soft_luma: float = 55.0,
    stddev_max: float = 22.0,
    edge_entropy_min: float = 1.5,
) -> dict[str, float | bool]:
    """Return luma/stddev stats plus cover-detection flags.

    Parameters
    ----------
    hard_luma:
        Luma threshold for definite cover (raised from 20 → 30 to catch dark cloth).
    soft_luma:
        Luma threshold for the soft-block check (raised from 40 → 55).
    stddev_max:
        Maximum pixel-value std-dev for soft-block (raised from 16 → 22).
    edge_entropy_min:
        Minimum Shannon entropy of the Canny edge response.  Frames showing a real
        person/room have entropy ≥ 2.0; a covered camera produces near-zero entropy.
    """
    if frame is None or frame.size == 0:
        return {
            "avg_luma": 255.0,
            "stddev": 64.0,
            "edge_entropy": 8.0,
            "hard_blocked": False,
            "soft_blocked": False,
            "edge_blocked": False,
        }

    # Downsample for speed
    sample = frame
    if frame.shape[0] > 96 or frame.shape[1] > 96:
        sample = cv2.resize(frame, (96, 96), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(sample, cv2.COLOR_BGR2GRAY)

    avg_luma_arr, stddev_arr = cv2.meanStdDev(gray)
    avg_luma_value = float(avg_luma_arr[0][0])
    stddev_value = float(stddev_arr[0][0])

    hard_blocked = avg_luma_value <= hard_luma
    soft_blocked = hard_blocked or (avg_luma_value <= soft_luma and stddev_value <= stddev_max)

    # Edge-entropy check — catches covers that are slightly bright or textured but
    # still block the view (e.g. sticky note, grey cardboard, semi-opaque tape).
    edge_sample = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA)
    edges = cv2.Canny(edge_sample, threshold1=30, threshold2=80)
    edge_pixels = edges.ravel()
    n_edge = int(np.count_nonzero(edge_pixels))
    n_total = edge_pixels.size
    if n_total > 0 and 0 < n_edge < n_total:
        p = n_edge / n_total
        edge_entropy = float(-(p * np.log2(p) + (1 - p) * np.log2(1 - p)))
    else:
        edge_entropy = 0.0  # All-black or all-white → zero entropy → blocked

    # Only flag edge_blocked when the frame is also noticeably dark (luma < 90),
    # to avoid false-positives on plain white walls or blank backgrounds.
    edge_blocked = (avg_luma_value < 90.0) and (edge_entropy < edge_entropy_min)

    return {
        "avg_luma": avg_luma_value,
        "stddev": stddev_value,
        "edge_entropy": edge_entropy,
        "hard_blocked": hard_blocked,
        "soft_blocked": soft_blocked or edge_blocked,
        "edge_blocked": edge_blocked,
    }
