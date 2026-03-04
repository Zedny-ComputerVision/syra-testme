from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from ...models import Exam, Node, RoleEnum, ExamStatus, Course, CourseStatus, Question
from ...schemas import ExamCreate, ExamRead, ExamBase, Message
from ..deps import get_current_user, get_db_dep, require_role
import json

router = APIRouter()

DEFAULT_PROCTORING = {
    "face_detection": True,
    "multi_face": True,
    "audio_detection": True,
    "object_detection": True,
    "eye_tracking": True,
    "mouth_detection": False,
    "face_verify": True,
    "fullscreen_enforce": True,
    "tab_switch_detect": True,
    "screen_capture": False,
    "copy_paste_block": True,
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
    "head_pose_yaw_deg": 20,
    "head_pose_pitch_deg": 20,
}


def _assert_has_questions(db: Session, exam_id):
    count = db.scalar(select(func.count()).select_from(Question).where(Question.exam_id == exam_id))
    if not count:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam must have at least one question before publishing")


def normalize_proctoring(cfg: dict | None) -> dict:
    base = DEFAULT_PROCTORING.copy()
    if cfg:
        base.update({k: v for k, v in cfg.items() if v is not None})
    return base


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
    query = select(Exam)
    if current.role == RoleEnum.LEARNER:
        query = query.where(Exam.status == ExamStatus.OPEN)
    exams = db.scalars(query).all()
    return [_exam_read(ex) for ex in exams]


@router.post("/", response_model=ExamRead)
async def create_exam(body: ExamCreate, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    # Accept either explicit node_id or fall back to the oldest node/course.
    now = datetime.now(timezone.utc)
    if not body.title or not body.title.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Title is required")
    if body.time_limit is not None and body.time_limit <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="time_limit must be positive minutes")
    if body.time_limit is not None and body.time_limit > 600:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="time_limit exceeds maximum (600 minutes)")
    if body.max_attempts is not None and body.max_attempts < 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="max_attempts must be at least 1")
    if body.status == ExamStatus.OPEN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam must have at least one question before publishing")

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
        type=body.type,
        status=body.status,
        time_limit=body.time_limit,
        max_attempts=body.max_attempts,
        passing_score=body.passing_score,
        proctoring_config=normalize_proctoring(body.proctoring_config),
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
        raise HTTPException(status_code=409, detail="An exam with this title already exists for this module")
    except OperationalError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc.orig}")
    db.refresh(exam)
    return _exam_read(exam)


@router.get("/{exam_id}", response_model=ExamRead)
async def get_exam(exam_id: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if current.role == RoleEnum.LEARNER and exam.status != ExamStatus.OPEN:
        raise HTTPException(status_code=404, detail="Exam not found")
    return _exam_read(exam)


@router.put("/{exam_id}", response_model=ExamRead)
async def update_exam(exam_id: str, body: ExamBase, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if current.role == RoleEnum.INSTRUCTOR and exam.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    data = body.model_dump(exclude_none=True)
    if "title" in data and not data["title"].strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Title is required")
    if "time_limit" in data:
        tl = data["time_limit"]
        if tl is not None and tl <= 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="time_limit must be positive minutes")
        if tl is not None and tl > 600:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="time_limit exceeds maximum (600 minutes)")
    if "max_attempts" in data:
        ma = data["max_attempts"]
        if ma is not None and ma < 1:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="max_attempts must be at least 1")

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
async def delete_exam(exam_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    db.delete(exam)
    db.commit()
    return Message(detail="Deleted")
