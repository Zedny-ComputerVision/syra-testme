"""Add indexes to fix learner catalog and schedule query performance.

Two slow queries addressed:

1. Learner catalog (/api/exams/ for LEARNER role):
   SELECT ... FROM exams WHERE status='OPEN' AND library_pool_id IS NULL
   AND EXISTS (schedules...) ORDER BY updated_at DESC

   Fix: partial index on exams covering only OPEN non-pool rows, pre-sorted
   by updated_at. Eliminates full-table scan + sort on every page load.

2. EXISTS subquery on schedules:
   WHERE exam_id = :x AND user_id = :y AND scheduled_at <= :now

   Fix: covering index on (user_id, exam_id, scheduled_at) so the check
   is index-only — no heap fetch needed for the scheduled_at comparison.

Revision ID: 202603291200
Revises: 202603251000
Create Date: 2026-03-29 12:00:00
"""

from __future__ import annotations

from alembic import op

revision = "202603291200"
down_revision = "202603251000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Partial index: only OPEN exams with no library pool, sorted by updated_at.
    # Serves the entire learner catalog WHERE + ORDER BY in a single index scan.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_exam_learner_catalog
        ON exams (updated_at DESC, created_at DESC)
        WHERE status = 'open' AND library_pool_id IS NULL
        """
    )

    # Covering index for the correlated EXISTS in the learner catalog query.
    # Includes scheduled_at so the check never needs to touch the heap.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_schedule_user_exam_scheduled
        ON schedules (user_id, exam_id, scheduled_at)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_schedule_user_exam_scheduled")
    op.execute("DROP INDEX IF EXISTS ix_exam_learner_catalog")
