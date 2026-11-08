<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: AI Partial Re-roll Implementation Plan

- **Plan**: context/changes/ai-partial-reroll/plan.md
- **Scope**: Full plan — Phases 1–5 of 5 (Manual rows and row 3.5 pending by design)
- **Date**: 2026-11-08
- **Round**: 1
- **Verdict**: NEEDS ATTENTION (before triage) → all findings triaged
- **Findings**: 0 critical, 1 warning, 9 observations

> Unattended run, user pre-authorised. Triage decisions were taken automatically: CRITICAL/WARNING are fixed,
> OBSERVATIONS fixed when trivial and beneficial, otherwise ACCEPTED or DISMISSED with a reason.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Automated verification (round 1, before fixes)

| Command                                      | Result                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `npm run lint`                               | PASS                                                                    |
| `npm run test:node`                          | PASS (180/180)                                                          |
| `npm run test:ai-workout`                    | PASS (120/120)                                                          |
| `npm run test:ui`                            | PASS (14/14)                                                            |
| `npm run build`                              | PASS                                                                    |
| `npm run test:e2e`                           | PASS (12/12, incl. `ai-partial-reroll.spec.ts`)                         |
| `npx tsc --noEmit`                           | 17 errors, all in files untouched by this branch (pre-existing)         |
| `npx prettier --check` (changed, ex plan.md) | FAIL: `plan-brief.md`, `reviews/plan-review.md` (table/emphasis layout) |

Manual rows 2.11–2.13, 3.7–3.11, 4.5–4.6, 5.3 and CI row 3.5 are unchecked — pending by design (user will test
manually; pushing not allowed). No Manual row is marked complete, so there is no rubber-stamping.

## Findings

### F1 — Failed reduced-size confirm leaves the modal open over an unreachable alert

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/workouts/WorkoutBuilder.tsx:204 (transition-code branch) and catch branch
- **Detail**: `reducedConfirmation` was cleared only on success. When the confirmed request fails (e.g.
  `stale_confirmation` after a selection change, or `replacement_not_feasible`), the `showModal()` dialog stays open
  with a spent token, so pressing confirm again can only fail. The inline `role="alert"` renders behind the inert
  modal, and the new failure toast is `aria-hidden`, so the plan's end state ("every generation failure shows the
  inline alert … screen readers hear the message once") does not hold on this path. The behaviour existed on master,
  but the partial reduced path adds new ways to reach it, and the new toast makes the alert its only announcement.
- **Fix**: Clear `reducedConfirmation` when a request that carried a `confirmationToken` fails (parsed failure or
  network error), and add an E2E case (confirm → `stale_confirmation` → dialog hidden, alert visible, draft and
  selection kept, resent body = original command + token).
- **Decision**: FIXED (Fix) — `WorkoutBuilder.tsx` + new test in `e2e/ai-partial-reroll.spec.ts`.

### F2 — Two plan-change Markdown files are not Prettier-clean

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/changes/ai-partial-reroll/plan-brief.md, context/changes/ai-partial-reroll/reviews/plan-review.md
- **Detail**: The husky hook is not installed in this clone, so lint-staged never formatted these files; Prettier
  pads the tables and converts `*x*` to `_x_`. No content change.
- **Fix**: `npx prettier --write` on both files (plan.md intentionally left unformatted, as recorded in Phase 5 notes).
- **Decision**: FIXED (Fix)

### F3 — History-aware partial service test did not assert prompt privacy; prompt test name over-claimed

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/ai-workout-prompt.test.ts:139, src/lib/ai-workouts.test.ts:1070
- **Detail**: The prompt test asserted a marked id is absent although `buildPartialRerollPrompt` never receives marked
  ids, so it could not detect an orchestration leak; the history-aware service test checked only the provider enum,
  not `prompt.user` (cold start already did).
- **Fix**: Assert marked/excluded ids are absent from the history-aware `prompt.user`; rename the prompt test to what
  it actually proves.
- **Decision**: FIXED (Fix)

### F4 — Parser hardening edge cases handled but unasserted

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/ai-workout-client.test.ts:101
- **Detail**: Uppercase UUID, `NaN`/`Infinity`/unsafe-integer prescriptions, `excludedExerciseIds: null` and
  JSON-parsed `__proto__` keys were rejected by the code but not pinned by tests.
- **Fix**: Add them to the existing rejection table (plus a top-level `__proto__` command case).
- **Decision**: FIXED (Fix)

### F5 — `useRerollSelection` render-time pruning had no direct test

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/components/hooks/useRerollSelection.ts:25
- **Detail**: Reorder survival, removal pruning, re-added-unmarked, exclusion accumulation, manual re-add pruning and
  empty-draft reset were covered only through pure helpers.
- **Fix**: New Vitest `renderHook` test `src/components/hooks/useRerollSelection.test.tsx`.
- **Decision**: FIXED (Fix)

### F6 — `PartialRerollItem` duplicated `AiWorkoutRerollItem`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/ai-workout-partial-reroll.ts:13
- **Detail**: Identical union declared twice. (The `coverageOf` re-export is required by the plan contract and kept.)
- **Fix**: Alias `PartialRerollItem` to the type-only import of `AiWorkoutRerollItem`.
- **Decision**: FIXED (Fix)

### F7 — Planner refuses `m > ceil` even when one pick could cover two missing categories

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/ai-workout-partial-reroll.ts:64
- **Detail**: Exactly what the plan specifies; conservative (pre-provider `replacement_not_feasible` instead of a
  possible success).
- **Decision**: ACCEPTED — plan-specified, safe direction; widening needs a set-cover computation not in scope.

### F8 — Reduced token is consumed before the model check and key decrypt

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/ai-workouts.ts:691-711
- **Detail**: A misconfigured model or missing key after a successful consume wastes the one-time token. The partial
  path mirrors the existing full path (`:601-617`).
- **Decision**: ACCEPTED — inherited ordering shared with the full path; only a deploy misconfiguration triggers it.

### F9 — Cold-start partial silently ignores `confirmationToken`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/ai-workouts.ts:480
- **Decision**: DISMISSED — documented as-built decision in plan Phase 2 notes ("A cold-start partial ignores a
  `confirmationToken`, matching today's cold-start full path").

### F10 — Partial prompt/validator imported directly instead of injected

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/ai-workouts.ts:509,531,713,731
- **Decision**: DISMISSED — documented as-built decision in plan Phase 2 notes (keeps the route dependencies object
  unchanged per contract item 5); F3 closes the test-observability gap.

## Iteration history

### Round 1 — 2026-11-08

- Findings: 0 critical, 1 warning (F1), 9 observations (F2–F10).
- Fixed: F1 (dialog closes on failed confirm + E2E), F2 (Prettier on two Markdown files), F3 (prompt privacy
  assertion), F4 (parser edge-case tests), F5 (hook test), F6 (type alias).
- Accepted: F7 (plan-specified conservative gate), F8 (inherited token-consume ordering).
- Dismissed: F9, F10 (documented as-built decisions in plan Phase 2 notes).
- NEEDS-USER: none.
- Post-fix checks: lint, test:node (180/180), test:ai-workout (120/120), test:ui (16/16), build, test:e2e (13/13)
  all PASS; Prettier clean on changed files (ex plan.md). Deliberate-break: reverting the F1 fix makes the new E2E
  case fail (`toBeHidden`).
