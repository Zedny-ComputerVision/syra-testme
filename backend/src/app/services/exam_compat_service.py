from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import exists, func, or_, select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session, joinedload, selectinload

from ..api.deps import ensure_permission, learner_can_access_exam
from ..models import AccessMode, Course, CourseStatus, Exam, ExamStatus, Node, Question, RoleEnum, Schedule
from ..modules.tests.proctoring_requirements import normalize_proctoring_config
from ..schemas import ExamCreate, ExamRead, ExamUpdate, Message
from ..utils.pagination import build_page_response, clamp_sort_field, normalize_pagination
from .normalized_relations import (
    exam_certificate,
    exam_proctoring,
    exam_runtime_settings,
    set_exam_certificate,
    set_exam_proctoring,
    set_exam_runtime_settings,
)
from .sanitization import sanitize_exam_payload

logger = logging.getLogger(__name__)


DEFAULT_PROCTORING = {
    "face_detection": True,
    "multi_face": True,
    "audio_detection": True,
    "object_detection": True,
    "eye_tracking": True,
    "head_pose_detection": True,
    "mouth_detection": False,
    "face_verify": True,
    "fullscreen_enforce": True,
    "tab_switch_detect": True,
    "screen_capture": False,
    "copy_paste_block": True,
    "alert_rules": [],
    "eye_deviation_deg": 12,
    "mouth_open_threshold": 0.35,
    "audio_rms_threshold": 0.08,
    "max_face_absence_sec": 3,
    "max_tab_blurs": 3,
    "max_alerts_before_autosubmit": 5,
    "max_fullscreen_exits": 2,
    "max_alt_tabs": 3,
    "lighting_min_score": 0.35,
    "face_verify_id_threshold": 0.18,
    "max_score_before_autosubmit": 15,
    "frame_interval_ms": 1500,
    "audio_chunk_ms": 3000,
    "screenshot_interval_sec": 60,
    "face_verify_threshold": 0.15,
    "cheating_consecutive_frames": 5,
    "head_pose_consecutive": 5,
    "eye_consecutive": 5,
    "object_confidence_threshold": 0.5,
    "audio_consecutive_chunks": 2,
    "audio_window": 5,
    "head_pose_yaw_deg": 20,
    "head_pose_pitch_deg": 20,
    "head_pitch_min_rad": -0.3,
    "head_pitch_max_rad": 0.2,
    "head_yaw_min_rad": -0.6,
    "head_yaw_max_rad": 0.6,
    "eye_pitch_min_rad": -0.5,
    "eye_pitch_max_rad": 0.2,
    "eye_yaw_min_rad": -0.5,
    "eye_yaw_max_rad": 0.5,
    "pose_change_threshold_rad": 0.1,
    "eye_change_threshold_rad": 0.2,
}


def list_tests(
    *,
    db: Session,
    current,
    page: int | None,
    page_size: int | None,
    search: str | None,
    sort: str | None,
    order: str | None,
    skip: int | None,
    limit: int | None,
):
    pagination = normalize_pagination(
        page=page,
        page_size=page_size,
        search=search,
        sort=sort,
        order=order,
        skip=skip,
        limit=limit,
        default_sort="updated_at",
        default_page_size=50,
    )
    sort_field = clamp_sort_field(pagination.sort, {"created_at", "updated_at", "title"}, "updated_at")
    order_column = getattr(Exam, sort_field)
    order_column = order_column.asc() if pagination.order == "asc" else order_column.desc()

    query = (
        select(Exam)
        .options(
            joinedload(Exam.node).joinedload(Node.course),
            joinedload(Exam.category),
            selectinload(Exam.questions),
        )
        .where(Exam.library_pool_id.is_(None))
        .order_by(order_column, Exam.created_at.desc())
    )
    if pagination.search:
        like = f"%{pagination.search.lower()}%"
        query = query.where(
            or_(
                func.lower(Exam.title).like(like),
                func.lower(func.coalesce(Exam.description, "")).like(like),
            )
        )

    if current.role == RoleEnum.LEARNER:
        current_time = datetime.now(timezone.utc)
        restricted_schedule_exists = exists(
            select(Schedule.id).where(
                Schedule.exam_id == Exam.id,
                Schedule.access_mode == AccessMode.RESTRICTED,
            )
        )
        learner_schedule_available = exists(
            select(Schedule.id).where(
                Schedule.exam_id == Exam.id,
                Schedule.user_id == current.id,
                Schedule.scheduled_at <= current_time,
            )
        )
        query = query.where(
            Exam.status == ExamStatus.OPEN,
            or_(~restricted_schedule_exists, learner_schedule_available),
        )
        total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
        page_items = db.scalars(query.offset(pagination.offset).limit(pagination.limit)).all()
        return build_page_response(
            items=[serialize_legacy_test(test) for test in page_items],
            total=total,
            pagination=pagination,
            extended=False,
        )

    ensure_permission(db, current, "Edit Tests")
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    tests = db.scalars(query.offset(pagination.offset).limit(pagination.limit)).all()
    return build_page_response(
        items=[serialize_legacy_test(test) for test in tests],
        total=total,
        pagination=pagination,
        extended=False,
    )


