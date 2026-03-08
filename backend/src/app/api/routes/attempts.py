from datetime import datetime, timedelta, timezone
import json

from fastapi import APIRouter, Depends, HTTPException, status, Body
from fastapi.responses import StreamingResponse
import base64
from pathlib import Path
from uuid import uuid4
import cv2
import numpy as np
import io
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...models import (
    Attempt,
    AttemptAnswer,
    Exam,
    User,
    Question,
    RoleEnum,
    AttemptStatus,
    ExamType,
    ExamStatus,
    Schedule,
    AccessMode,
    ProctoringEvent,
)
from ...core.config import get_settings
from ...schemas import (
    AttemptCreate,
    AttemptResolveRequest,
    AttemptRead,
    AttemptAnswerBase,
    AttemptAnswerRead,
    AttemptAnswerReviewUpdate,
    Message,
)
from ..deps import ensure_permission, get_current_user, get_db_dep, require_permission, require_role, parse_uuid_param, normalize_utc_datetime
from ...detection.face_verification import compute_face_signature
from ...services.crypto_utils import encrypt_bytes
from ...modules.tests.proctoring_requirements import get_proctoring_requirements

try:
    import mediapipe as mp
except Exception:  # pragma: no cover - optional dependency
    mp = None

router = APIRouter()
settings = get_settings()


def _attempt_is_paused(db: Session, attempt_id) -> bool:
    if not hasattr(db, "scalars"):
        return False
    result = db.scalars(
        select(ProctoringEvent)
        .where(
            ProctoringEvent.attempt_id == attempt_id,
            ProctoringEvent.event_type.in_(["ATTEMPT_PAUSED", "ATTEMPT_RESUMED"]),
        )
        .order_by(ProctoringEvent.occurred_at.desc())
        .limit(1)
    )
    if hasattr(result, "first"):
        last_state_event = result.first()
    elif hasattr(result, "all"):
        rows = result.all()
        last_state_event = rows[0] if rows else None
    else:
        last_state_event = None
    return bool(last_state_event and last_state_event.event_type == "ATTEMPT_PAUSED")


def _build_attempt_read(attempt: Attempt, *, db: Session | None = None) -> AttemptRead:
    exam = attempt.exam
    user = getattr(attempt, "user", None)
    title = getattr(exam, "title", None) if exam else None
    exam_type = getattr(exam, "type", None) if exam else None
    time_limit = getattr(exam, "time_limit", None) if exam else None
    return AttemptRead(
        id=attempt.id,
        exam_id=attempt.exam_id,
        user_id=attempt.user_id,
        status=attempt.status,
        paused=_attempt_is_paused(db, attempt.id) if db is not None else False,
        score=attempt.score,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        identity_verified=attempt.identity_verified,
        created_at=attempt.created_at,
        updated_at=attempt.updated_at,
        test_title=title,
        test_type=exam_type,
        test_time_limit=time_limit,
        exam_title=title,
        exam_type=exam_type,
        exam_time_limit=time_limit,
        node_id=getattr(exam, "node_id", None) if exam else None,
        attempts_used=None,
        attempts_remaining=None,
        user_name=getattr(user, "name", None) if user else None,
        user_student_id=getattr(user, "user_id", None) if user else None,
    )


def _save_identity_photo(attempt_id: str, b64_data: str) -> str:
    """Persist an encrypted base64-encoded identity photo.

    Accepts both raw base64 strings and data URLs (data:image/jpeg;base64,...).
    Returns the absolute file path.
    """
    # Strip possible data URL prefix
    if "," in b64_data:
        b64_data = b64_data.split(",", 1)[1]

    photo_bytes = base64.b64decode(b64_data)

    storage_dir = (
        Path(__file__)
        .resolve()
        .parent.parent.parent.parent.parent
        / "storage"
        / "identity"
    )
    storage_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    filename = f"{attempt_id}_{ts}.bin"
    filepath = storage_dir / filename
    filepath.write_bytes(encrypt_bytes(photo_bytes))
    return str(filepath)


def _persistable_answer(raw_answer):
    if raw_answer is None:
        return None
    if isinstance(raw_answer, str):
        return raw_answer
    try:
        return json.dumps(raw_answer)
    except TypeError:
        return str(raw_answer)


