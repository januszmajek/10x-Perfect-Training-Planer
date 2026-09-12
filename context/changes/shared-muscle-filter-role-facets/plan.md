# Shared Muscle Filter Role Facets Implementation Plan

## Overview

Replace the misleading primary/secondary muscle filter facets with one de-duplicated `Muscles` facet on both workout catalogue and History. Preserve the existing role-agnostic filter behavior, URL format, and completed-workout role labels.

## Current State Analysis

The UI displays muscle options grouped by tag role, but selected filters are stored only as muscle codes. A muscle that has appeared in both roles therefore appears twice and shares its checked state. The underlying matching contract deliberately ignores role.

## Desired End State

Each filter surface exposes one alphabetized `Muscles` group in which each muscle appears once. Selecting a muscle continues to match it whether it is tagged primary or secondary, and existing bookmarked `?muscle=<code>` URLs keep working.

### Key Discoveries:

- Catalogue already computes a code/name-deduplicated option list in `src/components/workouts/WorkoutDraftEditor.tsx:69-75`.
- History currently intentionally retains role/code option pairs in `src/lib/workout-history-client.ts:51-60`, then renders separate role facets in `src/components/workouts/WorkoutHistory.tsx:430-465`.
- The role-agnostic semantic contract is explicit in `src/lib/muscle-filter.ts:5-14`; URLs and the History query contain muscle codes, never role values.
- Required CI E2E specs locate `Main muscles` directly in `e2e/history-filters.spec.ts:19-64` and `e2e/responsive-navigation.spec.ts:124-132`.

## What We're NOT Doing

- Do not make primary and secondary filters independent.
- Do not change database schema, API contracts, filter URLs, or role-agnostic matching semantics.
- Do not add test files or new E2E scenarios.
- Do not remove primary/secondary labels from exercise and History-detail displays.

## Implementation Approach

Make the UI option boundary role-agnostic: pass one unique code/name option list into each filter component, while leaving the selected-code state and filter/query paths intact. Update the existing rendered and E2E assertions that name the changed UI controls, then document the decision in this change record.

## Phase 1: Unify Catalogue Muscle Facet

### Overview

Expose the catalogue's already deduplicated muscle list as one filter group.

### Changes Required:

#### 1. Catalogue filter component

**File**: `src/components/workouts/WorkoutCatalogueFilters.tsx`

**Intent**: Replace the two role-labelled props and controls with one `muscles` prop and a single `Muscles` option group so each muscle has one visible control.

**Contract**: Preserve `selectedMuscles`, `onToggleMuscle`, selected-count behavior, equipment controls, reset behavior, drawer lifecycle, and ordering supplied by the parent.

#### 2. Catalogue filter owner

**File**: `src/components/workouts/WorkoutDraftEditor.tsx`

**Intent**: Remove the role-derived option arrays and pass the existing code/name-deduplicated `muscleOptions` list to the filter component.

**Contract**: Keep `catalogueNavigation.muscles`, filtering, and canonical URL synchronization unchanged.

### Success Criteria:

#### Automated Verification:

- Existing rendered catalogue-filter tests pass with the one-list component interface and `Muscles` label.
- `pnpm test:ui` passes.

#### Manual Verification:

- On the new-workout page, each muscle appears once under `Muscles`; selecting, resetting, and reopening the filter behave as before.

---

## Phase 2: Unify History Muscle Facet

### Overview

Provide History with one code-deduplicated option list while retaining role data for exercise details.

### Changes Required:

#### 1. History filter-option boundary

**Files**: `src/lib/workout-history-client.ts`, `src/lib/workout-history.ts`

**Intent**: Make the History filter-option type and deduplication role-agnostic, collapsing duplicate role records by muscle code before they reach the UI.

**Contract**: Replace the role-bearing filter-option type with the role-free `MuscleOption` shape and deduplicate by `code`, relying on the catalogue's one canonical name per code. The loader may stop selecting role for filter options; completed-history exercise tags retain their role for detail rendering. The History API and query parameters remain role-free.

#### 2. History filter UI

**File**: `src/components/workouts/WorkoutHistory.tsx`

**Intent**: Remove role partitioning and render one `Muscles` facet backed by the deduplicated options.

**Contract**: Render one `Muscles` facet with code-based React keys; remove role partitioning and role-derived filter control state. Preserve selected-code state, date/equipment filters, debounce/fetch lifecycle, active-filter display, browser navigation, and detail role labels.

### Success Criteria:

#### Automated Verification:

- Existing History client and rendered-component tests pass after adapting role-specific option expectations to one code-level option list.
- `pnpm test:history` and `pnpm test:ui` pass.

#### Manual Verification:

- On History, one `Muscles` facet controls each muscle once; date, equipment, reset, reload, Back, and Forward behavior remain intact.

