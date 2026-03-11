from ...modules.reports.repository import ReportRepository
from ...modules.reports.routes_admin import schedule_router as router
from ...modules.reports.service import ReportService


def report_schedule_due(schedule, now=None) -> bool:
    service = ReportService(ReportRepository(None))
    return service.report_schedule_due(schedule, now=now)


def run_report_schedule(db, schedule) -> dict[str, str]:
    service = ReportService(ReportRepository(db))
    return service._run_report_schedule(schedule)
