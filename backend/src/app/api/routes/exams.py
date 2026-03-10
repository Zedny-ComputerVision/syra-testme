from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session, joinedload

from ...models import Exam, Node, RoleEnum, ExamStatus, Course, CourseStatus, Question
from ...schemas import ExamCreate, ExamRead, ExamUpdate, Message, PaginatedResponse
from ..deps import ensure_permission, get_current_user, get_db_dep, learner_can_access_exam, require_permission
from ...modules.tests.proctoring_requirements import normalize_proctoring_config
from ...services.normalized_relations import exam_certificate, exam_proctoring, exam_runtime_settings, set_exam_certificate, set_exam_proctoring, set_exam_runtime_settings
from ...services.sanitization import sanitize_exam_payload

router = APIRouter()

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
    "max_face_absence_sec": 5,
    "max_tab_blurs": 3,
    "max_alerts_before_autosubmit": 5,
    "max_fullscreen_exits": 2,
    "max_alt_tabs": 3,
    "lighting_min_score": 0.35,
    "face_verify_id_threshold": 0.18,
    "max_score_before_autosubmit": 15,
    "frame_interval_ms": 3000,
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
    # Enhanced sustained gaze/head thresholds (radians).
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


def _pagination_value(value, default: int) -> int:
    if isinstance(value, int):
        return value
    try:
        return int(getattr(value, "default", default))
    except (TypeError, ValueError):
        return default


def _assert_has_questions(db: Session, exam_id):
    count = db.scalar(select(func.count()).select_from(Question).where(Question.exam_id == exam_id))
    if not count:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Test must have at least one question before publishing")


def _parse_exam_id(exam_id: str) -> str:
    try:
        return str(UUID(exam_id))
    except (TypeError, ValueError):
        raise HTTPException(status_code=404, detail="Test not found")


def normalize_proctoring(cfg: dict | None) -> dict:
    base = DEFAULT_PROCTORING.copy()
    if cfg:
        base.update({k: v for k, v in cfg.items() if v is not None})
    return normalize_proctoring_config(base)


def _exam_read(exam: Exam) -> ExamRead:
    node = exam.node
    course = node.course if node else None
    category_name = exam.category.name if exam.category else None
    return ExamRead(
        id=exam.id,
        node_id=exam.node_id,
        node_title=node.title if node else None,
        course_id=course.id if course else None,
        course_title=course.title if course else None,
        title=exam.title,
        type=exam.type,
        status=exam.status,
        time_limit=exam.time_limit,
        max_attempts=exam.max_attempts,
        passing_score=exam.passing_score,
        proctoring_config=exam_proctoring(exam),
        description=exam.description,
        settings=exam_runtime_settings(exam),
        certificate=exam_certificate(exam),
        category_id=exam.category_id,
        grading_scale_id=exam.grading_scale_id,
        category_name=category_name,
        time_limit_minutes=exam.time_limit,
        created_at=exam.created_at,
        updated_at=exam.updated_at,
        question_count=exam.question_count,
    )


