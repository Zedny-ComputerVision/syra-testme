import json

from src.app.models import User


def test_login_success_returns_tokens(client, learner_user):
    response = client.post(
        "/api/auth/login",
        json={"email": learner_user.email, "password": "Password123!"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["refresh_token"]


def test_login_invalid_password_returns_401(client, learner_user):
    response = client.post(
        "/api/auth/login",
        json={"email": learner_user.email, "password": "WrongPassword123!"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials"}


def test_signup_forbidden_when_disabled(client):
    response = client.post(
        "/api/auth/signup",
        json={
            "email": "new.user@example.com",
            "name": "New User",
            "user_id": "LRN777",
            "password": "Password123!",
        },
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Self sign-up disabled"}


def test_signup_success_when_enabled(client, db, enable_signup):
    response = client.post(
        "/api/auth/signup",
        json={
            "email": "new.user@example.com",
            "name": "New User",
            "user_id": "LRN777",
            "password": "Password123!",
        },
    )

    assert response.status_code == 200
    assert response.json()["detail"].startswith("Signup successful")

    created = db.query(User).filter(User.email == "new.user@example.com").one()
    assert created.name == "New User"
    assert created.user_id == "LRN777"


def test_me_returns_authenticated_user(client, learner_headers, learner_user):
    response = client.get("/api/auth/me", headers=learner_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == learner_user.email
    assert body["role"] == learner_user.role.value


def test_logout_returns_ok(client, learner_headers):
    response = client.post("/api/auth/logout", headers=learner_headers)

    assert response.status_code == 200
    assert response.json() == {"detail": "Logged out"}


def test_permissions_public_reflects_permission_updates_immediately(client, admin_headers, learner_headers):
    baseline = client.get("/api/admin-settings/permissions/public", headers=learner_headers)
    assert baseline.status_code == 200
    assert "View Dashboard" in baseline.json()["allowed_features"]

    updated_rows = json.dumps(
        [
            {"feature": "View Dashboard", "admin": True, "instructor": True, "learner": False},
            {"feature": "Manage Roles", "admin": True, "instructor": False, "learner": False},
            {"feature": "System Settings", "admin": True, "instructor": False, "learner": False},
        ]
    )
    update_response = client.put(
        "/api/admin-settings/permissions_config",
        headers=admin_headers,
        json={"value": updated_rows},
    )

    assert update_response.status_code == 200

    refreshed = client.get("/api/admin-settings/permissions/public", headers=learner_headers)
    assert refreshed.status_code == 200
    assert "View Dashboard" not in refreshed.json()["allowed_features"]
