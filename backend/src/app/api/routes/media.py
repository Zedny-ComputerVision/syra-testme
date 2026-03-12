from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from ...core.config import get_settings
from ...core.security import verify_token
from ...models import Attempt, RoleEnum, User
from ...services.supabase_storage import create_signed_url as create_supabase_signed_url
from ..deps import ensure_permission, get_current_user, get_db_dep, parse_uuid_param, require_role

router = APIRouter()
settings = get_settings()

BASE_STORAGE_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "storage"
REPORTS_DIR = BASE_STORAGE_DIR / "reports"
VIDEO_DIR = BASE_STORAGE_DIR / "videos"
EVIDENCE_DIR = BASE_STORAGE_DIR / "evidence"


def _sanitize_filename(filename: str) -> str:
    cleaned = Path(str(filename or "")).name
    if not cleaned or cleaned in {".", ".."} or cleaned != filename:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media file not found")
    return cleaned


def _attempt_for_media(filename: str, db: Session) -> Attempt:
    attempt_prefix = filename.split("_", 1)[0]
    attempt_id = parse_uuid_param(attempt_prefix, detail="Media file not found")
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media file not found")
    return attempt


def _enforce_media_access(attempt: Attempt, current_user: User, db: Session) -> None:
    if current_user.role == RoleEnum.LEARNER:
        if attempt.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
        return
    if current_user.role == RoleEnum.ADMIN:
        return
    ensure_permission(db, current_user, "View Attempt Analysis")


def _serve_media_file(directory: Path, filename: str, db: Session, current_user: User) -> FileResponse:
    cleaned = _sanitize_filename(filename)
    attempt = _attempt_for_media(cleaned, db)
    _enforce_media_access(attempt, current_user, db)

    file_path = directory / cleaned
    if not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media file not found")
    return FileResponse(path=file_path, filename=cleaned)


def _serve_admin_media_file(directory: Path, filename: str) -> FileResponse:
    cleaned = _sanitize_filename(filename)
    file_path = directory / cleaned
    if not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media file not found")
    return FileResponse(path=file_path, filename=cleaned)


async def _redirect_supabase_media(folder: str, filename: str) -> RedirectResponse:
    cleaned = _sanitize_filename(filename)
    try:
        signed_url = await create_supabase_signed_url(f"{folder}/{cleaned}")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Supabase media is unavailable: {exc}") from exc
    return RedirectResponse(url=signed_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


def _public_report_filename_from_token(token: str) -> str:
    try:
        payload = verify_token(token, expected_type="report_access")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid report link") from exc
    filename = payload.get("sub")
    cleaned = _sanitize_filename(str(filename or ""))
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid report link")
    return cleaned


@router.get("/videos/{filename}")
async def get_video(
    filename: str,
    db: Session = Depends(get_db_dep),
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Local proctoring video serving has been removed. Use the playback URL returned by /proctoring/{attempt_id}/videos.",
    )


@router.get("/evidence/{filename}")
async def get_evidence(
    filename: str,
    db: Session = Depends(get_db_dep),
    current_user: User = Depends(get_current_user),
):
    if settings.MEDIA_STORAGE_PROVIDER == "supabase":
        cleaned = _sanitize_filename(filename)
        attempt = _attempt_for_media(cleaned, db)
        _enforce_media_access(attempt, current_user, db)
        return await _redirect_supabase_media("evidence", cleaned)
    return _serve_media_file(EVIDENCE_DIR, filename, db, current_user)


@router.get("/reports/public/{token}")
async def get_public_report(token: str):
    filename = _public_report_filename_from_token(token)
    if settings.MEDIA_STORAGE_PROVIDER == "supabase":
        return await _redirect_supabase_media("reports", filename)
    return _serve_admin_media_file(REPORTS_DIR, filename)


@router.get("/reports/{filename}")
async def get_report(
    filename: str,
    _: User = Depends(require_role(RoleEnum.ADMIN)),
):
    if settings.MEDIA_STORAGE_PROVIDER == "supabase":
        return await _redirect_supabase_media("reports", filename)
    return _serve_admin_media_file(REPORTS_DIR, filename)
