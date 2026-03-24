from src.app.api.routes.question_pools import _load_pool_questions
from src.app.models import QuestionPool
from src.app.services import testing_seed_service


def test_reset_seed_populates_seed_pool(monkeypatch, db):
    monkeypatch.setattr(testing_seed_service.settings, "E2E_SEED_ENABLED", True)

    result = testing_seed_service.reset_seed(db)

    pool = db.get(QuestionPool, result["pool"]["id"])
    questions = _load_pool_questions(db, pool.id)

    assert pool is not None
    assert len(questions) == 1
    assert str(questions[0].pool_id) == str(pool.id)
