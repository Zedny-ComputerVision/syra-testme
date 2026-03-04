import csv
import io
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import RoleEnum, Exam, Attempt, User, AttemptStatus
from ..deps import get_db_dep, require_role

router = APIRouter()


def _csv_response(rows: list[dict], filename: str) -> StreamingResponse:
    if not rows:
        raise HTTPException(status_code=400, detail="No data to export")
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/predefined/{slug}")
async def generate_predefined_report(slug: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    if slug == "exam-performance":
        exams = db.scalars(select(Exam)).all()
        attempts = db.scalars(select(Attempt)).all()
        rows = []
        for ex in exams:
            ex_attempts = [a for a in attempts if a.exam_id == ex.id]
            submitted = [a for a in ex_attempts if a.status != AttemptStatus.IN_PROGRESS]
            avg = (sum((a.score or 0) for a in submitted) / len(submitted)) if submitted else 0
            pass_rate = 0
            if submitted and ex.passing_score is not None:
                passed = [a for a in submitted if (a.score or 0) >= ex.passing_score]
                pass_rate = (len(passed) / len(submitted)) * 100
            rows.append({
                "Exam": ex.title,
                "Attempts": len(ex_attempts),
                "Avg Score": f"{avg:.1f}",
                "Pass Rate": f"{pass_rate:.1f}%",
            })
        return _csv_response(rows, f"{slug}_{ts}.csv")

    if slug == "proctoring-alerts":
        attempts = db.scalars(select(Attempt)).all()
        rows = []
        for a in attempts:
            rows.append({
                "Attempt": str(a.id),
                "User": a.user.name if a.user else (a.user_id or ""),
                "High Alerts": getattr(a, "high_alerts", 0) or 0,
                "Medium Alerts": getattr(a, "medium_alerts", 0) or 0,
            })
        return _csv_response(rows, f"{slug}_{ts}.csv")

    if slug == "learner-activity":
        users = db.scalars(select(User)).all()
        attempts = db.scalars(select(Attempt)).all()
        rows = []
        for u in users:
            if u.role != RoleEnum.LEARNER:
                continue
            ua = [a for a in attempts if a.user_id == u.id]
            rows.append({
                "User": u.name,
                "Attempts": len(ua),
                "Submitted": len([a for a in ua if a.status != "IN_PROGRESS"]),
            })
        return _csv_response(rows, f"{slug}_{ts}.csv")

    raise HTTPException(status_code=404, detail="Unknown report slug")
