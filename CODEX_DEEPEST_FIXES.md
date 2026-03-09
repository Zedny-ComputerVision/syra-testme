# CODEX DEEPEST FIXES — Every Remaining Bug From Line-by-Line Audit

Run as 3 sequential prompts: Phase A (critical), Phase B (high), Phase C (medium + CSS).

---

## PHASE A — CRITICAL BUGS

```
You are working on a full-stack LMS project.
- Backend: FastAPI + SQLAlchemy at e:\codexxx\backend\src\app\
- Frontend: React 18 + Vite at e:\codexxx\frontend\src\
- Detection engine: e:\codexxx\backend\src\app\detection\

Fix ALL of the following. Do NOT skip any. Do NOT break existing functionality.

### FIX 1: Create missing Auth page SCSS files
Problem: 4 auth pages import .module.scss files that don't exist, causing runtime crashes.
Check if these pages share a common SCSS file (like AuthPages.module.scss). If they do, verify the import path is correct. If they each import their own .module.scss:
- Create frontend/src/pages/Auth/ChangePassword.module.scss (or fix the import to use a shared auth styles file)
- Create frontend/src/pages/Auth/ForgotPassword.module.scss (or fix import)
- Create frontend/src/pages/Auth/ResetPassword.module.scss (or fix import)
- Create frontend/src/pages/Auth/SignUp.module.scss (or fix import)
Read each JSX file first to see what style classes they reference (styles.xxx), then create the SCSS with those classes. Use CSS variables (--color-text, --color-surface, --color-border, --color-primary, --radius) for all colors. Match the Login page styling.

### FIX 2: hasPermission returns true for undefined feature
File: frontend/src/utils/permissions.js
Problem: Line 63 returns true when feature is undefined/null:
  if (!feature) return true
This means any component that accidentally passes undefined as the feature grants full access.
Fix: Change to:
  if (!feature) return false
Then search the ENTIRE frontend codebase for all calls to hasPermission(). Make sure none of them intentionally pass undefined/null expecting true. If any do (like a "no permission required" route), those callers should be updated to NOT call hasPermission at all, or pass a specific feature name.

### FIX 3: Add CASCADE on Question.pool_id foreign key
File: backend/src/app/models/__init__.py
Problem: Line 208, Question.pool_id FK is missing ondelete="CASCADE". Deleting a QuestionPool leaves orphaned questions.
Fix: Change:
  pool_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("question_pools.id"))
To:
  pool_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("question_pools.id", ondelete="SET NULL"))
Use SET NULL instead of CASCADE because questions in a pool might also belong to exams. Setting pool_id to NULL just unlinks them from the pool without deleting them.
Generate an Alembic migration for this change.

### FIX 4: Add thread safety to detection engine
Files: backend/src/app/detection/orchestrator.py and all detector files
Problem: All detectors use module-level singleton instances. When multiple WebSocket connections process frames concurrently, shared state is corrupted (alert_count, _consecutive_count, _disappeared_since, etc.)
Fix: The orchestrator already creates detector instances per-orchestrator (check the __init__ method). The issue is the MODULE-LEVEL singleton instances (e.g., _detector = FaceDetector() at module level).
Option A (Preferred): Remove all module-level singleton detector instances. Each ProctoringOrchestrator should create its OWN detector instances in __init__. This isolates state per WebSocket connection.
Option B: Add threading.Lock() to each detector's process() method to serialize access. This is simpler but slower.
Choose Option A. Read each detector file (face_detection.py, multi_face.py, eye_tracking.py, head_pose.py, mouth_detection.py, object_detection.py, audio_detection.py, face_verification.py) and:
  1. Remove the module-level singleton instance (e.g., _detector = FaceDetector())
  2. Remove the module-level convenience function that uses it
  3. Make sure ProctoringOrchestrator creates instances in __init__
  4. Each orchestrator instance should have its OWN detector instances
Keep YOLO and MediaPipe model loading cached at module level (they're read-only and thread-safe). Only the state-tracking objects need per-instance isolation.

### FIX 5: Reset AlertLogger cooldown state
File: backend/src/app/detection/alert_logger.py
Problem: Lines 36-39, drain() returns buffered alerts but doesn't clear _last_fired timestamps. Cooldowns persist indefinitely within an AlertLogger instance. If an orchestrator is reused across attempts, old cooldowns affect new attempts.
Fix: Add _last_fired clearing to drain():
  def drain(self):
      alerts = list(self._buffer)
      self._buffer.clear()
      self._last_fired.clear()  # Add this line
      return alerts
Or provide a reset() method that clears both _buffer and _last_fired, and call it when starting a new attempt.

Do NOT break existing proctoring functionality. The detection engine must still work correctly after these changes.
```

