"""add schedule test target and tests ui config

Revision ID: 202603042210
Revises: 202603041700
Create Date: 2026-03-04 22:10:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "202603042210"
down_revision = "202603041700"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tests", sa.Column("ui_config", sa.JSON(), nullable=True))

    op.add_column("schedules", sa.Column("test_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_schedules_test_id_tests",
        "schedules",
        "tests",
        ["test_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint("uq_schedule_user_test", "schedules", ["user_id", "test_id"])
    op.create_index("ix_schedules_test_id", "schedules", ["test_id"])


def downgrade() -> None:
    op.drop_index("ix_schedules_test_id", table_name="schedules")
    op.drop_constraint("uq_schedule_user_test", "schedules", type_="unique")
    op.drop_constraint("fk_schedules_test_id_tests", "schedules", type_="foreignkey")
    op.drop_column("schedules", "test_id")

    op.drop_column("tests", "ui_config")
