from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, case, func, select, true
from sqlalchemy.orm import Session, joinedload, load_only

from ..api.deps import ensure_permission
from ..models import (
    Attempt,
    AttemptStatus,
    Exam,
    ExamStatus,
    ProctoringEvent,
    RoleEnum,
    Schedule,
    SeverityEnum,
    User,
)
from ..schemas import (
    DashboardFlaggedAttemptRead,
    DashboardRead,
    DashboardSeriesPointRead,
    DashboardTopTestRead,
    ScheduleRead,
)

PRIVILEGED_UPCOMING_PREVIEW_LIMIT = 8
FLAGGED_ATTEMPTS_PREVIEW_LIMIT = 6
TOP_TESTS_PREVIEW_LIMIT = 6
ATTEMPT_TREND_DAYS = 7


def build_dashboard(*, db: Session, current) -> DashboardRead:
    ensure_permission(db, current, "View Dashboard")
    now = datetime.now(timezone.utc)

    if current.role == RoleEnum.LEARNER:
        return _build_learner_dashboard(db=db, current=current, now=now)

    return _build_privileged_dashboard(db=db, current=current, now=now)


def _build_learner_dashboard(*, db: Session, current, now: datetime) -> DashboardRead:
    attempts_metrics = db.execute(
        select(
            func.count(Attempt.id),
            func.sum(case((Attempt.status == AttemptStatus.IN_PROGRESS, 1), else_=0)),
            func.max(Attempt.score),
            func.avg(Attempt.score),
            func.sum(case((Attempt.score.is_not(None), 1), else_=0)),
            func.sum(case((and_(Attempt.score.is_not(None), Attempt.score >= 60), 1), else_=0)),
        ).where(Attempt.user_id == current.id)
    ).one()
    total_attempts = int(attempts_metrics[0] or 0)
    in_progress = int(attempts_metrics[1] or 0)
    best_score = attempts_metrics[2]
    average_score = attempts_metrics[3]
    scored_attempts = int(attempts_metrics[4] or 0)
    passed_attempts = int(attempts_metrics[5] or 0)

    learner_visible_exam_ids = (
        select(Schedule.exam_id.label("exam_id"))
        .where(
            Schedule.user_id == current.id,
            Schedule.exam_id.is_not(None),
            Schedule.scheduled_at <= now,
        )
        .subquery()
    )
    visible_tests = (
        db.scalar(
            select(func.count(Exam.id))
            .select_from(Exam)
            .join(learner_visible_exam_ids, learner_visible_exam_ids.c.exam_id == Exam.id)
            .where(
                Exam.library_pool_id.is_(None),
                Exam.status == ExamStatus.OPEN,
            )
        )
        or 0
    )
    # Show both future schedules AND available-now schedules (scheduled
    # within the last 24 hours) so learners see their exam on the dashboard
    # even after the scheduled time has passed.
    upcoming_cutoff = now - timedelta(hours=24)
    upcoming = db.scalars(
        select(Schedule)
        .options(
            load_only(
                Schedule.id,
                Schedule.exam_id,
                Schedule.user_id,
                Schedule.scheduled_at,
                Schedule.access_mode,
                Schedule.notes,
                Schedule.created_at,
                Schedule.updated_at,
            ),
            joinedload(Schedule.exam).load_only(
                Exam.id,
                Exam.title,
                Exam.type,
                Exam.time_limit,
            ),
            joinedload(Schedule.user).load_only(
                User.id,
                User.name,
                User.user_id,
            ),
        )
        .where(
            Schedule.user_id == current.id,
            Schedule.scheduled_at >= upcoming_cutoff,
        )
        .order_by(Schedule.scheduled_at.asc())
    ).all()

    return DashboardRead(
        total_exams=visible_tests,
        total_tests=visible_tests,
        total_users=0,
        total_learners=0,
        total_admins=0,
        total_instructors=0,
        active_users=0,
        published_tests=visible_tests,
        open_tests=visible_tests,
        closed_tests=0,
        total_attempts=total_attempts,
        in_progress_attempts=in_progress,
        completed_attempts=total_attempts - in_progress,
        best_score=best_score,
        average_score=average_score,
        pass_rate=round((passed_attempts / scored_attempts) * 100, 1) if scored_attempts else 0,
        awaiting_review_attempts=0,
        high_risk_attempts=0,
        medium_risk_attempts=0,
        upcoming_count=len(upcoming),
        upcoming_schedules=[_serialize_schedule(schedule) for schedule in upcoming],
        generated_at=now,
    )


