<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Workout History filter stability

- **Plan**: User-provided Main Session Handoff (2026-09-14); no `plan.md` existed.
- **Scope**: Full handoff scope
- **Date**: 2026-09-14
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning (fixed), 1 observation (fixed)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- `pnpm test:ui` — PASS: 4 files, 10 tests.
- `pnpm lint` — PASS.
- `pnpm build` — PASS. Existing warnings: generated CSS `file` property and sitemap omitted because `site` is not configured.
- The supplied handoff records fresh-browser verification with zero new console errors and no Astro toolbar element.
- `src/pages/account.astro` and `src/pages/workouts/new.astro` contain pre-existing capitalization changes declared in the handoff; they were preserved and not treated as new scope creep.

## Findings

### F1 — One-sided date filters are converted to a one-day range

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/workouts/WorkoutHistory.tsx:70
- **Detail**: The agreed behavior says a start-only selection must include that UTC day and later workouts, while an end-only selection must include that UTC day and earlier workouts. The UI replaces a missing boundary with the selected date, and `normalizeWorkoutHistoryFilters` rejects one-sided API filters. Either selection therefore becomes an exact one-day range. Existing tests cover only same-day filtering, not either open-ended behavior.
- **Fix**: Preserve a selected start as only `completedFrom` and a selected end as only the next-day-exclusive `completedBefore`; update filter normalization, URL parsing, UI hydration, and tests for both semantics.
- **Decision**: FIXED — preserved one-sided UTC bounds in UI, API normalization, URL serialization, and tests.

### F2 — Calendar-button fallback is a no-op if `showPicker()` fails

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/workouts/WorkoutHistory.tsx:55
- **Detail**: The visible calendar button calls `showPicker()` and catches every exception, but does not focus the matching date input. Clicking the input itself retains normal native behavior, but the custom button is inert in browsers where programmatic picker opening is unavailable. The test only covers a successful `showPicker()` call.
- **Fix**: On failure, focus the associated date input and add a test for an unavailable or throwing `showPicker()`.
- **Decision**: FIXED — the fallback now focuses the associated input and is covered by a throwing-picker test.