def create_test(*, db: Session, body: ExamCreate, current) -> ExamRead:
    now = datetime.now(timezone.utc)
    payload = sanitize_exam_payload(body.model_dump(exclude={"questions"}))
    _validate_create_payload(body)

    node = _resolve_node(db=db, node_id=body.node_id, actor=current, now=now)
    test = Exam(
        node_id=node.id,
        title=body.title.strip(),
        description=payload.get("description"),
        type=body.type,
        status=body.status,
        time_limit=body.time_limit,
        max_attempts=body.max_attempts,
        passing_score=body.passing_score,
        category_id=body.category_id,
        grading_scale_id=body.grading_scale_id,
        created_at=now,
        updated_at=now,
        created_by_id=current.id,
    )
    set_exam_proctoring(test, normalize_proctoring(body.proctoring_config))
    set_exam_runtime_settings(test, payload.get("settings"))
    set_exam_certificate(test, body.certificate)
    db.add(test)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A test with this title already exists for this module")
    except OperationalError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc.orig}")
    db.refresh(test)
    return serialize_legacy_test(test)


def get_test(*, db: Session, test_id: str, current) -> ExamRead:
    test = db.get(Exam, parse_test_id(test_id))
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    if current.role == RoleEnum.LEARNER:
        if not learner_can_access_exam(db, test, current):
            raise HTTPException(status_code=404, detail="Test not found")
    else:
        ensure_permission(db, current, "Edit Tests")
    return serialize_legacy_test(test)


def update_test(*, db: Session, test_id: str, body: ExamUpdate, current) -> ExamRead:
    test = db.get(Exam, parse_test_id(test_id))
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    if current.role == RoleEnum.INSTRUCTOR and test.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    data = sanitize_exam_payload(body.model_dump(exclude_unset=True))
    if not data:
        return serialize_legacy_test(test)
    _validate_update_payload(data)

    for field, value in data.items():
        if field == "node_id":
            node = db.get(Node, value)
            if not node:
                raise HTTPException(status_code=404, detail="Node not found")
            test.node_id = value
            continue
        if field == "proctoring_config":
            set_exam_proctoring(test, normalize_proctoring(value))
            continue
        if field == "settings":
            set_exam_runtime_settings(test, value)
            continue
        if field == "certificate":
            set_exam_certificate(test, value)
            continue
        setattr(test, field, value)

    test.updated_at = datetime.now(timezone.utc)
    target_status = data.get("status", test.status)
    if target_status == ExamStatus.OPEN:
        assert_has_questions(db, test.id)
    db.add(test)
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to update legacy test %s", test_id)
        raise
    db.refresh(test)
    return serialize_legacy_test(test)


def delete_test(*, db: Session, test_id: str) -> Message:
    test = db.get(Exam, parse_test_id(test_id))
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    try:
        db.delete(test)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to delete legacy test %s", test_id)
        raise
    return Message(detail="Deleted")


