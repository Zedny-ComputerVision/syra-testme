from __future__ import annotations

import uuid
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, joinedload, load_only, selectinload

from ...models import (
    Attempt,
    Category,
    Course,
    CourseStatus,
    Exam,
    ExamAdminConfig,
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


class TestRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_tests(self, query: TestListQuery) -> tuple[list[Exam], int, dict[uuid.UUID, int], dict[uuid.UUID, int]]:
        statement = (
            select(Exam)
            .outerjoin(Exam.admin_config)
            .options(
                load_only(
                    Exam.id,
                    Exam.title,
                    Exam.type,
                    Exam.status,
                    Exam.time_limit,
                    Exam.certificate,
                    Exam.settings,
                    Exam.category_id,
                    Exam.created_at,
                    Exam.updated_at,
                ),
                joinedload(Exam.category).load_only(Category.id, Category.name),
                joinedload(Exam.admin_config).load_only(
                    ExamAdminConfig.exam_id,
                    ExamAdminConfig.code,
                    ExamAdminConfig.archived_at,
                ),
                joinedload(Exam.certificate_config_rel),
            )
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

        total = self.db.scalar(select(func.count()).select_from(statement.subquery())) or 0
        items = self.db.scalars(
            statement.offset((query.page - 1) * query.page_size).limit(query.page_size)
        ).all()

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
        return self.db.scalar(
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

    def get_test_for_write(self, test_id: uuid.UUID) -> Exam | None:
        return self.db.scalar(
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
