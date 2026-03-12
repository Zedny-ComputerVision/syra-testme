"""add per-user token invalidation timestamp

Revision ID: 202603121200
Revises: 202603111600
Create Date: 2026-03-12 12:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "202603121200"
down_revision = "202603111600"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "token_invalid_before",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "token_invalid_before")
