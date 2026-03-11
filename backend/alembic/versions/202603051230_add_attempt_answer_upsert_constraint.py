"""dedupe attempt answers and enforce uniqueness

Revision ID: 202603051230
Revises: 202603042210
Create Date: 2026-03-05 12:30:00

This migration keeps exactly one row per (attempt_id, question_id) by deleting
rows where a lexicographically greater UUID id exists for the same pair.
The table has no write timestamp, so id ordering is used as deterministic fallback.
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "202603051230"
down_revision = "202603042210"
branch_labels = None
depends_on = None


def upgrade() -> None:
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

    op.create_unique_constraint(
        "uq_attempt_answer_attempt_question",
        "attempt_answers",
        ["attempt_id", "question_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_attempt_answer_attempt_question", "attempt_answers", type_="unique")
