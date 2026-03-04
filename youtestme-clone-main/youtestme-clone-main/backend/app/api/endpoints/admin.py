from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, func, and_
from typing import List, Dict, Any
from datetime import datetime, timedelta, timezone
from app.db.session import get_db
from app.models.models import User, Test, Attempt, ProctoringAlert, Session

router = APIRouter()

@router.get("/dashboard-summary")
async def get_dashboard_summary(db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    # 1. HIGH-LEVEL COUNTS
    user_count = await db.execute(select(func.count(User.id)))
    total_users = user_count.scalar()

    cand_count = await db.execute(select(func.count(User.id)).where(User.role == 'candidate'))
    total_candidates = cand_count.scalar()

    admin_count = await db.execute(select(func.count(User.id)).where(User.role == 'admin'))
    total_admins = admin_count.scalar()

    test_count = await db.execute(select(func.count(Test.id)))
    total_tests = test_count.scalar()

    act_test_count = await db.execute(select(func.count(Test.id)).where(Test.status == 'available'))
    active_tests = act_test_count.scalar()

    att_count = await db.execute(select(func.count(Attempt.id)))
    total_attempts = att_count.scalar()

    att_7d_count = await db.execute(select(func.count(Attempt.id)).where(Attempt.created_at >= seven_days_ago))
    attempts_last_7days = att_7d_count.scalar()

    alerts_7d_count = await db.execute(select(func.count(ProctoringAlert.id)).where(ProctoringAlert.timestamp >= seven_days_ago))
    alerts_last_7days = alerts_7d_count.scalar()

    # 2. TIMESERIES (30 days)
    # Fetch all attempts and alerts from last 30 days
    attempts_res = await db.execute(select(Attempt.created_at).where(Attempt.created_at >= thirty_days_ago))
    attempts_data = attempts_res.scalars().all()

    alerts_res = await db.execute(select(ProctoringAlert.timestamp).where(ProctoringAlert.timestamp >= thirty_days_ago))
    alerts_data = alerts_res.scalars().all()

    time_map = {}
    for i in range(30):
        d = (now - timedelta(days=i)).strftime('%Y-%m-%d')
        time_map[d] = {"attempts": 0, "alerts": 0}

    for att_time in attempts_data:
        d_str = att_time.strftime('%Y-%m-%d')
        if d_str in time_map:
            time_map[d_str]["attempts"] += 1

    for al_time in alerts_data:
        d_str = al_time.strftime('%Y-%m-%d')
        if d_str in time_map:
            time_map[d_str]["alerts"] += 1

    timeseries = [{"date": k, **v} for k, v in sorted(time_map.items())]

    # 3. ALERT TYPES (In our current system, we just have 'message', but we can mock or use it)
    alerts_all_res = await db.execute(select(ProctoringAlert.message, func.count(ProctoringAlert.id)).group_by(ProctoringAlert.message))
    alert_types = [{"type": msg, "count": count} for msg, count in alerts_all_res.all()]

    # 4. RECENT FLAGGED SESSIONS (Attempts with alerts)
    # We'll fetch attempts that have at least one alert
    flagged_query = (
        select(Attempt, User.name, User.email, Test.name)
        .join(User, Attempt.user_id == User.id)
        .join(Test, Attempt.test_id == Test.id)
        .where(select(func.count(ProctoringAlert.id)).where(ProctoringAlert.attempt_id == Attempt.id).scalar_subquery() > 0)
        .order_by(desc(Attempt.created_at))
        .limit(10)
    )
    flagged_res = await db.execute(flagged_query)
    
    recent_alerts = []
    risky_test_map = {}

    for attempt, u_name, u_email, t_name in flagged_res:
        # Fetch alerts for this attempt
        al_res = await db.execute(select(ProctoringAlert).where(ProctoringAlert.attempt_id == attempt.id).order_by(desc(ProctoringAlert.timestamp)))
        alerts = al_res.scalars().all()
        
        # Summarize alerts
        summary_map = {}
        for a in alerts:
            summary_map[a.message] = summary_map.get(a.message, 0) + 1
        
        recent_alerts.append({
            "sessionId": attempt.id,
            "testName": t_name,
            "candidateName": u_name,
            "candidateEmail": u_email,
            "alertCount": len(alerts),
            "lastAlertAt": alerts[0].timestamp.isoformat() if alerts else attempt.created_at.isoformat(),
            "alerts": [
                {"id": a.id, "type": a.message, "time": a.timestamp.isoformat(), "severity": "High"} 
                for a in alerts
            ],
            "alertsSummary": [{"type": k, "count": v} for k, v in summary_map.items()],
            "emotionsSummary": [] # We don't have emotions yet in Python version
        })

        # Risky tests calculation
        if t_name not in risky_test_map:
            risky_test_map[t_name] = {"alerts": 0, "attempts": 0}
        risky_test_map[t_name]["alerts"] += len(alerts)
        risky_test_map[t_name]["attempts"] += 1

    risky_tests = [
        {"testId": i, "testName": name, **data} 
        for i, (name, data) in enumerate(risky_test_map.items())
    ]
    risky_tests.sort(key=lambda x: x["alerts"], reverse=True)

    # 5. ATTEMPT OUTCOME
    outcome_res = await db.execute(select(Attempt.status, func.count(Attempt.id)).group_by(Attempt.status))
    attempt_outcome = [{"status": status, "count": count} for status, count in outcome_res.all()]

    return {
        "totals": {
            "totalUsers": total_users,
            "totalCandidates": total_candidates,
            "totalAdmins": total_admins,
            "totalTests": total_tests,
            "activeTests": active_tests,
            "totalAttempts": total_attempts,
            "attemptsLast7Days": attempts_last_7days,
            "alertsLast7Days": alerts_last_7days
        },
        "timeseries": timeseries,
        "alertTypes": alert_types,
        "riskyTests": risky_tests[:5],
        "attemptOutcome": attempt_outcome,
        "recentAlerts": recent_alerts
    }

@router.get("/recent-activity")
async def get_recent_activity(db: AsyncSession = Depends(get_db), limit: int = 10):
    query = select(Attempt, User.name, Test.name).join(User, Attempt.user_id == User.id).join(Test, Attempt.test_id == Test.id).order_by(desc(Attempt.started_at)).limit(limit)
    result = await db.execute(query)
    
    activity = []
    for attempt, user_name, test_name in result:
        activity.append({
            "id": attempt.id,
            "userName": user_name,
            "testName": test_name,
            "status": attempt.status,
            "timestamp": attempt.started_at
        })
    return activity

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db), limit: int = 10):
    query = select(ProctoringAlert, User.name).join(User, ProctoringAlert.user_id == User.id).order_by(desc(ProctoringAlert.timestamp)).limit(limit)
    result = await db.execute(query)
    
    alerts = []
    for alert, user_name in result:
        alerts.append({
            "id": alert.id,
            "message": alert.message,
            "userName": user_name,
            "attemptId": alert.attempt_id,
            "timestamp": alert.timestamp
        })
    return alerts

