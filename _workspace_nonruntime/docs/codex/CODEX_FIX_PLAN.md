# CODEX FIX PLAN — SYRA LMS Full Audit Remediation

Use each phase as a single Codex prompt. Run them in order (Phase 1 → 2 → 3 → 4 → 5).

---

## PHASE 1 — CRITICAL SECURITY & DATA FIXES

```
You are working on a full-stack LMS project (FastAPI backend + React frontend).
- Backend: e:\codexxx\backend\src\app\
- Frontend: e:\codexxx\frontend\src\
- Database: SQLAlchemy with PostgreSQL
- Auth: JWT tokens stored in localStorage, decoded via deps.py get_current_user()

Fix ALL of the following critical issues:

### 1. Secure video and evidence static file endpoints
File: backend/src/app/main.py
Problem: Videos and evidence screenshots are mounted as public StaticFiles with no auth.
  app.mount("/videos", StaticFiles(directory=...))
  app.mount("/evidence", StaticFiles(directory=...))
Fix: Remove the StaticFiles mounts. Create two new authenticated endpoints in a new file backend/src/app/api/routes/media.py:
  - GET /api/media/videos/{filename} — requires valid JWT (use Depends(get_current_user)). Admin users can access any video. Learner users can only access videos linked to their own attempts. Stream the file using FileResponse.
  - GET /api/media/evidence/{filename} — same auth rules as videos.
Register these routes in main.py. Update frontend references:
  - frontend/src/pages/Admin/AdminAttemptAnalysis/ — update video/evidence URLs to use /api/media/videos/ and /api/media/evidence/
  - frontend/src/pages/Admin/AdminCandidates/ — same
  - frontend/src/pages/Admin/AdminManageTestPage/ — same
  - Any other component referencing /videos/ or /evidence/ paths

### 2. Add rate limiting to signup and forgot-password
File: backend/src/app/api/routes/auth.py
Problem: POST /auth/login has rate limiting but /auth/signup and /auth/forgot-password do not.
Fix: Apply the same rate limiting decorator/logic used on /auth/login to:
  - POST /auth/signup
  - POST /auth/forgot-password
Keep the same rate limit window as login (find the existing implementation and reuse it).

### 3. Add user update endpoint
File: backend/src/app/api/routes/users.py
Problem: Only POST (create) and GET (list/detail) exist. No PUT/PATCH to update a user.
Fix: Add PATCH /api/users/{user_id} endpoint that:
  - Requires admin role (use the existing require_role or permission check pattern)
  - Accepts optional fields: name, email, role, is_active
  - Validates email uniqueness (exclude current user from check)
  - If role changes, log it to audit log
  - Returns the updated user object
  - Add audit log entry for user update

### 4. Apply grading scale in scoring
File: backend/src/app/api/routes/attempts.py (function _auto_score_attempt)
Problem: Exam.grading_scale_id exists as a FK but scoring only uses raw percentage. The grading scale bands are never applied.
Fix: After calculating the raw percentage score:
  - If exam.grading_scale_id is set, load the grading scale from DB
  - The grading scale has bands (check the GradingScale model for structure — it likely has a JSON field with min/max/label entries)
  - Map the raw percentage to the matching band
  - Store the grade label in attempt.grade (add this field to Attempt model if it doesn't exist)
  - Return the grade label in the attempt response
  - If no grading scale is set, leave grade as null (backward compatible)

### 5. Add pagination to unbounded list endpoints
Files: backend/src/app/api/routes/attempts.py, users.py, audit_log.py, exams.py
Problem: List endpoints can return unlimited rows.
Fix: Add skip/limit query parameters (default skip=0, limit=50, max limit=200) to:
  - GET /api/attempts/
  - GET /api/users/
  - GET /api/exams/
  - GET /api/audit-log/
Return response as: { "items": [...], "total": <count>, "skip": <skip>, "limit": <limit> }
Update the corresponding frontend service calls and list components to handle paginated responses if they don't already. The frontend admin pages that fetch these should pass page/limit params.

### 6. Fix N+1 queries on attempts
File: backend/src/app/api/routes/attempts.py
Problem: _build_attempt_read() accesses attempt.exam and attempt.user without eager loading, causing 2 extra queries per attempt in list endpoints.
Fix: In the list endpoint query, use SQLAlchemy joinedload or selectinload:
  from sqlalchemy.orm import joinedload
  query = select(Attempt).options(joinedload(Attempt.exam), joinedload(Attempt.user))
Apply the same fix to any other query that iterates attempts and accesses .exam or .user.
Also check routes_admin.py for _serialize_list_item() which queries testing_sessions per test — fix with a single GROUP BY query or subquery load.

### 7. Add missing database indexes
File: backend/src/app/models/__init__.py
Add indexes to frequently queried columns:
  - Exam.title — Index for search/filter
  - Exam.status — Index for status filtering
  - Attempt.status — Index for attempt filtering
  - Attempt.user_id — Index for user's attempts lookup (if not already indexed via FK)
  - Schedule.scheduled_at — Index for date range queries
  - ProctoringEvent.attempt_id — Index for event lookup (if not already indexed via FK)
Use: from sqlalchemy import Index, or Column(..., index=True)

Do NOT break any existing functionality. Run the app after changes to verify it starts without errors.
```