def _normalized_text(value) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _choice_token(value, options: list[str] | None) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    upper = text.upper()
    if len(upper) == 1 and "A" <= upper <= "Z":
        if options:
            idx = ord(upper) - ord("A")
            if 0 <= idx < len(options):
                return upper
        else:
            return upper

    if options:
        normalized_options = [_normalized_text(opt) for opt in options]
        text_norm = _normalized_text(text)
        for idx, option_norm in enumerate(normalized_options):
            if option_norm == text_norm:
                return chr(ord("A") + idx)
    return _normalized_text(text)


def _multi_choice_tokens(value, options: list[str] | None) -> set[str]:
    tokens: list[str] = []
    if value is None:
        return set()

    if isinstance(value, list):
        tokens = [str(v) for v in value]
    elif isinstance(value, str):
        parsed = None
        try:
            parsed = json.loads(value)
        except Exception:
            parsed = None
        if isinstance(parsed, list):
            tokens = [str(v) for v in parsed]
        else:
            normalized = value.replace(";", ",").replace("\n", ",")
            tokens = [part.strip() for part in normalized.split(",") if part.strip()]
    else:
        tokens = [str(value)]

    canonical = {_choice_token(token, options) for token in tokens if str(token).strip()}
    return {token for token in canonical if token}


def _parsed_answer_value(value):
    if value is None:
        return None
    if isinstance(value, str):
        trimmed = value.strip()
        if not trimmed:
            return ""
        if (trimmed.startswith("[") and trimmed.endswith("]")) or (
            trimmed.startswith("{") and trimmed.endswith("}")
        ):
            try:
                return json.loads(trimmed)
            except Exception:
                return trimmed
        return trimmed
    return value


def _answer_has_content(value) -> bool:
    parsed = _parsed_answer_value(value)
    if parsed is None:
        return False
    if isinstance(parsed, str):
        return bool(parsed.strip())
    if isinstance(parsed, list):
        return any(_answer_has_content(item) for item in parsed)
    if isinstance(parsed, dict):
        return any(_answer_has_content(item) for item in parsed.values())
    return True


def _question_requires_manual_review(question: Question, submitted_answer) -> bool:
    if not _answer_has_content(submitted_answer):
        return False
    if question.type == ExamType.TEXT:
        return True
    return not bool(_normalized_text(question.correct_answer))


def _exam_schedule_for_user(db: Session, exam_id, user_id):
    return db.scalar(
        select(Schedule).where(Schedule.exam_id == exam_id, Schedule.user_id == user_id)
    )


def _enforce_attempt_access(db: Session, exam: Exam, current: User):
    if current.role != RoleEnum.LEARNER:
        return None
    if exam.status != ExamStatus.OPEN:
        raise HTTPException(status_code=404, detail="Test not found")

    now = normalize_utc_datetime(datetime.now(timezone.utc))
    user_schedule = _exam_schedule_for_user(db, exam.id, current.id)
    restricted_schedule_exists = (
        db.scalar(
            select(func.count())
            .select_from(Schedule)
            .where(
                Schedule.exam_id == exam.id,
                Schedule.access_mode == AccessMode.RESTRICTED,
            )
        )
        or 0
    ) > 0
    if restricted_schedule_exists and not user_schedule:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to this test",
        )
    scheduled_at = normalize_utc_datetime(getattr(user_schedule, "scheduled_at", None))
    if scheduled_at and now and scheduled_at > now:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This test is not yet available",
        )
    return user_schedule


def _ensure_attempt_access(db: Session, attempt: Attempt, current: User):
    if current.role == RoleEnum.LEARNER:
        if attempt.user_id != current.id:
            raise HTTPException(status_code=403, detail="Not allowed")
        return
    ensure_permission(db, current, "View Attempt Analysis")


