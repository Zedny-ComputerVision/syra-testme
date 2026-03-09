from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from ...models import ReportSchedule, RoleEnum, Attempt
from ...schemas import ReportScheduleCreate, ReportScheduleRead, Message, ReportScheduleRunResult
from ..deps import get_db_dep, parse_uuid_param, require_permission
from datetime import datetime, timezone
from pathlib import Path
from croniter import croniter
from ...services.email import send_email
from ...services.integrations import send_report_integration_event
from ...services.audit import write_audit_log
from ...services.report_rendering import render_report_template
from ...models import SystemSettings
from ...core.config import get_settings
import json
import re

router = APIRouter()
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
REPORT_TYPES = {"attempt-summary", "risk-alerts", "usage"}
CRON_FIELD_RE = re.compile(r"^[\d*/,\-]+$")
settings = get_settings()


def _normalize_recipients(raw_recipients: list[str] | None) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in raw_recipients or []:
        email = str(raw or "").strip().lower()
        if not email:
            continue
        if not EMAIL_RE.match(email):
            raise HTTPException(status_code=400, detail=f"Invalid recipient email: {email}")
        if email in seen:
            continue
        seen.add(email)
        normalized.append(email)
    return normalized


def _cron_error(detail: str) -> None:
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail)


def _validate_cron_atom(atom: str, field_name: str, minimum: int, maximum: int) -> None:
    if atom == "*":
        return
    if "-" in atom:
        parts = atom.split("-", 1)
        if len(parts) != 2 or not all(part.isdigit() for part in parts):
            _cron_error(f"Invalid cron expression: {field_name} contains an invalid range")
        start, end = (int(part) for part in parts)
        if start > end:
            _cron_error(f"Invalid cron expression: {field_name} range start cannot exceed end")
        if start < minimum or end > maximum:
            _cron_error(f"Invalid cron expression: {field_name} range must be between {minimum} and {maximum}")
        return
    if not atom.isdigit():
        _cron_error(f"Invalid cron expression: {field_name} contains an invalid value")
    value = int(atom)
    if value < minimum or value > maximum:
        _cron_error(f"Invalid cron expression: {field_name} must be between {minimum} and {maximum}")


def _validate_cron_field(field_value: str, field_name: str, minimum: int, maximum: int) -> None:
    if not field_value or not CRON_FIELD_RE.fullmatch(field_value):
        _cron_error(f"Invalid cron expression: {field_name} contains unsupported characters")
    for part in field_value.split(","):
        if not part:
            _cron_error(f"Invalid cron expression: {field_name} contains an empty segment")
        if "/" in part:
            step_parts = part.split("/")
            if len(step_parts) != 2 or not step_parts[1].isdigit() or int(step_parts[1]) <= 0:
                _cron_error(f"Invalid cron expression: {field_name} contains an invalid step value")
            _validate_cron_atom(step_parts[0], field_name, minimum, maximum)
            continue
        _validate_cron_atom(part, field_name, minimum, maximum)


def _validate_cron_expression(cron_value: str) -> None:
    fields = cron_value.split()
    if len(fields) != 5:
        _cron_error("Invalid cron expression: expected 5 fields (minute hour day month weekday)")
    limits = (
        ("minute", 0, 59),
        ("hour", 0, 23),
        ("day", 1, 31),
        ("month", 1, 12),
        ("weekday", 0, 7),
    )
    for field_value, (field_name, minimum, maximum) in zip(fields, limits):
        _validate_cron_field(field_value, field_name, minimum, maximum)


