from .repository import ProctoringRepository


class ProctoringService:
    def __init__(self, repository: ProctoringRepository):
        self.repository = repository
