<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Domain Data and Seed Catalogue

- **Plan**: `context/changes/domain-data-and-seed-catalogue/plan.md`
- **Scope**: All 3 phases
- **Date**: 2026-08-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Concurrent item mutation could race workout completion

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260820090200_create_workout_lifecycle.sql:112`
- **Detail**: Workout-exercise mutation policies checked that the parent was planned without locking it. Under
  concurrent transactions, an item write could observe the old planned state while another transaction completed
  the parent, allowing both operations to commit.
- **Fix**: Add a forward migration that locks and rechecks the parent workout before every child mutation, plus a
  credential-free two-session regression test.
  - Strength: Serializes item writes with completion at the database boundary for every caller.
  - Tradeoff: Adds a trigger and row-lock ordering that future workout mutations must preserve.
  - Confidence: HIGH — the regression test observes lock blocking, post-completion rejection, and zero landed rows.
  - Blind spot: The test exercises the insert race; update and delete use the same trigger path but are covered only
    by the shared trigger definition and existing sequential policy tests.
- **Decision**: FIXED — added `20260827120000_serialize_workout_exercise_mutations.sql` and
  `workout_lifecycle_concurrency.test.sh`; clean reset, database lint, pgTAP, concurrency, type drift, Astro sync,
  lint, and build all pass.

### F2 — Supporting ESLint changes were outside the Phase 3 file list

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `eslint.config.js:63`
- **Detail**: The generated-type rule exceptions and Astro TypeScript parser correction were not named in Phase 3,
  although they were required for the planned repository lint gate.
- **Fix**: Retain the narrowly scoped configuration as supporting implementation scope.
- **Decision**: ACCEPTED — benign supporting scope with no product-surface expansion.

## Verification

- `pnpm exec supabase start` — PASS
- `pnpm exec supabase db reset --local` — PASS
- `pnpm exec supabase db lint --local --schema public --fail-on error` — PASS
- Catalogue pgTAP — PASS
- Workout lifecycle/RLS pgTAP — PASS
- Full pgTAP suite — PASS
- `bash supabase/tests/database/workout_lifecycle_concurrency.test.sh` — PASS
- Generated and Prettier-normalized public types have no drift — PASS
- `pnpm astro sync` — PASS
- `pnpm lint` — PASS
- `pnpm build` — PASS

Manual Progress items were already confirmed and carry their implementation SHAs. No hosted Supabase migration or
Cloudflare deployment occurred during review or triage.
