import json
import sys
from types import SimpleNamespace

from src.app.api.routes import ai as ai_routes
from src.app.core.config import Settings


def test_settings_normalize_placeholder_openai_key():
    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql+psycopg://postgres:password@localhost:5432/syra_lms",
        JWT_SECRET="test-secret-key-with-at-least-32-chars",
        OPENAI_API_KEY="your-openai-key-optional",
    )

    assert settings.OPENAI_API_KEY is None


def test_generate_questions_uses_offline_fallback_when_openai_key_missing(client, monkeypatch):
    monkeypatch.setattr(ai_routes, "get_settings", lambda: SimpleNamespace(OPENAI_API_KEY=None))

    response = client.post(
        "/api/ai/generate-questions",
        json={"topic": "Algebra", "count": 2, "difficulty": "easy", "question_type": "MCQ"},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["text"].startswith("[Offline] Algebra sample question 1")
    assert data[0]["options"] == ["Option A", "Option B", "Option C", "Option D"]
    assert data[0]["correct_answer"] == "A"


def test_generate_questions_parses_openai_json_payload(client, monkeypatch):
    class DummyOpenAI:
        def __init__(self, api_key: str):
            assert api_key == "sk-test"
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

        @staticmethod
        def _create(**kwargs):
            assert kwargs["response_format"] == {"type": "json_object"}
            payload = {
                "questions": [
                    {
                        "text": "What is 2 + 2?",
                        "options": ["3", "4", "5", "6"],
                        "correct_answer": "4",
                        "explanation": "Adding two and two gives four.",
                    }
                ]
            }
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))]
            )

    monkeypatch.setattr(ai_routes, "get_settings", lambda: SimpleNamespace(OPENAI_API_KEY="sk-test"))
    monkeypatch.setitem(sys.modules, "openai", SimpleNamespace(OpenAI=DummyOpenAI))

    response = client.post(
        "/api/ai/generate-questions",
        json={"topic": "Arithmetic", "count": 1, "difficulty": "easy", "question_type": "MCQ"},
    )

    assert response.status_code == 200
    assert response.json() == [
        {
            "text": "What is 2 + 2?",
            "options": ["3", "4", "5", "6"],
            "correct_answer": "4",
            "explanation": "Adding two and two gives four.",
        }
    ]