---

## PHASE 2 — BACKEND LOGIC & ROBUSTNESS

```
You are working on a full-stack LMS project (FastAPI backend + React frontend).
- Backend: e:\codexxx\backend\src\app\
- Auth: JWT, deps.py has get_current_user

Fix ALL of the following backend issues:

### 1. Email retry logic
File: backend/src/app/services/email.py
Problem: Email failures are silently swallowed with no retry.
Fix:
  - Add a simple retry mechanism: retry up to 3 times with exponential backoff (1s, 2s, 4s)
  - Log failures with the recipient email and error message (use Python logging, not print)
  - After 3 failures, log a critical error but don't crash the request
  - Do NOT add external dependencies — use asyncio.sleep for delays

### 2. Add missing email notification triggers
File: backend/src/app/services/notifications.py and relevant route files
Problem: Notifications only created from proctoring. Missing notifications for key events.
Fix: Add notification creation calls (using the existing notify_user pattern) for:
  - When an attempt is graded/scored (in attempts.py after _auto_score_attempt)
  - When a test is published (in routes_admin.py publish endpoint)
  - When a schedule is created or modified (in schedules route)
Keep it simple — just create the notification record with appropriate message text.

### 3. Video upload validation
File: backend/src/app/api/routes/proctoring.py
Problem: Video chunk upload has no size limit or file type validation.
Fix:
  - Add max chunk size validation: reject chunks larger than 5MB with 413 status
  - Validate content type starts with "video/" or "application/octet-stream"
  - Add a total video size check: if combined chunks exceed 500MB, reject with 413
  - Return clear error messages

### 4. Certificate generation improvements
File: backend/src/app/api/routes/attempts.py (_generate_certificate function)
Problem: Hardcoded PDF layout, ignores exam.certificate config fields.
Fix:
  - Read exam.certificate dict fields: title, subtitle, issuer_name, signer_name (check what fields exist in the model/settings)
  - Use these values in the PDF generation instead of hardcoded strings
  - Add content-length header to the StreamingResponse
  - Keep the existing PDF library (reportlab or whatever is used)

### 5. Fix _generate_code() efficiency
File: backend/src/app/modules/tests/routes_admin.py
Problem: _generate_code() loads ALL exams into memory to check code uniqueness.
Fix: Replace with a DB-level uniqueness check:
  - Generate a random code
  - Query: SELECT 1 FROM exams WHERE code = :code LIMIT 1
  - If exists, regenerate (loop max 10 times)
  - If 10 collisions, raise 500 error
  - Do NOT load all exams into memory

### 6. Add WebSocket heartbeat
File: backend/src/app/api/routes/proctoring.py
Problem: No heartbeat/ping for WebSocket connections, no timeout for inactive connections.
Fix:
  - Add a ping message every 30 seconds from server side
  - If no response (pong or frame) received within 60 seconds, close the connection
  - Add try/except around frame processing to catch malformed data
  - Log WebSocket disconnections with attempt_id

### 7. Fix report generation to use Jinja2
File: backend/src/app/api/routes/report_schedules.py (and reports.py if applicable)
Problem: Reports built with f-string HTML — fragile and insecure.
Fix:
  - Create a templates directory: backend/src/app/templates/reports/
  - Create a base report template: report_base.html (Jinja2)
  - Convert existing f-string HTML into Jinja2 templates
  - Use jinja2.Environment to render (jinja2 is already a FastAPI dependency)
  - Sanitize any user-provided values in templates using |e filter

### 8. Cron validation for report schedules
File: backend/src/app/api/routes/report_schedules.py
Problem: Cron expression field accepts any string with no validation.
Fix:
  - Validate the cron expression on create/update
  - Check it has 5 fields (minute, hour, day, month, weekday)
  - Each field should match valid cron syntax (numbers, *, /, -)
  - Return 422 with clear message if invalid
  - Use a simple regex or manual parser — do NOT add croniter as a dependency unless it's already installed

### 9. Audit log coverage
File: backend/src/app/services/audit.py and relevant route files
Problem: Only 22 action types logged. Missing critical events.
Fix: Add audit log entries for:
  - User login (successful) — in auth.py login endpoint
  - User logout — in auth.py logout endpoint (if exists)
  - Password change — in auth.py or users.py
  - Permission/role change — in roles/permissions routes
  - Test publish/unpublish/archive — in routes_admin.py
  - Schedule creation/deletion — in schedules route
Use the existing audit log creation pattern (check how current audit entries are created and follow the same pattern).

Do NOT break any existing functionality. Keep changes minimal and focused.
```

