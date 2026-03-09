import random
import logging

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ...models import Course, CourseStatus, Exam, ExamStatus, ExamType, Node, Question, QuestionPool, RoleEnum
from ...schemas import Message, QuestionBase, QuestionPoolCreate, QuestionPoolRead, QuestionRead
from ...services.audit import write_audit_log
from ...services.sanitization import sanitize_question_payload
from ..deps import get_db_dep, parse_uuid_param, require_permission

router = APIRouter()
logger = logging.getLogger(__name__)


def _is_pool_library_exam(exam: Exam, pool_id) -> bool:
    settings = exam.settings if isinstance(exam.settings, dict) else {}
    raw = settings.get("_pool_library")
    return isinstance(raw, dict) and str(raw.get("pool_id")) == str(pool_id)


def _looks_like_pool_library_exam(exam: Exam, pool_id) -> bool:
    expected_prefix = f"Pool Library {str(pool_id)[:8]}"
    return str(getattr(exam, "title", "") or "").startswith(expected_prefix)


def _ensure_pool_library_exam(db: Session, current, pool: QuestionPool) -> Exam:
    for exam in db.scalars(select(Exam).order_by(Exam.created_at)).all():
        if _is_pool_library_exam(exam, pool.id):
            return exam

    now = datetime.now(timezone.utc)
    course = db.scalars(
        select(Course).where(
            Course.created_by_id == current.id,
            Course.title == "Question Pool Library",
        )
    ).first()
    if not course:
        course = Course(
            title="Question Pool Library",
            description="Hidden library course for question pool storage",
            status=CourseStatus.DRAFT,
            created_by_id=current.id,
            created_at=now,
            updated_at=now,
        )
        db.add(course)
        db.flush()

    node = db.scalars(
        select(Node).where(
            Node.course_id == course.id,
            Node.title == "Shared Pool Questions",
        )
    ).first()
    if not node:
        node = Node(
            course_id=course.id,
            title="Shared Pool Questions",
            order=0,
            created_at=now,
            updated_at=now,
        )
        db.add(node)
        db.flush()

    exam = Exam(
        node_id=node.id,
        title=f"Pool Library {str(pool.id)[:8]}",
        description=f"Hidden storage exam for pool {pool.name}",
        type=ExamType.MCQ,
        status=ExamStatus.CLOSED,
        time_limit=60,
        max_attempts=1,
        created_by_id=current.id,
        settings={"_pool_library": {"pool_id": str(pool.id)}},
        created_at=now,
        updated_at=now,
    )
    db.add(exam)
    db.flush()
    return exam


def _find_pool_library_exam(db: Session, pool_id) -> Exam | None:
    for exam in db.scalars(select(Exam).order_by(Exam.created_at)).all():
        if _is_pool_library_exam(exam, pool_id):
            return exam
    return None


def _find_corrupted_pool_library_exam(db: Session, pool_id) -> Exam | None:
    for exam in db.scalars(select(Exam).order_by(Exam.created_at)).all():
        if _looks_like_pool_library_exam(exam, pool_id) and not _is_pool_library_exam(exam, pool_id):
            return exam
    return None


def _load_pool_questions(db: Session, pool_id):
    direct_questions = db.scalars(
        select(Question).where(Question.pool_id == pool_id).order_by(Question.order.asc(), Question.created_at.asc())
    ).all()
    if direct_questions:
        return direct_questions

    # Pool questions are stored in hidden exams to preserve the legacy schema until
    # the system can move to a dedicated junction-table design.
    library_exam = _find_pool_library_exam(db, pool_id)
    if not library_exam:
        corrupted_exam = _find_corrupted_pool_library_exam(db, pool_id)
        if corrupted_exam:
            logger.warning(
                "Question pool %s has a hidden library exam %s with missing or corrupt _pool_library metadata",
                pool_id,
                getattr(corrupted_exam, "id", None),
            )
        return []
    if not _is_pool_library_exam(library_exam, pool_id):
        logger.warning("Question pool %s library exam metadata is invalid", pool_id)
        return []
    return db.scalars(
        select(Question).where(Question.exam_id == library_exam.id).order_by(Question.order.asc(), Question.created_at.asc())
    ).all()


