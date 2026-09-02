# Planned Workout Editing Implementation Plan

## Overview

Deliver S-03 as an origin-neutral planned-workout lifecycle slice. A signed-in user can open their current planned
workout, replace, add, remove, and reorder exercises, change sets and reps, save the complete edit atomically, resolve
a concurrent-edit conflict without silent data loss, or hard-delete the plan after confirmation.

## Current State Analysis

S-02 provides a protected manual builder, a server-rendered current-plan summary, strict same-origin JSON handling,
and an atomic create-or-replace RPC. Its reusable draft logic already covers catalogue filtering, unique selection,
removal, ordering, and prescription validation. The current React builder intentionally starts with an empty draft,
however, and its submission controller is coupled to creating a manual-origin workout.

The existing replacement RPC cannot represent editing. A confirmed replacement deletes the current parent and
creates a new manual-origin parent, changing the workout ID and creation time and discarding AI provenance. Direct
child requests also cannot represent one safe edit because they span transactions, can leave a partial prescription,
and have no stale-edit token.

The database already supplies the ownership and serialization foundation: one planned workout per user, immutable
completed history, owner RLS, ordered unique exercises, parent locking for child mutations, and a documented
per-user advisory-lock namespace. It does not yet have a workout revision, an in-place edit RPC, or a stale-safe
delete RPC.

## Desired End State

After this plan is complete:

- The dashboard exposes Edit and Delete actions for the current planned workout regardless of `manual` or `ai`
  origin.
- `/workouts/edit` loads the complete current prescription into a responsive editor while preserving the workout
  parent ID, owner, origin, and creation time.
- Users can replace an exercise in place while retaining its position, sets, and reps; add, remove, and reorder
  exercises; and change sets/reps within the existing limits.
- Edits remain in memory until `Save changes` atomically replaces the complete ordered prescription.
- Cancel and navigation protect a dirty draft with discard confirmation; no persistent draft or autosave is added.
- Every current-plan representation carries an opaque integer revision. Edit, delete, manual replacement, and later
  completion compare the displayed ID and revision under the shared lock order.
- A stale save preserves the local draft, loads the latest durable plan, and lets the user load that plan or
  explicitly overwrite only the reviewed revision. Another intervening mutation produces another conflict.
- Confirmed deletion hard-deletes only the matching owned planned workout and cascades its exercise rows. A stale
  deletion changes nothing and reloads the latest dashboard state.
- Database, concurrency, pure TypeScript, Astro sync, lint, and Cloudflare Worker build gates pass. Manual checks
  cover responsive, keyboard, conflict, dirty-exit, failure-preservation, and deletion behavior.

### Key Discoveries:

- FR-009 requires swap/add/remove and sets/reps editing while catalogue muscle tags remain immutable
  (`context/foundation/prd.md:124`).
- FR-011 deliberately requires hard deletion; soft delete is not an MVP capability (`context/foundation/prd.md:131`).
- S-03 must work independently of how the planned workout was created (`context/foundation/roadmap.md:113`).
- The existing builder initializes an empty draft even when a current plan is loaded
  (`src/components/workouts/ManualWorkoutBuilder.tsx:131`).
- The existing pure module already owns filtering, add/remove, stable reorder, and prescription validation
  (`src/lib/manual-workout-builder.ts:63`).
- Manual replacement deletes and recreates the parent as `origin = 'manual'`, so it cannot preserve edit identity
  (`supabase/migrations/20260901120000_create_manual_workout_mutation.sql:89`).
- Future edit and completion RPCs must reuse the existing advisory-lock namespace before parent `FOR UPDATE`
  (`docs/reference/contract-surfaces.md:73`).
- Current plans have no revision or update token (`src/types/database.types.ts:156`).
- The repository has pgTAP, two-session shell concurrency tests, and Node's built-in TypeScript test runner, but no
  browser automation framework (`package.json:15`, `.github/workflows/ci.yml:29`).

## What We're NOT Doing

