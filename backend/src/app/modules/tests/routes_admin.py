import logging
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from ...api.deps import get_db_dep, require_permission
from ...core.security import hash_password
from ...services.audit import write_audit_log
from ...services.notifications import notify_user
from ...services.report_rendering import render_report_template
from ...services.sanitization import sanitize_html_fragment, sanitize_instructions
from ...models import (
    Attempt,
    Course,
    CourseStatus,
    Exam,
    ExamStatus,
    ExamType,
    Node,
    Question,
    RoleEnum,
    Schedule,
    User,
)
from .enums import ReportContent, ReportDisplayed, TestStatus, TestType
from .schemas import TestCreate, TestDetail, TestListResponse, TestUpdate
from .proctoring_requirements import normalize_proctoring_config

router = APIRouter(prefix="/admin/tests", tags=["tests"])
logger = logging.getLogger(__name__)

ADMIN_META_KEY = "_admin_test"
DEFAULT_SECURITY_SETTINGS = {
    "fullscreen_required": True,
    "tab_switch_detect": True,
    "camera_required": True,
    "mic_required": False,
    "violation_threshold_warn": 3,
    "violation_threshold_autosubmit": 6,
}
DEFAULT_UI_CONFIG = {
    "displayed_columns": ["name", "code", "type", "status", "time_limit_minutes", "testing_sessions"],
}


