from __future__ import annotations

from datetime import datetime, timezone
import uuid

from sqlalchemy import String, cast, create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import (
    Course,
    CourseStatus,
    Exam,
    ExamStatus,
    ExamType,
    Node,
    Question,
    QuestionPool,
    RoleEnum,
    User,
)
from app.modules.tests.enums import TestStatus
from app.modules.tests.repository import TestRepository as AdminTestRepository
from app.modules.tests.schemas import TestUpdateDTO as AdminTestUpdateDTO
from app.modules.tests.service import ServiceActor, TestService as AdminTestService
from app.services.normalized_relations import set_exam_certificate
from app.utils.pagination import PaginationParams
from app.api.routes.question_pools import _cleanup_pool_library_resources, _ensure_pool_library_exam


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    return Session(engine, expire_on_commit=False)


def _create_admin(db: Session) -> User:
    admin = User(
        user_id=f"admin-{uuid.uuid4().hex[:8]}",
        email=f"admin-{uuid.uuid4().hex[:8]}@example.com",
        name="Admin",
        hashed_password="hashed",
        role=RoleEnum.ADMIN,
        is_active=True,
    )
    db.add(admin)
    db.flush()
    return admin


def _create_exam(db: Session, *, owner: User) -> Exam:
    now = _now()
    course = Course(
        title="General",
        description="General course",
        status=CourseStatus.DRAFT,
        created_by_id=owner.id,
        created_at=now,
        updated_at=now,
    )
    db.add(course)
    db.flush()
    node = Node(
        course_id=course.id,
        title="Module 1",
        order=0,
        created_at=now,
        updated_at=now,
    )
    db.add(node)
    db.flush()
    exam = Exam(
        node_id=node.id,
        title="Draft Exam",
        description="Draft description",
        type=ExamType.MCQ,
        status=ExamStatus.CLOSED,
        time_limit=60,
        max_attempts=1,
        created_by_id=owner.id,
        created_at=now,
        updated_at=now,
    )
    db.add(exam)
    db.flush()
    return exam


