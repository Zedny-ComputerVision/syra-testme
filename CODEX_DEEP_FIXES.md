# CODEX DEEP FIXES — Critical Bugs Found in Deep Audit

Run as two sequential prompts.

---

## PHASE A — CRITICAL + HIGH PRIORITY BUGS

```
You are working on a full-stack LMS project.
- Backend: FastAPI + SQLAlchemy at e:\codexxx\backend\src\app\
- Frontend: React 18 + Vite at e:\codexxx\frontend\src\
- Database: PostgreSQL via SQLAlchemy ORM
- Models in: backend/src/app/models/__init__.py

Fix ALL of the following. Do NOT skip any item. Do NOT break existing functionality.

### CRITICAL BUG 1: Fix scoring for ORDERING, MATCHING, and FILLINBLANK question types
File: backend/src/app/api/routes/attempts.py
Function: _evaluate_answer() (around line 317-326)
Problem: All non-MCQ/MULTI/TRUEFALSE types fall through to a simple text comparison:
  is_correct = _normalized_text(submitted_answer) == _normalized_text(expected)
This is WRONG for:
- ORDERING: The submitted answer is a JSON array like ["C","A","B"]. The correct answer is ["A","B","C"]. Text comparison would normalize both to the same string and incorrectly mark them equal. Should compare arrays element-by-element in order.
- MATCHING: The submitted answer is a JSON object like {"1":"B","2":"A"}. The correct answer is {"1":"A","2":"B"}. Text comparison of serialized JSON is unreliable due to key ordering. Should compare key-value pairs.
- FILLINBLANK: The submitted answer may have multiple blanks. Should compare each blank's value individually, case-insensitively.

Fix: Replace the else branch in _evaluate_answer() with type-specific logic:

For ORDERING:
  - Parse both submitted and expected as JSON arrays (they should be lists)
  - Compare element by element: is_correct = (submitted_list == expected_list)
  - Handle case where submitted or expected is a string (try json.loads)
  - Normalize each element (strip whitespace, lowercase)

For MATCHING:
  - Parse both as JSON objects/dicts
  - Compare key-value pairs: for each key in expected, check submitted[key] matches
  - Normalize values (strip, lowercase)
  - is_correct = all pairs match

For FILLINBLANK:
  - Parse both as JSON arrays or pipe-separated strings
  - Compare each blank individually, case-insensitively
  - is_correct = all blanks match

For TEXT:
  - Keep existing text comparison but make it case-insensitive and strip whitespace
  - If expected answer is empty/null, mark for manual review instead of auto-scoring

Add try/except around JSON parsing — if parsing fails, fall back to text comparison.
Make sure to handle the case where submitted_answer or expected answer is None or empty string.

### CRITICAL BUG 2: Save evidence for CRITICAL severity proctoring events
File: backend/src/app/api/routes/proctoring.py
Problem: Around line 709, evidence is only saved when severity == SeverityEnum.HIGH. CRITICAL events should ALSO save evidence.
Fix: Change the condition from:
  if severity == SeverityEnum.HIGH:
To:
  if severity in (SeverityEnum.HIGH, SeverityEnum.CRITICAL):
Or use:
  if severity in {SeverityEnum.HIGH, SeverityEnum.CRITICAL}:

### CRITICAL BUG 3: Make login email case-insensitive
File: backend/src/app/api/routes/auth.py
Problem: Around line 150, login queries the user by email as-is (case-sensitive). But signup lowercases the email. So users who type their email with different casing can't log in.
Fix: Lowercase the email before querying:
  email = body.email.strip().lower()
  user = db.scalar(select(User).where(User.email == email))
Apply the same lowercasing in:
  - POST /forgot-password (where it looks up user by email)
  - POST /refresh (if it uses email)
  - Any other endpoint that queries by email

### CRITICAL BUG 4: Auto-score non-text questions even when text questions need manual review
File: backend/src/app/api/routes/attempts.py
Function: _auto_score_attempt() (around line 415-418)
Problem: If ANY question needs manual review (TEXT type), the function returns score=None for the ENTIRE test. This means MCQ/TRUEFALSE/MULTI questions that were auto-scored are thrown away.
Fix: Change the return logic:
  - Always compute the auto-scorable portion
  - total_auto_points = sum of points for auto-scorable questions
  - earned_auto_points = sum of points earned for auto-scorable questions
  - If pending_manual_review is True:
    - Set attempt.score to (earned_auto_points / total_points * 100) as a PARTIAL score
    - Set a flag like attempt.needs_manual_review = True (or use existing mechanism)
    - Return {"score": partial_score, "grade": None, "pending_manual_review": True}
  - The final score will be updated when admin manually grades the remaining questions
  - Make sure the admin manual grading endpoint recalculates total score including both auto and manual portions

### CRITICAL BUG 5: Fix datetime-local timezone handling in AdminTestingSessions
File: frontend/src/pages/Admin/AdminTestingSessions/AdminTestingSessions.jsx
Problem: Lines 180-182 convert scheduled_at to datetime-local input value using:
  new Date(session.scheduled_at).toISOString().slice(0, 16)
This shows UTC time, not the user's local time. Users see the wrong time when editing.
Fix: Create a helper function to convert UTC ISO string to local datetime-local value:
  function utcToLocalDatetimeInput(utcString) {
    const date = new Date(utcString)
    const offset = date.getTimezoneOffset()
    const local = new Date(date.getTime() - offset * 60000)
    return local.toISOString().slice(0, 16)
  }
Use this when populating the edit form's datetime-local input.

### CRITICAL BUG 6: Fix same timezone bug in AdminCandidates reschedule
File: frontend/src/pages/Admin/AdminCandidates/AdminCandidates.jsx
Problem: Line 346 sends rescheduleDate to API as:
  scheduled_at: new Date(rescheduleDate).toISOString()
The datetime-local input gives local time, but new Date() interprets it as UTC, causing offset.
Fix: The datetime-local input value is already in local time. When creating the Date object, it should be interpreted as local time (which JavaScript's Date constructor does for strings without timezone). Actually, check the exact behavior:
  - "2026-03-15T10:00" → new Date("2026-03-15T10:00") → interpreted as LOCAL time → .toISOString() converts to UTC
  - This IS correct behavior. The issue might be the reverse direction (displaying).
  - If the display side (showing existing scheduled_at in the input) uses the same toISOString trick, fix it with the same utcToLocalDatetimeInput helper.
Check both directions (display and save) and fix whichever is wrong.

### HIGH BUG 7: Prevent scheduling in the past
File: backend/src/app/api/routes/schedules.py
Problem: Around line 109, no validation that scheduled_at is in the future.
Fix: After parsing the body, before creating the schedule:
  if body.scheduled_at and body.scheduled_at < datetime.now(timezone.utc):
      raise HTTPException(status_code=422, detail="Cannot schedule in the past")
Allow a small grace period (e.g., 1 minute) to account for network latency:
  if body.scheduled_at and body.scheduled_at < datetime.now(timezone.utc) - timedelta(minutes=1):
      raise HTTPException(status_code=422, detail="Cannot schedule in the past")

### HIGH BUG 8: Fix violation toast spam in Proctoring
File: frontend/src/pages/Proctoring/Proctoring.jsx
Problem: Around lines 480-488, the useEffect that shows violation toasts re-runs whenever dependencies change, showing the same toast again for the same blur count.
Fix: Track the last-shown blur count in a ref:
  const lastToastBlurs = useRef(0)
  useEffect(() => {
    if (tabBlurs > 0 && tabBlurs !== lastToastBlurs.current && proctorCfg.tab_switch_detect) {
      lastToastBlurs.current = tabBlurs
      setToast({ severity: 'warning', detail: `Tab switches: ${tabBlurs}` })
    }
  }, [tabBlurs, proctorCfg.tab_switch_detect])

### HIGH BUG 9: Await handleSubmit in timer auto-submit
File: frontend/src/pages/Proctoring/Proctoring.jsx
Problem: Around line 401, handleSubmit() is called inside setInterval without await. It's async and may not complete before the component unmounts.
Fix: This is tricky because setInterval callbacks can't be async. Instead, set a flag and handle submission outside the interval:
  Option A: Use a ref flag:
    const timerExpiredRef = useRef(false)
    // In the interval:
    if (prev <= 1) {
      clearInterval(interval)
      timerExpiredRef.current = true
      return 0
    }
    // Separate useEffect:
    useEffect(() => {
      if (timeLeft === 0 && timerExpiredRef.current) {
        timerExpiredRef.current = false
        handleSubmit()
      }
    }, [timeLeft, handleSubmit])
  Option B: Just call handleSubmit directly (current approach). Since handleSubmit sets state that triggers navigation, it will work even without await in most cases. The real risk is if the component unmounts before the API call resolves. Since React doesn't cancel state updates on unmount (it just warns), this is LOW risk. If you want to be safe, use Option A.
  Choose whichever is simpler.

### HIGH BUG 10: Fix ALT_TAB detection logic
File: backend/src/app/api/routes/proctoring.py
Problem: Around line 332, the event type selection logic is:
  if not focus or visibility != "visible":
      events.append(("ALT_TAB" if blurs else "FOCUS_LOSS", ...))
This means if focus=False and blurs=0, it reports FOCUS_LOSS. If focus=False and blurs>0, it reports ALT_TAB. But blurs is cumulative (total count), not a flag for the current event. So once blurs > 0 from a previous event, ALL subsequent focus losses are labeled ALT_TAB.
Fix: Change the logic to:
  - Use the CHANGE in blur count, not the total
  - Or use the body parameter to distinguish: if the client sends a "blur" flag for this specific ping, use ALT_TAB. Otherwise use FOCUS_LOSS.
  - Simplest fix: Check if blurs > previous_blurs (store previous in the session/attempt state)
  - If that's too complex, just always use "FOCUS_LOSS" as the event type and let the frontend distinguish tab switches. The event_type is mainly for logging.

Do NOT break any existing functionality. Test each fix mentally for edge cases.
```

