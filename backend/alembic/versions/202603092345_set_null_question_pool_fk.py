"""set null on question pool foreign key

Revision ID: 202603092345
Revises: 202603092230
Create Date: 2026-03-09 23:45:00
"""

from alembic import op
import sqlalchemy as sa


revision = "202603092345"
down_revision = "202603092230"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    foreign_keys = inspector.get_foreign_keys("questions")
    target_name = None

    for fk in foreign_keys:
        if fk.get("referred_table") == "question_pools" and fk.get("constrained_columns") == ["pool_id"]:
            target_name = fk.get("name")
            break

    if target_name:
        op.drop_constraint(target_name, "questions", type_="foreignkey")

    op.create_foreign_key(
        "fk_questions_pool_id_question_pools",
        "questions",
        "question_pools",
        ["pool_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_questions_pool_id_question_pools", "questions", type_="foreignkey")
    op.create_foreign_key(
        "fk_questions_pool_id",
        "questions",
        "question_pools",
        ["pool_id"],
        ["id"],
    )
