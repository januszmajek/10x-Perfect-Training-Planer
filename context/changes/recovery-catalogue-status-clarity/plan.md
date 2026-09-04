# Recovery catalogue clarity and editor decomposition implementation plan

## Overview

Revise the exercise catalogue based on manual UI review: show recovery time inside the affected muscle chip, remove per-card ready and indirect-work copy, and split the oversized shared draft editor into focused components. Remove secondary workload from the live recovery model because it no longer has a user-facing purpose.

## Current State Analysis

`WorkoutDraftEditor.tsx` is over 600 lines and owns filter state, drawer lifecycle, catalogue filtering and recovery ordering, exercise-card rendering, replacement coordination, draft editing, and save/cancel presentation. Both create and edit flows reuse this component, so its public props and behavior are a load-bearing integration point.

The current uncommitted Phase 1 draft adds a standalone `Ready to train` or `Recovery: …` line and state-coloured card borders. Manual review rejected the standalone copy.

`secondaryWorkload` is not persisted, but it is part of the live TypeScript recovery contract, projection, UI rendering, tests, and canonical contract documentation. Removing the bottom-card explanation therefore requires a coordinated contract cleanup rather than hiding one paragraph.

## Desired End State

Recovery-aware exercise cards show no standalone ready or recovery sentence. Ready cards remain neutral. When a primary muscle is recovering, its chip uses the recovery colour and includes the rounded remaining time, for example `Quads 42h`; every other primary and secondary chip remains neutral.

The recovery projection exposes only the exercise state and affected recovering primary muscles. Secondary-only completed work does not block recovery and produces no display payload. `WorkoutDraftEditor` becomes a thin shared coordinator composed from focused feature-level workout components while keeping its public interface and create/edit behavior stable.

### Key Discoveries

- Both `ManualWorkoutBuilder` and `PlannedWorkoutEditor` consume the same `WorkoutDraftEditor` interface, so extracted children should remain behind that shared composition root. `src/components/workouts/ManualWorkoutBuilder.tsx:139-154`, `src/components/workouts/PlannedWorkoutEditor.tsx:197-217`
- The editor's clean boundaries are filter controls, catalogue/list/card presentation, and draft controls; replacement index and drawer focus coordination cross those boundaries and should stay in the parent. `src/components/workouts/WorkoutDraftEditor.tsx:77-161`, `181-319`, `320-467`, `468-622`
- `SecondaryWorkloadContext`, its accumulator, projection, UI formatter/copy, fixtures, and canonical contract wording are all active surfaces. `src/lib/recovery-aware-catalogue.ts:18-29`, `69-114`, `src/components/workouts/WorkoutDraftEditor.tsx:67-69`, `410-419`, `docs/reference/contract-surfaces.md:52-63`
- There is no component/browser test runner, so existing node tests protect data behavior while accessibility and workflow behavior remain manual gates. `package.json:15-20`

## What We're NOT Doing

- Changing recovery windows, completed-history queries, primary-muscle deadlines, or recovery ordering.
- Adding readiness scores, secondary-workload calculations, medical claims, or exercise restrictions.
- Changing the public props of `WorkoutDraftEditor`, or making its create/edit callers assemble extracted child components themselves.
- Moving feature-specific workout components into `src/components/ui/` or adding a context/provider abstraction.
- Adding a browser/component testing framework in this change.
- Editing historical planning/research artifacts for the completed `recovery-aware-manual-builder` change.

## Implementation Approach

First slim the recovery projection contract and update its focused tests plus the canonical contract registry. Next decompose `WorkoutDraftEditor` behind its unchanged public interface, keeping cross-panel coordination in the parent and feature-local behavior in controlled children. Finally implement the accepted chip-only recovery presentation in the extracted catalogue card and run the complete logic, lint, build, keyboard, and create/edit regression gates.

## Critical Implementation Details

Map `recoveringMuscles` by code so every affected primary tag can read its own remaining duration; do not derive time from state or from other tags. The visible compact `42h` label must have an accessible expansion such as “42 hours of recovery time remaining.” Preserve `replacingIndex` in the coordinator because catalogue selection and draft removal both update it, and preserve the drawer trigger ref/focus-restoration lifecycle across the filter extraction.

## Phase 1: Remove secondary-workload presentation contract

### Overview

Delete secondary fractional workload from the live recovery DTO and presentation contract while keeping secondary-only work non-blocking.

### Changes Required

#### 1. Recovery projection model

**File**: `src/lib/recovery-aware-catalogue.ts`

**Intent**: Remove data that no longer supports a user-facing catalogue decision and simplify the projection to fixed primary-muscle recovery only.

**Contract**: Remove `SecondaryWorkloadContext`, `recovery.secondaryWorkload`, the secondary-set accumulator, fractional calculation, and serialized output. Preserve `RecoveryState`, `recoveringMuscles`, primary deadline aggregation, exact-boundary readiness, stable ordering, and completed-history input compatibility. Export a single recovery-aware catalogue type guard only if both extracted catalogue components need it; do not introduce a UI utility module solely for that guard.

