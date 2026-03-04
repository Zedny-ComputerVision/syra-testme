from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update, func
from sqlalchemy.orm import Session

from ...models import Notification
from ...schemas import NotificationRead, Message
from ..deps import get_current_user, get_db_dep

router = APIRouter()


@router.get("/", response_model=list[NotificationRead])
async def list_notifications(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    query = select(Notification).where(Notification.user_id == current.id).order_by(Notification.created_at.desc())
    return db.scalars(query).all()


@router.post("/{notification_id}/read", response_model=Message)
async def mark_read(notification_id: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    notif = db.get(Notification, notification_id)
    if not notif or notif.user_id != current.id:
        raise HTTPException(status_code=404, detail="Not found")
    notif.is_read = True
    db.add(notif)
    db.commit()
    return Message(detail="Marked as read")


@router.post("/read-all", response_model=Message)
async def mark_all_read(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    db.execute(
        update(Notification)
        .where(Notification.user_id == current.id, Notification.is_read == False)
        .values(is_read=True)
    )
    db.commit()
    return Message(detail="All marked as read")


@router.get("/unread-count")
async def unread_count(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    count = db.scalar(
        select(func.count(Notification.id)).where(Notification.user_id == current.id, Notification.is_read == False)
    ) or 0
    return {"count": count}
