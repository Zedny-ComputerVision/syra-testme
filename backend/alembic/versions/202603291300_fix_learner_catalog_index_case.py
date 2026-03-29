"""Fix ix_exam_learner_catalog to use uppercase enum value 'OPEN'.

The previous migration created the index with WHERE status = 'open' (lowercase).
The PostgreSQL enum examstatus uses uppercase labels ('OPEN', 'CLOSED'), so the
lowercase predicate either caused an error or created a useless index that never
matched any rows.  This migration drops and recreates the index with the correct
uppercase predicate.

Revision ID: 202603291300
Revises: 202603291200
Create Date: 2026-03-29 13:00:00
"""

from __future__ import annotations

from alembic import op

revision = "202603291300"
down_revision = "202603291200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the potentially wrong-case index (ignore if it doesn't exist).
    op.execute("DROP INDEX IF EXISTS ix_exam_learner_catalog")

    # Recreate with the correct uppercase enum predicate.
    op.execute(
        """
        CREATE INDEX ix_exam_learner_catalog
        ON exams (updated_at DESC, created_at DESC)
        WHERE status = 'OPEN' AND library_pool_id IS NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_exam_learner_catalog")
    op.execute(
        """
        CREATE INDEX ix_exam_learner_catalog
        ON exams (updated_at DESC, created_at DESC)
        WHERE status = 'OPEN' AND library_pool_id IS NULL
        """
    )
