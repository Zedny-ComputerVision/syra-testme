# CODEX FINAL FIXES — All Remaining Bugs, Incomplete Logic & Code Quality

Run these as two sequential Codex prompts. Phase A fixes bugs and logic. Phase B fixes code quality and adds missing audit/notification coverage.

---

## PHASE A — BUGS + INCOMPLETE LOGIC

```
You are working on a full-stack LMS project.
- Backend: FastAPI + SQLAlchemy at e:\codexxx\backend\src\app\
- Frontend: React 18 + Vite at e:\codexxx\frontend\src\
- Auth: JWT tokens, deps.py has get_current_user(), require_role(), require_permission()
- Audit logging: write_audit_log(db, user, action, resource_type, resource_id, detail, ip_address) in services/audit.py
- Notifications: notify_user(db, user_id, title, body, link) in services/notifications.py

Fix ALL of the following. Do NOT skip any item. Do NOT break existing functionality.

### BUG 1: useUnsavedChanges violates Rules of Hooks
File: frontend/src/hooks/useUnsavedChanges.js
Problem: useBlocker is called conditionally inside a try-catch block (lines 7-10). React hooks MUST be called unconditionally on every render.
Fix: Call useBlocker unconditionally. Pass the isDirty boolean directly as the argument:
  const blocker = useBlocker(isDirty)
Remove the try-catch around it entirely. If useBlocker is not available in the installed react-router-dom version, use a fallback approach:
  - Use useEffect with window.addEventListener('beforeunload') for tab close
  - Use useNavigate + window.confirm for route changes
Do NOT wrap hooks in try-catch blocks.

### BUG 2: Proctoring timer has stale closure
File: frontend/src/pages/Proctoring/Proctoring.jsx
Problem: Around lines 233-246, handleSubmit is called inside a setInterval callback but is NOT in the useEffect dependency array. When the timer hits zero, the old version of handleSubmit (with stale state) will be called.
Fix: Add handleSubmit to the useEffect dependency array. Make sure handleSubmit is wrapped in useCallback (it likely already is). The dependency array should be:
  [timeLeft !== null, handleSubmit]
If handleSubmit is not already wrapped in useCallback, wrap it.

### BUG 3: nodes.py passes invalid parameter
File: backend/src/app/api/routes/nodes.py
Problem: Line 33 calls parse_uuid_param(course_id, detail="Invalid course_id", status_code=422) but parse_uuid_param() in deps.py does NOT accept a status_code parameter.
Fix: Read the parse_uuid_param() function signature in deps.py. Remove the status_code parameter from the call. Use only the parameters that parse_uuid_param actually accepts. Check ALL calls to parse_uuid_param in nodes.py and fix any other invalid parameter usage.

### BUG 4: Async email functions not properly awaited in BackgroundTasks
File: backend/src/app/api/routes/auth.py
Problem: Lines 90, 122, 225, 241 pass async functions (send_welcome_email, send_admin_setup_email, send_password_changed_email, send_password_reset_email) to BackgroundTasks.add_task(). FastAPI's BackgroundTasks may not properly await async functions, causing silent email failures.
Fix: Create synchronous wrapper functions that call asyncio.run() on the async email functions:
  def _bg_send_welcome_email(email, name):
      import asyncio
      asyncio.run(send_welcome_email(email, name))
Pass these sync wrappers to background_tasks.add_task() instead of the async functions directly.
Alternative: If the email functions don't actually need to be async (they use httpx or aiosmtplib), check if they can be made synchronous. If they use requests/smtplib (sync libraries), just remove the async keyword from them.
Choose whichever approach is simpler. The goal is that emails actually get sent.

### FIX 5: Wire up notify_proctoring_event (currently dead code)
File: backend/src/app/api/routes/proctoring.py
File: backend/src/app/services/notifications.py
Problem: notify_proctoring_event() is defined in notifications.py but never called. When proctoring detects violations (face not detected, multiple faces, tab switch, etc.), the ProctoringEvent is saved to DB but the user is never notified.
Fix: In proctoring.py, after a ProctoringEvent is created and committed to DB, call notify_proctoring_event() if the event severity is "high" or "critical". Find where ProctoringEvent objects are created (likely in the WebSocket handler or detection callback) and add the call there. Only notify for serious violations — do NOT notify for every low-severity ping.

### FIX 6: Auto-submit from proctoring needs notification + audit log
File: backend/src/app/api/routes/proctoring.py
Problem: Around lines 202-207, when an attempt is force-submitted because alert_count >= max_alerts, the attempt status is set to SUBMITTED but:
  - No notification is sent to the user
  - No audit log entry is created
Fix: After setting attempt.status to SUBMITTED:
  1. Call notify_user(db, attempt.user_id, "Exam Auto-Submitted", f"Your attempt for '{attempt.exam.title}' was auto-submitted due to multiple proctoring violations.", f"/attempts/{attempt.id}")
  2. Call write_audit_log(db, current_user_or_system, "ATTEMPT_AUTO_SUBMITTED", "attempt", str(attempt.id), f"Auto-submitted due to {alert_count} violations", request_ip)
If there's no current_user available in the WebSocket context, use None or a system user for the audit log.

### FIX 7: Silent exception swallowing in proctoring
File: backend/src/app/api/routes/proctoring.py
Problem: Lines 250-251 have bare `except Exception: pass` that catches ALL errors silently.
Fix: Change to catch only the expected exception types (AttributeError, TypeError) and log unexpected exceptions:
  except (AttributeError, TypeError):
      pass
  except Exception as exc:
      logger.warning("Unexpected error in proctoring event dedup: %s", exc)

### FIX 8: Dashboard loads all exams into memory
File: backend/src/app/api/routes/dashboard.py
Problem: Line 67 does `db.scalars(select(Exam)).all()` then filters in Python with list comprehension.
Fix: Add a WHERE clause to the query to filter out pool-library exams at the database level. Pool library exams have settings JSON containing "_pool_library" key. Use a SQL filter:
  For PostgreSQL: .where(~Exam.settings.has_key("_pool_library"))
  For SQLite: .where(~func.json_extract(Exam.settings, "$._pool_library").isnot(None))
  Or use a simpler approach: .where(Exam.status != "HIDDEN") if pool-library exams use a HIDDEN status.
Check how _is_pool_library_exam() works and replicate that logic in SQL.

### FIX 9: GDPR export N+1 query
File: backend/src/app/api/routes/gdpr.py
Problem: Line 57 iterates attempt.events without eager loading, causing N+1 queries.
Fix: When querying attempts for the GDPR export, add joinedload for events:
  from sqlalchemy.orm import joinedload
  attempts = db.scalars(
      select(Attempt)
      .where(Attempt.user_id == user.id)
      .options(joinedload(Attempt.events), joinedload(Attempt.exam))
  ).unique().all()

### FIX 10: Test duplication needs transaction safety
File: backend/src/app/modules/tests/routes_admin.py
Problem: Lines 643-689 duplicate a test with multiple DB operations (create exam, add questions, mutate metadata) without explicit transaction handling. If one operation fails midway, orphaned records are left.
Fix: Wrap the duplication logic in a try/except block. If any step fails, call db.rollback() and raise an HTTPException. The session should already be in a transaction from the route handler, so just make sure errors trigger rollback:
  try:
      # ... existing duplication logic ...
      db.commit()
  except Exception as exc:
      db.rollback()
      logger.error("Test duplication failed: %s", exc)
      raise HTTPException(status_code=500, detail="Failed to duplicate test")

### FIX 11: Notification persistence error handling
File: backend/src/app/services/notifications.py
Problem: notify_user() does db.add() + db.commit() with no error handling. If commit fails, the notification is silently lost.
Fix: Wrap in try/except:
  def notify_user(db, user_id, title, body, link=None):
      try:
          notification = Notification(user_id=user_id, title=title, body=body, link=link)
          db.add(notification)
          db.commit()
          return True
      except Exception as exc:
          db.rollback()
          logger.warning("Failed to persist notification for user %s: %s", user_id, exc)
          return False
Do the same for notify_proctoring_event().

Do NOT add any new features. Only fix the bugs and incomplete logic listed above.
```