---

## PHASE 3 — FRONTEND UX & ROBUSTNESS

```
You are working on a React 18 + Vite frontend at e:\codexxx\frontend\src\.
- SCSS Modules for styling (CSS vars: --color-text, --color-surface, --color-border, --color-primary, --color-muted, --radius)
- Icons: inline SVG components (no icon libraries)
- Auth: useAuth() hook from AuthContext

Fix ALL of the following frontend issues:

### 1. Add notification badge to Navbar
File: frontend/src/components/Navbar/Navbar.jsx
Problem: notification.service.js has getUnreadCount() but Navbar doesn't show unread count.
Fix:
  - Import notification service
  - On mount (and every 30 seconds), call getUnreadCount()
  - Display a small red badge with the count next to a bell icon in the navbar (only if count > 0)
  - Clicking the bell navigates to a notifications page or opens a dropdown showing recent notifications
  - Use SCSS module for styling the badge (small red circle with white text)
  - Stop the polling interval on unmount

### 2. Add unsaved changes warning
File: Create frontend/src/hooks/useUnsavedChanges.js
Problem: Users can navigate away from dirty forms without warning.
Fix:
  - Create a custom hook useUnsavedChanges(isDirty) that:
    - Adds a beforeunload event listener when isDirty is true
    - Uses react-router's useBlocker (or window.onbeforeunload) to warn on navigation
  - Apply this hook to these pages:
    - AdminNewTestWizard (track if any field changed from initial state)
    - AdminManageTestPage (track if settings modified)
    - Profile page (already has manual dirty check — integrate the hook)
  - Keep it simple — just a browser confirm dialog, no custom modal needed

### 3. Add global error boundary
File: Create frontend/src/components/ErrorBoundary/ErrorBoundary.jsx
Fix:
  - Create a React error boundary class component
  - Display a friendly error message with a "Reload Page" button
  - Style with SCSS module using existing CSS variables
  - Wrap the app's route content in AppRoutes.jsx with this ErrorBoundary
  - Log the error to console.error

### 4. Add loading skeletons
File: Create frontend/src/components/Skeleton/Skeleton.jsx and Skeleton.module.scss
Problem: Pages show plain "Loading..." text during data fetches.
Fix:
  - Create a simple Skeleton component that renders pulsing gray rectangles
  - Variants: text (single line), card (rectangle), table (multiple rows)
  - Use CSS animation (pulse/shimmer) with existing CSS variables
  - Replace "Loading..." text in these high-traffic pages:
    - AdminDashboard
    - AdminExams
    - Attempts
    - Home
  - Keep it simple — just the component and 4 page integrations

### 5. Improve server error display
Files: Multiple admin pages
Problem: Server validation errors (422) show generic messages, not field-specific.
Fix:
  - Update the error handling in frontend/src/services/api.js (or wherever axios/fetch interceptor lives)
  - When response status is 422, extract the field-level errors from response.detail (FastAPI returns [{loc: [...], msg: "...", type: "..."}])
  - Return a structured error object: { fields: { fieldName: "error message" }, message: "Validation failed" }
  - Update AdminUsers create/edit form to show field-level errors (red text below each invalid input)
  - Update AdminCategories create form similarly
  - Keep other pages using the generic message for now

### 6. Fix AdminManageTestPage performance
File: frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.jsx
Problem: 3900-line component likely has render performance issues.
Fix:
  - Split into sub-components by tab: SettingsTab, QuestionsTab, SessionsTab, CandidatesTab, ProctoringTab, ReportsTab
  - Each tab component in its own file under AdminManageTestPage/tabs/
  - Move tab-specific state into each sub-component
  - Use React.memo on each tab component
  - The main component should only manage: active tab, exam data, and pass data down as props
  - Keep ALL existing functionality identical — this is a refactor only

### 7. Add aria-labels to icon-only buttons
Files: All admin pages and components
Problem: Icon-only buttons lack accessibility labels.
Fix: Search for all buttons/clickable elements that only contain an SVG icon (no text) and add aria-label attributes. Priority files:
  - Navbar.jsx (theme toggle, mobile menu)
  - Sidebar.jsx (collapse button)
  - AdminExams.jsx (action menu buttons)
  - AdminUsers.jsx (edit, delete buttons)
  - AdminManageTestPage.jsx (tab buttons, action buttons)
  - AdminCandidates.jsx (action buttons)
  - Proctoring.jsx (navigation buttons)
Use descriptive labels like "Delete user", "Edit test", "Toggle dark mode", "Previous question", etc.

### 8. AdminDashboard audit log pagination
File: frontend/src/pages/Admin/AdminDashboard/AdminDashboard.jsx
Problem: Only shows 10 audit log entries with no way to see more.
Fix:
  - Add a "View All" link that navigates to the full AdminAuditLog page
  - OR add simple "Load More" button that fetches next 10 entries
  - Keep the default view at 10 entries (don't change initial load)

Do NOT change the visual design or add new features beyond what's listed. Keep all existing functionality working.
```