@router.get("/", response_model=PaginatedResponse[ExamRead])
async def list_exams(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    skip = max(0, _pagination_value(skip, 0))
    limit = max(1, min(_pagination_value(limit, 50), 200))

    query = (
        select(Exam)
        .options(joinedload(Exam.node).joinedload(Node.course), joinedload(Exam.category))
        .order_by(Exam.updated_at.desc(), Exam.created_at.desc())
    )
    if current.role == RoleEnum.LEARNER:
        query = query.where(Exam.status == ExamStatus.OPEN)
        exams = db.scalars(query).all()
        exams = [exam for exam in exams if learner_can_access_exam(db, exam, current)]
        page_items = exams[skip: skip + limit]
        return {
            "items": [_exam_read(ex) for ex in page_items],
            "total": len(exams),
            "skip": skip,
            "limit": limit,
        }
    else:
        ensure_permission(db, current, "Edit Tests")
    total = db.scalar(select(func.count()).select_from(select(Exam).subquery())) or 0
    exams = db.scalars(query.offset(skip).limit(limit)).all()
    return {
        "items": [_exam_read(ex) for ex in exams],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("/", response_model=ExamRead)
async def create_exam(body: ExamCreate, db: Session = Depends(get_db_dep), current=Depends(require_permission("Create Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    # Accept either explicit node_id or fall back to the oldest node/course.
    now = datetime.now(timezone.utc)
    payload = sanitize_exam_payload(body.model_dump(exclude={"questions"}))
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

    node_id = body.node_id
    node = None
    if node_id:
        node = db.get(Node, node_id)
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")
    else:
        node = db.scalars(select(Node).order_by(Node.created_at)).first()
        if not node:
            # Create a minimal default course/node so exam creation succeeds in fresh databases.
            course = Course(
                title="General",
                description="Auto-created course",
                status=CourseStatus.DRAFT,
                created_by_id=current.id,
                created_at=now,
                updated_at=now,
            )
            db.add(course)
            db.flush()
            node = Node(course_id=course.id, title="Module 1", order=0, created_at=now, updated_at=now)
            db.add(node)
            db.flush()
        node_id = node.id

    exam = Exam(
        node_id=node_id,
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
    )
    exam.created_by_id = current.id
    set_exam_proctoring(exam, normalize_proctoring(body.proctoring_config))
    set_exam_runtime_settings(exam, payload.get("settings"))
    set_exam_certificate(exam, body.certificate)
    db.add(exam)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A test with this title already exists for this module")
    except OperationalError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc.orig}")
    db.refresh(exam)
    return _exam_read(exam)


@router.get("/{exam_id}", response_model=ExamRead)
async def get_exam(exam_id: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    parsed_id = _parse_exam_id(exam_id)
    exam = db.get(Exam, parsed_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Test not found")
    if current.role == RoleEnum.LEARNER:
        if not learner_can_access_exam(db, exam, current):
            raise HTTPException(status_code=404, detail="Test not found")
    else:
        ensure_permission(db, current, "Edit Tests")
    return _exam_read(exam)


@router.put("/{exam_id}", response_model=ExamRead)
async def update_exam(exam_id: str, body: ExamUpdate, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    parsed_id = _parse_exam_id(exam_id)
    exam = db.get(Exam, parsed_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Test not found")
    if current.role == RoleEnum.INSTRUCTOR and exam.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    data = sanitize_exam_payload(body.model_dump(exclude_unset=True))
    if not data:
        return _exam_read(exam)
    if "title" in data and not data["title"].strip():
        raise HTTPException(status_code=422, detail="Title is required")
    if "title" in data:
        data["title"] = data["title"].strip()
    if "time_limit" in data:
        tl = data["time_limit"]
        if tl is not None and tl <= 0:
            raise HTTPException(status_code=422, detail="time_limit must be positive minutes")
        if tl is not None and tl > 600:
            raise HTTPException(status_code=422, detail="time_limit exceeds maximum (600 minutes)")
    if "max_attempts" in data:
        ma = data["max_attempts"]
        if ma is not None and ma < 1:
            raise HTTPException(status_code=422, detail="max_attempts must be at least 1")
    if "passing_score" in data:
        ps = data["passing_score"]
        if ps is not None and not 0 <= ps <= 100:
            raise HTTPException(status_code=422, detail="passing_score must be between 0 and 100")

    for field, value in data.items():
        if field == "node_id":
            # Allow moving exam to another node only when provided.
            node = db.get(Node, value)
            if not node:
                raise HTTPException(status_code=404, detail="Node not found")
            exam.node_id = value
            continue
        if field == "proctoring_config":
            set_exam_proctoring(exam, normalize_proctoring(value))
            continue
        if field == "settings":
            set_exam_runtime_settings(exam, value)
            continue
        if field == "certificate":
            set_exam_certificate(exam, value)
            continue
        setattr(exam, field, value)
    exam.updated_at = datetime.now(timezone.utc)
    target_status = data.get("status", exam.status)
    if target_status == ExamStatus.OPEN:
        _assert_has_questions(db, exam.id)
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return _exam_read(exam)


@router.delete("/{exam_id}", response_model=Message)
async def delete_exam(exam_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Delete Tests", RoleEnum.ADMIN))):
    parsed_id = _parse_exam_id(exam_id)
    exam = db.get(Exam, parsed_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Test not found")
    db.delete(exam)
    db.commit()
    return Message(detail="Deleted")