---

## PHASE B — AUDIT LOGGING COVERAGE + CODE QUALITY

```
You are working on a full-stack LMS project.
- Backend: FastAPI + SQLAlchemy at e:\codexxx\backend\src\app\
- Frontend: React 18 + Vite at e:\codexxx\frontend\src\
- Audit logging: write_audit_log(db, user, action, resource_type, resource_id, detail, ip_address) in services/audit.py. Check the exact function signature before calling it.
- Notifications: notify_user(db, user_id, title, body, link) in services/notifications.py

Fix ALL of the following. Do NOT skip any item. Do NOT break existing functionality.

### FIX 1: Add audit logging to test CRUD operations
File: backend/src/app/modules/tests/routes_admin.py
Problem: Create test (line ~491), update test (line ~548), duplicate test (line ~643), and delete test (line ~752) do NOT call write_audit_log(). Only publish/archive operations log.
Fix: Add write_audit_log() calls to these 4 endpoints:
  - POST /admin/tests/ (create): action="TEST_CREATED", resource_type="test", detail=f"Created test: {exam.title}"
  - PATCH /admin/tests/{test_id} (update): action="TEST_UPDATED", resource_type="test", detail=f"Updated test: {exam.title}"
  - POST /admin/tests/{test_id}/duplicate: action="TEST_DUPLICATED", resource_type="test", detail=f"Duplicated test: {source.title} -> {new_exam.title}"
  - DELETE /admin/tests/{test_id}: action="TEST_DELETED", resource_type="test", detail=f"Deleted test: {exam.title}"
Use the same pattern as the existing publish/archive audit log calls in the same file. Make sure to pass the request IP if available.

### FIX 2: Add audit logging to categories CRUD
File: backend/src/app/api/routes/categories.py
Problem: No audit logging for create, update, or delete operations.
Fix: Add write_audit_log() calls to:
  - POST / (create): action="CATEGORY_CREATED"
  - PUT /{id} or PATCH /{id} (update): action="CATEGORY_UPDATED"
  - DELETE /{id}: action="CATEGORY_DELETED"
Import write_audit_log from services/audit.py. Follow the same pattern used in other route files.

### FIX 3: Add audit logging to grading scales CRUD
File: backend/src/app/api/routes/grading_scales.py
Problem: No audit logging for create, update, or delete operations.
Fix: Same pattern as FIX 2:
  - POST /: action="GRADING_SCALE_CREATED"
  - PUT /{id} or PATCH /{id}: action="GRADING_SCALE_UPDATED"
  - DELETE /{id}: action="GRADING_SCALE_DELETED"

### FIX 4: Add audit logging to question pools CRUD
File: backend/src/app/api/routes/question_pools.py
Problem: No audit logging for create, update, or delete operations.
Fix: Same pattern:
  - POST /: action="QUESTION_POOL_CREATED"
  - PUT /{id} or PATCH /{id}: action="QUESTION_POOL_UPDATED"
  - DELETE /{id}: action="QUESTION_POOL_DELETED"

### FIX 5: Notify scheduled users when test is deleted
File: backend/src/app/modules/tests/routes_admin.py
Problem: When a test is deleted, users who are scheduled for it get no notification.
Fix: In the DELETE endpoint, before deleting the exam:
  1. Query all schedules for this exam: schedules = db.scalars(select(Schedule).where(Schedule.exam_id == exam.id)).all()
  2. For each schedule with a user_id, call notify_user(db, schedule.user_id, "Test Cancelled", f"The test '{exam.title}' has been removed.", "/schedule")
  3. Then proceed with the existing delete logic.
Import Schedule model and notify_user if not already imported.

### FIX 6: Fix Navbar useEffect cleanup pattern
File: frontend/src/components/Navbar/Navbar.jsx
Problem: Lines 58-60 use `() => () => {}` pattern which is actually VALID JavaScript (arrow function returning arrow function). However, verify this is correct. If the intent is cleanup, this IS the correct shorthand for:
  useEffect(() => {
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current) }
  }, [])
Read the actual code. If the pattern is `useEffect(() => () => { cleanup }, [])` then it IS correct — the outer arrow returns the inner arrow as the cleanup function. Leave it unchanged if so. Only fix if the return is genuinely wrong.

### FIX 7: Remove setUser from AuthContext useMemo deps
File: frontend/src/context/AuthContext.jsx
Problem: Line 237 includes setUser in useMemo dependency array. setState functions from useState are guaranteed stable by React and should not be in dependency arrays.
Fix: Remove setUser from the dependency array. Keep all other dependencies.

### FIX 8: Remove dead legacy report methods
File: frontend/src/services/admin.service.js
Problem: Lines 8-9 define downloadLegacyExamReportCsv and downloadLegacyExamReportPdf (or similar legacy method names) that are never called anywhere.
Fix: Search the entire frontend/src/ directory for any usage of these method names. If they are truly never imported or called, remove them from the service file.

### FIX 9: Fix obfuscated import in admin_settings
File: backend/src/app/api/routes/admin_settings.py
Problem: Line 177 uses `__import__("json").loads(body.value)` instead of standard import.
Fix: Add `import json` at the top of the file (if not already there). Replace `__import__("json").loads(...)` with `json.loads(...)`.

### FIX 10: Validate proctoring orchestrator config
File: backend/src/app/detection/orchestrator.py
Problem: Around lines 40-100, the config dict is accepted without validation. Invalid thresholds, negative values, or missing keys cause silent failures.
Fix: At the start of the orchestrator initialization (or wherever config is first used), add basic validation:
  - Ensure required keys exist (check what keys the orchestrator expects — read the code)
  - Ensure numeric thresholds are positive numbers
  - Ensure confidence values are between 0 and 1 (if applicable)
  - If validation fails, log a warning and use sensible defaults instead of crashing
Keep validation minimal — just check types and ranges for the keys that are actually used.

### FIX 11: Add Proctoring event notification for high-severity events
File: backend/src/app/api/routes/proctoring.py
Problem: When proctoring detects critical violations, ProctoringEvent is saved but no admin notification is created for monitoring.
Fix: After creating a ProctoringEvent with severity "high" or "critical":
  - Create a notification for all admin users who have the "View Attempt Analysis" permission (or just the test creator/proctor if available)
  - Use a simple approach: query users with admin role, then call notify_user for each
  - Limit to max 1 notification per event type per attempt per 5 minutes to avoid flooding
  - If this is too complex, at minimum log the event at WARNING level so it appears in server logs

Do NOT add any new features beyond what's listed. Keep changes minimal and focused.
```

---

## QUICK REFERENCE

| Phase | Items | Focus |
|-------|-------|-------|
| A | 11 fixes | 4 bugs (hooks, stale closure, TypeError, async email) + 7 incomplete logic (notifications, audit, exceptions, queries, transactions) |
| B | 11 fixes | 5 audit logging gaps + 2 notification gaps + 4 code quality cleanups |

Total: 22 fixes across 2 prompts.

After both phases, the remaining work is ONLY test coverage (writing more backend unit tests and e2e tests for new features). No more logic bugs or incomplete implementations.
