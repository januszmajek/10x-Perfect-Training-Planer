<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Mark Planned Workout Done Implementation Plan

- **Plan**: `context/changes/mark-planned-workout-done/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-02
- **Verdict**: SOUND
- **Initial verdict**: REVISE
- **Findings**: 1 critical, 3 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | PASS    |

## Grounding

Grounding: 10/10 existing paths ✓, 8/8 symbols ✓, planned new paths absent as expected ✓, brief↔plan ✓, Progress
contract ✓.

## Findings

### F1 — Null current plan cannot prove completion

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 3 — Ambiguous-failure reconciliation
- **Detail**: Existing GET returns only the current planned slot, so null can mean completion, deletion, or a removed
  replacement and cannot prove the expected PATCH committed.
- **Fix A ⭐ Recommended**: Reconcile the expected owned workout ID as `planned`, `completed`, or absent alongside the
  current plan.
  - **Strength**: Only the expected row being completed produces success.
  - **Tradeoff**: Expands the service, GET response, parser, and tests.
  - **Confidence**: HIGH — the current loader explicitly filters to planned rows.
  - **Blind spot**: An absent row remains indeterminate and requires neutral feedback.
- **Fix B**: Treat all ambiguous responses as indeterminate without adding a target-state lookup.
  - **Strength**: Smaller implementation.
  - **Tradeoff**: Users cannot distinguish completion from deletion until history UI exists.
  - **Confidence**: HIGH — avoids false claims but weakens recovery.
  - **Blind spot**: Reloading the current plan cannot resolve an absent target.
- **Decision**: FIXED via Fix A — the plan now requires an owner-scoped expected-workout reconciliation state and
  permits success only for the expected completed row.

### F2 — Final React component ownership is unresolved

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Interactive planned-workout summary boundary
- **Detail**: The plan listed same-basename Astro/React summaries and left consolidation of the action island to the
  implementer.
- **Fix**: Make `PlannedWorkoutSummary.tsx` the sole renderer/controller, delete the Astro summary and action island,
  and mount the React component from the dashboard with `client:load`.
- **Decision**: FIXED — final component ownership and deletion/import steps are explicit.

### F3 — Core Undo/deadline invariants have no automated coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Five-second grace period
- **Detail**: Near-deadline Undo, exactly-once submission, obsolete callbacks, and deadline behavior were entirely
  manual despite being the feature's highest-risk client state.
- **Fix**: Extract a pure event/time-driven completion reducer and test its states and effects with the existing Node
  runner.
  - **Strength**: Covers race-prone sequencing without a browser framework.
  - **Tradeoff**: Adds one small state-machine module.
  - **Confidence**: HIGH — this matches existing pure-module tests.
  - **Blind spot**: DOM animation and focus still require manual verification.
- **Decision**: FIXED — Phase 3 now includes a pure reducer, focused Node tests, and explicit Progress coverage.

### F4 — The RPC is not an exclusive database boundary

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — Completion RPC
- **Detail**: Existing authenticated column grants and RLS allow owners to update lifecycle fields directly, bypassing
  application revision and timestamp semantics.
- **Fix A ⭐ Recommended**: Retain the established invoker/RLS model, document the lower-level capability, and narrow
  exclusivity claims to repository application code.
  - **Strength**: Minimal and consistent with foundation contracts.
  - **Tradeoff**: Authenticated owners can bypass application semantics for their own data.
  - **Confidence**: HIGH — current grants and tests explicitly permit direct completion.
  - **Blind spot**: Stricter future auditing may require privilege redesign.
- **Fix B**: Revoke direct lifecycle updates and introduce a hardened privileged mutation boundary.
  - **Strength**: Enforces completion semantics for every authenticated caller.
  - **Tradeoff**: Requires a broader security redesign and threat review.
  - **Confidence**: MEDIUM — feasible but contrary to the current invoker pattern.
  - **Blind spot**: Privileged function ownership and RLS behavior need separate analysis.
- **Decision**: FIXED via Fix A — the plan records the retained direct owner capability and scopes the RPC as the
  supported application path.

### F5 — Phase 2 names files that require no modification

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 2 — Focused application and CI verification
- **Detail**: The original phase listed `package.json` and CI even though existing commands already covered its files.
- **Fix**: Remove no-op file changes and retain commands only as success criteria.
- **Decision**: FIXED — the no-op CI change was removed; `package.json` moved to Phase 3 because F3's new reducer test
  must be added to the explicit `test:planned-workout` file list.

## Result

All recommended fixes were incorporated into the plan and brief. The revised plan is SOUND and ready for phased
implementation beginning with Phase 1.
