"""normalize legacy JSON relationships

Revision ID: 202603101735
Revises: 202603092345
Create Date: 2026-03-10 17:35:00
"""

from __future__ import annotations

import uuid
from datetime import datetime

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "202603101735"
down_revision = "202603092345"
branch_labels = None
depends_on = None


DEFAULT_SECURITY_SETTINGS = {
    "fullscreen_required": True,
    "tab_switch_detect": True,
    "camera_required": True,
    "mic_required": False,
    "violation_threshold_warn": 3,
    "violation_threshold_autosubmit": 6,
}

DEFAULT_UI_COLUMNS = ["name", "code", "type", "status", "time_limit_minutes", "testing_sessions"]

DEFAULT_PROCTORING = {
    "face_detection": True,
    "multi_face": True,
    "audio_detection": True,
    "object_detection": True,
    "eye_tracking": True,
    "head_pose_detection": True,
    "mouth_detection": False,
    "face_verify": True,
    "fullscreen_enforce": True,
    "tab_switch_detect": True,
    "screen_capture": False,
    "copy_paste_block": True,
    "alert_rules": [],
    "eye_deviation_deg": 12,
    "mouth_open_threshold": 0.35,
    "audio_rms_threshold": 0.08,
    "max_face_absence_sec": 5,
    "max_tab_blurs": 3,
    "max_alerts_before_autosubmit": 5,
    "max_fullscreen_exits": 2,
    "max_alt_tabs": 3,
    "lighting_min_score": 0.35,
    "face_verify_id_threshold": 0.18,
    "max_score_before_autosubmit": 15,
    "frame_interval_ms": 3000,
    "audio_chunk_ms": 3000,
    "screenshot_interval_sec": 60,
    "face_verify_threshold": 0.15,
    "cheating_consecutive_frames": 5,
    "head_pose_consecutive": 5,
    "eye_consecutive": 5,
    "object_confidence_threshold": 0.5,
    "audio_consecutive_chunks": 2,
    "audio_window": 5,
    "head_pose_yaw_deg": 20,
    "head_pose_pitch_deg": 20,
    "head_pitch_min_rad": -0.3,
    "head_pitch_max_rad": 0.2,
    "head_yaw_min_rad": -0.6,
    "head_yaw_max_rad": 0.6,
    "eye_pitch_min_rad": -0.5,
    "eye_pitch_max_rad": 0.2,
    "eye_yaw_min_rad": -0.5,
    "eye_yaw_max_rad": 0.5,
    "pose_change_threshold_rad": 0.1,
    "eye_change_threshold_rad": 0.2,
    "identity_required": True,
    "camera_required": True,
    "mic_required": True,
    "fullscreen_required": True,
    "lighting_required": True,
}

PROCTORING_SCALAR_FIELDS = [
    "face_detection",
    "multi_face",
    "audio_detection",
    "object_detection",
    "eye_tracking",
    "head_pose_detection",
    "mouth_detection",
    "face_verify",
    "fullscreen_enforce",
    "tab_switch_detect",
    "screen_capture",
    "copy_paste_block",
    "eye_deviation_deg",
    "mouth_open_threshold",
    "audio_rms_threshold",
    "max_face_absence_sec",
    "max_tab_blurs",
    "max_alerts_before_autosubmit",
    "max_fullscreen_exits",
    "max_alt_tabs",
    "lighting_min_score",
    "face_verify_id_threshold",
    "max_score_before_autosubmit",
    "frame_interval_ms",
    "audio_chunk_ms",
    "screenshot_interval_sec",
    "face_verify_threshold",
    "cheating_consecutive_frames",
    "head_pose_consecutive",
    "eye_consecutive",
    "object_confidence_threshold",
    "audio_consecutive_chunks",
    "audio_window",
    "head_pose_yaw_deg",
    "head_pose_pitch_deg",
    "head_pitch_min_rad",
    "head_pitch_max_rad",
    "head_yaw_min_rad",
    "head_yaw_max_rad",
    "eye_pitch_min_rad",
    "eye_pitch_max_rad",
    "eye_yaw_min_rad",
    "eye_yaw_max_rad",
    "pose_change_threshold_rad",
    "eye_change_threshold_rad",
    "identity_required",
    "camera_required",
    "mic_required",
    "fullscreen_required",
    "lighting_required",
    "access_mode",
]

RUNTIME_SCALAR_FIELDS = [
    "instructions",
    "instructions_heading",
    "instructions_body",
    "completion_message",
    "instructions_require_acknowledgement",
    "show_test_instructions",
    "show_score_report",
    "show_answer_review",
    "show_correct_answers",
    "allow_retake",
    "retake_cooldown_hours",
    "auto_logout_after_finish_or_pause",
    "creation_method",
    "score_report_include_certificate_status",
]

