from __future__ import annotations

import logging
import uuid
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.orm import Session, joinedload, load_only, selectinload

from ...models import (
    Attempt,
    Category,
    Course,
    CourseStatus,
    Exam,
    ExamAdminConfig,
    ExamCertificateConfig,
    ExamStatus,
    ExamType,
    Node,
    Question,
    RoleEnum,
    Schedule,
    User,
)
from ...services.normalized_relations import (
    ADMIN_META_KEY,
    exam_runtime_settings,
    set_exam_certificate,
    set_exam_proctoring,
    set_exam_runtime_settings,
)
from .enums import TestStatus, TestType


logger = logging.getLogger(__name__)
_VALID_EXAM_TYPE_VALUES = {item.value for item in ExamType}
_VALID_EXAM_STATUS_VALUES = {item.value for item in ExamStatus}


@dataclass(slots=True)
class TestListQuery:
    owner_id: uuid.UUID | None = None
    search: str | None = None
    status: tuple[TestStatus, ...] | None = None
    type: TestType | None = None
    category_id: uuid.UUID | None = None
    created_from: datetime | None = None
    created_to: datetime | None = None
    sort: str = "created_at"
    order: str = "desc"
    page: int = 1
    page_size: int = 20


@dataclass(slots=True)
class TestListRow:
    id: uuid.UUID
    name: str | None
    code: str | None
    raw_type: str | None
    raw_runtime_status: str | None
    is_archived: bool
    category_id: uuid.UUID | None
    category_name: str | None
    time_limit_minutes: int | None
    certificate: dict | None
    certificate_title: str | None
    certificate_subtitle: str | None
    certificate_issuer: str | None
    certificate_signer: str | None
    created_at: datetime | None
    updated_at: datetime | None


class TestRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_tests(self, query: TestListQuery) -> tuple[list[TestListRow], int, dict[uuid.UUID, int], dict[uuid.UUID, int]]:
        statement = (
            select(
                Exam.id.label("id"),
                Exam.title.label("name"),
                self._code_expression().label("code"),
                cast(Exam.type, String).label("raw_type"),
                cast(Exam.status, String).label("raw_runtime_status"),
                self._archived_expression().label("is_archived"),
                Category.id.label("category_id"),
                Category.name.label("category_name"),
                Exam.time_limit.label("time_limit_minutes"),
                Exam.certificate.label("certificate"),
                ExamCertificateConfig.title.label("certificate_title"),
                ExamCertificateConfig.subtitle.label("certificate_subtitle"),
                ExamCertificateConfig.issuer.label("certificate_issuer"),
                ExamCertificateConfig.signer.label("certificate_signer"),
                Exam.created_at.label("created_at"),
                Exam.updated_at.label("updated_at"),
            )
            .select_from(Exam)
            .outerjoin(ExamAdminConfig, ExamAdminConfig.exam_id == Exam.id)
            .outerjoin(Category, Category.id == Exam.category_id)
            .outerjoin(ExamCertificateConfig, ExamCertificateConfig.exam_id == Exam.id)
        )
        # Filter library/pool exams in SQL (column + legacy JSON) so pagination is accurate.
        legacy_pool = Exam.settings["_pool_library"].as_boolean()
        statement = statement.where(
            Exam.library_pool_id.is_(None),
            or_(
                Exam.settings.is_(None),
                legacy_pool.is_(None),
                legacy_pool == False,  # noqa: E712
            ),
        )
        statement = self._apply_filters(statement, query)
        statement = statement.order_by(self._order_by_column(query.sort, query.order), Exam.created_at.desc())

        total = self.db.scalar(select(func.count()).select_from(statement.order_by(None).subquery())) or 0
        rows = self.db.execute(
            statement.offset((query.page - 1) * query.page_size).limit(query.page_size)
        ).mappings().all()
        items = [
            TestListRow(
                id=row["id"],
                name=row["name"],
                code=row["code"],
                raw_type=row["raw_type"],
                raw_runtime_status=row["raw_runtime_status"],
                is_archived=bool(row["is_archived"]),
                category_id=row["category_id"],
                category_name=row["category_name"],
                time_limit_minutes=row["time_limit_minutes"],
                certificate=row["certificate"],
                certificate_title=row["certificate_title"],
                certificate_subtitle=row["certificate_subtitle"],
                certificate_issuer=row["certificate_issuer"],
                certificate_signer=row["certificate_signer"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]
        self._repair_invalid_exam_enums(items)

        exam_ids = [item.id for item in items]
        if not exam_ids:
            return items, int(total), {}, {}

        schedule_counts = {
            exam_id: int(count or 0)
            for exam_id, count in self.db.execute(
                select(Schedule.exam_id, func.count())
                .where(Schedule.exam_id.in_(exam_ids))
                .group_by(Schedule.exam_id)
            ).all()
        }
        question_counts = {
            exam_id: int(count or 0)
            for exam_id, count in self.db.execute(
                select(Question.exam_id, func.count())
                .where(Question.exam_id.in_(exam_ids))
                .group_by(Question.exam_id)
            ).all()
        }
        return items, int(total), schedule_counts, question_counts

    def get_test(self, test_id: uuid.UUID) -> Exam | None:
        statement = (
            select(Exam)
            .options(
                joinedload(Exam.node).joinedload(Node.course),
                joinedload(Exam.category),
                joinedload(Exam.grading_scale),
                selectinload(Exam.questions),
                joinedload(Exam.admin_config),
                joinedload(Exam.runtime_config_rel),
                joinedload(Exam.proctoring_config_rel),
                joinedload(Exam.certificate_config_rel),
            )
            .where(Exam.id == test_id)
        )
        try:
            return self.db.scalar(statement)
        except LookupError:
            if self._repair_invalid_exam_enum_by_id(test_id):
                return self.db.scalar(statement)
            raise

    def get_test_for_write(self, test_id: uuid.UUID) -> Exam | None:
        statement = (
            select(Exam)
            .options(
                joinedload(Exam.node).joinedload(Node.course),
                joinedload(Exam.category),
                selectinload(Exam.questions),
                joinedload(Exam.admin_config),
                joinedload(Exam.runtime_config_rel),
                joinedload(Exam.proctoring_config_rel),
                joinedload(Exam.certificate_config_rel),
            )
            .where(Exam.id == test_id)
        )
        try:
            return self.db.scalar(statement)
        except LookupError:
            if self._repair_invalid_exam_enum_by_id(test_id):
                return self.db.scalar(statement)
            raise

    def ensure_node(self, actor: User, node_id: uuid.UUID | None) -> Node:
        if node_id is not None:
            node = self.db.get(Node, node_id)
            if node is None:
                raise LookupError("Node not found")
            return node

        existing = self.db.scalars(select(Node).order_by(Node.created_at)).first()
        if existing is not None:
            return existing

        now = datetime.now(timezone.utc)
        owner_id = self._ensure_owner_id(actor)
        course = Course(
            title="General",
            description="Auto-created course",
            status=CourseStatus.DRAFT,
            created_by_id=owner_id,
            created_at=now,
            updated_at=now,
        )
        self.db.add(course)
        self.db.flush()

        node = Node(
            course_id=course.id,
            title="Module 1",
            order=0,
            created_at=now,
            updated_at=now,
        )
        self.db.add(node)
        self.db.flush()
        return node

    def code_exists(self, code: str, *, exclude_exam_id: uuid.UUID | None = None) -> bool:
        legacy_code = Exam.settings[ADMIN_META_KEY]["code"].as_string()
        statement = (
            select(Exam.id)
            .outerjoin(Exam.admin_config)
            .where(
                or_(
                    ExamAdminConfig.code == code,
                    legacy_code == code,
                )
            )
        )
        if exclude_exam_id is not None:
            statement = statement.where(Exam.id != exclude_exam_id)
        return self.db.scalar(statement.limit(1)) is not None

    def create_test(self, *, exam: Exam, runtime_settings: dict | None, proctoring_config: dict | None, certificate: dict | None) -> Exam:
        set_exam_runtime_settings(exam, runtime_settings)
        set_exam_proctoring(exam, proctoring_config)
        set_exam_certificate(exam, certificate)
        self.db.add(exam)
        self.db.flush()
        return exam

    def save(self, exam: Exam) -> Exam:
        self.db.add(exam)
        self.db.flush()
        return exam

    def question_count(self, exam_id: uuid.UUID) -> int:
        return int(
            self.db.scalar(
                select(func.count()).select_from(Question).where(Question.exam_id == exam_id)
            )
            or 0
        )

    def attempt_count(self, exam_id: uuid.UUID) -> int:
        return int(
            self.db.scalar(
                select(func.count()).select_from(Attempt).where(Attempt.exam_id == exam_id)
            )
            or 0
        )

    def scheduled_user_ids(self, exam_id: uuid.UUID) -> list[uuid.UUID]:
        return list(
            self.db.scalars(select(Schedule.user_id).where(Schedule.exam_id == exam_id)).all()
        )

    def duplicate_test(self, exam: Exam, actor_id: uuid.UUID | None) -> Exam:
        now = datetime.now(timezone.utc)
        duplicate = Exam(
            node_id=exam.node_id,
            title=self.next_duplicate_title(exam),
            description=exam.description,
            type=ExamType(exam.type.value),
            status=ExamStatus.CLOSED,
            time_limit=exam.time_limit,
            max_attempts=exam.max_attempts,
            passing_score=exam.passing_score,
            category_id=exam.category_id,
            grading_scale_id=exam.grading_scale_id,
            created_by_id=actor_id,
            created_at=now,
            updated_at=now,
        )
        self.db.add(duplicate)
        self.db.flush()

        set_exam_proctoring(duplicate, deepcopy(exam.proctoring_config or {}))
        set_exam_runtime_settings(duplicate, exam_runtime_settings(exam))
        set_exam_certificate(duplicate, deepcopy(exam.certificate or {}))

        for question in exam.questions:
            self.db.add(
                Question(
                    exam_id=duplicate.id,
                    text=question.text,
                    type=question.type,
                    options=deepcopy(question.options),
                    correct_answer=question.correct_answer,
                    points=question.points,
                    order=question.order,
                    pool_id=question.pool_id,
                    created_at=now,
                    updated_at=now,
                )
            )
        self.db.flush()
        return duplicate

    def next_duplicate_title(self, exam: Exam) -> str:
        existing_titles = set(
            self.db.scalars(select(Exam.title).where(Exam.node_id == exam.node_id)).all()
        )
        base_title = f"{exam.title} (Copy)"
        if base_title not in existing_titles:
            return base_title
        suffix = 2
        while True:
            candidate = f"{exam.title} (Copy {suffix})"
            if candidate not in existing_titles:
                return candidate
            suffix += 1

    def list_report_attempts(self, exam_id: uuid.UUID) -> list[Attempt]:
        return list(
            self.db.scalars(
                select(Attempt)
                .options(joinedload(Attempt.user))
                .where(Attempt.exam_id == exam_id)
                .order_by(Attempt.created_at.desc())
            ).all()
        )

    def delete(self, exam: Exam) -> None:
        self.db.delete(exam)
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()

    def rollback(self) -> None:
        self.db.rollback()

    def refresh(self, exam: Exam) -> None:
        self.db.refresh(exam)

    def _apply_filters(self, statement, query: TestListQuery):
        archived = self._archived_expression()
        published = and_(~archived, Exam.status == ExamStatus.OPEN)
        draft = and_(~archived, Exam.status != ExamStatus.OPEN)

        if query.status:
            status_filters = []
            for item in query.status:
                if item == TestStatus.ARCHIVED:
                    status_filters.append(archived)
                elif item == TestStatus.PUBLISHED:
                    status_filters.append(published)
                elif item == TestStatus.DRAFT:
                    status_filters.append(draft)
            if status_filters:
                statement = statement.where(or_(*status_filters))
        else:
            statement = statement.where(~archived)

        if query.type is not None:
            statement = statement.where(Exam.type == ExamType(query.type.value))
        if query.owner_id is not None:
            statement = statement.where(Exam.created_by_id == query.owner_id)
        if query.category_id is not None:
            statement = statement.where(Exam.category_id == query.category_id)
        if query.created_from is not None:
            statement = statement.where(Exam.created_at >= query.created_from)
        if query.created_to is not None:
            statement = statement.where(Exam.created_at <= query.created_to)
        if query.search:
            search_term = f"%{query.search.lower()}%"
            statement = statement.where(
                or_(
                    func.lower(Exam.title).like(search_term),
                    func.lower(func.coalesce(self._code_expression(), "")).like(search_term),
                )
            )
        return statement

    def _order_by_column(self, sort: str, order: str):
        sort_map = {
            "created_at": Exam.created_at,
            "updated_at": Exam.updated_at,
            "name": Exam.title,
        }
        column = sort_map.get(sort, Exam.created_at)
        return column.asc() if order == "asc" else column.desc()

    def _archived_expression(self):
        legacy_archived_at = Exam.settings[ADMIN_META_KEY]["archived_at"].as_string()
        return or_(
            ExamAdminConfig.archived_at.is_not(None),
            legacy_archived_at.is_not(None),
        )

    def _code_expression(self):
        return func.coalesce(
            ExamAdminConfig.code,
            Exam.settings[ADMIN_META_KEY]["code"].as_string(),
        )

    def _repair_invalid_exam_enums(self, items: list[TestListRow]) -> None:
        repairs = {
            item.id: repair_values
            for item in items
            if (repair_values := self._enum_repair_values(item.raw_type, item.raw_runtime_status))
        }
        if not repairs:
            return
        self._apply_exam_enum_repairs(repairs)

    def _repair_invalid_exam_enum_by_id(self, test_id: uuid.UUID) -> bool:
        row = self.db.execute(
            select(
                cast(Exam.type, String).label("raw_type"),
                cast(Exam.status, String).label("raw_runtime_status"),
            ).where(Exam.id == test_id)
        ).mappings().first()
        if not row:
            return False
        repair_values = self._enum_repair_values(row["raw_type"], row["raw_runtime_status"])
        if not repair_values:
            return False
        return self._apply_exam_enum_repairs({test_id: repair_values})

    def _enum_repair_values(self, raw_type: str | None, raw_runtime_status: str | None) -> dict[str, str]:
        repair_values: dict[str, str] = {}
        if raw_type not in _VALID_EXAM_TYPE_VALUES:
            repair_values["type"] = ExamType.MCQ.value
        if raw_runtime_status not in _VALID_EXAM_STATUS_VALUES:
            repair_values["status"] = ExamStatus.CLOSED.value
        return repair_values

    def _apply_exam_enum_repairs(self, repairs: dict[uuid.UUID, dict[str, str]]) -> bool:
        exam_table = Exam.__table__
        try:
            for exam_id, repair_values in repairs.items():
                self.db.execute(
                    exam_table.update()
                    .where(exam_table.c.id == exam_id)
                    .values(**repair_values)
                )
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            logger.exception("Failed to normalize invalid exam enum values")
            return False

    def _ensure_owner_id(self, actor: User) -> uuid.UUID:
        actor_id = getattr(actor, "id", None)
        if actor_id:
            existing = self.db.get(User, actor_id)
            if existing is not None:
                return actor_id

        owner_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        system_user = User(
            id=owner_id,
            email=f"system-{owner_id.hex[:8]}@local.invalid",
            name="System Admin",
            user_id=f"SYS{owner_id.hex[:6].upper()}",
            role=RoleEnum.ADMIN,
            hashed_password="system-managed",
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        self.db.add(system_user)
        self.db.flush()
        return owner_id
