from datetime import datetime, timedelta, timezone

from src.app.core.security import create_access_token
from src.app.models import GradingScale, RoleEnum, Schedule, User


def _assign_exam_to_learner(client, admin_headers, exam_id, learner_id, db):
    response = client.post(
        "/api/schedules/",
        headers=admin_headers,
        json={
            "exam_id": exam_id,
            "user_id": str(learner_id),
            "scheduled_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
            "access_mode": "OPEN",
        },
    )
    assert response.status_code == 200
    schedule = db.get(Schedule, response.json()["id"])
    schedule.scheduled_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return response.json()


def _create_open_exam(client, admin_headers, *, grading_scale_id=None, learner_id=None, db=None, title="Practice Test"):
    exam_response = client.post(
        "/api/exams/",
        headers=admin_headers,
        json={
            "title": title,
            "exam_type": "MCQ",
            "status": "CLOSED",
            "time_limit_minutes": 30,
            "max_attempts": 3,
            "passing_score": 60,
            "grading_scale_id": grading_scale_id,
        },
    )
    assert exam_response.status_code == 200
    exam_id = exam_response.json()["id"]

    question_response = client.post(
        "/api/questions/",
        headers=admin_headers,
        json={
            "exam_id": exam_id,
            "question_type": "MCQ",
            "text": "What is 2 + 2?",
            "options": ["3", "4"],
            "correct_answer": "B",
            "points": 2,
            "order": 0,
        },
    )
    assert question_response.status_code == 200

    publish_response = client.put(
        f"/api/exams/{exam_id}",
        headers=admin_headers,
        json={"status": "OPEN"},
    )
    assert publish_response.status_code == 200
    if learner_id:
        _assign_exam_to_learner(client, admin_headers, exam_id, learner_id, db)
    return publish_response.json(), question_response.json()


def _start_attempt(client, learner_headers, exam_id, question_id, answer):
    attempt_response = client.post(
        "/api/attempts/",
        headers=learner_headers,
        json={"exam_id": exam_id},
    )
    assert attempt_response.status_code == 200
    attempt_id = attempt_response.json()["id"]

    answer_response = client.post(
        f"/api/attempts/{attempt_id}/answers",
        headers=learner_headers,
        json={"question_id": question_id, "answer": answer},
    )
    assert answer_response.status_code == 200

    submit_response = client.post(
        f"/api/attempts/{attempt_id}/submit",
        headers=learner_headers,
    )
    return attempt_id, answer_response.json(), submit_response


def test_submit_correct_attempt_returns_full_score(client, admin_headers, learner_headers, learner_user, db):
    exam, question = _create_open_exam(client, admin_headers, learner_id=learner_user.id, db=db)
    _, _, submit_response = _start_attempt(
        client,
        learner_headers,
        exam["id"],
        question["id"],
        "B",
    )

    assert submit_response.status_code == 200
    body = submit_response.json()
    assert body["status"] == "SUBMITTED"
    assert body["score"] == 100.0
    assert body["grade"] is None


