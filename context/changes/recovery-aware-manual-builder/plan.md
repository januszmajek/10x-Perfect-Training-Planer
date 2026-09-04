# Recovery-aware manual builder Implementation Plan

## Overview

Add recovery-aware catalogue guidance to the manual workout builder. The builder will derive recovery state from the
signed-in user's completed history, use the existing 48/72-hour per-muscle policy, and surface matching exercises in
ready and recovering groups without ever preventing manual selection.

The feature uses the established fractional-set convention for context: primary work contributes 1.0 set and
secondary work contributes 0.5 sets. Only primary work starts the fixed recovery window in this MVP, because the app
does not capture load, RIR, failure, or other inputs needed for a defensible dynamic readiness score.

## Current State Analysis

The manual-builder SSR route already receives its catalogue and current planned workout from
`loadManualWorkoutBuilderData()`. The catalogue includes canonical primary/secondary tags, while the database already
stores a recovery policy for every muscle group. Completed workouts are immutable, have a database-owned
`completed_at`, and preserve their exercises and muscle mappings.

What is missing is the owner-scoped recent-history read, recovery projection, client contract, and catalogue
presentation. The builder currently filters only by text, muscle, and equipment and renders one flat exercise list.

## Desired End State

A signed-in user opening `/workouts/new` sees the same searchable, filterable exercise catalogue, enriched with
recovery guidance derived from their completed workouts. After the user's own filters are applied, a clickable
three-state recovery-order control can preserve the original catalogue order, show **Ready to go** before **Muscles
need recovery**, or reverse that order. The two recovery-sort states present clear groups. Recovering cards name the
affected primary muscle and its remaining recovery time; ready cards show recent indirect (secondary) fractional
workload when it exists. Every exercise remains addable.

The feature is correct at exact recovery-window boundaries, never reads another user's history, and does not alter
the established save/replacement API, database schema, or planned-workout lifecycle.

### Key Discoveries:

- `muscle_groups.recovery_hours` already stores the fixed 48/72-hour policy and `exercise_muscle_groups` defines
  canonical primary/secondary tags (`supabase/migrations/20260820090000_create_exercise_catalogue.sql:15-69`).
- The completion RPC writes the authoritative event time, `completed_at`, atomically
  (`supabase/migrations/20260902130000_complete_planned_workout.sql:40-42`).
- `loadManualWorkoutBuilderData()` is the appropriate SSR composition boundary; it already combines catalogue and
  current-plan reads before `ManualWorkoutBuilder` hydrates (`src/lib/manual-workouts.ts:25-38`).
- User filters are implemented by the pure `filterCatalogue()` helper and must remain authoritative
  (`src/lib/manual-workout-builder.ts:72-87`).
- Fractional sets—primary `1.0`, secondary `0.5`—are an evidence-backed workload-accounting convention, but not a
  validated recovery-hours formula. The selected MVP policy applies full fixed windows only to primary work; see
  `context/changes/recovery-aware-manual-builder/research.md`.

## What We're NOT Doing

- Adding a database migration, persisted recovery state, a recovery percentage, or a medical/readiness score.
- Treating secondary work as a full recovery block or inventing a primary/secondary recovery-hour multiplier.
- Collecting actual weight, RPE/RIR, failure, soreness, sleep, cardio, health-platform, or user-profile data.
- Hiding recovering exercises, disabling the Add action, or changing save/replacement semantics.
- Changing the edit-planned-workout page; recovery guidance applies only to the new manual builder in this slice.
- Adding a browser test framework, fitness-tracker integration, user-configurable recovery windows, or AI-proposer
  behavior.

## Implementation Approach

Keep recovery entirely derived at the SSR service boundary. Load the catalogue with recovery policy data, load only
the authenticated user's completed workouts that could still fall inside the longest configured recovery window, and
pass both through a pure projection helper. The helper computes primary recovery deadlines, fractional secondary
workload, and display-ready state for each catalogue exercise. The React editor continues to own local search and
filter controls, then groups the already-filtered result by recovery state.

## Critical Implementation Details

### Timing & lifecycle

Use the database-owned `completed_at`, never `created_at` or a browser timestamp. A muscle is recovering exactly while
`now < completed_at + recovery_hours`; at equality it is ready. When multiple completed workouts affect the same
primary muscle, retain the latest deadline. `loadManualWorkoutBuilderData()` must first load the catalogue, derive the
maximum `recoveryHours` from its returned canonical tags, then load the current plan and owner-scoped completed history
in parallel using that derived bound. This avoids both an unbounded history read and a duplicated `72`-hour magic
number across the service and UI.