def _format_error_response(exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    raise exc


def _request_ip(request: Request | None) -> str | None:
    return getattr(getattr(request, "client", None), "host", None)


def http_error(code: str, message: str, details: dict | None = None, status_code: int | None = None):
    status_code = status_code or {
        "LOCKED_FIELDS": status.HTTP_409_CONFLICT,
        "NOT_FOUND": status.HTTP_404_NOT_FOUND,
        "VALIDATION_ERROR": status.HTTP_400_BAD_REQUEST,
        "FORBIDDEN": status.HTTP_403_FORBIDDEN,
    }.get(code, status.HTTP_400_BAD_REQUEST)
    raise HTTPException(
        status_code=status_code,
        detail={"error": {"code": code, "message": message, "details": details or {}}},
    )


def _admin_meta(exam: Exam) -> dict:
    settings = exam.settings if isinstance(exam.settings, dict) else {}
    meta = settings.get(ADMIN_META_KEY)
    return meta.copy() if isinstance(meta, dict) else {}


def _is_pool_library_exam(exam: Exam) -> bool:
    settings = exam.settings if isinstance(exam.settings, dict) else {}
    raw = settings.get("_pool_library")
    return bool(raw)


def _deep_merge(target: dict, source: dict):
    for key, value in (source or {}).items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _deep_merge(target[key], value)
        else:
            target[key] = value
    return target


def _exam_status(exam: Exam) -> TestStatus:
    meta = _admin_meta(exam)
    if meta.get("archived_at"):
        return TestStatus.ARCHIVED
    if exam.status == ExamStatus.OPEN:
        return TestStatus.PUBLISHED
    return TestStatus.DRAFT


def _security_settings(exam: Exam) -> dict:
    meta = _admin_meta(exam)
    payload = deepcopy(DEFAULT_SECURITY_SETTINGS)
    _deep_merge(payload, meta.get("settings") or {})
    return payload


def _runtime_settings(exam: Exam) -> dict:
    settings = deepcopy(exam.settings or {})
    settings.pop(ADMIN_META_KEY, None)
    settings.pop("_pool_library", None)
    return settings


def _report_displayed(exam: Exam) -> ReportDisplayed:
    raw = _admin_meta(exam).get("report_displayed") or ReportDisplayed.IMMEDIATELY_AFTER_GRADING.value
    try:
        return ReportDisplayed(raw)
    except ValueError:
        return ReportDisplayed.IMMEDIATELY_AFTER_GRADING


def _report_content(exam: Exam) -> ReportContent:
    raw = _admin_meta(exam).get("report_content") or ReportContent.SCORE_AND_DETAILS.value
    try:
        return ReportContent(raw)
    except ValueError:
        return ReportContent.SCORE_AND_DETAILS


def _ui_config(exam: Exam) -> dict:
    raw = _admin_meta(exam).get("ui_config") or {}
    payload = deepcopy(DEFAULT_UI_CONFIG)
    if isinstance(raw, dict):
        _deep_merge(payload, raw)
    return payload


def _code(exam: Exam) -> str | None:
    return _admin_meta(exam).get("code")


def _published_at(exam: Exam):
    raw = _admin_meta(exam).get("published_at")
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _archived_at(exam: Exam):
    raw = _admin_meta(exam).get("archived_at")
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _randomize_questions(exam: Exam) -> bool:
    return bool(_admin_meta(exam).get("randomize_questions", True))


def _mutate_admin_meta(exam: Exam, **updates):
    settings = deepcopy(exam.settings or {})
    meta = settings.get(ADMIN_META_KEY)
    if not isinstance(meta, dict):
        meta = {}
    for key, value in updates.items():
        if value is None:
            meta.pop(key, None)
        else:
            meta[key] = value
    settings[ADMIN_META_KEY] = meta
    exam.settings = settings


def _ensure_owner_id(db: Session, current) -> uuid.UUID:
    raw_owner_id = getattr(current, "id", None)
    owner_id = None
    if raw_owner_id:
        try:
            owner_id = uuid.UUID(str(raw_owner_id))
        except (ValueError, TypeError):
            owner_id = None
    if owner_id:
        existing = db.get(User, owner_id)
        if existing:
            return owner_id

    owner_id = uuid.uuid4()
    db.add(
        User(
            id=owner_id,
            email=f"system-{owner_id.hex[:8]}@local.invalid",
            name="System Admin",
            user_id=f"SYS{owner_id.hex[:6].upper()}",
            role=RoleEnum.ADMIN,
            hashed_password=hash_password("ChangeMe123!"),
            is_active=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
    )
    db.flush()
    return owner_id


def _ensure_node(db: Session, current, node_id=None) -> Node:
    if node_id:
        node = db.get(Node, node_id)
        if not node:
            http_error("NOT_FOUND", "Node not found")
        return node

    node = db.scalars(select(Node).order_by(Node.created_at)).first()
    if node:
        return node

    now = datetime.now(timezone.utc)
    owner_id = _ensure_owner_id(db, current)
    course = Course(
        title="General",
        description="Auto-created course",
        status=CourseStatus.DRAFT,
        created_by_id=owner_id,
        created_at=now,
        updated_at=now,
    )
    db.add(course)
    db.flush()
    node = Node(course_id=course.id, title="Module 1", order=0, created_at=now, updated_at=now)
    db.add(node)
    db.flush()
    return node


def _generate_code(db: Session) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(10):
        candidate = "".join(alphabet[(uuid.uuid4().int >> (index * 5)) % len(alphabet)] for index in range(8))
        if not _code_exists(db, candidate):
            return candidate
    http_error("INTERNAL_ERROR", "Unable to generate unique code", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _code_exists(db: Session, candidate: str, *, exclude_exam_id=None) -> bool:
    dialect_name = getattr(getattr(db, "bind", None), "dialect", None)
    dialect_name = getattr(dialect_name, "name", None)
    if dialect_name == "sqlite":
        query = select(Exam.id).where(func.json_extract(Exam.settings, f"$.{ADMIN_META_KEY}.code") == candidate)
    else:
        query = select(Exam.id).where(Exam.settings[ADMIN_META_KEY]["code"].as_string() == candidate)
    if exclude_exam_id is not None:
        query = query.where(Exam.id != exclude_exam_id)
    return db.scalar(query.limit(1)) is not None


def _notify_test_published(db: Session, exam: Exam) -> None:
    user_ids = db.scalars(select(Schedule.user_id).where(Schedule.exam_id == exam.id)).all()
    seen: set[str] = set()
    for user_id in user_ids:
        if not user_id:
            continue
        user_key = str(user_id)
        if user_key in seen:
            continue
        seen.add(user_key)
        notify_user(
            db,
            user_id,
            title="Test published",
            message=f"{exam.title} is now published and available.",
            link=f"/tests/{exam.id}",
        )


def _assert_has_questions(exam: Exam):
    if not exam.question_count:
        http_error("VALIDATION_ERROR", "Test must have at least one question before publishing")


def _next_duplicate_title(db: Session, exam: Exam) -> str:
    existing_titles = {
        existing.title
        for existing in db.scalars(select(Exam).where(Exam.node_id == exam.node_id)).all()
    }
    base_title = f"{exam.title} (Copy)"
    if base_title not in existing_titles:
        return base_title
    copy_index = 2
    while True:
        candidate = f"{exam.title} (Copy {copy_index})"
        if candidate not in existing_titles:
            return candidate
        copy_index += 1


def _serialize_detail(exam: Exam) -> TestDetail:
    node = exam.node
    course = node.course if node else None
    return TestDetail.model_validate(
        {
            "id": exam.id,
            "code": _code(exam),
            "name": exam.title,
            "description": exam.description,
            "type": exam.type.value,
            "status": _exam_status(exam).value,
            "runtime_status": exam.status.value,
            "node_id": exam.node_id,
            "node_title": node.title if node else None,
            "course_id": course.id if course else None,
            "course_title": course.title if course else None,
            "category_id": exam.category_id,
            "grading_scale_id": exam.grading_scale_id,
            "time_limit_minutes": exam.time_limit or 60,
            "attempts_allowed": exam.max_attempts or 1,
            "passing_score": exam.passing_score,
            "randomize_questions": _randomize_questions(exam),
            "report_displayed": _report_displayed(exam).value,
            "report_content": _report_content(exam).value,
            "ui_config": _ui_config(exam),
            "settings": _security_settings(exam),
            "runtime_settings": _runtime_settings(exam),
            "proctoring_config": exam.proctoring_config or {},
            "certificate": exam.certificate,
            "question_count": exam.question_count or 0,
            "created_at": exam.created_at,
            "updated_at": exam.updated_at,
            "published_at": _published_at(exam),
            "archived_at": _archived_at(exam),
        }
    )


def _serialize_list_item(exam: Exam, testing_sessions: int, question_count: int) -> dict:
    category = None
    if exam.category:
        category = {"id": exam.category.id, "name": exam.category.name}
    return {
        "id": exam.id,
        "code": _code(exam),
        "name": exam.title,
        "type": exam.type.value,
        "status": _exam_status(exam).value,
        "category": category,
        "time_limit_minutes": exam.time_limit or 60,
        "testing_sessions": testing_sessions,
        "question_count": question_count,
        "certificate": exam.certificate,
        "created_at": exam.created_at,
        "updated_at": exam.updated_at,
    }


def _assert_can_mutate(exam: Exam, fields: set[str]):
    test_status = _exam_status(exam)
    if test_status == TestStatus.ARCHIVED:
        http_error("LOCKED_FIELDS", "Archived tests are read-only")
    if test_status == TestStatus.PUBLISHED:
        allowed = {"name", "description", "report_displayed", "report_content", "ui_config"}
        blocked = fields - allowed
        if blocked:
            http_error("LOCKED_FIELDS", "These fields are locked when published", {"fields": sorted(blocked)})


def _get_exam_or_404(db: Session, test_id: str) -> Exam:
    try:
        exam_pk = uuid.UUID(test_id)
    except (ValueError, TypeError):
        http_error("NOT_FOUND", "Test not found")
    exam = db.get(Exam, exam_pk)
    if not exam:
        http_error("NOT_FOUND", "Test not found")
    return exam


@router.get("/", response_model=TestListResponse)
async def list_tests(
    search: Optional[str] = None,
    status: Optional[str] = None,
    type: Optional[str] = None,
    category_id: Optional[str] = None,
    created_from: Optional[str] = None,
    created_to: Optional[str] = None,
    sort: Optional[str] = None,
    page: int = 1,
    page_size: int = 10,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN)),
):
    try:
        exams = [
            exam
            for exam in db.scalars(
                select(Exam)
                .options(selectinload(Exam.category))
                .order_by(Exam.created_at.desc())
            ).all()
            if not _is_pool_library_exam(exam)
        ]

        if search:
            query = search.strip().lower()
            exams = [
                exam
                for exam in exams
                if query in (exam.title or "").lower() or query in (_code(exam) or "").lower()
            ]
        if status:
            wanted = {part.strip() for part in status.split(",") if part.strip()}
            exams = [exam for exam in exams if _exam_status(exam).value in wanted]
        else:
            exams = [exam for exam in exams if _exam_status(exam) != TestStatus.ARCHIVED]
        if type:
            exams = [exam for exam in exams if exam.type.value == type]
        if category_id:
            exams = [exam for exam in exams if str(exam.category_id or "") == category_id]
        if created_from:
            try:
                created_from_dt = datetime.fromisoformat(created_from)
                exams = [exam for exam in exams if exam.created_at and exam.created_at >= created_from_dt]
            except ValueError:
                pass
        if created_to:
            try:
                created_to_dt = datetime.fromisoformat(created_to)
                exams = [exam for exam in exams if exam.created_at and exam.created_at <= created_to_dt]
            except ValueError:
                pass

        sort_field, sort_dir = ("created_at", "desc")
        if sort:
            if ":" in sort:
                sort_field, sort_dir = sort.split(":", 1)
            else:
                sort_field, sort_dir = sort, "asc"
            if sort_field not in {"created_at", "updated_at", "name"}:
                sort_field = "created_at"
            if sort_dir not in {"asc", "desc"}:
                sort_dir = "desc"
        exams.sort(
            key=lambda exam: exam.title.lower() if sort_field == "name" else getattr(exam, sort_field) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=sort_dir == "desc",
        )

        total = len(exams)
        page = max(page, 1)
        page_size = min(max(page_size, 1), 100)
        page_items = exams[(page - 1) * page_size : page * page_size]
        page_exam_ids = [exam.id for exam in page_items]
        session_counts = {}
        question_counts = {}
        if page_exam_ids:
            session_counts = {
                exam_id: int(count or 0)
                for exam_id, count in db.execute(
                    select(Schedule.exam_id, func.count())
                    .where(Schedule.exam_id.in_(page_exam_ids))
                    .group_by(Schedule.exam_id)
                ).all()
            }
            question_counts = {
                exam_id: int(count or 0)
                for exam_id, count in db.execute(
                    select(Question.exam_id, func.count())
                    .where(Question.exam_id.in_(page_exam_ids))
                    .group_by(Question.exam_id)
                ).all()
            }
        items = []
        for exam in page_items:
            items.append(
                _serialize_list_item(
                    exam,
                    int(session_counts.get(exam.id, 0)),
                    int(question_counts.get(exam.id, 0)),
                )
            )
        return TestListResponse(items=items, page=page, page_size=page_size, total=total)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.post("/", response_model=TestDetail, status_code=201)
async def create_test(
    body: TestCreate,
    request: Request,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Create Tests", RoleEnum.ADMIN)),
):
    try:
        now = datetime.now(timezone.utc)
        node = _ensure_node(db, current, body.node_id)
        if body.code:
            normalized_code = body.code.strip()
            if normalized_code and _code_exists(db, normalized_code):
                http_error("VALIDATION_ERROR", "Code already exists")
        exam = Exam(
            node_id=node.id,
            title=body.name.strip(),
            description=sanitize_html_fragment(body.description),
            type=ExamType(body.type.value),
            status=ExamStatus.CLOSED,
            time_limit=body.time_limit_minutes or 60,
            max_attempts=body.attempts_allowed or 1,
            passing_score=body.passing_score,
            proctoring_config=normalize_proctoring_config(body.proctoring_config or {}),
            settings=sanitize_instructions(body.runtime_settings or {}),
            certificate=body.certificate,
            category_id=body.category_id,
            grading_scale_id=body.grading_scale_id,
            created_by_id=getattr(current, "id", None),
            created_at=now,
            updated_at=now,
        )
        db.add(exam)
        db.flush()
        _mutate_admin_meta(
            exam,
            code=body.code.strip() if body.code else None,
            randomize_questions=True if body.randomize_questions is None else body.randomize_questions,
            report_displayed=(body.report_displayed or ReportDisplayed.IMMEDIATELY_AFTER_GRADING).value,
            report_content=(body.report_content or ReportContent.SCORE_AND_DETAILS).value,
            ui_config=body.ui_config or deepcopy(DEFAULT_UI_CONFIG),
            settings=(body.settings.model_dump() if body.settings else deepcopy(DEFAULT_SECURITY_SETTINGS)),
            published_at=None,
            archived_at=None,
        )
        db.add(exam)
        db.commit()
        db.refresh(exam)
        write_audit_log(
            db,
            getattr(current, "id", None),
            action="TEST_CREATED",
            resource_type="test",
            resource_id=str(exam.id),
            detail=f"Created test: {exam.title}",
            ip_address=_request_ip(request),
        )
        return _serialize_detail(exam)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.get("/{test_id}", response_model=TestDetail)
async def get_test(test_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN))):
    try:
        exam = _get_exam_or_404(db, test_id)
        return _serialize_detail(exam)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.patch("/{test_id}", response_model=TestDetail)
