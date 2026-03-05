from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, EmailStr, field_validator, model_validator
from pydantic.config import ConfigDict

from ..models import (
    RoleEnum,
    CourseStatus,
    ExamType,
    ExamStatus,
    AttemptStatus,
    AccessMode,
    SeverityEnum,
    CategoryType,
)


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class Message(BaseModel):
    detail: str


class UserBase(BaseModel):
    email: EmailStr
    name: str
    user_id: str
    role: RoleEnum
    is_active: bool = True


class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def password_len(cls, v: str):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserRead(UserBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[RoleEnum] = None
    is_active: Optional[bool] = None


class CourseBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: CourseStatus = CourseStatus.DRAFT


class CourseCreate(CourseBase):
    node_titles: Optional[list[str]] = None


class CourseRead(CourseBase):
    id: UUID
    created_by_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NodeBase(BaseModel):
    title: str
    order: int = 0


class NodeCreate(NodeBase):
    course_id: UUID


class NodeRead(NodeBase):
    id: UUID
    course_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CategoryBase(BaseModel):
    name: str
    type: CategoryType = CategoryType.TEST
    description: Optional[str] = None


class CategoryRead(CategoryBase):
    id: UUID

    model_config = ConfigDict(from_attributes=True)


class GradingScaleBase(BaseModel):
    name: str
    labels: list[dict]

    @field_validator("labels")
    @classmethod
    def validate_bands(cls, v: list[dict]):
        ranges = sorted(((band.get("min_score"), band.get("max_score")) for band in v), key=lambda x: x[0])
        for i in range(1, len(ranges)):
            prev = ranges[i - 1]
            cur = ranges[i]
            if prev[1] is None or cur[0] is None:
                continue
            if cur[0] < prev[1]:
                raise ValueError("Grading bands overlap")
        return v


class GradingScaleRead(GradingScaleBase):
    id: UUID

    model_config = ConfigDict(from_attributes=True)


class QuestionBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    text: str
    type: ExamType = Field(validation_alias="question_type")
    options: Optional[list[str]] = None
    correct_answer: Optional[str] = None
    points: float = 1.0
    order: int = 0
    pool_id: Optional[UUID] = None

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, v: str):
        if not v or not v.strip():
            raise ValueError("Question text is required")
        return v.strip()

    @field_validator("options")
    @classmethod
    def normalize_options(cls, v: Optional[list[str]]):
        if v is None:
            return None
        cleaned = [opt.strip() for opt in v if opt and opt.strip()]
        return cleaned or None

    @field_validator("correct_answer")
    @classmethod
    def normalize_answer(cls, v: Optional[str]):
        if v is None:
            return None
        return v.strip()

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: ExamType):
        return v

    @classmethod
    @field_validator("points")
    def validate_points(cls, v: float):
        if v is None or v <= 0:
            raise ValueError("points must be positive")
        return v

    @classmethod
    @field_validator("order")
    def validate_order(cls, v: int):
        return max(0, v)

    @classmethod
    def _validate_mcq(cls, values):
        q_type: ExamType = values.get("type")
        options = values.get("options")
        correct = values.get("correct_answer")
        if q_type in (ExamType.MCQ, ExamType.MULTI, ExamType.TRUEFALSE):
            if not options or len(options) < 2:
                raise ValueError("MCQ requires at least two options")
            if not correct:
                raise ValueError("MCQ requires a correct_answer")
            valid_letters = {chr(65 + i) for i in range(len(options))}
            if correct not in valid_letters and correct not in options:
                raise ValueError("correct_answer must be a choice letter (A, B, ...) or option value")
        return values

    @model_validator(mode="after")
    def validate_mcq_after(self):
        data = self.model_dump()
        self._validate_mcq(data)
        return self


class QuestionCreate(QuestionBase):
    exam_id: UUID


class QuestionRead(QuestionBase):
    id: UUID
    exam_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExamBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    # Frontend sends exam_type and time_limit_minutes; keep friendly aliases.
    node_id: Optional[UUID] = None
    title: str
    type: ExamType = Field(default=ExamType.MCQ, alias="exam_type")
    status: ExamStatus = ExamStatus.CLOSED
    time_limit: Optional[int] = Field(default=None, alias="time_limit_minutes")
    max_attempts: int = 1
    passing_score: Optional[float] = None
    proctoring_config: Optional[dict] = None
    category_id: Optional[UUID] = None
    grading_scale_id: Optional[UUID] = None
    description: Optional[str] = None
    settings: Optional[dict] = None
    certificate: Optional[dict] = None


class ExamCreate(ExamBase):
    questions: Optional[list[QuestionCreate]] = None


