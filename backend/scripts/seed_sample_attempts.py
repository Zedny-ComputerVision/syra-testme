"""Seed sample attempts with proctoring events for richer reports."""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from src.app.db.session import SessionLocal
from src.app.models import Attempt, AttemptStatus, ProctoringEvent, SeverityEnum, User, Exam

logger = logging.getLogger(__name__)

def find_exam(session, title="Programming Fundamentals Exam"):
    ex = session.query(Exam).filter(Exam.title == title).first()
    return ex or session.query(Exam).first()

def main():
    session = SessionLocal()
    try:
        exam = find_exam(session)
        if not exam:
            logger.info("No exams found")
            return
        users = session.query(User).all()
        learners = [u for u in users if u.role.value == "LEARNER"]
        if len(learners) < 2:
            logger.info("Not enough learners")
            return
        base_time = datetime.now(timezone.utc) - timedelta(days=1)
        attempts_to_create = [
            {"user": learners[0], "score": 92, "status": AttemptStatus.GRADED, "high": 1, "med": 2, "low": 4},
            {"user": learners[1], "score": 68, "status": AttemptStatus.SUBMITTED, "high": 2, "med": 3, "low": 5},
        ]
        for idx, spec in enumerate(attempts_to_create):
            attempt = (
                session.query(Attempt)
                .filter(Attempt.exam_id == exam.id, Attempt.user_id == spec["user"].id)
                .first()
            )
            if not attempt:
                attempt = Attempt(exam_id=exam.id, user_id=spec["user"].id, status=spec["status"])
                session.add(attempt)
            start = base_time + timedelta(hours=idx)
            submit = start + timedelta(minutes=45)
            attempt.started_at = start
            attempt.submitted_at = submit
            attempt.precheck_passed_at = start - timedelta(minutes=10)
            attempt.identity_verified = True
            attempt.id_verified = True
            attempt.lighting_score = 0.62
            attempt.score = spec["score"]
            attempt.status = spec["status"]
            session.flush()
            session.query(ProctoringEvent).filter(ProctoringEvent.attempt_id == attempt.id).delete()
            events = []
            for i in range(spec["high"]):
                events.append(("MULTI_FACE", SeverityEnum.HIGH, f"Multiple faces detected #{i+1}"))
            for i in range(spec["med"]):
                events.append(("FOCUS_LOSS", SeverityEnum.MEDIUM, f"Tab switch #{i+1}"))
            for i in range(spec["low"]):
                events.append(("GAZE_DEVIATION", SeverityEnum.LOW, f"Gaze off-screen #{i+1}"))
            for e_idx, (etype, sev, detail) in enumerate(events):
                pe = ProctoringEvent(
                    attempt_id=attempt.id,
                    event_type=etype,
                    severity=sev,
                    detail=detail,
                    ai_confidence=0.8,
                    occurred_at=start + timedelta(minutes=5 + e_idx * 3),
                )
                session.add(pe)
        session.commit()
        logger.info("Seeded sample attempts and events for exam: %s", exam.title)
    finally:
        session.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
    main()
