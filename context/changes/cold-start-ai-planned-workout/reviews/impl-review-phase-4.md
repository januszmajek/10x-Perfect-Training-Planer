<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Cold-start AI Planned Workout

- **Plan**: context/changes/cold-start-ai-planned-workout/plan.md
- **Scope**: Phase 4 of 4
- **Date**: 2026-09-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 0 observations remaining

## Verdicts

| Dimension | Verdict |
| --- | --- |
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Credential deletion can bypass confirmation

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/account/ai-key/remove.ts:16
- **Detail**: An empty form passes `[].every(...)`, any `confirm` value is accepted, and the destructive endpoint lacks same-origin protection.
- **Fix**: Require exactly one `confirm=true` form field and enforce same-origin protection on both account key mutation endpoints; add route tests.
- **Decision**: FIXED — exact `confirm=true` validation and same-origin enforcement added to both account key mutation routes; helper tests added.

### F2 — Rejected-key recovery lacks an Account action

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/workouts/WorkoutBuilder.tsx:253
- **Detail**: Post-request `key_not_configured` and `key_rejected` outcomes only display text even though the plan requires a path to `/account`; the typed recovery helper is unused.
- **Fix**: Render the `/account` recovery link from the typed recovery helper for account-recovery failures.
- **Decision**: FIXED — typed Account recovery link rendered for missing and rejected key outcomes.

### F3 — Smoke-check documentation reintroduces a deadline

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md:220
- **Detail**: The README asks operators to confirm generation completes within ten seconds, contradicting the plan's no-application-deadline contract.
- **Fix**: Remove the fixed-time requirement from the smoke check.
- **Decision**: FIXED — removed fixed-time smoke-check wording.

### F4 — Required Worker smoke test is not evidenced

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/deployment/deployment-plan.md:139
- **Detail**: The final human Worker-runtime smoke test remains pending and Phase 4 lacks a dedicated progress item for it.
- **Fix**: Perform the human Worker-runtime smoke test, then record it explicitly in Phase 4 progress.
- **Decision**: DEFERRED — awaiting human Worker-runtime smoke-test confirmation; tracked as Progress item 4.11 and in follow-ups/review-fixes.md.

### F5 — Successful generation is styled as a support error

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/workouts/WorkoutBuilder.tsx:115
- **Detail**: A successful generation retains a request ID that is rendered as a red support message.
- **Fix**: Clear the request ID on success or render it only for failures.
- **Decision**: FIXED — successful generations clear the request ID before rendering.
