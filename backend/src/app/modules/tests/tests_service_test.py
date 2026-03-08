import uuid
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from src.app.api.deps import get_db_dep, get_current_user
from src.app.db.base import Base
from src.app.modules.tests.routes_admin import router as admin_tests_router
from src.app.modules.tests.enums import TestStatus, TestType
from src.app.models import ExamType, Question, RoleEnum


class DummyUser:
    def __init__(self, role=RoleEnum.ADMIN):
        self.role = role


def create_app_and_db():
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    # import models to register with Base
    from src.app.modules.tests import models as _  # noqa: F401
    from src.app import models as _core  # noqa: F401

    Base.metadata.create_all(engine)

    def get_db_override():
        db = TestingSessionLocal()
        try:
            yield db
            db.commit()
        finally:
            db.close()

    app = FastAPI()
    app.include_router(admin_tests_router, prefix="/api")
    app.dependency_overrides[get_db_dep] = get_db_override
    app.dependency_overrides[get_current_user] = lambda: DummyUser()
    app.state.testing_session_local = TestingSessionLocal
    return app


@pytest.fixture()
def client():
    app = create_app_and_db()
    with TestClient(app) as c:
        yield c


def _create_test(client, name="Sample", type="MCQ"):
    resp = client.post("/api/admin/tests", json={"name": name, "type": type})
    assert resp.status_code == 201
    return resp.json()


def _add_question(client, test_id):
    db = client.app.state.testing_session_local()
    try:
        db.add(
            Question(
                exam_id=uuid.UUID(test_id),
                text="Question 1",
                type=ExamType.MCQ,
                options=["A", "B"],
                correct_answer="A",
                points=1.0,
                order=0,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
    finally:
        db.close()


def test_publish_generates_code_and_sets_status(client):
    created = _create_test(client, "Draft One")
    test_id = created["id"]
    _add_question(client, test_id)
    resp = client.post(f"/api/admin/tests/{test_id}/publish")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == TestStatus.PUBLISHED.value
    assert body["code"] is not None
    assert 6 <= len(body["code"]) <= 12
    # idempotent
    resp2 = client.post(f"/api/admin/tests/{test_id}/publish")
    assert resp2.status_code == 200
    body2 = resp2.json()
    assert body2["code"] == body["code"]
    assert body2["status"] == TestStatus.PUBLISHED.value


def test_patch_locked_fields_returns_409(client):
    created = _create_test(client, "Lock Me")
    test_id = created["id"]
    _add_question(client, test_id)
    client.post(f"/api/admin/tests/{test_id}/publish")
    resp = client.patch(f"/api/admin/tests/{test_id}", json={"time_limit_minutes": 45})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "LOCKED_FIELDS"


def test_list_filters_and_pagination(client):
    # create several tests
    t1 = _create_test(client, "Alpha")
    t2 = _create_test(client, "Beta")
    t3 = _create_test(client, "Gamma")
    _add_question(client, t2["id"])
    _add_question(client, t3["id"])
    client.post(f"/api/admin/tests/{t2['id']}/publish")
    client.post(f"/api/admin/tests/{t3['id']}/archive")

    resp = client.get("/api/admin/tests", params={"page": 1, "page_size": 2, "search": "a"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 1
    assert data["page_size"] == 2
    assert data["total"] >= 2
    # archived should be excluded by default
    ids = [item["id"] for item in data["items"]]
    assert t3["id"] not in ids

    # filter by status
    resp2 = client.get("/api/admin/tests", params={"status": "PUBLISHED"})
    assert resp2.status_code == 200
    for item in resp2.json()["items"]:
        assert item["status"] == TestStatus.PUBLISHED.value


def test_delete_non_draft_returns_409_forbidden_error(client):
    created = _create_test(client, "Delete Guard")
    test_id = created["id"]
    _add_question(client, test_id)
    client.post(f"/api/admin/tests/{test_id}/publish")
    resp = client.delete(f"/api/admin/tests/{test_id}")
    assert resp.status_code == 409
    body = resp.json()
    assert "error" in body
    assert body["error"]["code"] == "FORBIDDEN"


def test_report_endpoint_returns_html_report(client):
    created = _create_test(client, "Report Available")
    test_id = created["id"]
    resp = client.get(f"/api/admin/tests/{test_id}/report")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    assert "Report Available Report" in resp.text


def test_patch_archived_returns_409_locked_fields(client):
    created = _create_test(client, "Archived Lock")
    test_id = created["id"]
    client.post(f"/api/admin/tests/{test_id}/archive")
    resp = client.patch(f"/api/admin/tests/{test_id}", json={"name": "Should fail"})
    assert resp.status_code == 409
    body = resp.json()
    assert body["error"]["code"] == "LOCKED_FIELDS"


def test_runtime_settings_round_trip_on_admin_tests(client):
    created = client.post(
        "/api/admin/tests",
        json={
            "name": "Runtime Settings",
            "type": "MCQ",
            "runtime_settings": {
                "instructions": "Read carefully",
                "show_score_report": True,
                "show_answer_review": False,
            },
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["runtime_status"] == "CLOSED"
    assert body["runtime_settings"]["instructions"] == "Read carefully"
    assert body["runtime_settings"]["show_score_report"] is True

    test_id = body["id"]
    updated = client.patch(
        f"/api/admin/tests/{test_id}",
        json={
            "runtime_settings": {
                "instructions": "Updated instructions",
                "show_score_report": False,
                "show_answer_review": True,
            }
        },
    )
    assert updated.status_code == 200
    updated_body = updated.json()
    assert updated_body["runtime_settings"]["instructions"] == "Updated instructions"
    assert updated_body["runtime_settings"]["show_score_report"] is False
    assert updated_body["runtime_settings"]["show_answer_review"] is True
