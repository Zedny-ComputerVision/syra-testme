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

from ...models import RoleEnum, Exam, Attempt, User, AttemptStatus, ProctoringEvent, SeverityEnum, ExamStatus
from ...schemas import CustomReportExportRequest, CustomReportPreview
from ...services.audit import write_audit_log
from ...services.normalized_relations import ADMIN_META_KEY, exam_archived_at, exam_code, is_exam_pool_library
from ..deps import get_db_dep, parse_uuid_param, require_permission

router = APIRouter()
CUSTOM_REPORT_DATASETS = {
    "attempts": ["id", "test_title", "user_name", "status", "score", "started_at", "submitted_at"],
    "tests": ["id", "name", "code", "status", "type", "time_limit_minutes", "question_count", "course_title"],
    "users": ["id", "user_id", "name", "email", "role", "is_active", "created_at"],
}
CUSTOM_REPORT_COLUMN_ALIASES = {
    "attempts": {
        "exam_title": "test_title",
    }
}


def _csv_response(rows: list[dict], filename: str, columns: list[str] | None = None) -> StreamingResponse:
    if not rows and not columns:
        raise HTTPException(status_code=400, detail="No data to export")
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns or list(rows[0].keys()))
    writer.writeheader()
    if rows:
        writer.writerows(rows)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _is_pool_library_exam(exam: Exam) -> bool:
    return is_exam_pool_library(exam)


def _test_code(exam: Exam) -> str:
    return str(exam_code(exam) or "")


def _test_status(exam: Exam) -> str:
    if exam_archived_at(exam):
        return "ARCHIVED"
    if exam.status == ExamStatus.OPEN:
        return "PUBLISHED"
    return "DRAFT"


def _serialize_value(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "value"):
        return value.value
    return value


def _normalize_custom_report_column(dataset: str, column: str) -> str:
    aliases = CUSTOM_REPORT_COLUMN_ALIASES.get(dataset, {})
    return aliases.get(column, column)


def _validate_custom_report_columns(dataset: str, requested: list[str]) -> tuple[list[str], list[str]]:
    allowed = CUSTOM_REPORT_DATASETS.get(dataset)
    if not allowed:
        raise HTTPException(status_code=400, detail="Unknown dataset")
    normalized = []
    seen = set()
    invalid = []
    for column in requested:
        canonical = _normalize_custom_report_column(dataset, column)
        if canonical in seen:
            continue
        if canonical not in allowed:
            invalid.append(column)
            continue
        seen.add(canonical)
        normalized.append(canonical)
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unsupported columns for {dataset}: {', '.join(invalid)}")
    return normalized, allowed


def _build_custom_report_rows(db: Session, dataset: str, search: str | None = None) -> tuple[list[dict], list[str]]:
    dataset = dataset or ""
    if dataset == "attempts":
        attempts = db.scalars(select(Attempt).order_by(Attempt.created_at.desc())).all()
        rows = [
            {
                "id": str(attempt.id),
                "test_title": attempt.exam.title if attempt.exam else "",
                "exam_title": attempt.exam.title if attempt.exam else "",
                "user_name": attempt.user.name if attempt.user else "",
                "status": _serialize_value(attempt.status),
                "score": attempt.score if attempt.score is not None else "",
                "started_at": _serialize_value(attempt.started_at),
                "submitted_at": _serialize_value(attempt.submitted_at),
            }
            for attempt in attempts
        ]
    elif dataset == "tests":
        exams = db.scalars(select(Exam).order_by(Exam.created_at.desc())).all()
        rows = []
        for exam in exams:
            if _is_pool_library_exam(exam):
                continue
            course = exam.node.course if exam.node and exam.node.course else None
            rows.append(
                {
                    "id": str(exam.id),
                    "name": exam.title or "",
                    "code": _test_code(exam),
                    "status": _test_status(exam),
                    "type": _serialize_value(exam.type),
                    "time_limit_minutes": exam.time_limit or "",
                    "question_count": exam.question_count or 0,
                    "course_title": course.title if course else "",
                }
            )
    elif dataset == "users":
        users = db.scalars(select(User).order_by(User.created_at.desc())).all()
        rows = [
            {
                "id": str(user.id),
                "user_id": user.user_id or "",
                "name": user.name or "",
                "email": user.email or "",
                "role": _serialize_value(user.role),
                "is_active": bool(user.is_active),
                "created_at": _serialize_value(user.created_at),
            }
            for user in users
        ]
    else:
        raise HTTPException(status_code=400, detail="Unknown dataset")

    query = (search or "").strip().lower()
    if query:
        rows = [
            row for row in rows
            if any(query in str(_serialize_value(value)).lower() for value in row.values())
        ]
    return rows, CUSTOM_REPORT_DATASETS[dataset]


