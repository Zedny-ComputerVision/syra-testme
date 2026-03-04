import uuid
from sqlalchemy.dialects.postgresql import UUID as PGUUID


class GUID(PGUUID):
    """
    UUID column type that is lenient with string inputs.

    The stock PostgreSQL UUID type expects a uuid.UUID instance and calls
    `.hex` during binding, which fails if a plain string is passed (common
    when running against SQLite in dev). This subclass accepts strings,
    converts them to uuid.UUID when possible, and then defers to the normal
    processor. Works with both SQLite and PostgreSQL backends.
    """

    def bind_processor(self, dialect):
        super_proc = super().bind_processor(dialect)

        def process(value):
            if isinstance(value, str):
                try:
                    value = uuid.UUID(value)
                except ValueError:
                    # let the superclass raise for invalid UUID formats
                    pass
            if super_proc:
                return super_proc(value)
            return value

        return process
