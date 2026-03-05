from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Body
from fastapi.responses import StreamingResponse
import base64
from pathlib import Path
import cv2
import numpy as np
import io
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ...models import Attempt, AttemptAnswer, Exam, User, RoleEnum, AttemptStatus
from ...core.config import get_settings
from ...schemas import AttemptCreate, AttemptRead, AttemptAnswerBase, AttemptAnswerRead, Message
from ..deps import get_current_user, get_db_dep, require_role
from ...detection.face_verification import compute_face_signature

try:
    import mediapipe as mp
except Exception:  # pragma: no cover - optional dependency
    mp = None

router = APIRouter()
settings = get_settings()


def _build_attempt_read(attempt: Attempt) -> AttemptRead:
    exam = attempt.exam
    return AttemptRead(
        id=attempt.id,
        exam_id=attempt.exam_id,
        user_id=attempt.user_id,
        status=attempt.status,
        score=attempt.score,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        identity_verified=attempt.identity_verified,
        created_at=attempt.created_at,
        updated_at=attempt.updated_at,
        exam_title=exam.title if exam else None,
        exam_type=exam.type if exam else None,
        exam_time_limit=exam.time_limit if exam else None,
        node_id=exam.node_id if exam else None,
        attempts_used=None,
        attempts_remaining=None,
        user_name=attempt.user.name if attempt.user else None,
        user_student_id=attempt.user.user_id if attempt.user else None,
    )


def _save_identity_photo(attempt_id: str, b64_data: str) -> str:
    """Persist a base64-encoded JPEG/PNG identity photo.

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
    filename = f"{attempt_id}.jpg"
    filepath = storage_dir / filename
    filepath.write_bytes(photo_bytes)
    return str(filepath)


def _face_present(image_bytes: bytes) -> bool:
    np_arr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if frame is None:
        return False
    if mp is not None:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        detector = mp.solutions.face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.6)
        res = detector.process(rgb)
        return bool(res.detections)
    # Fallback when mediapipe is unavailable (e.g. lightweight CI/dev environments).
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    classifier = cv2.CascadeClassifier(cascade_path)
    faces = classifier.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(40, 40))
    return len(faces) > 0


@router.post("/", response_model=AttemptRead)
async def create_attempt(body: AttemptCreate, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.LEARNER, RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    exam = db.get(Exam, body.exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if current.role == RoleEnum.LEARNER and not settings.PRECHECK_ALLOW_TEST_BYPASS:
        # count attempts only when not in bypass/dev mode
        count = db.scalar(select(func.count(Attempt.id)).where(Attempt.exam_id == body.exam_id, Attempt.user_id == current.id)) or 0
        if count >= exam.max_attempts:
            raise HTTPException(status_code=400, detail="Max attempts reached")
    now = datetime.now(timezone.utc)
    attempt = Attempt(
        exam_id=body.exam_id,
        user_id=current.id,
        status=AttemptStatus.IN_PROGRESS,
        started_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return _build_attempt_read(attempt)


@router.get("/", response_model=list[AttemptRead])
async def list_attempts(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    query = select(Attempt)
    if current.role == RoleEnum.LEARNER:
        query = query.where(Attempt.user_id == current.id)
    attempts = db.scalars(query).all()
    return [_build_attempt_read(a) for a in attempts]


@router.get("/{attempt_id}", response_model=AttemptRead)
async def get_attempt(
    attempt_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if current.role == RoleEnum.LEARNER and attempt.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    return _build_attempt_read(attempt)


@router.post("/{attempt_id}/answers", response_model=AttemptAnswerRead)
async def submit_answer(
    attempt_id: str,
    body: AttemptAnswerBase,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if current.role == RoleEnum.LEARNER and attempt.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    ans = AttemptAnswer(attempt_id=attempt_id, question_id=body.question_id, answer=body.answer)
    db.add(ans)
    db.commit()
    db.refresh(ans)
    return ans


@router.get("/{attempt_id}/answers", response_model=list[AttemptAnswerRead])
async def list_attempt_answers(
    attempt_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if current.role == RoleEnum.LEARNER and attempt.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    answers = db.scalars(
        select(AttemptAnswer)
        .where(AttemptAnswer.attempt_id == attempt_id)
        .order_by(AttemptAnswer.id)
    ).all()
    return answers


@router.post("/{attempt_id}/submit", response_model=AttemptRead)
async def submit_attempt(
    attempt_id: str,
    score: float | None = None,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if current.role == RoleEnum.LEARNER and attempt.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    if not attempt.id_verified:
        raise HTTPException(status_code=400, detail="Pre-exam verification required")
    if current.role == RoleEnum.LEARNER:
        score = None  # learners cannot grade
    attempt.status = AttemptStatus.SUBMITTED
    attempt.submitted_at = datetime.now(timezone.utc)
    if score is not None:
        attempt.score = score
        attempt.status = AttemptStatus.GRADED
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return _build_attempt_read(attempt)


@router.post("/{attempt_id}/verify-identity", response_model=AttemptRead)
async def verify_identity(
    attempt_id: str,
    photo_base64: str = Body(..., embed=True, description="Base64 data URL or raw base64 of the captured ID photo."),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    """Mark attempt as identity verified and persist the captured photo."""
    attempt = db.get(Attempt, attempt_id)
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
    if signature is None:
        raise HTTPException(status_code=400, detail="Unable to extract face features for verification")

    _save_identity_photo(attempt_id, photo_base64)

    attempt.identity_verified = True
    attempt.face_signature = signature
    attempt.updated_at = datetime.now(timezone.utc)
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return _build_attempt_read(attempt)


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
    c.drawCentredString(width / 2, height - 320, exam.title if exam else "Exam")

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
    current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    """Bulk import attempt results. Each row: {user_id, exam_title, score}"""
    created = []
    now = datetime.now(timezone.utc)
    for row in body:
        uid = str(row.get("user_id", "")).strip()
        exam_title = str(row.get("exam_title", "")).strip()
        try:
            score = float(row.get("score", 0))
        except (TypeError, ValueError):
            continue
        user = db.scalar(
            select(User).where((User.user_id == uid) | (User.email == uid))
        )
        exam = db.scalar(select(Exam).where(Exam.title == exam_title)) if exam_title else None
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
        created.append(_build_attempt_read(attempt))
    db.commit()
    return created


@router.get("/{attempt_id}/certificate")
async def download_certificate(
    attempt_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if current.role == RoleEnum.LEARNER and attempt.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    exam = attempt.exam
    if not exam or not exam.certificate:
        raise HTTPException(status_code=400, detail="Certificate not configured for this exam")

    if attempt.status not in {AttemptStatus.SUBMITTED, AttemptStatus.GRADED}:
        raise HTTPException(status_code=400, detail="Attempt not completed yet")

    if exam.passing_score is not None and attempt.score is not None and attempt.score < exam.passing_score:
        raise HTTPException(status_code=400, detail="Passing score not met")

    pdf_bytes = _generate_certificate(attempt)
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="certificate_{attempt_id}.pdf"'
    })