#### 2. Recovery fixtures and tests

**Files**: `src/lib/recovery-aware-catalogue.test.ts`, `src/lib/manual-workout-builder.test.ts`

**Intent**: Update executable contracts for the slimmer recovery object and retain regression evidence that secondary muscle roles do not block readiness.

**Contract**: Replace the fractional-output assertion with a secondary-only readiness assertion, remove `secondaryWorkload` from recovery-aware fixtures, and preserve coverage for empty history, unexpired primary work, exact deadline, repeated primary work, filtering, and stable recovery ordering.

#### 3. Canonical contract documentation

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Keep the live contract registry aligned with the runtime model.

**Contract**: Replace the fractional-secondary-display statement under `Recovery-aware manual builder` with the invariant that secondary tags do not start or block the fixed recovery window. Preserve primary recovery and advisory/selectability statements.

### Success Criteria

#### Automated Verification

- `rg "secondaryWorkload|SecondaryWorkloadContext|fractionalSets|Recent indirect work" src docs/reference/contract-surfaces.md` finds no live references.
- `pnpm test:manual-workout` passes with secondary-only work remaining ready.
- `pnpm lint` passes.

#### Manual Verification

- `/workouts/new` loads without the `Recent indirect work` paragraph on any exercise card.

**Implementation Note**: Pause after automated verification for confirmation that the removed copy is absent before starting the structural refactor.

---

## Phase 2: Decompose the shared workout draft editor

### Overview

Split the oversized editor into focused feature components while preserving one shared public editor interface for create and edit flows.

### Changes Required

#### 1. Shared coordinator

**File**: `src/components/workouts/WorkoutDraftEditor.tsx`

**Intent**: Reduce the file to orchestration, cross-panel state, shared derivations, and top-level responsive layout.

**Contract**: Keep the existing generic props unchanged. Retain search and selected-filter state, `replacingIndex`, filter-drawer state, trigger ref/focus-restoration effect, catalogue/draft lookup maps, filtering, and draft validity in the coordinator. Compose the extracted filters, catalogue, and draft panels; translate child events through the existing pure draft helpers and `onChange` callback.

#### 2. Controlled catalogue filters

**File**: `src/components/workouts/WorkoutCatalogueFilters.tsx`

**Intent**: Isolate the responsive filter drawer/sidebar and its filter controls without creating a second source of state.

**Contract**: Accept controlled open/search/selection/options values and explicit search, toggle, reset, close callbacks. Preserve input IDs, labels, main/secondary/equipment groups, backdrop/close behavior, and mobile accessibility. Own no catalogue or draft state.

#### 3. Catalogue panel and exercise card

**Files**: `src/components/workouts/WorkoutCataloguePanel.tsx`, `src/components/workouts/WorkoutCatalogueExerciseCard.tsx`

**Intent**: Separate catalogue ordering/list behavior from a reusable single-card presentation boundary.

**Contract**: Let the panel own recovery sort state and derive recovery grouping plus per-exercise Add/Added/Replace/Current actions from controlled inputs. Preserve filter-first ordering, result count, empty state, group headings, and semantic lists. The panel is the only extracted component that discriminates raw from recovery-aware catalogue entries; resolve each entry's `recovery` value there and pass `RecoveryAwareCatalogueExercise["recovery"] | null` to the card. Let the card own exercise identity, equipment, muscle chips, optional recovery treatment, and action button. Keep card props independent of the save API and pass a resolved action label/disabled state plus a selection callback.

#### 4. Draft panel

**File**: `src/components/workouts/WorkoutDraftPanel.tsx`

**Intent**: Isolate draft prescriptions, replacement messaging, ordering/removal controls, validation feedback, and save/cancel actions.

**Contract**: Accept the controlled draft, exercise lookup, pending/validity/replacement values, and explicit callbacks. It may own item-update/move/remove helper functions, but `replacingIndex` remains controlled so removing an item can coordinate with catalogue replacement state. Do not extract individual draft rows unless the resulting panel remains materially oversized.

### Success Criteria

#### Automated Verification

- `WorkoutDraftEditor.tsx` is a thin coordinator and no longer contains complete filter, catalogue-card, or draft-panel markup.
- `pnpm test:manual-workout` passes without changes to filtering, recovery ordering, or draft helper semantics.
- `pnpm lint` passes.
- `pnpm build` passes.

#### Manual Verification

- `/workouts/new` preserves filter drawer opening, Escape/overlay closing, body-scroll locking, and focus restoration.
- Add/Added/Replace/Current, draft prescription editing, reorder, remove, save, and cancel behavior remain unchanged.
- `/workouts/edit` continues to use the shared editor with neutral raw-catalogue cards and its existing conflict/discard behavior.

**Implementation Note**: Pause after automated verification for create/edit workflow confirmation before applying the final card presentation.

---

## Phase 3: Move recovery time into muscle chips

### Overview

Apply the accepted catalogue presentation to the extracted exercise card and verify it across recovery and interaction states.

### Changes Required

#### 1. Chip-only recovery presentation

**File**: `src/components/workouts/WorkoutCatalogueExerciseCard.tsx`

