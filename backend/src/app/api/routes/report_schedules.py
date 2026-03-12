import inspect

from fastapi import HTTPException

from ...api.deps import parse_uuid_param
from ...models import ReportSchedule
from ...modules.reports.repository import ReportRepository
from ...modules.reports.routes_admin import schedule_router as router
from ...modules.reports.schemas import ReportScheduleCreate, ReportScheduleRunResult
from ...modules.reports.service import ReportService
from ...services.audit import write_audit_log
from ...services.email import send_email
from ...services.integrations import send_report_integration_event


def _service_from_db(db) -> ReportService:
    return ReportService(ReportRepository(db))


def report_schedule_due(schedule, now=None) -> bool:
    return _service_from_db(None).report_schedule_due(schedule, now=now)


async def run_report_schedule(db, schedule) -> dict[str, str]:
    result = _service_from_db(db)._run_report_schedule(schedule)
    if inspect.isawaitable(result):
        return await result
    return result


def _normalize_schedule_payload(body: ReportScheduleCreate) -> dict:
    return _service_from_db(None)._normalize_schedule_payload(body)


def _load_subscribers(db) -> list[str]:
    return _service_from_db(db)._load_subscribers()


def _load_integrations(db) -> dict:
    return _service_from_db(db)._load_integrations()


async def run_schedule_now(
    schedule_id: str,
    db=None,
    current=None,
):
    schedule_pk = parse_uuid_param(schedule_id, detail="Not found")
    schedule = db.get(ReportSchedule, schedule_pk) if db is not None else None
    if not schedule:
        raise HTTPException(status_code=404, detail="Not found")

    artifact = run_report_schedule(db, schedule)
    if inspect.isawaitable(artifact):
        artifact = await artifact
    report_url = artifact["report_url"]
    subscribers = _load_subscribers(db)
    recipients = list({*(schedule.recipients or []), *subscribers})
    send_status = "no recipients"

    if recipients:
        results = []
        for recipient in recipients:
            result = send_email(f"Report {schedule.name}", recipient, f"Report generated: {report_url}")
            if inspect.isawaitable(result):
                result = await result
            results.append(result)
        normalized_results = [result is not False for result in results]
        if all(normalized_results):
            send_status = "sent"
        elif any(normalized_results):
            send_status = "partially sent"
        else:
            send_status = "delivery failed"

    try:
        integration_result = send_report_integration_event(report_url, _load_integrations(db))
        if inspect.isawaitable(integration_result):
            await integration_result
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


__all__ = [
    "router",
    "ReportSchedule",
    "ReportScheduleCreate",
    "ReportScheduleRunResult",
    "report_schedule_due",
    "run_report_schedule",
    "_normalize_schedule_payload",
    "_load_subscribers",
    "_load_integrations",
    "run_schedule_now",
    "send_email",
    "send_report_integration_event",
    "write_audit_log",
]