### User experience spec

Apply search, selected-muscle, and equipment filters before recovery ordering. A filter never hides a result because of
state: it can show both groups, only ready results, or only recovering results. Above the catalogue, a button cycles
through **Not sorted** (the current alphabetical catalogue order), **Ready to go first**, and **Muscles need recovery
first**. The two recovery-order states render their matching groups in the selected order. Provide a concise,
non-medical explanation such as “Chest recovering for 18h” and preserve the current accessible Add/Replace controls.

## Phase 1: Derive Recovery-aware Catalogue Data

### Overview

Create the typed recovery projection and load exactly the owner-scoped completed-history data it needs, without
persisting a score or altering the workout lifecycle.

### Changes Required:

#### 1. Recovery catalogue domain helper and unit coverage

**Files**: `src/lib/recovery-aware-catalogue.ts`, `src/lib/recovery-aware-catalogue.test.ts`

**Intent**: Create one pure, clock-injected transformation from catalogue muscle tags plus recent completed-workout
workloads to display-ready recovery state. Keeping it pure makes the primary/secondary boundary and time calculations
independently testable.

**Contract**: Model recovery state as `ready` or `recovering`; expose the latest primary-muscle deadline, remaining
time data, and any secondary fractional workload context needed by the UI. Each completed set contributes `1.0` to a
primary tag and `0.5` to a secondary tag. Only a primary contribution starts the corresponding muscle's configured
recovery window. An exercise is recovering when any of its primary target muscles is recovering; its result remains
selectable regardless of state.

#### 2. Catalogue and builder-load service contract

**Files**: `src/lib/manual-workout-builder.ts`, `src/lib/planned-workouts.ts`, `src/lib/manual-workouts.ts`,
`src/lib/manual-workouts.test.ts`

**Intent**: Enrich catalogue muscle metadata with the existing recovery policy and compose the recovery projection
into the manual-builder SSR payload. Preserve the editor's existing generic catalogue contract so planned-workout
editing remains unaffected.

**Contract**: Extend catalogue muscle tags to carry the canonical `recoveryHours` value loaded from
`muscle_groups.recovery_hours`. `loadManualWorkoutBuilderData()` first loads and validates the catalogue, calculates
the maximum recovery window from its returned tags, then concurrently loads the current plan and only the current
user's completed workouts whose `completed_at` can still affect that window. The history query includes ordered sets
and canonical muscle roles; it excludes planned workouts and other users' workouts. Map malformed persistence data to
the established safe failure result, and return recovery-enriched catalogue exercises alongside the unchanged
current-plan payload. Do not change the manual-save request or `/api/workouts/manual`.

#### 3. Focused test command

**File**: `package.json`

**Intent**: Make the recovery helper and service contract part of the repository's repeatable Node test workflow.

**Contract**: Extend the existing manual-workout test script, or add a clearly named recovery test script, so it runs
the existing builder tests plus the new recovery projection and service tests using the repository's
`node --experimental-strip-types --test` convention.

### Success Criteria:

#### Automated Verification:

- The recovery helper tests cover no history, an unexpired primary window, an exact expiry boundary, repeated primary
  work extending a deadline, and secondary-only fractional contributions.
- Service tests prove that recovery history is scoped to the authenticated owner, restricted to completed workouts,
  and has the expected time bound and nested muscle-role data.
- The manual-workout Node test command passes.
- `pnpm lint` passes.

#### Manual Verification:

- With a completed chest-focused workout and no current plan, reload `/workouts/new` and confirm that the data load
  succeeds without changing the existing planned-workout replacement flow.
- Complete a workout just inside and then just outside its configured boundary; confirm the state changes only at the
  intended time.

**Implementation Note**: After the helper and owner-scoped read are verified, pause for manual confirmation that
recovery is derived from completion time and does not affect saving before changing catalogue presentation.

---

## Phase 2: Present Recovery-aware Catalogue Guidance

### Overview

Render recovery as a sort/grouping layer on the existing manual builder while keeping every search and filter result
visible and addable.

### Changes Required:

#### 1. Recovery ordering and grouped catalogue UI

**File**: `src/components/workouts/WorkoutDraftEditor.tsx`

**Intent**: Add a clickable three-state recovery-order control above the exercise list. It can preserve the existing
flat catalogue order or split filtered results into ready/recovering groups in either recovery priority. Draft
composition and replacement behavior remain intact.