@router.post("/alerts", status_code=status.HTTP_201_CREATED)
async def create_alert(alert_in: dict, db: AsyncSession = Depends(get_db)):
    db_alert = ProctoringAlert(
        attempt_id=alert_in.get("attempt_id"),
        user_id=alert_in.get("user_id"),
        message=alert_in.get("message")
    )
    db.add(db_alert)
    await db.commit()
    await db.refresh(db_alert)
    return db_alert


@router.get("/activity")
async def get_formatted_activity(db: AsyncSession = Depends(get_db), limit: int = 10):
    query = select(Attempt, User.name, Test.name).join(User, Attempt.user_id == User.id).join(Test, Attempt.test_id == Test.id).order_by(desc(Attempt.started_at)).limit(limit)
    result = await db.execute(query)
    
    activity = []
    for attempt, user_name, test_name in result:
        activity.append({
            "id": str(attempt.id),
            "message": f"User {user_name} started exam '{test_name}'",
            "timestamp": attempt.started_at.isoformat() if attempt.started_at else datetime.now().isoformat()
        })
    return activity

@router.get("/upcoming-exams")
async def get_upcoming_exams(db: AsyncSession = Depends(get_db), limit: int = 5):
    now = datetime.now()
    # Query sessions available in the future
    # If no sessions are found, we can return some available tests as a fallback or empty list
    query = (
        select(Session, Test.name)
        .join(Test, Session.test_id == Test.id)
        .where(Session.available_from > now)
        .order_by(Session.available_from)
        .limit(limit)
    )
    result = await db.execute(query)
    rows = result.all()
    
    exams = []
    if rows:
        for session, test_name in rows:
            exams.append({
                "id": str(session.id),
                "title": test_name + " (Session)",
                "date": session.available_from.isoformat(),
                "candidates": session.seats or 0 
            })
    else:
        # Fallback: Just return some available tests as 'upcoming' for demo if no specific schedule
        # Logic: Tests created recently? Or just available tests?
        # Let's return tests created recently
        query_tests = select(Test).where(Test.status == 'available').order_by(desc(Test.created_at)).limit(limit)
        res_tests = await db.execute(query_tests)
        tests = res_tests.scalars().all()
        for t in tests:
             exams.append({
                "id": str(t.id),
                "title": t.name,
                "date": t.created_at.isoformat() if t.created_at else now.isoformat(),
                "candidates": 0 # Count candidates assigned?
            })

    return exams


@router.get("/users")
async def get_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.id))
    users = result.scalars().all()
    
    # Format for frontend
    formatted_users = []
    for u in users:
        role_display = u.role.capitalize() if u.role else "User"
        if u.role == "candidate":
            role_display = "User"
            
        formatted_users.append({
            "id": str(u.id),
            "username": u.name,
            "email": u.email,
            "role": role_display, 
            "status": "Active",
            "lastActive": u.created_at.strftime('%Y-%m-%d %H:%M') if u.created_at else "Never"
        })
    return formatted_users

@router.post("/users")
async def create_user(user_in: dict, db: AsyncSession = Depends(get_db)):
    # Simple creation for admin panel
    from app.core.security import get_password_hash
    
    hashed_password = get_password_hash("password123") # Default password
    db_user = User(
        name=user_in.get("username"),
        email=user_in.get("email"),
        password_hash=hashed_password,
        role=user_in.get("role", "candidate").lower()
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    
    return {
        "id": str(db_user.id),
        "username": db_user.name,
        "email": db_user.email,
        "role": db_user.role,
        "status": "Active",
        "lastActive": "Just now"
    }

@router.delete("/users/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Also delete related attempts and alerts if needed, or rely on cascade
    await db.delete(user)
    await db.commit()
    return {"message": "User deleted successfully"}

