# SYRA LMS Prioritized Fix Plan

## Blockers To Fix First

- `FS-001` Make `/admin/tests` the canonical admin management route and downgrade `/admin/exams` to legacy redirects.
- `FS-004` Filter learner-visible tests to only those the learner can actually access.
- `FS-005` Lock down learner question access and return ordered question payloads.
- `FS-006` Restore saved answers when the proctoring page reloads.
- `FS-007` Fix identity verification fallback so the learner end-to-end flow no longer crashes.

## High Priority Next

- `FS-002` Add explicit access-denied handling and correct dashboard redirects/links.
- `FS-003` Expose instructor attempt-analysis access where backend permissions already allow it.
- `FS-008` Enforce question-count validation before publishing a test.
- `FS-009` Make duplicate test titles collision-safe.
- `FS-010` Upgrade `/admin/tests` to backend-driven search/filter/sort/pagination and add duplicate in the UI.

## Medium / Low Deferred

- `FS-011` Add learner display metadata to schedule DTOs for cleaner admin session pages.
- `FS-012` Tighten testing-session modal validation around required scheduled dates.
- `FS-013` Repair the focused backend stabilization tests after the behavior fixes land.
- `FS-017` Replace invalid 422 status constants in user and user-group validation paths so admin CRUD failures return clean validation responses instead of crashing.
- `FS-014` Keep only deeper ORM/entity/class and legacy endpoint compatibility layers deferred after the learner/admin UI, permissions, and report copy are fully canonicalized to `Test`.
- `FS-016` Utility-page hardening is complete; only deeper internal compatibility cleanup remains deferred after subscribers/integrations/reports were made non-optimistic and server-validated.

## Verification Issues Resolved During Final Pass

