from sqlalchemy.orm import Session


class ProctoringRepository:
    def __init__(self, db: Session):
        self.db = db