---

## PHASE 4 — DATABASE, MIGRATIONS & BACKEND CLEANUP

```
You are working on a FastAPI + SQLAlchemy backend at e:\codexxx\backend\src\app\.
Database: PostgreSQL (SQLAlchemy ORM). Models in backend/src/app/models/__init__.py.

Fix ALL of the following:

### 1. Replace runtime schema patching with Alembic migrations
File: backend/src/app/main.py
Problem: ensure_column() runs on every startup to patch schema — runtime schema patching is the wrong approach for PostgreSQL.
Fix:
  - Set up Alembic if not already configured:
    - alembic init backend/alembic (if alembic/ dir doesn't exist)
    - Configure alembic.ini to use the same DATABASE_URL from .env
    - Set target_metadata in alembic/env.py to use your Base.metadata
  - Generate an initial migration: alembic revision --autogenerate -m "initial schema"
  - Remove ALL ensure_column() calls from main.py startup
  - Remove the ensure_column() function entirely
  - Add alembic upgrade head to the startup sequence (or document it as a manual step)
  - Make sure the app starts cleanly without the ensure_column calls

### 2. Add database constraints
File: backend/src/app/models/__init__.py
Fix: Add CHECK constraints or validation to these model fields:
  - Exam.time_limit: must be > 0 (use CheckConstraint or validate in route)
  - Exam.passing_score: must be between 0 and 100
  - Exam.max_attempts: must be >= 1 (or null for unlimited)
  - Question.order: must be >= 0
  - Question.points: must be >= 0
If adding SQLAlchemy CheckConstraint is complex, add validation in the route handlers instead (simpler approach). Use @validator or manual checks before DB insert.

### 3. Add attempt.grade field
File: backend/src/app/models/__init__.py
Problem: Phase 1 added grading scale logic but may need a grade field on Attempt.
Fix:
  - If Attempt model doesn't have a `grade` field, add: grade = Column(String, nullable=True)
  - This stores the grading scale label (e.g., "A", "B+", "Pass", "Distinction")
  - Generate an Alembic migration for this change
  - Update _build_attempt_read() to include grade in the response

### 4. Fix question pool storage pattern
File: backend/src/app/api/routes/question_pools.py
Problem: Questions stored in hidden exams with _pool_library metadata — fragile pattern.
Fix: This is a larger refactor. For now, add defensive checks:
  - When loading pool questions, verify the hidden exam exists and has the correct metadata
  - If metadata is missing/corrupted, log a warning and return empty list (don't crash)
  - Add a comment explaining the pattern and why it exists
  - Do NOT refactor to junction table yet (too risky) — just make it robust

### 5. Add GDPR data export endpoint
File: Create backend/src/app/api/routes/gdpr.py
Fix:
  - POST /api/users/{user_id}/export-data — requires admin role or self (user can export own data)
  - Collects: user profile, all attempts (with answers), all schedules, all notifications
  - Returns as JSON download (Content-Disposition: attachment)
  - Do NOT include proctoring videos (too large) — include metadata only (filenames, timestamps)
  - Register route in main.py

### 6. Add data retention cleanup
File: backend/src/app/main.py (in the existing startup/background tasks)
Problem: Videos and identity photos stored indefinitely.
Fix:
  - Add a daily background task (use the existing pattern for scheduled tasks)
  - Delete identity verification photos older than 7 days (from storage/identity/)
  - Delete proctoring videos older than 90 days (from storage/videos/)
  - Delete proctoring evidence screenshots older than 90 days (from storage/evidence/)
  - Log how many files were cleaned up
  - Make retention periods configurable via environment variables (default 7 and 90 days)

### 7. Input sanitization for question/exam text
File: backend/src/app/api/routes/questions.py and exams.py
Problem: HTML content in question text not sanitized — potential XSS if frontend doesn't escape.
Fix:
  - Install bleach (add to requirements.txt) if not already installed
  - Sanitize question text, question options, and exam description/instructions on create and update
  - Allow basic formatting tags: <b>, <i>, <u>, <p>, <br>, <ul>, <ol>, <li>, <strong>, <em>
  - Strip all other HTML tags and attributes (especially script, onclick, onerror, etc.)
  - Apply to both questions.py and the question creation in routes_admin.py

Do NOT break any existing functionality. Generate Alembic migrations for any schema changes.
```

