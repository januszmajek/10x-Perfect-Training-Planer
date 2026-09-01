# Frame Brief: Manual-first workout sequencing

> Framing step before `/10x-plan`. This document captures what is actually at issue,
> separated from what was initially assumed.

## Reported Observation

I want to have manual flow finished before AI. I want to have manual path before AI generated approach.

## Initial Framing (preserved)

- **User's stated cause or approach**: A usable manual planning path should be delivered before AI workout generation.
- **User's proposed direction**: Reorder the workout-creation slices so the manual path precedes the AI path.
- **Pre-dispatch narrowing**: The leading concern is delivery order between the manual and AI creation paths, not a
  request to split generation from persistence inside the AI slice.

## Dimension Map

The sequencing decision can be assessed across these dimensions:

1. **User-visible completeness** — whether manual-first can end in a real planned workout rather than an internal
   technical milestone.
2. **Dependency integrity** — whether creation, editing, completion, and history truly require an AI-created workout.
3. **Recovery-awareness** — whether the full smart-filter experience can exist before any completed history exists.
4. **Product-hypothesis timing** — whether manual-first changes when the central AI speed-and-variety bet is tested.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Manual create-and-save is a complete first slice | The PRD defines both manual and AI inputs as valid paths to the same saved planned-workout state (`context/foundation/prd.md:37-44`), and FR-006 plus FR-008 require manual composition and shared saving (`context/foundation/prd.md:109-123`). | STRONG |
| Editing and completion truly depend on AI creation | S-03 and S-04 currently depend on S-02 (`context/foundation/roadmap.md:117-142`), but the database accepts both `manual` and `ai` origins and models planned/completed status independently (`supabase/migrations/20260820090200_create_workout_lifecycle.sql:1-50`). | NONE |
| The complete smart manual flow can ship before history | FR-007 explicitly derives recovery filtering from recent completed history (`context/foundation/prd.md:109-116`), so smart filtering needs mark-done first even though basic catalogue filtering does not. | NONE |
| Manual-first preserves the timing of AI validation | The product hypothesis is that AI is faster and injects variety (`context/foundation/prd.md:20-22`), the target is at least 75% AI usage (`context/foundation/prd.md:46-50`), and the roadmap deliberately names AI cold-start as the north star (`context/foundation/roadmap.md:25-31`). | NONE |

## Narrowing Signals

- F-01 is complete and explicitly established the data contracts and seeded catalogue needed by later manual,
  lifecycle, and AI slices (`context/foundation/roadmap.md:71-84`).
- The persistence contract already permits authenticated owners to create a planned workout, attach ordered exercises,
  and later complete it without any AI dependency
  (`supabase/migrations/20260820090200_create_workout_lifecycle.sql:67-174`).
- The current app has no workout or catalogue routes yet, so neither creation path has accumulated UI or API coupling
  that would make reordering expensive (`src/pages/dashboard.astro:7-22`).
- Manual smart filtering is downstream of completed history, but manual creation is itself sufficient to produce the
  planned workout that can later become that history.
- FR-016, fallback from an unavailable AI key to manual creation, belongs with later AI integration rather than the
  first manual slice (`context/foundation/prd.md:149-152`).

## Cross-System Convention

Vertical slices should end in a durable, user-observable outcome. A manual builder that browses the seeded catalogue,
composes sets and reps, and saves a planned workout meets that convention. A database-only or catalogue-only slice
would not. Recovery-aware behavior should follow the lifecycle event that creates its input: completing a real manual
workout.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: Reorder the roadmap around a complete manual create-and-save slice, then
> build the lifecycle that produces real history before adding recovery-aware manual filtering and AI generation.

The user's manual-first framing is valid. The necessary refinement is that “manual flow finished” contains two
dependency levels: basic manual creation can lead, while history-aware smart filtering must follow mark-done. This is
a prioritization change, not an architectural rewrite.

## Confidence

- **HIGH** — the PRD supports either creation path, the database contracts are origin-independent, the manual path
  produces its own history input, and the only meaningful tradeoff is delayed validation of the AI product bet.

## What Changes for `/10x-plan`

Do not plan against the current roadmap dependencies yet. First revise the roadmap so manual create-and-save becomes
the next vertical slice; editing and mark-done depend on that saved manual workout; recovery-aware manual filtering
depends on mark-done; and the AI slices follow without owning the shared workout lifecycle.

## References

- `context/foundation/prd.md:20-22`
- `context/foundation/prd.md:37-50`
- `context/foundation/prd.md:109-123`
- `context/foundation/prd.md:149-177`
- `context/foundation/roadmap.md:25-55`
- `context/foundation/roadmap.md:71-84`
- `context/foundation/roadmap.md:102-184`
- `supabase/migrations/20260820090200_create_workout_lifecycle.sql:1-174`
- Investigation tasks: `manual_first_product`, `manual_first_dependencies`
