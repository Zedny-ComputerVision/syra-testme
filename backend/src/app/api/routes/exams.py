from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from ...models import Exam, Node, RoleEnum, ExamStatus, Course, CourseStatus, Question
from ...schemas import ExamCreate, ExamRead, ExamUpdate, Message
from ..deps import ensure_permission, get_current_user, get_db_dep, learner_can_access_exam, require_permission
from ...modules.tests.proctoring_requirements import normalize_proctoring_config
import json

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
        proctoring_config=exam.proctoring_config,
        description=exam.description,
        settings=exam.settings,
        certificate=exam.certificate,
        category_id=exam.category_id,
        grading_scale_id=exam.grading_scale_id,
        category_name=category_name,
        time_limit_minutes=exam.time_limit,
        created_at=exam.created_at,
        updated_at=exam.updated_at,
        question_count=exam.question_count,
    )


@router.get("/", response_model=list[ExamRead])
async def list_exams(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    query = select(Exam).order_by(Exam.updated_at.desc(), Exam.created_at.desc())
    if current.role == RoleEnum.LEARNER:
        query = query.where(Exam.status == ExamStatus.OPEN)
    else:
        ensure_permission(db, current, "Edit Tests")
    exams = db.scalars(query).all()
    if current.role == RoleEnum.LEARNER:
        exams = [exam for exam in exams if learner_can_access_exam(db, exam, current)]
    return [_exam_read(ex) for ex in exams]


@router.post("/", response_model=ExamRead)
async def create_exam(body: ExamCreate, db: Session = Depends(get_db_dep), current=Depends(require_permission("Create Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    # Accept either explicit node_id or fall back to the oldest node/course.
    now = datetime.now(timezone.utc)
    if not body.title or not body.title.strip():
        raise HTTPException(status_code=422, detail="Title is required")
    if body.time_limit is not None and body.time_limit <= 0:
        raise HTTPException(status_code=422, detail="time_limit must be positive minutes")
    if body.time_limit is not None and body.time_limit > 600:
        raise HTTPException(status_code=422, detail="time_limit exceeds maximum (600 minutes)")
    if body.max_attempts is not None and body.max_attempts < 1:
        raise HTTPException(status_code=422, detail="max_attempts must be at least 1")
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
        title=body.title,
        description=body.description,
        type=body.type,
        status=body.status,
        time_limit=body.time_limit,
        max_attempts=body.max_attempts,
        passing_score=body.passing_score,
        proctoring_config=normalize_proctoring(body.proctoring_config),
        settings=body.settings,
        certificate=body.certificate,
        category_id=body.category_id,
        grading_scale_id=body.grading_scale_id,
        created_at=now,
        updated_at=now,
    )
    exam.created_by_id = current.id
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
    data = body.model_dump(exclude_unset=True)
    if not data:
        return _exam_read(exam)
    if "title" in data and not data["title"].strip():
        raise HTTPException(status_code=422, detail="Title is required")
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

    for field, value in data.items():
        if field == "node_id":
            # Allow moving exam to another node only when provided.
            node = db.get(Node, value)
            if not node:
                raise HTTPException(status_code=404, detail="Node not found")
            exam.node_id = value
            continue
        if field == "proctoring_config":
            value = normalize_proctoring(value)
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
