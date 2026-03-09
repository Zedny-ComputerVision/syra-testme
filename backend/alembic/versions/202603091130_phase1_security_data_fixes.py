"""add attempt grade column and phase 1 indexes

Revision ID: 202603091130
Revises: 202603051230
Create Date: 2026-03-09 11:30:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202603091130"
down_revision = "202603051230"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("attempts", sa.Column("grade", sa.String(length=100), nullable=True))
    op.create_index("ix_exams_title", "exams", ["title"], unique=False)
    op.create_index("ix_exams_status", "exams", ["status"], unique=False)
    op.create_index("ix_attempts_status", "attempts", ["status"], unique=False)
    op.create_index("ix_attempts_user_id", "attempts", ["user_id"], unique=False)
    op.create_index("ix_schedules_scheduled_at", "schedules", ["scheduled_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_schedules_scheduled_at", table_name="schedules")
    op.drop_index("ix_attempts_user_id", table_name="attempts")
    op.drop_index("ix_attempts_status", table_name="attempts")
    op.drop_index("ix_exams_status", table_name="exams")
    op.drop_index("ix_exams_title", table_name="exams")
    op.drop_column("attempts", "grade")