def _select_custom_report_columns(rows: list[dict], columns: list[str]) -> list[dict]:
    return [{column: row.get(column, "") for column in columns} for row in rows]


def _get_test_or_404(db: Session, exam_id: str) -> tuple[str, Exam]:
    exam_pk = parse_uuid_param(exam_id, detail="Test not found")
    exam = db.get(Exam, exam_pk)
    if not exam:
        raise HTTPException(status_code=404, detail="Test not found")
    return exam_pk, exam


def _build_test_report_rows(exam: Exam, attempts: list[Attempt]) -> list[dict]:
    rows = []
    for attempt in attempts:
        events = getattr(attempt, "_report_events", []) or []
        high = sum(1 for e in events if e.severity == SeverityEnum.HIGH)
        med = sum(1 for e in events if e.severity == SeverityEnum.MEDIUM)
        low = sum(1 for e in events if e.severity == SeverityEnum.LOW)
        timeline = " | ".join(
            f"{(e.occurred_at or datetime.now(timezone.utc)).strftime('%H:%M:%S')} {e.event_type} ({e.severity.value}) - {e.detail or ''}"
            for e in events
        )
        rows.append({
            "Test": exam.title or str(exam.id),
            "Attempt": str(attempt.id),
            "User Name": attempt.user.name if attempt.user else "",
            "User ID": attempt.user.user_id if attempt.user else "",
            "User Email": attempt.user.email if attempt.user else "",
            "Status": attempt.status.value if hasattr(attempt.status, "value") else attempt.status,
            "Score": attempt.score if attempt.score is not None else "",
            "Started": attempt.started_at.isoformat() if attempt.started_at else "",
            "Submitted": attempt.submitted_at.isoformat() if attempt.submitted_at else "",
            "PrecheckPassed": bool(attempt.precheck_passed_at),
            "ID Verified": bool(attempt.id_verified),
            "LightingScore": attempt.lighting_score if attempt.lighting_score is not None else "",
            "High Alerts": high,
            "Medium Alerts": med,
            "Low Alerts": low,
            "Total Events": len(events),
            "Timeline": timeline,
        })
    return rows


@router.post("/export/preview", response_model=CustomReportPreview)
async def preview_custom_report(
    body: CustomReportExportRequest,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
):
    requested_columns, available_columns = _validate_custom_report_columns(body.dataset, body.columns)
    rows, _ = _build_custom_report_rows(db, body.dataset, body.search)
    selected_rows = _select_custom_report_columns(rows, requested_columns)
    return CustomReportPreview(
        rows=selected_rows[:10],
        total=len(selected_rows),
        available_columns=available_columns,
    )


@router.post("/export")
async def export_custom_report(
    body: CustomReportExportRequest,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
):
    requested_columns, _ = _validate_custom_report_columns(body.dataset, body.columns)
    rows, _ = _build_custom_report_rows(db, body.dataset, body.search)
    selected_rows = _select_custom_report_columns(rows, requested_columns)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="CUSTOM_REPORT_EXPORTED",
        resource_type="custom_report",
        resource_id=body.dataset,
        detail=f"dataset={body.dataset}; rows={len(selected_rows)}; search={body.search or ''}",
    )
    return _csv_response(selected_rows, f"{body.dataset}_report_{ts}.csv", columns=requested_columns)


