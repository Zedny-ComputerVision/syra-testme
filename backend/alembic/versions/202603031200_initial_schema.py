"""initial schema

Revision ID: 202603031200
Revises:
Create Date: 2026-03-03 12:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "202603031200"
down_revision = None
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


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    is_pg = bind.dialect.name == "postgresql"
    uuid_type = _uuid_type(is_pg)
    json_type = _json_type(is_pg)
    true_default = sa.text("true" if is_pg else "1")
    false_default = sa.text("false" if is_pg else "0")

    role_enum = _enum_type(("ADMIN", "INSTRUCTOR", "LEARNER"), "roleenum", is_pg)
    course_status = _enum_type(("DRAFT", "PUBLISHED"), "coursestatus", is_pg)
    exam_type = _enum_type(("MCQ", "MULTI", "TRUEFALSE", "ORDERING", "FILLINBLANK", "MATCHING", "TEXT"), "examtype", is_pg)
    exam_status = _enum_type(("OPEN", "CLOSED"), "examstatus", is_pg)
    attempt_status = _enum_type(("IN_PROGRESS", "SUBMITTED", "GRADED"), "attemptstatus", is_pg)
    access_mode = _enum_type(("OPEN", "RESTRICTED"), "accessmode", is_pg)
    severity_enum = _enum_type(("LOW", "MEDIUM", "HIGH"), "severityenum", is_pg)
    category_type = _enum_type(("TEST", "SURVEY", "TRAINING"), "categorytype", is_pg)

    if is_pg:
        for enum_name, values in (
            ("roleenum", ("ADMIN", "INSTRUCTOR", "LEARNER")),
            ("coursestatus", ("DRAFT", "PUBLISHED")),
            ("examtype", ("MCQ", "MULTI", "TRUEFALSE", "ORDERING", "FILLINBLANK", "MATCHING", "TEXT")),
            ("examstatus", ("OPEN", "CLOSED")),
            ("attemptstatus", ("IN_PROGRESS", "SUBMITTED", "GRADED")),
            ("accessmode", ("OPEN", "RESTRICTED")),
            ("severityenum", ("LOW", "MEDIUM", "HIGH")),
            ("categorytype", ("TEST", "SURVEY", "TRAINING")),
        ):
            postgresql.ENUM(*values, name=enum_name).create(bind, checkfirst=True)

    if "users" not in existing_tables:
        op.create_table(
            "users",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("user_id", sa.String(length=50), nullable=False, unique=True),
            sa.Column("email", sa.String(length=255), nullable=False, unique=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("hashed_password", sa.String(length=255), nullable=False),
            sa.Column("role", role_enum, nullable=False, server_default="LEARNER"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_users_user_id", "users", ["user_id"], unique=False)
        op.create_index("ix_users_email", "users", ["email"], unique=False)

    if "categories" not in existing_tables:
        op.create_table(
            "categories",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("name", sa.String(length=255), nullable=False, unique=True),
            sa.Column("type", category_type, nullable=False, server_default="TEST"),
            sa.Column("description", sa.String(length=1024), nullable=True),
        )

    if "grading_scales" not in existing_tables:
        op.create_table(
            "grading_scales",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("labels", json_type, nullable=False),
        )

    if "question_pools" not in existing_tables:
        op.create_table(
            "question_pools",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("description", sa.String(length=1024), nullable=True),
            sa.Column("created_by_id", uuid_type, sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "courses" not in existing_tables:
        op.create_table(
            "courses",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.String(length=1024), nullable=True),
            sa.Column("status", course_status, nullable=False, server_default="DRAFT"),
            sa.Column("created_by_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "nodes" not in existing_tables:
        op.create_table(
            "nodes",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("course_id", uuid_type, sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "exams" not in existing_tables:
        op.create_table(
            "exams",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("node_id", uuid_type, sa.ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.String(length=4000), nullable=True),
            sa.Column("type", exam_type, nullable=False, server_default="MCQ"),
            sa.Column("status", exam_status, nullable=False, server_default="CLOSED"),
            sa.Column("time_limit", sa.Integer(), nullable=True),
            sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("passing_score", sa.Float(), nullable=True),
            sa.Column("proctoring_config", json_type, nullable=True),
            sa.Column("settings", json_type, nullable=True),
            sa.Column("certificate", json_type, nullable=True),
            sa.Column("category_id", uuid_type, sa.ForeignKey("categories.id"), nullable=True),
            sa.Column("grading_scale_id", uuid_type, sa.ForeignKey("grading_scales.id"), nullable=True),
            sa.Column("created_by_id", uuid_type, sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("node_id", "title", name="uq_exam_node_title"),
        )

    if "questions" not in existing_tables:
        op.create_table(
            "questions",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("exam_id", uuid_type, sa.ForeignKey("exams.id", ondelete="CASCADE"), nullable=False),
            sa.Column("text", sa.String(length=2048), nullable=False),
            sa.Column("type", exam_type, nullable=False, server_default="MCQ"),
            sa.Column("options", json_type, nullable=True),
            sa.Column("correct_answer", sa.String(length=255), nullable=True),
            sa.Column("points", sa.Float(), nullable=False, server_default="1.0"),
            sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("pool_id", uuid_type, sa.ForeignKey("question_pools.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_question_exam_order", "questions", ["exam_id", "order"], unique=False)

    if "attempts" not in existing_tables:
        op.create_table(
            "attempts",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("exam_id", uuid_type, sa.ForeignKey("exams.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("status", attempt_status, nullable=False, server_default="IN_PROGRESS"),
            sa.Column("score", sa.Float(), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("identity_verified", sa.Boolean(), nullable=False, server_default=false_default),
            sa.Column("face_signature", json_type, nullable=True),
            sa.Column("base_head_pose", json_type, nullable=True),
            sa.Column("id_doc_path", sa.String(length=512), nullable=True),
            sa.Column("selfie_path", sa.String(length=512), nullable=True),
            sa.Column("id_text", json_type, nullable=True),
            sa.Column("id_verified", sa.Boolean(), nullable=False, server_default=false_default),
            sa.Column("lighting_score", sa.Float(), nullable=True),
            sa.Column("precheck_passed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_attempt_user_exam", "attempts", ["user_id", "exam_id"], unique=False)

    if "attempt_answers" not in existing_tables:
        op.create_table(
            "attempt_answers",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("attempt_id", uuid_type, sa.ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("question_id", uuid_type, sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("answer", sa.String(length=2048), nullable=True),
            sa.Column("is_correct", sa.Boolean(), nullable=True),
            sa.Column("points_earned", sa.Float(), nullable=True),
        )

    if "notifications" not in existing_tables:
        op.create_table(
            "notifications",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("message", sa.String(length=2048), nullable=False),
            sa.Column("is_read", sa.Boolean(), nullable=False, server_default=false_default),
            sa.Column("link", sa.String(length=512), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "audit_logs" not in existing_tables:
        op.create_table(
            "audit_logs",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("user_id", uuid_type, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("action", sa.String(length=255), nullable=False),
            sa.Column("resource_type", sa.String(length=100), nullable=True),
            sa.Column("resource_id", sa.String(length=255), nullable=True),
            sa.Column("detail", sa.String(length=2048), nullable=True),
            sa.Column("ip_address", sa.String(length=45), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "schedules" not in existing_tables:
        op.create_table(
            "schedules",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("exam_id", uuid_type, sa.ForeignKey("exams.id", ondelete="CASCADE"), nullable=True),
            sa.Column("user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("access_mode", access_mode, nullable=False, server_default="OPEN"),
            sa.Column("notes", sa.String(length=512), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("user_id", "exam_id", name="uq_schedule_user_exam"),
        )

    if "proctoring_events" not in existing_tables:
        op.create_table(
            "proctoring_events",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("attempt_id", uuid_type, sa.ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("event_type", sa.String(length=255), nullable=False),
            sa.Column("severity", severity_enum, nullable=False),
            sa.Column("detail", sa.String(length=2048), nullable=True),
            sa.Column("ai_confidence", sa.Float(), nullable=True),
            sa.Column("meta", json_type, nullable=True),
            sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_event_attempt", "proctoring_events", ["attempt_id"], unique=False)

    if "surveys" not in existing_tables:
        op.create_table(
            "surveys",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.String(length=2048), nullable=True),
            sa.Column("questions", json_type, nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("created_by_id", uuid_type, sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "survey_responses" not in existing_tables:
        op.create_table(
            "survey_responses",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("survey_id", uuid_type, sa.ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("answers", json_type, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "user_groups" not in existing_tables:
        op.create_table(
            "user_groups",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("name", sa.String(length=255), nullable=False, unique=True),
            sa.Column("description", sa.String(length=1024), nullable=True),
            sa.Column("member_ids", json_type, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "user_preferences" not in existing_tables:
        op.create_table(
            "user_preferences",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("key", sa.String(length=255), nullable=False),
            sa.Column("value", json_type, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("user_id", "key", name="uq_user_preference_user_key"),
        )

    if "exam_templates" not in existing_tables:
        op.create_table(
            "exam_templates",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("description", sa.String(length=1024), nullable=True),
            sa.Column("config", json_type, nullable=True),
            sa.Column("created_by_id", uuid_type, sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "report_schedules" not in existing_tables:
        op.create_table(
            "report_schedules",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("report_type", sa.String(length=100), nullable=False),
            sa.Column("schedule_cron", sa.String(length=100), nullable=True),
            sa.Column("recipients", json_type, nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=true_default),
            sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by_id", uuid_type, sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "system_settings" not in existing_tables:
        op.create_table(
            "system_settings",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("key", sa.String(length=255), nullable=False, unique=True),
            sa.Column("value", sa.String(length=4096), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    for table_name in (
        "system_settings",
        "report_schedules",
        "exam_templates",
        "user_preferences",
        "user_groups",
        "survey_responses",
        "surveys",
        "proctoring_events",
        "schedules",
        "audit_logs",
        "notifications",
        "attempt_answers",
        "attempts",
        "questions",
        "exams",
        "nodes",
        "courses",
        "question_pools",
        "grading_scales",
        "categories",
        "users",
    ):
        if table_name in existing_tables:
            op.drop_table(table_name)
