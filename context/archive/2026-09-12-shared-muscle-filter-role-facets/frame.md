# Frame Brief: Shared Muscle Filter Role Facets

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

The same muscle appears in both the primary and secondary filter groups on History and the workout layout. Selecting it in one group visibly selects it in the other.

## Initial Framing (preserved)

- **User's stated cause or approach**: This may be unintended duplicated filter state rather than two independent group-specific filters.
- **User's proposed direction**: Determine whether the behavior is intended, documented, or a bug.
- **Pre-dispatch narrowing**: Both duplicate appearance and linked selection are leading concerns.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Role-aware option construction** — one muscle code can legitimately have primary and secondary tags, so it can appear under both headings.
2. **Selection-state identity** — a selection keyed only by muscle code must be reflected in every view of that code.
3. **Matching semantics** — filters may deliberately ignore tag role and match a selected muscle against either role.
4. **UI contract and documentation** — role-labelled headings can imply independent filters even when the underlying filter is shared.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Role-aware option construction is producing a real duplicate | History deduplicates by `role:code` in `src/lib/workout-history-client.ts:51-60`; the builder independently includes codes present in each role in `src/components/workouts/WorkoutDraftEditor.tsx:77-94`. | STRONG |
| Selection is keyed only by muscle code | Both catalogue groups receive one `selectedMuscles` array in `src/components/workouts/WorkoutCatalogueFilters.tsx:129-141`; History checks and toggles only `muscle.code` in `src/components/workouts/WorkoutHistory.tsx:433-455`. | STRONG |
| Roles are intentionally irrelevant to filtering | `src/lib/muscle-filter.ts:5-14` explicitly defines role-agnostic matching; History query/filter tests retain the same behavior. | STRONG |
| The visible contract clearly explains shared selection | PRD requires muscle filtering but does not define role-specific shared-selection behavior (`context/foundation/prd.md:95-100, 138-142`); no UI test covers a duplicated code and linked checkboxes. | NONE |

## Narrowing Signals

- The user confirmed that both duplicate appearance and linked selection are problematic.
- The same implementation pattern exists independently on the catalogue and History surfaces.

## Cross-System Convention

The codebase intentionally treats a muscle filter as one role-agnostic set of muscle codes: both primary and secondary tags match. Archived planning material records that intent, while the current labels present role-specific facets without explaining they operate on the same state.

## Reframed Problem

This is not a data duplication defect or accidental state coupling. It is a UI-contract defect: two role-labelled controls represent a single, role-agnostic filter, so the interface suggests a distinction the filtering system does not support.

## Decision Needed Before Planning

Choose one coherent product contract:

1. Keep role-agnostic filtering and replace the two facets with one de-duplicated muscle list (or explicitly explain the shared selection).
2. Make primary and secondary selections independent, define their combination semantics, extend URL/API state, and update filtering/query tests.