@router.post("/predefined/{slug}")
async def generate_predefined_report(slug: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN))):
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    if slug in {"test-performance", "exam-performance"}:
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
                "Test": ex.title,
                "Attempts": len(ex_attempts),
                "Avg Score": f"{avg:.1f}",
                "Pass Rate": f"{pass_rate:.1f}%",
            })
        write_audit_log(
            db,
            getattr(current, "id", None),
            action="PREDEFINED_REPORT_EXPORTED",
            resource_type="predefined_report",
            resource_id=slug,
        )
        return _csv_response(rows, f"{slug}_{ts}.csv")

    if slug == "proctoring-alerts":
        attempts = db.scalars(select(Attempt)).all()
        rows = []
        for a in attempts:
            events = db.scalars(
                select(ProctoringEvent).where(ProctoringEvent.attempt_id == a.id)
            ).all()
            high_alerts = sum(1 for e in events if e.severity == SeverityEnum.HIGH)
            medium_alerts = sum(1 for e in events if e.severity == SeverityEnum.MEDIUM)
            rows.append({
                "Attempt": str(a.id),
                "User": a.user.name if a.user else (a.user_id or ""),
                "High Alerts": high_alerts,
                "Medium Alerts": medium_alerts,
            })
        write_audit_log(
            db,
            getattr(current, "id", None),
            action="PREDEFINED_REPORT_EXPORTED",
            resource_type="predefined_report",
            resource_id=slug,
        )
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
                "Submitted": len([a for a in ua if a.status != AttemptStatus.IN_PROGRESS]),
            })
        write_audit_log(
            db,
            getattr(current, "id", None),
            action="PREDEFINED_REPORT_EXPORTED",
            resource_type="predefined_report",
            resource_id=slug,
        )
        return _csv_response(rows, f"{slug}_{ts}.csv")

    raise HTTPException(status_code=404, detail="Unknown report slug")


def _load_attempt_report_events(db: Session, attempts: list[Attempt]) -> None:
    for attempt in attempts:
        setattr(
            attempt,
            "_report_events",
            db.scalars(
                select(ProctoringEvent)
                .where(ProctoringEvent.attempt_id == attempt.id)
                .order_by(ProctoringEvent.occurred_at)
            ).all(),
        )


async def _generate_test_report_csv(
    test_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
):
    exam_pk, exam = _get_test_or_404(db, test_id)
    attempts = db.scalars(select(Attempt).where(Attempt.exam_id == exam_pk)).all()
    _load_attempt_report_events(db, attempts)
    rows = _build_test_report_rows(exam, attempts)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    safe_title = (exam.title or str(exam.id)).replace(" ", "_")
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="EXAM_REPORT_EXPORTED",
        resource_type="exam",
        resource_id=str(exam.id),
        detail="format=csv",
    )
    return _csv_response(
        rows or [{
            "Test": exam.title or str(exam.id),
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
        f"test_{safe_title}_{ts}.csv"
    )


@router.get("/test/{test_id}")
async def generate_test_report(
    test_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
):
    return await _generate_test_report_csv(test_id, db, current)


@router.get("/exam/{exam_id}")
async def generate_exam_report(
    exam_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
):
    return await _generate_test_report_csv(exam_id, db, current)


async def _generate_test_report_pdf_response(
    test_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
):
    exam_pk, exam = _get_test_or_404(db, test_id)
    attempts = db.scalars(select(Attempt).where(Attempt.exam_id == exam_pk)).all()
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=32, rightMargin=32, topMargin=32, bottomMargin=32)
    styles = getSampleStyleSheet()
    story = []

    # Header
    story.append(Paragraph(f"<b>Test Report:</b> {exam.title or exam.id}", styles["Title"]))
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
        story.append(Paragraph("No attempts yet for this test.", styles["Normal"]))
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
    filename = f"test_{(exam.title or str(exam.id)).replace(' ', '_')}_{ts}.pdf"
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="EXAM_REPORT_EXPORTED",
        resource_type="exam",
        resource_id=str(exam.id),
        detail="format=pdf",
    )
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename=\"{filename}\"'})


@router.get("/test/{test_id}/pdf")
async def generate_test_report_pdf(
    test_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
):
    return await _generate_test_report_pdf_response(test_id, db, current)


@router.get("/exam/{exam_id}/pdf")
async def generate_exam_report_pdf(
    exam_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
):
    return await _generate_test_report_pdf_response(exam_id, db, current)