def _build_privileged_dashboard(*, db: Session, current, now: datetime) -> DashboardRead:
    exam_scope = _dashboard_exam_scope(current)

    attempts_row = db.execute(
        select(
            func.count(Attempt.id).label("total_attempts"),
            func.sum(case((Attempt.status == AttemptStatus.IN_PROGRESS, 1), else_=0)).label("in_progress_attempts"),
            func.sum(case((Attempt.status == AttemptStatus.SUBMITTED, 1), else_=0)).label("submitted_attempts"),
            func.sum(case((Attempt.status == AttemptStatus.GRADED, 1), else_=0)).label("graded_attempts"),
            func.max(Attempt.score).label("best_score"),
            func.avg(Attempt.score).label("average_score"),
            func.sum(case((Attempt.score.is_not(None), 1), else_=0)).label("scored_attempts"),
            func.sum(
                case(
                    (
                        and_(
                            Attempt.score.is_not(None),
                            Attempt.score >= func.coalesce(Exam.passing_score, 60),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("passed_attempts"),
        )
        .select_from(Attempt)
        .join(Exam, Attempt.exam_id == Exam.id)
        .where(exam_scope)
    ).one()

    tests_row = db.execute(
        select(
            func.count(Exam.id).label("total_tests"),
            func.sum(case((Exam.status == ExamStatus.OPEN, 1), else_=0)).label("open_tests"),
            func.sum(case((Exam.status == ExamStatus.CLOSED, 1), else_=0)).label("closed_tests"),
        ).where(Exam.library_pool_id.is_(None), exam_scope)
    ).one()

    total_attempts = int(attempts_row.total_attempts or 0)
    in_progress_attempts = int(attempts_row.in_progress_attempts or 0)
    submitted_attempts = int(attempts_row.submitted_attempts or 0)
    graded_attempts = int(attempts_row.graded_attempts or 0)
    scored_attempts = int(attempts_row.scored_attempts or 0)
    passed_attempts = int(attempts_row.passed_attempts or 0)
    total_tests = int(tests_row.total_tests or 0)
    open_tests = int(tests_row.open_tests or 0)
    closed_tests = int(tests_row.closed_tests or 0)

    total_users = 0
    total_learners = 0
    total_admins = 0
    total_instructors = 0
    active_users = 0
    role_distribution: list[DashboardSeriesPointRead] = []

    if current.role in {RoleEnum.ADMIN, RoleEnum.INSTRUCTOR}:
        role_rows = db.execute(
            select(User.role, func.count(User.id))
            .group_by(User.role)
            .order_by(User.role.asc())
        ).all()
        role_counts = {role: int(count or 0) for role, count in role_rows}
        total_admins = role_counts.get(RoleEnum.ADMIN, 0)
        total_instructors = role_counts.get(RoleEnum.INSTRUCTOR, 0)
        total_learners = role_counts.get(RoleEnum.LEARNER, 0)
        total_users = total_admins + total_instructors + total_learners
        active_users = int(
            db.scalar(select(func.count(User.id)).where(User.is_active.is_(True)))
            or 0
        )
        role_distribution = [
            DashboardSeriesPointRead(key="ADMIN", label="Admins", value=total_admins),
            DashboardSeriesPointRead(key="INSTRUCTOR", label="Instructors", value=total_instructors),
            DashboardSeriesPointRead(key="LEARNER", label="Learners", value=total_learners),
        ]

    flagged_attempts_sq = _flagged_attempts_subquery(exam_scope)
    risk_row = db.execute(
        select(
            func.sum(case((flagged_attempts_sq.c.risk_level == 2, 1), else_=0)).label("high_risk_attempts"),
            func.sum(case((flagged_attempts_sq.c.risk_level == 1, 1), else_=0)).label("medium_risk_attempts"),
        ).select_from(flagged_attempts_sq)
    ).one()
    high_risk_attempts = int(risk_row.high_risk_attempts or 0)
    medium_risk_attempts = int(risk_row.medium_risk_attempts or 0)

    upcoming_count = int(
        db.scalar(
            select(func.count(Schedule.id))
            .join(Exam, Schedule.exam_id == Exam.id)
            .where(Schedule.scheduled_at >= now, exam_scope)
        )
        or 0
    )
    upcoming = db.scalars(
        select(Schedule)
        .options(
            load_only(
                Schedule.id,
                Schedule.exam_id,
                Schedule.user_id,
                Schedule.scheduled_at,
                Schedule.access_mode,
                Schedule.notes,
                Schedule.created_at,
                Schedule.updated_at,
            ),
            joinedload(Schedule.exam).load_only(
                Exam.id,
                Exam.title,
                Exam.type,
                Exam.time_limit,
            ),
            joinedload(Schedule.user).load_only(
                User.id,
                User.name,
                User.user_id,
            ),
        )
        .join(Schedule.exam)
        .where(Schedule.scheduled_at >= now, exam_scope)
        .order_by(Schedule.scheduled_at.asc())
        .limit(PRIVILEGED_UPCOMING_PREVIEW_LIMIT)
    ).all()

    return DashboardRead(
        total_exams=total_tests,
        total_tests=total_tests,
        total_users=total_users,
        total_learners=total_learners,
        total_admins=total_admins,
        total_instructors=total_instructors,
        active_users=active_users,
        published_tests=open_tests,
        open_tests=open_tests,
        closed_tests=closed_tests,
        total_attempts=total_attempts,
        in_progress_attempts=in_progress_attempts,
        completed_attempts=total_attempts - in_progress_attempts,
        best_score=attempts_row.best_score,
        average_score=attempts_row.average_score,
        pass_rate=round((passed_attempts / scored_attempts) * 100, 1) if scored_attempts else 0,
        awaiting_review_attempts=submitted_attempts,
        high_risk_attempts=high_risk_attempts,
        medium_risk_attempts=medium_risk_attempts,
        upcoming_count=upcoming_count,
        upcoming_schedules=[_serialize_schedule(schedule) for schedule in upcoming],
        attempt_status_breakdown=[
            DashboardSeriesPointRead(key="IN_PROGRESS", label="In progress", value=in_progress_attempts),
            DashboardSeriesPointRead(key="SUBMITTED", label="Submitted", value=submitted_attempts),
            DashboardSeriesPointRead(key="GRADED", label="Graded", value=graded_attempts),
        ],
        score_distribution=_build_score_distribution(
            db=db,
            exam_scope=exam_scope,
        ),
        role_distribution=role_distribution,
        test_status_breakdown=[
            DashboardSeriesPointRead(key="OPEN", label="Open tests", value=open_tests),
            DashboardSeriesPointRead(key="CLOSED", label="Closed tests", value=closed_tests),
        ],
        recent_attempt_trend=_build_recent_attempt_trend(
            db=db,
            exam_scope=exam_scope,
            now=now,
        ),
        top_tests=_build_top_tests(
            db=db,
            exam_scope=exam_scope,
            flagged_attempts_sq=flagged_attempts_sq,
        ),
        recent_flagged_attempts=_build_recent_flagged_attempts(
            db=db,
            exam_scope=exam_scope,
            flagged_attempts_sq=flagged_attempts_sq,
        ),
        generated_at=now,
    )


def _dashboard_exam_scope(current):
    return Exam.created_by_id == current.id


def _flagged_attempts_subquery(exam_scope):
    return (
        select(
            ProctoringEvent.attempt_id.label("attempt_id"),
            func.sum(case((ProctoringEvent.severity == SeverityEnum.HIGH, 1), else_=0)).label("high_violations"),
            func.sum(case((ProctoringEvent.severity == SeverityEnum.MEDIUM, 1), else_=0)).label("med_violations"),
            func.max(
                case(
                    (ProctoringEvent.severity == SeverityEnum.HIGH, 2),
                    (ProctoringEvent.severity == SeverityEnum.MEDIUM, 1),
                    else_=0,
                )
            ).label("risk_level"),
            func.max(ProctoringEvent.occurred_at).label("last_event_at"),
        )
        .select_from(ProctoringEvent)
        .join(Attempt, ProctoringEvent.attempt_id == Attempt.id)
        .join(Exam, Attempt.exam_id == Exam.id)
        .where(exam_scope)
        .group_by(ProctoringEvent.attempt_id)
        .subquery()
    )


def _build_score_distribution(*, db: Session, exam_scope) -> list[DashboardSeriesPointRead]:
    row = db.execute(
        select(
            func.sum(case((Attempt.score.is_(None), 1), else_=0)).label("ungraded"),
            func.sum(case((and_(Attempt.score.is_not(None), Attempt.score < 50), 1), else_=0)).label("below_50"),
            func.sum(case((and_(Attempt.score >= 50, Attempt.score < 70), 1), else_=0)).label("score_50_69"),
            func.sum(case((and_(Attempt.score >= 70, Attempt.score < 85), 1), else_=0)).label("score_70_84"),
            func.sum(case((and_(Attempt.score >= 85, Attempt.score <= 100), 1), else_=0)).label("score_85_100"),
        )
        .select_from(Attempt)
        .join(Exam, Attempt.exam_id == Exam.id)
        .where(exam_scope)
    ).one()

    return [
        DashboardSeriesPointRead(key="UNGRADED", label="Ungraded", value=int(row.ungraded or 0)),
        DashboardSeriesPointRead(key="LT50", label="< 50", value=int(row.below_50 or 0)),
        DashboardSeriesPointRead(key="50_69", label="50-69", value=int(row.score_50_69 or 0)),
        DashboardSeriesPointRead(key="70_84", label="70-84", value=int(row.score_70_84 or 0)),
        DashboardSeriesPointRead(key="85_100", label="85-100", value=int(row.score_85_100 or 0)),
    ]


def _build_recent_attempt_trend(*, db: Session, exam_scope, now: datetime) -> list[DashboardSeriesPointRead]:
    window_start = now - timedelta(days=ATTEMPT_TREND_DAYS - 1)
    timestamps = db.scalars(
        select(func.coalesce(Attempt.started_at, Attempt.created_at))
        .select_from(Attempt)
        .join(Exam, Attempt.exam_id == Exam.id)
        .where(
            exam_scope,
            func.coalesce(Attempt.started_at, Attempt.created_at) >= window_start,
        )
    ).all()

    counts = Counter()
    for stamp in timestamps:
        if stamp is None:
            continue
        counts[stamp.date()] += 1

    points = []
    for offset in range(ATTEMPT_TREND_DAYS):
        day = (window_start + timedelta(days=offset)).date()
        points.append(
            DashboardSeriesPointRead(
                key=day.isoformat(),
                label=day.strftime("%a"),
                value=counts.get(day, 0),
            )
        )
    return points


def _build_top_tests(*, db: Session, exam_scope, flagged_attempts_sq) -> list[DashboardTopTestRead]:
    rows = db.execute(
        select(
            Exam.id,
            Exam.title,
            func.count(Attempt.id).label("attempts"),
            func.sum(case((Attempt.score.is_not(None), 1), else_=0)).label("scored_attempts"),
            func.avg(Attempt.score).label("average_score"),
            func.sum(
                case(
                    (
                        and_(
                            Attempt.score.is_not(None),
                            Attempt.score >= func.coalesce(Exam.passing_score, 60),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("passed_attempts"),
            func.sum(case((flagged_attempts_sq.c.risk_level == 2, 1), else_=0)).label("high_risk_attempts"),
            func.sum(case((flagged_attempts_sq.c.risk_level >= 1, 1), else_=0)).label("flagged_attempts"),
        )
        .select_from(Attempt)
        .join(Exam, Attempt.exam_id == Exam.id)
        .outerjoin(flagged_attempts_sq, flagged_attempts_sq.c.attempt_id == Attempt.id)
        .where(exam_scope, Exam.library_pool_id.is_(None))
        .group_by(Exam.id, Exam.title, Exam.passing_score)
        .order_by(func.count(Attempt.id).desc(), Exam.title.asc())
        .limit(TOP_TESTS_PREVIEW_LIMIT)
    ).all()

    return [
        DashboardTopTestRead(
            exam_id=row.id,
            title=row.title,
            attempts=int(row.attempts or 0),
            scored_attempts=int(row.scored_attempts or 0),
            average_score=float(row.average_score) if row.average_score is not None else None,
            passed_attempts=int(row.passed_attempts or 0),
            pass_rate=round((int(row.passed_attempts or 0) / int(row.scored_attempts or 0)) * 100, 1)
            if int(row.scored_attempts or 0)
            else 0,
            high_risk_attempts=int(row.high_risk_attempts or 0),
            flagged_attempts=int(row.flagged_attempts or 0),
        )
        for row in rows
    ]


def _build_recent_flagged_attempts(*, db: Session, exam_scope, flagged_attempts_sq) -> list[DashboardFlaggedAttemptRead]:
    rows = db.execute(
        select(
            Attempt.id,
            Attempt.exam_id,
            Attempt.user_id,
            Attempt.status,
            Attempt.score,
            Attempt.started_at,
            Attempt.submitted_at,
            Attempt.created_at,
            Exam.title.label("test_title"),
            User.name.label("user_name"),
            User.user_id.label("user_student_id"),
            flagged_attempts_sq.c.high_violations,
            flagged_attempts_sq.c.med_violations,
            flagged_attempts_sq.c.risk_level,
            flagged_attempts_sq.c.last_event_at,
        )
        .select_from(Attempt)
        .join(Exam, Attempt.exam_id == Exam.id)
        .join(User, Attempt.user_id == User.id)
        .join(flagged_attempts_sq, flagged_attempts_sq.c.attempt_id == Attempt.id)
        .where(exam_scope, flagged_attempts_sq.c.risk_level > 0)
        .order_by(
            flagged_attempts_sq.c.risk_level.desc(),
            flagged_attempts_sq.c.last_event_at.desc(),
            Attempt.created_at.desc(),
        )
        .limit(FLAGGED_ATTEMPTS_PREVIEW_LIMIT)
    ).all()

    insights = []
    for row in rows:
        high_violations = int(row.high_violations or 0)
        med_violations = int(row.med_violations or 0)
        risk_level = "HIGH" if int(row.risk_level or 0) >= 2 else "MEDIUM"
        insights.append(
            DashboardFlaggedAttemptRead(
                id=row.id,
                exam_id=row.exam_id,
                user_id=row.user_id,
                status=row.status,
                score=row.score,
                user_name=row.user_name,
                user_student_id=row.user_student_id,
                test_title=row.test_title,
                started_at=row.started_at,
                submitted_at=row.submitted_at,
                high_violations=high_violations,
                med_violations=med_violations,
                integrity_score=max(0, 100 - (high_violations * 18) - (med_violations * 9)),
                risk_level=risk_level,
            )
        )
    return insights


def _serialize_schedule(schedule: Schedule) -> ScheduleRead:
    test = schedule.exam
    test_type = getattr(test, "type", None) if test else None
    test_type_value = getattr(test_type, "value", test_type) if test_type else None
    test_title = test.title if test else None
    return ScheduleRead(
        id=schedule.id,
        exam_id=schedule.exam_id,
        test_id=schedule.exam_id,
        user_id=schedule.user_id,
        scheduled_at=schedule.scheduled_at,
        access_mode=schedule.access_mode,
        notes=schedule.notes,
        created_at=schedule.created_at,
        updated_at=schedule.updated_at,
        user_name=schedule.user.name if schedule.user else None,
        user_student_id=schedule.user.user_id if schedule.user else None,
        test_title=test_title,
        exam_title=test.title if test else None,
        exam_type=test_type,
        exam_time_limit=test.time_limit if test else None,
        test_name=test_title,
        test_type=test_type_value,
        test_time_limit=test.time_limit if test else None,
    )