class ExamRead(ExamBase):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: UUID
    question_count: int | None = None
    node_title: Optional[str] = None
    course_id: Optional[UUID] = None
    course_title: Optional[str] = None
    category_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    # Provide serialization aliases expected by the React admin UI.
    type: ExamType = Field(serialization_alias="exam_type")
    time_limit: Optional[int] = Field(default=None, serialization_alias="time_limit_minutes")


class AttemptBase(BaseModel):
    exam_id: UUID


class AttemptCreate(AttemptBase):
    pass


class AttemptRead(AttemptBase):
    id: UUID
    user_id: UUID
    status: AttemptStatus
    score: Optional[float]
    started_at: Optional[datetime]
    submitted_at: Optional[datetime]
    identity_verified: bool
    created_at: datetime
    updated_at: datetime
    exam_title: Optional[str] = None
    exam_type: Optional[ExamType] = None
    exam_time_limit: Optional[int] = None
    node_id: Optional[UUID] = None
    attempts_used: Optional[int] = None
    attempts_remaining: Optional[int] = None
    user_name: Optional[str] = None
    user_student_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AttemptAnswerBase(BaseModel):
    question_id: UUID
    answer: Optional[str] = None


class AttemptAnswerRead(AttemptAnswerBase):
    id: UUID
    attempt_id: UUID
    is_correct: Optional[bool]
    points_earned: Optional[float]

    model_config = ConfigDict(from_attributes=True)


class ScheduleBase(BaseModel):
    exam_id: Optional[UUID] = None
    test_id: Optional[UUID] = None
    user_id: UUID
    scheduled_at: datetime
    access_mode: AccessMode = AccessMode.OPEN
    notes: Optional[str] = None

    @model_validator(mode="after")
    def validate_target(self):
        if not self.exam_id and not self.test_id:
            raise ValueError("Either exam_id or test_id is required")
        return self


class ScheduleRead(ScheduleBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    exam_title: Optional[str] = None
    exam_type: Optional[ExamType] = None
    exam_time_limit: Optional[int] = None
    test_name: Optional[str] = None
    test_type: Optional[str] = None
    test_time_limit: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class QuestionPoolBase(BaseModel):
    name: str
    description: Optional[str] = None


class QuestionPoolCreate(QuestionPoolBase):
    pass


class QuestionPoolRead(QuestionPoolBase):
    id: UUID
    created_by_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)


class ProctoringEventRead(BaseModel):
    id: UUID
    attempt_id: UUID
    event_type: str
    severity: SeverityEnum
    detail: Optional[str]
    ai_confidence: Optional[float]
    meta: Optional[dict]
    occurred_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DashboardRead(BaseModel):
    total_exams: int
    total_attempts: int
    in_progress_attempts: int
    completed_attempts: int
    best_score: Optional[float]
    average_score: Optional[float]
    upcoming_count: int
    upcoming_schedules: list[ScheduleRead]


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_len(cls, v: str):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_len(cls, v: str):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class NotificationRead(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    message: str
    is_read: bool
    link: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuditLogRead(BaseModel):
    id: UUID
    user_id: Optional[UUID]
    action: str
    resource_type: Optional[str]
    resource_id: Optional[str]
    detail: Optional[str]
    ip_address: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SurveyCreate(BaseModel):
    title: str
    description: Optional[str] = None
    questions: Optional[list[dict]] = None


class SurveyRead(BaseModel):
    id: UUID
    title: str
    description: Optional[str]
    questions: Optional[list[dict]]
    is_active: bool
    created_by_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SurveyResponseCreate(BaseModel):
    survey_id: UUID
    answers: Optional[dict] = None


class SurveyResponseRead(BaseModel):
    id: UUID
    survey_id: UUID
    user_id: UUID
    answers: Optional[dict]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    member_ids: Optional[list[str]] = None


class UserGroupRead(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    member_ids: Optional[list]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExamTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    config: Optional[dict] = None


class ExamTemplateRead(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    config: Optional[dict]
    created_by_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReportScheduleCreate(BaseModel):
    name: str
    report_type: str
    schedule_cron: Optional[str] = None
    recipients: Optional[list[str]] = None
    is_active: bool = True


class ReportScheduleRead(BaseModel):
    id: UUID
    name: str
    report_type: str
    schedule_cron: Optional[str]
    recipients: Optional[list]
    is_active: bool
    last_run_at: Optional[datetime]
    created_by_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SystemSettingRead(BaseModel):
    id: UUID
    key: str
    value: Optional[str]
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SystemSettingUpdate(BaseModel):
    value: Optional[str] = None
