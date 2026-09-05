<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Cold-start AI Planned Workout Implementation Plan

- **Plan**: `context/changes/cold-start-ai-planned-workout/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-05
- **Verdict**: SOUND after triage
- **Findings**: 1 critical, 2 warnings, 0 observations

## Verdicts

| Dimension             | Initial verdict | After triage |
| --------------------- | --------------- | ------------ |
| End-State Alignment   | PASS            | PASS         |
| Lean Execution        | PASS            | PASS         |
| Architectural Fitness | WARNING         | PASS         |
| Blind Spots           | WARNING         | PASS         |
| Plan Completeness     | FAIL            | PASS         |

## Grounding

Grounding: 12/12 existing paths verified, 7/7 symbols verified, brief and plan consistent, Progress contract valid.

## Findings

### F1 — Catalogue cannot supply all validation inputs

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Catalogue metadata and proposal validation
- **Detail**: The current catalogue projection and `CatalogueExercise` contract omit muscle category and movement pattern, leaving the lower-body/core and push/pull validation contracts under-specified and omitting affected loaders, types, and fixtures.
- **Fix ⭐ Recommended**: Extend the catalogue projection, shared types, fixtures, migration contract, and tests with canonical category and upper-body push/pull metadata; require the forward migration to update seeded rows by stable slug.
- **Decision**: FIXED — Phase 1 now names every affected catalogue file, defines the additional projection fields, constrains push/pull to upper-body movements, and specifies migration and fixture behavior.

### F2 — New database RPC has no database contract tests

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — AI save database function
- **Detail**: Mocked application tests and the existing database suite cannot establish the new function's privileges, validation, CAS behavior, rollback, ownership isolation, or AI provenance.
- **Fix ⭐ Recommended**: Add a dedicated `ai_workout_mutation.test.sql` pgTAP contract while retaining the decision not to add a new concurrency shell suite.
- **Decision**: FIXED — Phase 3 now requires direct pgTAP coverage and includes it in Success Criteria and Progress.

### F3 — Existing conflict controllers are not interchangeable

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 4 — AI planner controller
- **Detail**: Manual replacement and planned-editor stale-write handling use materially different transitions, so a vague extraction could create another conflict protocol or regress existing behavior.
- **Fix ⭐ Recommended**: Define and test a pure shared conflict-transition contract while retaining presentation-specific controller behavior.
- **Decision**: FIXED — Phase 4 now names the shared helper and test files and enumerates the transition and preservation cases.

## Triage Summary

- Fixed: F1, F2, F3
- Skipped: none
- Accepted: none
- Dismissed: none
- Verdict after fixes: SOUND