**Contract**: Apply `filterCatalogue()` first, then use a labelled button to cycle this exact state order: **Not
sorted** → **Ready to go first** → **Muscles need recovery first** → **Not sorted**. Not sorted preserves the existing
alphabetical flat catalogue order. Each recovery-order state stably groups matching exercises in the selected order,
rendering both groups when present and the applicable single group when filters match only one state. Recovering cards
show their primary recovery cause and remaining time; ready cards show secondary fractional-work context when it
exists. The existing Add/Added/Replace button logic, selected-item rules, and maximum-exercise limit must behave
identically in every sort state. Expose the current sort state and next click action accessibly, and maintain the
current mobile filter-drawer focus restoration.

#### 2. Manual-builder page copy

**File**: `src/pages/workouts/new.astro`

**Intent**: Set accurate expectations before the React island loads.

**Contract**: Update the introductory copy to describe recovery as optional planning guidance based on completed
workouts, not a restriction or medical recommendation. Do not surface user-configurable policy controls.

#### 3. UI-facing recovery tests

**Files**: `src/lib/recovery-aware-catalogue.test.ts`, `src/lib/manual-workout-builder.test.ts`

**Intent**: Lock down the data ordering that the UI relies on without adding a browser test framework.

**Contract**: Cover mixed ready/recovering catalogue results, all three recovery-order states, primary-muscle-only
blocking for a compound movement, visible secondary fractional-work context, and existing text/muscle/equipment
filtering retaining matching results from both states. Preserve the current filter semantics that require all
explicitly selected muscles.

### Success Criteria:

#### Automated Verification:

- Recovery ordering and filter-combination unit tests pass through the manual-workout test command.
- `pnpm lint` passes.
- `pnpm build` passes.

#### Manual Verification:

- At a 360px viewport, the user can search and apply muscle/equipment filters, cycle every recovery-order state, see
ready and recovering matches in their selected group order, and add an exercise from either group.
- A filter that matches only recovering exercises displays those cards and their explanation rather than an empty
catalogue.
- Keyboard users can open and close filters, operate the three-state recovery-order button, read recovery context,
and add or replace exercises without losing focus unexpectedly.

**Implementation Note**: Recovery state is advisory. No state may disable Add, Replace, save, or replacement
confirmation, even when every filtered result is recovering.

---

## Phase 3: Record the Contract and Run Regression Gates

### Overview

Document the derived recovery policy for later history and AI slices, then verify that the feature does not regress
database, type, lint, or Cloudflare Worker build boundaries.

### Changes Required:

#### 1. Recovery-aware catalogue contract registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Make the recovery input, primary/secondary treatment, time boundary, and advisory UI policy discoverable
to subsequent changes.

**Contract**: Add a recovery-aware manual-builder section stating that completed owner history is the sole input,
`completed_at` is authoritative, primary tags start configured windows, secondary tags contribute 0.5 fractional
workload but do not block readiness, recovery is derived at read time, and filters remain independent from state.
Document that a dynamic score requires additional logged inputs and is out of scope.

#### 2. Full local verification

**Files**: no source change required beyond the tests and documentation above

**Intent**: Exercise the project's established database and application quality gates before handoff.

**Contract**: Run the focused recovery/manual tests, the existing full local database suite, lint, and production
build. Do not deploy, alter secrets, regenerate schema types, or apply a hosted migration because this change does
not modify the database schema.

### Success Criteria:

#### Automated Verification:

- The recovery/manual Node test command passes.
- `pnpm exec supabase test db --local supabase/tests/database` passes.
- `pnpm lint` passes.
- `pnpm build` passes.

#### Manual Verification:

- Verify a completed primary-muscle workout moves the relevant catalogue entries from recovering to ready when its
configured window expires.
- Verify that a secondary-only contribution is visible as context but does not move an otherwise ready exercise into
the recovering group.
- Verify a user can still save a draft containing recovering exercises and that the normal planned-workout outcome is
unchanged.

## Testing Strategy

### Unit Tests:

- Pure recovery projection: primary deadline calculation, 48/72-hour boundaries, multiple completed workouts,
  primary-versus-secondary role treatment, fractional secondary set totals, and no-history output.
- Catalogue behavior: recovery ordering occurs after search/muscle/equipment filtering; not-sorted, ready-first, and
  recovering-first states preserve every matching result; a recovering card remains eligible for Add/Replace.
