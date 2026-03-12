from datetime import datetime, timedelta, timezone

from src.app.models import AccessMode, Course, CourseStatus, Exam, ExamStatus, ExamType, Node, RoleEnum, Schedule, User


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


def test_learner_exam_list_honors_restricted_schedule_rules(client, db, learner_user, learner_headers):
    admin = User(
        email="owner@example.com",
        name="Owner",
        user_id="ADM100",
        role=RoleEnum.ADMIN,
        hashed_password="hashed",
    )
    db.add(admin)
    db.flush()

    course = Course(
        title="Learner Access Course",
        description="",
        status=CourseStatus.PUBLISHED,
        created_by_id=admin.id,
    )
    db.add(course)
    db.flush()

    node = Node(course_id=course.id, title="Module 1", order=0)
    db.add(node)
    db.flush()

    unrestricted = Exam(
        node_id=node.id,
        title="Open Access Exam",
        type=ExamType.MCQ,
        status=ExamStatus.OPEN,
        max_attempts=1,
    )
    restricted_other = Exam(
        node_id=node.id,
        title="Restricted Other Learner",
        type=ExamType.MCQ,
        status=ExamStatus.OPEN,
        max_attempts=1,
    )
    restricted_future = Exam(
        node_id=node.id,
        title="Restricted Future Slot",
        type=ExamType.MCQ,
        status=ExamStatus.OPEN,
        max_attempts=1,
    )
    restricted_past = Exam(
        node_id=node.id,
        title="Restricted Ready Now",
        type=ExamType.MCQ,
        status=ExamStatus.OPEN,
        max_attempts=1,
    )
    db.add_all([unrestricted, restricted_other, restricted_future, restricted_past])
    db.flush()

    other_learner = User(
        email="other@example.com",
        name="Other Learner",
        user_id="LRN999",
        role=RoleEnum.LEARNER,
        hashed_password="hashed",
    )
    db.add(other_learner)
    db.flush()

    now = datetime.now(timezone.utc)
    db.add_all(
        [
            Schedule(
                exam_id=restricted_other.id,
                user_id=other_learner.id,
                access_mode=AccessMode.RESTRICTED,
                scheduled_at=now - timedelta(minutes=5),
            ),
            Schedule(
                exam_id=restricted_future.id,
                user_id=learner_user.id,
                access_mode=AccessMode.RESTRICTED,
                scheduled_at=now + timedelta(minutes=30),
            ),
            Schedule(
                exam_id=restricted_past.id,
                user_id=learner_user.id,
                access_mode=AccessMode.RESTRICTED,
                scheduled_at=now - timedelta(minutes=5),
            ),
        ]
    )
    db.commit()

    response = client.get("/api/exams/?skip=0&limit=50", headers=learner_headers)

    assert response.status_code == 200
    titles = {item["title"] for item in response.json()["items"]}
    assert "Open Access Exam" in titles
    assert "Restricted Ready Now" in titles
    assert "Restricted Other Learner" not in titles
    assert "Restricted Future Slot" not in titles
