# SYRA LMS Full System Audit

This audit covers the currently exposed frontend routes, backend APIs, and the end-to-end learner/admin flows exercised during static review and live smoke checks on March 7, 2026.

## Findings

### FS-001
1. issue id: `FS-001`
2. title: Canonical admin test routes still point to legacy `/admin/exams`
3. severity: `blocker`
4. area: `admin routing / shared contracts`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/tests`, `/admin/exams`, `frontend/src/routes/AppRoutes.jsx`, `frontend/src/components/Sidebar/Sidebar.jsx`, `frontend/src/components/Navbar/Navbar.jsx`, `frontend/src/pages/Admin/AdminExams/AdminExams.jsx`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.jsx`, `frontend/src/pages/Admin/AdminNewTestWizard/AdminNewTestWizard.jsx`, `frontend/src/pages/Admin/AdminDashboard/AdminDashboard.jsx`
7. issue type: `frontend/backend mismatch`, `bad route/link`, `naming inconsistency`
8. current broken behavior: The canonical admin API is `/api/admin/tests`, but the UI still treats `/admin/exams` as primary and redirects `/admin/tests` away from the expected path.
9. expected behavior: Admin test management should be anchored on `/admin/tests`, with `/admin/exams` retained only as a compatibility redirect.
10. recommended fix: Make `/admin/tests` the primary admin UI path, update links/navigation/search/dashboard cards, and keep `/admin/exams` as legacy redirects.
11. status checkbox: `[x]`

### FS-002
1. issue id: `FS-002`
2. title: Route guards redirect silently to the wrong dashboard with no access-denied state
3. severity: `high`
4. area: `auth / routing`
5. affected user role(s): `Admin`, `Instructor`, `Learner`
6. affected routes/pages/files: `frontend/src/routes/AppRoutes.jsx`, `frontend/src/components/Sidebar/Sidebar.jsx`
7. issue type: `role/permission bug`, `broken flow`
8. current broken behavior: Unauthorized users are redirected to `/`, which can send admins to the learner dashboard and hides the reason access was denied.
9. expected behavior: Role/permission failures should lead to an explicit access-denied surface, and dashboard links should resolve to the correct role landing page.
10. recommended fix: Add a dedicated access-denied route and correct the dashboard link/redirect logic.
11. status checkbox: `[x]`

### FS-003
1. issue id: `FS-003`
2. title: Instructor attempt-analysis permission is allowed in backend but blocked in frontend shell/routes
3. severity: `high`
4. area: `permissions / instructor`
5. affected user role(s): `Instructor`
6. affected routes/pages/files: `/admin/attempt-analysis`, `/admin/attempts/:attemptId/videos`, `frontend/src/components/Sidebar/Sidebar.jsx`, `frontend/src/routes/AppRoutes.jsx`
7. issue type: `frontend/backend mismatch`, `role/permission bug`
8. current broken behavior: Instructors have backend permission for attempt analysis by default but cannot reach the corresponding UI routes because the shell treats them as admin-only.
9. expected behavior: Instructors should be able to access the attempt-analysis surfaces that the backend already authorizes.
10. recommended fix: Align frontend route guards and sidebar visibility with the `View Attempt Analysis` permission.
11. status checkbox: `[x]`

### FS-004
1. issue id: `FS-004`
2. title: Learner exam listing/details expose restricted tests that the learner cannot actually start
3. severity: `blocker`
4. area: `learner journey / exams`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/exams`, `/exams/:examId`, `backend/src/app/api/routes/exams.py`, `backend/src/app/api/routes/search.py`, `backend/src/app/api/routes/dashboard.py`
7. issue type: `broken flow`, `permission bug`, `incomplete business logic`
8. current broken behavior: Learners can see open tests that are restricted to other users. The failure happens later during attempt creation.
9. expected behavior: Learners should only see tests they are allowed to access now.
10. recommended fix: Apply schedule/access filtering consistently in learner-facing exam list/detail/search/dashboard queries.
11. status checkbox: `[x]`

### FS-005
1. issue id: `FS-005`
2. title: Learner question API lacks access checks and stable ordering
3. severity: `blocker`
4. area: `learner journey / questions`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `backend/src/app/api/routes/questions.py`
7. issue type: `role/permission bug`, `incomplete business logic`
8. current broken behavior: A learner can request questions for arbitrary exam IDs, and the returned order is not guaranteed.
9. expected behavior: Learners should only receive questions for accessible tests, returned in test order.
10. recommended fix: Enforce learner exam access in `GET /api/questions` and order by `order, created_at`.
11. status checkbox: `[x]`

### FS-006
1. issue id: `FS-006`
2. title: Proctoring page does not reload saved answers on refresh
3. severity: `blocker`
4. area: `learner journey / attempts`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/exam/:attemptId`, `frontend/src/pages/Proctoring/Proctoring.jsx`
7. issue type: `broken flow`, `missing UI integration`
8. current broken behavior: Answers are autosaved to the backend, but a page refresh loses the local answer state and makes the attempt look empty.
9. expected behavior: Refreshing an in-progress attempt should restore previously saved answers.
10. recommended fix: Load attempt answers during proctoring-page bootstrap and hydrate local answer state.
11. status checkbox: `[x]`

### FS-007
1. issue id: `FS-007`
2. title: Identity verification crashes on mediapipe variants without `solutions`
3. severity: `blocker`
4. area: `precheck / identity verification`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `backend/src/app/api/routes/attempts.py`
7. issue type: `broken flow`
8. current broken behavior: `POST /api/attempts/{id}/verify-identity` raises a 500 when the installed `mediapipe` package does not expose `solutions`.
9. expected behavior: Identity verification should gracefully fall back to the OpenCV face detector and never crash because of the optional dependency shape.
10. recommended fix: Guard the mediapipe branch and keep the Haar-cascade fallback active.
11. status checkbox: `[x]`