def _evaluate_answer(question: Question, submitted_answer):
    if not question.correct_answer:
        return None, None

    q_type = question.type
    options = question.options or []
    expected = question.correct_answer

    if q_type in {ExamType.MCQ, ExamType.TRUEFALSE}:
        actual_token = _choice_token(submitted_answer, options)
        expected_token = _choice_token(expected, options)
        is_correct = bool(actual_token) and actual_token == expected_token
    elif q_type == ExamType.MULTI:
        actual_tokens = _multi_choice_tokens(submitted_answer, options)
        expected_tokens = _multi_choice_tokens(expected, options)
        is_correct = bool(actual_tokens) and actual_tokens == expected_tokens
    else:
        is_correct = _normalized_text(submitted_answer) == _normalized_text(expected)

    points = float(question.points or 0) if is_correct else 0.0
    return is_correct, points


def _auto_score_attempt(attempt: Attempt, db: Session) -> dict:
    answers = db.scalars(
        select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt.id)
    ).all()
    answer_map = {answer.question_id: answer for answer in answers}
    questions = db.scalars(
        select(Question)
        .where(Question.exam_id == attempt.exam_id)
        .order_by(Question.order.asc(), Question.created_at.asc())
    ).all()
    if not questions:
        return {"score": None, "pending_manual_review": False}

    total_points = 0.0
    earned_points = 0.0
    pending_manual_review = False
    exam_settings = attempt.exam.settings if attempt.exam else {}
    negative_marking = bool((exam_settings or {}).get("negative_marking"))
    neg_mark_value = float((exam_settings or {}).get("neg_mark_value") or 0)
    neg_mark_type = str((exam_settings or {}).get("neg_mark_type") or "points").lower()
    for question in questions:
        total_points += float(question.points or 0)
        answer = answer_map.get(question.id)
        if not answer:
            continue

        has_content = _answer_has_content(answer.answer)
        if _question_requires_manual_review(question, answer.answer):
            pending_manual_review = True
            answer.is_correct = None
            answer.points_earned = None
            db.add(answer)
            continue

        if not has_content:
            answer.is_correct = None
            answer.points_earned = 0.0
            db.add(answer)
            continue

        is_correct, points_earned = _evaluate_answer(question, answer.answer)
        if (
            points_earned == 0.0
            and negative_marking
            and neg_mark_value > 0
            and has_content
        ):
            if neg_mark_type == "points":
                points_earned = -min(neg_mark_value, float(question.points or 0))
            else:
                points_earned = -(float(question.points or 0) * neg_mark_value)
        answer.is_correct = is_correct
        answer.points_earned = points_earned
        if points_earned is not None:
            earned_points += points_earned
        db.add(answer)

    if total_points <= 0:
        return {"score": None, "pending_manual_review": pending_manual_review}
    if pending_manual_review:
        return {"score": None, "pending_manual_review": True}
    earned_points = max(earned_points, 0.0)
    return {
        "score": round((earned_points / total_points) * 100, 2),
        "pending_manual_review": False,
    }


def _apply_admin_grade(attempt: Attempt, *, score: float, db: Session) -> Attempt:
    if score < 0 or score > 100:
        raise HTTPException(status_code=422, detail="Score must be between 0 and 100")
    if attempt.status == AttemptStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Attempt must be submitted before grading")

    if attempt.submitted_at is None:
        attempt.submitted_at = datetime.now(timezone.utc)
    attempt.score = round(float(score), 2)
    attempt.status = AttemptStatus.GRADED
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


def _calculate_attempt_review_progress(attempt: Attempt, db: Session) -> dict:
    answers = db.scalars(
        select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt.id)
    ).all()
    answer_map = {answer.question_id: answer for answer in answers}
    questions = db.scalars(
        select(Question)
        .where(Question.exam_id == attempt.exam_id)
        .order_by(Question.order.asc(), Question.created_at.asc())
    ).all()

    total_points = 0.0
    earned_points = 0.0
    manual_total = 0
    manual_reviewed = 0
    pending_manual_review = False

    for question in questions:
        total_points += float(question.points or 0)
        answer = answer_map.get(question.id)
        if not answer:
            continue

        if _question_requires_manual_review(question, answer.answer):
            manual_total += 1
            if answer.points_earned is None:
                pending_manual_review = True
                continue
            manual_reviewed += 1
            earned_points += float(answer.points_earned or 0)
            continue

        if answer.points_earned is not None:
            earned_points += float(answer.points_earned)

    score = None
    if total_points > 0 and not pending_manual_review:
        score = round((max(earned_points, 0.0) / total_points) * 100, 2)

    return {
        "score": score,
        "pending_manual_review": pending_manual_review,
        "manual_total": manual_total,
        "manual_reviewed": manual_reviewed,
    }


