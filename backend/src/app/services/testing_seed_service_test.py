import unittest

from .testing_seed_service import _clear_seed_tables
from ..db.base import Base


class _RecordingSession:
    def __init__(self):
        self.statements = []

    def execute(self, statement):
        self.statements.append(str(statement))


class TestingSeedServiceTest(unittest.TestCase):
    def test_clear_seed_tables_uses_ordered_deletes(self):
        session = _RecordingSession()

        _clear_seed_tables(session)

        expected = [f"DELETE FROM {table.name}" for table in reversed(Base.metadata.sorted_tables)]
        self.assertEqual(session.statements, expected)
        self.assertTrue(all("TRUNCATE" not in statement for statement in session.statements))


if __name__ == "__main__":
    unittest.main()
