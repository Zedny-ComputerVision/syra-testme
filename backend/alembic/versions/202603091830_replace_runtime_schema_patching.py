"""replace runtime schema patching with alembic reconciliation

Revision ID: 202603091830
Revises: 202603091130
Create Date: 2026-03-09 18:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "202603091830"
down_revision = "202603091130"
branch_labels = None
depends_on = None


def _uuid_type(is_pg: bool):
    return postgresql.UUID(as_uuid=True) if is_pg else sa.String(length=36)


def _json_type(is_pg: bool):
    return postgresql.JSONB(astext_type=sa.Text()) if is_pg else sa.JSON()


def _enum_type(values: tuple[str, ...], name: str, is_pg: bool):
    if is_pg:
        return postgresql.ENUM(*values, name=name, create_type=False)
    return sa.Enum(*values, name=name)


def _table_names(inspector) -> set[str]:
    return set(inspector.get_table_names())


def _column_names(inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _unique_constraint_names(inspector, table_name: str) -> set[str]:
    return {constraint["name"] for constraint in inspector.get_unique_constraints(table_name)}


def _foreign_key_names(inspector, table_name: str) -> set[str]:
    return {fk["name"] for fk in inspector.get_foreign_keys(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = _table_names(inspector)
    is_pg = bind.dialect.name == "postgresql"
    uuid_type = _uuid_type(is_pg)
    json_type = _json_type(is_pg)
    true_default = sa.text("true" if is_pg else "1")
    false_default = sa.text("false" if is_pg else "0")

    test_status = _enum_type(("DRAFT", "PUBLISHED", "ARCHIVED"), "test_status", is_pg)
    test_type = _enum_type(("MCQ", "TEXT"), "test_type", is_pg)
    report_displayed = _enum_type(
        ("IMMEDIATELY_AFTER_GRADING", "IMMEDIATELY_AFTER_FINISHING", "ON_MANAGER_APPROVAL"),
        "report_displayed",
        is_pg,
    )
    report_content = _enum_type(("SCORE_ONLY", "SCORE_AND_DETAILS"), "report_content", is_pg)

    if is_pg:
        for enum_name, values in (
            ("test_status", ("DRAFT", "PUBLISHED", "ARCHIVED")),
            ("test_type", ("MCQ", "TEXT")),
            ("report_displayed", ("IMMEDIATELY_AFTER_GRADING", "IMMEDIATELY_AFTER_FINISHING", "ON_MANAGER_APPROVAL")),
            ("report_content", ("SCORE_ONLY", "SCORE_AND_DETAILS")),
        ):
            postgresql.ENUM(*values, name=enum_name).create(bind, checkfirst=True)

    if "tests" not in table_names:
        op.create_table(
            "tests",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("code", sa.String(length=12), nullable=True, unique=True),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("description", sa.String(length=4000), nullable=True),
            sa.Column("type", test_type, nullable=False),
            sa.Column("status", test_status, nullable=False, server_default="DRAFT"),
            sa.Column("category_id", uuid_type, sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
            sa.Column("time_limit_minutes", sa.Integer(), nullable=False, server_default="60"),
            sa.Column("attempts_allowed", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("randomize_questions", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("report_displayed", report_displayed, nullable=False, server_default="IMMEDIATELY_AFTER_GRADING"),
            sa.Column("report_content", report_content, nullable=False, server_default="SCORE_AND_DETAILS"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("code", name="uq_tests_code"),
        )
        op.create_index("ix_tests_created_at", "tests", ["created_at"], unique=False)
        op.create_index("ix_tests_updated_at", "tests", ["updated_at"], unique=False)
        op.create_index("ix_tests_name", "tests", ["name"], unique=False)
        table_names.add("tests")

    if "test_settings" not in table_names:
        op.create_table(
            "test_settings",
            sa.Column("test_id", uuid_type, sa.ForeignKey("tests.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("fullscreen_required", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("tab_switch_detect", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("camera_required", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("mic_required", sa.Boolean(), nullable=False, server_default=false_default),
            sa.Column("violation_threshold_warn", sa.Integer(), nullable=False, server_default="3"),
            sa.Column("violation_threshold_autosubmit", sa.Integer(), nullable=False, server_default="6"),
        )
        table_names.add("test_settings")

    inspector = sa.inspect(bind)
    table_names = _table_names(inspector)

    if "tests" in table_names:
        tests_columns = _column_names(inspector, "tests")
        tests_indexes = _index_names(inspector, "tests")
        if "ui_config" not in tests_columns:
            op.add_column("tests", sa.Column("ui_config", sa.JSON(), nullable=True))
        if "ix_tests_created_at" not in tests_indexes:
            op.create_index("ix_tests_created_at", "tests", ["created_at"], unique=False)
        if "ix_tests_updated_at" not in tests_indexes:
            op.create_index("ix_tests_updated_at", "tests", ["updated_at"], unique=False)
        if "ix_tests_name" not in tests_indexes:
            op.create_index("ix_tests_name", "tests", ["name"], unique=False)

    if "exams" in table_names:
        exams_columns = _column_names(inspector, "exams")
        if "description" not in exams_columns:
            op.add_column("exams", sa.Column("description", sa.String(length=4000), nullable=True))
        if "settings" not in exams_columns:
            op.add_column("exams", sa.Column("settings", json_type, nullable=True))
        if "certificate" not in exams_columns:
            op.add_column("exams", sa.Column("certificate", json_type, nullable=True))
        exams_indexes = _index_names(inspector, "exams")
        if "ix_exams_title" not in exams_indexes:
            op.create_index("ix_exams_title", "exams", ["title"], unique=False)
        if "ix_exams_status" not in exams_indexes:
            op.create_index("ix_exams_status", "exams", ["status"], unique=False)

    if "attempts" in table_names:
        attempts_columns = _column_names(inspector, "attempts")
        for column_name, column in (
            ("face_signature", sa.Column("face_signature", json_type, nullable=True)),
            ("base_head_pose", sa.Column("base_head_pose", json_type, nullable=True)),
            ("id_doc_path", sa.Column("id_doc_path", sa.String(length=512), nullable=True)),
            ("selfie_path", sa.Column("selfie_path", sa.String(length=512), nullable=True)),
            ("id_text", sa.Column("id_text", json_type, nullable=True)),
            ("id_verified", sa.Column("id_verified", sa.Boolean(), nullable=False, server_default=false_default)),
            ("lighting_score", sa.Column("lighting_score", sa.Float(), nullable=True)),
            ("precheck_passed_at", sa.Column("precheck_passed_at", sa.DateTime(timezone=True), nullable=True)),
            ("grade", sa.Column("grade", sa.String(length=100), nullable=True)),
        ):
            if column_name not in attempts_columns:
                op.add_column("attempts", column)
        attempts_indexes = _index_names(inspector, "attempts")
        if "ix_attempts_status" not in attempts_indexes:
            op.create_index("ix_attempts_status", "attempts", ["status"], unique=False)
        if "ix_attempts_user_id" not in attempts_indexes:
            op.create_index("ix_attempts_user_id", "attempts", ["user_id"], unique=False)

    if "schedules" in table_names:
        schedules_columns = _column_names(inspector, "schedules")
        if "test_id" not in schedules_columns:
            op.add_column("schedules", sa.Column("test_id", uuid_type, nullable=True))
        schedules_indexes = _index_names(inspector, "schedules")
        if "ix_schedules_scheduled_at" not in schedules_indexes:
            op.create_index("ix_schedules_scheduled_at", "schedules", ["scheduled_at"], unique=False)
        if "ix_schedules_test_id" not in schedules_indexes:
            op.create_index("ix_schedules_test_id", "schedules", ["test_id"], unique=False)
        if is_pg:
            schedules_fks = _foreign_key_names(inspector, "schedules")
            schedules_uniques = _unique_constraint_names(inspector, "schedules")
            if "fk_schedules_test_id_tests" not in schedules_fks:
                op.create_foreign_key(
                    "fk_schedules_test_id_tests",
                    "schedules",
                    "tests",
                    ["test_id"],
                    ["id"],
                    ondelete="CASCADE",
                )
            if "uq_schedule_user_test" not in schedules_uniques:
                op.create_unique_constraint("uq_schedule_user_test", "schedules", ["user_id", "test_id"])

    if "attempt_answers" in table_names:
        op.execute(
            """
            DELETE FROM attempt_answers AS older
            WHERE EXISTS (
                SELECT 1
                FROM attempt_answers AS newer
                WHERE newer.attempt_id = older.attempt_id
                  AND newer.question_id = older.question_id
                  AND newer.id > older.id
            )
            """
        )
        if is_pg:
            attempt_answer_uniques = _unique_constraint_names(inspector, "attempt_answers")
            if "uq_attempt_answer_attempt_question" not in attempt_answer_uniques:
                op.create_unique_constraint(
                    "uq_attempt_answer_attempt_question",
                    "attempt_answers",
                    ["attempt_id", "question_id"],
                )
        else:
            attempt_answer_indexes = _index_names(inspector, "attempt_answers")
            if "uq_attempt_answer_attempt_question" not in attempt_answer_indexes:
                op.create_index(
                    "uq_attempt_answer_attempt_question",
                    "attempt_answers",
                    ["attempt_id", "question_id"],
                    unique=True,
                )


def downgrade() -> None:
    # This migration replaces legacy runtime patching and is intentionally not reversible.
    pass