async def update_test(
    test_id: str,
    body: TestUpdate,
    request: Request,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN)),
):
    try:
        exam = _get_exam_or_404(db, test_id)
        payload = body.model_dump(exclude_unset=True, exclude_none=True)
        _assert_can_mutate(exam, set(payload.keys()))
        if "name" in payload:
            exam.title = payload["name"].strip()
        if "code" in payload:
            meta_code = payload["code"].strip() if payload["code"] else None
            if meta_code and _code_exists(db, meta_code, exclude_exam_id=exam.id):
                http_error("VALIDATION_ERROR", "Code already exists")
            _mutate_admin_meta(exam, code=meta_code)
        if "description" in payload:
            exam.description = sanitize_html_fragment(payload["description"])
        if "type" in payload:
            exam.type = ExamType(payload["type"])
        if "node_id" in payload:
            exam.node_id = _ensure_node(db, current, payload["node_id"]).id
        if "category_id" in payload:
            exam.category_id = payload["category_id"]
        if "grading_scale_id" in payload:
            exam.grading_scale_id = payload["grading_scale_id"]
        if "time_limit_minutes" in payload:
            exam.time_limit = payload["time_limit_minutes"]
        if "attempts_allowed" in payload:
            exam.max_attempts = payload["attempts_allowed"]
        if "passing_score" in payload:
            if payload["passing_score"] is not None and not 0 <= payload["passing_score"] <= 100:
                http_error("VALIDATION_ERROR", "passing_score must be between 0 and 100")
            exam.passing_score = payload["passing_score"]
        if "runtime_settings" in payload:
            current_admin_meta = deepcopy((exam.settings or {}).get(ADMIN_META_KEY, {}))
            new_settings = sanitize_instructions(
                deepcopy(payload["runtime_settings"]) if isinstance(payload["runtime_settings"], dict) else {}
            )
            new_settings[ADMIN_META_KEY] = current_admin_meta
            exam.settings = new_settings
        if "proctoring_config" in payload:
            exam.proctoring_config = normalize_proctoring_config(payload["proctoring_config"])
        if "certificate" in payload:
            exam.certificate = payload["certificate"]
        meta_updates = {}
        if "randomize_questions" in payload:
            meta_updates["randomize_questions"] = payload["randomize_questions"]
        if "report_displayed" in payload:
            meta_updates["report_displayed"] = payload["report_displayed"]
        if "report_content" in payload:
            meta_updates["report_content"] = payload["report_content"]
        if "ui_config" in payload:
            meta_updates["ui_config"] = payload["ui_config"]
        if "settings" in payload:
            meta_updates["settings"] = payload["settings"]
        if meta_updates:
            _mutate_admin_meta(exam, **meta_updates)
        exam.updated_at = datetime.now(timezone.utc)
        db.add(exam)
        db.commit()
        db.refresh(exam)
        write_audit_log(
            db,
            getattr(current, "id", None),
            action="TEST_UPDATED",
            resource_type="test",
            resource_id=str(exam.id),
            detail=f"Updated test: {exam.title}",
            ip_address=_request_ip(request),
        )
        return _serialize_detail(exam)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.post("/{test_id}/publish", response_model=TestDetail)
