"""add exam and question check constraints

Revision ID: 202603092230
Revises: 202603091830
Create Date: 2026-03-09 22:30:00
"""

from alembic import op


revision = "202603092230"
down_revision = "202603091830"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE exams SET max_attempts = 1 WHERE max_attempts IS NULL OR max_attempts < 1")
    op.execute("UPDATE exams SET passing_score = NULL WHERE passing_score < 0 OR passing_score > 100")
    op.execute('UPDATE questions SET points = 0 WHERE points < 0')
    op.execute('UPDATE questions SET "order" = 0 WHERE "order" < 0')

    op.create_check_constraint(
        "ck_exams_time_limit_positive",
        "exams",
        "time_limit > 0 OR time_limit IS NULL",
    )
    op.create_check_constraint(
        "ck_exams_passing_score_range",
        "exams",
        "passing_score >= 0 AND passing_score <= 100",
    )
    op.create_check_constraint(
        "ck_exams_max_attempts_positive",
        "exams",
        "max_attempts >= 1",
    )
    op.create_check_constraint(
        "ck_questions_points_non_negative",
        "questions",
        "points >= 0",
    )
    op.create_check_constraint(
        "ck_questions_order_non_negative",
        "questions",
        '"order" >= 0',
    )


def downgrade() -> None:
    op.drop_constraint("ck_questions_order_non_negative", "questions", type_="check")
    op.drop_constraint("ck_questions_points_non_negative", "questions", type_="check")
    op.drop_constraint("ck_exams_max_attempts_positive", "exams", type_="check")
    op.drop_constraint("ck_exams_passing_score_range", "exams", type_="check")
    op.drop_constraint("ck_exams_time_limit_positive", "exams", type_="check")
