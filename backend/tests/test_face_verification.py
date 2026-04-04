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


def test_face_verifier_flags_dimension_mismatch_as_alert() -> None:
    """Dimension mismatch between baseline and live embedding is treated as a
    high-severity FACE_MISMATCH because it means identity cannot be verified."""
    verifier = face_verification.FaceVerifier(baseline=_unit_vec(0), enabled=True)

    alert = verifier._compare_embedding(np.zeros(120, dtype=np.float32))

    assert alert is not None
    assert alert["event_type"] == "FACE_MISMATCH"
    assert alert["severity"] == "HIGH"
    assert "dimension mismatch" in alert["detail"].lower()


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


def test_face_verifier_deepface_uses_opencv_backend(monkeypatch) -> None:
    """Live embeddings must use detector_backend='opencv' so they match enrollment."""
    baseline = np.zeros(512, dtype=np.float32)
    baseline[0] = 1.0
    monkeypatch.setattr(face_verification, "_get_deepface_class", lambda: object())
    verifier = face_verification.FaceVerifier(baseline=baseline.tolist(), enabled=True)
    verifier._mesh = None

    used_backends: list[str] = []

    def fake_deepface_embedding(_frame, *, detector_backend="skip"):
        used_backends.append(detector_backend)
        return baseline.tolist()

    monkeypatch.setattr(face_verification, "_embedding_via_deepface", fake_deepface_embedding)

    dummy_frame = np.zeros((64, 64, 3), dtype=np.uint8)
    verifier.process_ndarray(dummy_frame)

    assert used_backends == ["opencv"], f"Expected opencv backend, got {used_backends}"


def test_face_verifier_deepface_match_no_alert(monkeypatch) -> None:
    """Same face with opencv backend should produce no alert."""
    baseline = np.zeros(512, dtype=np.float32)
    baseline[0] = 1.0
    monkeypatch.setattr(face_verification, "_get_deepface_class", lambda: object())
    verifier = face_verification.FaceVerifier(baseline=baseline.tolist(), enabled=True)
    verifier._mesh = None

    def fake_deepface_embedding(_frame, *, detector_backend="skip"):
        return baseline.tolist()

    monkeypatch.setattr(face_verification, "_embedding_via_deepface", fake_deepface_embedding)

    dummy_frame = np.zeros((64, 64, 3), dtype=np.uint8)
    assert verifier.process_ndarray(dummy_frame) is None
    assert verifier.process_ndarray(dummy_frame) is None
    assert verifier.process_ndarray(dummy_frame) is None