---

## PHASE B — HIGH PRIORITY BUGS

```
You are working on a full-stack LMS project.
- Backend: FastAPI + SQLAlchemy at e:\codexxx\backend\src\app\
- Frontend: React 18 + Vite at e:\codexxx\frontend\src\
- Detection engine: e:\codexxx\backend\src\app\detection\

Fix ALL of the following:

### FIX 1: Fix cosine_distance math in face_verification.py
File: backend/src/app/detection/face_verification.py
Problem: Line 51 returns 1.0 - dot_product/denom which can be negative (when vectors are anti-aligned) or > 1.0. Distance should always be 0-1.
Fix: Change to:
  return max(0.0, min(1.0, 1.0 - dot_product / denom))
Or use numpy:
  return float(np.clip(1.0 - dot_product / denom, 0.0, 1.0))

### FIX 2: Fix face_verification _mismatching flag
File: backend/src/app/detection/face_verification.py
Problem: Line 106 unconditionally sets self._mismatching = False after every frame, even if the face doesn't match. This prevents tracking multi-frame mismatches.
Fix: Only reset _mismatching when face actually matches:
  Read the logic carefully. The flag should be:
  - Set to True when distance > threshold (mismatch detected)
  - Set to False when distance <= recovery_threshold (face matches again)
  - Stay True between frames if mismatch persists
  Find line 106 and move the _mismatching = False into the recovery branch only.

### FIX 3: Fix multi_face division by zero
File: backend/src/app/detection/multi_face.py
Problem: Line 49 does sum(confidences) / face_count. If confidences list is empty but face_count > 0, this is 0/N which is fine (= 0). But if face_count is 0 and confidences is not empty (shouldn't happen but defensive), it's division by zero.
Fix: Add a guard:
  avg_conf = sum(confidences) / face_count if face_count > 0 else 0.0
Or simply:
  avg_conf = sum(confidences) / max(face_count, 1)

### FIX 4: Fix eye_tracking off-by-one
File: backend/src/app/detection/eye_tracking.py
Problem: Lines 106-110, the stability check requires previous frame data (_prev_left_pitch is not None). The first bad frame always passes because there's no previous data to compare against. This means you need consecutive_threshold + 1 actual violations to trigger an alert.
Fix: Skip the stability check on the first frame:
  if self._prev_left_pitch is None:
      # First frame - accept it without stability check
      self._consecutive_away += 1
  elif self._is_stable():
      self._consecutive_away += 1
  else:
      self._consecutive_away = 0

### FIX 5: Add logging for detection model failures
Files: All detector files in backend/src/app/detection/
Problem: When YOLO model is unavailable (face_detection.py line 24-26), or MediaPipe is unavailable (eye_tracking.py, head_pose.py, mouth_detection.py), the detector silently returns None. No logging, no warning.
Fix: In each detector, when model/mesh is unavailable, log a warning the FIRST time only:
  import logging
  logger = logging.getLogger(__name__)

  # In the process method:
  if model is None:
      if not self._warned_unavailable:
          logger.warning("Face detection model unavailable - detection disabled")
          self._warned_unavailable = True
      return None
Add _warned_unavailable = False in __init__ for each detector.

### FIX 6: Wrap localStorage in try-catch in AuthContext
File: frontend/src/context/AuthContext.jsx
Problem: Lines 168, 186, 199, 118 access localStorage without try-catch. In incognito/private browsing, this can throw QuotaExceededError.
Fix: Create a safe wrapper:
  function safeSetItem(key, value) {
    try { localStorage.setItem(key, value) } catch (e) { /* ignore */ }
  }
  function safeRemoveItem(key) {
    try { localStorage.removeItem(key) } catch (e) { /* ignore */ }
  }
Use these wrappers in login(), logout(), updateTokens(), and syncSession().

### FIX 7: Fix downloadResponseFile memory leak
File: frontend/src/utils/downloadResponseFile.js
Problem: Lines 1-8 never call URL.revokeObjectURL() and never remove the <a> element from DOM.
Fix:
  export function downloadResponseFile(response, filename = 'download') {
    try {
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      // Cleanup
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

### FIX 8: Add null check in journeyAttempt.js
File: frontend/src/utils/journeyAttempt.js
Problem: Lines 25-27 access data.id without null check after resolveAttemptRequest().
Fix:
  const { data } = await resolveAttemptRequest(examId)
  if (!data || !data.id) {
    throw new Error('Failed to resolve attempt')
  }
  setAttemptId(data.id)
  return data.id

### FIX 9: Add retry logic for DB on startup
File: backend/src/app/main.py
Problem: Line 264, inspect(engine) crashes if database is unavailable on startup.
Fix: Wrap the Alembic upgrade in a retry loop:
  import time
  def _run_alembic_upgrade() -> None:
      max_retries = 5
      for attempt in range(max_retries):
          try:
              # ... existing logic ...
              return
          except Exception as exc:
              if attempt < max_retries - 1:
                  wait = 2 ** attempt
                  logger.warning("Database not ready, retrying in %ds: %s", wait, exc)
                  time.sleep(wait)
              else:
                  logger.error("Database unavailable after %d retries", max_retries)
                  raise

### FIX 10: Guard PRECHECK_ALLOW_TEST_BYPASS
File: backend/src/app/api/routes/precheck.py
Problem: Lines 34, 303 — if PRECHECK_ALLOW_TEST_BYPASS is True in production, all identity verification is bypassed.
Fix: Add a startup warning and restrict the flag:
  1. In main.py startup, if PRECHECK_ALLOW_TEST_BYPASS is True, log a CRITICAL warning:
     logger.critical("PRECHECK_ALLOW_TEST_BYPASS is enabled - identity verification is disabled!")
  2. In precheck.py, when the bypass is triggered, log a WARNING:
     logger.warning("Identity verification bypassed for attempt %s via test_pass flag", attempt_id)
  3. Consider also checking if E2E_SEED_ENABLED is True as an additional guard (only allow bypass in E2E mode).

Do NOT break existing functionality.
```