- Marking a workout done, setting `completed_at`, or building completed-history behavior; those remain S-04.
- AI generation, re-rolls, provider calls, AI proposal validation, or AI save behavior; those remain S-07.
- Editing or deleting completed workouts, history deletion, history filters, or `do again`.
- Editing canonical exercise names, equipment, muscle-group tags, or catalogue records.
- Persistent drafts, autosave, local/session storage recovery, or server-side draft rows.
- Workout titles, dates, notes, weights, rep ranges, set-by-set logging, templates, or multiple planned workouts.
- Soft delete, undo deletion, trash retention, or audit-history UI.
- Adding Playwright, Cypress, Vitest, or another test framework.
- Applying hosted migrations, deploying the Worker, or changing production secrets.

## Implementation Approach

Use the repository's database -> service/endpoint -> UI sequence across three phases.

First, add an opaque workout revision and origin-neutral edit/delete RPCs. Every supported current-plan mutation uses
the established per-user advisory lock followed by a parent row lock, compares both expected ID and revision, and
either commits the complete operation or changes nothing. Extend S-02 replacement to include expected revision so a
stale replacement cannot delete an in-place edit with the same workout ID.

Second, separate reusable ordered-draft presentation from mutation orchestration. Creation keeps its existing manual
controller, while editing gets exact request contracts, origin-neutral service methods, and a dedicated planned-
workout endpoint. Shared endpoint helpers retain S-02's body, Origin, request-ID, logging, and error-envelope rules.

Third, add the edit route, edit controller, reviewed conflict flow, dirty-exit protection, and dashboard deletion
island. Both creation and editing render the same controlled draft editor, but they do not share submission or
conflict state machines.

## Critical Implementation Details

### Timing & lifecycle

Revision is an opaque compare-and-swap token, not a user-visible edit count. Edit, delete, and revised manual
replacement must acquire `hashtextextended('perfect-training-planner:planned-workout:' || auth.uid()::text, 0)`, lock
the caller's current planned parent, then compare ID and revision before mutation; future completion inherits the
same order.

### State sequencing

An explicit overwrite never bypasses conflict detection. After HTTP 409, the browser loads and displays the latest
plan, retains the local draft separately, and retries against the latest reviewed revision only when the user
chooses overwrite; another race returns 409 again.

### User experience spec

Replacing an exercise preserves its array position and sets/reps, while duplicate selection remains invalid. A dirty
Cancel uses an accessible confirmation and dirty browser navigation uses `beforeunload`; clean exits require no
prompt, and no draft is persisted.

## Phase 1: Revisioned Planned-Workout Persistence

### Overview

Add the revision-aware database contract, atomically cut every live S-02 caller over to it, provide in-place edit
and hard-delete operations, and prove ownership, rollback, provenance preservation, and concurrency behavior.

### Changes Required:

#### 1. Revision and origin-neutral planned-workout mutations

**File**: `supabase/migrations/20260902120000_create_planned_workout_mutations.sql`

**Intent**: Give all supported planned-workout mutations a shared stale-state token and provide atomic edit/delete
operations without recreating the workout parent.

**Contract**: Add `workouts.revision` as a positive, non-null integer with existing and new rows initialized to `1`.
The revision is owner-readable and advances once for each successful supported in-place parent mutation; clients
cannot choose an arbitrary resulting revision. Grant authenticated users only column-scoped `UPDATE(revision)` under
the existing owner/planned-row RLS policy, and add a `BEFORE UPDATE OF revision` trigger that always derives
`NEW.revision = OLD.revision + 1` regardless of the submitted value. The edit RPC requests a revision update after
the complete child replacement; the trigger owns the resulting token. Direct callers may advance their own planned
workout token but cannot select its value, update a completed workout, or affect another user's row.

Add authenticated `SECURITY INVOKER`, empty-`search_path` functions
`update_planned_workout(p_expected_workout_id uuid, p_expected_revision integer, p_exercises jsonb)` and
`delete_planned_workout(p_expected_workout_id uuid, p_expected_revision integer)`. Both derive ownership from
`auth.uid()`, acquire the documented user advisory lock, lock the caller's current planned parent, and require exact
ID/revision match. Missing, replaced, completed, cross-user, and revision-mismatched targets collapse to one
`PW001` stale outcome; malformed input uses `PW002`; missing authentication uses `PW003`.

