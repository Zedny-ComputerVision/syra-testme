from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.config import get_settings
from ...core.security import hash_password
from ...models import User, RoleEnum, Course, CourseStatus, Node, QuestionPool, Exam, ExamStatus, ExamType, Question
from ..deps import get_db_dep

settings = get_settings()
router = APIRouter()


def _require_enabled():
    if not settings.E2E_SEED_ENABLED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Seed endpoint disabled")


@router.post("/testing/reset-seed")
def reset_seed(db: Session = Depends(get_db_dep)):
    _require_enabled()
    # Truncate key tables
    db.execute(text("TRUNCATE TABLE attempt_answers, attempts, questions, exams, nodes, courses, question_pools, users RESTART IDENTITY CASCADE"))
    now = datetime.now(timezone.utc)

    # Admin
    admin_email = "admin@example.com"
    admin_password = "Password123!"
    admin = User(
        email=admin_email,
        name="Admin",
        user_id="ADM001",
        role=RoleEnum.ADMIN,
        hashed_password=hash_password(admin_password),
        created_at=now,
        updated_at=now,
    )
    db.add(admin)
    db.flush()

    # Learners
    learners = []
    for i in range(2):
        email = f"learner{i+1}@example.com"
        usr = User(
            email=email,
            name=f"Learner {i+1}",
            user_id=f"LRN00{i+1}",
            role=RoleEnum.LEARNER,
            hashed_password=hash_password("Password123!"),
            created_at=now,
            updated_at=now,
        )
        db.add(usr)
        learners.append(usr)
    db.flush()

    # Course / Node / Pool
    course = Course(
        title="E2E Course",
        description="Seeded course",
        status=CourseStatus.DRAFT,
        created_by_id=admin.id,
        created_at=now,
        updated_at=now,
    )
    db.add(course)
    db.flush()

    node = Node(course_id=course.id, title="Module 1", order=0, created_at=now, updated_at=now)
    db.add(node)
    db.flush()

    pool = QuestionPool(
        name="Seed Pool",
        description="Pool for seeding",
        created_by_id=admin.id,
        created_at=now,
        updated_at=now,
    )
    db.add(pool)
    db.flush()

    exam = Exam(
        node_id=node.id,
        title="Seed Exam",
        type=ExamType.MCQ,
        status=ExamStatus.OPEN,
        time_limit=20,
        max_attempts=1,
        passing_score=50,
        created_by_id=admin.id,
        created_at=now,
        updated_at=now,
    )
    db.add(exam)
    db.flush()

    q = Question(
        exam_id=exam.id,
        text="2+2=?",
        type=ExamType.MCQ,
        options=["4", "5", "6", "7"],
        correct_answer="4",
        points=1,
        order=1,
        pool_id=None,
        created_at=now,
        updated_at=now,
    )
    db.add(q)

    db.commit()
    return {
        "admin": {"email": admin_email, "password": admin_password},
        "learners": [{"email": l.email, "password": "Password123!", "user_id": l.user_id} for l in learners],
        "course": {"id": str(course.id)},
        "node": {"id": str(node.id), "course_id": str(course.id)},
        "pool": {"id": str(pool.id)},
        "exam": {"id": str(exam.id)},
    }
