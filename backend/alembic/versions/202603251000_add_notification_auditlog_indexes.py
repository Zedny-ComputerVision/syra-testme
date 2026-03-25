"""Add indexes on notification.user_id and audit_log.user_id/created_at.

Revision ID: 202603251000
Revises: 202603151930
Create Date: 2026-03-25 10:00:00
"""

from __future__ import annotations

from alembic import op

revision = "202603251000"
down_revision = "202603151930"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_notification_user_id", "notifications", ["user_id"])
    op.create_index("ix_audit_log_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_log_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_log_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_log_user_id", table_name="audit_logs")
    op.drop_index("ix_notification_user_id", table_name="notifications")
