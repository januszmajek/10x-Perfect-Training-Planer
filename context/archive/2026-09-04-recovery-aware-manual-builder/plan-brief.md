# Recovery-aware manual builder — Plan Brief

> Full plan: `context/changes/recovery-aware-manual-builder/plan.md`
> Research: `context/changes/recovery-aware-manual-builder/research.md`

## What & Why

The manual workout builder will guide users away from recently trained primary muscle groups without taking away their
ability to choose any exercise. This reduces planning effort while preserving manual control and avoids presenting a
time estimate as a medical restriction.

## Starting Point

The app already has immutable completed workouts, authoritative completion timestamps, canonical primary/secondary
muscle mappings, and a 48/72-hour recovery policy. The manual builder currently renders one flat catalogue after
search, muscle, and equipment filtering.

## Desired End State

After filters run, a clickable three-state recovery-order control preserves the original catalogue order, shows
**Ready to go** first, or shows **Muscles need recovery** first. The two recovery-order states divide matching cards
into those groups. Recovering cards show the primary muscle and remaining time; ready cards show secondary-work
context when it exists; every card can still be added.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Recovery UI | Demote, never hide or disable | Recovery is guidance, so manual choice remains intact. | Research |
| Recovery trigger | Primary muscle only | Fixed windows lack sufficient inputs to interpret secondary work as full fatigue. | Research |
| Secondary work | `0.5` fractional set contribution | This is the strongest supported indirect-workload convention, retained as context. | Research |
| Catalogue presentation | Clickable three-state order after user filtering | Original order, ready-first, and recovering-first remain predictable and visible. | Plan |
| Test scope | Pure/service tests plus manual accessibility checks | Covers time, privacy, and UI behavior without adding a browser test framework. | Plan |

## Scope

**In scope:**

- Derived owner-scoped recovery data from completed history.
- Primary fixed-window readiness, secondary fractional workload context, and recovery catalogue grouping.
- Existing filter preservation, focused tests, documentation, and standard regression gates.

**Out of scope:**

- Persisted or percentage-based readiness scores, health integrations, user-tunable windows, and dynamic load/RIR models.
- Catalogue hiding, changes to planned-workout editing or saving, database migrations, and AI-proposer behavior.

## Architecture / Approach

The SSR manual-builder service loads the catalogue, derives the maximum policy window, then loads only history that
can still affect recovery before applying a pure projection helper. React filters the enriched catalogue exactly as
today, then cycles its presentation through original order, ready-first groups, and recovering-first groups; it does
not calculate recovery in the browser.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Derive data | Typed recovery projection and private completed-history load | Incorrect time boundary or history scope |
| 2. Present guidance | Three-state recovery order, groups, and clear explanations | Filters or Add/Replace behavior regressing |
| 3. Verify contract | Documentation and full regression gates | Derived policy drifting in later slices |

**Prerequisites:** Completed-workout lifecycle and catalogue foundation are already delivered.

**Estimated effort:** ~2–3 focused implementation sessions across three phases.

## Open Risks & Assumptions

- The 48/72-hour values remain a fixed product policy; they are not individual medical advice.
- Fractional secondary sets are workload context, not a conversion to recovery time.
- Completion time is the true training-time proxy for MVP and must remain the only recovery event timestamp.

## Success Criteria (Summary)

- Users can identify which primary muscle is recovering and when it becomes ready, while still choosing any exercise.
- Text, muscle, and equipment filters preserve matching ready and recovering results.
- Owner scope, recovery boundaries, secondary treatment, lint, database suite, and Worker build all pass verification.