async def publish_test(test_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN))):
    try:
        exam = _get_exam_or_404(db, test_id)
        if not exam.title or not exam.title.strip():
            http_error("VALIDATION_ERROR", "Name is required before publishing")
        _assert_has_questions(exam)
        if not _code(exam):
            _mutate_admin_meta(exam, code=_generate_code(db))
        if _exam_status(exam) != TestStatus.PUBLISHED:
            now = datetime.now(timezone.utc)
            exam.status = ExamStatus.OPEN
            exam.updated_at = now
            _mutate_admin_meta(exam, published_at=now.isoformat(), archived_at=None)
            db.add(exam)
            db.commit()
            db.refresh(exam)
            write_audit_log(
                db,
                getattr(current, "id", None),
                action="TEST_PUBLISHED",
                resource_type="test",
                resource_id=str(exam.id),
                detail=exam.title,
            )
            _notify_test_published(db, exam)
        return _serialize_detail(exam)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.post("/{test_id}/duplicate", response_model=TestDetail)
async def duplicate_test(
    test_id: str,
    request: Request,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Create Tests", RoleEnum.ADMIN)),
):
    try:
        exam = _get_exam_or_404(db, test_id)
        try:
            now = datetime.now(timezone.utc)
            new_exam = Exam(
                node_id=exam.node_id,
                title=_next_duplicate_title(db, exam),
                description=sanitize_html_fragment(exam.description),
                type=exam.type,
                status=ExamStatus.CLOSED,
                time_limit=exam.time_limit,
                max_attempts=exam.max_attempts,
                passing_score=exam.passing_score,
                proctoring_config=deepcopy(exam.proctoring_config),
                settings=sanitize_instructions(deepcopy(exam.settings)),
                certificate=deepcopy(exam.certificate),
                category_id=exam.category_id,
                grading_scale_id=exam.grading_scale_id,
                created_by_id=getattr(current, "id", None),
                created_at=now,
                updated_at=now,
            )
            db.add(new_exam)
            db.flush()
            for question in exam.questions:
                db.add(
                    Question(
                        exam_id=new_exam.id,
                        text=question.text,
                        type=question.type,
                        options=deepcopy(question.options),
                        correct_answer=question.correct_answer,
                        points=question.points,
                        order=question.order,
                        pool_id=question.pool_id,
                        created_at=now,
                        updated_at=now,
                    )
                )
            _mutate_admin_meta(new_exam, code=None, published_at=None, archived_at=None)
            db.add(new_exam)
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.error("Test duplication failed: %s", exc, exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to duplicate test")
        db.refresh(new_exam)
        write_audit_log(
            db,
            getattr(current, "id", None),
            action="TEST_DUPLICATED",
            resource_type="test",
            resource_id=str(new_exam.id),
            detail=f"Duplicated test: {exam.title} -> {new_exam.title}",
            ip_address=_request_ip(request),
        )
        return _serialize_detail(new_exam)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.post("/{test_id}/archive", response_model=TestDetail)
async def archive_test(test_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN))):
    try:
        exam = _get_exam_or_404(db, test_id)
        previous_status = _exam_status(exam)
        if previous_status == TestStatus.ARCHIVED:
            return _serialize_detail(exam)
        now = datetime.now(timezone.utc)
        exam.status = ExamStatus.CLOSED
        exam.updated_at = now
        _mutate_admin_meta(exam, archived_at=now.isoformat())
        db.add(exam)
        db.commit()
        db.refresh(exam)
        if previous_status == TestStatus.PUBLISHED:
            write_audit_log(
                db,
                getattr(current, "id", None),
                action="TEST_UNPUBLISHED",
                resource_type="test",
                resource_id=str(exam.id),
                detail=exam.title,
            )
        write_audit_log(
            db,
            getattr(current, "id", None),
            action="TEST_ARCHIVED",
            resource_type="test",
            resource_id=str(exam.id),
            detail=exam.title,
        )
        return _serialize_detail(exam)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.post("/{test_id}/unarchive", response_model=TestDetail)
