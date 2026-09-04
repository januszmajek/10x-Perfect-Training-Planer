# Frame Brief: Catalogue recovery-state clarity

> Framing step before /10x-plan. This document captures what is actually at
> issue, separated from what was initially assumed.

## Reported Observation

Recovery status in the exercise catalogue is not easy to scan or understand.
The present explanatory wording is not user-friendly.

## Initial Framing (preserved)

- **User's stated cause or approach**: The text about muscles being trained or
  recovering is the main usability problem.
- **User's proposed direction**: Change muscle-pill colour by readiness and
  potentially change the exercise-card border to distinguish ready from not-ready.
- **Pre-dispatch narrowing**: Limited to the exercise catalogue for now.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Information hierarchy** — recovery state appears after the exercise
   metadata and muscle pills, so it is easy to miss while scanning cards.
2. **State-to-element mapping** — the proposed colour treatment may suggest a
   status for every muscle pill although only some primary muscles determine the
   exercise's recovery state. ← initial framing
3. **Copy and certainty** — wording can sound like a physiological verdict,
   rather than the fixed-window planning guidance the product actually provides.
4. **Sorting context** — the grouped headings expose state only after a user
   activates a recovery sort; the unsorted catalogue lacks an at-a-glance state.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Recovery is visually subordinate | The current card renders neutral-purple muscle pills before its amber recovery explanation; ready cards normally have no comparable state label. `src/components/workouts/WorkoutDraftEditor.tsx:374-406` | **STRONG** |
| All muscle pills can share an exercise readiness colour | An exercise becomes `recovering` only when a **primary** muscle has an unexpired window; secondary muscles are separately reported as fractional workload. `src/lib/recovery-aware-catalogue.ts:77-83`, `88-114` | **NONE** — this would overstate the data |
| Copy alone is the main issue | The current strings include “Muscles need recovery” and “recovering for”, but the state is also conditionally visible and structurally low-priority. `src/components/workouts/WorkoutDraftEditor.tsx:354-357`, `386-393` | **WEAK** — copy contributes but is not sufficient |
| State is unavailable when cards are unsorted | Group headings render only when a recovery ordering is active; the default view renders cards without a group state. `src/components/workouts/WorkoutDraftEditor.tsx:350-358` | **STRONG** |

## Narrowing Signals

- The user confirmed that the issue is limited to the catalogue, so no shared
  product-wide recovery pattern should be inferred from this review.
- The catalogue already keeps recovery advisory: cards remain addable in every
  state, so the visual language must guide selection rather than signal a block.
  `context/changes/recovery-aware-manual-builder/plan.md:176-184`, `409-425`

## Cross-System Convention

This feature is intentionally a fixed-window, advisory projection, not a
readiness score or medical recommendation. Its established product convention
is visual demotion without hiding or disabling an exercise. `context/changes/recovery-aware-manual-builder/research.md:24-45`,
`context/changes/recovery-aware-manual-builder/plan.md:219-222`

## Reframed Problem Statement

> **The actual problem to plan around is**: Make an exercise's advisory
> recovery state immediately scannable in the default catalogue, while clearly
> tying the reason and remaining time only to the affected primary muscle(s).

The initial direction is partly sound: a subtle card-level state cue fits the
existing visual-demotion policy. Generic readiness colours on every muscle pill
would be misleading because secondary tags are not recovery blockers and a
ready exercise can still carry recent indirect-work context. Copy should be
made concise, but it cannot substitute for a clear state hierarchy.

## Confidence

- **HIGH** — the rendering order, conditional visibility, and primary-versus-
  secondary recovery contract directly support the reframe.

## What Changes for /10x-plan

A future plan should evaluate a catalogue-only recovery-status hierarchy, not
a broad recolouring of muscle tags. It must preserve advisory semantics,
identify affected primary muscles precisely, and keep the reason/time available
without relying on colour alone.

## References

- `src/components/workouts/WorkoutDraftEditor.tsx:350-406`
- `src/lib/recovery-aware-catalogue.ts:77-114`
- `context/changes/recovery-aware-manual-builder/plan.md:163-222`
- `context/changes/recovery-aware-manual-builder/research.md:24-45`
