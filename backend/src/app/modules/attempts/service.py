from .repository import AttemptRepository


class AttemptService:
    def __init__(self, repository: AttemptRepository):
        self.repository = repository
