import pytest
from fastapi.testclient import TestClient

from src.app.main import app, ALLOWED_ORIGINS, _origin_is_allowed

client = TestClient(app)


@pytest.mark.parametrize("path", ["/api/exams", "/api/exams/"])
@pytest.mark.parametrize("origin", [
    "http://127.0.0.1:5174",
    "http://localhost:3000",
])
def test_exams_cors_allows_localhost_dev_ports(path, origin):
    res = client.options(path, headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
    assert res.status_code in (200, 204)
    assert res.headers.get("access-control-allow-origin") == origin

    res2 = client.post(path, json={"title": "Cors Test", "node_id": None}, headers={"Origin": origin})
    # May fail validation; but CORS header must be present regardless
    assert res2.headers.get("access-control-allow-origin") == origin


@pytest.mark.parametrize("path", ["/api/exams", "/api/exams/"])
def test_exams_cors_allows_configured_frontend(path):
    origin = ALLOWED_ORIGINS[1] if len(ALLOWED_ORIGINS) > 1 else ALLOWED_ORIGINS[0]
    res = client.options(path, headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
    assert res.status_code in (200, 204)
    assert res.headers.get("access-control-allow-origin") == origin


@pytest.mark.parametrize("origin,allowed", [
    ("http://localhost:5174", True),
    ("http://127.0.0.1:9999", True),
    ("https://localhost:4443", True),
    ("https://evil.example.com", False),
])
def test_origin_is_allowed_handles_local_dev_regex(origin, allowed):
    assert _origin_is_allowed(origin) is allowed
