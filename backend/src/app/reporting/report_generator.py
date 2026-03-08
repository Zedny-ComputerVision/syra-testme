"""HTML Violation Report Generator.

Generates an HTML report with:
- Attempt summary
- Timeline of events
- Activity heatmap (15 time buckets)
- Violation breakdown table
"""
from datetime import datetime, timezone
from collections import Counter

from jinja2 import Template
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ProctoringEvent, Attempt

REPORT_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Proctoring Report - Attempt {{ attempt_id_short }}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
  .container { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #10b981; }
  h2 { font-size: 1.2rem; margin: 1.5rem 0 0.75rem; color: #8b5cf6; }
  .card { background: #1e293b; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1rem; }
  .metric { background: #1e293b; border-radius: 8px; padding: 1rem; text-align: center; }
  .metric .value { font-size: 1.75rem; font-weight: 700; }
  .metric .label { font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem; }
  .high { color: #ef4444; }
  .medium { color: #f59e0b; }
  .low { color: #10b981; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #334155; font-size: 0.85rem; }
  th { color: #94a3b8; font-weight: 600; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
  .badge-high { background: rgba(239,68,68,0.2); color: #ef4444; }
  .badge-medium { background: rgba(245,158,11,0.2); color: #f59e0b; }
  .badge-low { background: rgba(16,185,129,0.2); color: #10b981; }
  .heatmap { display: flex; gap: 2px; margin: 0.5rem 0; }
  .heatmap-cell { flex: 1; height: 32px; border-radius: 3px; position: relative; }
  .heatmap-cell .tooltip { display: none; position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: #0f172a; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; white-space: nowrap; }
  .heatmap-cell:hover .tooltip { display: block; }
  .footer { margin-top: 2rem; text-align: center; font-size: 0.75rem; color: #475569; }
</style>
</head>
<body>
<div class="container">
  <h1>SYRA LMS - Proctoring Report</h1>

  <div class="card">
    <strong>Attempt:</strong> {{ attempt_id_short }}<br>
    <strong>User:</strong> {{ user_name }} ({{ user_student_id }})<br>
    <strong>Test:</strong> {{ exam_title }}<br>
    <strong>Started:</strong> {{ started_at }}<br>
    <strong>Duration:</strong> {{ duration }}
  </div>

  <div class="grid">
    <div class="metric">
      <div class="value">{{ total_events }}</div>
      <div class="label">Total Events</div>
    </div>
    <div class="metric">
      <div class="value high">{{ high_count }}</div>
      <div class="label">HIGH Severity</div>
    </div>
    <div class="metric">
      <div class="value medium">{{ medium_count }}</div>
      <div class="label">MEDIUM Severity</div>
    </div>
    <div class="metric">
      <div class="value low">{{ low_count }}</div>
      <div class="label">LOW Severity</div>
    </div>
    <div class="metric">
      <div class="value">{{ integrity_score }}</div>
      <div class="label">Integrity Score</div>
    </div>
    <div class="metric">
      <div class="value">{{ score if score is not none else 'N/A' }}</div>
      <div class="label">Test Score</div>
    </div>
  </div>

  <h2>Activity Heatmap</h2>
  <div class="card">
    <div class="heatmap">
      {% for bucket in heatmap %}
      <div class="heatmap-cell" style="background: {{ bucket.color }};">
        <span class="tooltip">{{ bucket.label }}: {{ bucket.count }} events</span>
      </div>
      {% endfor %}
    </div>
  </div>

  <h2>Violation Breakdown</h2>
  <div class="card">
    <table>
      <thead><tr><th>Event Type</th><th>Count</th><th>Severity</th></tr></thead>
      <tbody>
      {% for row in breakdown %}
        <tr>
          <td>{{ row.event_type }}</td>
          <td>{{ row.count }}</td>
          <td><span class="badge badge-{{ row.severity|lower }}">{{ row.severity }}</span></td>
        </tr>
      {% endfor %}
      {% if not breakdown %}
        <tr><td colspan="3" style="text-align:center; color:#475569;">No violations recorded</td></tr>
      {% endif %}
      </tbody>
    </table>
  </div>

  <h2>Event Timeline</h2>
  <div class="card">
    <table>
      <thead><tr><th>Time</th><th>Event</th><th>Severity</th><th>Detail</th><th>Confidence</th></tr></thead>
      <tbody>
      {% for ev in events %}
        <tr>
          <td>{{ ev.time }}</td>
          <td>{{ ev.event_type }}</td>
          <td><span class="badge badge-{{ ev.severity|lower }}">{{ ev.severity }}</span></td>
          <td>{{ ev.detail or '' }}</td>
          <td>{{ '%.0f%%' % (ev.confidence * 100) if ev.confidence else 'N/A' }}</td>
        </tr>
      {% endfor %}
      {% if not events %}
        <tr><td colspan="5" style="text-align:center; color:#475569;">No events recorded</td></tr>
      {% endif %}
      </tbody>
    </table>
  </div>

  <div class="footer">
    Generated by SYRA LMS &middot; {{ generated_at }}
  </div>
</div>
</body>
</html>"""


def _compute_integrity_score(high: int, medium: int, low: int) -> int:
    score = 100 - (high * 18) - (medium * 9) - (low * 3)
    return max(0, min(100, score))


def _heatmap_color(count: int) -> str:
    if count == 0:
        return "rgba(16,185,129,0.15)"
    elif count <= 2:
        return "rgba(245,158,11,0.3)"
    elif count <= 5:
        return "rgba(245,158,11,0.6)"
    else:
        return "rgba(239,68,68,0.7)"


def generate_html_report(db: Session, attempt: Attempt) -> str:
    events = db.scalars(
        select(ProctoringEvent)
        .where(ProctoringEvent.attempt_id == attempt.id)
        .order_by(ProctoringEvent.occurred_at)
    ).all()

    high_count = sum(1 for e in events if e.severity.value == "HIGH")
    medium_count = sum(1 for e in events if e.severity.value == "MEDIUM")
    low_count = sum(1 for e in events if e.severity.value == "LOW")
    integrity_score = _compute_integrity_score(high_count, medium_count, low_count)

    # Heatmap: divide attempt duration into 15 buckets
    heatmap = []
    if events and attempt.started_at:
        end_time = attempt.submitted_at or datetime.now(timezone.utc)
        total_seconds = max((end_time - attempt.started_at).total_seconds(), 1)
        bucket_size = total_seconds / 15
        for i in range(15):
            bucket_start = attempt.started_at.timestamp() + (i * bucket_size)
            bucket_end = bucket_start + bucket_size
            count = sum(1 for e in events if bucket_start <= e.occurred_at.timestamp() < bucket_end)
            minutes = int(i * bucket_size / 60)
            heatmap.append({"label": f"{minutes}m", "count": count, "color": _heatmap_color(count)})
    else:
        for i in range(15):
            heatmap.append({"label": f"{i}m", "count": 0, "color": _heatmap_color(0)})

    # Breakdown by event type
    type_counter = Counter()
    type_severity = {}
    for e in events:
        type_counter[e.event_type] += 1
        type_severity[e.event_type] = e.severity.value
    breakdown = [
        {"event_type": et, "count": c, "severity": type_severity.get(et, "LOW")}
        for et, c in type_counter.most_common()
    ]

    # Event timeline
    timeline = []
    for e in events:
        timeline.append({
            "time": e.occurred_at.strftime("%H:%M:%S") if e.occurred_at else "",
            "event_type": e.event_type,
            "severity": e.severity.value,
            "detail": e.detail,
            "confidence": e.ai_confidence,
        })

    # Duration
    duration = "N/A"
    if attempt.started_at:
        end = attempt.submitted_at or datetime.now(timezone.utc)
        delta = end - attempt.started_at
        mins = int(delta.total_seconds() // 60)
        secs = int(delta.total_seconds() % 60)
        duration = f"{mins}m {secs}s"

    user = attempt.user
    exam = attempt.exam

    html = Template(REPORT_TEMPLATE).render(
        attempt_id_short=str(attempt.id)[:8],
        user_name=user.name if user else "Unknown",
        user_student_id=user.user_id if user else "N/A",
        exam_title=exam.title if exam else "Unknown",
        started_at=attempt.started_at.strftime("%Y-%m-%d %H:%M:%S") if attempt.started_at else "N/A",
        duration=duration,
        total_events=len(events),
        high_count=high_count,
        medium_count=medium_count,
        low_count=low_count,
        integrity_score=integrity_score,
        score=attempt.score,
        heatmap=heatmap,
        breakdown=breakdown,
        events=timeline,
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
    )
    return html