def _normalize_schedule_payload(body: ReportScheduleCreate) -> dict:
    name = str(body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Schedule name is required")

    report_type = str(body.report_type or "").strip()
    if report_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid report type")

    cron_value = str(body.schedule_cron or "").strip()
    if not cron_value:
        raise HTTPException(status_code=400, detail="A valid cron schedule is required")
    _validate_cron_expression(cron_value)

    return {
        "name": name,
        "report_type": report_type,
        "schedule_cron": cron_value,
        "recipients": _normalize_recipients(body.recipients),
        "is_active": bool(body.is_active),
    }


@router.post("/", response_model=ReportScheduleRead)
async def create_report_schedule(body: ReportScheduleCreate, db: Session = Depends(get_db_dep), current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN))):
    payload = _normalize_schedule_payload(body)
    rs = ReportSchedule(
        name=payload["name"],
        report_type=payload["report_type"],
        schedule_cron=payload["schedule_cron"],
        recipients=payload["recipients"],
        is_active=payload["is_active"],
        created_by_id=current.id,
    )
    db.add(rs)
    db.commit()
    db.refresh(rs)
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="REPORT_SCHEDULE_CREATED",
        resource_type="report_schedule",
        resource_id=str(rs.id),
        detail=f"type={rs.report_type}",
    )
    return rs


@router.get("/", response_model=list[ReportScheduleRead])
async def list_report_schedules(db: Session = Depends(get_db_dep), current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN))):
    return db.scalars(select(ReportSchedule).order_by(ReportSchedule.created_at.desc())).all()


@router.get("/{schedule_id}", response_model=ReportScheduleRead)
async def get_report_schedule(schedule_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN))):
    schedule_pk = parse_uuid_param(schedule_id, detail="Not found")
    rs = db.get(ReportSchedule, schedule_pk)
    if not rs:
        raise HTTPException(status_code=404, detail="Not found")
    return rs


@router.delete("/{schedule_id}", response_model=Message)
async def delete_report_schedule(schedule_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN))):
    schedule_pk = parse_uuid_param(schedule_id, detail="Not found")
    rs = db.get(ReportSchedule, schedule_pk)
    if not rs:
        raise HTTPException(status_code=404, detail="Not found")
    schedule_name = rs.name
    db.delete(rs)
    db.commit()
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="REPORT_SCHEDULE_DELETED",
        resource_type="report_schedule",
        resource_id=schedule_id,
        detail=schedule_name,
    )
    return Message(detail="Deleted")


def _render_attempts_report(attempts: list[Attempt]) -> str:
    rows = [
        {
            "attempt_id": str(attempt.id),
            "test_title": attempt.exam.title if attempt.exam else "",
            "user_name": attempt.user.name if attempt.user else "",
            "score": "" if attempt.score is None else attempt.score,
            "status": getattr(attempt.status, "value", attempt.status),
        }
        for attempt in attempts
    ]
    return render_report_template(
        "attempt_summary.html",
        report_title="Attempt Summary Report",
        generated_at=datetime.now(timezone.utc).isoformat(),
        rows=rows,
    )


def _render_risk_alerts_report(attempts: list[Attempt]) -> str:
    rows = []
    for attempt in attempts:
        events = attempt.events or []
        high = len([event for event in events if str(event.severity) == "SeverityEnum.HIGH" or getattr(event.severity, "value", "") == "HIGH"])
        medium = len([event for event in events if str(event.severity) == "SeverityEnum.MEDIUM" or getattr(event.severity, "value", "") == "MEDIUM"])
        rows.append(
            {
                "attempt_id": str(attempt.id),
                "user_name": attempt.user.name if attempt.user else "",
                "test_title": attempt.exam.title if attempt.exam else "",
                "high_alerts": high,
                "medium_alerts": medium,
            }
        )
    return render_report_template(
        "risk_alerts.html",
        report_title="Risk Alerts Report",
        generated_at=datetime.now(timezone.utc).isoformat(),
        rows=rows,
    )


def _render_usage_report(attempts: list[Attempt]) -> str:
    total = len(attempts)
    graded = len([attempt for attempt in attempts if getattr(attempt.status, "value", attempt.status) == "GRADED"])
    submitted = len([attempt for attempt in attempts if getattr(attempt.status, "value", attempt.status) == "SUBMITTED"])
    in_progress = len([attempt for attempt in attempts if getattr(attempt.status, "value", attempt.status) == "IN_PROGRESS"])
    scores = [attempt.score for attempt in attempts if attempt.score is not None]
    avg_score = round(sum(scores) / len(scores), 2) if scores else None
    return render_report_template(
        "usage.html",
        report_title="Usage Report",
        generated_at=datetime.now(timezone.utc).isoformat(),
        stats=[
            {"label": "Total Attempts", "value": total},
            {"label": "In Progress", "value": in_progress},
            {"label": "Submitted", "value": submitted},
            {"label": "Graded", "value": graded},
            {"label": "Average Score", "value": avg_score if avg_score is not None else "N/A"},
        ],
    )


