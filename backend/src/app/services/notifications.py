from sqlalchemy.orm import Session

from ..models import Notification


def notify_user(db: Session, user_id, title: str, message: str, link: str = None):
    notif = Notification(user_id=user_id, title=title, message=message, link=link)
    db.add(notif)
    db.commit()


def notify_proctoring_event(db: Session, attempt_id, event: dict):
    from ..models import Attempt
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        return
    notify_user(
        db,
        attempt.user_id,
        title=f"Proctoring Alert: {event.get('event_type', 'Unknown')}",
        message=event.get("detail", "A proctoring event was detected."),
        link=f"/attempt-result/{attempt_id}",
    )