def _serialize_pool(pool: QuestionPool, db: Session) -> QuestionPoolRead:
    return QuestionPoolRead(
        id=pool.id,
        name=pool.name,
        description=pool.description,
        created_by_id=pool.created_by_id,
        question_count=len(_load_pool_questions(db, pool.id)),
    )


@router.post("/", response_model=QuestionPoolRead)
async def create_pool(
    body: QuestionPoolCreate,
    request: Request,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Manage Question Pools", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    now = datetime.now(timezone.utc)
    pool = QuestionPool(
        name=body.name,
        description=body.description,
        created_by_id=current.id,
        created_at=now,
        updated_at=now,
    )
    db.add(pool)
    db.commit()
    db.refresh(pool)
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="QUESTION_POOL_CREATED",
        resource_type="question_pool",
        resource_id=str(pool.id),
        detail=f"Created question pool: {pool.name}",
        ip_address=getattr(getattr(request, "client", None), "host", None),
    )
    return _serialize_pool(pool, db)


@router.get("/", response_model=list[QuestionPoolRead])
async def list_pools(db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Question Pools", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    pools = db.scalars(select(QuestionPool).order_by(QuestionPool.name.asc())).all()
    return [_serialize_pool(pool, db) for pool in pools]


@router.get("/{pool_id}", response_model=QuestionPoolRead)
async def get_pool(pool_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Question Pools", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    pool_pk = parse_uuid_param(pool_id, detail="Not found")
    pool = db.get(QuestionPool, pool_pk)
    if not pool:
        raise HTTPException(status_code=404, detail="Not found")
    return _serialize_pool(pool, db)


@router.put("/{pool_id}", response_model=QuestionPoolRead)
async def update_pool(
    pool_id: str,
    body: QuestionPoolCreate,
    request: Request,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Manage Question Pools", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    pool_pk = parse_uuid_param(pool_id, detail="Not found")
    pool = db.get(QuestionPool, pool_pk)
    if not pool:
        raise HTTPException(status_code=404, detail="Not found")
    if current.role == RoleEnum.INSTRUCTOR and pool.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    pool.name = body.name
    pool.description = body.description
    pool.updated_at = datetime.now(timezone.utc)
    db.add(pool)
    db.commit()
    db.refresh(pool)
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="QUESTION_POOL_UPDATED",
        resource_type="question_pool",
        resource_id=str(pool.id),
        detail=f"Updated question pool: {pool.name}",
        ip_address=getattr(getattr(request, "client", None), "host", None),
    )
    return _serialize_pool(pool, db)


@router.get("/{pool_id}/questions", response_model=list[QuestionRead])
async def list_pool_questions(pool_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Question Pools", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    pool_pk = parse_uuid_param(pool_id, detail="Pool not found")
    pool = db.get(QuestionPool, pool_pk)
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    return _load_pool_questions(db, pool_pk)


@router.post("/{pool_id}/questions", response_model=QuestionRead)
async def create_pool_question(
    pool_id: str,
    body: QuestionBase,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Manage Question Pools", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    pool_pk = parse_uuid_param(pool_id, detail="Pool not found")
    pool = db.get(QuestionPool, pool_pk)
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    if current.role == RoleEnum.INSTRUCTOR and pool.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    library_exam = _ensure_pool_library_exam(db, current, pool)
    next_order = db.scalar(select(func.max(Question.order)).where(Question.pool_id == pool_pk)) or 0
    now = datetime.now(timezone.utc)
    payload = sanitize_question_payload(body.model_dump())
    question = Question(
        exam_id=library_exam.id,
        text=payload["text"],
        type=payload["type"],
        options=payload.get("options"),
        correct_answer=payload.get("correct_answer"),
        points=payload["points"],
        order=next_order + 1,
        pool_id=pool_pk,
        created_at=now,
        updated_at=now,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@router.put("/{pool_id}/questions/{question_id}", response_model=QuestionRead)
async def update_pool_question(
    pool_id: str,
    question_id: str,
    body: QuestionBase,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Manage Question Pools", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    pool_pk = parse_uuid_param(pool_id, detail="Pool not found")
    pool = db.get(QuestionPool, pool_pk)
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    if current.role == RoleEnum.INSTRUCTOR and pool.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    question_pk = parse_uuid_param(question_id, detail="Question not found")
    question = db.get(Question, question_pk)
    if not question or question.pool_id != pool_pk:
        raise HTTPException(status_code=404, detail="Question not found")

    payload = sanitize_question_payload(body.model_dump())
    question.text = payload["text"]
    question.type = payload["type"]
    question.options = payload.get("options")
    question.correct_answer = payload.get("correct_answer")
    question.points = payload["points"]
    question.updated_at = datetime.now(timezone.utc)
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@router.delete("/{pool_id}/questions/{question_id}", response_model=Message)
async def delete_pool_question(
    pool_id: str,
    question_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Manage Question Pools", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    pool_pk = parse_uuid_param(pool_id, detail="Pool not found")
    pool = db.get(QuestionPool, pool_pk)
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    if current.role == RoleEnum.INSTRUCTOR and pool.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    question_pk = parse_uuid_param(question_id, detail="Question not found")
    question = db.get(Question, question_pk)
    if not question or question.pool_id != pool_pk:
        raise HTTPException(status_code=404, detail="Question not found")
    db.delete(question)
    db.commit()
    return Message(detail="Deleted")


@router.post("/{pool_id}/seed-exam/{exam_id}", response_model=Message)
async def seed_exam_from_pool(
    pool_id: str,
    exam_id: str,
    count: int = 5,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Manage Question Pools", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    pool_pk = parse_uuid_param(pool_id, detail="Pool not found")
    pool = db.get(QuestionPool, pool_pk)
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    exam_pk = parse_uuid_param(exam_id, detail="Test not found")
    exam = db.get(Exam, exam_pk)
    if not exam:
        raise HTTPException(status_code=404, detail="Test not found")
    if current.role == RoleEnum.INSTRUCTOR and exam.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    pool_questions = _load_pool_questions(db, pool_pk)
    if not pool_questions:
        raise HTTPException(status_code=400, detail="Pool has no questions. Add questions to the pool before seeding this test.")
    existing_max = db.scalar(
        select(func.max(Question.order)).where(Question.exam_id == exam_pk)
    ) or 0
    selected = random.sample(pool_questions, min(count, len(pool_questions)))
    for i, pq in enumerate(selected):
        q = Question(
            exam_id=exam_pk, text=pq.text, type=pq.type, options=pq.options,
            correct_answer=pq.correct_answer, points=pq.points,
            order=existing_max + i + 1, pool_id=pool_pk,
        )
        db.add(q)
    db.commit()
    return Message(detail=f"Seeded {len(selected)} questions")


@router.delete("/{pool_id}", response_model=Message)
async def delete_pool(
    pool_id: str,
    request: Request,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Manage Question Pools", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    pool_pk = parse_uuid_param(pool_id, detail="Not found")
    pool = db.get(QuestionPool, pool_pk)
    if not pool:
        raise HTTPException(status_code=404, detail="Not found")
    if current.role == RoleEnum.INSTRUCTOR and pool.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    pool_name = pool.name
    pool_pk_str = str(pool.id)
    db.delete(pool)
    db.commit()
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="QUESTION_POOL_DELETED",
        resource_type="question_pool",
        resource_id=pool_pk_str,
        detail=f"Deleted question pool: {pool_name}",
        ip_address=getattr(getattr(request, "client", None), "host", None),
    )
    return Message(detail="Deleted")
