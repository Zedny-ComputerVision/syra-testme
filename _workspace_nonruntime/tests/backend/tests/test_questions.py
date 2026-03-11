import uuid

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.app.api.routes import exams as exams_routes
from src.app.schemas import QuestionCreate, ExamType


def test_question_accepts_question_type_alias_and_trims():
    q = QuestionCreate.model_validate({
        "exam_id": uuid.uuid4(),
        "text": "  Sample MCQ ",
        "question_type": "MCQ",
        "options": ["  opt1  ", "opt2", " ", ""],
        "correct_answer": "A",
        "points": 2,
        "order": 0,
    })
    assert q.type == ExamType.MCQ
    assert q.text == "Sample MCQ"
    assert q.options == ["opt1", "opt2"]
    assert q.correct_answer == "A"
    assert q.points == 2


def test_question_mcq_requires_two_options():
    with pytest.raises(ValidationError):
        QuestionCreate.model_validate({
            "exam_id": uuid.uuid4(),
            "text": "Bad MCQ",
            "question_type": "MCQ",
            "options": ["only one"],
            "correct_answer": "A",
        })


def test_assert_has_questions_raises_when_empty():
    class DummySession:
        def scalar(self, _):
            return 0
    with pytest.raises(HTTPException) as exc:
        exams_routes._assert_has_questions(DummySession(), uuid.uuid4())
    assert exc.value.status_code == 400
