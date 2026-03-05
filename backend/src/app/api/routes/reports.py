import csv
import io
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from io import BytesIO

from ...models import RoleEnum, Exam, Attempt, User, AttemptStatus, ProctoringEvent, SeverityEnum
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


@router.get("/exam/{exam_id}")
async def generate_exam_report(
    exam_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_role(RoleEnum.ADMIN)),
):
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    attempts = db.scalars(select(Attempt).where(Attempt.exam_id == exam_id)).all()
    rows = []
    for a in attempts:
        events = db.scalars(
            select(ProctoringEvent)
            .where(ProctoringEvent.attempt_id == a.id)
            .order_by(ProctoringEvent.occurred_at)
        ).all()
        high = sum(1 for e in events if e.severity == SeverityEnum.HIGH)
        med = sum(1 for e in events if e.severity == SeverityEnum.MEDIUM)
        low = sum(1 for e in events if e.severity == SeverityEnum.LOW)
        timeline = " | ".join(
            f"{(e.occurred_at or datetime.now(timezone.utc)).strftime('%H:%M:%S')} {e.event_type} ({e.severity.value}) - {e.detail or ''}"
            for e in events
        )
        rows.append({
            "Exam": exam.title or str(exam.id),
            "Attempt": str(a.id),
            "User Name": a.user.name if a.user else "",
            "User ID": a.user.user_id if a.user else "",
            "User Email": a.user.email if a.user else "",
            "Status": a.status.value if hasattr(a.status, "value") else a.status,
            "Score": a.score if a.score is not None else "",
            "Started": a.started_at.isoformat() if a.started_at else "",
            "Submitted": a.submitted_at.isoformat() if a.submitted_at else "",
            "PrecheckPassed": bool(a.precheck_passed_at),
            "ID Verified": bool(a.id_verified),
            "LightingScore": a.lighting_score if a.lighting_score is not None else "",
            "High Alerts": high,
            "Medium Alerts": med,
            "Low Alerts": low,
            "Total Events": len(events),
            "Timeline": timeline,
        })

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    safe_title = (exam.title or str(exam.id)).replace(" ", "_")
    return _csv_response(
        rows or [{
            "Exam": exam.title or str(exam.id),
            "Attempt": "",
            "User Name": "",
            "User ID": "",
            "User Email": "",
            "Status": "",
            "Score": "",
            "Started": "",
            "Submitted": "",
            "PrecheckPassed": "",
            "ID Verified": "",
            "LightingScore": "",
            "High Alerts": "",
            "Medium Alerts": "",
            "Low Alerts": "",
            "Total Events": "",
            "Timeline": "",
        }],
        f"exam_{safe_title}_{ts}.csv"
    )


@router.get("/exam/{exam_id}/pdf")
async def generate_exam_report_pdf(
    exam_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_role(RoleEnum.ADMIN)),
):
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    attempts = db.scalars(select(Attempt).where(Attempt.exam_id == exam_id)).all()
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=32, rightMargin=32, topMargin=32, bottomMargin=32)
    styles = getSampleStyleSheet()
    story = []

    # Header
    story.append(Paragraph(f"<b>Exam Report:</b> {exam.title or exam.id}", styles["Title"]))
    story.append(Paragraph(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}", styles["Normal"]))

    # Summary table
    total_attempts = len(attempts)
    submitted = [a for a in attempts if a.submitted_at]
    scored = [a.score for a in attempts if a.score is not None]
    avg_score = round(sum(scored) / len(scored), 2) if scored else "N/A"
    pass_rate = "N/A"
    if submitted and exam.passing_score is not None:
        passed = [a for a in submitted if (a.score or 0) >= exam.passing_score]
        pass_rate = f"{round((len(passed) / len(submitted)) * 100, 1)}%" if submitted else "N/A"

    summary_data = [
        ["Type", exam.type, "Status", exam.status],
        ["Category", getattr(exam, 'category_id', ''), "Time limit", f"{exam.time_limit} min"],
        ["Max attempts", getattr(exam, 'max_attempts', ''), "Total attempts", total_attempts],
        ["Submitted", len(submitted), "Avg score / Pass rate", f"{avg_score} / {pass_rate}"],
    ]
    summary_table = Table(summary_data, hAlign='LEFT', colWidths=[80, 140, 90, 120])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.whitesmoke),
        ('BOX', (0,0), (-1,-1), 0.5, colors.grey),
        ('GRID', (0,0), (-1,-1), 0.25, colors.lightgrey),
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
    ]))
    story.append(Spacer(1, 8))
    story.append(summary_table)
    story.append(Spacer(1, 12))

    if not attempts:
        story.append(Paragraph("No attempts yet for this exam.", styles["Normal"]))
    else:
        for a in attempts:
            events = db.scalars(
                select(ProctoringEvent)
                .where(ProctoringEvent.attempt_id == a.id)
                .order_by(ProctoringEvent.occurred_at)
            ).all()
            high = sum(1 for e in events if e.severity == SeverityEnum.HIGH)
            med = sum(1 for e in events if e.severity == SeverityEnum.MEDIUM)
            low = sum(1 for e in events if e.severity == SeverityEnum.LOW)

            story.append(Paragraph(f"Attempt {str(a.id)}", styles['Heading3']))
            info_rows = [
                ["User", a.user.name if a.user else ""],
                ["User ID", a.user.user_id if a.user else ""],
                ["Email", a.user.email if a.user else ""],
                ["Status", a.status],
                ["Score", a.score if a.score is not None else "N/A"],
                ["Started", a.started_at or "N/A"],
                ["Submitted", a.submitted_at or "N/A"],
                ["Precheck passed", "Yes" if a.precheck_passed_at else "No"],
                ["ID verified", "Yes" if a.id_verified else "No"],
                ["Lighting score", round(a.lighting_score,3) if a.lighting_score is not None else "N/A"],
                ["Alerts (H/M/L)", f"{high}/{med}/{low}"],
                ["Total events", len(events)],
            ]
            info_table = Table(info_rows, hAlign='LEFT', colWidths=[120, 360])
            info_table.setStyle(TableStyle([
                ('BOX', (0,0), (-1,-1), 0.5, colors.grey),
                ('GRID', (0,0), (-1,-1), 0.25, colors.lightgrey),
                ('BACKGROUND', (0,0), (0,-1), colors.whitesmoke),
                ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
                ('FONTSIZE', (0,0), (-1,-1), 9),
            ]))
            story.append(info_table)
            story.append(Spacer(1, 8))

            if events:
                story.append(Paragraph("Proctoring Timeline", styles["Heading4"]))
                event_data = [["Time", "Event", "Severity", "Detail"]]
                for e in events:
                    ts = e.occurred_at.strftime("%Y-%m-%d %H:%M:%S") if e.occurred_at else ""
                    event_data.append([ts, e.event_type, e.severity.value, e.detail or ""])
                event_table = Table(event_data, hAlign='LEFT', colWidths=[110, 110, 70, 230])
                event_table.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
                    ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
                    ('BOX', (0,0), (-1,-1), 0.5, colors.grey),
                    ('GRID', (0,0), (-1,-1), 0.25, colors.lightgrey),
                    ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
                    ('FONTSIZE', (0,0), (-1,-1), 8),
                    ('VALIGN', (0,0), (-1,-1), 'TOP'),
                ]))
                story.append(event_table)
            else:
                story.append(Paragraph("No proctoring events recorded.", styles["Normal"]))
            story.append(Spacer(1, 16))

    doc.build(story)
    buf.seek(0)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"exam_{(exam.title or str(exam.id)).replace(' ', '_')}_{ts}.pdf"
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename=\"{filename}\"'})
