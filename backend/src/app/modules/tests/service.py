import secrets
import string
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .enums import TestStatus
from .models import Test
from .repository import TestRepository


ERROR_CODES = {
    "LOCKED_FIELDS": status.HTTP_409_CONFLICT,
    "NOT_FOUND": status.HTTP_404_NOT_FOUND,
    "VALIDATION_ERROR": status.HTTP_400_BAD_REQUEST,
    "FORBIDDEN": status.HTTP_403_FORBIDDEN,
}


def http_error(code: str, message: str, details: dict | None = None, status_code: int | None = None):
    status_code = status_code or ERROR_CODES.get(code, status.HTTP_400_BAD_REQUEST)
    raise HTTPException(status_code=status_code, detail={"error": {"code": code, "message": message, "details": details or {}}})


def generate_code(db: Session) -> str:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(20):
        code = "".join(secrets.choice(alphabet) for _ in range(secrets.choice(range(6, 13))))
        exists = db.scalar(select(Test.id).where(Test.code == code))
        if not exists:
            return code
    http_error("VALIDATION_ERROR", "Unable to generate unique code")


def assert_can_mutate(test: Test, fields: set[str]):
    if test.status == TestStatus.ARCHIVED:
        http_error("LOCKED_FIELDS", "Archived tests are read-only")
    if test.status == TestStatus.PUBLISHED:
        allowed = {"name", "description", "report_displayed", "report_content"}
        blocked = fields - allowed
        if blocked:
            http_error("LOCKED_FIELDS", "These fields are locked when published", {"fields": sorted(blocked)})


class TestService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = TestRepository(db)

    def list(self, **kwargs):
        return self.repo.list_tests(**kwargs)

    def create(self, body):
        now = datetime.now(timezone.utc)
        from .enums import ReportDisplayed, ReportContent

        test_data = {
            "name": body.name.strip(),
            "description": body.description,
            "type": body.type,
            "status": TestStatus.DRAFT,
            "category_id": body.category_id,
            "time_limit_minutes": body.time_limit_minutes or 60,
            "attempts_allowed": body.attempts_allowed or 1,
            "randomize_questions": True if body.randomize_questions is None else body.randomize_questions,
            "report_displayed": body.report_displayed or ReportDisplayed.IMMEDIATELY_AFTER_GRADING,
            "report_content": body.report_content or ReportContent.SCORE_AND_DETAILS,
            "ui_config": body.ui_config or {},
            "created_at": now,
            "updated_at": now,
        }
        settings_data = {
            "fullscreen_required": True,
            "tab_switch_detect": True,
            "camera_required": True,
            "mic_required": False,
            "violation_threshold_warn": 3,
            "violation_threshold_autosubmit": 6,
        }
        test = self.repo.create(test_data, settings_data)
        self.db.commit()
        self.db.refresh(test)
        return test

    def get_or_404(self, test_id: str) -> Test:
        test = self.repo.get(test_id)
        if not test:
            http_error("NOT_FOUND", "Test not found")
        return test

    def update(self, test: Test, body):
        data = body.model_dump(exclude_unset=True, exclude_none=True)
        assert_can_mutate(test, set(data.keys()))
        data["updated_at"] = datetime.now(timezone.utc)
        settings_payload = data.pop("settings", None)
        if settings_payload:
            for field, value in settings_payload.items():
                setattr(test.settings, field, value)
        test = self.repo.update(test, data)
        self.db.commit()
        self.db.refresh(test)
        return test

    def publish(self, test: Test):
        if not test.name or not test.name.strip():
            http_error("VALIDATION_ERROR", "Name is required before publishing")
        if not test.time_limit_minutes or test.time_limit_minutes <= 0:
            http_error("VALIDATION_ERROR", "time_limit_minutes must be greater than 0")
        if test.code is None:
            test.code = generate_code(self.db)
        if test.status != TestStatus.PUBLISHED:
            now = datetime.now(timezone.utc)
            test.status = TestStatus.PUBLISHED
            test.published_at = now
            test.updated_at = now
            self.db.add(test)
        self.db.commit()
        self.db.refresh(test)
        return test

    def duplicate(self, test: Test):
        settings = test.settings
        new_test = self.repo.duplicate(test, settings)
        new_test.code = None
        new_test.created_at = datetime.now(timezone.utc)
        new_test.updated_at = new_test.created_at
        self.db.commit()
        self.db.refresh(new_test)
        return new_test

    def archive(self, test: Test):
        if test.status == TestStatus.ARCHIVED:
            return test
        now = datetime.now(timezone.utc)
        test.status = TestStatus.ARCHIVED
        test.archived_at = now
        test.updated_at = now
        self.db.add(test)
        self.db.commit()
        self.db.refresh(test)
        return test

    def unarchive(self, test: Test):
        if test.status == TestStatus.PUBLISHED and not test.archived_at:
            return test
        test.status = TestStatus.PUBLISHED
        test.archived_at = None
        test.updated_at = datetime.now(timezone.utc)
        self.db.add(test)
        self.db.commit()
        self.db.refresh(test)
        return test

    def delete(self, test: Test):
        if test.status != TestStatus.DRAFT:
            http_error("FORBIDDEN", "Only draft tests can be deleted", status_code=status.HTTP_409_CONFLICT)
        if self.repo.count_attempts(test.id) > 0:
            http_error("FORBIDDEN", "Cannot delete a test with attempts", status_code=status.HTTP_409_CONFLICT)
        self.repo.delete(test)
        self.db.commit()