RUNTIME_COMPLEX_FIELDS = {"instructions_list", "test_translations"}

RUNTIME_DEFAULTS = {
    "instructions_require_acknowledgement": False,
    "show_test_instructions": True,
    "show_score_report": False,
    "show_answer_review": False,
    "show_correct_answers": False,
    "allow_retake": False,
    "auto_logout_after_finish_or_pause": False,
    "score_report_include_certificate_status": False,
}


def _uuid_type(is_pg: bool):
    return postgresql.UUID(as_uuid=True) if is_pg else sa.String(length=36)


def _json_type(is_pg: bool):
    return postgresql.JSONB(astext_type=sa.Text()) if is_pg else sa.JSON()


def _table_names(inspector) -> set[str]:
    return set(inspector.get_table_names())


def _column_names(inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _foreign_key_names(inspector, table_name: str) -> set[str]:
    return {fk["name"] for fk in inspector.get_foreign_keys(table_name)}


def _uuid_value(is_pg: bool):
    value = uuid.uuid4()
    return value if is_pg else str(value)


def _coerce_uuid(value, is_pg: bool):
    if value in {None, ""}:
        return None
    try:
        parsed = uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return None
    return parsed if is_pg else str(parsed)


def _coerce_datetime(value):
    if value in {None, ""}:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None


def _flatten_runtime_setting(exam_id, path: str, value, is_pg: bool) -> list[dict]:
    if not path:
        return []
    base = {
        "exam_id": exam_id,
        "string_value": None,
        "integer_value": None,
        "float_value": None,
        "boolean_value": None,
    }
    if isinstance(value, dict):
        rows = [{**base, "id": _uuid_value(is_pg), "path": path, "value_type": "OBJECT"}]
        for key, child_value in value.items():
            rows.extend(_flatten_runtime_setting(exam_id, f"{path}.{key}", child_value, is_pg))
        return rows
    if isinstance(value, list):
        rows = [{**base, "id": _uuid_value(is_pg), "path": path, "value_type": "ARRAY"}]
        for index, child_value in enumerate(value):
            rows.extend(_flatten_runtime_setting(exam_id, f"{path}.{index}", child_value, is_pg))
        return rows
    if value is None:
        return [{**base, "id": _uuid_value(is_pg), "path": path, "value_type": "NULL"}]
    if isinstance(value, bool):
        return [{**base, "id": _uuid_value(is_pg), "path": path, "value_type": "BOOLEAN", "boolean_value": value}]
    if isinstance(value, int) and not isinstance(value, bool):
        return [{**base, "id": _uuid_value(is_pg), "path": path, "value_type": "INTEGER", "integer_value": value}]
    if isinstance(value, float):
        return [{**base, "id": _uuid_value(is_pg), "path": path, "value_type": "FLOAT", "float_value": value}]
    return [{**base, "id": _uuid_value(is_pg), "path": path, "value_type": "STRING", "string_value": str(value)}]


def _flatten_runtime_extra_settings(exam_id, payload, is_pg: bool) -> list[dict]:
    rows: list[dict] = []
    for key, value in (payload or {}).items():
        rows.extend(_flatten_runtime_setting(exam_id, str(key), value, is_pg))
    return rows


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = _table_names(inspector)
    is_pg = bind.dialect.name == "postgresql"
    uuid_type = _uuid_type(is_pg)
    json_type = _json_type(is_pg)
    true_default = sa.text("true" if is_pg else "1")
    false_default = sa.text("false" if is_pg else "0")

    if "exams" in table_names:
        exam_columns = _column_names(inspector, "exams")
        if "library_pool_id" not in exam_columns:
            op.add_column("exams", sa.Column("library_pool_id", uuid_type, nullable=True))
            inspector = sa.inspect(bind)
        exam_indexes = _index_names(inspector, "exams")
        if "ix_exams_library_pool_id" not in exam_indexes:
            op.create_index("ix_exams_library_pool_id", "exams", ["library_pool_id"], unique=False)
            inspector = sa.inspect(bind)
        exam_fks = _foreign_key_names(inspector, "exams")
        if "fk_exams_library_pool_id_question_pools" not in exam_fks:
            op.create_foreign_key(
                "fk_exams_library_pool_id_question_pools",
                "exams",
                "question_pools",
                ["library_pool_id"],
                ["id"],
                ondelete="SET NULL",
            )
            inspector = sa.inspect(bind)

    table_names = _table_names(inspector)

    if "survey_questions" not in table_names:
        op.create_table(
            "survey_questions",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("survey_id", uuid_type, sa.ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("text", sa.String(length=2048), nullable=False),
            sa.Column("question_type", sa.String(length=64), nullable=False),
            sa.UniqueConstraint("survey_id", "position", name="uq_survey_question_position"),
        )

    if "survey_question_options" not in table_names:
        op.create_table(
            "survey_question_options",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("survey_question_id", uuid_type, sa.ForeignKey("survey_questions.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("text", sa.String(length=1024), nullable=False),
            sa.UniqueConstraint("survey_question_id", "position", name="uq_survey_question_option_position"),
        )

    if "user_group_members" not in table_names:
        op.create_table(
            "user_group_members",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("group_id", uuid_type, sa.ForeignKey("user_groups.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("group_id", "user_id", name="uq_user_group_member_group_user"),
            sa.UniqueConstraint("group_id", "position", name="uq_user_group_member_group_position"),
        )

    if "exam_admin_configs" not in table_names:
        op.create_table(
            "exam_admin_configs",
            sa.Column("exam_id", uuid_type, sa.ForeignKey("exams.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("code", sa.String(length=32), unique=True, nullable=True),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("randomize_questions", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("report_displayed", sa.String(length=64), nullable=False, server_default="IMMEDIATELY_AFTER_GRADING"),
            sa.Column("report_content", sa.String(length=64), nullable=False, server_default="SCORE_AND_DETAILS"),
            sa.Column("fullscreen_required", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("tab_switch_detect", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("camera_required", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("mic_required", sa.Boolean(), nullable=False, server_default=false_default),
            sa.Column("violation_threshold_warn", sa.Integer(), nullable=False, server_default="3"),
            sa.Column("violation_threshold_autosubmit", sa.Integer(), nullable=False, server_default="6"),
        )

    if "exam_ui_columns" not in table_names:
        op.create_table(
            "exam_ui_columns",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("exam_id", uuid_type, sa.ForeignKey("exam_admin_configs.exam_id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("column_key", sa.String(length=128), nullable=False),
            sa.UniqueConstraint("exam_id", "position", name="uq_exam_ui_column_position"),
        )

    if "exam_runtime_configs" not in table_names:
        op.create_table(
            "exam_runtime_configs",
            sa.Column("exam_id", uuid_type, sa.ForeignKey("exams.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("instructions", sa.String(length=4000), nullable=True),
            sa.Column("instructions_heading", sa.String(length=512), nullable=True),
            sa.Column("instructions_body", sa.String(length=8000), nullable=True),
            sa.Column("completion_message", sa.String(length=4000), nullable=True),
            sa.Column("instructions_require_acknowledgement", sa.Boolean(), nullable=False, server_default=false_default),
            sa.Column("show_test_instructions", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("show_score_report", sa.Boolean(), nullable=False, server_default=false_default),
            sa.Column("show_answer_review", sa.Boolean(), nullable=False, server_default=false_default),
            sa.Column("show_correct_answers", sa.Boolean(), nullable=False, server_default=false_default),
            sa.Column("allow_retake", sa.Boolean(), nullable=False, server_default=false_default),
            sa.Column("retake_cooldown_hours", sa.Float(), nullable=True),
            sa.Column("auto_logout_after_finish_or_pause", sa.Boolean(), nullable=False, server_default=false_default),
            sa.Column("creation_method", sa.String(length=128), nullable=True),
            sa.Column("score_report_include_certificate_status", sa.Boolean(), nullable=False, server_default=false_default),
        )

    if "exam_runtime_instruction_items" not in table_names:
        op.create_table(
            "exam_runtime_instruction_items",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("exam_id", uuid_type, sa.ForeignKey("exam_runtime_configs.exam_id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("text", sa.String(length=2048), nullable=False),
            sa.UniqueConstraint("exam_id", "position", name="uq_exam_runtime_instruction_item_position"),
        )

    if "exam_runtime_translations" not in table_names:
        op.create_table(
            "exam_runtime_translations",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("exam_id", uuid_type, sa.ForeignKey("exam_runtime_configs.exam_id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("locale", sa.String(length=32), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=True),
            sa.Column("description", sa.String(length=4000), nullable=True),
            sa.Column("instructions_body", sa.String(length=4000), nullable=True),
            sa.Column("completion_message", sa.String(length=4000), nullable=True),
            sa.UniqueConstraint("exam_id", "locale", name="uq_exam_runtime_translation_locale"),
        )

    if "exam_runtime_extra_settings" not in table_names:
        op.create_table(
            "exam_runtime_extra_settings",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("exam_id", uuid_type, sa.ForeignKey("exam_runtime_configs.exam_id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("path", sa.String(length=512), nullable=False),
            sa.Column("value_type", sa.String(length=16), nullable=False),
            sa.Column("string_value", sa.Text(), nullable=True),
            sa.Column("integer_value", sa.Integer(), nullable=True),
            sa.Column("float_value", sa.Float(), nullable=True),
            sa.Column("boolean_value", sa.Boolean(), nullable=True),
            sa.UniqueConstraint("exam_id", "path", name="uq_exam_runtime_extra_setting_path"),
        )

    if "exam_certificate_configs" not in table_names:
        op.create_table(
            "exam_certificate_configs",
            sa.Column("exam_id", uuid_type, sa.ForeignKey("exams.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("title", sa.String(length=255), nullable=True),
            sa.Column("subtitle", sa.String(length=512), nullable=True),
            sa.Column("issuer", sa.String(length=255), nullable=True),
            sa.Column("signer", sa.String(length=255), nullable=True),
        )

    if "exam_proctoring_configs" not in table_names:
        op.create_table(
            "exam_proctoring_configs",
            sa.Column("exam_id", uuid_type, sa.ForeignKey("exams.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("face_detection", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("multi_face", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("audio_detection", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("object_detection", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("eye_tracking", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("head_pose_detection", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("mouth_detection", sa.Boolean(), nullable=False, server_default=false_default),
            sa.Column("face_verify", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("fullscreen_enforce", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("tab_switch_detect", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("screen_capture", sa.Boolean(), nullable=False, server_default=false_default),
            sa.Column("copy_paste_block", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("eye_deviation_deg", sa.Float(), nullable=True),
            sa.Column("mouth_open_threshold", sa.Float(), nullable=True),
            sa.Column("audio_rms_threshold", sa.Float(), nullable=True),
            sa.Column("max_face_absence_sec", sa.Integer(), nullable=True),
            sa.Column("max_tab_blurs", sa.Integer(), nullable=True),
            sa.Column("max_alerts_before_autosubmit", sa.Integer(), nullable=True),
            sa.Column("max_fullscreen_exits", sa.Integer(), nullable=True),
            sa.Column("max_alt_tabs", sa.Integer(), nullable=True),
            sa.Column("lighting_min_score", sa.Float(), nullable=True),
            sa.Column("face_verify_id_threshold", sa.Float(), nullable=True),
            sa.Column("max_score_before_autosubmit", sa.Integer(), nullable=True),
            sa.Column("frame_interval_ms", sa.Integer(), nullable=True),
            sa.Column("audio_chunk_ms", sa.Integer(), nullable=True),
            sa.Column("screenshot_interval_sec", sa.Integer(), nullable=True),
            sa.Column("face_verify_threshold", sa.Float(), nullable=True),
            sa.Column("cheating_consecutive_frames", sa.Integer(), nullable=True),
            sa.Column("head_pose_consecutive", sa.Integer(), nullable=True),
            sa.Column("eye_consecutive", sa.Integer(), nullable=True),
            sa.Column("object_confidence_threshold", sa.Float(), nullable=True),
            sa.Column("audio_consecutive_chunks", sa.Integer(), nullable=True),
            sa.Column("audio_window", sa.Integer(), nullable=True),
            sa.Column("head_pose_yaw_deg", sa.Float(), nullable=True),
            sa.Column("head_pose_pitch_deg", sa.Float(), nullable=True),
            sa.Column("head_pitch_min_rad", sa.Float(), nullable=True),
            sa.Column("head_pitch_max_rad", sa.Float(), nullable=True),
            sa.Column("head_yaw_min_rad", sa.Float(), nullable=True),
            sa.Column("head_yaw_max_rad", sa.Float(), nullable=True),
            sa.Column("eye_pitch_min_rad", sa.Float(), nullable=True),
            sa.Column("eye_pitch_max_rad", sa.Float(), nullable=True),
            sa.Column("eye_yaw_min_rad", sa.Float(), nullable=True),
            sa.Column("eye_yaw_max_rad", sa.Float(), nullable=True),
            sa.Column("pose_change_threshold_rad", sa.Float(), nullable=True),
            sa.Column("eye_change_threshold_rad", sa.Float(), nullable=True),
            sa.Column("identity_required", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("camera_required", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("mic_required", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("fullscreen_required", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("lighting_required", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("access_mode", sa.String(length=64), nullable=True),
        )

    if "exam_proctoring_alert_rules" not in table_names:
        op.create_table(
            "exam_proctoring_alert_rules",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("exam_id", uuid_type, sa.ForeignKey("exam_proctoring_configs.exam_id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("rule_key", sa.String(length=128), nullable=True),
            sa.Column("event_type", sa.String(length=128), nullable=False),
            sa.Column("threshold", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("severity", sa.String(length=32), nullable=False, server_default="MEDIUM"),
            sa.Column("action", sa.String(length=32), nullable=False, server_default="WARN"),
            sa.Column("message", sa.String(length=2048), nullable=True),
            sa.UniqueConstraint("exam_id", "position", name="uq_exam_proctoring_alert_rule_position"),
        )

    refreshed_tables = _table_names(sa.inspect(bind))
    if "tests" in refreshed_tables and "test_ui_columns" not in refreshed_tables:
        op.create_table(
            "test_ui_columns",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("test_id", uuid_type, sa.ForeignKey("tests.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("column_key", sa.String(length=128), nullable=False),
            sa.UniqueConstraint("test_id", "position", name="uq_test_ui_column_position"),
        )

    surveys = sa.table("surveys", sa.column("id", uuid_type), sa.column("questions", json_type))
    survey_questions = sa.table(
        "survey_questions",
        sa.column("id", uuid_type),
        sa.column("survey_id", uuid_type),
        sa.column("position", sa.Integer()),
        sa.column("text", sa.String()),
        sa.column("question_type", sa.String()),
    )
    survey_question_options = sa.table(
        "survey_question_options",
        sa.column("id", uuid_type),
        sa.column("survey_question_id", uuid_type),
        sa.column("position", sa.Integer()),
        sa.column("text", sa.String()),
    )
    user_groups = sa.table("user_groups", sa.column("id", uuid_type), sa.column("member_ids", json_type))
    user_group_members = sa.table(
        "user_group_members",
        sa.column("id", uuid_type),
        sa.column("group_id", uuid_type),
        sa.column("user_id", uuid_type),
        sa.column("position", sa.Integer()),
    )
    exams = sa.table(
        "exams",
        sa.column("id", uuid_type),
        sa.column("settings", json_type),
        sa.column("proctoring_config", json_type),
        sa.column("certificate", json_type),
        sa.column("library_pool_id", uuid_type),
    )
    exam_admin_configs = sa.table(
        "exam_admin_configs",
        sa.column("exam_id", uuid_type),
        sa.column("code", sa.String()),
        sa.column("published_at", sa.DateTime(timezone=True)),
        sa.column("archived_at", sa.DateTime(timezone=True)),
        sa.column("randomize_questions", sa.Boolean()),
        sa.column("report_displayed", sa.String()),
        sa.column("report_content", sa.String()),
        sa.column("fullscreen_required", sa.Boolean()),
        sa.column("tab_switch_detect", sa.Boolean()),
        sa.column("camera_required", sa.Boolean()),
        sa.column("mic_required", sa.Boolean()),
        sa.column("violation_threshold_warn", sa.Integer()),
        sa.column("violation_threshold_autosubmit", sa.Integer()),
    )
    exam_ui_columns = sa.table(
        "exam_ui_columns",
        sa.column("id", uuid_type),
        sa.column("exam_id", uuid_type),
        sa.column("position", sa.Integer()),
        sa.column("column_key", sa.String()),
    )
    exam_runtime_configs = sa.table(
        "exam_runtime_configs",
        sa.column("exam_id", uuid_type),
        sa.column("instructions", sa.String()),
        sa.column("instructions_heading", sa.String()),
        sa.column("instructions_body", sa.String()),
        sa.column("completion_message", sa.String()),
        sa.column("instructions_require_acknowledgement", sa.Boolean()),
        sa.column("show_test_instructions", sa.Boolean()),
        sa.column("show_score_report", sa.Boolean()),
        sa.column("show_answer_review", sa.Boolean()),
        sa.column("show_correct_answers", sa.Boolean()),
        sa.column("allow_retake", sa.Boolean()),
        sa.column("retake_cooldown_hours", sa.Float()),
        sa.column("auto_logout_after_finish_or_pause", sa.Boolean()),
        sa.column("creation_method", sa.String()),
        sa.column("score_report_include_certificate_status", sa.Boolean()),
    )
    exam_runtime_instruction_items = sa.table(
        "exam_runtime_instruction_items",
        sa.column("id", uuid_type),
        sa.column("exam_id", uuid_type),
        sa.column("position", sa.Integer()),
        sa.column("text", sa.String()),
    )
    exam_runtime_translations = sa.table(
        "exam_runtime_translations",
        sa.column("id", uuid_type),
        sa.column("exam_id", uuid_type),
        sa.column("locale", sa.String()),
        sa.column("title", sa.String()),
        sa.column("description", sa.String()),
        sa.column("instructions_body", sa.String()),
        sa.column("completion_message", sa.String()),
    )
    exam_runtime_extra_settings = sa.table(
        "exam_runtime_extra_settings",
        sa.column("id", uuid_type),
        sa.column("exam_id", uuid_type),
        sa.column("path", sa.String()),
        sa.column("value_type", sa.String()),
        sa.column("string_value", sa.Text()),
        sa.column("integer_value", sa.Integer()),
        sa.column("float_value", sa.Float()),
        sa.column("boolean_value", sa.Boolean()),
    )
    exam_certificate_configs = sa.table(
        "exam_certificate_configs",
        sa.column("exam_id", uuid_type),
        sa.column("title", sa.String()),
        sa.column("subtitle", sa.String()),
        sa.column("issuer", sa.String()),
        sa.column("signer", sa.String()),
    )
    exam_proctoring_configs = sa.table(
        "exam_proctoring_configs",
        sa.column("exam_id", uuid_type),
        *[sa.column(field) for field in PROCTORING_SCALAR_FIELDS],
    )
    exam_proctoring_alert_rules = sa.table(
        "exam_proctoring_alert_rules",
        sa.column("id", uuid_type),
        sa.column("exam_id", uuid_type),
        sa.column("position", sa.Integer()),
        sa.column("rule_key", sa.String()),
        sa.column("event_type", sa.String()),
        sa.column("threshold", sa.Integer()),
        sa.column("severity", sa.String()),
        sa.column("action", sa.String()),
        sa.column("message", sa.String()),
    )
    tests = sa.table("tests", sa.column("id", uuid_type), sa.column("ui_config", json_type))
    test_ui_columns = sa.table(
        "test_ui_columns",
        sa.column("id", uuid_type),
        sa.column("test_id", uuid_type),
        sa.column("position", sa.Integer()),
        sa.column("column_key", sa.String()),
    )

    if "surveys" in refreshed_tables:
        existing_survey_ids = set(bind.execute(sa.select(survey_questions.c.survey_id).distinct()).scalars())
        survey_question_rows = []
        survey_option_rows = []
        for row in bind.execute(sa.select(surveys.c.id, surveys.c.questions)).mappings():
            if row["id"] in existing_survey_ids:
                continue
            if not isinstance(row["questions"], list):
                continue
            for question_index, raw_question in enumerate(row["questions"], start=1):
                if isinstance(raw_question, dict):
                    question_text = str(raw_question.get("text") or "").strip()
                    question_type = str(raw_question.get("question_type") or raw_question.get("type") or "TEXT").strip().upper()
                    options = raw_question.get("options") or []
                else:
                    question_text = str(raw_question or "").strip()
                    question_type = "TEXT"
                    options = []
                question_id = _uuid_value(is_pg)
                survey_question_rows.append({"id": question_id, "survey_id": row["id"], "position": question_index, "text": question_text, "question_type": question_type})
                for option_index, option_text in enumerate(options, start=1):
                    survey_option_rows.append({"id": _uuid_value(is_pg), "survey_question_id": question_id, "position": option_index, "text": str(option_text or "").strip()})
        if survey_question_rows:
            bind.execute(sa.insert(survey_questions), survey_question_rows)
        if survey_option_rows:
            bind.execute(sa.insert(survey_question_options), survey_option_rows)

    if "user_groups" in refreshed_tables:
        existing_group_ids = set(bind.execute(sa.select(user_group_members.c.group_id).distinct()).scalars())
        member_rows = []
        for row in bind.execute(sa.select(user_groups.c.id, user_groups.c.member_ids)).mappings():
            if row["id"] in existing_group_ids or not isinstance(row["member_ids"], list):
                continue
            seen_members = set()
            position = 1
            for raw_member_id in row["member_ids"]:
                member_id = _coerce_uuid(raw_member_id, is_pg)
                if member_id is None or member_id in seen_members:
                    continue
                seen_members.add(member_id)
                member_rows.append({"id": _uuid_value(is_pg), "group_id": row["id"], "user_id": member_id, "position": position})
                position += 1
        if member_rows:
            bind.execute(sa.insert(user_group_members), member_rows)

    if "tests" in refreshed_tables and "test_ui_columns" in refreshed_tables:
        existing_test_ids = set(bind.execute(sa.select(test_ui_columns.c.test_id).distinct()).scalars())
        ui_rows = []
        for row in bind.execute(sa.select(tests.c.id, tests.c.ui_config)).mappings():
            if row["id"] in existing_test_ids:
                continue
            raw_ui = row["ui_config"] if isinstance(row["ui_config"], dict) else {}
            columns = raw_ui.get("displayed_columns") if isinstance(raw_ui, dict) else None
            normalized_columns = [str(column).strip() for column in (columns or []) if str(column).strip()] or list(DEFAULT_UI_COLUMNS)
            for index, column in enumerate(normalized_columns, start=1):
                ui_rows.append({"id": _uuid_value(is_pg), "test_id": row["id"], "position": index, "column_key": column})
        if ui_rows:
            bind.execute(sa.insert(test_ui_columns), ui_rows)

    if "exams" in refreshed_tables:
        existing_admin_ids = set(bind.execute(sa.select(exam_admin_configs.c.exam_id).distinct()).scalars())
        existing_runtime_ids = set(bind.execute(sa.select(exam_runtime_configs.c.exam_id).distinct()).scalars())
        existing_certificate_ids = set(bind.execute(sa.select(exam_certificate_configs.c.exam_id).distinct()).scalars())
        existing_proctoring_ids = set(bind.execute(sa.select(exam_proctoring_configs.c.exam_id).distinct()).scalars())
        used_codes = {code for code in bind.execute(sa.select(exam_admin_configs.c.code).where(exam_admin_configs.c.code.is_not(None))).scalars() if code}

        admin_rows = []
        admin_ui_rows = []
        runtime_rows = []
        runtime_instruction_rows = []
        runtime_translation_rows = []
        runtime_extra_rows = []
        certificate_rows = []
        proctoring_rows = []
        proctoring_rule_rows = []

        for row in bind.execute(sa.select(exams.c.id, exams.c.settings, exams.c.proctoring_config, exams.c.certificate, exams.c.library_pool_id)).mappings():
            exam_id = row["id"]
            settings = row["settings"] if isinstance(row["settings"], dict) else {}
            admin_meta = settings.get("_admin_test") if isinstance(settings.get("_admin_test"), dict) else {}
            runtime_settings = {key: value for key, value in settings.items() if key not in {"_admin_test", "_pool_library"}}
            pool_meta = settings.get("_pool_library") if isinstance(settings.get("_pool_library"), dict) else {}

            if exam_id not in existing_admin_ids and admin_meta:
                code = str(admin_meta.get("code") or "").strip() or None
                if code and code in used_codes:
                    code = None
                if code:
                    used_codes.add(code)
                security = dict(DEFAULT_SECURITY_SETTINGS)
                if isinstance(admin_meta.get("settings"), dict):
                    security.update(admin_meta["settings"])
                admin_rows.append({
                    "exam_id": exam_id,
                    "code": code,
                    "published_at": _coerce_datetime(admin_meta.get("published_at")),
                    "archived_at": _coerce_datetime(admin_meta.get("archived_at")),
                    "randomize_questions": bool(admin_meta.get("randomize_questions", True)),
                    "report_displayed": str(admin_meta.get("report_displayed") or "IMMEDIATELY_AFTER_GRADING"),
                    "report_content": str(admin_meta.get("report_content") or "SCORE_AND_DETAILS"),
                    "fullscreen_required": bool(security.get("fullscreen_required", True)),
                    "tab_switch_detect": bool(security.get("tab_switch_detect", True)),
                    "camera_required": bool(security.get("camera_required", True)),
                    "mic_required": bool(security.get("mic_required", False)),
                    "violation_threshold_warn": int(security.get("violation_threshold_warn", 3) or 3),
                    "violation_threshold_autosubmit": int(security.get("violation_threshold_autosubmit", 6) or 6),
                })
                raw_ui = admin_meta.get("ui_config") if isinstance(admin_meta.get("ui_config"), dict) else {}
                columns = raw_ui.get("displayed_columns") if isinstance(raw_ui, dict) else None
                normalized_columns = [str(column).strip() for column in (columns or []) if str(column).strip()] or list(DEFAULT_UI_COLUMNS)
                for index, column in enumerate(normalized_columns, start=1):
                    admin_ui_rows.append({"id": _uuid_value(is_pg), "exam_id": exam_id, "position": index, "column_key": column})

            if exam_id not in existing_runtime_ids and runtime_settings:
                runtime_row = {"exam_id": exam_id, **{field: None for field in RUNTIME_SCALAR_FIELDS}, **RUNTIME_DEFAULTS}
                for field in RUNTIME_SCALAR_FIELDS:
                    if field in runtime_settings:
                        runtime_row[field] = runtime_settings.get(field)
                runtime_rows.append(runtime_row)
                for index, item in enumerate(runtime_settings.get("instructions_list") or [], start=1):
                    text = str(item or "").strip()
                    if text:
                        runtime_instruction_rows.append({"id": _uuid_value(is_pg), "exam_id": exam_id, "position": index, "text": text})
                for translation in runtime_settings.get("test_translations") or []:
                    if not isinstance(translation, dict):
                        continue
                    locale = str(translation.get("language") or translation.get("locale") or "").strip()
                    if locale:
                        runtime_translation_rows.append({
                            "id": _uuid_value(is_pg),
                            "exam_id": exam_id,
                            "locale": locale,
                            "title": str(translation.get("title") or "").strip() or None,
                            "description": str(translation.get("description") or "").strip() or None,
                            "instructions_body": str(translation.get("instructions_body") or "").strip() or None,
                            "completion_message": str(translation.get("completion_message") or "").strip() or None,
                        })
                runtime_extra_rows.extend(_flatten_runtime_extra_settings(exam_id, {key: value for key, value in runtime_settings.items() if key not in RUNTIME_SCALAR_FIELDS and key not in RUNTIME_COMPLEX_FIELDS}, is_pg))

            certificate = row["certificate"] if isinstance(row["certificate"], dict) else None
            if exam_id not in existing_certificate_ids and certificate and any(certificate.values()):
                certificate_rows.append({"exam_id": exam_id, "title": str(certificate.get("title") or "").strip() or None, "subtitle": str(certificate.get("subtitle") or "").strip() or None, "issuer": str(certificate.get("issuer_name") or certificate.get("issuer") or "").strip() or None, "signer": str(certificate.get("signer_name") or certificate.get("signer") or "").strip() or None})

            proctoring = row["proctoring_config"] if isinstance(row["proctoring_config"], dict) else None
            if exam_id not in existing_proctoring_ids and proctoring:
                merged_proctoring = dict(DEFAULT_PROCTORING)
                merged_proctoring.update({key: value for key, value in proctoring.items() if key in DEFAULT_PROCTORING or key == "access_mode"})
                proctoring_row = {"exam_id": exam_id, **{field: merged_proctoring.get(field) for field in PROCTORING_SCALAR_FIELDS}}
                proctoring_rows.append(proctoring_row)
                for index, rule in enumerate(merged_proctoring.get("alert_rules") or [], start=1):
                    if not isinstance(rule, dict):
                        continue
                    event_type = str(rule.get("event_type") or "").strip()
                    if event_type:
                        proctoring_rule_rows.append({"id": _uuid_value(is_pg), "exam_id": exam_id, "position": index, "rule_key": str(rule.get("id") or "").strip() or None, "event_type": event_type, "threshold": int(rule.get("threshold") or 1), "severity": str(rule.get("severity") or "MEDIUM").strip().upper(), "action": str(rule.get("action") or "WARN").strip().upper(), "message": str(rule.get("message") or "").strip() or None})

            if row["library_pool_id"] is None:
                pool_id = _coerce_uuid(pool_meta.get("pool_id"), is_pg)
                if pool_id is not None:
                    bind.execute(exams.update().where(exams.c.id == exam_id).values(library_pool_id=pool_id))

        if admin_rows:
            bind.execute(sa.insert(exam_admin_configs), admin_rows)
        if admin_ui_rows:
            bind.execute(sa.insert(exam_ui_columns), admin_ui_rows)
        if runtime_rows:
            bind.execute(sa.insert(exam_runtime_configs), runtime_rows)
        if runtime_instruction_rows:
            bind.execute(sa.insert(exam_runtime_instruction_items), runtime_instruction_rows)
        if runtime_translation_rows:
            bind.execute(sa.insert(exam_runtime_translations), runtime_translation_rows)
        if runtime_extra_rows:
            bind.execute(sa.insert(exam_runtime_extra_settings), runtime_extra_rows)
        if certificate_rows:
            bind.execute(sa.insert(exam_certificate_configs), certificate_rows)
        if proctoring_rows:
            bind.execute(sa.insert(exam_proctoring_configs), proctoring_rows)
        if proctoring_rule_rows:
            bind.execute(sa.insert(exam_proctoring_alert_rules), proctoring_rule_rows)


def downgrade() -> None:
    # This migration is intentionally one-way.
    pass
