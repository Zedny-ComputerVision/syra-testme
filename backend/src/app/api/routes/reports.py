from fastapi import APIRouter

from ...modules.reports.repository import ReportRepository
from ...modules.reports.routes_admin import router as admin_router
from ...modules.reports.routes_public import router as public_router
from ...modules.reports.service import CUSTOM_REPORT_DATASETS, ReportService
from ...services.normalized_relations import ADMIN_META_KEY


router = APIRouter()
router.include_router(public_router)
router.include_router(admin_router)


def _build_custom_report_rows(db, dataset: str, search: str | None = None):
    service = ReportService(ReportRepository(db))
    return service._build_custom_report_rows(dataset, search)


def _csv_response(rows: list[dict], filename: str, columns: list[str] | None = None):
    service = ReportService(ReportRepository(None))
    return service._csv_response(rows, filename, columns=columns)


__all__ = [
    "router",
    "ADMIN_META_KEY",
    "CUSTOM_REPORT_DATASETS",
    "_build_custom_report_rows",
    "_csv_response",
]