---

## Phase 3: Preserve Existing Regression Coverage and Record the Contract

### Overview

Adapt existing test fixtures and E2E locators to the renamed facet, then retain the resolved product decision with the change artifacts.

### Changes Required:

#### 1. Existing rendered-component tests

**Files**: `src/components/workouts/WorkoutCatalogueFilters.test.tsx`, `src/components/workouts/WorkoutHistory.test.tsx`, `src/lib/workout-history-client.test.ts`

**Intent**: Update existing fixtures, labels, and expected option shapes to reflect one deduplicated muscle facet; do not add scenarios or test files.

**Contract**: Existing tests continue to prove their current responsibilities after the component and filter-option interfaces change.

#### 2. Existing browser-level tests

**Files**: `e2e/history-filters.spec.ts`, `e2e/responsive-navigation.spec.ts`

**Intent**: Replace role-facet locators with the `Muscles` facet locator while retaining the current filter URL, reload, Back/Forward, responsive drawer, and interaction assertions.

**Contract**: These are required CI tests. Follow `context/foundation/lessons.md`: assert visible state and successful interaction; do not introduce cross-host visual baselines.

#### 3. Change documentation

**Files**: `context/changes/shared-muscle-filter-role-facets/change.md`, `context/changes/shared-muscle-filter-role-facets/frame.md`, `context/changes/shared-muscle-filter-role-facets/plan.md`, `context/changes/shared-muscle-filter-role-facets/plan-brief.md`

**Intent**: Preserve the diagnosis, approved role-agnostic UI decision, scope boundary, and verification requirements in the active change record.

**Contract**: Do not alter immutable `context/archive/` materials or the PRD; their existing generic muscle-filter requirements remain satisfied.

### Success Criteria:

#### Automated Verification:

- Existing E2E specs pass with their updated `Muscles` locators: `pnpm test:e2e`.
- Full handoff gates pass: `pnpm lint` and `pnpm build`.

#### Manual Verification:

- Verify the one-facet experience at desktop and mobile widths, including a muscle present in both roles, without any duplicate checkbox or linked role-labelled control.

---

## Testing Strategy

### Unit and Rendered Tests:

- Update existing component and History-client tests only as required by the changed props, labels, and role-agnostic option type.
- Retain existing pure semantic tests proving a selected muscle matches either primary or secondary tags.

### Browser Tests:

- Update existing E2E locators only; preserve their established assertions for canonical URLs, reload, browser navigation, responsive drawers, and filter interaction.
- Run the required browser suite in the CI-equivalent Chromium configuration before treating the change as complete.

### Manual Testing Steps:

1. Open filters on `/workouts/new` and `/history` at desktop and mobile widths.
2. Confirm there is exactly one `Muscles` facet and that a cross-role muscle appears only once.
3. Select, reset, reload, and navigate History Back/Forward to confirm the existing role-agnostic filter behavior is unchanged.

## Performance Considerations

The change reduces redundant filter controls and leaves option-list sizes, data fetching, URLs, and matching complexity unchanged.

## Migration Notes

No migration is required. Existing URLs already contain role-agnostic muscle codes and remain valid.

## References

- Frame: `context/changes/shared-muscle-filter-role-facets/frame.md`
- Filter contract: `src/lib/muscle-filter.ts:5-14`
- CI E2E lesson: `context/foundation/lessons.md:5-10`
- Browser configuration: `playwright.config.ts:1-31`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Unify Catalogue Muscle Facet

#### Automated

- [x] 1.1 Existing rendered catalogue-filter tests pass with the one-list component interface and `Muscles` label.
- [x] 1.2 `pnpm test:ui` passes.

#### Manual

- [x] 1.3 On the new-workout page, each muscle appears once under `Muscles`; selecting, resetting, and reopening the filter behave as before.

### Phase 2: Unify History Muscle Facet

#### Automated

- [ ] 2.1 Existing History client and rendered-component tests pass after adapting role-specific option expectations to one code-level option list.
- [ ] 2.2 `pnpm test:history` and `pnpm test:ui` pass.

#### Manual

- [ ] 2.3 On History, one `Muscles` facet controls each muscle once; date, equipment, reset, reload, Back, and Forward behavior remain intact.

### Phase 3: Preserve Existing Regression Coverage and Record the Contract

#### Automated

- [ ] 3.1 Existing E2E specs pass with their updated `Muscles` locators: `pnpm test:e2e`.
- [ ] 3.2 Full handoff gates pass: `pnpm lint` and `pnpm build`.

#### Manual

- [ ] 3.3 Verify the one-facet experience at desktop and mobile widths, including a muscle present in both roles, without any duplicate checkbox or linked role-labelled control.
