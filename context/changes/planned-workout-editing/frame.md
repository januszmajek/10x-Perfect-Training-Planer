# Frame Brief: Conflict-State Action Hierarchy

> Framing step before further implementation. This document separates the
> observed conflict UX from an assumed presentation fix.

## Reported Observation

After a stale save, the editor renders an inline comparison below the normal
editor. The normal primary action changes to “Overwrite with my changes” while
the comparison renders another action with the same label.

## Initial Framing (preserved)

- **User's stated cause or approach**: The comparison is not a dialog, and two overwrite buttons on one page feel odd.
- **User's proposed direction**: Address both the duplicate action and the non-modal comparison.
- **Pre-dispatch narrowing**: Both symptoms are leading concerns in one conflict scenario.

## Dimension Map

The observation could originate at these dimensions:

1. **Normal-editor action rendering** — the shared editor remains active while a conflict is unresolved.
2. **Conflict-state action rendering** — the conflict panel owns its own overwrite action.
3. **Conflict presentation boundary** — reviewed conflict content is rendered inline instead of as a distinct interaction state.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Normal editor remains actionable during conflict | `PlannedWorkoutEditor.tsx:198-215` always renders `WorkoutDraftEditor`; its label changes on conflict at line 202. | STRONG |
| Conflict panel separately owns overwrite | `PlannedWorkoutEditor.tsx:223-264` adds a second overwrite button at lines 247-254. | STRONG |
| The contract requires inline comparison | The plan requires displayed summaries and two choices, but does not prescribe inline presentation (`plan.md:387-390`). | NONE |

## Narrowing Signals

- The duplicated primary action and non-modal comparison occur in the same stale-save state.
- The conflict protocol itself works: Tab B keeps its draft and can load the latest plan or explicitly overwrite.

## Cross-System Convention

A conflict-resolution decision should have one visible action owner and a
clearly bounded focus context. The current implementation has two owners for
the same destructive-resolution action.

## Reframed Problem Statement

> **The actual problem to plan around is**: conflict resolution is not an
> exclusive interaction state, so normal editor commands compete with the
> conflict-resolution commands.

The comparison being inline is a presentation symptom, not the root cause. A
revised implementation should ensure exactly one conflict action set is
available while the user reviews the latest durable plan and their local draft.

## Confidence

- **HIGH** — the two rendered action owners are directly visible in the
  controller, while the approved plan leaves the presentation mode open.

## What Changes for Further Planning

The adjustment should define an exclusive reviewed-conflict state and its
single action hierarchy, while retaining the existing compare-and-swap and
draft-preservation behavior.

## References

- [PlannedWorkoutEditor.tsx](/home/majusz/Projects/codi/10xProjekt/src/components/workouts/PlannedWorkoutEditor.tsx:198)
- [Phase 3 conflict contract](/home/majusz/Projects/codi/10xProjekt/context/changes/planned-workout-editing/plan.md:387)