Update replaces the complete ordered child collection in one transaction, derives contiguous positions, increments
revision once, returns the new revision, and preserves parent ID, user, origin, `created_at`, status, and
`completed_at`. Delete removes only the exact matched planned parent, relies on the existing child cascade, and
returns the deleted UUID. Any exception rolls back every parent, revision, and child change.

#### 2. Revision-aware manual replacement

**File**: `supabase/migrations/20260902120000_create_planned_workout_mutations.sql`

**Intent**: Prevent an S-02 replacement confirmation opened before an in-place edit from deleting that newer edit.

**Contract**: Replace the three-argument `save_manual_planned_workout` signature with
`save_manual_planned_workout(p_exercises jsonb, p_replace_existing boolean, p_expected_workout_id uuid,
p_expected_revision integer)`. First creation requires both expected values null; confirmed replacement requires
both to match the locked current plan. Preserve existing `MW001`-`MW004` meanings, treating revision mismatch as
`MW002` stale state. Successful replacement still creates a new manual-origin parent at revision `1`; there is no
callable legacy signature that can bypass revision comparison.

#### 3. Coordinated S-02 caller cutover

**Files**: `src/lib/manual-workout-builder.ts`, `src/lib/manual-workout-builder.test.ts`,
`src/lib/manual-workouts.ts`, `src/components/workouts/ManualWorkoutBuilder.tsx`,
`src/pages/api/workouts/manual.ts`, `supabase/tests/database/manual_workout_mutation_concurrency.test.sh`

**Intent**: Keep the existing manual creation/replacement workflow deployable when the old three-argument RPC
signature is removed.

**Contract**: In this phase, before removing the legacy callable signature, extend the exact manual request parser
with `expectedRevision` and require expected ID/revision to be both null for first creation or both positive and
present for replacement. Pass the displayed current-plan revision from `ManualWorkoutBuilder` through the manual
endpoint and service to the generated four-argument RPC without unsafe signature casts. Update parser tests and the
credential-free manual replacement concurrency helper/calls in the same cutover. Preserve the existing replacement
dialog, endpoint security/error envelope, and `MW001`-`MW004` behavior. The old signature may be dropped only after
all repository callers and test helpers target the new contract.

#### 4. Database contracts and rollback tests

**Files**: `supabase/tests/database/workout_lifecycle.test.sql`,
`supabase/tests/database/manual_workout_mutation.test.sql`,
`supabase/tests/database/planned_workout_mutation.test.sql`

**Intent**: Make revision, edit, delete, stale-state, and rollback semantics executable under the existing RLS and
privilege model.

**Contract**: Cover revision shape/default/bounds and write protection; function signatures, invoker mode, empty
search paths, and authenticated-only execution; exact payload validation; manual and AI-origin edits; parent identity
and metadata preservation; ordered replace/add/remove/reorder prescriptions; revision advancement; stale ID/revision;
other-user non-disclosure; completed-history immutability; hard-delete cascade; and no-op stale delete. Force a child
insert failure after old children are removed and prove the original parent, revision, and children are restored.
Prove direct revision assignments become exactly `OLD.revision + 1`, while completed and cross-user revision updates
change no row. Update manual replacement tests for the fourth argument and prove a stale pre-edit revision cannot
replace the plan.

#### 5. Planned-workout concurrency regression

**File**: `supabase/tests/database/planned_workout_mutation_concurrency.test.sh`

**Intent**: Prove that simultaneous lifecycle operations produce one complete winner and explicit stale losers.