- `FS-018` Make the New Test Wizard hydrate course modules deterministically so the draft flow no longer stalls on an empty module select.
- `FS-019` Harden the shared navbar search dropdown so empty/error states are explicit and never trigger undefined navigation.
- `FS-020` Split attempt-video supervision loading from attempt-detail loading so tests with zero attempts show a real empty state instead of hanging.
- `FS-021` Add a stable template-row hook and update the CRUD browser check so full E2E verification stays deterministic.
- `FS-022` Treat the canonical take-test route as exam mode so the learner test session no longer renders inside the normal shell chrome.
- `FS-023` Add a real learner-surveys empty state and track survey submission per card instead of globally.
- `FS-024` Add missing loading/empty feedback to certificates and clean the broken saved-state label.
- `FS-025` Fix the report scheduler so first-run cron execution works and generated report outputs use public URLs instead of local file paths.
- `FS-026` Make auth recovery explicit and honest by surfacing login entry points, blocking forgot-password when email delivery is unavailable, and aligning reset/change confirmation validation.
- `FS-027` Harden admin settings and maintenance pages with loading, dirty-state, and retry-safe save behavior.
- `FS-028` Align instructor-capable scheduling and user-profile routes with the backend permission model and replace admin-only data dependencies with safe lookup endpoints.
- `FS-029` Re-key Candidates/User navigation so analysis-only and admin-only surfaces are no longer exposed through the wrong permission buckets.
- `FS-030` Make the admin dashboard resilient to partial API failure instead of blanking the full page.
- `FS-031` Give Attempt Analysis real loading, empty, and default-selection behavior with clean result copy.
- `FS-032` Bring Roles & Permissions in line with the real permission model and add loading/dirty-state feedback.
- `FS-033` Re-lock User Groups server-side so instructors cannot bypass the hidden admin-only UI through direct API calls.
- `FS-034` Validate Favorite Reports links against the live admin route set and block stale saved entries from navigating into dead pages.
- `FS-035` Surface backend blob-download errors cleanly and add an explicit no-columns-selected state to the report builder.
- `FS-036` Lock subscriber/integration/maintenance edits behind a successful settings load so failed bootstrap states cannot overwrite unknown server config.
- `FS-037` Make self-registration retryable after status-bootstrap failures and align signup validation around confirmation-aware, normalized payloads.
- `FS-038` Keep the learner dashboard usable on bootstrap errors and remove premature start actions from future schedule rows.
- `FS-039` Make User Groups partially resilient so one failed dependency no longer strands the entire page in an unsafe state.
- `FS-040` Keep Testing Sessions visible when lookup data partially fails and disable new-session creation until the page is fully bootstrapped.
- `FS-041` Make Attempt Result resilient to secondary detail failures and render JSON-encoded multi answers readably.
- `FS-042` Route in-progress attempts back into the take-test flow and add retry-safe loading to the attempts list.
- `FS-043` Add themed fallbacks for unclassed native controls so remaining pages do not regress to browser-default white buttons and dropdowns.
- `FS-044` Normalize Categories CRUD payloads and add retry/save/delete feedback to the admin page.
- `FS-045` Harden Grading Scales validation and retry/busy states across both backend and frontend.
- `FS-046` Give Certificates a real retry/reset/clear workflow and persist fully cleared drafts as `null`.
- `FS-047` Harden Question Pools with retryable list/question loading and real create/delete busy states.
- `FS-048` Complete the visible Schedules form and block incomplete schedule assignments before submit.
- `FS-049` Split Templates list-load errors from form-save errors and remove the inline delete-confirm styling.
- `FS-050` Replace the remaining hard-coded white wizard toggle surfaces with themed tokens.
- `FS-051` Partial-load Training Courses module lists and add real busy-state handling across course/module actions.
- `FS-052` Move Surveys off inline layout/error fragments and harden response/status/delete action states.
- `FS-053` Make Question Pool Detail retryable and partial-safe instead of collapsing into empty state when question loading fails.
- `FS-054` Replace the remaining inline control/banners in Roles & Permissions and add an explicit reload path after failed settings bootstrap.
- `FS-055` Add refresh/retry controls to Admin Dashboard and replace implicit risky-attempt row clicks with explicit analysis actions.
- `FS-056` Move Attempt Videos supervision controls into themed classes and add retryable recording-load errors.
- `FS-057` Add retry and row-level busy states to Candidates and block date-less reschedule confirmation.
- `FS-058` Add retry-safe bootstrap handling to Admin Settings and lock editing until settings load succeeds.
- `FS-059` Require explicit schedules for restricted wizard assignments and replace the remaining inline save-step fragments.
- `FS-060` Make `AdminManageTestPage` retryable, add destructive-action busy states, and disable incomplete session/test-management actions before submit.
- `FS-061` Remove the remaining visible generator/question/grading inline fragments from `AdminNewTestWizard` and normalize its broken labels.
- `FS-062` Add retryable preference bootstrap and duplicate-safe saves to `AdminFavoriteReports`, and replace its inline banners with themed classes.
- `FS-063` Make `AdminUserGroups` delete/member flows busy-safe and remove the remaining inline bulk-assignment fragment.
- `FS-064` Add retryable load failure handling and delete busy states to `AdminUsers`, and move the leftover inline table/modal fragments into SCSS.
- `FS-065` Split `AdminAttemptAnalysis` detail loading into retryable partial-data handling and move its remaining inline result/heatmap fragments into SCSS.
- `FS-066` Make `AdminTestingSessions` create/delete flows busy-safe and replace its remaining inline status/mode fragments.
- `FS-067` Replace the last inline KPI icon tone styling in `AdminDashboard` with themed classes.
- `FS-068` Reject duplicate or overlapping grading-scale bands on both frontend and backend and move the remaining editor fragments into SCSS classes.
- `FS-069` Add retryable rules bootstrap and explicit start gating to the learner Rules page.
- `FS-070` Make Profile app-validated, accessible, and busy-safe for both profile and password forms.
- `FS-071` Normalize learner Schedule/Attempt Result empty and past-state rendering.
- `FS-072` Add retryable bootstrap and partial-restoration handling to learner Proctoring.
- `FS-073` Add retryable requirement loading and manual re-run actions to System Check.
- `FS-074` Add retryable requirement loading and evidence-gated actions to Verify Identity.
- `FS-075` Move the remaining inline Not Found/Maintenance shells into themed SCSS modules.
- `FS-076` Harden learner Home against malformed dashboard payloads and clean its visible CTA/icon copy so retry fallback never degrades into broken text.
- `FS-077` Add accessible stat hooks plus cleaner sort/pagination/certificate copy to Attempts and make future schedule CTAs more explicit.
- `FS-078` Restore explicit button semantics across shared shell/admin controls and make Admin Users modal dismissal busy-safe during mutations.
- `FS-079` Turn Favorite Reports into a real submit flow with keyboard-safe add behavior and clearer route guidance.
- `FS-080` Keep freshly created users visible in Admin Users by default so CRUD verification does not fall off the first page immediately after create.
- `FS-081` Allow Favorite Reports to save the same route under different titles so distinct shortcuts are not blocked by over-strict duplicate rules.
- `FS-082` Finish `AdminManageTestPage` theming and contract hardening by styling its remaining native settings controls, locking published-only runtime review toggles, and validating coupon/runtime metadata before save.
- `FS-083` Replace the main Tests list native delete flow with in-app confirmation, then add retry/refresh/clear-filter recovery and stronger empty/report-open states.
- `FS-084` Make Integrations card-scoped and backend-validated so webhook tests and saved URLs no longer rely on global or malformed config.
- `FS-085` Make Custom Reports retryable and more detailed by separating preview/export state and surfacing active dataset/column/row summaries.
- `FS-086` Add explicit Audit Log detail actions plus richer Predefined Reports metadata so those admin utility pages no longer feel unfinished.
- `FS-087` Normalize Subscribers multi-add flow and enrich Scheduled Reports reset/metadata/delete-confirm handling.
- `FS-088` Turn the wizard’s embedded question editor into a real type-aware authoring surface with quick-add, validation, and busy-safe save/delete flows.
- `FS-089` Expand Maintenance with live impact preview, reset behavior, and trimmed-banner persistence so it no longer feels like a bare settings stub.
- `FS-090` Complete Candidates with summary cards, explicit filter recovery, risk detail, and CSV preview validation so the admin review queue no longer feels like a raw table.
- `FS-091` Complete User Profiles with summary context, themed filter controls, and explicit no-results recovery so it behaves like a finished admin management page instead of a plain grid.
- `FS-092` Complete Testing Sessions with summary context, themed controls, explicit filter recovery, readable sort and pagination copy, and richer card detail so the scheduling page matches the rest of the stabilized admin management surfaces.
- `FS-093` Remove the last fallback search and select backgrounds from the navbar, attempts list, schedule page, and surveys page so shared dropdowns and search boxes stay on the same theme tokens as the rest of the product.
- `FS-094` Complete Categories with summary context, readable sort and pagination copy, themed controls, and explicit filter recovery so the taxonomy page no longer behaves like an older utility screen.
- `FS-095` Complete Question Pools with summary cards, richer card detail, themed search and filter recovery, and explicit filtered-empty handling so the authoring surface no longer feels sparse.
- `FS-096` Remove the last fallback control backgrounds from Grading Scales so its search and band editor inputs match the current admin theme.
- `FS-097` Complete Grading Scales with summary context, filter recovery, readable sort behavior, and explicit filtered-empty states so it matches the rest of the stabilized admin management pages.
- `FS-098` Complete `AdminManageTestPage` proctoring with monitoring summary cards, explicit refresh/clear-filter recovery, and clearer filtered-empty versus no-attempts states.
- `FS-099` Complete Schedules with summary context, themed filters, explicit refresh/clear-filter recovery, and separate filtered-empty versus no-data states.
- `FS-100` Complete Templates with summary context, ownership-aware filtering, readable row metadata, and explicit filter recovery so the shared-template workflow no longer feels plain.
- `FS-101` Complete Favorite Reports with summary context, search/type filters, richer shortcut metadata, and explicit filtered-empty recovery.
- `FS-102` Complete Report Builder schedule management with summary context, search/report-type filters, and explicit filtered-empty recovery.
- `FS-103` Remove the last fallback raw surface colors from the touched learner/admin pages so their inputs, detail cards, filter panels, and table headers stay on theme.
- `FS-104` Complete Subscribers with summary context, search recovery, richer row detail, and explicit filtered-empty states.
- `FS-105` Complete Integrations with summary context, search and status filters, and clearer card-level enabled/dirty detail.
- `FS-106` Complete Training Courses with summary context, search recovery, richer course metadata, and explicit filtered-empty states so learner course browsing no longer feels like a plain list.
- `FS-107` Complete Maintenance with mode-detail summary cards, explicit mode cards, and default-banner helper actions so the admin page is operational instead of bare.
- `FS-108` Complete Available Tests with summary cards, search/retry recovery, and richer test-card guidance so the learner list matches the rest of the stabilized product.
- `FS-109` Complete Exam Instructions with retry/back navigation, journey summary cards, and a readiness checklist so learners can recover and understand the next step before starting.
- `FS-110` Stop the New Test Wizard from advancing when a phase save fails and add phase-readiness overview cards so the 9-step cycle exposes real creation state instead of optimistic navigation.
- `FS-111` Add persistent real-data overview cards to Manage Test so status, questions, sessions, attempts, and learner-facing report visibility are visible immediately when opening a test.
- `FS-112` Expand Verify Identity with requirement cards, capture readiness states, and OCR/manual/document diagnostics so admins and learners can understand why identity precheck passed or failed.
- `FS-113` Expand Attempt Recordings with summary cards plus severity/event filters so the warning timeline stays usable once a real proctoring session generates dense evidence.
- `FS-114` Upgrade live violation toasts with detail, confidence, and dismiss handling so learner alerts expose real evidence without becoming sticky noise.
- `FS-115` Add unanswered counts, a progress bar, and submit confirmation to the learner Proctoring page so the live attempt cycle exposes completion state safely.
- `FS-116` Turn the wizard Review phase into grouped cards with edit-back links so admins can validate the entire 9-step draft before publishing.
- `FS-117` Expand Attempt Analysis evidence with severity badges and a lightbox preview so captured evidence is actually reviewable.
- `FS-118` Surface proctoring violation summaries on Attempt Result so the learner-facing result page reflects the recorded review evidence.
- `FS-119` Gate Rules behind system-check prerequisites and show prerequisite cards so the learner cannot start from a half-complete precheck state.
- `FS-120` Add a selected-warning inspector and filter reset to Attempt Recordings so list, timeline, and evidence stay synchronized during review.
- `FS-121` Add lifecycle summary cards and quick actions to Manage Test so the admin can move through sessions, proctoring, reports, and learner review from one persisted overview.
- `FS-122` Fix attempt scoring to count skipped questions correctly and keep manual-review attempts pending instead of auto-finalizing them with a misleading score.
- `FS-123` Split admin grading away from learner submit so score changes preserve the original submission lifecycle and use a stable API contract.
- `FS-124` Complete the Manage Test candidates tab with inline grading, persisted review state, direct result access, and URL-safe navigation out of the manage workflow.
- `FS-125` Add an explicit learner pending-review result state so submitted manual-review attempts do not masquerade as final results.
- `FS-126` Move live violation toasts away from the submit control so real proctoring alerts do not block the learner from finishing the attempt.
- `FS-127` Restore `integrations_config` trimming and HTTP(S) URL validation so the backend suite remains green after the core-cycle pass.

## Items Disabled / Hidden Because Not MVP-Ready

- None identified yet from the currently exposed route set. The current route smoke pass shows the visible pages load; the stabilization work is focused on fixing exposed flows rather than removing route groups.
