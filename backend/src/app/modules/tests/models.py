import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, String, UniqueConstraint, Index, text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ...db.base import Base
from ...db.types import GUID as UUID
from .enums import TestStatus, TestType, ReportDisplayed, ReportContent


class Test(Base):
    __tablename__ = "tests"
    __table_args__ = (
        UniqueConstraint("code", name="uq_tests_code"),
        Index("ix_tests_created_at", "created_at"),
        Index("ix_tests_updated_at", "updated_at"),
        Index("ix_tests_name", "name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str | None] = mapped_column(String(12), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(4000))
    type: Mapped[TestType] = mapped_column(SAEnum(TestType, name="test_type"), nullable=False)
    status: Mapped[TestStatus] = mapped_column(SAEnum(TestStatus, name="test_status"), default=TestStatus.DRAFT, nullable=False)
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    time_limit_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("60"))
    attempts_allowed: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    randomize_questions: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    report_displayed: Mapped[ReportDisplayed] = mapped_column(SAEnum(ReportDisplayed, name="report_displayed"), nullable=False, server_default=ReportDisplayed.IMMEDIATELY_AFTER_GRADING.value)
    report_content: Mapped[ReportContent] = mapped_column(SAEnum(ReportContent, name="report_content"), nullable=False, server_default=ReportContent.SCORE_AND_DETAILS.value)
    ui_config: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    settings = relationship("TestSettings", back_populates="test", uselist=False, cascade="all, delete-orphan")
    category = relationship("Category")


class TestSettings(Base):
    __tablename__ = "test_settings"

    test_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tests.id", ondelete="CASCADE"), primary_key=True)
    fullscreen_required: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    tab_switch_detect: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    camera_required: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    mic_required: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    violation_threshold_warn: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("3"))
    violation_threshold_autosubmit: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("6"))

    test = relationship(Test, back_populates="settings")