---

## PHASE 5 — TESTING & DEVOPS INFRASTRUCTURE

```
You are working on a full-stack LMS at e:\codexxx\.
- Backend: FastAPI at backend/src/app/
- Frontend: React + Vite at frontend/src/
- Tests: frontend/tests/e2e/ (Playwright), frontend/src/**/*.test.jsx (Vitest), backend/tests/ (Pytest)

Set up ALL of the following:

### 1. Dockerfile for backend
File: Create backend/Dockerfile
```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx libglib2.0-0 tesseract-ocr && \
    rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ src/
COPY config.yaml .
EXPOSE 8000
CMD ["uvicorn", "src.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```
Adjust based on actual dependencies (check requirements.txt for opencv, tesseract, etc.).

### 2. Dockerfile for frontend
File: Create frontend/Dockerfile
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```
Create frontend/nginx.conf that:
  - Serves static files from /usr/share/nginx/html
  - Proxies /api/* requests to backend:8000
  - Has try_files for SPA routing (fallback to index.html)

### 3. docker-compose.yml
File: Create docker-compose.yml at project root
Services:
  - db: postgres:15 with volume for data persistence, healthcheck
  - backend: builds from backend/Dockerfile, depends on db, env vars from .env
  - frontend: builds from frontend/Dockerfile, depends on backend, ports 80:80
Include .env.example with all required variables (placeholder values, no real secrets).

### 4. GitHub Actions CI pipeline
File: Create .github/workflows/ci.yml
Jobs:
  - backend-test: Python 3.11, install deps, run pytest
  - frontend-test: Node 20, npm ci, npm test (vitest)
  - lint: Run eslint on frontend (if configured), flake8 on backend
  - build: Build Docker images (don't push, just verify they build)
Trigger on: push to main, pull_request to main

### 5. ESLint + Prettier for frontend
Files: Create frontend/.eslintrc.json and frontend/.prettierrc
ESLint config:
  - extends: ["eslint:recommended", "plugin:react/recommended", "plugin:react-hooks/recommended"]
  - env: browser, es2022
  - parserOptions: ecmaVersion 2022, sourceType module, jsx
  - rules: no-unused-vars warn, react/prop-types off, react/react-in-jsx-scope off
Prettier config:
  - singleQuote: true, semi: true, tabWidth: 2, trailingComma: "es5"
Add to package.json scripts: "lint": "eslint src/", "format": "prettier --write src/"
Install as devDependencies: eslint, prettier, eslint-plugin-react, eslint-plugin-react-hooks, eslint-config-prettier

### 6. Backend pytest setup
File: Create backend/tests/conftest.py
Fix:
  - Create a test database fixture (use PostgreSQL for tests: postgresql+psycopg://...):
    ```python
    @pytest.fixture
    def db():
        engine = create_engine("postgresql+psycopg://postgres:password@localhost:5432/syra_lms_test")
        Base.metadata.create_all(engine)
        session = TestingSession(bind=engine)
        yield session
        session.close()
    ```
  - Create a test client fixture:
    ```python
    @pytest.fixture
    def client(db):
        app.dependency_overrides[get_db] = lambda: db
        return TestClient(app)
    ```
  - Create helper fixtures: admin_token, learner_token (create users and generate JWTs)

Add these test files:
  - backend/tests/test_auth.py: Test login, signup, token validation (5 tests)
  - backend/tests/test_users.py: Test CRUD operations (4 tests)
  - backend/tests/test_attempts.py: Test scoring logic, grading scale application (4 tests)
  - backend/tests/test_exams.py: Test create, publish, archive (4 tests)
Each test should assert status codes AND response body content.

### 7. Add .env.example files
Create backend/.env.example:
```
DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/syra_lms
SECRET_KEY=change-me-to-random-string
BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=noreply@yourdomain.com
BREVO_SENDER_NAME=SYRA LMS
OPENAI_API_KEY=your-openai-key-optional
IDENTITY_RETENTION_DAYS=7
VIDEO_RETENTION_DAYS=90
```
Create frontend/.env.example:
```
VITE_API_BASE_URL=http://127.0.0.1:8000/api
```
Add .env to .gitignore if not already there.

### 8. Pre-commit hooks
File: Create .pre-commit-config.yaml at project root
Hooks:
  - trailing-whitespace
  - end-of-file-fixer
  - check-yaml
  - check-added-large-files (maxkb: 1000)
Add instructions in a comment at top of file for installing: `pip install pre-commit && pre-commit install`

Do NOT modify any existing application code. Only create new infrastructure files and test files.
```

---

## QUICK REFERENCE: What Each Phase Fixes

| Phase | Focus | Issues Fixed |
|-------|-------|-------------|
| 1 | Critical Security & Performance | Video auth, rate limiting, user PATCH, grading scale, pagination, N+1 queries, indexes |
| 2 | Backend Logic & Robustness | Email retry, notifications, video validation, certificates, WebSocket heartbeat, reports, audit logs |
| 3 | Frontend UX & Accessibility | Notification badge, unsaved changes, error boundary, skeletons, error display, aria-labels, component split |
| 4 | Database & Data Governance | Alembic migrations, constraints, GDPR export, data retention, input sanitization |
| 5 | Testing & DevOps | Docker, CI/CD, ESLint, Pytest setup, .env.example, pre-commit hooks |

Total: ~50 issues across 5 phases.
