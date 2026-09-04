# Recovery catalogue status clarity — Plan Brief

> Full plan: `context/changes/recovery-catalogue-status-clarity/plan.md`
> Frame brief: `context/changes/recovery-aware-manual-builder/frame.md`

## What & Why

Make an exercise's advisory recovery state immediately scannable in the default catalogue, while clearly tying the reason and remaining time only to affected primary muscles. The recovery logic is sound, but card hierarchy makes status easy to miss and generic pill recolouring would overstate what the data means.

## Starting Point

The shared exercise-card component uses neutral cards and purple muscle pills. Recovering entries add an amber explanation below the pills; ready cards are generally unlabeled, especially in default order.

## Desired End State

Every recovery-aware card on `/workouts/new` has concise status text and a subtle matching border. Recovering cards precisely identify every affected primary muscle and rounded time left, while ready cards say `Ready to train`. All exercises stay selectable, and raw edit-mode catalogue cards stay neutral.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Status hierarchy | Text status plus restrained card border | Enables rapid scanning without relying on colour | Plan |
| Pill treatment | Highlight affected recovering primary pills only | Secondary workload is not a recovery blocker | Frame |
| Wording | `Ready to train` and `Recovery: muscle · time` | Concise and supported by page-level advisory context | Plan |
| Scope | Catalogue-only presentation | Keeps recovery calculation, sorting, and edit mode stable | Frame |

## Scope

**In scope:** recovery-aware card status text, borders, precise primary-muscle highlighting, and manual regression verification.

**Out of scope:** recovery calculation, persistence, medical/readiness scores, selection restrictions, sort/filter semantics, and raw edit-card styling.

## Architecture / Approach

`WorkoutDraftEditor` already receives a display-ready recovery projection. It will conditionally render the status hierarchy only for entries passing the existing recovery-aware type guard; no API, schema, or data-loading changes are needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Present status | Scannable status, state borders, precise pills | Misstating secondary-muscle context |
| 2. Verify regressions | Responsive, keyboard, sort, and edit-mode checks | No component test runner |

**Prerequisites:** Recovery-aware manual builder remains available on `/workouts/new`.
**Estimated effort:** One focused implementation session plus manual browser verification.

## Open Risks & Assumptions

- Visual presentation must preserve text status for users who cannot or do not distinguish state colours.
- Existing node tests protect data behavior, so card presentation requires explicit manual checks.

## Success Criteria (Summary)

- Ready and recovering cards are distinguishable in default and sorted views without relying on colour alone.
- Only affected primary muscles get recovery emphasis; secondary workload stays contextual.
- Existing catalogue interaction and raw edit-mode cards do not regress.
