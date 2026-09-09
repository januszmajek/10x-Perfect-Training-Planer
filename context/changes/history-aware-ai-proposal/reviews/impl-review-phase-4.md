<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: History-aware AI Proposal

- **Plan**: context/changes/history-aware-ai-proposal/plan.md
- **Scope**: Whole Phase 4 (4A–4C)
- **Date**: 2026-09-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
| --- | --- |
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Feedback controls miss the 44px target

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/workouts/WorkoutCatalogueExerciseCard.tsx:88
- **Detail**: Add, Like, and Don't suggest controls use `size-9` (36px), contrary to the Phase 4B 44px accessibility requirement.
- **Fix**: Use 44px sizing (`size-11` or equivalent) and recheck wrapping at 360px.
- **Decision**: FIXED — restored 44px targets and visible focus treatment.

### F2 — Re-roll migration lacks Phase 4 scope documentation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260909130000_allow_ai_workout_proposal_lineage_rerolls.sql:1
- **Detail**: Phase 4B introduced a substantive Phase-3 re-roll lineage/RPC repair, although re-roll provenance is explicitly out of scope for 4B. It may be justified, but has no plan addendum.
- **Fix**: Add a concise plan/change-note addendum documenting the forward migration and its reason.
- **Decision**: RESOLVED — existing change.md note documents the approved Phase 3 forward migration.

### F3 — Migration registry is incomplete

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: docs/reference/contract-surfaces.md:6
- **Detail**: The registry stops at migration `20260908110000`; it omits both Phase 4B migrations (`20260909120000` and `20260909130000`).
- **Fix**: Add both migrations in executable order and their contract notes.
- **Decision**: FIXED — added both migrations and their exposure/lineage invariants.

### F4 — Human-only release checks are marked complete without operational evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/history-aware-ai-proposal/plan.md:927
- **Detail**: 4C.4 and 4C.5 are checked complete, but the deployment runbook still leaves confirmation-secret provisioning and the S-08 disposable-key Worker smoke/retention inspection unchecked.
- **Fix**: Complete and record the required human verification, or restore those plan items to pending.
  - Strength: Keeps release status truthful and preserves the required real-runtime safety gate.
  - Tradeoff: Requires deployment credentials and human verification.
  - Confidence: HIGH — the plan explicitly says this gate cannot be self-attested.
  - Blind spot: None significant.
- **Decision**: FIXED — restored both human-only release checks to pending.

### F5 — Cold-start smoke instructions contradict the UI

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: README.md:251
- **Detail**: The README says cold start has no preference controls, while Phase 4B renders them for every canonical catalogue exercise.
- **Fix**: Update the smoke instructions to explain that preferences are available but affect only subsequent history-aware proposals.
- **Decision**: FIXED — corrected the cold-start smoke instructions.