def serialize_legacy_test(test: Exam) -> ExamRead:
    node = test.node
    course = node.course if node else None
    category_name = test.category.name if test.category else None
    return ExamRead(
        id=test.id,
        node_id=test.node_id,
        node_title=node.title if node else None,
        course_id=course.id if course else None,
        course_title=course.title if course else None,
        title=test.title,
        type=test.type,
        status=test.status,
        time_limit=test.time_limit,
        max_attempts=test.max_attempts,
        passing_score=test.passing_score,
        proctoring_config=exam_proctoring(test),
        description=test.description,
        settings=exam_runtime_settings(test),
        certificate=exam_certificate(test),
        category_id=test.category_id,
        grading_scale_id=test.grading_scale_id,
        category_name=category_name,
        time_limit_minutes=test.time_limit,
        created_at=test.created_at,
        updated_at=test.updated_at,
        question_count=test.question_count,
    )


def assert_has_questions(db: Session, test_id) -> None:
    count = db.scalar(select(func.count()).select_from(Question).where(Question.exam_id == test_id))
    if not count:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Test must have at least one question before publishing")


def parse_test_id(test_id: str) -> str:
    try:
        return str(UUID(test_id))
    except (TypeError, ValueError):
        raise HTTPException(status_code=404, detail="Test not found")


def normalize_proctoring(config: dict | None) -> dict:
    payload = DEFAULT_PROCTORING.copy()
    if config:
        payload.update({key: value for key, value in config.items() if value is not None})
    return normalize_proctoring_config(payload)


def _validate_create_payload(body: ExamCreate) -> None:
    if not body.title or not body.title.strip():
        raise HTTPException(status_code=422, detail="Title is required")
    if body.time_limit is not None and body.time_limit <= 0:
        raise HTTPException(status_code=422, detail="time_limit must be positive minutes")
    if body.time_limit is not None and body.time_limit > 600:
        raise HTTPException(status_code=422, detail="time_limit exceeds maximum (600 minutes)")
    if body.max_attempts is not None and body.max_attempts < 1:
        raise HTTPException(status_code=422, detail="max_attempts must be at least 1")
    if body.passing_score is not None and not 0 <= body.passing_score <= 100:
        raise HTTPException(status_code=422, detail="passing_score must be between 0 and 100")
    if body.status == ExamStatus.OPEN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Test must have at least one question before publishing")


def _validate_update_payload(data: dict) -> None:
    if "title" in data and not str(data["title"]).strip():
        raise HTTPException(status_code=422, detail="Title is required")
    if "title" in data:
        data["title"] = str(data["title"]).strip()
    if "time_limit" in data:
        time_limit = data["time_limit"]
        if time_limit is not None and time_limit <= 0:
            raise HTTPException(status_code=422, detail="time_limit must be positive minutes")
        if time_limit is not None and time_limit > 600:
            raise HTTPException(status_code=422, detail="time_limit exceeds maximum (600 minutes)")
    if "max_attempts" in data:
        max_attempts = data["max_attempts"]
        if max_attempts is not None and max_attempts < 1:
            raise HTTPException(status_code=422, detail="max_attempts must be at least 1")
    if "passing_score" in data:
        passing_score = data["passing_score"]
        if passing_score is not None and not 0 <= passing_score <= 100:
            raise HTTPException(status_code=422, detail="passing_score must be between 0 and 100")


def _resolve_node(*, db: Session, node_id, actor, now: datetime) -> Node:
    if node_id:
        node = db.get(Node, node_id)
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")
        return node

    node = db.scalars(select(Node).order_by(Node.created_at)).first()
    if node:
        return node

    course = Course(
        title="General",
        description="Auto-created course",
        status=CourseStatus.DRAFT,
        created_by_id=actor.id,
        created_at=now,
        updated_at=now,
    )
    db.add(course)
    db.flush()

    node = Node(course_id=course.id, title="Module 1", order=0, created_at=now, updated_at=now)
    db.add(node)
    db.flush()
    return node