- Service composition: completed history is user-scoped, excludes planned rows, and limits its lookback to the
  policy-relevant interval.

### Integration Tests:

- Retain the existing database suite as the executable guarantee for catalogue policy data, RLS, immutable completed
  history, and server-owned completion timestamps.
- Do not add a schema-specific test or migration: recovery state is a read-time projection over existing contracts.

### Manual Testing Steps:

1. Complete a workout containing primary chest work, open the new manual builder, and confirm chest-primary exercise
   cards appear in **Muscles need recovery** with a remaining-time explanation.
2. Search and filter for chest/equipment; click through Not sorted, Ready to go first, and Muscles need recovery
   first. Confirm every matching result remains visible, grouped only in the two recovery-order states, and that a
   recovering-only match is still rendered.
3. Add or replace with a recovering exercise, set prescriptions, and save; confirm the existing success/replacement
   behavior is unchanged.
4. Test at 360px and with keyboard navigation, including opening/closing the filter drawer and cycling the three
   recovery-order states.
5. Repeat after the recovery deadline to confirm the same primary-muscle cards move to **Ready to go**.

## Performance Considerations

The recovery query must be bounded to completed workouts that could still affect the longest configured window, rather
than scanning all owned history. The catalogue is capped at 200 items and the seeded catalogue currently contains 58,
so a server-side projection and client grouping are comfortably within MVP scale. Do not cache or persist recovery
state; elapsed time must naturally change its result on the next page load.

## Migration Notes

No migration, type regeneration, backfill, or rollout data task is required. `recovery_hours`, exercise muscle roles,
and immutable completed history are already live contracts. If the recovery policy changes later, modify it through a
forward migration and re-evaluate the bounded lookback logic; never overwrite completed history or persist derived
state.

## References

- Research: `context/changes/recovery-aware-manual-builder/research.md`
- Roadmap slice: `context/foundation/roadmap.md` — S-06
- Product requirement: `context/foundation/prd.md` — US-03 and FR-007
- Builder composition: `src/lib/manual-workouts.ts:25-38`
- Existing catalogue filters: `src/lib/manual-workout-builder.ts:72-87`
- Catalogue recovery policy: `supabase/migrations/20260820090000_create_exercise_catalogue.sql:15-69`
- Completion timestamp contract: `supabase/migrations/20260902130000_complete_planned_workout.sql:40-42`
- Fractional set evidence: [Pelland et al.](https://doi.org/10.1007/s40279-025-02344-w)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Derive Recovery-aware Catalogue Data

#### Automated

- [x] 1.1 Implement and test the pure recovery-aware catalogue projection
- [x] 1.2 Extend the catalogue and manual-builder service with owner-scoped completed-history recovery data
- [x] 1.3 Add the focused recovery/manual Node test command
- [x] 1.4 Pass the manual-workout Node test command
- [x] 1.5 Pass lint

#### Manual

- [x] 1.6 Confirm completion-time recovery derivation and unchanged save/replacement behavior
- [x] 1.7 Confirm recovery changes only at the configured expiry boundary

### Phase 2: Present Recovery-aware Catalogue Guidance

#### Automated

- [ ] 2.1 Implement three-state recovery ordering, explanations, and filter preservation in the workout draft editor
- [ ] 2.2 Add UI-facing ordering and filter-combination unit coverage
- [ ] 2.3 Pass recovery ordering and filter-combination tests through the manual-workout test command
- [ ] 2.4 Pass lint
- [ ] 2.5 Pass the production build

#### Manual

- [ ] 2.6 Verify every recovery-order state and adding from either recovery group on mobile
- [ ] 2.7 Verify a recovering-only filter still displays recovery explanations
- [ ] 2.8 Verify keyboard operation, including the recovery-order button and filter drawer focus restoration

### Phase 3: Record the Contract and Run Regression Gates

#### Automated

- [ ] 3.1 Document the recovery-aware catalogue contract
- [ ] 3.2 Pass the focused recovery/manual Node test command
- [ ] 3.3 Pass the full local database suite
- [ ] 3.4 Pass lint
- [ ] 3.5 Pass the production build

#### Manual

- [ ] 3.6 Verify expiry transitions for a completed primary-muscle workout
- [ ] 3.7 Verify visible secondary-only context does not move an exercise into the recovering group
- [ ] 3.8 Verify saving a draft containing a recovering exercise preserves the normal planned-workout outcome