**Contract**: Reuse the credential-free two-session `psql` pattern for edit/edit, edit/delete, delete/delete, edit
versus manual replacement, child mutation overlap, edit versus completion, and delete versus completion. Exercise
completion through the existing lifecycle transition, using the documented advisory-lock then parent-lock order.
Require one valid terminal outcome, an explicit stale loser, no mixed prescription or orphan rows, contiguous
positions, exact winner revision, preserved AI origin/history/other-user rows, and cleanup on every exit path. S-04
replaces the competing completion actor with its completion RPC while preserving these race assertions and lock order.

#### 6. Generated and documented contract surfaces

**Files**: `src/types/database.types.ts`, `docs/reference/contract-surfaces.md`

**Intent**: Expose the generated revision/RPC signatures and make their names, outcomes, and lock order stable for
application code and later lifecycle slices.

**Contract**: Regenerate and Prettier-normalize public-schema types after a clean local reset. Record the migration,
revision semantics, exact edit/delete/save signatures, SQLSTATE mappings, immutable metadata, complete-prescription
atomicity, expected ID/revision comparison, advisory-lock namespace, and S-04 completion requirement. Do not
hand-edit generated types or alter already-applied migrations.

### Success Criteria:

#### Automated Verification:

- Clean local reset applies the revision and planned-workout mutation migration.
- Public schema database lint passes with no errors.
- Planned-workout and revised manual-mutation pgTAP contracts pass.
- The complete database suite remains green.
- Manual and planned-workout concurrency regressions pass without partial state.
- Regenerated and Prettier-normalized public database types have no drift.
- Manual request parsing and replacement regression tests pass against the revision-aware contract.
- Astro types synchronize, repository lint passes, and the production SSR build succeeds after the RPC cutover.
- Edit/completion and delete/completion races produce one valid winner and an explicit stale loser.

#### Manual Verification:

- Forced edit failure and stale replacement preserve the original/newer workout, revision, origin, and prescriptions.
- Two disposable users cannot observe, edit, or delete each other's planned workouts through supplied identifiers.
- The existing S-02 create and confirmed-replacement flow succeeds through the revised endpoint and RPC contract.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of revision, rollback, provenance, and ownership behavior before proceeding to Phase 2.

---

## Phase 2: Shared Editor and Application Boundary

### Overview

Create origin-neutral draft and mutation contracts, extract the controlled editor surface, and expose current-plan
GET/PUT/DELETE operations without changing the dashboard workflow yet.

### Changes Required:

#### 1. Origin-neutral draft operations and request contracts

**Files**: `src/lib/manual-workout-builder.ts`, `src/lib/manual-workout-builder.test.ts`,
`src/lib/planned-workout-mutation.ts`, `src/lib/planned-workout-mutation.test.ts`

**Intent**: Reuse one implementation of ordered exercise editing while keeping create/replace and edit/delete wire
formats exact and independent.

**Contract**: Add pure operations that create a draft from an ordered current plan, replace one exercise ID at the
same index while preserving sets/reps, reject replacement with an already-selected exercise, and compare drafts for
dirty state. Preserve the existing 1-20 unique exercises, canonical UUID, sets 1-99, reps 1-999, and array-order
contracts.

Define version-1 edit input with exactly `version`, `expectedWorkoutId`, `expectedRevision`, and `exercises`; define
version-1 delete input with exactly `version`, `expectedWorkoutId`, and `expectedRevision`. Revisions are positive
safe integers. Keep the already revision-aware manual create/replace parsing separate. Use Node's built-in runner
for replacement position/prescription preservation, duplicate rejection, dirty equality, exact keys, numeric
boundaries, stale tokens, and create/edit/delete schema separation.

#### 2. Controlled reusable draft editor

**Files**: `src/components/workouts/WorkoutDraftEditor.tsx`,
`src/components/workouts/ManualWorkoutBuilder.tsx`

**Intent**: Let creation and editing share catalogue and ordered-draft controls without sharing their mutation state
machines.

**Contract**: Extract the catalogue filters, Add/Replace selection mode, draft prescriptions, removal, labelled Move
up/down controls, validation feedback, result counts, empty states, and responsive layout into a controlled component.
It receives draft/pending/error state, action labels, and callbacks; it performs no fetch, redirect, replacement
confirmation, conflict resolution, or deletion. `ManualWorkoutBuilder` retains its current empty-draft,
create/replace, cancel, and replacement-dialog behavior through the revision-aware contract established in Phase 1.

