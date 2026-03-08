from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import ReportSchedule, RoleEnum, Attempt
from ...schemas import ReportScheduleCreate, ReportScheduleRead, Message, ReportScheduleRunResult
from ..deps import get_db_dep, parse_uuid_param, require_permission
from datetime import datetime, timezone
from pathlib import Path
from croniter import croniter
from ...services.email import send_email
from ...services.integrations import send_report_integration_event
from ...services.audit import write_audit_log
from ...models import SystemSettings
from ...core.config import get_settings
import json
import re

router = APIRouter()
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
REPORT_TYPES = {"attempt-summary", "risk-alerts", "usage"}
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
    if not croniter.is_valid(cron_value):
        raise HTTPException(status_code=400, detail="Invalid cron expression")

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
    rows = ""
    for a in attempts:
        rows += f"<tr><td>{a.id}</td><td>{a.exam.title if a.exam else ''}</td><td>{a.user.name if a.user else ''}</td><td>{a.score if a.score is not None else ''}</td><td>{a.status}</td></tr>"
    return f"""
    <html><head><style>
    table {{ border-collapse: collapse; width: 100%; font-family: Arial; }}
    th, td {{ border: 1px solid #ddd; padding: 8px; font-size: 12px; }}
    th {{ background: #f3f4f6; }}
    </style></head>
    <body>
    <h2>Attempt Summary Report</h2>
    <p>Generated at {datetime.now(timezone.utc).isoformat()}</p>
    <table>
      <thead><tr><th>ID</th><th>Test</th><th>User</th><th>Score</th><th>Status</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
    </body></html>
    """


def _render_risk_alerts_report(attempts: list[Attempt]) -> str:
    rows = ""
    for attempt in attempts:
        events = attempt.events or []
        high = len([event for event in events if str(event.severity) == "SeverityEnum.HIGH" or getattr(event.severity, "value", "") == "HIGH"])
        medium = len([event for event in events if str(event.severity) == "SeverityEnum.MEDIUM" or getattr(event.severity, "value", "") == "MEDIUM"])
        rows += f"<tr><td>{attempt.id}</td><td>{attempt.user.name if attempt.user else ''}</td><td>{attempt.exam.title if attempt.exam else ''}</td><td>{high}</td><td>{medium}</td></tr>"
    return f"""
    <html><head><style>
    table {{ border-collapse: collapse; width: 100%; font-family: Arial; }}
    th, td {{ border: 1px solid #ddd; padding: 8px; font-size: 12px; }}
    th {{ background: #fef3c7; }}
    </style></head>
    <body>
    <h2>Risk Alerts Report</h2>
    <p>Generated at {datetime.now(timezone.utc).isoformat()}</p>
    <table>
      <thead><tr><th>Attempt</th><th>User</th><th>Test</th><th>High Alerts</th><th>Medium Alerts</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
    </body></html>
    """


def _render_usage_report(attempts: list[Attempt]) -> str:
    total = len(attempts)
    graded = len([attempt for attempt in attempts if getattr(attempt.status, "value", attempt.status) == "GRADED"])
    submitted = len([attempt for attempt in attempts if getattr(attempt.status, "value", attempt.status) == "SUBMITTED"])
    in_progress = len([attempt for attempt in attempts if getattr(attempt.status, "value", attempt.status) == "IN_PROGRESS"])
    scores = [attempt.score for attempt in attempts if attempt.score is not None]
    avg_score = round(sum(scores) / len(scores), 2) if scores else None
    return f"""
    <html><head><style>
    body {{ font-family: Arial; }}
    .card {{ border: 1px solid #ddd; padding: 12px; margin: 10px 0; border-radius: 8px; }}
    </style></head>
    <body>
    <h2>Usage Report</h2>
    <p>Generated at {datetime.now(timezone.utc).isoformat()}</p>
    <div class="card"><strong>Total Attempts:</strong> {total}</div>
    <div class="card"><strong>In Progress:</strong> {in_progress}</div>
    <div class="card"><strong>Submitted:</strong> {submitted}</div>
    <div class="card"><strong>Graded:</strong> {graded}</div>
    <div class="card"><strong>Average Score:</strong> {avg_score if avg_score is not None else 'N/A'}</div>
    </body></html>
    """


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
    return f"{base}/reports/{filename.name}"


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
    attempts = db.scalars(select(Attempt).order_by(Attempt.created_at.desc()).limit(50)).all()
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
        try:
            for r in recipients:
                await send_email(f"Report {schedule.name}", r, f"Report generated: {report_url}")
            send_status = "sent"
        except Exception as exc:
            send_status = f"email failed: {exc}"
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
