"""remove deprecated tests tables

Revision ID: 202603111030
Revises: 202603101735
Create Date: 2026-03-11 10:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "202603111030"
down_revision = "202603101735"
branch_labels = None
depends_on = None


def _table_names(inspector) -> set[str]:
    return set(inspector.get_table_names())


def _column_names(inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _foreign_key_names(inspector, table_name: str) -> set[str]:
    return {foreign_key["name"] for foreign_key in inspector.get_foreign_keys(table_name) if foreign_key.get("name")}


def _unique_constraint_names(inspector, table_name: str) -> set[str]:
    return {constraint["name"] for constraint in inspector.get_unique_constraints(table_name) if constraint.get("name")}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = _table_names(inspector)

    if "schedules" in table_names and "test_id" in _column_names(inspector, "schedules"):
        fk_names = _foreign_key_names(inspector, "schedules")
        unique_names = _unique_constraint_names(inspector, "schedules")
        index_names = _index_names(inspector, "schedules")

        if "uq_schedule_user_test" in unique_names:
            op.drop_constraint("uq_schedule_user_test", "schedules", type_="unique")
        if "fk_schedules_test_id_tests" in fk_names:
            op.drop_constraint("fk_schedules_test_id_tests", "schedules", type_="foreignkey")
        if "ix_schedules_test_id" in index_names:
            op.drop_index("ix_schedules_test_id", table_name="schedules")
        op.drop_column("schedules", "test_id")

    inspector = sa.inspect(bind)
    table_names = _table_names(inspector)

    if "test_ui_columns" in table_names:
        op.drop_table("test_ui_columns")
    if "test_settings" in table_names:
        op.drop_table("test_settings")
    if "tests" in table_names:
        op.drop_table("tests")

    if bind.dialect.name == "postgresql":
        for enum_name in ("report_content", "report_displayed", "test_type", "test_status"):
            op.execute(sa.text(f"DROP TYPE IF EXISTS {enum_name}"))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = _table_names(inspector)
    is_pg = bind.dialect.name == "postgresql"

    test_status = (
        postgresql.ENUM("DRAFT", "PUBLISHED", "ARCHIVED", name="test_status", create_type=False)
        if is_pg
        else sa.Enum("DRAFT", "PUBLISHED", "ARCHIVED", name="test_status")
    )
    test_type = (
        postgresql.ENUM("MCQ", "TEXT", name="test_type", create_type=False)
        if is_pg
        else sa.Enum("MCQ", "TEXT", name="test_type")
    )
    report_displayed = (
        postgresql.ENUM(
            "IMMEDIATELY_AFTER_GRADING",
            "IMMEDIATELY_AFTER_FINISHING",
            "ON_MANAGER_APPROVAL",
            name="report_displayed",
            create_type=False,
        )
        if is_pg
        else sa.Enum(
            "IMMEDIATELY_AFTER_GRADING",
            "IMMEDIATELY_AFTER_FINISHING",
            "ON_MANAGER_APPROVAL",
            name="report_displayed",
        )
    )
    report_content = (
        postgresql.ENUM("SCORE_ONLY", "SCORE_AND_DETAILS", name="report_content", create_type=False)
        if is_pg
        else sa.Enum("SCORE_ONLY", "SCORE_AND_DETAILS", name="report_content")
    )

    if is_pg:
        postgresql.ENUM("DRAFT", "PUBLISHED", "ARCHIVED", name="test_status").create(bind, checkfirst=True)
        postgresql.ENUM("MCQ", "TEXT", name="test_type").create(bind, checkfirst=True)
        postgresql.ENUM(
            "IMMEDIATELY_AFTER_GRADING",
            "IMMEDIATELY_AFTER_FINISHING",
            "ON_MANAGER_APPROVAL",
            name="report_displayed",
        ).create(bind, checkfirst=True)
        postgresql.ENUM("SCORE_ONLY", "SCORE_AND_DETAILS", name="report_content").create(bind, checkfirst=True)

    if "tests" not in table_names:
        op.create_table(
            "tests",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("code", sa.String(length=12), nullable=True, unique=True),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("description", sa.String(length=4000), nullable=True),
            sa.Column("type", test_type, nullable=False),
            sa.Column("status", test_status, nullable=False, server_default="DRAFT"),
            sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
            sa.Column("time_limit_minutes", sa.Integer(), nullable=False, server_default="60"),
            sa.Column("attempts_allowed", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("randomize_questions", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("report_displayed", report_displayed, nullable=False, server_default="IMMEDIATELY_AFTER_GRADING"),
            sa.Column("report_content", report_content, nullable=False, server_default="SCORE_AND_DETAILS"),
            sa.Column("ui_config", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("code", name="uq_tests_code"),
        )
        op.create_index("ix_tests_created_at", "tests", ["created_at"])
        op.create_index("ix_tests_updated_at", "tests", ["updated_at"])
        op.create_index("ix_tests_name", "tests", ["name"])

    inspector = sa.inspect(bind)
    table_names = _table_names(inspector)

    if "test_settings" not in table_names:
        op.create_table(
            "test_settings",
            sa.Column("test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tests.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("fullscreen_required", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("tab_switch_detect", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("camera_required", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("mic_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("violation_threshold_warn", sa.Integer(), nullable=False, server_default="3"),
            sa.Column("violation_threshold_autosubmit", sa.Integer(), nullable=False, server_default="6"),
        )

    if "test_ui_columns" not in table_names:
        op.create_table(
            "test_ui_columns",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tests.id", ondelete="CASCADE"), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("column_key", sa.String(length=128), nullable=False),
            sa.UniqueConstraint("test_id", "position", name="uq_test_ui_column_position"),
        )
        op.create_index("ix_test_ui_columns_test_id", "test_ui_columns", ["test_id"])

    inspector = sa.inspect(bind)
    table_names = _table_names(inspector)
    if "schedules" in table_names and "test_id" not in _column_names(inspector, "schedules"):
        op.add_column("schedules", sa.Column("test_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_index("ix_schedules_test_id", "schedules", ["test_id"])
        op.create_foreign_key(
            "fk_schedules_test_id_tests",
            "schedules",
            "tests",
            ["test_id"],
            ["id"],
            ondelete="CASCADE",
        )
        op.create_unique_constraint("uq_schedule_user_test", "schedules", ["user_id", "test_id"])