#### 3. Origin-neutral planned-workout service

**Files**: `src/lib/planned-workouts.ts`, `src/lib/manual-workouts.ts`

**Intent**: Keep current-plan loading and edit/delete RPC translation independent of manual workout creation.

**Contract**: Move or centralize `CurrentPlannedWorkout` and current-plan loading in the origin-neutral module, adding
`revision` to every serialized plan. Add update and delete service methods that verify the request-local user, verify
catalogue IDs for edits, invoke only the generated RPC signatures, and map `PW001`-`PW003` to safe stale,
validation, and unauthenticated outcomes. Unknown database failures collapse to `persistence_failed`; internal
metadata contains only sanitized layer/technical codes. Manual builder loading reuses these types without changing
ownership/origin semantics; its revision-aware save path remains behaviorally unchanged from the Phase 1 cutover.

#### 4. Shared workout API boundary

**Files**: `src/lib/workout-api.ts`, `src/pages/api/workouts/manual.ts`,
`src/pages/api/workouts/planned.ts`

**Intent**: Reuse S-02's security and diagnostic boundary while keeping operation-specific request contracts clear.

**Contract**: Extract request ID generation, exact same-origin validation, JSON media/body limits, authenticated
locals checks, safe error envelopes, and sanitized structured logging from the manual endpoint. Keep manual POST as
the create/replace operation. Add planned-workout GET for `{ currentPlan }`, PUT for complete ordered edits, and
DELETE for hard deletion. Migrate `ManualWorkoutBuilder.refreshCurrentPlan()` to planned GET and validate the
revision-aware response before changing local replacement state; only then remove GET handling from the manual
endpoint so current-plan reads have one owner. PUT success returns the preserved workout ID and new revision; DELETE
success returns 204.
Failures contain exactly safe code/request ID plus `X-Request-ID`; stale is HTTP 409, validation 400,
unauthenticated 401, Origin rejection 403, and unknown persistence failure 500. No endpoint logs payloads,
identifiers, raw errors, SQL details, cookies, or user data.

#### 5. Focused test and CI gates

**Files**: `package.json`, `.github/workflows/ci.yml`

**Intent**: Make the new pure request/draft contracts and database concurrency script part of the normal verification
path without adding a framework.

**Contract**: Add `pnpm test:planned-workout` using Node 22's built-in TypeScript-stripping runner. Add distinct CI
steps for that command and `planned_workout_mutation_concurrency.test.sh`, preserving clean reset, database lint/full
suite, existing concurrency, generated-type drift, crypto/manual tests, Astro sync, lint, build, and cleanup.

### Success Criteria:

#### Automated Verification:

- Manual and planned-workout pure TypeScript tests pass.
- Astro types synchronize successfully.
- Repository lint passes.
- Production SSR build passes under the Cloudflare adapter.
- Database, generated-type, and both workout concurrency regression gates remain green.
- Manual-builder refresh tests use planned GET, validate revision, and prove manual GET is no longer supported.

#### Manual Verification:

- Planned GET/PUT/DELETE enforce Origin, media type, body, schema, authentication, revision, and ownership bounds.
- Known and unknown failures expose only safe code/request-ID responses and sanitized logs while durable state remains unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of endpoint security, response contracts, and the unchanged S-02 creation flow before Phase 3.

---

## Phase 3: Editing, Conflict, and Deletion UX

### Overview

Deliver the responsive edit route, explicit dirty/conflict behavior, dashboard actions, and confirmed hard deletion
on top of the verified mutation boundary.

### Changes Required:

#### 1. Planned-workout edit route

**File**: `src/pages/workouts/edit.astro`

**Intent**: Provide a protected, origin-neutral page that loads the catalogue and current planned workout for
editing.