---

## PHASE B — MEDIUM PRIORITY FIXES

```
You are working on a full-stack LMS project.
- Backend: FastAPI + SQLAlchemy at e:\codexxx\backend\src\app\
- Frontend: React 18 + Vite at e:\codexxx\frontend\src\

Fix ALL of the following:

### FIX 1: Clear fullscreenResumeNeeded on invalid file upload
File: frontend/src/pages/VerifyIdentityPage/VerifyIdentityPage.jsx
Problem: Around lines 233-235, fullscreenResumeNeeded is set to true BEFORE checking if the uploaded file is valid. If file validation fails, the flag stays true and shows "Return to fullscreen" warning incorrectly.
Fix: Move the file type validation BEFORE setting fullscreenResumeNeeded. Or clear the flag in the error branch:
  if (!file.type.startsWith('image/')) {
    setError('Please upload an image file')
    setFullscreenResumeNeeded(false)  // Clear the flag
    return
  }

### FIX 2: Check identity prerequisite BEFORE resolving attempt in RulesPage
File: frontend/src/pages/RulesPage/RulesPage.jsx
Problem: Around line 107, resolveAttempt(testId) is called BEFORE checking if identity verification is complete. This creates an orphaned attempt if identity verification is required but not done.
Fix: Reorder the logic:
  1. First check if identity verification is required (from exam config)
  2. If required and not verified, navigate to verify-identity page WITHOUT calling resolveAttempt
  3. Only call resolveAttempt AFTER all prerequisites are confirmed met
  Read the current code carefully to understand the exact flow before modifying.

### FIX 3: Check for active attempts before deleting schedule
File: backend/src/app/api/routes/schedules.py
Problem: Around line 186, schedule is deleted without checking if the user has an IN_PROGRESS attempt for the scheduled test.
Fix: Before deleting, check:
  active_attempt = db.scalar(
      select(Attempt.id).where(
          Attempt.exam_id == schedule.exam_id,
          Attempt.user_id == schedule.user_id,
          Attempt.status == AttemptStatus.IN_PROGRESS
      ).limit(1)
  )
  if active_attempt:
      raise HTTPException(status_code=409, detail="Cannot delete schedule while user has an active attempt")

### FIX 4: Normalize ID text storage format
File: backend/src/app/api/routes/precheck.py
Problem: Around lines 392-402, the id_text stored in the attempt has two different shapes depending on whether manual or OCR was used.
Fix: Normalize to a consistent format:
  attempt.id_text = {
      "lines": ocr_text.get("lines", []) if ocr_text else [],
      "ocr_candidates": ocr_candidates,
      "manual": manual_token or None,
      "method": "manual" if manual_token else "ocr",
      "raw_text": ocr_text.get("text", "") if ocr_text else "",
  }
Apply this same structure regardless of manual or OCR path.

### FIX 5: Show "Pending Review" instead of "Pass" for score 0 with no passing_score
File: frontend/src/pages/AttemptResult/AttemptResult.jsx
Problem: Around line 384, when passingScore is null and score is 0, it shows "Pass" which is confusing.
Fix: Add a special case:
  - If passingScore is null AND score is 0 AND attempt has pending manual review, show "Pending Review"
  - If passingScore is null AND score > 0, show the existing grade labels (Excellent/Very Good/Good/Pass)
  - If passingScore is null AND score is 0 AND no pending review, show "Completed" instead of "Pass"
Check if the attempt object has a flag like needs_manual_review or pending_manual_review. If so, use it. If not, check if score is null (null score = pending review).

Do NOT break any existing functionality. Keep changes minimal and focused.
```

---

## SUMMARY

| Phase | Items | Focus |
|-------|-------|-------|
| A | 10 fixes | 4 critical scoring/security bugs + 6 high-priority UX/logic bugs |
| B | 5 fixes | Medium-priority edge cases and UX improvements |

Total: 15 fixes across 2 prompts.

### Priority order within Phase A:
1. BUG 1 (scoring) — most critical, wrong grades being assigned
2. BUG 3 (login case) — users locked out
3. BUG 4 (auto-score) — tests with text Qs show no score
4. BUG 2 (evidence) — critical events lose evidence
5. BUG 5+6 (timezone) — wrong scheduling times
6. BUG 7 (past dates) — data integrity
7. BUG 8-10 (proctoring UX) — user experience
