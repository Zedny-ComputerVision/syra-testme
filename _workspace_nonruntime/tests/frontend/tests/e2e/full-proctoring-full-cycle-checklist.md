# Full Proctoring Cycle Checklist

## Objective
Validate the full admin-to-learner proctoring journey end-to-end with all core proctoring features enabled.

## Preconditions
- Backend and frontend are running (`npm run dev` / local stack).
- Admin credentials are available.
- Learner can be created in the system.
- Camera + microphone permissions are available in browser.
- OCR fixture images are available:
  - `tests/e2e/fixtures/ocr-selfie-grace.jpg`
  - `tests/e2e/fixtures/ocr-id-card-grace.png`

## Test Steps

1. Admin login and test creation
   - Login as Admin on `http://localhost:5173`.
   - Go to `Admin > Tests > New Test`.
   - Step 0 (Info):
     - Title: `Full Proctoring Test`.
     - Pick a module.
   - Step 1 (Method):
     - Select `Manual`.
   - Step 2 (Settings / Proctoring):
     - Enable:
       - Face Detection
       - Multi-Face Detection
       - Eye Tracking
       - Head Pose Detection
       - Audio Detection
       - Object Detection
       - Mouth Detection
       - Fullscreen Enforce
       - Tab Switch Detect
       - Screen Capture
       - Copy/Paste Block
     - Set time limit to `30 min`.
   - Step 3 (Questions):
     - Add 2-3 MCQ questions.
   - Step 4 (Grading):
     - Passing Score: `60%`.
   - Step 5 (Certificates):
     - Skip or configure.
   - Step 6 (Review):
     - Confirm wizard summary looks correct.
   - Step 7 (Sessions):
     - Optional: add scheduling/learner assignments or keep default.
   - Step 8 (Save):
     - Publish the test.

2. Learner flow
   - Logout as admin.
   - Login as a learner (or new private/incognito session).
   - Open `Tests`, find the created test, click `Open instructions`.

3. Pre-exam path
   - On instructions page: read and click `Continue to system check`.
   - System check: grant camera + mic, validate screen-share support.
   - Identity verification:
     - upload ID photo + selfie.
     - verify OCR + face verification pass.
   - Rules page:
     - accept rules and start exam.

4. Take test
   - Enter fullscreen with camera overlay active.
   - Screen share should show as active.
   - Answer all questions.
   - Perform rule-trigger scenarios:
     - look away
     - cover camera
     - make noise
     - switch tabs briefly
   - Observe warnings/toasts for each.
   - Submit exam.

5. Admin review
   - Login as admin and open:
     - `Admin > Tests > [created test] > Manage Test`
   - Candidate Monitoring:
     - verify attempt appears.
     - open attempt analysis.
   - Attempt Analysis:
     - Overview (risk score, integrity, violation counts)
     - Timeline
     - Answers
     - Evidence

6. Evidence + recordings
   - In Evidence/Video area, open available video/review media.
   - Validate camera and screen recordings are available.

## Pass/Fail Criteria
- All configured toggles are enabled before publishing.
- Learner can complete identity + rules + test.
- Attempt is created and appears in admin monitoring.
- Admin analysis page renders all required tabs and content.
- At least one proctoring violation is recorded during attempt.
- Both camera and screen recording artifacts are present and can be opened in admin review.
