from datetime import datetime
from typing import Iterable, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .enums import TestStatus, TestType
from .models import Test, TestSettings


class TestRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, test_id) -> Test | None:
        return self.db.get(Test, test_id)

    def list_tests(
        self,
        *,
        search: str | None = None,
        status: Iterable[TestStatus] | None = None,
        type: TestType | None = None,
        category_id=None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        sort: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ):
        query = select(Test)
        if status:
            query = query.where(Test.status.in_(status))
        else:
            query = query.where(Test.status != TestStatus.ARCHIVED)
        if type:
            query = query.where(Test.type == type)
        if category_id:
            query = query.where(Test.category_id == category_id)
        if search:
            pattern = f"%{search.lower()}%"
            query = query.where(func.lower(Test.name).like(pattern) | func.lower(func.coalesce(Test.code, "")).like(pattern))
        if created_from:
            query = query.where(Test.created_at >= created_from)
        if created_to:
            query = query.where(Test.created_at <= created_to)

        sort_field, sort_dir = self._parse_sort(sort)
        order_col = getattr(Test, sort_field)
        if sort_dir == "desc":
            order_col = order_col.desc()
        query = query.order_by(order_col)

        total = self.db.scalar(select(func.count()).select_from(query.subquery()))
        page = max(page, 1)
        page_size = min(max(page_size, 1), 100)
        query = query.offset((page - 1) * page_size).limit(page_size)

        items = self.db.scalars(query).all()
        return items, total or 0

    def create(self, test_data: dict, settings_data: dict) -> Test:
        test = Test(**test_data)
        if getattr(test, "id", None) is None:
            import uuid as _uuid
            test.id = _uuid.uuid4()
        settings = TestSettings(test_id=test.id, **settings_data)
        test.settings = settings
        self.db.add(test)
        self.db.flush()
        return test

    def update(self, test: Test, data: dict) -> Test:
        for field, value in data.items():
            setattr(test, field, value)
        self.db.add(test)
        self.db.flush()
        return test

    def duplicate(self, test: Test, settings: TestSettings) -> Test:
        new_test = Test(
            name=f"{test.name} (Copy)",
            description=test.description,
            type=test.type,
            status=TestStatus.DRAFT,
            category_id=test.category_id,
            time_limit_minutes=test.time_limit_minutes,
            attempts_allowed=test.attempts_allowed,
            randomize_questions=test.randomize_questions,
            report_displayed=test.report_displayed,
            report_content=test.report_content,
            ui_config=test.ui_config,
        )
        if getattr(new_test, "id", None) is None:
            import uuid as _uuid
            new_test.id = _uuid.uuid4()
        new_settings = TestSettings(
            test_id=new_test.id,
            fullscreen_required=settings.fullscreen_required,
            tab_switch_detect=settings.tab_switch_detect,
            camera_required=settings.camera_required,
            mic_required=settings.mic_required,
            violation_threshold_warn=settings.violation_threshold_warn,
            violation_threshold_autosubmit=settings.violation_threshold_autosubmit,
        )
        new_test.settings = new_settings
        self.db.add(new_test)
        self.db.flush()
        return new_test

    def delete(self, test: Test):
        self.db.delete(test)
        self.db.flush()

    def count_attempts(self, test_id) -> int:
        # Placeholder: no attempts table for tests yet.
        return 0

    @staticmethod
    def _parse_sort(sort: Optional[str]) -> tuple[str, str]:
        default = ("created_at", "desc")
        if not sort:
            return default
        if ":" in sort:
            field, direction = sort.split(":", 1)
        else:
            field, direction = sort, "asc"
        field = field if field in {"created_at", "updated_at", "name"} else "created_at"
        direction = direction.lower()
        direction = direction if direction in {"asc", "desc"} else "desc"
        return field, direction
