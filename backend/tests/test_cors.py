import pytest
from fastapi.testclient import TestClient

from src.app.main import app, ALLOWED_ORIGINS

client = TestClient(app)


@pytest.mark.parametrize("path", ["/api/exams", "/api/exams/"])
def test_exams_cors_allows_frontend(path):
    origin = ALLOWED_ORIGINS[1] if len(ALLOWED_ORIGINS) > 1 else ALLOWED_ORIGINS[0]
    res = client.options(path, headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
    assert res.status_code in (200, 204)
    assert res.headers.get("access-control-allow-origin") == origin

    res2 = client.post(path, json={"title": "Cors Test", "node_id": None}, headers={"Origin": origin})
    # May fail validation; but CORS header must be present regardless
    assert res2.headers.get("access-control-allow-origin") == origin