---

## PHASE C — MEDIUM PRIORITY + CSS FIXES

```
You are working on a full-stack LMS project.
- Frontend: React 18 + Vite at e:\codexxx\frontend\src\
- Backend: FastAPI at e:\codexxx\backend\src\app\
- CSS: SCSS Modules with CSS variables (--color-text, --color-surface, --color-border, --color-primary, --color-muted, --color-danger, --color-button-text, --radius)

Fix ALL of the following:

### FIX 1: Add recursion depth limit to authenticatedMedia.js
File: frontend/src/utils/authenticatedMedia.js
Problem: Line 31 recursively calls normalizeMediaRequestPath without depth limit.
Fix: Add a depth parameter:
  export function normalizeMediaRequestPath(raw, _depth = 0) {
    if (_depth > 3) return raw  // Prevent infinite recursion
    // ... existing logic ...
    return normalizeMediaRequestPath(normalizedAbsolute, _depth + 1)
  }

### FIX 2: Fix audioCapture.js double-init and error handling
File: frontend/src/utils/audioCapture.js
Problem: Module-level global state allows double initialization. Setup can throw without cleanup.
Fix:
  export async function startAudioCapture(stream, onChunk, intervalMs = 1000) {
    // Stop any existing capture first
    stopAudioCapture()

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      sourceNode = audioCtx.createMediaStreamSource(stream)
      processor = audioCtx.createScriptProcessor(2048, 1, 1)
      // ... rest of setup ...
    } catch (err) {
      stopAudioCapture()  // Clean up partial init
      throw err
    }
    return stopAudioCapture
  }

### FIX 3: Restrict CORS allow_methods
File: backend/src/app/main.py
Problem: Line 217 uses allow_methods=["*"] with allow_credentials=True.
Fix: Change to explicit methods:
  allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

### FIX 4: Use isActive() helper consistently in Sidebar
File: frontend/src/components/Sidebar/Sidebar.jsx
Problem: Line 182 uses raw location.pathname instead of isActive() helper.
Fix: Change:
  active={location.pathname.startsWith('/admin/tests') || location.pathname.startsWith('/admin/exams')}
To:
  active={isActive('/admin/tests') || isActive('/admin/exams')}

### FIX 5: Replace hardcoded #fff button text with CSS variable
Files: Search ALL .module.scss files for color: #fff or color: #ffffff or color: white used on buttons or interactive elements.
Fix: Replace with color: var(--color-button-text) in these files:
  - Navbar.module.scss (badge)
  - Proctoring.module.scss (qNumActive)
  - AdminManageTestPage.module.scss (multiple instances)
  - AdminPageHeader.module.scss
  - ExamInstructions.module.scss
  - ViolationToast.module.scss
  - Loader.module.scss
Do NOT change #fff in background colors or non-text contexts. Only change where it's used as text color on colored/primary buttons.

### FIX 6: Replace hardcoded video background colors
Files:
  - AdminAttemptVideos.module.scss (lines 191, 358)
  - AdminAttemptAnalysis.module.scss (lines 448, 518)
Fix: Replace #0a1226 and #000 with:
  background: var(--color-surface-dark, #0a1226);
Add the CSS variable to your theme definitions if it doesn't exist:
  :root { --color-surface-dark: #0a1226; }
  [data-theme="dark"] { --color-surface-dark: #0d1117; }

### FIX 7: Replace hardcoded accent chip colors in Navbar
File: frontend/src/components/Navbar/Navbar.module.scss
Problem: Lines 212, 220, 224 use hardcoded hex colors for accent chips.
Fix: Add CSS variables and use them:
  :root {
    --accent-indigo: #6366f1;
    --accent-amber: #f59e0b;
    --accent-pink: #ec4899;
  }
  .accentChipIndigo { background: var(--accent-indigo); }
  .accentChipAmber { background: var(--accent-amber); }
  .accentChipPink { background: var(--accent-pink); }

### FIX 8: Add dark theme to AdminAttemptAnalysis heatmap
File: frontend/src/pages/Admin/AdminAttemptAnalysis/AdminAttemptAnalysis.module.scss
Problem: Lines 241, 245 use hardcoded colors for heatmap.
Fix: Replace with CSS variables:
  .heatmapCool { background: var(--color-info, #3b82f6); }
  .heatmapWarm { background: var(--color-warning, #fbbf24); }
  .heatmapHot { background: var(--color-danger, #ef4444); }

Do NOT change functionality. Only fix CSS and minor code issues.
```

---

## SUMMARY

| Phase | Items | Focus |
|-------|-------|-------|
| A | 5 fixes | Missing SCSS, permission security hole, FK cascade, detection thread safety, alert cooldown leak |
| B | 10 fixes | Cosine math, face verifier state, div/zero, off-by-one, model logging, localStorage, memory leak, null crash, DB retry, bypass guard |
| C | 8 fixes | Recursion guard, audio init, CORS methods, sidebar consistency, CSS hardcoded colors, dark theme |

Total: 23 fixes across 3 prompts.
