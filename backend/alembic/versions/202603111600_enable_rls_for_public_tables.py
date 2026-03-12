"""enable row level security for all public tables

Revision ID: 202603111600
Revises: 202603111030
Create Date: 2026-03-11 16:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202603111600"
down_revision = "202603111030"
branch_labels = None
depends_on = None


def _public_table_names(bind) -> list[str]:
    inspector = sa.inspect(bind)
    return sorted(inspector.get_table_names(schema="public"))


def _qualified_table_name(bind, table_name: str) -> str:
    preparer = bind.dialect.identifier_preparer
    return f"{preparer.quote_schema('public')}.{preparer.quote(table_name)}"


def _row_level_security_enabled(bind, table_name: str) -> bool:
    query = sa.text(
        """
        select c.relrowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = :table_name
        """
    )
    return bool(bind.execute(query, {"table_name": table_name}).scalar())


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for table_name in _public_table_names(bind):
        if _row_level_security_enabled(bind, table_name):
            continue
        op.execute(sa.text(f"ALTER TABLE {_qualified_table_name(bind, table_name)} ENABLE ROW LEVEL SECURITY"))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for table_name in _public_table_names(bind):
        if not _row_level_security_enabled(bind, table_name):
            continue
        op.execute(sa.text(f"ALTER TABLE {_qualified_table_name(bind, table_name)} DISABLE ROW LEVEL SECURITY"))