def _create_pool(db: Session, *, owner: User, name: str) -> QuestionPool:
    pool = QuestionPool(
        name=name,
        description=f"{name} description",
        created_by_id=owner.id,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(pool)
    db.flush()
    return pool


def _insert_invalid_exam(
    db: Session,
    *,
    owner: User,
    title: str,
    raw_type: str = "BROKEN",
    raw_status: str = "CLOSED",
    archived: bool = False,
) -> uuid.UUID:
    now = _now()
    course = Course(
        title=f"{title} Course",
        description=f"{title} course",
        status=CourseStatus.DRAFT,
        created_by_id=owner.id,
        created_at=now,
        updated_at=now,
    )
    db.add(course)
    db.flush()
    node = Node(
        course_id=course.id,
        title=f"{title} Node",
        order=0,
        created_at=now,
        updated_at=now,
    )
    db.add(node)
    db.flush()

    exam_id = uuid.uuid4()
    settings = {"_admin_test": {"archived_at": now.isoformat()}} if archived else None
    db.execute(
        Exam.__table__.insert().values(
            id=str(exam_id),
            node_id=str(node.id),
            title=title,
            type=raw_type,
            status=raw_status,
            max_attempts=1,
            settings=settings,
            created_by_id=str(owner.id),
            created_at=now,
            updated_at=now,
        )
    )
    db.commit()
    return exam_id


def test_update_test_allows_explicit_certificate_clear() -> None:
    db = _new_session()
    try:
        admin = _create_admin(db)
        exam = _create_exam(db, owner=admin)
        set_exam_certificate(
            exam,
            {
                "title": "Certificate of Completion",
                "issuer": "SYRA",
                "signer": "Admin",
                "issue_rule": "ON_PASS",
            },
        )
        db.commit()

        service = AdminTestService(AdminTestRepository(db))
        response = service.update_test(
            test_id=str(exam.id),
            body=AdminTestUpdateDTO(certificate=None),
            actor=ServiceActor(id=admin.id, role=RoleEnum.ADMIN),
            request_ip=None,
        )

        db.refresh(exam)
        assert response.certificate is None
        assert exam.certificate is None
        assert exam.certificate_config_rel is None
    finally:
        db.close()


def test_cleanup_pool_library_resources_removes_hidden_exam_and_scaffolding() -> None:
    db = _new_session()
    try:
        admin = _create_admin(db)
        pool = _create_pool(db, owner=admin, name="Pool A")
        exam = _ensure_pool_library_exam(db, admin, pool)
        db.add(
            Question(
                exam_id=exam.id,
                pool_id=pool.id,
                text="What is 2 + 2?",
                type="MCQ",
                options=["4", "5"],
                correct_answer="4",
                points=1.0,
                order=1,
                created_at=_now(),
                updated_at=_now(),
            )
        )
        db.commit()

        _cleanup_pool_library_resources(db, pool.id)
        db.commit()

        assert db.get(Exam, exam.id) is None
        assert db.scalar(select(Question).where(Question.pool_id == pool.id)) is None
        assert db.scalar(select(Node).where(Node.title == "Shared Pool Questions")) is None
        assert db.scalar(select(Course).where(Course.title == "Question Pool Library")) is None
    finally:
        db.close()


def test_cleanup_pool_library_resources_preserves_shared_library_scaffolding() -> None:
    db = _new_session()
    try:
        admin = _create_admin(db)
        first_pool = _create_pool(db, owner=admin, name="Pool One")
        second_pool = _create_pool(db, owner=admin, name="Pool Two")
        first_exam = _ensure_pool_library_exam(db, admin, first_pool)
        second_exam = _ensure_pool_library_exam(db, admin, second_pool)
        db.commit()

        shared_node_id = first_exam.node_id
        shared_course_id = first_exam.node.course_id

        _cleanup_pool_library_resources(db, first_pool.id)
        db.commit()

        assert db.get(Exam, first_exam.id) is None
        assert db.get(Exam, second_exam.id) is not None
        assert db.get(Node, shared_node_id) is not None
        assert db.get(Course, shared_course_id) is not None
    finally:
        db.close()


def test_list_tests_recovers_from_invalid_legacy_exam_enums() -> None:
    db = _new_session()
    try:
        admin = _create_admin(db)
        broken_draft_id = _insert_invalid_exam(db, owner=admin, title="Broken Draft", raw_type="BROKEN")
        broken_archived_id = _insert_invalid_exam(
            db,
            owner=admin,
            title="Broken Archived",
            raw_type="BROKEN",
            raw_status="UNKNOWN_STATUS",
            archived=True,
        )
        service = AdminTestService(AdminTestRepository(db))
        actor = ServiceActor(id=admin.id, role=RoleEnum.ADMIN)
        pagination = PaginationParams(page=1, page_size=20, sort="created_at", order="desc")

        default_payload = service.list_tests(actor=actor, pagination=pagination)
        archived_payload = service.list_tests(actor=actor, pagination=pagination, status=(TestStatus.ARCHIVED,))

        assert any(
            item["name"] == "Broken Draft"
            and item["type"] == "MCQ"
            and item["status"] == TestStatus.DRAFT.value
            for item in default_payload["items"]
        )
        assert any(
            item["name"] == "Broken Archived"
            and item["type"] == "MCQ"
            and item["status"] == TestStatus.ARCHIVED.value
            for item in archived_payload["items"]
        )

        repaired_draft = db.execute(
            select(
                cast(Exam.__table__.c.type, String).label("type"),
                cast(Exam.__table__.c.status, String).label("status"),
            ).where(Exam.__table__.c.id == broken_draft_id)
        ).mappings().one()
        repaired_archived = db.execute(
            select(
                cast(Exam.__table__.c.type, String).label("type"),
                cast(Exam.__table__.c.status, String).label("status"),
            ).where(Exam.__table__.c.id == broken_archived_id)
        ).mappings().one()

        assert repaired_draft["type"] == ExamType.MCQ.value
        assert repaired_draft["status"] == ExamStatus.CLOSED.value
        assert repaired_archived["type"] == ExamType.MCQ.value
        assert repaired_archived["status"] == ExamStatus.CLOSED.value
    finally:
        db.close()
