# Recovery catalogue clarity and editor decomposition — Plan Brief

> Full plan: `context/changes/recovery-catalogue-status-clarity/plan.md`
> Frame brief: `context/changes/recovery-aware-manual-builder/frame.md`

## What & Why

Manual UI review rejected standalone readiness/recovery copy and exposed a layout problem in the muscle-chip region. This revision moves remaining time into affected primary-muscle chips, removes secondary-workload presentation entirely, and breaks the oversized shared editor into focused workout components.

## Starting Point

`WorkoutDraftEditor.tsx` exceeds 600 lines and owns filters, catalogue ordering/cards, replacement coordination, and draft controls. The current uncommitted UI draft shows `Ready to train`, a top-level recovery sentence, and `Recent indirect work`; `secondaryWorkload` also exists in the live projection contract and tests.

## Desired End State

Ready cards show no status copy. Recovering primary chips carry their own concise duration, such as `Quads 42h`, while all other chips remain neutral and the chip region fills available width. The live recovery model contains only state plus affected primary muscles, and the shared editor becomes a thin coordinator behind its unchanged public API.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Recovery detail | Put time inside affected primary chips | Associates information directly with its muscle | User review |
| Ready presentation | No per-card text and neutral styling | Absence of recovering muscles needs no extra explanation | User review |
| Secondary workload | Remove from UI and runtime contract | It has no clear catalogue action for the user | User review |
| Chip width | Grow the content region and chip list | Fixes unused horizontal space without distorting pill labels | Code research |
| Refactor boundary | Four feature children behind one coordinator | Reduces file complexity while preserving shared create/edit integration | Code research |

## Scope

**In scope:** recovery DTO cleanup, test/contract updates, filter/catalogue/card/draft component extraction, chip-only recovery UX, responsive and accessibility checks.

**Out of scope:** recovery algorithms/windows, completed-history queries, readiness scores, new global UI primitives, browser-test infrastructure, and caller API changes.

## Architecture / Approach

Slim the recovery contract first. Then retain cross-panel state in `WorkoutDraftEditor` while extracting controlled `WorkoutCatalogueFilters`, `WorkoutCataloguePanel`, `WorkoutCatalogueExerciseCard`, and `WorkoutDraftPanel` components under `components/workouts`. Apply the final chip UX at the card boundary and verify both create and edit consumers.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Contract cleanup | Removes secondary workload from model, tests, and canonical docs | Accidentally changing primary recovery semantics |
| 2. Editor decomposition | Thin coordinator plus focused workout components | Breaking replacement or drawer coordination |
| 3. Chip UX | Time-bearing recovery chips and full-width responsive layout | Ambiguous abbreviated time or chip/action collisions |

**Prerequisites:** The reviewed plan commit `8603e23` and current uncommitted UI draft are present.
**Estimated effort:** Two implementation sessions plus manual responsive and accessibility verification.

## Open Risks & Assumptions

- The screenshot's unused row width is caused by the non-growing content region; chips remain intrinsic-width rather than stretching each label to equal width.
- Component/browser automation is unavailable, so create/edit and responsive behavior require explicit manual gates.
- The revised plan materially supersedes the earlier plan review and requires a fresh `/10x-plan-review` before implementation resumes.

## Success Criteria (Summary)

- Recovering time appears only inside affected primary chips; ready and secondary chips contain no extra status copy.
- Secondary workload is absent from live code and canonical contract documentation.
- `WorkoutDraftEditor` is materially smaller while both create and edit workflows remain stable.
