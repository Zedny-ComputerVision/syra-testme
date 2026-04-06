from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .enums import ReportContent, ReportDisplayed, TestStatus, TestType


class CategoryRefDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str


class TestSecuritySettingsDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    fullscreen_required: bool = True
    tab_switch_detect: bool = True
    camera_required: bool = True
    mic_required: bool = False
    violation_threshold_warn: int = 3
    violation_threshold_autosubmit: int = 6

    @field_validator("violation_threshold_warn")
    @classmethod
    def validate_warn_threshold(cls, value: int) -> int:
        if not 1 <= value <= 20:
            raise ValueError("violation_threshold_warn must be between 1 and 20")
        return value

    @field_validator("violation_threshold_autosubmit")
    @classmethod
    def validate_autosubmit_threshold(cls, value: int, info) -> int:
        warn = int(getattr(info, "data", {}).get("violation_threshold_warn", 1))
        if not warn <= value <= 50:
            raise ValueError("violation_threshold_autosubmit must be between warn and 50")
        return value


class TestBaseDTO(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code: str | None = None
    name: str | None = None
    description: str | None = None
    type: TestType | None = None
    node_id: UUID | None = None
    category_id: UUID | None = None
    grading_scale_id: UUID | None = None
    time_limit_minutes: int | None = None
    attempts_allowed: int | None = None
    passing_score: float | None = None
    randomize_questions: bool | None = None
    report_displayed: ReportDisplayed | None = None
    report_content: ReportContent | None = None
    ui_config: dict[str, Any] | None = None
    settings: TestSecuritySettingsDTO | None = None
    runtime_settings: dict[str, Any] | None = None
    proctoring_config: dict[str, Any] | None = None
    certificate: dict[str, Any] | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if normalized and not 6 <= len(normalized) <= 12:
            raise ValueError("code must be between 6 and 12 characters")
        return normalized or None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not 2 <= len(normalized) <= 200:
            raise ValueError("name must be between 2 and 200 characters")
        return normalized

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if len(value) > 4000:
            raise ValueError("description must be at most 4000 characters")
        return value

    @field_validator("time_limit_minutes")
    @classmethod
    def validate_time_limit(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if not 1 <= value <= 600:
            raise ValueError("time_limit_minutes must be between 1 and 600")
        return value

    @field_validator("attempts_allowed")
    @classmethod
    def validate_attempts_allowed(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if not 1 <= value <= 20:
            raise ValueError("attempts_allowed must be between 1 and 20")
        return value

    @field_validator("passing_score")
    @classmethod
    def validate_passing_score(cls, value: float | None) -> float | None:
        if value is None:
            return None
        if not 0 <= value <= 100:
            raise ValueError("passing_score must be between 0 and 100")
        return value


class TestCreateDTO(TestBaseDTO):
    name: str
    type: TestType


class TestUpdateDTO(TestBaseDTO):
    pass


class TestListItemDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str | None
    name: str
    type: TestType
    status: TestStatus
    category: CategoryRefDTO | None = None
    time_limit_minutes: int
    testing_sessions: int = 0
    question_count: int = 0
    certificate: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class TestResponseDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str | None
    name: str
    description: str | None = None
    type: TestType
    status: TestStatus
    runtime_status: str
    node_id: UUID | None = None
    node_title: str | None = None
    course_id: UUID | None = None
    course_title: str | None = None
    category_id: UUID | None = None
    grading_scale_id: UUID | None = None
    time_limit_minutes: int
    attempts_allowed: int
    passing_score: float | None = None
    randomize_questions: bool
    report_displayed: ReportDisplayed
    report_content: ReportContent
    ui_config: dict[str, Any] | None = None
    settings: TestSecuritySettingsDTO
    runtime_settings: dict[str, Any] | None = None
    proctoring_config: dict[str, Any] | None = None
    certificate: dict[str, Any] | None = None
    question_count: int = 0
    created_by_id: UUID | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None = None
    archived_at: datetime | None = None


class TestListResponseDTO(BaseModel):
    items: list[TestListItemDTO]
    total: int
    page: int
    page_size: int
    search: str | None = None
    sort: str | None = None
    order: str = "desc"
    skip: int = 0
    limit: int = 20


class ErrorResponseDTO(BaseModel):
    error: dict[str, Any]


class ActionResponseDTO(TestResponseDTO):
    pass


TestCreate = TestCreateDTO
TestUpdate = TestUpdateDTO
TestDetail = TestResponseDTO
TestListItem = TestListItemDTO
TestListResponse = TestListResponseDTO
ErrorResponse = ErrorResponseDTO
ActionResponse = ActionResponseDTO
TestSettingsSchema = TestSecuritySettingsDTO
