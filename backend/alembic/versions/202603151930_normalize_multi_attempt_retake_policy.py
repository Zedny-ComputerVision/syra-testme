"""Normalize multi-attempt retake policy.

Revision ID: 202603151930
Revises: 202603121200
Create Date: 2026-03-15 19:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "202603151930"
down_revision = "202603121200"
branch_labels = None
depends_on = None


_INSERT_RUNTIME_SQL = sa.text(
    """
    INSERT INTO exam_runtime_configs (
        exam_id,
        instructions,
        instructions_heading,
        instructions_body,
        completion_message,
        instructions_require_acknowledgement,
        show_test_instructions,
        show_score_report,
        show_answer_review,
        show_correct_answers,
        allow_retake,
        retake_cooldown_hours,
        auto_logout_after_finish_or_pause,
        creation_method,
        score_report_include_certificate_status
    ) VALUES (
        :exam_id,
        NULL,
        NULL,
        NULL,
        NULL,
        :instructions_require_acknowledgement,
        :show_test_instructions,
        :show_score_report,
        :show_answer_review,
        :show_correct_answers,
        :allow_retake,
        NULL,
        :auto_logout_after_finish_or_pause,
        NULL,
        :score_report_include_certificate_status
    )
    """
)

_UPDATE_RUNTIME_SQL = sa.text(
    """
    UPDATE exam_runtime_configs
    SET allow_retake = :allow_retake
    WHERE exam_id = :exam_id
    """
)


def upgrade() -> None:
    bind = op.get_bind()
    exam_rows = bind.execute(sa.text("SELECT id, max_attempts FROM exams")).fetchall()
    runtime_rows = {
        str(exam_id): bool(allow_retake)
        for exam_id, allow_retake in bind.execute(
            sa.text("SELECT exam_id, allow_retake FROM exam_runtime_configs")
        ).fetchall()
    }

    for exam_id, max_attempts in exam_rows:
        exam_id_str = str(exam_id)
        if int(max_attempts or 1) <= 1:
            continue
        if exam_id_str not in runtime_rows:
            bind.execute(
                _INSERT_RUNTIME_SQL,
                {
                    "exam_id": exam_id_str,
                    "instructions_require_acknowledgement": False,
                    "show_test_instructions": True,
                    "show_score_report": False,
                    "show_answer_review": False,
                    "show_correct_answers": False,
                    "allow_retake": True,
                    "auto_logout_after_finish_or_pause": False,
                    "score_report_include_certificate_status": False,
                },
            )
            continue
        if runtime_rows[exam_id_str] is False:
            bind.execute(
                _UPDATE_RUNTIME_SQL,
                {
                    "exam_id": exam_id_str,
                    "allow_retake": True,
                },
            )


def downgrade() -> None:
    # Data normalization is intentionally left in place.
    return None
