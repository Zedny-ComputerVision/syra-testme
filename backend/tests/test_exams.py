def _create_admin_test(client, admin_headers, *, name="Admin Test"):
    response = client.post(
        "/api/admin/tests/",
        headers=admin_headers,
        json={
            "name": name,
            "type": "MCQ",
            "time_limit_minutes": 45,
            "attempts_allowed": 2,
            "passing_score": 70,
        },
    )
    assert response.status_code == 201
    return response.json()


def _add_question_to_test(client, admin_headers, exam_id):
    response = client.post(
        "/api/questions/",
        headers=admin_headers,
        json={
            "exam_id": exam_id,
            "question_type": "MCQ",
            "text": "What color is the sky?",
            "options": ["Blue", "Green"],
            "correct_answer": "A",
            "points": 1,
            "order": 0,
        },
    )
    assert response.status_code == 200
    return response.json()


def test_create_admin_test_returns_draft_detail(client, admin_headers):
    response = client.post(
        "/api/admin/tests/",
        headers=admin_headers,
        json={
            "name": "Safety Assessment",
            "type": "MCQ",
            "time_limit_minutes": 45,
            "attempts_allowed": 2,
            "passing_score": 70,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Safety Assessment"
    assert body["status"] == "DRAFT"


def test_publish_requires_question_before_publishing(client, admin_headers):
    test_body = _create_admin_test(client, admin_headers, name="Questionless Test")

    response = client.post(
        f"/api/admin/tests/{test_body['id']}/publish",
        headers=admin_headers,
    )

    assert response.status_code == 400
    assert response.json()["error"]["message"] == "Test must have at least one question before publishing"


def test_publish_test_returns_published_status_and_code(client, admin_headers):
    test_body = _create_admin_test(client, admin_headers, name="Published Test")
    _add_question_to_test(client, admin_headers, test_body["id"])

    response = client.post(
        f"/api/admin/tests/{test_body['id']}/publish",
        headers=admin_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "PUBLISHED"
    assert body["code"]


def test_archive_test_returns_archived_status(client, admin_headers):
    test_body = _create_admin_test(client, admin_headers, name="Archived Test")
    _add_question_to_test(client, admin_headers, test_body["id"])
    publish_response = client.post(
        f"/api/admin/tests/{test_body['id']}/publish",
        headers=admin_headers,
    )
    assert publish_response.status_code == 200

    archive_response = client.post(
        f"/api/admin/tests/{test_body['id']}/archive",
        headers=admin_headers,
    )

    assert archive_response.status_code == 200
    body = archive_response.json()
    assert body["status"] == "ARCHIVED"
    assert body["runtime_status"] == "CLOSED"
