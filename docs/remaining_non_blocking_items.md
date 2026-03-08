# SYRA LMS Remaining Non-Blocking Items

## Deferred Items

| Item | Why Deferred | Recommended Next Phase |
| --- | --- | --- |
| Internal ORM/entity/class names and legacy compatibility endpoints still use `exam` terminology. | The active user-facing routes, permissions, services, and generated outputs are now canonicalized to `Test`, but core SQLAlchemy models, schema class names, and backward-compatible `/api/exams` style endpoints still use `Exam` to avoid a breaking migration during stabilization. | If a full rename is still desired, handle it as a dedicated compatibility migration across ORM models, schema class names, API versioning, and data exports rather than mixing it into MVP stabilization. |
| Two inline width styles remain for dynamic visual bars in learner mic level and grading-scale band previews. | Those two spots derive width directly from live numeric state, so they are data-driven visuals rather than hard-coded surface styling or browser-default control regressions. | If desired, convert them to CSS custom-property driven width utilities in a later UI cleanup pass; they are not blocking correctness or theming. |