def test_learner_can_fetch_questions_without_correct_answers(client, admin_headers, learner_headers, learner_user, db):
    exam, _question = _create_open_exam(client, admin_headers, learner_id=learner_user.id, db=db)

    response = client.get(
        "/api/questions/",
        headers=learner_headers,
        params={"exam_id": exam["id"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["question_type"] == "MCQ"
    assert body[0]["correct_answer"] is None


def test_submit_incorrect_attempt_returns_zero_score(client, admin_headers, learner_headers, learner_user, db):
    exam, question = _create_open_exam(client, admin_headers, learner_id=learner_user.id, db=db)
    _, _, submit_response = _start_attempt(
        client,
        learner_headers,
        exam["id"],
        question["id"],
        "A",
    )

    assert submit_response.status_code == 200
    body = submit_response.json()
    assert body["status"] == "SUBMITTED"
    assert body["score"] == 0.0
    assert body["grade"] is None


def test_grading_scale_label_is_applied_on_submit(client, admin_headers, learner_headers, learner_user, db):
    scale = GradingScale(
        name="Letter Grades",
        labels=[
            {"label": "A", "min_score": 90, "max_score": 100},
            {"label": "B", "min_score": 80, "max_score": 89.99},
        ],
    )
    db.add(scale)
    db.commit()
    db.refresh(scale)

    exam, question = _create_open_exam(
        client,
        admin_headers,
        grading_scale_id=str(scale.id),
        learner_id=learner_user.id,
        db=db,
    )
    _, _, submit_response = _start_attempt(
        client,
        learner_headers,
        exam["id"],
        question["id"],
        "B",
    )

    assert submit_response.status_code == 200
    body = submit_response.json()
    assert body["score"] == 100.0
    assert body["grade"] == "A"


def test_manual_review_finalize_sets_graded_status(client, admin_headers, learner_headers, learner_user, db):
    exam_response = client.post(
        "/api/exams/",
        headers=admin_headers,
        json={
            "title": "Essay Test",
            "exam_type": "TEXT",
            "status": "CLOSED",
            "time_limit_minutes": 30,
            "max_attempts": 2,
            "passing_score": 50,
        },
    )
    assert exam_response.status_code == 200
    exam_id = exam_response.json()["id"]

    question_response = client.post(
        "/api/questions/",
        headers=admin_headers,
        json={
            "exam_id": exam_id,
            "question_type": "TEXT",
            "text": "Explain event bubbling.",
            "points": 5,
            "order": 0,
        },
    )
    assert question_response.status_code == 200
    question_id = question_response.json()["id"]

    open_response = client.put(
        f"/api/exams/{exam_id}",
        headers=admin_headers,
        json={"status": "OPEN"},
    )
    assert open_response.status_code == 200
    _assign_exam_to_learner(client, admin_headers, exam_id, learner_user.id, db)

    attempt_response = client.post(
        "/api/attempts/",
        headers=learner_headers,
        json={"exam_id": exam_id},
    )
    assert attempt_response.status_code == 200
    attempt_id = attempt_response.json()["id"]

    answer_response = client.post(
        f"/api/attempts/{attempt_id}/answers",
        headers=learner_headers,
        json={"question_id": question_id, "answer": "It propagates to ancestor elements."},
    )
    assert answer_response.status_code == 200
    answer_id = answer_response.json()["id"]

    submit_response = client.post(
        f"/api/attempts/{attempt_id}/submit",
        headers=learner_headers,
    )
    assert submit_response.status_code == 200
    assert submit_response.json()["score"] == 0.0
    assert submit_response.json()["pending_manual_review"] is True

    review_response = client.post(
        f"/api/attempts/{attempt_id}/answers/{answer_id}/review",
        headers=admin_headers,
        json={"points_earned": 5},
    )
    assert review_response.status_code == 200
    assert review_response.json()["points_earned"] == 5.0

    finalize_response = client.post(
        f"/api/attempts/{attempt_id}/finalize-review",
        headers=admin_headers,
    )

    assert finalize_response.status_code == 200
    body = finalize_response.json()
    assert body["status"] == "GRADED"
    assert body["score"] == 100.0


def test_admin_attempt_list_only_shows_owned_exam_attempts(client, admin_headers, learner_headers, learner_user, make_user, db):
    own_exam, own_question = _create_open_exam(
        client,
        admin_headers,
        learner_id=learner_user.id,
        db=db,
        title="Practice Test - Owner",
    )
    own_attempt_id, _, own_submit_response = _start_attempt(
        client,
        learner_headers,
        own_exam["id"],
        own_question["id"],
        "B",
    )
    assert own_submit_response.status_code == 200

    other_admin = make_user(
        email="other-admin@example.com",
        name="Other Admin",
        user_id="ADM777",
        role=RoleEnum.ADMIN,
    )
    other_admin_headers = {
        "Authorization": f"Bearer {create_access_token(str(other_admin.id), other_admin.user_id, other_admin.role.value, name=other_admin.name, email=other_admin.email)}",
    }
    other_exam, other_question = _create_open_exam(
        client,
        other_admin_headers,
        learner_id=learner_user.id,
        db=db,
        title="Practice Test - Other",
    )
    other_attempt_id, _, other_submit_response = _start_attempt(
        client,
        learner_headers,
        other_exam["id"],
        other_question["id"],
        "B",
    )
    assert other_submit_response.status_code == 200

    response = client.get("/api/attempts/", headers=admin_headers)

    assert response.status_code == 200
    attempt_ids = {item["id"] for item in response.json()["items"]}
    assert own_attempt_id in attempt_ids
    assert other_attempt_id not in attempt_ids