def _load_subscribers(db: Session) -> list[str]:
    row = db.scalar(select(SystemSettings).where(SystemSettings.key == "subscribers"))
    if row and row.value:
        try:
            return json.loads(row.value)
        except Exception:
            return []
    return []


def _load_integrations(db: Session) -> dict:
    row = db.scalar(select(SystemSettings).where(SystemSettings.key == "integrations_config"))
    if row and row.value:
        try:
            return json.loads(row.value)
        except Exception:
            return {}
    return {}


def _report_public_url(filename: Path) -> str:
    base = settings.BACKEND_BASE_URL.rstrip("/")
    return f"{base}/api/media/reports/{filename.name}"


def report_schedule_due(schedule: ReportSchedule, now: datetime | None = None) -> bool:
    if not getattr(schedule, "is_active", True):
        return False

    cron_value = str(getattr(schedule, "schedule_cron", "") or "").strip()
    if not cron_value:
        return False

    baseline = getattr(schedule, "last_run_at", None) or getattr(schedule, "created_at", None)
    if baseline is None:
        return False

    current_time = now or datetime.now(timezone.utc)
    try:
        next_time = croniter(cron_value, baseline).get_next(datetime)
    except Exception:
        return False
    return next_time <= current_time


def run_report_schedule(db: Session, schedule: ReportSchedule) -> dict[str, str]:
    attempts = db.scalars(
        select(Attempt)
        .options(
            joinedload(Attempt.exam),
            joinedload(Attempt.user),
            selectinload(Attempt.events),
        )
        .order_by(Attempt.created_at.desc())
        .limit(50)
    ).all()
    renderers = {
        "attempt-summary": _render_attempts_report,
        "risk-alerts": _render_risk_alerts_report,
        "usage": _render_usage_report,
    }
    html = renderers.get(schedule.report_type, _render_attempts_report)(attempts)
    reports_dir = Path(__file__).resolve().parent.parent.parent.parent / "storage" / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = reports_dir / f"{schedule.id}_{ts}.html"
    filename.write_text(html, encoding="utf-8")
    schedule.last_run_at = datetime.now(timezone.utc)
    db.add(schedule)
    db.commit()
    return {
        "file_path": str(filename),
        "report_url": _report_public_url(filename),
    }


@router.post("/{schedule_id}/run", response_model=ReportScheduleRunResult)
async def run_schedule_now(schedule_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN))):
    schedule_pk = parse_uuid_param(schedule_id, detail="Not found")
    schedule = db.get(ReportSchedule, schedule_pk)
    if not schedule:
        raise HTTPException(status_code=404, detail="Not found")
    artifact = run_report_schedule(db, schedule)
    report_url = artifact["report_url"]
    # Send email to recipients + subscribers
    subs = _load_subscribers(db)
    recipients = list({*(schedule.recipients or []), *subs})
    send_status = "no recipients"
    if recipients:
        results = []
        for r in recipients:
            results.append(await send_email(f"Report {schedule.name}", r, f"Report generated: {report_url}"))
        normalized_results = [result is not False for result in results]
        if all(normalized_results):
            send_status = "sent"
        elif any(normalized_results):
            send_status = "partially sent"
        else:
            send_status = "delivery failed"
    # Send integration event
    try:
        await send_report_integration_event(report_url, _load_integrations(db))
    except Exception:
        pass
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="REPORT_SCHEDULE_RUN",
        resource_type="report_schedule",
        resource_id=str(schedule.id),
        detail=f"type={schedule.report_type}; recipients={len(recipients)}",
    )
    return ReportScheduleRunResult(
        detail=f"Report generated successfully (emails: {send_status})",
        report_url=report_url,
        email_status=send_status,
    )
