from sqlalchemy.orm import Session


class AttemptRepository:
    def __init__(self, db: Session):
        self.db = db
