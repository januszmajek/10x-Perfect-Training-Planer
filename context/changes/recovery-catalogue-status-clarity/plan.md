# Recovery catalogue status clarity implementation plan

## Overview

Refine the recovery-aware exercise catalogue so users can identify advisory recovery status at a glance in every ordering state. The presentation will use compact text status, a subtle card-level state cue, and precise highlighting of only the primary muscles currently in recovery.

## Current State Analysis

`WorkoutDraftEditor` renders neutral exercise cards and purple muscle pills. Recovering entries expose their explanation only after those tags, while ready entries generally have no equivalent state label. Group headings communicate state only when recovery sorting is active.

The server-side projection already provides display data. It marks an exercise `recovering` only when a primary muscle has an unexpired recovery deadline, and retains secondary workload only as contextual data. This change must consume that contract; it must not recalculate readiness.

## Desired End State

On `/workouts/new`, every recovery-aware exercise card clearly states either `Ready to train` or a concise recovery message that names every affected primary muscle and its rounded remaining time. Ready and recovering cards have subtle, distinct borders, and only affected primary-muscle pills receive the recovering treatment. Users can still search, sort, add, and replace every exercise regardless of status.

### Key Discoveries

- The UI surface is shared by new and edit pages, but only the new-workout route passes the recovery-enriched catalogue. `src/components/workouts/WorkoutDraftEditor.tsx:97-117`, `src/pages/workouts/new.astro:12-30`, `src/pages/workouts/edit.astro:12-25`
- `recoveringMuscles` contains exactly primary-muscle causes and remaining time; secondary workload never blocks readiness. `src/lib/recovery-aware-catalogue.ts:77-115`
- No component/browser test runner exists. Existing unit tests protect projection, filtering, and ordering, while card behavior requires focused manual verification. `package.json:15-18`, `src/lib/recovery-aware-catalogue.test.ts:35-110`

## What We're NOT Doing

- Changing recovery-window calculations, completed-history queries, or primary/secondary workload rules.
- Adding a recovery score, medical claim, hard restriction, or recovery setting.
- Reordering, filtering, hiding, disabling, or changing Add/Replace behavior based on recovery state.
- Applying recovery status to the raw catalogue used by `/workouts/edit`.
- Replacing the existing page-level advisory explanation.

## Implementation Approach

Keep recovery presentation local to `WorkoutDraftEditor` and conditional on the existing recovery-aware type guard. Render readable status before the muscle list, apply a restrained state border to recovery-aware cards, and use supplied recovering-muscle codes to mark only corresponding primary tags. Continue showing secondary workload as neutral context and leave ordering, filtering, and draft interactions untouched.

## Critical Implementation Details

The visible status must not rely on colour: it is the text alternative for the card border and pill treatment. For compound movements, include every item from `recovery.recoveringMuscles`; use the existing `formatRemainingTime()` helper instead of recalculating time in React.

## Phase 1: Present precise advisory recovery status

### Overview

Make ready and recovering cards scannable in the default catalogue and all recovery-sort states without widening the data contract.

### Changes Required

#### 1. Recovery-aware exercise cards

**File**: `src/components/workouts/WorkoutDraftEditor.tsx`

**Intent**: Give each recovery-aware card an accessible compact status near the exercise identity and visual differentiation that mirrors—but does not replace—that text.

**Contract**:

- Keep cards with no `recovery` data visually and behaviorally unchanged, so `/workouts/edit` remains a raw-catalogue experience.
- A ready card displays `Ready to train` and a subtle ready border. A recovering card displays `Recovery:` followed by every affected primary-muscle name and its existing rounded remaining time, plus a subtle recovering border.
- Build affected-muscle membership from `recovery.recoveringMuscles`. Apply the recovering pill treatment only when a rendered tag is both primary and present in that membership; leave all other primary and secondary tags neutral.
- Preserve secondary-workload copy as neutral ready-card context; do not turn it into a warning or readiness modifier.
- Preserve the semantic list/card structure, existing muscle-list label, responsive card layout, and all Add/Added/Replace states.

### Success Criteria

#### Automated Verification

- `pnpm test:manual-workout` passes, protecting existing recovery projection, filtering, and ordering behavior.
- `pnpm lint` passes.

#### Manual Verification

