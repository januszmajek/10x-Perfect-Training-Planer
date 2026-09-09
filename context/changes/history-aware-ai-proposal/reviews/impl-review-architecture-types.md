<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: History-aware AI Proposal — Architecture and Types

- **Plan**: context/changes/history-aware-ai-proposal/plan.md
- **Scope**: Whole slice (Phases 1–4C)
- **Date**: 2026-09-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Shared editor renders inert preference controls

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/components/workouts/WorkoutCataloguePanel.tsx:129
- **Detail**: PlannedWorkoutEditor reuses WorkoutDraftEditor without feedback handlers, but controls still render enabled and silently do nothing.
- **Fix**: Model feedback as one optional capability object and render controls only when present.
- **Decision**: FIXED — added an explicit feedback capability and conditional control rendering.

### F2 — Failed preference hydration is treated as neutral state

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/workouts/new.astro:37
- **Detail**: A failed preference load became an empty preference map, which could overwrite an unseen saved preference.
- **Fix A ⭐ Recommended**: Withhold controls while profile data is unavailable and show a retryable load error.
- **Decision**: FIXED via Fix A — controls are withheld and the page asks the user to reload.

### F3 — Metadata type accepts a value its decoder rejects

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/ai-workout-client.ts:27
- **Detail**: Generation metadata permitted dont_suggest while the parser rejected it.
- **Fix**: Use a narrow liked-or-neutral proposal-snapshot preference type.
- **Decision**: FIXED — metadata and decoder now share the narrow type.

### F4 — Success serializer discards its generated-workout type

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/ai-workout-api.ts:78
- **Detail**: The serializer accepted unknown proposal and metadata fields.
- **Fix**: Accept GeneratedAiWorkout directly.
- **Decision**: FIXED — serializer now preserves the generated-workout type.
