"""Create the learner catalog indexes that the earlier no-op revisions skipped.

Revision ID: 202603301030
Revises: 202603291300
Create Date: 2026-03-30 10:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "202603301030"
down_revision = "202603291300"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute(
                sa.text(
                    """
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_schedule_user_exam_scheduled
                    ON schedules (user_id, exam_id, scheduled_at)
                    """
                )
            )
            op.execute(
                sa.text(
                    """
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_exam_learner_catalog
                    ON exams (updated_at, created_at)
                    WHERE status = 'OPEN' AND library_pool_id IS NULL
                    """
                )
            )
        return

    op.execute(
        sa.text(
            """
            CREATE INDEX IF NOT EXISTS ix_schedule_user_exam_scheduled
            ON schedules (user_id, exam_id, scheduled_at)
            """
        )
    )
    op.execute(
        sa.text(
            """
            CREATE INDEX IF NOT EXISTS ix_exam_learner_catalog
            ON exams (status, library_pool_id, updated_at, created_at)
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute(sa.text("DROP INDEX CONCURRENTLY IF EXISTS ix_exam_learner_catalog"))
            op.execute(sa.text("DROP INDEX CONCURRENTLY IF EXISTS ix_schedule_user_exam_scheduled"))
        return

    op.execute(sa.text("DROP INDEX IF EXISTS ix_exam_learner_catalog"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_schedule_user_exam_scheduled"))