- A default-order catalogue with mixed ready/recovering entries shows text status and a subtle state cue on each recovery-aware card.
- A recovering compound exercise names every recovering primary muscle and time, highlights only those primary pills, and leaves secondary pills neutral.
- A ready exercise with secondary workload remains ready and presents workload as context.
- Add and Replace remain available for recovering exercises.

**Implementation Note**: After automated checks pass, pause for manual confirmation of mixed-state and primary/secondary cases before proceeding to regression verification.

---

## Phase 2: Verify catalogue and raw-catalogue regressions

### Overview

Confirm the status hierarchy works across responsive, ordering, and accessibility states while raw-catalogue edit mode stays unchanged.

### Changes Required

#### 1. Catalogue regression verification

**File**: `src/components/workouts/WorkoutDraftEditor.tsx`

**Verification surfaces**: `src/pages/workouts/new.astro`, `src/pages/workouts/edit.astro`

**Intent**: Verify the refinement consumes existing recovery data only and does not alter route-specific catalogue behavior.

**Contract**: Do not introduce a browser-test framework for this isolated presentation change. Use the existing logic-test command and manual checks to verify default order, both recovery orders, narrow-screen operation, keyboard operation, and the raw edit catalogue.

### Success Criteria

#### Automated Verification

- `pnpm test:manual-workout` passes.
- `pnpm lint` passes.
- `pnpm build` passes.

#### Manual Verification

- In default order and both recovery sort orders, ready/recovering status text remains visible, all matching cards remain present, and grouping/order is unchanged.
- At a 360px viewport, status text remains legible, muscle pills wrap without obscuring Add/Replace, and the filter drawer plus sort button remain usable.
- Keyboard users can operate Filters, Sort, Add, and Replace while status text remains available without interpreting colour.
- `/workouts/edit` continues to render neutral raw-catalogue cards without recovery status.

**Implementation Note**: After all gates pass, pause for human confirmation of mobile and keyboard checks before considering the change ready for review.

## Testing Strategy

### Unit Tests

- Re-run recovery projection tests for ready, recovering, deadline-boundary, secondary-workload, and stable-ordering behavior.
- Re-run manual-builder tests for filter-before-order and draft-interaction invariants.

### Manual Testing Steps

1. Open `/workouts/new` with a mixed recovery catalogue in default order and inspect card status, border, and muscle-pill treatment.
2. Cycle Sort through Ready first and Recovery first; confirm only ordering and grouping change.
3. Exercise search and muscle/equipment filters, then add and replace both a ready and recovering exercise.
4. Repeat at 360px and using the keyboard; verify text conveys status without colour.
5. Open `/workouts/edit`; confirm raw cards are unaffected.

## Performance Considerations

The component already receives display-ready recovery data. Derive any recovering-muscle lookup per rendered card from its existing small array; do not add data reads, timers, or client-side recovery calculation.

## References

- Frame brief: `context/changes/recovery-aware-manual-builder/frame.md`
- Recovery presentation: `src/components/workouts/WorkoutDraftEditor.tsx:350-407`
- Recovery contract: `src/lib/recovery-aware-catalogue.ts:77-115`
- Existing tests: `src/lib/recovery-aware-catalogue.test.ts:35-110`
- Product guidance: `context/changes/recovery-aware-manual-builder/research.md:24-45`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Present precise advisory recovery status

#### Automated

- [ ] 1.1 Preserve recovery projection, filtering, and ordering with `pnpm test:manual-workout`
- [ ] 1.2 Pass `pnpm lint`

#### Manual

- [ ] 1.3 Verify mixed-state cards show text status and a subtle state cue
- [ ] 1.4 Verify recovering compound cards highlight only affected primary pills
- [ ] 1.5 Verify ready cards retain secondary workload as neutral context
- [ ] 1.6 Verify recovering exercises remain available to Add and Replace

### Phase 2: Verify catalogue and raw-catalogue regressions

#### Automated

- [ ] 2.1 Re-run `pnpm test:manual-workout`
- [ ] 2.2 Pass `pnpm lint`
- [ ] 2.3 Pass `pnpm build`

#### Manual

- [ ] 2.4 Verify status visibility and unchanged grouping in default and both recovery sort orders
- [ ] 2.5 Verify the 360px layout, card wrapping, filter drawer, and sort control
- [ ] 2.6 Verify keyboard operation and text status without relying on colour
- [ ] 2.7 Verify `/workouts/edit` retains neutral raw-catalogue cards
