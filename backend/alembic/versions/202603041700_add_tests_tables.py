"""add tests tables

Revision ID: 202603041700
Revises: 
Create Date: 2026-03-04 17:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "202603041700"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    test_status = postgresql.ENUM("DRAFT", "PUBLISHED", "ARCHIVED", name="test_status", create_type=False) if is_pg else sa.Enum("DRAFT", "PUBLISHED", "ARCHIVED", name="test_status")
    test_type = postgresql.ENUM("MCQ", "TEXT", name="test_type", create_type=False) if is_pg else sa.Enum("MCQ", "TEXT", name="test_type")
    report_displayed = postgresql.ENUM(
        "IMMEDIATELY_AFTER_GRADING",
        "IMMEDIATELY_AFTER_FINISHING",
        "ON_MANAGER_APPROVAL",
        name="report_displayed",
        create_type=False,
    ) if is_pg else sa.Enum(
        "IMMEDIATELY_AFTER_GRADING",
        "IMMEDIATELY_AFTER_FINISHING",
        "ON_MANAGER_APPROVAL",
        name="report_displayed",
    )
    report_content = postgresql.ENUM("SCORE_ONLY", "SCORE_AND_DETAILS", name="report_content", create_type=False) if is_pg else sa.Enum("SCORE_ONLY", "SCORE_AND_DETAILS", name="report_content")

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
        sa.Column("randomize_questions", sa.Boolean(), nullable=False, server_default=sa.text("true" if is_pg else "1")),
        sa.Column("report_displayed", report_displayed, nullable=False, server_default="IMMEDIATELY_AFTER_GRADING"),
        sa.Column("report_content", report_content, nullable=False, server_default="SCORE_AND_DETAILS"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("code", name="uq_tests_code"),
    )
    op.create_index("ix_tests_created_at", "tests", ["created_at"])
    op.create_index("ix_tests_updated_at", "tests", ["updated_at"])
    op.create_index("ix_tests_name", "tests", ["name"])

    op.create_table(
        "test_settings",
        sa.Column("test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tests.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("fullscreen_required", sa.Boolean(), nullable=False, server_default=sa.text("true" if is_pg else "1")),
        sa.Column("tab_switch_detect", sa.Boolean(), nullable=False, server_default=sa.text("true" if is_pg else "1")),
        sa.Column("camera_required", sa.Boolean(), nullable=False, server_default=sa.text("true" if is_pg else "1")),
        sa.Column("mic_required", sa.Boolean(), nullable=False, server_default=sa.text("false" if is_pg else "0")),
        sa.Column("violation_threshold_warn", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("violation_threshold_autosubmit", sa.Integer(), nullable=False, server_default="6"),
    )


def downgrade() -> None:
    op.drop_table("test_settings")
    op.drop_index("ix_tests_name", table_name="tests")
    op.drop_index("ix_tests_updated_at", table_name="tests")
    op.drop_index("ix_tests_created_at", table_name="tests")
    op.drop_table("tests")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for enum_name in ["report_content", "report_displayed", "test_type", "test_status"]:
            op.execute(sa.text(f"DROP TYPE IF EXISTS {enum_name}"))
