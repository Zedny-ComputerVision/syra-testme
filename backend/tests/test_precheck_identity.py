from __future__ import annotations

from app.api.routes import precheck
from app.services import exam_compat_service, normalized_relations


def test_id_face_threshold_caps_legacy_lenient_values() -> None:
    assert precheck._resolve_id_face_threshold("deepface", "deepface", 0.60) == 0.42
    assert precheck._resolve_id_face_threshold("mediapipe", "mediapipe", 0.55) == 0.25


def test_id_face_threshold_rejects_low_confidence_fallback_modes() -> None:
    assert precheck._resolve_id_face_threshold("haar", "haar", 0.42) is None
    assert precheck._resolve_id_face_threshold("deepface", "haar", 0.42) is None
    assert precheck._resolve_id_face_threshold("none", "mediapipe", 0.42) is None


def test_default_proctoring_uses_hardened_identity_threshold() -> None:
    assert normalized_relations.DEFAULT_PROCTORING["face_verify_id_threshold"] == 0.42
    assert exam_compat_service.DEFAULT_PROCTORING["face_verify_id_threshold"] == 0.42
