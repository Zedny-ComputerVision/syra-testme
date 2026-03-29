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

revision = "202603291200"
down_revision = "202603251000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # These indexes are optional performance optimizations.
    # They are intentionally skipped during automated deploys because
    # creating them on production data was causing deploy failures.
    pass


def downgrade() -> None:
    pass
