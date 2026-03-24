import unittest
from types import SimpleNamespace

from .normalized_relations import (
    DEFAULT_PROCTORING,
    apply_runtime_attempt_policy_defaults,
    exam_proctoring,
    runtime_attempt_policy_conflicts,
    set_exam_proctoring,
)


class ExamProctoringSerializationTest(unittest.TestCase):
    def test_set_exam_proctoring_preserves_json_only_runtime_fields(self):
        exam = SimpleNamespace(proctoring_config=None, proctoring_config_rel=None)

        set_exam_proctoring(
            exam,
            {
                "max_face_absence_sec": 1.5,
                "frame_interval_ms": 900,
                "audio_chunk_ms": 2000,
                "audio_speech_consecutive_chunks": 3,
                "audio_speech_min_rms": 0.04,
                "audio_speech_baseline_multiplier": 1.5,
                "multi_face_min_area_ratio": 0.012,
                "camera_cover_hard_luma": 18.0,
                "camera_cover_soft_luma": 36.0,
                "camera_cover_stddev_max": 14.0,
                "camera_cover_hard_consecutive_frames": 1,
                "camera_cover_soft_consecutive_frames": 2,
            },
        )

        self.assertEqual(exam.proctoring_config["audio_speech_consecutive_chunks"], 3)
        self.assertEqual(exam.proctoring_config["audio_speech_min_rms"], 0.04)
        self.assertEqual(exam.proctoring_config["audio_speech_baseline_multiplier"], 1.5)
        self.assertEqual(exam.proctoring_config["multi_face_min_area_ratio"], 0.012)
        self.assertEqual(exam.proctoring_config["camera_cover_hard_luma"], 18.0)
        self.assertEqual(exam.proctoring_config["camera_cover_soft_luma"], 36.0)
        self.assertEqual(exam.proctoring_config["camera_cover_stddev_max"], 14.0)
        self.assertEqual(exam.proctoring_config["camera_cover_hard_consecutive_frames"], 1)
        self.assertEqual(exam.proctoring_config["camera_cover_soft_consecutive_frames"], 2)

    def test_exam_proctoring_applies_defaults_for_relation_only_rows(self):
        exam = SimpleNamespace(proctoring_config=None, proctoring_config_rel=SimpleNamespace(
            face_detection=True,
            multi_face=True,
            audio_detection=True,
            object_detection=True,
            eye_tracking=True,
            head_pose_detection=True,
            mouth_detection=False,
            face_verify=True,
            fullscreen_enforce=True,
            tab_switch_detect=True,
            screen_capture=False,
            copy_paste_block=True,
            eye_deviation_deg=12,
            mouth_open_threshold=0.35,
            audio_rms_threshold=0.08,
            max_face_absence_sec=1,
            max_tab_blurs=3,
            max_alerts_before_autosubmit=5,
            max_fullscreen_exits=2,
            max_alt_tabs=3,
            lighting_min_score=0.35,
            face_verify_id_threshold=0.55,
            max_score_before_autosubmit=15,
            frame_interval_ms=900,
            audio_chunk_ms=2000,
            screenshot_interval_sec=60,
            face_verify_threshold=0.15,
            cheating_consecutive_frames=5,
            head_pose_consecutive=5,
            eye_consecutive=5,
            object_confidence_threshold=0.5,
            audio_consecutive_chunks=2,
            audio_window=5,
            head_pose_yaw_deg=20,
            head_pose_pitch_deg=20,
            head_pitch_min_rad=-0.3,
            head_pitch_max_rad=0.2,
            head_yaw_min_rad=-0.6,
            head_yaw_max_rad=0.6,
            eye_pitch_min_rad=-0.5,
            eye_pitch_max_rad=0.2,
            eye_yaw_min_rad=-0.5,
            eye_yaw_max_rad=0.5,
            pose_change_threshold_rad=0.1,
            eye_change_threshold_rad=0.2,
            identity_required=True,
            camera_required=True,
            mic_required=True,
            fullscreen_required=True,
            lighting_required=True,
            access_mode=None,
            alert_rules=[],
        ))

        serialized = exam_proctoring(exam)

        self.assertEqual(serialized["audio_speech_consecutive_chunks"], DEFAULT_PROCTORING["audio_speech_consecutive_chunks"])
        self.assertEqual(serialized["audio_speech_min_rms"], DEFAULT_PROCTORING["audio_speech_min_rms"])
        self.assertEqual(serialized["audio_speech_baseline_multiplier"], DEFAULT_PROCTORING["audio_speech_baseline_multiplier"])
        self.assertEqual(serialized["multi_face_min_area_ratio"], DEFAULT_PROCTORING["multi_face_min_area_ratio"])
        self.assertEqual(serialized["camera_cover_hard_luma"], DEFAULT_PROCTORING["camera_cover_hard_luma"])
        self.assertEqual(serialized["camera_cover_soft_luma"], DEFAULT_PROCTORING["camera_cover_soft_luma"])
        self.assertEqual(serialized["camera_cover_stddev_max"], DEFAULT_PROCTORING["camera_cover_stddev_max"])
        self.assertEqual(serialized["camera_cover_hard_consecutive_frames"], DEFAULT_PROCTORING["camera_cover_hard_consecutive_frames"])
        self.assertEqual(serialized["camera_cover_soft_consecutive_frames"], DEFAULT_PROCTORING["camera_cover_soft_consecutive_frames"])

    def test_exam_proctoring_preserves_raw_stub_config_without_injecting_defaults(self):
        exam = SimpleNamespace(
            proctoring_config={
                "fullscreen_required": True,
                "camera_required": False,
                "mic_required": False,
                "identity_required": False,
            },
            proctoring_config_rel=None,
        )

        serialized = exam_proctoring(exam)

        self.assertTrue(serialized["fullscreen_required"])
        self.assertFalse(serialized["camera_required"])
        self.assertFalse(serialized["mic_required"])
        self.assertFalse(serialized["identity_required"])
        self.assertEqual(serialized["alert_rules"], [])
        self.assertNotIn("screen_capture", serialized)


class ExamRuntimeAttemptPolicyTest(unittest.TestCase):
    def test_multi_attempt_payload_defaults_retakes_on(self):
        normalized = apply_runtime_attempt_policy_defaults({}, 3)

        self.assertTrue(normalized["allow_retake"])

    def test_explicit_locked_retakes_conflict_with_multi_attempt_policy(self):
        self.assertTrue(runtime_attempt_policy_conflicts({"allow_retake": False}, 3))
        self.assertFalse(runtime_attempt_policy_conflicts({"allow_retake": True}, 3))
        self.assertFalse(runtime_attempt_policy_conflicts({"allow_retake": False}, 1))


if __name__ == "__main__":
    unittest.main()
