from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..core.i18n import translate as _t
from ..core.config import get_settings
from ..core.security import hash_password
from ..db.base import Base
from ..models import Course, CourseStatus, Exam, ExamStatus, ExamType, Node, Question, QuestionPool, RoleEnum, User
from .normalized_relations import set_exam_library_pool


settings = get_settings()
logger = logging.getLogger(__name__)


def _clear_seed_tables(db: Session) -> None:
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(text(f"DELETE FROM {table.name}"))


def reset_seed(db: Session):
    if not settings.E2E_SEED_ENABLED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=_t("seed_endpoint_disabled"))

    # Avoid TRUNCATE here. E2E uses the live app process, and TRUNCATE takes
    # stronger locks that can block behind routine reads (for example settings
    # or auth bootstrap queries) until PostgreSQL statement timeout fires.
    _clear_seed_tables(db)
    now = datetime.now(timezone.utc)

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

    learners = []
    for index in range(2):
        email = f"learner{index + 1}@example.com"
        learner = User(
            email=email,
            name=f"Learner {index + 1}",
            user_id=f"LRN00{index + 1}",
            role=RoleEnum.LEARNER,
            hashed_password=hash_password("Password123!"),
            created_at=now,
            updated_at=now,
        )
        db.add(learner)
        learners.append(learner)
    db.flush()

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

    library_course = Course(
        title="Question Pool Library",
        description="Hidden library course for question pool storage",
        status=CourseStatus.DRAFT,
        created_by_id=admin.id,
        created_at=now,
        updated_at=now,
    )
    db.add(library_course)
    db.flush()

    library_node = Node(
        course_id=library_course.id,
        title="Shared Pool Questions",
        order=0,
        created_at=now,
        updated_at=now,
    )
    db.add(library_node)
    db.flush()

    library_exam = Exam(
        node_id=library_node.id,
        title=f"Pool Library {str(pool.id)[:8]}",
        description=f"Hidden storage exam for pool {pool.name}",
        type=ExamType.MCQ,
        status=ExamStatus.CLOSED,
        time_limit=60,
        max_attempts=1,
        created_by_id=admin.id,
        library_pool_id=pool.id,
        created_at=now,
        updated_at=now,
    )
    set_exam_library_pool(library_exam, pool.id)
    db.add(library_exam)
    db.flush()

    test = Exam(
        node_id=node.id,
        title="Seed Test",
        type=ExamType.MCQ,
        status=ExamStatus.OPEN,
        time_limit=20,
        max_attempts=5,
        passing_score=50,
        created_by_id=admin.id,
        created_at=now,
        updated_at=now,
        settings={"allow_retake": True},
        proctoring_config={
            "face_detection": True,
            "multi_face": True,
            "audio_detection": True,
            "object_detection": True,
            "eye_tracking": True,
            "head_pose_detection": True,
            "mouth_detection": True,
            "face_verify": True,
            "fullscreen_enforce": True,
            "tab_switch_detect": True,
            "screen_capture": True,
            "copy_paste_block": True,
            "identity_required": True,
            "camera_required": True,
            "mic_required": True,
            "fullscreen_required": True,
            "lighting_required": True,
            "max_tab_blurs": 3,
            "max_alerts_before_autosubmit": 10,
            "max_fullscreen_exits": 3,
            "frame_interval_ms": 900,
            "audio_chunk_ms": 2000,
            "screenshot_interval_sec": 60,
            "alert_rules": [],
        },
    )
    db.add(test)
    db.flush()

    pool_question = Question(
        exam_id=library_exam.id,
        text="CPU stands for?",
        type=ExamType.MCQ,
        options=["Central Processing Unit", "Computer Program Utility", "Central Program Unit", "Core Processing Utility"],
        correct_answer="Central Processing Unit",
        points=1,
        order=1,
        pool_id=pool.id,
        created_at=now,
        updated_at=now,
    )
    db.add(pool_question)

    question = Question(
        exam_id=test.id,
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
    db.add(question)
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to reset E2E seed data")
        raise
    return {
        "admin": {"email": admin_email, "password": admin_password},
        "learners": [{"email": learner.email, "password": "Password123!", "user_id": learner.user_id} for learner in learners],
        "course": {"id": str(course.id)},
        "node": {"id": str(node.id), "course_id": str(course.id)},
        "pool": {"id": str(pool.id)},
        "test": {"id": str(test.id)},
        "exam": {"id": str(test.id)},
    }