async def unarchive_test(test_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN))):
    try:
        exam = _get_exam_or_404(db, test_id)
        now = datetime.now(timezone.utc)
        exam.status = ExamStatus.OPEN
        exam.updated_at = now
        _mutate_admin_meta(exam, archived_at=None, published_at=_published_at(exam).isoformat() if _published_at(exam) else now.isoformat())
        db.add(exam)
        db.commit()
        db.refresh(exam)
        write_audit_log(
            db,
            getattr(current, "id", None),
            action="TEST_UNARCHIVED",
            resource_type="test",
            resource_id=str(exam.id),
            detail=exam.title,
        )
        return _serialize_detail(exam)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.delete("/{test_id}", status_code=204)
async def delete_test(
    test_id: str,
    request: Request,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Delete Tests", RoleEnum.ADMIN)),
):
    try:
        exam = _get_exam_or_404(db, test_id)
        if _exam_status(exam) != TestStatus.DRAFT:
            http_error("FORBIDDEN", "Only draft tests can be deleted", status_code=status.HTTP_409_CONFLICT)
        attempt_count = db.scalar(select(func.count()).select_from(Attempt).where(Attempt.exam_id == exam.id)) or 0
        if attempt_count > 0:
            http_error("FORBIDDEN", "Cannot delete a test with attempts", status_code=status.HTTP_409_CONFLICT)
        schedules = db.scalars(select(Schedule).where(Schedule.exam_id == exam.id)).all()
        for schedule in schedules:
            if not schedule.user_id:
                continue
            notify_user(
                db,
                schedule.user_id,
                "Test Cancelled",
                f"The test '{exam.title}' has been removed.",
                "/schedule",
            )
        exam_id = str(exam.id)
        exam_title = exam.title
        db.delete(exam)
        db.commit()
        write_audit_log(
            db,
            getattr(current, "id", None),
            action="TEST_DELETED",
            resource_type="test",
            resource_id=exam_id,
            detail=f"Deleted test: {exam_title}",
            ip_address=_request_ip(request),
        )
        return Response(status_code=204)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.get("/{test_id}/report")
async def download_report(test_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN))):
    try:
        exam = _get_exam_or_404(db, test_id)
        attempts = db.scalars(
            select(Attempt)
            .options(joinedload(Attempt.user))
            .where(Attempt.exam_id == exam.id)
            .order_by(Attempt.created_at.desc())
        ).all()
        html = render_report_template(
            "test_report.html",
            report_title=f"{exam.title} Report",
            generated_at=datetime.now(timezone.utc).isoformat(),
            exam_title=exam.title,
            rows=[
                {
                    "user_name": attempt.user.name if attempt.user else "",
                    "status": getattr(attempt.status, "value", attempt.status),
                    "score": "" if attempt.score is None else attempt.score,
                }
                for attempt in attempts
            ],
        )
        return HTMLResponse(content=html, media_type="text/html")
    except HTTPException as exc:
        return _format_error_response(exc)