**Contract**: Render inside `AuthenticatedLayout`, require verified request locals, and load serializable catalogue
and current-plan data through the shared services. Mount the editor only when a plan exists. If no plan exists,
redirect to `/dashboard`; on a bounded load failure, show retry/dashboard actions without mounting an empty draft or
performing a mutation during render.

#### 2. Planned-workout edit controller

**File**: `src/components/workouts/PlannedWorkoutEditor.tsx`

**Intent**: Orchestrate explicit save, dirty exit, reviewed conflicts, and durable success around the controlled
draft editor.

**Contract**: Initialize the draft and baseline from the ordered current plan. `Save changes` is enabled only for a
valid dirty draft and submits PUT with the displayed ID/revision; success navigates to
`/dashboard?status=workout-updated`. Cancel returns immediately when clean and otherwise opens an accessible discard
dialog. Register `beforeunload` only while dirty and remove it after save, reload-latest, or unmount.

On stale response, preserve the local draft, GET the latest plan, and display local versus durable summaries with
`Load latest` and `Overwrite with my changes`. Loading latest replaces both draft and baseline. Overwrite submits
against the newly displayed ID/revision and never bypasses compare-and-swap. If no current plan remains because it
was deleted or completed, disable overwrite and route the user back to the dashboard without fabricating a new plan.
Pending controls prevent duplicate requests; failures retain the draft, show safe request IDs, and restore useful
focus.

#### 3. In-place exercise replacement experience

**File**: `src/components/workouts/WorkoutDraftEditor.tsx`

**Intent**: Make FR-009's swap operation direct while retaining the approved prescription and ordering behavior.

**Contract**: Each draft row exposes Replace, Move up, Move down, and Remove controls. Replace enters a clearly
labelled catalogue-selection mode; choosing an unselected exercise changes only that row's exercise ID and keeps its
position, sets, and reps. Cancel replacement changes nothing. Duplicate targets remain unavailable, long names wrap,
and catalogue search/filter semantics remain unchanged.

#### 4. Dashboard edit and delete actions

**Files**: `src/components/workouts/PlannedWorkoutSummary.astro`,
`src/components/workouts/PlannedWorkoutActions.tsx`, `src/pages/dashboard.astro`

**Intent**: Make editing and confirmed hard deletion discoverable from the current plan's stable home.

**Contract**: Replace the sole replacement CTA with Edit, Build replacement, and Delete actions. Edit targets
`/workouts/edit`; replacement retains `/workouts/new`. The React actions island receives only ID, revision, origin
label, and exercise count. Delete opens an accessible modal summarizing the plan and count, then submits the exact
DELETE contract once. Success navigates to `/dashboard?status=workout-deleted`; show that status only when no current
plan exists. A stale delete changes nothing and reloads the latest dashboard with a clear changed-plan status.
Update edit success status only when a current plan exists; query parameters never substitute for durable state.

#### 5. Workout navigation state

**File**: `src/layouts/AuthenticatedLayout.astro`

**Intent**: Keep the private navigation coherent across manual creation and current-plan editing.

**Contract**: Treat `/workouts/new` and `/workouts/edit` as one workout navigation family while preserving current
Dashboard/Account links, active-state accessibility, responsive wrapping, and sign-out semantics.

### Success Criteria:

#### Automated Verification:

- Final database, concurrency, and generated-type gates pass.
- Manual and planned-workout pure TypeScript tests pass.
- Existing cryptography tests pass.
- Astro types synchronize successfully.
- Repository lint passes.
- Production Cloudflare Worker build passes.

#### Manual Verification:

- Manual- and AI-origin plans open with exact ordered prescriptions and preserve parent identity/provenance after save.
- Replace preserves position and sets/reps; add/remove/reorder and numeric validation work by keyboard and touch.
- Clean Cancel exits immediately, while dirty Cancel/navigation protects the draft and confirmed discard restores no draft.
- Concurrent edits preserve the local draft and support load-latest or reviewed overwrite without silent loss.
- A plan deleted, replaced, or completed during editing cannot be silently recreated or overwritten.
- Confirmed dashboard deletion removes only the matching plan; cancellation and stale deletion change nothing.
- Editing, conflict, and deletion remain usable at 360px and desktop widths with correct focus, labels, live status, and wrapping.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of responsive editing, conflict handling, dirty exits, and deletion before closing the change.