def _face_present(image_bytes: bytes) -> bool:
    np_arr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if frame is None:
        return False
    if mp is not None and hasattr(mp, "solutions") and getattr(mp.solutions, "face_detection", None):
        try:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            detector = mp.solutions.face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.6)
            res = detector.process(rgb)
            return bool(res.detections)
        except Exception:
            pass
    # Fallback when mediapipe is unavailable (e.g. lightweight CI/dev environments).
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    classifier = cv2.CascadeClassifier(cascade_path)
    faces = classifier.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(40, 40))
    return len(faces) > 0


def _runtime_settings(exam: Exam | None) -> dict:
    settings_payload = getattr(exam, "settings", None)
    return settings_payload if isinstance(settings_payload, dict) else {}


def _create_attempt_record(db: Session, exam: Exam, current: User) -> Attempt:
    _enforce_attempt_access(db, exam, current)
    if current.role == RoleEnum.LEARNER:
        existing_attempts = db.scalars(
            select(Attempt)
            .where(
                Attempt.exam_id == exam.id,
                Attempt.user_id == current.id,
            )
            .order_by(Attempt.started_at.desc(), Attempt.created_at.desc())
        ).all()
        count = len(existing_attempts)
        if count >= exam.max_attempts:
            raise HTTPException(status_code=400, detail="Max attempts reached")

        runtime_settings = _runtime_settings(exam)
        completed_attempts = [attempt for attempt in existing_attempts if attempt.status in {AttemptStatus.SUBMITTED, AttemptStatus.GRADED}]
        if completed_attempts:
            allow_retake = bool(runtime_settings.get("allow_retake"))
            if not allow_retake:
                raise HTTPException(status_code=400, detail="Retakes are disabled for this test")

            cooldown_raw = runtime_settings.get("retake_cooldown_hours")
            try:
                cooldown_hours = float(cooldown_raw or 0)
            except (TypeError, ValueError):
                cooldown_hours = 0.0

            latest_completed = max(
                completed_attempts,
                key=lambda attempt: normalize_utc_datetime(
                    attempt.submitted_at or attempt.updated_at or attempt.created_at
                ) or datetime.min.replace(tzinfo=timezone.utc),
            )
            latest_completed_at = normalize_utc_datetime(
                latest_completed.submitted_at or latest_completed.updated_at or latest_completed.created_at
            )
            if latest_completed_at and cooldown_hours > 0:
                available_at = latest_completed_at + timedelta(hours=cooldown_hours)
                now = normalize_utc_datetime(datetime.now(timezone.utc))
                if now and now < available_at:
                    wait_minutes = max(1, int((available_at - now).total_seconds() // 60) + (1 if (available_at - now).total_seconds() % 60 else 0))
                    raise HTTPException(status_code=400, detail=f"Retake available in {wait_minutes} minute(s)")
    now = datetime.now(timezone.utc)
    attempt = Attempt(
        exam_id=exam.id,
        user_id=current.id,
        status=AttemptStatus.IN_PROGRESS,
        started_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


@router.post("/", response_model=AttemptRead)
async def create_attempt(body: AttemptCreate, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.LEARNER, RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    exam = db.get(Exam, body.exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Test not found")
    attempt = _create_attempt_record(db, exam, current)
    return _build_attempt_read(attempt, db=db)


@router.post("/resolve", response_model=AttemptRead)
async def resolve_attempt(
    body: AttemptResolveRequest,
    db: Session = Depends(get_db_dep),
    current=Depends(require_role(RoleEnum.LEARNER, RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    exam = db.get(Exam, body.exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Test not found")
    _enforce_attempt_access(db, exam, current)
    reusable = db.scalars(
        select(Attempt)
        .where(
            Attempt.exam_id == body.exam_id,
            Attempt.user_id == current.id,
            Attempt.status == AttemptStatus.IN_PROGRESS,
        )
        .order_by(Attempt.started_at.desc(), Attempt.created_at.desc())
        .limit(1)
    ).first()
    if reusable:
        return _build_attempt_read(reusable, db=db)
    attempt = _create_attempt_record(db, exam, current)
    return _build_attempt_read(attempt, db=db)


@router.get("/", response_model=list[AttemptRead])
async def list_attempts(
    exam_id: str | None = None,
    user_id: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    query = select(Attempt)
    if current.role == RoleEnum.LEARNER:
        query = query.where(Attempt.user_id == current.id)
    else:
        ensure_permission(db, current, "View Attempt Analysis")
        if user_id:
            try:
                from uuid import UUID
                query = query.where(Attempt.user_id == str(UUID(user_id)))
            except (ValueError, TypeError):
                pass
    if exam_id:
        try:
            from uuid import UUID
            query = query.where(Attempt.exam_id == str(UUID(exam_id)))
        except (ValueError, TypeError):
            pass
    if status:
        try:
            query = query.where(Attempt.status == AttemptStatus(status))
        except ValueError:
            pass
    attempts = db.scalars(query.order_by(Attempt.created_at.desc())).all()
    return [_build_attempt_read(a, db=db) for a in attempts]


@router.get("/{attempt_id}", response_model=AttemptRead)
async def get_attempt(
    attempt_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt_pk = parse_uuid_param(attempt_id, detail="Attempt not found")
    attempt = db.get(Attempt, attempt_pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    _ensure_attempt_access(db, attempt, current)
    return _build_attempt_read(attempt, db=db)


@router.post("/{attempt_id}/answers", response_model=AttemptAnswerRead)
async def submit_answer(
    attempt_id: str,
    body: AttemptAnswerBase,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt_pk = parse_uuid_param(attempt_id, detail="Attempt not found")
    attempt = db.get(Attempt, attempt_pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    _ensure_attempt_access(db, attempt, current)
    if _attempt_is_paused(db, attempt_pk):
        raise HTTPException(status_code=409, detail="Attempt is paused")
    persisted_answer = _persistable_answer(body.answer)
    ans = db.scalar(
        select(AttemptAnswer).where(
            AttemptAnswer.attempt_id == attempt_pk,
            AttemptAnswer.question_id == body.question_id,
        )
    )
    if ans:
        ans.answer = persisted_answer
    else:
        ans = AttemptAnswer(attempt_id=attempt_pk, question_id=body.question_id, answer=persisted_answer)
        db.add(ans)
    try:
        db.commit()
    except IntegrityError:
        # In case of concurrent creates, reconcile on the newly existing row.
        db.rollback()
        ans = db.scalar(
            select(AttemptAnswer).where(
                AttemptAnswer.attempt_id == attempt_pk,
                AttemptAnswer.question_id == body.question_id,
            )
        )
        if not ans:
            raise
        ans.answer = persisted_answer
        db.add(ans)
        db.commit()
    db.refresh(ans)
    if getattr(ans, "id", None) is None:
        ans.id = uuid4()
    ans.question_text = ans.question.text if ans.question else None
    return ans


@router.get("/{attempt_id}/answers", response_model=list[AttemptAnswerRead])
async def list_attempt_answers(
    attempt_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt_pk = parse_uuid_param(attempt_id, detail="Attempt not found")
    attempt = db.get(Attempt, attempt_pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    _ensure_attempt_access(db, attempt, current)
    answers = db.scalars(
        select(AttemptAnswer)
        .where(AttemptAnswer.attempt_id == attempt_pk)
        .order_by(AttemptAnswer.id)
    ).all()
    for answer in answers:
        if getattr(answer, "id", None) is None:
            answer.id = uuid4()
        answer.question_text = answer.question.text if answer.question else None
    return answers


@router.post("/{attempt_id}/submit", response_model=AttemptRead)
async def submit_attempt(
    attempt_id: str,
    score: float | None = None,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt_pk = parse_uuid_param(attempt_id, detail="Attempt not found")
    attempt = db.get(Attempt, attempt_pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    _ensure_attempt_access(db, attempt, current)
    if _attempt_is_paused(db, attempt_pk):
        raise HTTPException(status_code=409, detail="Attempt is paused")
    exam_proctoring = attempt.exam.proctoring_config if attempt.exam else None
    exam_requirements = get_proctoring_requirements(exam_proctoring)
    exam_requires_verification = exam_requirements["identity_required"]
    if (
        exam_requires_verification
        and not (attempt.id_verified or attempt.identity_verified)
        and not settings.PRECHECK_ALLOW_TEST_BYPASS
    ):
        raise HTTPException(status_code=400, detail="Pre-test verification required")
    if current.role == RoleEnum.LEARNER:
        score = None  # learners cannot grade
    elif score is not None:
        graded = _apply_admin_grade(attempt, score=score, db=db)
        return _build_attempt_read(graded, db=db)

    score_result = _auto_score_attempt(attempt, db)
    computed_score = score_result["score"]
    attempt.status = AttemptStatus.SUBMITTED
    attempt.submitted_at = datetime.now(timezone.utc)
    if score is None and computed_score is not None:
        score = computed_score
    if score is not None:
        attempt.score = score
    else:
        attempt.score = None
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return _build_attempt_read(attempt, db=db)


@router.post("/{attempt_id}/grade", response_model=AttemptRead)
async def grade_attempt(
    attempt_id: str,
    score: float,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("View Attempt Analysis", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    attempt_pk = parse_uuid_param(attempt_id, detail="Attempt not found")
    attempt = db.get(Attempt, attempt_pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    graded = _apply_admin_grade(attempt, score=score, db=db)
    return _build_attempt_read(graded, db=db)


@router.post("/{attempt_id}/answers/{answer_id}/review", response_model=AttemptAnswerRead)
async def review_attempt_answer(
    attempt_id: str,
    answer_id: str,
    body: AttemptAnswerReviewUpdate,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("View Attempt Analysis", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    attempt_pk = parse_uuid_param(attempt_id, detail="Attempt not found")
    answer_pk = parse_uuid_param(answer_id, detail="Attempt answer not found")
    attempt = db.get(Attempt, attempt_pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.status == AttemptStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Attempt must be submitted before review")

    answer = db.scalar(
        select(AttemptAnswer).where(
            AttemptAnswer.id == answer_pk,
            AttemptAnswer.attempt_id == attempt_pk,
        )
    )
    if not answer:
        raise HTTPException(status_code=404, detail="Attempt answer not found")

    question = answer.question
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if not _question_requires_manual_review(question, answer.answer):
        raise HTTPException(status_code=400, detail="Only manual-review answers can be reviewed")

    max_points = float(question.points or 0)
    points_earned = round(float(body.points_earned), 2)
    if points_earned < 0 or points_earned > max_points:
        raise HTTPException(status_code=422, detail=f"Points must be between 0 and {max_points:g}")

    answer.points_earned = points_earned
    answer.is_correct = None
    db.add(answer)
    db.commit()
    db.refresh(answer)
    answer.question_text = answer.question.text if answer.question else None
    return answer


@router.post("/{attempt_id}/finalize-review", response_model=AttemptRead)
async def finalize_attempt_review(
    attempt_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("View Attempt Analysis", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    attempt_pk = parse_uuid_param(attempt_id, detail="Attempt not found")
    attempt = db.get(Attempt, attempt_pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.status == AttemptStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Attempt must be submitted before review")

    progress = _calculate_attempt_review_progress(attempt, db)
    if progress["manual_total"] > 0 and progress["pending_manual_review"]:
        raise HTTPException(status_code=409, detail="Review all manual answers before finalizing")
    if progress["score"] is None:
        raise HTTPException(status_code=400, detail="Attempt score could not be finalized")

    attempt.score = progress["score"]
    attempt.status = AttemptStatus.GRADED
    if attempt.submitted_at is None:
        attempt.submitted_at = datetime.now(timezone.utc)
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return _build_attempt_read(attempt, db=db)


@router.post("/{attempt_id}/verify-identity", response_model=AttemptRead)
async def verify_identity(
    attempt_id: str,
    photo_base64: str = Body(..., embed=True, description="Base64 data URL or raw base64 of the captured ID photo."),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    """Mark attempt as identity verified and persist the captured photo."""
    attempt_pk = parse_uuid_param(attempt_id, detail="Attempt not found")
    attempt = db.get(Attempt, attempt_pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if current.role == RoleEnum.LEARNER and attempt.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    try:
        raw_bytes = base64.b64decode(photo_base64.split(",", 1)[1] if "," in photo_base64 else photo_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid photo data")

    if not _face_present(raw_bytes):
        raise HTTPException(status_code=400, detail="Face not detected in the photo")

    signature = compute_face_signature(raw_bytes)

    _save_identity_photo(str(attempt_pk), photo_base64)

    attempt.identity_verified = True
    attempt.id_verified = True
    attempt.precheck_passed_at = datetime.now(timezone.utc)
    attempt.face_signature = signature
    attempt.updated_at = datetime.now(timezone.utc)
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return _build_attempt_read(attempt, db=db)


def _generate_certificate(attempt: Attempt) -> bytes:
    """Generate a simple PDF certificate and return bytes."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    exam = attempt.exam
    user = attempt.user
    cfg = exam.certificate or {}

    title = cfg.get("title") or "Certificate of Completion"
    subtitle = cfg.get("subtitle") or ""
    issuer = cfg.get("issuer") or "SYRA LMS"
    signer = cfg.get("signer") or "Authorized Signatory"

    c.setFont("Helvetica-Bold", 24)
    c.drawCentredString(width / 2, height - 120, title)
    c.setFont("Helvetica", 14)
    c.drawCentredString(width / 2, height - 150, subtitle)

    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 220, "This certifies that")
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, height - 250, user.name if user else "Learner")

    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 290, "has successfully completed")
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width / 2, height - 320, exam.title if exam else "Test")

    c.setFont("Helvetica", 10)
    c.drawCentredString(width / 2, height - 360, f"Score: {attempt.score if attempt.score is not None else 'N/A'}")
    c.drawCentredString(width / 2, height - 380, f"Date: {attempt.submitted_at.strftime('%Y-%m-%d') if attempt.submitted_at else datetime.now().strftime('%Y-%m-%d')}")

    c.line(width / 2 - 120, height - 450, width / 2 + 120, height - 450)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(width / 2, height - 470, signer)
    c.setFont("Helvetica", 10)
    c.drawCentredString(width / 2, height - 490, issuer)

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.read()


@router.post("/import", response_model=list[AttemptRead])
async def import_attempts(
    body: list[dict] = Body(...),
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("View Attempt Analysis", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    """Bulk import attempt results. Each row: {user_id, test_title|exam_title, score}"""
    created = []
    now = datetime.now(timezone.utc)
    for row in body:
        uid = str(row.get("user_id", "")).strip()
        test_title = str(row.get("test_title") or row.get("exam_title") or "").strip()
        try:
            score = float(row.get("score", 0))
        except (TypeError, ValueError):
            continue
        user = db.scalar(
            select(User).where((User.user_id == uid) | (User.email == uid))
        )
        exam = db.scalar(select(Exam).where(Exam.title == test_title)) if test_title else None
        if not user or not exam:
            continue
        attempt = Attempt(
            exam_id=exam.id,
            user_id=user.id,
            status=AttemptStatus.GRADED,
            score=score,
            started_at=now,
            submitted_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(attempt)
        db.flush()
        created.append(_build_attempt_read(attempt, db=db))
    db.commit()
    return created


@router.get("/{attempt_id}/certificate")
async def download_certificate(
    attempt_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt_pk = parse_uuid_param(attempt_id, detail="Attempt not found")
    attempt = db.get(Attempt, attempt_pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    _ensure_attempt_access(db, attempt, current)

    exam = attempt.exam
    if not exam or not exam.certificate:
        raise HTTPException(status_code=400, detail="Certificate not configured for this test")

    if attempt.status not in {AttemptStatus.SUBMITTED, AttemptStatus.GRADED}:
        raise HTTPException(status_code=400, detail="Attempt not completed yet")

    if exam.passing_score is not None and attempt.score is not None and attempt.score < exam.passing_score:
        raise HTTPException(status_code=400, detail="Passing score not met")

    pdf_bytes = _generate_certificate(attempt)
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="certificate_{attempt_id}.pdf"'
    })
