from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, ConfigDict

from .enums import TestStatus, TestType, ReportDisplayed, ReportContent


class CategoryRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str


class TestSettingsSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    fullscreen_required: bool = True
    tab_switch_detect: bool = True
    camera_required: bool = True
    mic_required: bool = False
    violation_threshold_warn: int = 3
    violation_threshold_autosubmit: int = 6

    @field_validator("violation_threshold_warn")
    @classmethod
    def validate_warn(cls, v: int):
        if not 1 <= v <= 20:
            raise ValueError("violation_threshold_warn must be between 1 and 20")
        return v

    @field_validator("violation_threshold_autosubmit")
    @classmethod
    def validate_auto(cls, v: int, info):
        warn = info.data.get("violation_threshold_warn", 1) if hasattr(info, "data") else 1
        if not warn <= v <= 50:
            raise ValueError("violation_threshold_autosubmit must be between warn and 50")
        return v


class TestBase(BaseModel):
    name: str | None = None
    description: Optional[str] = None
    type: TestType | None = None
    category_id: Optional[UUID] = None
    time_limit_minutes: Optional[int] = None
    attempts_allowed: Optional[int] = None
    randomize_questions: Optional[bool] = None
    report_displayed: Optional[ReportDisplayed] = None
    report_content: Optional[ReportContent] = None
    ui_config: Optional[dict] = None
    settings: Optional[TestSettingsSchema] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None):
        if v is None:
            return v
        v = v.strip()
        if len(v) < 2 or len(v) > 200:
            raise ValueError("name must be between 2 and 200 characters")
        return v

    @field_validator("description")
    @classmethod
    def validate_desc(cls, v: str | None):
        if v is None:
            return v
        if len(v) > 4000:
            raise ValueError("description must be at most 4000 characters")
        return v

    @field_validator("time_limit_minutes")
    @classmethod
    def validate_time(cls, v: int | None):
        if v is None:
            return v
        if not 1 <= v <= 600:
            raise ValueError("time_limit_minutes must be between 1 and 600")
        return v

    @field_validator("attempts_allowed")
    @classmethod
    def validate_attempts(cls, v: int | None):
        if v is None:
            return v
        if not 1 <= v <= 20:
            raise ValueError("attempts_allowed must be between 1 and 20")
        return v


class TestCreate(TestBase):
    name: str
    type: TestType


class TestUpdate(TestBase):
    pass


class TestListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    code: str | None
    name: str
    type: TestType
    status: TestStatus
    category: CategoryRef | None = None
    time_limit_minutes: int
    testing_sessions: int = 0
    created_at: datetime
    updated_at: datetime

class TestDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    code: str | None
    name: str
    description: str | None = None
    type: TestType
    status: TestStatus
    category_id: UUID | None = None
    time_limit_minutes: int
    attempts_allowed: int
    randomize_questions: bool
    report_displayed: ReportDisplayed
    report_content: ReportContent
    ui_config: dict | None = None
    settings: TestSettingsSchema
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None = None
    archived_at: datetime | None = None


class TestListResponse(BaseModel):
    items: list[TestListItem]
    page: int
    page_size: int
    total: int


class ErrorResponse(BaseModel):
    error: dict


class ActionResponse(TestDetail):
    pass