---

## Testing Strategy

### Database Tests:

- Use transactional pgTAP for revision shape, function privileges, validation, owner isolation, origin/identity
  preservation, complete child replacement, revision advancement, stale outcomes, rollback, cascade deletion, and
  completed-history immutability.
- Keep direct lifecycle/RLS tests as lower-level contracts while treating RPCs as the supported application mutation
  boundary.
- Use two-session shell tests for edit/edit, edit/delete, delete/delete, edit/replacement, child-mutation,
  edit/completion, and delete/completion races. Require one valid terminal winner, stale losers, and no mixed or
  orphaned rows.

### Unit Tests:

- Extend the built-in Node suite for plan-to-draft conversion, replace-in-place, duplicate prevention, dirty equality,
  and unchanged add/remove/reorder/validation behavior.
- Test exact manual/edit/delete request keys, ID/revision coupling, positive safe-integer revisions, exercise and body
  limits, and rejected unknown fields.
- Keep React, Astro server environment, and Supabase clients out of these pure modules.

### Integration Tests:

- Treat clean reset -> pgTAP -> concurrency -> generated types as the database/RPC integration gate.
- Compile the shared editor, both controllers, service modules, endpoints, and generated RPC signatures through Astro
  sync, type-aware lint, and the Cloudflare Worker production build.
- Manually exercise authenticated endpoint-to-RPC behavior with two users because browser automation remains out of
  scope.

### Manual Testing Steps:

1. Create a manual planned workout, open Edit from the dashboard, and verify exact initial order and prescriptions.
2. Replace an exercise, confirm sets/reps and position stay fixed, then add/remove/reorder and save.
3. Refresh and verify workout ID, origin, creation time, revision progression, order, and prescriptions.
4. Exercise clean and dirty Cancel, browser navigation, reload prompts, discard cancellation, and confirmed discard.
5. Edit the same plan in two sessions; verify the loser retains its draft and can load latest or review and overwrite.
6. Replace, delete, or later complete the plan in another session; verify stale edit/delete never changes that state.
7. Cancel deletion, confirm deletion, and force stale/network/database failures; verify correct durable state and safe
   request-ID feedback.
8. Repeat with an AI-origin fixture and a second user to verify provenance preservation and owner isolation.
9. Repeat at 360px and desktop widths with keyboard-only interaction, checking focus, labels, live regions, touch
   targets, modal behavior, long names, and non-overlap.

## Performance Considerations

The catalogue remains 58 rows and a workout is capped at 20 exercises. Continue one bounded server load plus
in-memory filtering; pagination, virtualization, caching, and per-filter requests are unnecessary. Edit and delete
are single RPC transactions with no application retry loop; a reviewed overwrite is a new explicit request.

## Migration Notes

- Use one forward migration; do not edit the applied lifecycle or S-02 mutation migrations.
- The non-null revision column backfills existing workouts to revision `1`; no workout or exercise row is otherwise
  rewritten.
- Drop the old manual-save RPC signature only after creating the revision-aware replacement in the same migration.
- Regenerate types from a clean local reset with the pinned Supabase CLI and Prettier normalization.
- Do not use `supabase db reset --linked`, push to a hosted project, deploy the Worker, or change secrets during this
  implementation. Worker rollback cannot undo a hosted schema/function migration.

## References

