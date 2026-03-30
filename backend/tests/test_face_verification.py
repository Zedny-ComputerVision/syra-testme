from __future__ import annotations

import numpy as np

from app.detection import face_verification


def _unit_vec(index: int, length: int = 4096) -> list[float]:
    vec = np.zeros(length, dtype=np.float32)
    vec[index] = 1.0
    return vec.tolist()


def test_face_verifier_uses_haar_fallback_for_haar_baseline(monkeypatch) -> None:
    baseline = _unit_vec(0)
    mismatch = _unit_vec(1)
    verifier = face_verification.FaceVerifier(baseline=baseline, threshold=0.15, enabled=True)
    verifier._mesh = None

    live_vectors = [
        np.array(baseline, dtype=np.float32),
        np.array(mismatch, dtype=np.float32),
        np.array(mismatch, dtype=np.float32),
    ]

    def fake_haar_embedding(_frame):
        next_vec = live_vectors.pop(0)
        return next_vec.tolist()

    monkeypatch.setattr(face_verification, "_embedding_via_haar", fake_haar_embedding)

    dummy_frame = np.zeros((64, 64, 3), dtype=np.uint8)
    assert verifier.process_ndarray(dummy_frame) is None
    assert verifier.process_ndarray(dummy_frame) is None

    alert = verifier.process_ndarray(dummy_frame)

    assert alert is not None
    assert alert["event_type"] == "FACE_MISMATCH"
    assert alert["severity"] == "HIGH"
    assert alert["meta"]["method"] == "haar"


def test_face_verifier_skips_dimension_mismatch_gracefully() -> None:
    verifier = face_verification.FaceVerifier(baseline=_unit_vec(0), enabled=True)

    alert = verifier._compare_embedding(np.zeros(120, dtype=np.float32))

    assert alert is None


def test_face_verifier_emits_one_alert_per_mismatch_episode(monkeypatch) -> None:
    baseline = _unit_vec(0)
    mismatch = _unit_vec(1)
    verifier = face_verification.FaceVerifier(baseline=baseline, threshold=0.15, enabled=True)
    verifier._mesh = None

    live_vectors = [
        np.array(baseline, dtype=np.float32),
        np.array(mismatch, dtype=np.float32),
        np.array(mismatch, dtype=np.float32),
        np.array(mismatch, dtype=np.float32),
        np.array(baseline, dtype=np.float32),
    ]

    def fake_haar_embedding(_frame):
        next_vec = live_vectors.pop(0)
        return next_vec.tolist()

    monkeypatch.setattr(face_verification, "_embedding_via_haar", fake_haar_embedding)

    dummy_frame = np.zeros((64, 64, 3), dtype=np.uint8)
    assert verifier.process_ndarray(dummy_frame) is None
    assert verifier.process_ndarray(dummy_frame) is None

    alert = verifier.process_ndarray(dummy_frame)
    assert alert is not None
    assert alert["event_type"] == "FACE_MISMATCH"

    # A continuous mismatch stretch should not keep re-emitting the same alert.
    assert verifier.process_ndarray(dummy_frame) is None

    recovered = verifier.process_ndarray(dummy_frame)
    assert recovered is not None
    assert recovered["event_type"] == "FACE_MATCH_RECOVERED"


def test_face_verifier_confirms_deepface_mismatch_with_aligned_retry(monkeypatch) -> None:
    baseline = np.zeros(512, dtype=np.float32)
    baseline[0] = 1.0
    monkeypatch.setattr(face_verification, "_get_deepface_class", lambda: object())
    verifier = face_verification.FaceVerifier(baseline=baseline.tolist(), enabled=True)
    verifier._mesh = None

    mismatch = np.zeros(512, dtype=np.float32)
    mismatch[1] = 1.0

    def fake_deepface_embedding(_frame, *, detector_backend="skip"):
        if detector_backend == "opencv":
            return baseline.tolist()
        return mismatch.tolist()

    monkeypatch.setattr(face_verification, "_embedding_via_deepface", fake_deepface_embedding)

    dummy_frame = np.zeros((64, 64, 3), dtype=np.uint8)
    assert verifier.process_ndarray(dummy_frame) is None
    assert verifier.process_ndarray(dummy_frame) is None
    assert verifier.process_ndarray(dummy_frame) is None