### FS-008
1. issue id: `FS-008`
2. title: Admin tests can be published without any questions
3. severity: `high`
4. area: `admin tests / business rules`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `backend/src/app/modules/tests/routes_admin.py`, `frontend/src/pages/Admin/AdminExams/AdminExams.jsx`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.jsx`
7. issue type: `missing validation`, `incomplete business logic`
8. current broken behavior: Draft tests created from the list or API can be published even when they contain zero questions.
9. expected behavior: Publishing should be blocked until the test has at least one question.
10. recommended fix: Enforce the rule in the admin tests publish endpoint and surface the validation message in admin UI actions.
11. status checkbox: `[x]`

### FS-009
1. issue id: `FS-009`
2. title: Duplicate test action can fail on repeated copies because titles collide
3. severity: `high`
4. area: `admin tests / duplication`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `backend/src/app/modules/tests/routes_admin.py`
7. issue type: `broken flow`, `missing validation`
8. current broken behavior: Duplicating the same test multiple times can hit the unique `(node_id, title)` constraint and return a server error.
9. expected behavior: Duplicate should always generate a unique draft title.
10. recommended fix: Generate a unique copy title suffix before insert and keep the duplicate in draft state.
11. status checkbox: `[x]`

### FS-010
1. issue id: `FS-010`
2. title: Admin manage-tests grid is missing server-backed pagination, sort, and duplicate workflow
3. severity: `high`
4. area: `admin tests`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/tests`, `frontend/src/pages/Admin/AdminExams/AdminExams.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: The grid fetches a fixed `page_size=100`, performs search client-side, and lacks pagination controls, sorting, and the duplicate action exposed by the backend.
9. expected behavior: Admin test management should provide practical toolbar filters, sort controls, pagination, and reliable duplicate/publish/archive/delete actions.
10. recommended fix: Switch the list to backend-driven search/filter/sort/pagination and add the missing duplicate action.
11. status checkbox: `[x]`

### FS-011
1. issue id: `FS-011`
2. title: Schedule DTO omits learner display fields expected by admin management pages
3. severity: `medium`
4. area: `testing sessions / candidates`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `backend/src/app/schemas/__init__.py`, `backend/src/app/api/routes/schedules.py`, `backend/src/app/api/routes/dashboard.py`, `frontend/src/pages/Admin/AdminTestingSessions/AdminTestingSessions.jsx`
7. issue type: `frontend/backend mismatch`
8. current broken behavior: Session pages expect user display fields, but schedule responses only include IDs, forcing inconsistent fallback logic.
9. expected behavior: Schedule responses should include stable learner display metadata.
10. recommended fix: Add learner display fields to `ScheduleRead` and populate them in schedule builders.
11. status checkbox: `[x]`

### FS-012
1. issue id: `FS-012`
2. title: Testing session create flow allows missing date input that backend rejects
3. severity: `medium`
4. area: `testing sessions`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `frontend/src/pages/Admin/AdminTestingSessions/AdminTestingSessions.jsx`
7. issue type: `missing validation`
8. current broken behavior: The modal allows submit without a scheduled date/time even though the backend requires it.
9. expected behavior: The UI should block invalid submissions and show an actionable validation message.
10. recommended fix: Add client-side validation for required date/time before submit.
11. status checkbox: `[x]`

### FS-013
1. issue id: `FS-013`
2. title: Backend stabilization suite is not green
3. severity: `medium`
4. area: `tests / verification`
5. affected user role(s): `Admin`, `Instructor`, `Learner`
6. affected routes/pages/files: `backend/tests/test_stabilization.py`
7. issue type: `incomplete verification`
8. current broken behavior: The current backend stabilization suite fails on relationship stubbing, so the regression safety net is incomplete.
9. expected behavior: Focused stabilization tests should pass after the patch set.
10. recommended fix: Update the failing tests to use valid stubs/fixtures and keep the suite green.
11. status checkbox: `[x]`

### FS-014
1. issue id: `FS-014`
2. title: Legacy `Exam` naming leaked through learner/frontend compatibility layers
3. severity: `low`
4. area: `naming consistency`
5. affected user role(s): `Admin`, `Learner`
6. affected routes/pages/files: `/tests`, `/tests/:testId`, legacy `/exams` redirects, `frontend/src/services/exam.service.js`, `frontend/src/services/test.service.js`, `frontend/src/pages/Exams/*`, `frontend/src/pages/ExamInstructions/*`, `frontend/src/pages/SystemCheckPage/SystemCheckPage.jsx`, `frontend/src/pages/VerifyIdentityPage/VerifyIdentityPage.jsx`, `frontend/src/pages/RulesPage/RulesPage.jsx`, `frontend/src/pages/Proctoring/Proctoring.jsx`, `frontend/src/routes/AppRoutes.jsx`, `backend/src/app/schemas/__init__.py`, `backend/src/app/api/routes/attempts.py`, `backend/src/app/api/routes/schedules.py`, `backend/src/app/api/routes/dashboard.py`
7. issue type: `naming inconsistency`
8. current broken behavior: The admin UI already presents tests, but learner-facing routes, self-service copy, and several response fields still expose `Exam` naming, making the compatibility layer visible to end users.
9. expected behavior: User-facing admin and learner flows should consistently use Test terminology and canonical `/tests` routes, while legacy `exam` contracts remain hidden behind compatibility redirects/aliases.
10. recommended fix: Introduce canonical learner `/tests` routes, update learner pages/navigation/search copy, add `test_*` response aliases alongside legacy `exam_*` fields, and keep deeper backend/internal renames for a later controlled refactor.
11. status checkbox: `[x]`

### FS-015
1. issue id: `FS-015`
2. title: Canonical `Test` contracts still depended on legacy permission aliases and report/email copy
3. severity: `low`
4. area: `shared contracts / permissions / reporting`
5. affected user role(s): `Admin`, `Instructor`, `Learner`
6. affected routes/pages/files: `backend/src/app/api/deps.py`, `backend/src/app/modules/tests/routes_admin.py`, `backend/src/app/api/routes/exams.py`, `backend/src/app/api/routes/courses.py`, `backend/src/app/api/routes/nodes.py`, `backend/src/app/api/routes/questions.py`, `backend/src/app/api/routes/surveys.py`, `backend/src/app/api/routes/exam_templates.py`, `backend/src/app/api/routes/search.py`, `backend/src/app/api/routes/attempts.py`, `backend/src/app/api/routes/schedules.py`, `backend/src/app/api/routes/question_pools.py`, `backend/src/app/services/email.py`, `frontend/src/services/admin.service.js`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.jsx`
7. issue type: `naming inconsistency`, `frontend/backend mismatch`
8. current broken behavior: User-facing `Test` routes were already canonical, but many backend routes still requested legacy `* Exams` permissions, admin runtime services still exposed `getExam` as the active contract, and generated errors/reports/emails still surfaced `Exam` wording.
9. expected behavior: The active permission, admin-service, and generated-output contracts should use `Test` naming directly, with legacy `Exam` aliases kept only as compatibility shims.
10. recommended fix: Replace active backend permission checks with `* Tests`, move admin runtime consumers onto canonical `Test` service names, and update user-visible report/email/API copy to `Test` while preserving legacy aliases where needed for compatibility.
11. status checkbox: `[x]`

### FS-016
1. issue id: `FS-016`
2. title: Admin utility pages used optimistic state and weak validation that could leave fake saved states behind
3. severity: `medium`
4. area: `admin settings / reports / integrations`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/subscribers`, `/admin/integrations`, `/admin/reports`, `/admin/favorite-reports`, `frontend/src/pages/Admin/AdminSubscribers/AdminSubscribers.jsx`, `frontend/src/pages/Admin/AdminIntegrations/AdminIntegrations.jsx`, `frontend/src/pages/Admin/AdminReports/AdminReports.jsx`, `frontend/src/pages/Admin/AdminFavoriteReports/AdminFavoriteReports.jsx`, `backend/src/app/api/routes/admin_settings.py`, `backend/src/app/api/routes/report_schedules.py`
7. issue type: `broken flow`, `missing validation`, `broken UX state`
8. current broken behavior: Invalid subscribers, integration changes, and report schedules could appear saved in the UI before the backend accepted them. Report schedules also lacked explicit cron/email validation, so bad payloads could reach persistence.
9. expected behavior: These admin-only flows should save only after backend confirmation, validate inputs consistently on both client and server, and expose stable success/error feedback.
10. recommended fix: Remove optimistic updates from these utility pages, add frontend validation for email/link fields, canonicalize permissions settings on save, validate report schedules server-side, and cover the pages with focused end-to-end checks.
11. status checkbox: `[x]`

### FS-017
1. issue id: `FS-017`
2. title: User and user-group validation paths used a non-existent 422 status constant
3. severity: `medium`
4. area: `admin users / user groups / backend validation`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `backend/src/app/api/routes/users.py`, `backend/src/app/api/routes/user_groups.py`
7. issue type: `missing validation`, `broken flow`
8. current broken behavior: Several validation branches raised `status.HTTP_422_UNPROCESSABLE_CONTENT`, which is not defined by the FastAPI/Starlette status module and could crash the request path instead of returning a validation error.
9. expected behavior: Invalid user and user-group payloads should return stable 422 validation responses.
10. recommended fix: Replace the invalid status constant with `HTTP_422_UNPROCESSABLE_ENTITY` everywhere those validation branches are used.
11. status checkbox: `[x]`

### FS-018
1. issue id: `FS-018`
2. title: New Test Wizard could leave the module selector empty even when the selected course already had modules
3. severity: `high`
4. area: `admin tests / new test wizard`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/tests/new`, `frontend/src/pages/Admin/AdminNewTestWizard/AdminNewTestWizard.jsx`, `frontend/src/services/admin.service.js`, `frontend/src/services/test.service.js`
7. issue type: `broken flow`, `missing UI integration`
8. current broken behavior: The wizard sometimes loaded the selected course but left the module selector empty, forcing the flow to rely on the fallback create-on-next behavior and breaking the draft-wizard browser regression.
9. expected behavior: Selecting or preloading a course should immediately hydrate the module list and select a valid module when one exists.
10. recommended fix: Use explicit query-param requests for node/question list calls, normalize node payload shapes defensively, and trigger module loading directly when a course is prefilled or changed.
11. status checkbox: `[x]`

### FS-019
1. issue id: `FS-019`
2. title: Global navbar search had no stable empty/error state and could navigate with an undefined target
3. severity: `medium`
4. area: `global shell / search`
5. affected user role(s): `Admin`, `Instructor`, `Learner`
6. affected routes/pages/files: `frontend/src/components/Navbar/Navbar.jsx`, `frontend/src/components/Navbar/Navbar.module.scss`
7. issue type: `broken UX state`, `broken flow`
8. current broken behavior: When search returned no matches the dropdown simply disappeared, and when the backend request failed the rendered "Search failed" row was still clickable and attempted to navigate with no route target.
9. expected behavior: The shared search surface should show explicit empty/error rows and only navigate when a result has a valid destination.
10. recommended fix: Render non-clickable informational rows for empty/error states, keep only valid rows as buttons, and clean up the debounced search lifecycle.
11. status checkbox: `[x]`

### FS-020
1. issue id: `FS-020`
2. title: Attempt-videos supervision mode could remain stuck on loading when a test had no attempts
3. severity: `medium`
4. area: `admin attempt videos / proctoring review`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/videos?exam_id=...`, `frontend/src/pages/Admin/AdminAttemptVideos/AdminAttemptVideos.jsx`, `frontend/src/pages/Admin/AdminReports/AdminReports.jsx`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: Supervision mode fetched attempts by test but never resolved the loading state when none were found, leaving the page stuck instead of showing an actionable empty state. The affected admin reporting surfaces also still contained visible broken separator characters.
9. expected behavior: Attempt-video review should show a stable "no attempts yet" empty state when a test has no attempts and should not leave visible mojibake in the admin flow.
10. recommended fix: Separate attempt-list loading from attempt-detail loading, clear stale state when no attempt is selected, show explicit empty-state copy, and normalize remaining visible separator text to ASCII.
11. status checkbox: `[x]`

### FS-021
1. issue id: `FS-021`
2. title: Templates CRUD verification relied on brittle generic container selectors
3. severity: `low`
4. area: `admin templates / verification`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/templates`, `frontend/src/pages/Admin/AdminTemplates/AdminTemplates.jsx`, `frontend/tests/e2e/admin-crud-pages.spec.js`
7. issue type: `incomplete verification`
8. current broken behavior: The templates list used only generic wrapper `div`s, so the live CRUD E2E selector could resolve ancestor containers instead of the actual template row, making full verification flaky even though the page logic itself worked.
9. expected behavior: Templates CRUD verification should target a stable row container so the regression suite reliably exercises create and edit actions.
10. recommended fix: Add a stable row hook to template rows and use it in the Playwright CRUD flow instead of relying on generic ancestor `div` selection.
11. status checkbox: `[x]`

### FS-022
1. issue id: `FS-022`
2. title: Learner attempt-taking route still rendered the full application shell
3. severity: `high`
4. area: `learner test-taking`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/attempts/:attemptId/take`, `frontend/src/routes/AppRoutes.jsx`, `frontend/tests/e2e/admin-wizard.spec.js`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: The canonical take-test route was not classified as exam mode, so learners could see the normal sidebar/navbar/search/footer shell while taking a test.
9. expected behavior: The isolated test-taking route should render without the regular application shell chrome, matching the rest of the test journey.
10. recommended fix: Treat `/attempts/:attemptId/take` as exam mode in the shell route logic and add browser coverage that asserts the main navigation/search are absent on the take page.
11. status checkbox: `[x]`

### FS-023
1. issue id: `FS-023`
2. title: My Surveys had no empty state and used a global submit lock across all survey cards
3. severity: `medium`
4. area: `learner surveys`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/surveys`, `frontend/src/pages/MySurveys/MySurveys.jsx`, `frontend/tests/e2e/route-smoke.spec.js`
7. issue type: `broken UX state`
8. current broken behavior: When no surveys existed the page rendered only the heading with no explanation, and submitting one survey disabled every survey card because submission state was tracked globally.
9. expected behavior: Learners should see a clear empty state when there are no surveys, and only the active survey card should enter a submitting state.
10. recommended fix: Add an explicit empty-state message and track submission state per survey instead of globally.
11. status checkbox: `[x]`

### FS-024
1. issue id: `FS-024`
2. title: Certificates page lacked loading/empty states and still surfaced broken saved-status copy
3. severity: `medium`
4. area: `admin certificates`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/certificates`, `frontend/src/pages/Admin/AdminCertificates/AdminCertificates.jsx`, `frontend/src/pages/Admin/AdminCertificates/AdminCertificates.module.scss`
7. issue type: `broken UX state`
8. current broken behavior: The certificates page showed no explicit loading or empty state while fetching tests, and the saved-state label still contained broken encoded text.
9. expected behavior: Certificate configuration should show clear loading and empty feedback and clean saved-state copy.
10. recommended fix: Track loading explicitly, render a no-tests state when appropriate, and normalize the saved label text.
11. status checkbox: `[x]`

### FS-025
1. issue id: `FS-025`
2. title: Scheduled reports did not auto-run on their first eligible cron window and exposed unusable filesystem paths
3. severity: `high`
4. area: `admin reports / scheduler backend`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/reports`, `backend/src/app/main.py`, `backend/src/app/api/routes/report_schedules.py`, `backend/src/app/core/config.py`, `frontend/src/pages/Admin/AdminReports/AdminReports.jsx`
7. issue type: `broken flow`, `incomplete business logic`, `frontend/backend mismatch`
8. current broken behavior: Active schedules never auto-fired until they had already been run once manually because the scheduler based its first cron calculation on `now` instead of the schedule creation time. Manual runs also returned local filesystem paths such as `E:\...reports\file.html`, which are not useful to the admin UI, email recipients, or integrations.
9. expected behavior: New schedules should auto-run on their first eligible cron boundary, and both the UI and downstream delivery channels should receive a public report URL instead of a server-local path.
10. recommended fix: Base first-run cron calculations on `created_at`, return a report URL from manual runs, and use that same public URL for email/integration payloads and admin UI feedback.
11. status checkbox: `[x]`

### FS-026
1. issue id: `FS-026`
2. title: Auth recovery/account pages still left password-reset flow looking available when delivery was not configured
3. severity: `high`
4. area: `auth / account recovery`
5. affected user role(s): `Admin`, `Instructor`, `Learner`
6. affected routes/pages/files: `/login`, `/forgot-password`, `/reset-password`, `/change-password`, `backend/src/app/api/routes/auth.py`, `backend/src/app/services/email.py`, `frontend/src/pages/Login/Login.jsx`, `frontend/src/pages/Auth/ForgotPassword.jsx`, `frontend/src/pages/Auth/ResetPassword.jsx`, `frontend/src/pages/Auth/ChangePassword.jsx`
7. issue type: `broken flow`, `missing UI integration`, `missing validation`
8. current broken behavior: The login screen did not expose the recovery/signup entry points directly, forgot-password still reported success even when email delivery could not possibly work with the active configuration, and reset/change-password pages lacked confirmation validation that matched the profile flow expectations.
9. expected behavior: Recovery routes should be discoverable from login, password-reset requests should fail explicitly when email delivery is unavailable instead of pretending a reset mail was sent, and reset/change forms should validate confirmation before submitting.
10. recommended fix: Add login entry-point links, expose email-delivery readiness to the auth route so forgot-password can return a clear 503 when reset mail is unavailable, and align reset/change-password UI validation with confirmation fields and explicit success/error states.
11. status checkbox: `[x]`

### FS-027
1. issue id: `FS-027`
2. title: Admin settings and maintenance screens still lacked reliable loading, dirty-state, and retry behavior
3. severity: `medium`
4. area: `admin settings / maintenance`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/settings`, `/admin/maintenance`, `frontend/src/pages/Admin/AdminSettings/AdminSettings.jsx`, `frontend/src/pages/Admin/AdminSettings/AdminSettings.module.scss`, `frontend/src/pages/Admin/AdminMaintenance/AdminMaintenance.jsx`, `frontend/src/pages/Admin/AdminMaintenance/AdminMaintenance.module.scss`
7. issue type: `broken UX state`
8. current broken behavior: These pages could render as blank while loading, allowed no-op saves, and replaced advanced-setting save actions with error text instead of leaving a clear retry path after backend validation failures.
9. expected behavior: System settings screens should show loading feedback, disable saves when nothing changed, and keep retry controls visible alongside any field-level save error.
10. recommended fix: Add explicit loading state copy, track persisted values for dirty-state detection, and render save errors without removing the corresponding action button.
11. status checkbox: `[x]`

### FS-028
1. issue id: `FS-028`
2. title: Instructor-capable scheduling and user routes were still blocked or wired to admin-only data sources
3. severity: `high`
4. area: `instructor permissions / admin utility routes`
5. affected user role(s): `Instructor`, `Admin`
6. affected routes/pages/files: `/admin/sessions`, `/admin/users`, `frontend/src/routes/AppRoutes.jsx`, `frontend/src/components/Sidebar/Sidebar.jsx`, `frontend/src/components/Navbar/Navbar.jsx`, `frontend/src/pages/Admin/AdminTestingSessions/AdminTestingSessions.jsx`, `frontend/src/pages/Admin/AdminUsers/AdminUsers.jsx`, `backend/src/app/api/routes/users.py`, `backend/src/app/api/routes/schedules.py`, `frontend/src/services/admin.service.js`
7. issue type: `frontend/backend mismatch`, `role/permission bug`, `broken flow`
8. current broken behavior: Backend permissions already allowed instructors to receive `Assign Schedules` and read-level `Manage Users` access, but the frontend still hard-blocked `/admin/sessions` and `/admin/users` to admins. Even if an instructor was granted those permissions, Testing Sessions still called admin-only test/user APIs, so the page could not actually create schedules.
9. expected behavior: A permissioned instructor should be able to open Testing Sessions, receive schedulable test and learner lookups from a scheduling-safe API, and open User Profiles in a read-only mode while admins keep full mutation controls.
10. recommended fix: Add minimal scheduling-safe lookup endpoints, align route/sidebar/navbar guards with the backend permission model, and render User Profiles as read-only for non-admins instead of exposing broken edit/delete controls.
11. status checkbox: `[x]`

### FS-029
1. issue id: `FS-029`
2. title: Candidates and Users navigation still exposed the wrong surfaces for mixed permission sets
3. severity: `medium`
4. area: `navigation / permission-gated admin pages`
5. affected user role(s): `Instructor`, `Admin`
6. affected routes/pages/files: `/admin/candidates`, `/admin/user-groups`, `frontend/src/components/Sidebar/Sidebar.jsx`, `frontend/src/pages/Admin/AdminCandidates/AdminCandidates.jsx`
7. issue type: `role/permission bug`, `broken flow`, `broken UX state`
8. current broken behavior: The Candidates route was guarded as a scheduling page even though it depended on attempt-analysis APIs, so a user with scheduling access but no analysis rights could enter the page and hit 403s inside it. After broadening user-profile access, the sidebar also leaked the admin-only User Groups link to instructors.
9. expected behavior: Candidates should be accessible through `View Attempt Analysis`, only expose the rescheduling tab when scheduling permission is also present, and keep admin-only User Groups hidden from instructors.
10. recommended fix: Re-key the Candidates route/navigation to analysis permission, derive its test filter from the loaded attempts instead of admin-only test APIs, and keep User Groups behind the existing admin-only sidebar rule.
11. status checkbox: `[x]`

### FS-030
1. issue id: `FS-030`
2. title: Admin dashboard failed all-or-nothing when one panel request errored
3. severity: `medium`
4. area: `admin dashboard`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/dashboard`, `frontend/src/pages/Admin/AdminDashboard/AdminDashboard.jsx`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: The dashboard loaded users, attempts, tests, audit log, and summary data through a single `Promise.all`, so one failing panel request blanked the whole page even when the rest of the data was available.
9. expected behavior: The dashboard should render whatever data is available, show a partial-data warning when only some panels fail, and reserve the full-page error state for complete failure.
10. recommended fix: Switch the dashboard bootstrap to partial `Promise.allSettled` handling, keep successful widgets visible, and clean the remaining broken action-copy text in the risky-attempts table.
11. status checkbox: `[x]`

### FS-031
1. issue id: `FS-031`
2. title: Attempt Analysis lacked a stable empty/default state and still surfaced broken result text
3. severity: `medium`
4. area: `admin attempt analysis`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/attempt-analysis`, `frontend/src/pages/Admin/AdminAttemptAnalysis/AdminAttemptAnalysis.jsx`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: Opening Attempt Analysis with no attempts or no selected query-param left the page ambiguous, and several answer/result labels still contained broken encoded glyphs.
9. expected behavior: The page should show a clear loading state, a no-attempts empty state, an explicit selection hint when attempts exist but none is selected, and clean answer/result labels.
10. recommended fix: Separate list loading from detail loading, auto-select the first attempt when the page is opened without a selected ID, and normalize the broken result/evidence copy to clean ASCII text.
11. status checkbox: `[x]`

### FS-032
1. issue id: `FS-032`
2. title: Roles & Permissions page still used stale role guidance and weak save-state feedback
3. severity: `low`
4. area: `admin settings / role management`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/roles`, `frontend/src/pages/Admin/AdminRolesPermissions/AdminRolesPermissions.jsx`
7. issue type: `broken UX state`, `naming inconsistency`
8. current broken behavior: The page still described instructors as having no admin-area privileges even though the product now exposes permission-granted instructor utility routes, and it lacked clear loading/dirty-state feedback for the permission matrix.
9. expected behavior: The visible access model should match the actual permission-driven product behavior, and admins should see whether permission changes are loaded, unsaved, or persisted.
10. recommended fix: Add explicit loading and unsaved-change states, disable no-op saves, canonicalize the matrix on save, and update the role legend to describe permission-granted instructor access accurately.
11. status checkbox: `[x]`

### FS-033
1. issue id: `FS-033`
2. title: User Groups remained server-readable for instructors after the UI was intentionally hidden from them
3. severity: `medium`
4. area: `permissions / user groups`
5. affected user role(s): `Instructor`, `Admin`
6. affected routes/pages/files: `/api/user-groups/*`, `backend/src/app/api/routes/user_groups.py`, `frontend/src/routes/AppRoutes.jsx`, `frontend/src/components/Sidebar/Sidebar.jsx`
7. issue type: `role/permission bug`
8. current broken behavior: After the UI was re-locked to admins, instructors could still call the read-side user-group APIs directly because the backend allowed `Manage Users` instructors on list/detail/member endpoints.
9. expected behavior: If User Groups is admin-only in the visible product, direct backend access should also be admin-only.
10. recommended fix: Tighten the user-group read endpoints to `ADMIN` on the backend and add a focused authorization regression check.
11. status checkbox: `[x]`

### FS-034
1. issue id: `FS-034`
2. title: Favorite Reports could still save or open dead internal routes with no stale-state warning
3. severity: `medium`
4. area: `admin reporting utilities`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/favorite-reports`, `frontend/src/pages/Admin/AdminFavoriteReports/AdminFavoriteReports.jsx`
7. issue type: `broken flow`, `bad route/link`, `broken UX state`
8. current broken behavior: Saved favorites accepted any `/...` path, so stale internal routes remained clickable and could navigate admins into dead pages. The page also lacked an explicit loading state while backend preferences were being restored.
9. expected behavior: Favorite reports should load explicitly, reject unsupported internal routes on save, and mark stale saved entries as needing removal instead of navigating into broken routes.
10. recommended fix: Validate internal favorites against the current supported admin route set, preserve stale entries only as removable records, disable their open action, and add a real loading state while preferences are fetched or migrated.
11. status checkbox: `[x]`

### FS-035
1. issue id: `FS-035`
2. title: Report and certificate downloads still hid backend detail behind generic blob failures
3. severity: `medium`
4. area: `reporting / result downloads`
5. affected user role(s): `Admin`, `Instructor`, `Learner`
6. affected routes/pages/files: `/admin/predefined-reports`, `/admin/report-builder`, `/admin/candidates`, `/admin/tests/:id/manage`, `/attempts/:id`, `frontend/src/pages/Admin/AdminPredefinedReports/AdminPredefinedReports.jsx`, `frontend/src/pages/Admin/AdminCustomReports/AdminCustomReports.jsx`, `frontend/src/pages/Admin/AdminCandidates/AdminCandidates.jsx`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.jsx`, `frontend/src/pages/AttemptResult/AttemptResult.jsx`
7. issue type: `broken UX state`, `frontend/backend mismatch`
8. current broken behavior: Blob-backed CSV/PDF/HTML responses returned opaque failures to the UI, so server-provided `detail` payloads were lost behind generic error copy. The custom report builder also fell back to a misleading "no rows matched" state when the admin simply deselected every column.
9. expected behavior: Download/report actions should surface the real backend error message, and the report builder should tell the admin to select at least one column instead of implying the dataset is empty.
10. recommended fix: Add a small blob-error parsing helper, reuse it across report/certificate download surfaces, and render an explicit no-columns-selected empty state in the report builder.
11. status checkbox: `[x]`

### FS-036
1. issue id: `FS-036`
2. title: System utility pages still allowed edits after settings load failures
3. severity: `medium`
4. area: `admin system settings`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/subscribers`, `/admin/integrations`, `/admin/maintenance`, `frontend/src/pages/Admin/AdminSubscribers/AdminSubscribers.jsx`, `frontend/src/pages/Admin/AdminIntegrations/AdminIntegrations.jsx`, `frontend/src/pages/Admin/AdminMaintenance/AdminMaintenance.jsx`
7. issue type: `broken flow`, `broken UX state`, `missing validation`
8. current broken behavior: If the initial settings fetch failed, those pages still left mutation controls active against empty/default local state, which risked overwriting unknown server configuration on the next save.
9. expected behavior: When settings cannot be loaded, mutation controls should stay disabled and the page should require an explicit retry before edits become available again.
10. recommended fix: Track successful settings bootstrap separately from loading, disable mutation controls until a good read succeeds, and add retry affordances with guidance about why editing remains locked.
11. status checkbox: `[x]`

### FS-037
1. issue id: `FS-037`
2. title: Self-registration still failed closed on transient status errors and lacked confirmation-aware validation
3. severity: `medium`
4. area: `auth / signup`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/signup`, `frontend/src/pages/Auth/SignUp.jsx`, `backend/src/app/api/routes/auth.py`
7. issue type: `broken flow`, `missing validation`, `broken UX state`
8. current broken behavior: If the signup-status check failed once, the page stayed dead with no retry path. The form also had no password-confirmation guard and relied on untrimmed client payloads.
9. expected behavior: Learners should be able to retry the self-registration availability check, get explicit password-confirmation feedback before submit, and send normalized signup payloads that align with backend validation.
10. recommended fix: Add retryable signup-status bootstrapping, confirmation/password-length checks on the client, and trim/lowercase validation on the backend signup request model.
11. status checkbox: `[x]`

### FS-038
1. issue id: `FS-038`
2. title: Learner dashboard and schedule pages still exposed brittle bootstrap states and premature start actions
3. severity: `medium`
4. area: `learner dashboard / schedule`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/`, `/schedule`, `frontend/src/pages/Home/Home.jsx`, `frontend/src/pages/Schedule/Schedule.jsx`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: A dashboard bootstrap failure collapsed the entire learner home page into a dead error block, and the schedule page showed a live `Take Test` button even for future schedules that were not startable yet.
9. expected behavior: The learner home page should stay usable with retry and fallback navigation when dashboard data fails, and future scheduled tests should show an explicit wait state instead of a broken start action.
10. recommended fix: Keep the home shell rendered with fallback stats plus retry/empty states, and gate the schedule-page start button behind the scheduled start time.
11. status checkbox: `[x]`

### FS-039
1. issue id: `FS-039`
2. title: User Groups page still failed hard when one bootstrap dependency errored
3. severity: `medium`
4. area: `admin user management`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/user-groups`, `frontend/src/pages/Admin/AdminUserGroups/AdminUserGroups.jsx`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: The page loaded groups, learners, tests, and schedules in a single all-or-nothing bootstrap. If one request failed, the whole page fell into an ambiguous state with no clear retry path and no indication which actions were unsafe.
9. expected behavior: Group creation/listing should stay usable when possible, while member assignment and bulk scheduling should clearly lock until their dependent data loads successfully.
10. recommended fix: Switch the bootstrap to partial `Promise.allSettled` handling, expose retry guidance, and disable only the member/bulk actions whose backing data is unavailable.
11. status checkbox: `[x]`

### FS-040
1. issue id: `FS-040`
2. title: Testing Sessions still failed closed when lookup data partially errored
3. severity: `medium`
4. area: `admin scheduling`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/sessions`, `frontend/src/pages/Admin/AdminTestingSessions/AdminTestingSessions.jsx`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: The page loaded sessions, schedulable tests, and learners in one all-or-nothing bootstrap. If only the lookup data failed, existing sessions disappeared behind a generic error, and the create-session flow remained ambiguous.
9. expected behavior: Existing sessions should remain visible when possible, and the `New Session` flow should be disabled with explicit retry guidance until its lookup data is safe to use.
10. recommended fix: Switch the page bootstrap to partial `Promise.allSettled` handling, preserve the session list when it loads, and disable create-session actions until session/test/learner data is fully available.
11. status checkbox: `[x]`

### FS-041
1. issue id: `FS-041`
2. title: Attempt Result page still collapsed on partial detail failures and rendered JSON answers raw
3. severity: `medium`
4. area: `learner results / review`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/attempts/:id`, `frontend/src/pages/AttemptResult/AttemptResult.jsx`
7. issue type: `broken flow`, `frontend/backend mismatch`, `broken UX state`
8. current broken behavior: If any secondary fetch for questions, answers, or test metadata failed after the attempt loaded, the whole result page fell back to a fatal load error. Multi-answer values stored as JSON strings also rendered raw instead of readable answer text.
9. expected behavior: The page should keep the main attempt summary visible when only secondary review data fails, expose a retry path for restoring the full review, and render JSON-encoded answer values in a readable format.
10. recommended fix: Load the attempt first, fetch secondary data with partial failure handling, add a warning-level retry affordance, and normalize JSON answer values before rendering review text.
11. status checkbox: `[x]`

### FS-042
1. issue id: `FS-042`
2. title: Attempts list still sent in-progress attempts to the result page instead of the take-test flow
3. severity: `high`
4. area: `learner attempts`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/attempts`, `frontend/src/pages/Attempts/Attempts.jsx`
7. issue type: `broken flow`, `bad route/link`
8. current broken behavior: The attempts table treated every row as a result-page link, so learners clicking an `IN_PROGRESS` attempt were sent to the result screen instead of back into the active test session. Load failures also had no retry action.
9. expected behavior: In-progress attempts should resume at `/attempts/:attemptId/take`, completed attempts should open the result page, and a failed list bootstrap should expose a retry action.
10. recommended fix: Replace row-level navigation with explicit action buttons, route `IN_PROGRESS` attempts to the take-test flow, and add retry support on list-load errors.
11. status checkbox: `[x]`

### FS-043
1. issue id: `FS-043`
2. title: Unclassed native buttons and inputs still fell back to hard-coded browser-default white surfaces
3. severity: `medium`
4. area: `shared UI / theming`
5. affected user role(s): `Admin`, `Instructor`, `Learner`
6. affected routes/pages/files: `frontend/src/styles.scss`, multiple admin utility pages rendering native controls without page-specific classes
7. issue type: `broken UX state`, `naming inconsistency`
8. current broken behavior: Several pages still rendered raw native buttons, selects, and inputs with browser-default white backgrounds because the global stylesheet only normalized typography, not control surfaces.
9. expected behavior: Unclassed native controls should still inherit the product theme so remaining pages do not regress to mismatched white buttons/dropdowns.
10. recommended fix: Add a global fallback theme for unclassed buttons/inputs/selects/textareas while preserving page-level component classes where they already exist.
11. status checkbox: `[x]`

### FS-044
1. issue id: `FS-044`
2. title: Categories CRUD lacked normalized validation, duplicate-safe updates, and retry-safe feedback
3. severity: `medium`
4. area: `admin taxonomy management`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/categories`, `backend/src/app/api/routes/categories.py`, `frontend/src/pages/Admin/AdminCategories/AdminCategories.jsx`, `frontend/src/pages/Admin/AdminCategories/AdminCategories.module.scss`
7. issue type: `missing validation`, `broken flow`, `broken UX state`
8. current broken behavior: Category names were not trimmed consistently, updates could silently collide on duplicate names, and the page had inline error styling with no retry/saving/deleting feedback.
9. expected behavior: Category CRUD should use normalized payloads, reject duplicate names on both create and update, and expose clear loading, retry, success, and busy states.
10. recommended fix: Normalize and uniqueness-check category payloads on the backend, sort the list stably, and harden the page with explicit retry banners plus save/delete busy feedback.
11. status checkbox: `[x]`

### FS-045
1. issue id: `FS-045`
2. title: Grading Scales accepted weak payloads and exposed fake save states for invalid band ranges
3. severity: `medium`
4. area: `admin grading configuration`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/grading-scales`, `backend/src/app/api/routes/grading_scales.py`, `frontend/src/pages/Admin/AdminGradingScales/AdminGradingScales.jsx`, `frontend/src/pages/Admin/AdminGradingScales/AdminGradingScales.module.scss`
7. issue type: `missing validation`, `frontend/backend mismatch`, `broken UX state`
8. current broken behavior: Scale names and band labels were not normalized, duplicate names were allowed, invalid score ranges could reach save attempts, and load failures collapsed into a misleading empty state.
9. expected behavior: Grading scales should reject duplicate/invalid payloads consistently on both client and server and show explicit retry, validation, and delete/save busy feedback.
10. recommended fix: Normalize and validate scale payloads in the backend, add client-side band validation before submit, and harden the page with error/notice banners and busy-state controls.
11. status checkbox: `[x]`

### FS-046
1. issue id: `FS-046`
2. title: Certificates page still lacked a real clear/reset workflow and reliable draft-state handling
3. severity: `medium`
4. area: `admin certificates`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/certificates`, `frontend/src/pages/Admin/AdminCertificates/AdminCertificates.jsx`, `frontend/src/pages/Admin/AdminCertificates/AdminCertificates.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: Certificate fields relied on inline styling, had no retry action on load failure, and could not cleanly remove a saved certificate by clearing all fields because the page always sent an object payload instead of a true clear action.
9. expected behavior: Admins should be able to retry loading, reset draft edits, and remove a certificate cleanly by saving an empty draft as `null`.
10. recommended fix: Normalize certificate drafts, add retry/reset flows, replace inline styles with themed classes, and send `certificate: null` when the draft is fully cleared.
11. status checkbox: `[x]`

### FS-047
1. issue id: `FS-047`
2. title: Question Pools still had dead-feeling retry/delete/create actions and inline fallback UI
3. severity: `medium`
4. area: `admin question banks`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/question-pools`, `frontend/src/pages/Admin/AdminQuestionPools/AdminQuestionPools.jsx`, `frontend/src/pages/Admin/AdminQuestionPools/AdminQuestionPools.module.scss`
7. issue type: `broken UX state`, `broken flow`
8. current broken behavior: List failures surfaced a one-off inline banner with no retry action, create/delete actions had no busy feedback, and question-expansion failures reused the same transient error state in a way that made the page feel unreliable.
9. expected behavior: Question Pools should expose explicit retry, create, delete, and question-loading states with styled feedback instead of inline fallback fragments.
10. recommended fix: Add helper banners, retry controls, create/delete busy states, and explicit expand-loading behavior while removing the inline danger styling.
11. status checkbox: `[x]`

### FS-048
1. issue id: `FS-048`
2. title: Schedules page still lacked a complete assignment form and reliable action-state handling
3. severity: `medium`
4. area: `admin scheduling`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/schedules`, `frontend/src/pages/Admin/AdminSchedules/AdminSchedules.jsx`, `frontend/src/pages/Admin/AdminSchedules/AdminSchedules.module.scss`
7. issue type: `missing UI integration`, `broken UX state`, `broken flow`
8. current broken behavior: The assignment form omitted a visible notes field even though the payload supported it, schedule creation did not require a scheduled time on the client, and delete/create actions lacked busy states and retry-safe loading behavior.
9. expected behavior: Schedules should expose the full visible assignment payload, block incomplete submissions before they hit the backend, and show explicit retry/create/delete states.
10. recommended fix: Add the missing notes input, require `scheduled_at` before enabling assignment, add retry/error banners, and track create/delete busy states in the UI.
11. status checkbox: `[x]`

### FS-049
1. issue id: `FS-049`
2. title: Templates list still hid load failures behind the form state and used inline delete confirmation styling
3. severity: `low`
4. area: `admin templates`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/templates`, `frontend/src/pages/Admin/AdminTemplates/AdminTemplates.jsx`, `frontend/src/pages/Admin/AdminTemplates/AdminTemplates.module.scss`
7. issue type: `broken UX state`
8. current broken behavior: Template-list bootstrap failures reused the form error area instead of exposing a list-level retry, and delete confirmation still depended on inline danger styling with no busy feedback.
9. expected behavior: The list side should have its own retry path and delete actions should show a real busy/confirm state using the page’s theme classes.
10. recommended fix: Split load errors from form-save errors, add a list-level retry row, and replace inline delete confirm styles with class-based danger/busy states.
11. status checkbox: `[x]`

### FS-050
1. issue id: `FS-050`
2. title: New Test Wizard still contained hard-coded white toggle surfaces
3. severity: `low`
4. area: `admin tests / wizard UI`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/tests/new`, `frontend/src/pages/Admin/AdminNewTestWizard/AdminNewTestWizard.module.scss`
7. issue type: `broken UX state`
8. current broken behavior: The wizard still hard-coded white toggle thumb backgrounds, which stood out against themed admin surfaces and were part of the remaining “white control” regressions the user reported.
9. expected behavior: Wizard controls should inherit the app surface tokens instead of using hard-coded white fills.
10. recommended fix: Replace the remaining `#fff` toggle-surface values with themed surface tokens.
11. status checkbox: `[x]`

### FS-051
1. issue id: `FS-051`
2. title: Training Courses still failed too broadly when module lookups errored and left course/module actions weakly stateful
3. severity: `medium`
4. area: `admin courses`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/courses`, `frontend/src/pages/Admin/AdminCourses/AdminCourses.jsx`, `frontend/src/pages/Admin/AdminCourses/AdminCourses.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: A single module lookup failure blanked too much of the page, course create/edit/delete and module add/edit/delete actions lacked distinct busy states, and delete confirmations still depended on inline styling.
9. expected behavior: Courses should remain visible when only a module feed fails, with a warning instead of a full failure, and course/module actions should show explicit busy/confirm states.
10. recommended fix: Partial-load course nodes with warning feedback, split create/save/delete busy states, and replace inline confirm/manage styling with themed classes.
11. status checkbox: `[x]`

### FS-052
1. issue id: `FS-052`
2. title: Surveys still relied on inline question-layout styling and weak response/status/delete action states
3. severity: `medium`
4. area: `admin surveys`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/surveys`, `frontend/src/pages/Admin/AdminSurveys/AdminSurveys.jsx`, `frontend/src/pages/Admin/AdminSurveys/AdminSurveys.module.scss`
7. issue type: `broken UX state`, `broken flow`
8. current broken behavior: The survey builder still used inline layout fragments, list bootstrap errors had no proper retry banner, and response loading, activation, and delete flows lacked distinct busy-state feedback.
9. expected behavior: The survey page should use themed layout classes throughout, expose a retry path for bootstrap failures, and show explicit loading/busy states for responses, activation, and deletion.
10. recommended fix: Move the question/option layout into SCSS modules, add helper banners and retry, and track response/status/delete busy states in the component.
11. status checkbox: `[x]`

### FS-053
1. issue id: `FS-053`
2. title: Question Pool Detail still swallowed load failures and used inline delete-confirm styling
3. severity: `medium`
4. area: `admin question banks`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/question-pools/:id`, `frontend/src/pages/Admin/QuestionPoolDetail/QuestionPoolDetail.jsx`, `frontend/src/pages/Admin/QuestionPoolDetail/QuestionPoolDetail.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: Pool/question bootstrap failures were swallowed into empty state, save/delete actions had no clear success feedback, and delete confirmation still depended on inline red border/color styling.
9. expected behavior: The detail page should show explicit load errors with retry, keep pool details visible when only question loading fails, and use themed delete/save notice states.
10. recommended fix: Switch the bootstrap to partial settled loading, add retry and notice banners, and replace inline delete-confirm styling with class-based controls and busy states.
11. status checkbox: `[x]`

### FS-054
1. issue id: `FS-054`
2. title: Roles & Permissions still depended on inline control styling and had no real reload path after settings bootstrap failures
3. severity: `medium`
4. area: `admin permissions`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/roles-permissions`, `frontend/src/pages/Admin/AdminRolesPermissions/AdminRolesPermissions.jsx`, `frontend/src/pages/Admin/AdminRolesPermissions/AdminRolesPermissions.module.scss`
7. issue type: `broken UX state`, `broken flow`
8. current broken behavior: The page still rendered inline-styled buttons, banners, and checkbox controls, and a failed settings bootstrap left admins on default values without a direct reload action.
9. expected behavior: Permission-matrix controls should use themed classes consistently and a failed bootstrap should expose an explicit reload path before admins decide whether to save defaults.
10. recommended fix: Move action and alert styling into SCSS modules, add a reload action to the warning banner, and keep the dirty/save logic intact.
11. status checkbox: `[x]`

### FS-055
1. issue id: `FS-055`
2. title: Admin Dashboard still relied on passive inline alerts and an implicit row click for risky-attempt analysis
3. severity: `medium`
4. area: `admin dashboard`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/dashboard`, `frontend/src/pages/Admin/AdminDashboard/AdminDashboard.jsx`, `frontend/src/pages/Admin/AdminDashboard/AdminDashboard.module.scss`
7. issue type: `broken UX state`, `broken flow`
8. current broken behavior: Partial and failed dashboard loads only showed passive inline banners, there was no manual refresh action, and risky attempts depended on a row click instead of an explicit action button.
9. expected behavior: Dashboard panels should have a clear retry/refresh path and risky attempts should expose an explicit Analyze action that remains obvious and accessible.
10. recommended fix: Add refresh/retry controls, move alert styling into SCSS modules, and replace the risky-attempt row click affordance with a themed Analyze button.
11. status checkbox: `[x]`

### FS-056
1. issue id: `FS-056`
2. title: Attempt Videos supervision mode still used inline candidate controls and lacked retryable load failures
3. severity: `medium`
4. area: `admin proctoring review`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/videos`, `/admin/videos/:attemptId`, `frontend/src/pages/Admin/AdminAttemptVideos/AdminAttemptVideos.jsx`, `frontend/src/pages/Admin/AdminAttemptVideos/AdminAttemptVideos.module.scss`
7. issue type: `broken UX state`, `broken flow`
8. current broken behavior: The supervision-mode candidate selector still used inline control styling, load errors had no retry action, and refreshing an attempt/video feed required a full page reload.
9. expected behavior: Candidate selection should use themed controls and failed recording loads should offer an explicit retry/refresh action without leaving the page.
10. recommended fix: Move supervision controls into SCSS modules, add refresh/retry buttons, and make loading/error states explicit in the attempt-videos page shell.
11. status checkbox: `[x]`

### FS-057
1. issue id: `FS-057`
2. title: Candidates still had no retryable bootstrap, weak row action states, and reschedule confirmation could be attempted without a date
3. severity: `medium`
4. area: `admin candidates`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/candidates`, `frontend/src/pages/Admin/AdminCandidates/AdminCandidates.jsx`, `frontend/src/pages/Admin/AdminCandidates/AdminCandidates.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: Candidate bootstrap failures only showed a passive message, report downloads and reschedule saves had no row-level busy feedback, and the reschedule panel let admins hit confirm before selecting a date.
9. expected behavior: The page should expose a retry path, track long-running row actions explicitly, and block incomplete reschedule submissions before they reach the API.
10. recommended fix: Add a retry banner, per-row download/save busy states, a disabled reschedule confirm until a date is chosen, and move the remaining inline score/reschedule/import layout into SCSS modules.
11. status checkbox: `[x]`

### FS-058
1. issue id: `FS-058`
2. title: Admin Settings still left unknown configuration editable after load failure and offered no retry path
3. severity: `medium`
4. area: `admin settings`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/settings`, `frontend/src/pages/Admin/AdminSettings/AdminSettings.jsx`, `frontend/src/pages/Admin/AdminSettings/AdminSettings.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: When settings bootstrap failed, the page fell back to empty/default state with no retry button, and self-registration controls could still be toggled against unknown server state.
9. expected behavior: Admin Settings should expose an explicit retry action and keep mutable controls locked until the current server settings are loaded successfully.
10. recommended fix: Split load errors from save errors, add a retry control, and gate self-registration editing behind a successful settings bootstrap.
11. status checkbox: `[x]`

### FS-059
1. issue id: `FS-059`
2. title: New Test Wizard still allowed restricted assignments without a schedule and had unfinished inline save-step controls
3. severity: `medium`
4. area: `admin test wizard`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/tests/new`, `/admin/tests/:id/edit`, `frontend/src/pages/Admin/AdminNewTestWizard/AdminNewTestWizard.jsx`, `frontend/src/pages/Admin/AdminNewTestWizard/AdminNewTestWizard.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: The wizard could save restricted learner assignments without a chosen schedule by defaulting to the current time, and the certificate/session/save steps still relied on inline fragments that made those screens look unfinished.
9. expected behavior: Restricted assignments should require an explicit date/time, and the later wizard steps should use the same themed controls as the rest of the admin UI.
10. recommended fix: Block restricted assignment saves until a scheduled time exists, surface that requirement in the sessions step, and move the visible certificate/session/save-step layout fragments into SCSS module classes.
11. status checkbox: `[x]`

### FS-060
1. issue id: `FS-060`
2. title: Manage Test page still had brittle bootstrap handling, incomplete destructive action states, and inconsistent attempt/session controls
3. severity: `medium`
4. area: `admin test management`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/tests/:id/manage`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.jsx`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.module.scss`
7. issue type: `broken flow`, `broken UX state`, `placeholder action`
8. current broken behavior: A bootstrap failure fell through to a misleading “Test not found” state, delete confirmations had no busy feedback, session assignment could still be attempted before a learner/date was complete, and attempt report/video controls behaved inconsistently across tabs.
9. expected behavior: The page should expose a retry path for failed bootstrap, keep destructive actions explicit and busy-safe, disable incomplete session saves, and use consistent row-action states for report/video/pause flows.
10. recommended fix: Split load failure from not-found handling, add retry affordances, add question/session/test delete busy states, disable incomplete session assignment, and normalize attempt-row action states plus themed inline danger controls.
11. status checkbox: `[x]`

### FS-061
1. issue id: `FS-061`
2. title: New Test Wizard still had visible inline generator/question/grading UI fragments and broken generator labels
3. severity: `medium`
4. area: `admin test wizard`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/tests/new`, `/admin/tests/:id/edit`, `frontend/src/pages/Admin/AdminNewTestWizard/AdminNewTestWizard.jsx`, `frontend/src/pages/Admin/AdminNewTestWizard/AdminNewTestWizard.module.scss`
7. issue type: `broken UX state`, `naming inconsistency`
8. current broken behavior: The generator, question-seeding, time-limit, and grading steps still used inline layout styles, the generator icon/text showed mojibake, and those controls looked inconsistent with the rest of the stabilized admin UI.
9. expected behavior: Wizard steps should use SCSS module classes consistently, preserve the current flow, and render clean labels/text without mojibake.
10. recommended fix: Move the remaining inline generator/question/grading fragments into SCSS module classes, constrain the width-based inputs with reusable classes, and normalize the visible generator labels/text.
11. status checkbox: `[x]`

### FS-062
1. issue id: `FS-062`
2. title: Favorite Reports still had inline banners, no retry path on preference bootstrap failure, and allowed duplicate saved links
3. severity: `medium`
4. area: `admin favorite reports`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/favorite-reports`, `frontend/src/pages/Admin/AdminFavoriteReports/AdminFavoriteReports.jsx`, `frontend/src/pages/Admin/AdminFavoriteReports/AdminFavoriteReports.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: A failed preference load only surfaced a static error, the page still used inline banner styling, and the form allowed the same report link to be saved repeatedly.
9. expected behavior: Favorite Reports should expose a retry action when loading fails, use the themed banner system, and reject duplicate saved links before submit.
10. recommended fix: Split load failure from action errors, add a retry banner, add duplicate-link validation, and give remove actions a real busy state.
11. status checkbox: `[x]`

### FS-063
1. issue id: `FS-063`
2. title: User Groups still had unsafe delete/member action states and visible inline admin fragments
3. severity: `medium`
4. area: `admin user groups`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/user-groups`, `frontend/src/pages/Admin/AdminUserGroups/AdminUserGroups.jsx`, `frontend/src/pages/Admin/AdminUserGroups/AdminUserGroups.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: Group deletion had no busy-safe confirmation, member add/remove buttons stayed interactive during requests, and the bulk assignment section still used leftover inline presentation fragments.
9. expected behavior: Group/member actions should be single-submit safe with explicit busy labels, and the bulk-assignment section should use themed SCSS classes consistently.
10. recommended fix: Add delete/member busy states, disable confirm/cancel while destructive actions are in flight, add clearer empty-state messaging for fully assigned groups, and move the subsection styling into SCSS modules.
11. status checkbox: `[x]`

### FS-064
1. issue id: `FS-064`
2. title: User Profiles still lacked a retryable load failure path and had inline table/modal fragments around destructive actions
3. severity: `medium`
4. area: `admin users`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/users`, `frontend/src/pages/Admin/AdminUsers/AdminUsers.jsx`, `frontend/src/pages/Admin/AdminUsers/AdminUsers.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: User list bootstrap failures only surfaced as passive text, single-user delete actions had no busy-safe state, and the table/modal still relied on inline fragments for code/email/toggle/warning rendering.
9. expected behavior: User Profiles should expose a retry action when loading fails, lock delete controls while the request is running, and render those table/modal fragments through reusable SCSS classes.
10. recommended fix: Add a load-error retry banner, track delete busy state, disable row/modal actions while deleting, and replace the remaining inline table/modal fragments with SCSS classes.
11. status checkbox: `[x]`

### FS-065
1. issue id: `FS-065`
2. title: Attempt Analysis still collapsed secondary data failures into a brittle detail state and kept inline result/heatmap fragments
3. severity: `medium`
4. area: `admin attempt analysis`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/attempt-analysis`, `frontend/src/pages/Admin/AdminAttemptAnalysis/AdminAttemptAnalysis.jsx`, `frontend/src/pages/Admin/AdminAttemptAnalysis/AdminAttemptAnalysis.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: If events or answers failed after the main attempt loaded, the page lost actionable retry behavior and still relied on leftover inline result/heatmap styling fragments.
9. expected behavior: Attempt Analysis should keep the main record visible, warn explicitly when only secondary feeds fail, offer retry without a full page reload, and use themed classes for the result/integrity display.
10. recommended fix: Split attempt-detail loading with `Promise.allSettled`, add list/detail retry controls plus partial-data warnings, and move the remaining answer/result/integrity/heatmap fragments into SCSS modules.
11. status checkbox: `[x]`

### FS-066
1. issue id: `FS-066`
2. title: Testing Sessions still allowed double-submit create/delete actions and had inline status-mode fragments
3. severity: `medium`
4. area: `admin testing sessions`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/sessions`, `frontend/src/pages/Admin/AdminTestingSessions/AdminTestingSessions.jsx`, `frontend/src/pages/Admin/AdminTestingSessions/AdminTestingSessions.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: Session create and delete actions stayed clickable while requests were in flight, making duplicate submissions possible, and the remaining status-dot/mode-row fragments still used ad hoc presentation.
9. expected behavior: Session mutations should be busy-safe, modal close/cancel should respect save state, and the remaining visible status/mode fragments should use themed classes.
10. recommended fix: Add save/delete busy state, lock confirm/cancel while mutations are running, and move status-dot and mode-row presentation into SCSS modules.
11. status checkbox: `[x]`

### FS-067
1. issue id: `FS-067`
2. title: Dashboard KPI cards still relied on inline icon color styling
3. severity: `low`
4. area: `admin dashboard`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/dashboard`, `frontend/src/pages/Admin/AdminDashboard/AdminDashboard.jsx`, `frontend/src/pages/Admin/AdminDashboard/AdminDashboard.module.scss`
7. issue type: `broken UX state`
8. current broken behavior: KPI icon tones were still injected inline, leaving the page inconsistent with the stabilized themed-control pass and harder to maintain.
9. expected behavior: KPI cards should use named tone classes consistently so the remaining dashboard shell is fully theme-driven.
10. recommended fix: Replace inline KPI icon background/color props with explicit tone classes in the dashboard SCSS module.
11. status checkbox: `[x]`

### FS-068
1. issue id: `FS-068`
2. title: Grading Scales still allowed overlapping or duplicate band labels and kept inline label-width/bar fragments
3. severity: `medium`
4. area: `admin grading scales`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/grading-scales`, `backend/src/app/api/routes/grading_scales.py`, `backend/tests/test_stabilization.py`, `frontend/src/pages/Admin/AdminGradingScales/AdminGradingScales.jsx`, `frontend/src/pages/Admin/AdminGradingScales/AdminGradingScales.module.scss`
7. issue type: `missing validation`, `broken UX state`
8. current broken behavior: Grading scales could still be saved with duplicate band labels or overlapping score ranges, and the editor still had visible inline label-width/bar fragments.
9. expected behavior: Grade bands should reject duplicate labels and overlapping ranges on both client and server, and the remaining editor fragments should use module classes where practical.
10. recommended fix: Extend backend normalization to reject duplicate or overlapping bands, mirror that validation in the form, and move the remaining label-width/tone fragments into SCSS-driven classes.
11. status checkbox: `[x]`

### FS-069
1. issue id: `FS-069`
2. title: Rules page still treated failed test-rule bootstrap as a dead end and let native checkbox/button behavior drift from the app state
3. severity: `medium`
4. area: `learner rules page`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/tests/:id/rules`, `frontend/src/pages/RulesPage/RulesPage.jsx`, `frontend/src/pages/RulesPage/RulesPage.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: When rule/config loading failed, the page only fell back silently to default rules and still exposed the start flow without a reliable retry path or explicit readiness gating.
9. expected behavior: Rules bootstrap should expose a retry action, block starting while requirements are unresolved, and keep the acceptance control aligned with the actual start state.
10. recommended fix: Split config load from start-submit state, add retry/error banners, and disable the agreement/start controls until the real rule/config payload is ready.
11. status checkbox: `[x]`

### FS-070
1. issue id: `FS-070`
2. title: Profile page still had unbound labels, browser-native validation interruptions, and weak save-state handling
3. severity: `medium`
4. area: `account profile`
5. affected user role(s): `Admin`, `Instructor`, `Learner`
6. affected routes/pages/files: `/profile`, `/change-password`, `frontend/src/pages/Profile/Profile.jsx`, `frontend/src/pages/Profile/Profile.module.scss`
7. issue type: `missing validation`, `broken UX state`
8. current broken behavior: Profile labels were not associated to their inputs, no-change saves still looked like a submission flow, browser-native required validation could suppress the app’s own password error messages, and edit/cancel controls were not fully aligned with save state.
9. expected behavior: Profile editing should use app-controlled validation, accessible labels, normalized payloads, and explicit busy-safe edit/password actions.
10. recommended fix: Bind labels to inputs, switch forms to explicit app validation, normalize profile payloads before save, surface no-change success cleanly, and lock edit/cancel actions while profile saves are running.
11. status checkbox: `[x]`

### FS-071
1. issue id: `FS-071`
2. title: Learner schedule and result pages still had inconsistent empty/past-state handling
3. severity: `low`
4. area: `learner schedule and results`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/schedule`, `/attempts/:id`, `frontend/src/pages/Schedule/Schedule.jsx`, `frontend/src/pages/Schedule/Schedule.module.scss`, `frontend/src/pages/AttemptResult/AttemptResult.jsx`, `frontend/src/pages/AttemptResult/AttemptResult.module.scss`
7. issue type: `broken UX state`
8. current broken behavior: Past schedule cards still relied on ad hoc presentation, upcoming ordering was inconsistent, and result review screens still had unfinished inline certificate-error handling plus no explicit empty answer-review state.
9. expected behavior: Schedules should render in stable past/upcoming order with themed state cues, and result review should expose explicit empty/error feedback without inline fragments.
10. recommended fix: Sort schedules deterministically, move past-state presentation into SCSS classes, replace inline certificate-error styling, and add an explicit empty answer-review message.
11. status checkbox: `[x]`

### FS-072
1. issue id: `FS-072`
2. title: Proctoring still collapsed bootstrap failures into hard stops and could not recover from missing saved-answer restoration
3. severity: `high`
4. area: `learner proctoring`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/attempts/:attemptId/take`, `frontend/src/pages/Proctoring/Proctoring.jsx`, `frontend/src/pages/Proctoring/Proctoring.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: A failed test/question bootstrap stranded the page without retry, saved-answer restoration failures looked like full-page failure, and no-question attempts had no explicit empty state.
9. expected behavior: Proctoring should expose retryable bootstrap errors, keep the attempt usable when only saved answers fail to restore, and render a clear empty state when no questions are available.
10. recommended fix: Split bootstrap with `Promise.allSettled`, add retry and warning states, keep the main test render alive on partial restoration failures, and add an explicit no-questions fallback.
11. status checkbox: `[x]`

### FS-073
1. issue id: `FS-073`
2. title: System Check still had no retry path for test requirements and no manual re-run for device checks
3. severity: `medium`
4. area: `learner precheck`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/tests/:id/system-check`, `frontend/src/pages/SystemCheckPage/SystemCheckPage.jsx`, `frontend/src/pages/SystemCheckPage/SystemCheckPage.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: If requirement bootstrap failed, the learner was stuck on a dead precheck state, and there was no explicit way to re-run camera/mic/fullscreen checks after fixing device permissions.
9. expected behavior: System Check should expose a retry button for requirement loading and a clear re-run path for device checks before continuing.
10. recommended fix: Extract requirement loading into a retryable action, add a manual re-run checks button, and move the new helper/error controls into themed SCSS classes.
11. status checkbox: `[x]`

### FS-074
1. issue id: `FS-074`
2. title: Identity verification still exposed incomplete button gating and no retry path when requirement loading failed
3. severity: `medium`
4. area: `learner identity verification`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/tests/:id/verify-identity`, `frontend/src/pages/VerifyIdentityPage/VerifyIdentityPage.jsx`, `frontend/src/pages/VerifyIdentityPage/VerifyIdentityPage.module.scss`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: Failed requirement bootstrap only showed an error, capture/upload controls could still appear actionable against unresolved config, and the confirm button was available before the learner had both required images ready.
9. expected behavior: Identity verification should expose a retry path, disable capture/confirm actions until requirements are loaded, and only allow confirmation when both selfie and ID evidence exist.
10. recommended fix: Extract requirement loading into a retryable action, gate capture/retake/confirm buttons behind resolved config and evidence presence, and bind the ID-number label/input cleanly.
11. status checkbox: `[x]`

### FS-075
1. issue id: `FS-075`
2. title: Not Found and Maintenance pages still relied on inline shell styling instead of the shared theme system
3. severity: `low`
4. area: `global fallback pages`
5. affected user role(s): `Admin`, `Instructor`, `Learner`
6. affected routes/pages/files: `/maintenance`, fallback route, `frontend/src/pages/Maintenance/Maintenance.jsx`, `frontend/src/pages/Maintenance/Maintenance.module.scss`, `frontend/src/pages/NotFound/NotFound.jsx`, `frontend/src/pages/NotFound/NotFound.module.scss`
7. issue type: `broken UX state`
8. current broken behavior: The fallback pages still used raw inline layout/button styles, making them visually inconsistent with the stabilized themed surfaces and harder to maintain.
9. expected behavior: Fallback pages should use SCSS module classes and the shared color tokens just like the rest of the app shell.
10. recommended fix: Move the inline layout/typography/button styling into dedicated SCSS modules and keep the visible fallback routes theme-driven.
11. status checkbox: `[x]`

### FS-076
1. issue id: `FS-076`
2. title: Learner Home still assumed every fulfilled dashboard response had a usable payload and showed broken CTA/icon text
3. severity: `medium`
4. area: `learner dashboard`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/`, `frontend/src/pages/Home/Home.jsx`, `frontend/src/pages/Home/Home.test.jsx`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: If the dashboard endpoint resolved without the expected `data` object, the page could throw into an unhandled error path; the visible summary icons and CTA copy also still contained broken encoded text.
9. expected behavior: The learner home screen should fall back cleanly on malformed dashboard responses, keep retry/navigation usable, and render readable summary copy.
10. recommended fix: Normalize fulfilled dashboard responses defensively, keep malformed responses on the retry/fallback path, and replace the remaining broken CTA/icon strings with stable copy.
11. status checkbox: `[x]`

### FS-077
1. issue id: `FS-077`
2. title: Attempts and Schedule still exposed ambiguous status queries and vague future-start CTA copy
3. severity: `low`
4. area: `learner attempts and schedule`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/attempts`, `/schedule`, `frontend/src/pages/Attempts/Attempts.jsx`, `frontend/src/pages/Attempts/Attempts.test.jsx`, `frontend/src/pages/Schedule/Schedule.jsx`
7. issue type: `broken UX state`
8. current broken behavior: Attempts reused visible labels in multiple places without accessible stat hooks, making the page harder to verify and maintain, while future schedules still showed a generic disabled action that did not explain why the test could not start yet.
9. expected behavior: Attempts summary values should be queryable/accessibly labeled, visible sort/pagination/certificate copy should be clean, and future schedules should tell learners that the test opens at the scheduled time.
10. recommended fix: Add explicit labels for summary values, clean the remaining visible copy, and rename the disabled schedule CTA to a time-based explanation.
11. status checkbox: `[x]`

### FS-078
1. issue id: `FS-078`
2. title: Shared shell/admin action buttons still relied on implicit submit semantics and Admin Users modals could close mid-mutation
3. severity: `medium`
4. area: `shared navigation and admin users`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: shared shell, `/admin/settings`, `/admin/users`, `/admin/user-groups`, `frontend/src/components/Sidebar/Sidebar.jsx`, `frontend/src/components/Navbar/Navbar.jsx`, `frontend/src/pages/Admin/AdminSettings/AdminSettings.jsx`, `frontend/src/pages/Admin/AdminUsers/AdminUsers.jsx`, `frontend/src/pages/Admin/AdminUserGroups/AdminUserGroups.jsx`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: Several click actions were still rendered as implicit submit buttons, which is brittle inside forms/modals, and the Admin Users modal overlay could still be dismissed while save or password-reset work was running.
9. expected behavior: Non-submit actions should use explicit button types, and mutation-driven modals should stay open until the active save/delete/reset completes.
10. recommended fix: Add `type="button"` to non-submit controls across the shared shell/admin surfaces and gate Admin Users modal dismissal on active save/reset/delete state.
11. status checkbox: `[x]`

### FS-079
1. issue id: `FS-079`
2. title: Favorite Reports still used a click-only add action without form semantics or route guidance
3. severity: `low`
4. area: `admin favorite reports`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/favorite-reports`, `frontend/src/pages/Admin/AdminFavoriteReports/AdminFavoriteReports.jsx`
7. issue type: `missing UI integration`, `broken UX state`
8. current broken behavior: Adding a favorite depended on clicking the save button directly, so keyboard-submit behavior was inconsistent, and the page did not explain the accepted route formats next to the form.
9. expected behavior: Favorite Reports should submit from a real form, support Enter-key save, and explain the accepted public URL or admin-route formats inline.
10. recommended fix: Wrap the add surface in a submit form, keep row actions explicitly non-submit, and add helper copy describing supported routes.
11. status checkbox: `[x]`

### FS-080
1. issue id: `FS-080`
2. title: Admin Users default sorting pushed newly created users off the first page during the live CRUD workflow
3. severity: `medium`
4. area: `admin users`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/users`, `frontend/src/pages/Admin/AdminUsers/AdminUsers.jsx`
7. issue type: `broken flow`
8. current broken behavior: After creating a new learner, the page stayed sorted alphabetically, so the new record could land outside the current page and break the immediate edit/verify path in browser CRUD flows.
9. expected behavior: Newly created users should remain visible on the first page by default so admins can verify and continue editing without manual filtering.
10. recommended fix: Default the listing to newest-first ordering so recent creates stay visible and the CRUD flow remains contiguous.
11. status checkbox: `[x]`

### FS-081
1. issue id: `FS-081`
2. title: Favorite Reports duplicate validation blocked distinct shortcuts that pointed to the same admin route
3. severity: `low`
4. area: `admin favorite reports`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/favorite-reports`, `frontend/src/pages/Admin/AdminFavoriteReports/AdminFavoriteReports.jsx`, `frontend/src/pages/Admin/AdminFavoriteReports/AdminFavoriteReports.test.jsx`
7. issue type: `missing validation`, `broken UX state`
8. current broken behavior: Saving a new favorite failed whenever the route already existed, even if the admin intentionally wanted a different display title for the same destination.
9. expected behavior: Favorite Reports should only reject exact duplicates, not a different shortcut title that points to the same valid route.
10. recommended fix: Tighten duplicate detection to the title-plus-link combination and keep unit/browser coverage on the multi-title same-route case.
11. status checkbox: `[x]`

### FS-082
1. issue id: `FS-082`
2. title: Manage Test settings still leaked browser-default controls and advertised published-test review toggles the backend would not save
3. severity: `medium`
4. area: `admin manage test`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/tests/:id/manage`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.jsx`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.module.scss`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.test.jsx`
7. issue type: `frontend/backend mismatch`, `broken UX state`, `missing validation`
8. current broken behavior: The settings tab still left its main-page selects on browser-default styling, header action buttons could fall back to raw native button chrome, published tests exposed candidate-review toggles even though the backend refuses runtime-setting mutations after publish, and coupon/external-attribute inputs allowed invalid combinations until the API rejected them.
9. expected behavior: Manage Test should keep its settings controls fully themed, only expose editable fields that the backend will actually persist for published tests, and block invalid coupon/runtime metadata combinations before submit.
10. recommended fix: Style the remaining native controls in the settings shell, disable published-only runtime review toggles, and add explicit frontend validation for coupon, pause/retake, score, and external-attribute payloads.
11. status checkbox: `[x]`

### FS-083
1. issue id: `FS-083`
2. title: The main Tests list still depended on native confirm/delete flow and weak empty-error-report states
3. severity: `medium`
4. area: `admin tests list`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/tests`, `frontend/src/pages/Admin/AdminExams/AdminExams.jsx`, `frontend/src/pages/Admin/AdminExams/AdminExams.module.scss`, `frontend/src/pages/Admin/AdminExams/AdminExams.test.jsx`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: Deleting a test still used `window.confirm`, report preview did not explain popup-block failures, the page lacked explicit retry/refresh handling around list failures, and the empty state stayed too thin for either “no tests yet” or “filters removed every row”.
9. expected behavior: The Tests list should use in-app confirmation/busy states, expose retry and clear-filter recovery, and distinguish between a genuinely empty workspace and a filtered-empty result set.
10. recommended fix: Replace native delete confirmation with row-level confirm/cancel controls, add retry/refresh/clear-filter actions plus stronger empty states, and surface popup-blocked report previews explicitly.
11. status checkbox: `[x]`

### FS-084
1. issue id: `FS-084`
2. title: Integrations settings still treated all outbound tests as one global action and accepted weak webhook configuration
3. severity: `medium`
4. area: `admin integrations`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/integrations`, `backend/src/app/api/routes/admin_settings.py`, `backend/tests/test_stabilization.py`, `frontend/src/pages/Admin/AdminIntegrations/AdminIntegrations.jsx`, `frontend/src/pages/Admin/AdminIntegrations/AdminIntegrations.test.jsx`
7. issue type: `frontend/backend mismatch`, `missing validation`, `broken flow`
8. current broken behavior: Each integration card exposed its own `Send Test` action, but the page still tested the whole configuration globally, hidden non-MVP providers could leak into the saved payload, and backend settings accepted non-HTTP webhook URLs that would never work at runtime.
9. expected behavior: Each visible integration card should test only its own draft configuration, hidden non-MVP providers should stay out of the current workflow, and both frontend and backend should reject malformed webhook URLs before save/test.
10. recommended fix: Limit the visible integrations to the current webhook-backed MVP set, add per-card test state/results, trim and validate HTTP(S) URLs on both client and server, and cover the flow with focused regression tests.
11. status checkbox: `[x]`

### FS-085
1. issue id: `FS-085`
2. title: Custom Reports still lacked recovery detail when preview loading failed and stayed too thin for active filter/export workflows
3. severity: `medium`
4. area: `admin custom reports`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/custom-reports`, `frontend/src/pages/Admin/AdminCustomReports/AdminCustomReports.jsx`, `frontend/src/pages/Admin/AdminCustomReports/AdminCustomReports.module.scss`, `frontend/src/pages/Admin/AdminCustomReports/AdminCustomReports.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: A failed preview load only surfaced a generic error state without an explicit retry path, export could remain available against an unknown preview state, and the page gave admins very little detail about the active dataset, selected columns, or matching rows.
9. expected behavior: Custom Reports should expose a retryable preview error, keep export blocked while preview state is unresolved, and show compact detail about the selected dataset, column count, and matching rows so the builder feels complete rather than bare.
10. recommended fix: Split preview errors from export errors, add retry/clear-filter controls plus dataset summary chips, and expand regression coverage around preview recovery.
11. status checkbox: `[x]`

### FS-086
1. issue id: `FS-086`
2. title: Audit Log and Predefined Reports still felt too thin and relied on weak interaction detail
3. severity: `low`
4. area: `admin audit and predefined reports`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/audit-log`, `/admin/predefined-reports`, `frontend/src/pages/Admin/AdminAuditLog/AdminAuditLog.jsx`, `frontend/src/pages/Admin/AdminAuditLog/AdminAuditLog.module.scss`, `frontend/src/pages/Admin/AdminAuditLog/AdminAuditLog.test.jsx`, `frontend/src/pages/Admin/AdminPredefinedReports/AdminPredefinedReports.jsx`, `frontend/src/pages/Admin/AdminPredefinedReports/AdminPredefinedReports.module.scss`, `frontend/src/pages/Admin/AdminPredefinedReports/AdminPredefinedReports.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Audit Log expansion depended on clicking the whole row with very little summary context, and Predefined Reports only showed a title plus generate button, which made those utility pages look unfinished and lacking practical detail.
9. expected behavior: Audit Log should show compact loaded-page/actor/action counts with an explicit detail toggle, and Predefined Reports should explain what each report contains, who it is for, and confirm when a download starts.
10. recommended fix: Add summary cards and explicit view-detail actions to Audit Log, enrich Predefined Report cards with metadata chips/helper copy, and add regression tests for the richer interactions.
11. status checkbox: `[x]`

### FS-087
1. issue id: `FS-087`
2. title: Subscribers and Reports utility pages still needed safer bulk-detail workflows during admin operations
3. severity: `low`
4. area: `admin utility pages`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/subscribers`, `/admin/reports`, `frontend/src/pages/Admin/AdminSubscribers/AdminSubscribers.jsx`, `frontend/src/pages/Admin/AdminReports/AdminReports.jsx`, `frontend/src/pages/Admin/AdminReports/AdminReports.module.scss`
7. issue type: `broken UX state`, `missing validation`
8. current broken behavior: Subscribers only handled one address at a time and did not normalize duplicates well enough for copy-pasted recipient lists, while Scheduled Reports still looked sparse around create/reset metadata and delete confirmation detail.
9. expected behavior: Subscribers should normalize multi-email input safely, and Scheduled Reports should expose fuller schedule metadata plus explicit reset and delete-confirm flows that match the rest of the stabilized admin utility pages.
10. recommended fix: Normalize/dedupe subscriber inputs, add confirmation-aware remove flow, and enrich Scheduled Reports with reset actions, created/last-run detail, and in-app delete confirmation.
11. status checkbox: `[x]`

### FS-088
1. issue id: `FS-088`
2. title: The wizard’s embedded question editor still behaved like a stub instead of a production-ready authoring surface
3. severity: `medium`
4. area: `admin new test wizard`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/tests/new`, `/admin/tests/:id/edit`, `frontend/src/pages/Admin/ExamQuestionPanel/ExamQuestionPanel.jsx`, `frontend/src/pages/Admin/ExamQuestionPanel/ExamQuestionPanel.module.scss`, `frontend/src/pages/Admin/ExamQuestionPanel/ExamQuestionPanel.test.jsx`, `frontend/tests/e2e/admin-wizard.spec.js`
7. issue type: `missing UI integration`, `missing validation`, `broken UX state`
8. current broken behavior: The question editor only exposed a single generic add button, lacked save/delete busy states, gave very little detail about the current question set, and let admins attempt invalid MCQ saves before the backend rejected them.
9. expected behavior: The wizard should expose explicit question-type quick-add actions, show current question/points detail, validate answer options before submit, and keep save/delete interactions explicit and busy-safe.
10. recommended fix: Replace the single add control with question-type quick-add actions, add summary/detail chips plus option previews, validate points/options/correct answers on the client, and update browser coverage to the new explicit add flow.
11. status checkbox: `[x]`

### FS-089
1. issue id: `FS-089`
2. title: Maintenance mode settings still looked bare and lacked enough detail about the impact of each mode
3. severity: `low`
4. area: `admin maintenance`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/maintenance`, `frontend/src/pages/Admin/AdminMaintenance/AdminMaintenance.jsx`, `frontend/src/pages/Admin/AdminMaintenance/AdminMaintenance.module.scss`, `frontend/src/pages/Admin/AdminMaintenance/AdminMaintenance.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Maintenance mode only exposed a select, textarea, and save button, without reset behavior, impact preview, trimmed-banner handling, or enough explanation of what `read-only` versus `down` actually does for users.
9. expected behavior: Maintenance settings should expose clear mode impact, a live preview of the banner users will see, reset behavior for dirty drafts, and stable trimmed payloads on save.
10. recommended fix: Add mode metadata/preview cards, reset handling, accessible bound labels, trimmed-banner persistence, and focused regression coverage around the new flow.
11. status checkbox: `[x]`

### FS-090
1. issue id: `FS-090`
2. title: Candidates still felt too thin across filtering, proctoring, and CSV import workflows
3. severity: `medium`
4. area: `admin candidates`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/candidates`, `frontend/src/pages/Admin/AdminCandidates/AdminCandidates.jsx`, `frontend/src/pages/Admin/AdminCandidates/AdminCandidates.module.scss`, `frontend/src/pages/Admin/AdminCandidates/AdminCandidates.test.jsx`
7. issue type: `broken UX state`, `missing validation`, `incomplete business logic`
8. current broken behavior: Candidates only exposed a raw attempt table with weak empty-state detail, filtered results were indistinguishable from no data, proctoring rows hid alert counts, CSV import allowed previews with missing required headers, and pagination/sort copy still showed mojibake.
9. expected behavior: Candidates should expose summary detail for each tab, make filtered-vs-empty states explicit, surface per-attempt risk context, block incomplete CSV imports before submit, and use clean themed controls and copy throughout the page.
10. recommended fix: Add summary cards plus refresh/clear-filter actions, show risk detail in attempts/proctoring tables, validate CSV preview headers before enabling import, add preview reset, and cover the new filter/import recovery behavior with focused regression tests.
11. status checkbox: `[x]`

### FS-091
1. issue id: `FS-091`
2. title: User Profiles still looked sparse and used older raw filter controls
3. severity: `medium`
4. area: `admin users`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/users`, `frontend/src/pages/Admin/AdminUsers/AdminUsers.jsx`, `frontend/src/pages/Admin/AdminUsers/AdminUsers.module.scss`, `frontend/src/pages/Admin/AdminUsers/AdminUsers.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: User Profiles exposed only a flat filter bar and table, used older dark fallback backgrounds on search/select controls, treated no-results and no-data as the same state, and gave admins no summary context or quick recovery for active filters.
9. expected behavior: User Profiles should show summary context for total/active/visible users, use fully themed controls, expose explicit refresh/clear-filter actions, and distinguish an empty workspace from a filtered empty result.
10. recommended fix: Add summary cards and role chips, move filters into a recovery-aware toolbar panel, replace the older raw control backgrounds with theme tokens, and cover filter-empty recovery with focused regression tests.
11. status checkbox: `[x]`

### FS-092
1. issue id: `FS-092`
2. title: Testing Sessions still used weak filter recovery, broken copy, and older raw schedule controls
3. severity: `medium`
4. area: `admin testing sessions`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/sessions`, `frontend/src/pages/Admin/AdminTestingSessions/AdminTestingSessions.jsx`, `frontend/src/pages/Admin/AdminTestingSessions/AdminTestingSessions.module.scss`, `frontend/src/pages/Admin/AdminTestingSessions/AdminTestingSessions.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Testing Sessions still exposed older dark fallback backgrounds on search and modal controls, the sort and pagination labels showed mojibake, filtered-empty results were indistinguishable from a truly empty schedule, and the page lacked the summary context and recovery actions that the other stabilized admin lists now expose.
9. expected behavior: Testing Sessions should show a richer scheduling summary, use fully themed search and form controls, distinguish filtered-empty results from a genuinely empty schedule, clamp pagination safely after data changes, and expose clean recovery actions with readable copy.
10. recommended fix: Add summary cards plus refresh and clear-filter actions, replace the older raw control backgrounds with theme tokens, normalize the sort and pagination labels to clean ASCII copy, add richer session detail on each card, and cover filtered-empty recovery with focused regression tests.
11. status checkbox: `[x]`

### FS-093
1. issue id: `FS-093`
2. title: Shared search and dropdown controls still had leftover fallback backgrounds across app shell and learner pages
3. severity: `low`
4. area: `shared controls`
5. affected user role(s): `Admin`, `Instructor`, `Learner`
6. affected routes/pages/files: `frontend/src/components/Navbar/Navbar.module.scss`, `frontend/src/pages/Attempts/Attempts.module.scss`, `frontend/src/pages/Schedule/Schedule.module.scss`, `frontend/src/pages/Admin/AdminSurveys/AdminSurveys.module.scss`
7. issue type: `broken UX state`, `naming inconsistency`
8. current broken behavior: Even after the larger admin passes, the shared navbar search and a few learner/admin search or select controls still used the older hard-coded fallback background instead of the active theme tokens, which made those surfaces look inconsistent beside the newer management pages.
9. expected behavior: Shared search and select controls should inherit the same themed background tokens and option styling as the rest of the stabilized UI so dropdowns and search boxes no longer drift back to raw fallback colors.
10. recommended fix: Replace the remaining fallback control backgrounds in the shared navbar, attempts list, schedule page, and surveys page with theme tokens, and keep dropdown option surfaces aligned with the active theme.
11. status checkbox: `[x]`

### FS-094
1. issue id: `FS-094`
2. title: Categories still looked like an older utility page and used broken list copy
3. severity: `medium`
4. area: `admin categories`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/categories`, `frontend/src/pages/Admin/AdminCategories/AdminCategories.jsx`, `frontend/src/pages/Admin/AdminCategories/AdminCategories.module.scss`, `frontend/src/pages/Admin/AdminCategories/AdminCategories.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Categories still used an older flat toolbar, raw input backgrounds, mojibake sort and pagination labels, and broad empty states that did not distinguish filter results from an actually empty category list.
9. expected behavior: Categories should expose summary context, clean filter recovery, readable list copy, and themed controls consistent with the other stabilized admin management pages.
10. recommended fix: Add summary cards, refresh and clear-filter actions, explicit filtered-empty and no-data states, clean sort and pagination labels, and focused regression coverage for retry and filter recovery.
11. status checkbox: `[x]`

### FS-095
1. issue id: `FS-095`
2. title: Question Pools still felt thin across search, summary, and empty-state handling
3. severity: `medium`
4. area: `admin question pools`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/question-pools`, `frontend/src/pages/Admin/AdminQuestionPools/AdminQuestionPools.jsx`, `frontend/src/pages/Admin/AdminQuestionPools/AdminQuestionPools.module.scss`, `frontend/src/pages/Admin/AdminQuestionPools/AdminQuestionPools.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Question Pools still relied on a minimal list header, raw search styling, broken sort label text, and empty states that offered very little recovery context or authoring detail beyond the card title.
9. expected behavior: Question Pools should show summary context, refresh and clear-filter recovery, richer card detail, explicit filtered-empty behavior, and themed controls aligned with the rest of the admin authoring surfaces.
10. recommended fix: Add summary cards and filter meta, replace the older search styling and broken sort copy, expand card metadata for read-only and question-count context, and cover filter-empty recovery with focused regression tests.
11. status checkbox: `[x]`

### FS-096
1. issue id: `FS-096`
2. title: Grading Scales still had leftover fallback control backgrounds
3. severity: `low`
4. area: `admin grading scales`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/grading-scales`, `frontend/src/pages/Admin/AdminGradingScales/AdminGradingScales.module.scss`
7. issue type: `broken UX state`
8. current broken behavior: The grading-scale editor and search box still used the older fallback background token instead of the themed control surface used elsewhere in the stabilized admin UI.
9. expected behavior: Grading-scale search and editor inputs should use the same themed control surfaces as the rest of the admin pages.
10. recommended fix: Replace the remaining fallback backgrounds in the grading-scale search and band editor inputs with the current theme token surfaces.
11. status checkbox: `[x]`

### FS-097
1. issue id: `FS-097`
2. title: Grading Scales still felt too plain and offered weak filter recovery despite the earlier validation hardening
3. severity: `medium`
4. area: `admin grading scales`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/grading-scales`, `frontend/src/pages/Admin/AdminGradingScales/AdminGradingScales.jsx`, `frontend/src/pages/Admin/AdminGradingScales/AdminGradingScales.module.scss`, `frontend/src/pages/Admin/AdminGradingScales/AdminGradingScales.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Grading Scales still behaved like a narrow utility form with no summary context, no explicit filter recovery, and no distinction between a filtered-empty view and a truly empty scale list.
9. expected behavior: Grading Scales should expose summary context, readable sort/filter recovery, and explicit filtered-empty states so the page behaves like the rest of the finished admin management surfaces.
10. recommended fix: Add summary cards, sort and clear-filter actions, filter result meta text, explicit no-results versus no-data states, and regression coverage for restoring the list after filter-empty results.
11. status checkbox: `[x]`

### FS-098
1. issue id: `FS-098`
2. title: Manage Test proctoring still relied on a sparse monitoring table with weak filter recovery
3. severity: `medium`
4. area: `admin manage test`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/tests/:id/manage`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.jsx`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.module.scss`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.test.jsx`
7. issue type: `broken UX state`, `incomplete business logic`
8. current broken behavior: The proctoring tab showed only a raw monitoring table, did not surface summary context for paused or flagged attempts, and gave weak recovery when session or column filters removed every row.
9. expected behavior: The proctoring tab should expose monitoring summary cards, explicit refresh and clear-filter recovery, and separate filtered-empty versus no-attempts states so proctors can understand and recover the current view quickly.
10. recommended fix: Add monitoring summary cards, a real toolbar with refresh and clear-filter actions, explicit filtered-empty messaging, and focused regression coverage for restoring attempts after filter-driven empty results.
11. status checkbox: `[x]`

### FS-099
1. issue id: `FS-099`
2. title: Schedules still behaved like a bare assignment utility instead of a complete admin management page
3. severity: `medium`
4. area: `admin schedules`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/schedules`, `frontend/src/pages/Admin/AdminSchedules/AdminSchedules.jsx`, `frontend/src/pages/Admin/AdminSchedules/AdminSchedules.module.scss`, `frontend/src/pages/Admin/AdminSchedules/AdminSchedules.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Schedules only exposed a flat assignment form and raw table, kept the older fallback control surface, and gave no summary context or explicit recovery when search and mode filters narrowed the list to zero rows.
9. expected behavior: Schedules should show summary cards, themed filter controls, explicit refresh and clear-filter recovery, and separate filtered-empty versus no-data states so admins can manage assignment windows confidently.
10. recommended fix: Add summary cards, search and mode filters with result meta, replace the remaining fallback control background with theme tokens, and cover filtered-empty recovery with focused regression tests.
11. status checkbox: `[x]`

### FS-100
1. issue id: `FS-100`
2. title: Templates still felt too plain and lacked ownership-aware filtering or recovery
3. severity: `medium`
4. area: `admin templates`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/templates`, `frontend/src/pages/Admin/AdminTemplates/AdminTemplates.jsx`, `frontend/src/pages/Admin/AdminTemplates/AdminTemplates.module.scss`, `frontend/src/pages/Admin/AdminTemplates/AdminTemplates.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Templates still showed only a basic form and list, provided no summary context, and lacked search, ownership filtering, or explicit recovery when filtering removed every row.
9. expected behavior: Templates should expose summary context, ownership-aware filtering, readable row metadata, and explicit filtered-empty recovery so admins and instructors can distinguish owned templates from shared read-only ones quickly.
10. recommended fix: Add summary cards, search and ownership filters, sort and refresh actions, row metadata for ownership/config detail, and focused regression coverage for clearing filter-empty states.
11. status checkbox: `[x]`

### FS-101
1. issue id: `FS-101`
2. title: Favorite Reports still behaved like a basic link list instead of a finished shortcut manager
3. severity: `medium`
4. area: `admin favorite reports`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/favorite-reports`, `frontend/src/pages/Admin/AdminFavoriteReports/AdminFavoriteReports.jsx`, `frontend/src/pages/Admin/AdminFavoriteReports/AdminFavoriteReports.module.scss`, `frontend/src/pages/Admin/AdminFavoriteReports/AdminFavoriteReports.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Favorite Reports only exposed a flat add form and list, with no summary context, no search or type filtering, and no explicit recovery when filters should narrow the shortcuts to zero rows.
9. expected behavior: Favorite Reports should expose saved shortcut detail, type-aware filtering, refresh and clear-filter recovery, and explicit filtered-empty states so admins can manage stale, external, and internal shortcuts cleanly.
10. recommended fix: Add summary cards, search and type filters, filter result meta, richer row metadata, and regression coverage for filter-empty recovery.
11. status checkbox: `[x]`

### FS-102
1. issue id: `FS-102`
2. title: Report Builder schedule management still looked too plain and lacked filtering/detail recovery
3. severity: `medium`
4. area: `admin reports`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/reports`, `frontend/src/pages/Admin/AdminReports/AdminReports.jsx`, `frontend/src/pages/Admin/AdminReports/AdminReports.module.scss`, `frontend/src/pages/Admin/AdminReports/AdminReports.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Scheduled Reports only exposed a flat list and create form, without summary context, search/report-type filtering, or explicit recovery when active filters hid every schedule row.
9. expected behavior: Report Builder should expose schedule health context, filter and refresh recovery, and clear filtered-empty versus no-data states so admins can manage automated report runs with the same density as the rest of the admin shell.
10. recommended fix: Add summary cards, search and report-type filters, result meta, explicit filtered-empty recovery, and focused regression coverage for restoring schedules after filters are cleared.
11. status checkbox: `[x]`

### FS-103
1. issue id: `FS-103`
2. title: Several learner and admin pages still used fallback raw surface colors instead of the stabilized theme tokens
3. severity: `low`
4. area: `shared UI surfaces`
5. affected user role(s): `Admin`, `Instructor`, `Learner`
6. affected routes/pages/files: `frontend/src/pages/ExamInstructions/ExamInstructions.module.scss`, `frontend/src/pages/Proctoring/Proctoring.module.scss`, `frontend/src/pages/Profile/Profile.module.scss`, `frontend/src/pages/Admin/AdminAttemptAnalysis/AdminAttemptAnalysis.module.scss`, `frontend/src/pages/Admin/AdminExams/AdminExams.module.scss`, `frontend/src/pages/Attempts/Attempts.module.scss`, `frontend/src/pages/Admin/AdminCustomReports/AdminCustomReports.module.scss`, `frontend/src/pages/Admin/AdminRolesPermissions/AdminRolesPermissions.module.scss`
7. issue type: `broken UX state`
8. current broken behavior: Even after the broader admin passes, several learner/admin inputs, detail cards, filter panels, and table headers still used the older hard-coded fallback surfaces instead of the current theme tokens, which made those areas look inconsistent beside the stabilized pages.
9. expected behavior: Remaining visible controls and supporting surfaces should inherit the same theme tokens as the rest of the product so the UI no longer drifts back to raw fallback backgrounds.
10. recommended fix: Replace the remaining fallback surface colors in those learner/admin SCSS modules with `var(--color-bg)` or themed `color-mix` surfaces and verify with a targeted scan.
11. status checkbox: `[x]`

### FS-104
1. issue id: `FS-104`
2. title: Subscribers still behaved like a bare email list instead of a complete recipient-management page
3. severity: `medium`
4. area: `admin subscribers`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/subscribers`, `frontend/src/pages/Admin/AdminSubscribers/AdminSubscribers.jsx`, `frontend/src/pages/Admin/AdminSubscribers/AdminSubscribers.module.scss`, `frontend/src/pages/Admin/AdminSubscribers/AdminSubscribers.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Subscribers only exposed a flat add row and list, with no summary context, no search, and no explicit recovery when an admin wanted to narrow the recipient list to a subset or restore it afterward.
9. expected behavior: Subscribers should expose summary context, search recovery, richer row detail, and separate filtered-empty versus no-data states so report recipients can be managed like the other stabilized admin lists.
10. recommended fix: Add summary cards, search and clear-filter recovery, result meta, per-row domain detail, and focused regression coverage for restoring the recipient list after filter-empty results.
11. status checkbox: `[x]`

### FS-105
1. issue id: `FS-105`
2. title: Integrations still looked like disconnected settings cards without summary or filter context
3. severity: `medium`
4. area: `admin integrations`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/integrations`, `frontend/src/pages/Admin/AdminIntegrations/AdminIntegrations.jsx`, `frontend/src/pages/Admin/AdminIntegrations/AdminIntegrations.module.scss`, `frontend/src/pages/Admin/AdminIntegrations/AdminIntegrations.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Integrations only exposed individual settings cards, with no top-level summary, no search or status filtering, and no explicit recovery when an admin needed to isolate enabled or dirty integration cards.
9. expected behavior: Integrations should expose summary context, search and status filters, richer card status detail, and explicit filtered-empty recovery so admins can manage multiple providers without scanning every card manually.
10. recommended fix: Add summary cards, search and status filters, status chips for enabled and dirty cards, result meta, and focused regression coverage for restoring cards after filter-empty results.
11. status checkbox: `[x]`

### FS-106
1. issue id: `FS-106`
2. title: Training Courses still behaved like a thin learner list without search recovery or summary context
3. severity: `medium`
4. area: `learner training courses`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/training-courses`, `frontend/src/pages/TrainingCourses/TrainingCourses.jsx`, `frontend/src/pages/TrainingCourses/TrainingCourses.module.scss`, `frontend/src/pages/TrainingCourses/TrainingCourses.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Training Courses only exposed a flat course list with partial-safe loading, but there was still no search, no summary context, and no explicit recovery when a learner narrowed the list to zero visible rows.
9. expected behavior: Training Courses should expose summary context, search and clear-filter recovery, and explicit filtered-empty versus no-data states so the learner can browse assigned training content without losing orientation.
10. recommended fix: Add summary cards, search/filter result meta, explicit no-results versus no-courses states, richer course metadata, and regression coverage for restoring the list after filter-empty results.
11. status checkbox: `[x]`

### FS-107
1. issue id: `FS-107`
2. title: Maintenance mode still relied on a basic select and textarea flow without enough operational detail
3. severity: `low`
4. area: `admin maintenance`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/maintenance`, `frontend/src/pages/Admin/AdminMaintenance/AdminMaintenance.jsx`, `frontend/src/pages/Admin/AdminMaintenance/AdminMaintenance.module.scss`, `frontend/src/pages/Admin/AdminMaintenance/AdminMaintenance.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Maintenance exposed only the underlying mode select and banner textarea, which made the page feel like a stub and forced admins to infer the impact of each mode or retype default banner text manually.
9. expected behavior: Maintenance should show mode impact context, draft/source summary, explicit mode cards, and helper actions for applying or clearing banner text so admins can configure a maintenance window confidently.
10. recommended fix: Add summary cards, mode-selection cards, default-banner helper actions, and regression coverage for applying the selected mode banner text.
11. status checkbox: `[x]`

### FS-108
1. issue id: `FS-108`
2. title: Available Tests still felt too plain and lacked search, summary context, or retryable recovery
3. severity: `medium`
4. area: `learner tests list`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/tests`, `frontend/src/pages/Exams/Exams.jsx`, `frontend/src/pages/Exams/Exams.module.scss`, `frontend/src/pages/Exams/Exams.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: The learner tests page only showed a raw card grid, with no summary of what was available, no search or filtered-empty recovery, and no retry action when the list bootstrap failed.
9. expected behavior: The learner tests page should expose summary cards, search and clear-filter recovery, explicit retry on load failure, and clearer card detail so the available-test surface is as complete as the admin pages already stabilized.
10. recommended fix: Add summary cards, search/filter result meta, retry handling, richer card footer guidance, and regression coverage for restoring the list after a filter-empty state.
11. status checkbox: `[x]`

### FS-109
1. issue id: `FS-109`
2. title: Exam Instructions lacked retry handling and enough journey detail for the learner readiness flow
3. severity: `medium`
4. area: `learner test instructions`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/tests/:testId`, `frontend/src/pages/ExamInstructions/ExamInstructions.jsx`, `frontend/src/pages/ExamInstructions/ExamInstructions.module.scss`, `frontend/src/pages/ExamInstructions/ExamInstructions.test.jsx`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: When test bootstrap failed, the instructions screen only showed a dead error banner. Even on success, it offered limited readiness context and did not clearly explain the next journey step or provide a way back to the learner test list.
9. expected behavior: The instructions screen should provide retry and back-navigation on bootstrap failure, along with richer summary cards and a journey checklist so learners know what happens next before continuing.
10. recommended fix: Add retryable error handling, explicit back navigation, summary cards for next-step/monitoring/policy, a checklist panel, and regression coverage for retry recovery.
11. status checkbox: `[x]`

### FS-110
1. issue id: `FS-110`
2. title: New Test Wizard could advance into later phases even when the current phase failed to save
3. severity: `high`
4. area: `admin new test wizard`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/tests/new`, `frontend/src/pages/Admin/AdminNewTestWizard/AdminNewTestWizard.jsx`, `frontend/src/pages/Admin/AdminNewTestWizard/AdminNewTestWizard.module.scss`, `frontend/src/pages/Admin/AdminNewTestWizard/AdminNewTestWizard.test.jsx`
7. issue type: `broken flow`, `incomplete business logic`
8. current broken behavior: When a save failed during the 9-step wizard, the UI still advanced optimistically into the next phase. That made the test-creation cycle feel unstable because later steps appeared editable even though the underlying draft was never persisted.
9. expected behavior: The wizard should stop on the failing phase, show the real error, keep the admin on the current step, and expose enough readiness context to understand which part of the cycle still needs work.
10. recommended fix: Reuse step-level validation for both next-step and publish actions, block navigation when persistence fails, and add overview cards summarizing core readiness across questions, sessions, proctoring, and save health.
11. status checkbox: `[x]`

### FS-111
1. issue id: `FS-111`
2. title: Manage Test did not expose enough persisted real-data context when opening a test for editing
3. severity: `medium`
4. area: `admin manage test`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/tests/:id/manage`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.jsx`
7. issue type: `missing UI integration`, `broken UX state`
8. current broken behavior: The manage page loaded the editable sections, but the admin had to move through tabs to infer whether the test was published, how many questions or sessions were already persisted, whether attempts existed, and whether learner-facing reports were enabled.
9. expected behavior: Opening a test should immediately surface persisted operational context so edits are anchored in real data before the admin changes runtime settings.
10. recommended fix: Add overview cards at the top of Manage Test covering status, questions, sessions, attempts/flags, and learner-facing report visibility.
11. status checkbox: `[x]`

### FS-112
1. issue id: `FS-112`
2. title: Verify Identity exposed only minimal pass/fail feedback and hid useful OCR diagnostics
3. severity: `medium`
4. area: `learner identity verification`
5. affected user role(s): `Learner`, `Admin`
6. affected routes/pages/files: `/tests/:testId/verify-identity`, `frontend/src/pages/VerifyIdentityPage/VerifyIdentityPage.jsx`, `frontend/src/pages/VerifyIdentityPage/VerifyIdentityPage.module.scss`, `frontend/src/pages/VerifyIdentityPage/VerifyIdentityPage.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: The identity step only showed a basic capture UI and a thin result block, so it was difficult to understand which requirements were active, whether manual ID text was being used, what OCR found, or why a precheck failed.
9. expected behavior: The identity step should show requirement context, evidence readiness, and detailed OCR/manual/document diagnostics so learners and reviewers can understand exactly what the precheck is evaluating.
10. recommended fix: Add requirement cards, capture-readiness chips, and a richer diagnostic panel for OCR candidates, manual-ID validity, document outline detection, face signature mode, and failure reasons.
11. status checkbox: `[x]`

### FS-113
1. issue id: `FS-113`
2. title: Attempt Recordings became hard to review once real proctoring sessions generated multiple warning types
3. severity: `medium`
4. area: `admin attempt recordings`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/videos/:attemptId`, `/admin/videos?exam_id=:id`, `frontend/src/pages/Admin/AdminAttemptVideos/AdminAttemptVideos.jsx`, `frontend/src/pages/Admin/AdminAttemptVideos/AdminAttemptVideos.module.scss`, `frontend/src/pages/Admin/AdminAttemptVideos/AdminAttemptVideos.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: The video page showed the raw player and event list, but once a real attempt produced mixed warning types there was no summary context or filtering, making the timeline noisy and hard to review quickly.
9. expected behavior: Attempt Recordings should expose summary context plus severity and event-type filtering so admins can isolate the exact evidence stream they need while reviewing a proctored attempt.
10. recommended fix: Add summary cards for recordings and warning density, then add severity/event filters that drive both the timeline and the event list.
11. status checkbox: `[x]`

### FS-114
1. issue id: `FS-114`
2. title: Live proctoring toasts were too opaque during the learner attempt
3. severity: `medium`
4. area: `learner proctoring`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `frontend/src/components/ViolationToast/ViolationToast.jsx`, `frontend/src/components/ViolationToast/ViolationToast.module.scss`, `frontend/src/components/ViolationToast/ViolationToast.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Violation toasts only showed a terse alert label, with no usable detail, no visible confidence context, and no obvious way to dismiss the toast once the learner had acknowledged it.
9. expected behavior: Live proctoring alerts should show the actual violation detail, confidence when available, and a dismiss control so the toast communicates real evidence without hijacking the attempt flow.
10. recommended fix: Extend the shared violation toast with fallback-safe detail text, confidence rendering from either live or persisted payloads, and a visible close button backed by regression coverage.
11. status checkbox: `[x]`

### FS-115
1. issue id: `FS-115`
2. title: Learner Proctoring still lacked clear completion state and safe submit confirmation
3. severity: `high`
4. area: `learner live attempt`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/attempts/:attemptId/take`, `frontend/src/pages/Proctoring/Proctoring.jsx`, `frontend/src/pages/Proctoring/Proctoring.module.scss`, `frontend/src/pages/Proctoring/Proctoring.test.jsx`, `frontend/tests/e2e/core-test-cycle.spec.js`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: The live attempt page did not clearly show how many questions were still unanswered, and clicking submit jumped straight into submission without a final confirmation step.
9. expected behavior: The learner should see answered versus unanswered progress, a visible completion bar, and a confirmation panel before the attempt is finally submitted.
10. recommended fix: Derive answer state through a shared answer-value helper, render progress and unanswered counts in the live shell, and gate submit behind an explicit confirmation panel that the browser cycle also verifies.
11. status checkbox: `[x]`

### FS-116
1. issue id: `FS-116`
2. title: Wizard Review still felt like a thin dump instead of a real publish checkpoint
3. severity: `medium`
4. area: `admin new test wizard`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/admin/tests/new`, `frontend/src/pages/Admin/AdminNewTestWizard/AdminNewTestWizard.jsx`, `frontend/src/pages/Admin/AdminNewTestWizard/AdminNewTestWizard.module.scss`, `frontend/tests/e2e/core-test-cycle.spec.js`
7. issue type: `missing UI integration`, `broken UX state`
8. current broken behavior: Step 6 showed raw review rows with limited structure, making it harder to verify the draft logically before moving into learner assignments and save/publish.
9. expected behavior: The review phase should group the draft into meaningful cards and let admins jump directly back to the relevant earlier step to correct a section.
10. recommended fix: Replace the flat review rows with grouped cards, add edit-back buttons per section, and keep the cycle overview helper text readable and ASCII-safe.
11. status checkbox: `[x]`

### FS-117
1. issue id: `FS-117`
2. title: Attempt Analysis evidence was still hard to inspect beyond the raw metadata
3. severity: `medium`
4. area: `admin attempt analysis`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/attempt-analysis`, `frontend/src/pages/Admin/AdminAttemptAnalysis/AdminAttemptAnalysis.jsx`, `frontend/src/pages/Admin/AdminAttemptAnalysis/AdminAttemptAnalysis.module.scss`, `frontend/src/pages/Admin/AdminAttemptAnalysis/AdminAttemptAnalysis.test.jsx`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Evidence rows exposed raw event data but did not make it easy to open and inspect a captured image with its severity and confidence context.
9. expected behavior: Evidence review should show stable severity badges and support a lightbox preview carrying the recorded detail, confidence, and capture time.
10. recommended fix: Normalize the severity class lookup, make evidence cards clickable, and add a lightbox panel for captured evidence media plus regression coverage.
11. status checkbox: `[x]`

### FS-118
1. issue id: `FS-118`
2. title: Attempt Result still hid the learner-safe proctoring summary
3. severity: `medium`
4. area: `learner attempt result`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/attempts/:id`, `frontend/src/pages/AttemptResult/AttemptResult.jsx`, `frontend/src/pages/AttemptResult/AttemptResult.module.scss`, `frontend/src/pages/AttemptResult/AttemptResult.test.jsx`
7. issue type: `missing UI integration`, `broken UX state`
8. current broken behavior: The result page showed score and answer review but did not surface the recorded proctoring violations, so the learner and admin had inconsistent visibility into the same attempt outcome.
9. expected behavior: Attempt Result should load learner-safe proctoring events and show a summary of total alerts, severity counts, and recent alerts.
10. recommended fix: Load attempt events alongside the existing result data and render a summary grid plus recent-alert list with severity styling and confidence text.
11. status checkbox: `[x]`

### FS-119
1. issue id: `FS-119`
2. title: Rules still allowed the learner to reach a dead-end start button when system check prerequisites were missing
3. severity: `high`
4. area: `learner rules`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/tests/:testId/rules`, `frontend/src/pages/RulesPage/RulesPage.jsx`, `frontend/src/pages/RulesPage/RulesPage.module.scss`, `frontend/src/pages/RulesPage/RulesPage.test.jsx`, `frontend/tests/e2e/core-test-cycle.spec.js`
7. issue type: `broken flow`, `broken UX state`
8. current broken behavior: Rules could render successfully even when the current browser session had not completed system check, leaving the learner with no clear prerequisite summary and only an opaque failed start path.
9. expected behavior: Rules should show prerequisite state, make the missing system check explicit, and route the learner back to system check before the live attempt begins.
10. recommended fix: Read the precheck session flags, surface prerequisite summary cards, and gate the start action behind system-check completion with explicit navigation back to the checks page.
11. status checkbox: `[x]`

### FS-120
1. issue id: `FS-120`
2. title: Attempt Recordings still lost context when moving from the timeline to one specific warning
3. severity: `medium`
4. area: `admin attempt recordings`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/videos/:attemptId`, `/admin/videos?exam_id=:id`, `frontend/src/pages/Admin/AdminAttemptVideos/AdminAttemptVideos.jsx`, `frontend/src/pages/Admin/AdminAttemptVideos/AdminAttemptVideos.module.scss`, `frontend/src/pages/Admin/AdminAttemptVideos/AdminAttemptVideos.test.jsx`, `frontend/tests/e2e/core-test-cycle.spec.js`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: Filtering the warning list narrowed the evidence stream, but there was still no selected-warning inspector tying the list, timeline, and captured evidence together.
9. expected behavior: The page should keep one filtered warning selected, let the reviewer clear filters, and show a detail inspector with severity, time, confidence, and evidence preview.
10. recommended fix: Track a selected warning id, sync list and timeline clicks to that selection, add a clear-filters action, and render a selected-warning inspector panel with evidence media.
11. status checkbox: `[x]`

### FS-121
1. issue id: `FS-121`
2. title: Manage Test still required too much tab-hopping to understand and act on the full test lifecycle
3. severity: `medium`
4. area: `admin manage test`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/tests/:id/manage`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.jsx`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.module.scss`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.test.jsx`, `frontend/tests/e2e/core-test-cycle.spec.js`
7. issue type: `missing UI integration`, `broken UX state`
8. current broken behavior: Even with the earlier overview cards, admins still had to move across tabs to infer learner access mix, proctoring posture, certificate state, retake policy, and the quickest next action.
9. expected behavior: The manage page should surface lifecycle summary cards and quick links so the core test cycle can be reviewed and acted on from one persisted overview.
10. recommended fix: Add lifecycle cards for learner access, proctoring profile, certificates, retake policy, and review queue, then add quick actions that deep-link into the relevant tab or section.
11. status checkbox: `[x]`

### FS-122
1. issue id: `FS-122`
2. title: Attempt scoring ignored skipped questions and auto-finalized manual-review responses
3. severity: `blocker`
4. area: `attempt scoring / learner submit`
5. affected user role(s): `Learner`, `Admin`, `Instructor`
6. affected routes/pages/files: `/api/attempts/:attemptId/submit`, `backend/src/app/api/routes/attempts.py`, `backend/tests/test_stabilization.py`, `frontend/tests/e2e/core-test-cycle.spec.js`
7. issue type: `incomplete business logic`, `broken flow`
8. current broken behavior: Objective tests could inflate scores because only answered questions counted in the denominator, and attempts containing essay/manual-review answers could still be auto-finalized with a misleading computed score.
9. expected behavior: Skipped questions should count as zero toward the total score, while attempts with unanswered-by-rubric/manual-review content should remain submitted without a final score until reviewed.
10. recommended fix: Score against the full question set, distinguish skipped answers from wrong answers for negative-marking purposes, and leave subjective/manual-review answers pending instead of forcing a final percentage.
11. status checkbox: `[x]`

### FS-123
1. issue id: `FS-123`
2. title: Admin grading still reused the learner submit route and overwrote submission lifecycle data
3. severity: `high`
4. area: `attempt grading`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/api/attempts/:attemptId/submit`, `/api/attempts/:attemptId/grade`, `backend/src/app/api/routes/attempts.py`, `backend/tests/test_stabilization.py`, `frontend/src/services/admin.service.js`
7. issue type: `frontend/backend mismatch`, `incomplete business logic`
8. current broken behavior: Admin scoring used the learner submit endpoint, which could overwrite `submitted_at` and blur the distinction between learner submission and later grading.
9. expected behavior: Admin grading should use a dedicated route, preserve the original submission timestamp, and still allow later score adjustments on submitted attempts.
10. recommended fix: Add a dedicated grading route, validate score ranges explicitly, preserve the original submission timestamp, and move the admin client over to the new contract.
11. status checkbox: `[x]`

### FS-124
1. issue id: `FS-124`
2. title: Manage Test candidates still could not complete the grading and result-review part of the cycle
3. severity: `high`
4. area: `admin manage test`
5. affected user role(s): `Admin`, `Instructor`
6. affected routes/pages/files: `/admin/tests/:id/manage?tab=candidates`, `/attempts/:id`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.jsx`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.module.scss`, `frontend/src/pages/Admin/AdminManageTestPage/AdminManageTestPage.test.jsx`, `frontend/tests/e2e/core-test-cycle.spec.js`
7. issue type: `missing UI integration`, `broken flow`
8. current broken behavior: Candidate rows showed monitoring/report actions only, so admins still had to leave the core test-management flow to grade a submitted attempt or open its result directly.
9. expected behavior: The candidates tab should show per-attempt review state, allow grading in place, and open the persisted result route without leaking manage-tab URL state.
10. recommended fix: Add score/review columns, inline grade save controls, a direct result action, and guard the manage-page query-sync effect so it never mutates non-manage routes.
11. status checkbox: `[x]`

### FS-125
1. issue id: `FS-125`
2. title: Attempt Result could not represent a submitted attempt that was still awaiting manual review
3. severity: `high`
4. area: `learner attempt result`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/attempts/:id`, `frontend/src/pages/AttemptResult/AttemptResult.jsx`, `frontend/src/pages/AttemptResult/AttemptResult.module.scss`, `frontend/src/pages/AttemptResult/AttemptResult.test.jsx`, `frontend/tests/e2e/core-test-cycle.spec.js`
7. issue type: `broken UX state`, `missing UI integration`
8. current broken behavior: A submitted attempt with no final score still dropped into the normal result surface, which made the state look broken or zero-scored rather than deliberately awaiting grading.
9. expected behavior: Learners should see an explicit pending-review state, with final score/certificate/answer-review surfaces held back until grading completes.
10. recommended fix: Detect submitted attempts without a score, show a dedicated pending-review summary panel, and hide final-report surfaces until the grading route publishes a real score.
11. status checkbox: `[x]`

### FS-126
1. issue id: `FS-126`
2. title: Live violation toasts could block the learner submit action during a real proctored attempt
3. severity: `high`
4. area: `learner proctoring`
5. affected user role(s): `Learner`
6. affected routes/pages/files: `/attempts/:attemptId/take`, `frontend/src/components/ViolationToast/ViolationToast.module.scss`, `frontend/tests/e2e/core-test-cycle.spec.js`
7. issue type: `broken UX state`
8. current broken behavior: The toast container was centered across the lower viewport, so live alerts could sit directly over the submit button and intercept clicks during the last step of the attempt.
9. expected behavior: Violation toasts should remain visible but should not block the learner from completing the attempt flow.
10. recommended fix: Move the toast stack out of the central action lane and keep the mobile layout safe so live alerts remain readable without obstructing controls.
11. status checkbox: `[x]`

### FS-127
1. issue id: `FS-127`
2. title: `integrations_config` normalization and URL validation regressed during the final suite pass
3. severity: `medium`
4. area: `admin settings`
5. affected user role(s): `Admin`
6. affected routes/pages/files: `/api/admin-settings/integrations_config`, `backend/src/app/api/routes/admin_settings.py`, `backend/tests/test_stabilization.py`
7. issue type: `missing validation`
8. current broken behavior: The settings route accepted non-HTTP(S) integration URLs and stopped trimming saved webhook URLs/secrets, which left backend tests red and made saved settings inconsistent with the admin UI assumptions.
9. expected behavior: Integration configs should be normalized before persistence and enabled webhooks should require an HTTP(S) URL.
10. recommended fix: Restore a dedicated integrations-config normalizer that trims string fields and rejects enabled providers whose URLs do not start with `http://` or `https://`.
11. status checkbox: `[x]`