**Intent**: Put recovery detail on the muscle it describes and remove redundant card-level explanations.

**Contract**:

- Render no `Ready to train` text and no standalone `Recovery:` sentence.
- Ready recovery-aware cards use the same neutral border and muscle chips as raw catalogue cards.
- For each `recoveringMuscles` entry, the matching primary-muscle chip uses the recovery colour and visible `MuscleName Nh` content, such as `Quads 42h`; include an accessible expansion for the abbreviated duration.
- Never append a duration or recovery colour to secondary chips or nonrecovering primary chips.
- A recovering card may retain a subtle recovery border because its affected chip provides a text cue; colour is never the only status signal.
- Support multiple recovering primary muscles with their individual times and long translated muscle names without truncating meaning.

### Success Criteria

#### Automated Verification

- `pnpm test:manual-workout` passes.
- `pnpm lint` passes.
- `pnpm build` passes.

#### Manual Verification

- Ready cards contain no per-card readiness or indirect-work sentence and remain visually neutral.
- A recovering exercise shows each affected primary muscle as a coloured `MuscleName Nh` chip with the correct individual duration.
- Secondary and nonrecovering chips contain only muscle names and remain neutral.
- Default, Ready first, and Recovery first orders preserve all matching exercises, group behavior, and selectable recovering cards.
- Keyboard and screen-reader users receive the recovery duration and muscle association without relying on colour or ambiguous `h` pronunciation.

**Implementation Note**: After all automated gates pass, pause for human confirmation of the screenshot cases and accessible chip text before the phase commit.

## Testing Strategy

### Unit Tests

- Preserve primary recovery, exact-boundary, repeated-primary, secondary-only-ready, ordering, and filter-before-order coverage.
- Update every recovery-aware fixture to the slimmer `{ state, recoveringMuscles }` contract.

### Manual Testing Steps

1. Open `/workouts/new` with ready, one-muscle recovering, and multi-muscle recovering exercises.
2. Confirm ready cards have no status copy and recovering durations appear only in affected primary chips.
3. Confirm secondary chips remain neutral even after recent secondary-only work.
4. Exercise all three sort states, filters, Add/Added/Replace/Current, and draft editing controls.
5. Navigate and read the catalogue using keyboard and screen-reader output; verify duration abbreviations have expanded meaning.
6. Open `/workouts/edit` and verify shared-editor behavior and neutral raw catalogue presentation.

## Performance Considerations

Recovery data remains server-projected once. Build a small code-to-recovery-context lookup per card from its existing `recoveringMuscles` array; do not add timers, client recovery calculations, API calls, global state, context providers, or memoization abstractions.

## References

- UI review screenshot: `/tmp/codex-clipboard-c9c37802-52a4-4901-bb4a-33b7a0de6b93.png`
- Frame brief: `context/changes/recovery-aware-manual-builder/frame.md`
- Current editor: `src/components/workouts/WorkoutDraftEditor.tsx`
- Recovery contract: `src/lib/recovery-aware-catalogue.ts`
- Shared callers: `src/components/workouts/ManualWorkoutBuilder.tsx`, `src/components/workouts/PlannedWorkoutEditor.tsx`
- Canonical contract: `docs/reference/contract-surfaces.md:52-63`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Remove secondary-workload presentation contract

#### Automated

- [x] 1.1 Remove all live secondary-workload presentation contract references — 213cd6a
- [x] 1.2 Pass secondary-only readiness and manual-workout tests — 213cd6a
- [x] 1.3 Pass `pnpm lint` — 213cd6a

#### Manual

- [x] 1.4 Verify `/workouts/new` shows no `Recent indirect work` paragraph — 213cd6a

### Phase 2: Decompose the shared workout draft editor

#### Automated

- [x] 2.1 Reduce `WorkoutDraftEditor.tsx` to a thin coordinator — 478bf7a
- [x] 2.2 Preserve filtering, ordering, and draft helper behavior with `pnpm test:manual-workout` — 478bf7a
- [x] 2.3 Pass `pnpm lint` — 478bf7a
- [x] 2.4 Pass `pnpm build` — 478bf7a

#### Manual

- [x] 2.5 Verify filter drawer lifecycle and focus restoration — 478bf7a
- [x] 2.6 Verify catalogue and draft actions remain unchanged — 478bf7a
- [x] 2.7 Verify `/workouts/edit` shared-editor workflows remain unchanged — 478bf7a

### Phase 3: Move recovery time into muscle chips

#### Automated

- [x] 3.1 Pass `pnpm test:manual-workout`
- [x] 3.2 Pass `pnpm lint`
- [x] 3.3 Pass `pnpm build`

#### Manual

- [x] 3.4 Verify ready cards contain no status copy and remain neutral
- [x] 3.5 Verify affected primary chips show correct individual recovery times
- [x] 3.6 Verify secondary and nonrecovering chips remain neutral name-only chips
- [x] 3.7 Verify default and both recovery sort orders preserve catalogue behavior
- [x] 3.8 Verify accessible muscle-duration association without relying on colour
