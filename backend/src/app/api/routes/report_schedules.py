from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import ReportSchedule, RoleEnum, Attempt
from ...schemas import ReportScheduleCreate, ReportScheduleRead, Message
from ..deps import get_db_dep, require_role
from datetime import datetime, timezone
from pathlib import Path
from croniter import croniter
from ...services.email import send_email
from ...services.integrations import send_report_integration_event
from ...models import SystemSettings
import json

router = APIRouter()


@router.post("/", response_model=ReportScheduleRead)
async def create_report_schedule(body: ReportScheduleCreate, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    rs = ReportSchedule(
        name=body.name, report_type=body.report_type, schedule_cron=body.schedule_cron,
        recipients=body.recipients, is_active=body.is_active, created_by_id=current.id,
    )
    db.add(rs)
    db.commit()
    db.refresh(rs)
    return rs


@router.get("/", response_model=list[ReportScheduleRead])
async def list_report_schedules(db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    return db.scalars(select(ReportSchedule)).all()


@router.get("/{schedule_id}", response_model=ReportScheduleRead)
async def get_report_schedule(schedule_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    rs = db.get(ReportSchedule, schedule_id)
    if not rs:
        raise HTTPException(status_code=404, detail="Not found")
    return rs


@router.delete("/{schedule_id}", response_model=Message)
async def delete_report_schedule(schedule_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    rs = db.get(ReportSchedule, schedule_id)
    if not rs:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(rs)
    db.commit()
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
      <thead><tr><th>ID</th><th>Exam</th><th>User</th><th>Score</th><th>Status</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
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


def run_report_schedule(db: Session, schedule: ReportSchedule) -> str:
    attempts = db.scalars(select(Attempt).order_by(Attempt.created_at.desc()).limit(50)).all()
    html = _render_attempts_report(attempts)
    reports_dir = Path(__file__).resolve().parent.parent.parent.parent / "storage" / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = reports_dir / f"{schedule.id}_{ts}.html"
    filename.write_text(html, encoding="utf-8")
    schedule.last_run_at = datetime.now(timezone.utc)
    db.add(schedule)
    db.commit()
    return str(filename)


@router.post("/{schedule_id}/run", response_model=Message)
async def run_schedule_now(schedule_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    schedule = db.get(ReportSchedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Not found")
    path = run_report_schedule(db, schedule)
    # Send email to recipients + subscribers
    subs = _load_subscribers(db)
    recipients = list({*(schedule.recipients or []), *subs})
    send_status = "no recipients"
    if recipients:
        try:
            for r in recipients:
                await send_email(f"Report {schedule.name}", r, f"Report generated: {path}")
            send_status = "sent"
        except Exception as exc:
            send_status = f"email failed: {exc}"
    # Send integration event
    try:
        await send_report_integration_event(path, _load_integrations(db))
    except Exception:
        pass
    return Message(detail=f"Report generated at {path} (emails: {send_status})")
