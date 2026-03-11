from __future__ import annotations

from sqlalchemy.orm import Session


class ReportRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, model, identity):
        return self.db.get(model, identity)

    def scalar(self, statement):
        return self.db.scalar(statement)

    def scalars(self, statement):
        return self.db.scalars(statement)

    def execute(self, statement):
        return self.db.execute(statement)

    def add(self, entity) -> None:
        self.db.add(entity)

    def commit(self) -> None:
        self.db.commit()

    def refresh(self, entity) -> None:
        self.db.refresh(entity)

    def delete(self, entity) -> None:
        self.db.delete(entity)