- Change identity: `context/changes/planned-workout-editing/change.md`
- Roadmap slice: `context/foundation/roadmap.md:113`
- Edit and delete requirements: `context/foundation/prd.md:124`, `context/foundation/prd.md:131`
- Existing current-plan service: `src/lib/manual-workouts.ts:73`
- Existing draft contracts: `src/lib/manual-workout-builder.ts:30`
- Existing builder controller: `src/components/workouts/ManualWorkoutBuilder.tsx:131`
- Dashboard plan summary: `src/components/workouts/PlannedWorkoutSummary.astro:28`
- Existing same-origin endpoint: `src/pages/api/workouts/manual.ts:97`
- Workout lifecycle/RLS: `supabase/migrations/20260820090200_create_workout_lifecycle.sql:5`
- Parent child-mutation lock: `supabase/migrations/20260827120000_serialize_workout_exercise_mutations.sql:5`
- Existing replacement RPC: `supabase/migrations/20260901120000_create_manual_workout_mutation.sql:1`
- Stable mutation contracts: `docs/reference/contract-surfaces.md:55`
- Supabase function/RLS guidance: `https://supabase.com/docs/guides/database/functions`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Revisioned Planned-Workout Persistence

#### Automated

- [x] 1.1 Clean local reset applies the revision and planned-workout mutation migration
- [x] 1.2 Public schema database lint passes with no errors
- [x] 1.3 Planned-workout and revised manual-mutation pgTAP contracts pass
- [x] 1.4 The complete database suite remains green
- [x] 1.5 Manual and planned-workout concurrency regressions pass without partial state
- [x] 1.6 Regenerated and Prettier-normalized public database types have no drift
- [x] 1.9 Manual request parsing and replacement regression tests pass against the revision-aware contract
- [x] 1.10 Astro types synchronize, repository lint passes, and the production SSR build succeeds after the RPC cutover
- [x] 1.12 Edit/completion and delete/completion races produce one valid winner and an explicit stale loser

#### Manual

- [x] 1.7 Forced edit failure and stale replacement preserve the original/newer workout, revision, origin, and prescriptions
- [x] 1.8 Two disposable users cannot observe, edit, or delete each other's planned workouts through supplied identifiers
- [x] 1.11 The existing S-02 create and confirmed-replacement flow succeeds through the revised endpoint and RPC contract

### Phase 2: Shared Editor and Application Boundary

#### Automated

- [ ] 2.1 Manual and planned-workout pure TypeScript tests pass
- [ ] 2.2 Astro types synchronize successfully
- [ ] 2.3 Repository lint passes
- [ ] 2.4 Production SSR build passes under the Cloudflare adapter
- [ ] 2.5 Database, generated-type, and both workout concurrency regression gates remain green
- [ ] 2.8 Manual-builder refresh tests use planned GET, validate revision, and prove manual GET is no longer supported

#### Manual

- [ ] 2.6 Planned GET/PUT/DELETE enforce Origin, media type, body, schema, authentication, revision, and ownership bounds
- [ ] 2.7 Known and unknown failures expose only safe code/request-ID responses and sanitized logs while durable state remains unchanged

### Phase 3: Editing, Conflict, and Deletion UX

#### Automated

- [ ] 3.1 Final database, concurrency, and generated-type gates pass
- [ ] 3.2 Manual and planned-workout pure TypeScript tests pass
- [ ] 3.3 Existing cryptography tests pass
- [ ] 3.4 Astro types synchronize successfully
- [ ] 3.5 Repository lint passes
- [ ] 3.6 Production Cloudflare Worker build passes

#### Manual

- [ ] 3.7 Manual- and AI-origin plans open with exact ordered prescriptions and preserve parent identity/provenance after save
- [ ] 3.8 Replace preserves position and sets/reps; add/remove/reorder and numeric validation work by keyboard and touch
- [ ] 3.9 Clean Cancel exits immediately, while dirty Cancel/navigation protects the draft and confirmed discard restores no draft
- [ ] 3.10 Concurrent edits preserve the local draft and support load-latest or reviewed overwrite without silent loss
- [ ] 3.11 A plan deleted, replaced, or completed during editing cannot be silently recreated or overwritten
- [ ] 3.12 Confirmed dashboard deletion removes only the matching plan; cancellation and stale deletion change nothing
- [ ] 3.13 Editing, conflict, and deletion remain usable at 360px and desktop widths with correct focus, labels, live status, and wrapping
