# Mark Planned Workout Done Implementation Plan

## Overview

Deliver S-04 as the durable transition from the current planned workout into immutable completed history. The
dashboard will make completion the primary action, give the user a non-modal five-second grace period to undo the
intent, then atomically complete the exact reviewed workout through the established revision-aware database boundary.

## Current State Analysis

The database already models `planned` and `completed` workouts, requires a completion timestamp for completed rows,
keeps completed parents and prescriptions immutable, and frees the one-planned-workout slot after completion. S-03
added an opaque revision token and serialized edit, delete, and replacement operations through a shared per-user
advisory lock followed by a parent row lock. Its concurrency suite still uses a direct table update as the temporary
completion actor; S-04 must replace that actor with the supported completion RPC.

The application already loads the current origin-neutral plan on the dashboard and passes its ID and revision into a
React action island. The planned-workout endpoint provides GET, PUT, and DELETE with strict same-origin JSON handling,
bounded bodies, safe error envelopes, request IDs, and sanitized logging. There is no toast system, undo mechanism,
or reduced-motion rule. The current Astro summary owns the card markup while the nested React island owns only
actions, which is too narrow for an interaction that must animate and restore the entire card.

## Desired End State

After this plan is complete:

- A signed-in user can select a visually primary `Mark done` action for either a manual- or AI-origin planned workout.
- The workout card gracefully collapses/fades over approximately one second while a non-modal toast offers Undo for
  five seconds without blocking dashboard navigation or unrelated application controls.
- Undo before the deadline cancels the local intent, sends no mutation request, and restores the exact workout card.
- When the grace period expires, Undo becomes unavailable and one completion request is sent for the displayed
  workout ID and revision.
- The database authenticates the caller, serializes against edit/delete/replacement/other completion operations,
  compares the expected token, and atomically sets `status = 'completed'` plus a server-generated `completed_at`.
- Completion preserves workout ID, owner, origin, creation time, revision, exercise rows, positions, sets, and reps.
- Successful completion returns to `/dashboard?status=workout-completed`; the SSR page shows success only when durable
  state confirms that no current planned workout remains, then exposes the existing empty-plan action.
- Stale completion reloads the latest dashboard state. Ambiguous transport failures reconcile the expected owned
  workout's lifecycle state as well as the current planned slot; only the expected row being completed proves success.
- Database, concurrency, pure TypeScript, Astro sync, lint, and Cloudflare Worker build gates pass. Manual checks cover
  Undo timing, animation, responsive layout, keyboard use, reduced motion, stale state, and failure reconciliation.

### Key Discoveries:

- S-04 is narrowly responsible for moving a plan into completed history; history presentation remains S-05
  (`context/foundation/roadmap.md:127`).
- The lifecycle constraint already requires planned rows to have no completion timestamp and completed rows to have a
  timestamp no earlier than creation (`supabase/migrations/20260820090200_create_workout_lifecycle.sql:16`).
- Completed workouts and prescriptions cannot return to an editable state (`docs/reference/contract-surfaces.md:55`).
- Completion must reuse the planned-workout advisory-lock namespace and lock order
  (`docs/reference/contract-surfaces.md:89`).
- Edit/delete already establish expected-ID/revision comparison and `PW001`-`PW003` outcomes
  (`supabase/migrations/20260902120000_create_planned_workout_mutations.sql:93`).
- The existing concurrency suite explicitly leaves its temporary direct completion actor for S-04 to replace
  (`supabase/tests/database/planned_workout_mutation_concurrency.test.sh:300`).
- The planned endpoint and helpers already own the required request security and diagnostic envelope
  (`src/pages/api/workouts/planned.ts:28`, `src/lib/workout-api.ts:37`).
- Dashboard status messages are accepted only when consistent with durable current-plan state
  (`src/pages/dashboard.astro:12`).
- There is no reusable toast or Undo component, while the current action island cannot animate its Astro parent
  (`src/components/workouts/PlannedWorkoutSummary.astro:29`,
  `src/components/workouts/PlannedWorkoutActions.tsx:43`).
- Authenticated owners retain direct `UPDATE(status, completed_at)` privileges under RLS, so the new RPC is the
  supported application boundary rather than an exclusive database mutation capability
  (`supabase/migrations/20260820090200_create_workout_lifecycle.sql:163`).

## What We're NOT Doing

- Building a history list, filters, completed-workout detail page, history deletion, or `do again`; those remain S-05
  or later roadmap work.
- Allowing edits during completion or recording actual weights, changed prescriptions, set-by-set performance, notes,
  ratings, duration, or training date backfills.
- Allowing completed workouts to return to planned state. Undo cancels an uncommitted browser intent; it never reverses
  durable history.
- Adding a `completion_pending` database status, durable countdown, background job, cross-navigation Undo, service
  worker, local/session-storage timer, or global notification system.
- Persisting completion when the user navigates, reloads, or closes the dashboard before the five-second deadline;
  unmounting cancels the local intent because no mutation has started.
- Advancing the workout revision during completion; the terminal lifecycle state makes later planned mutations stale.
- Revoking existing direct owner lifecycle-update privileges or replacing the established `SECURITY INVOKER`/RLS
  model with a privileged exclusive mutation boundary.
- Adding Playwright, Cypress, Vitest, or another browser/unit test framework.
- Applying a hosted Supabase migration, deploying the Worker, changing production secrets, or modifying archived
  change artifacts.

## Implementation Approach

Follow the repository's database -> service/endpoint -> UI sequence across three phases.

First, add one forward migration with an authenticated, origin-neutral completion RPC. It reuses the exact advisory
lock and parent-lock ordering established by edit/delete, validates the expected ID/revision after locking, writes the
server completion timestamp atomically, and returns the completed UUID. Extend pgTAP and two-session concurrency
coverage, regenerate database types, and record the stable contract.

Second, extend the exact versioned planned-workout request contracts and existing `/api/workouts/planned` resource
with a PATCH completion operation plus an owner-scoped expected-workout reconciliation read. The service maps the same
stale, validation, authentication, and persistence outcomes already used by edit/delete. The endpoint retains the
existing Origin, JSON, body-size, auth, request-ID, safe-envelope, and sanitized-log boundaries.

Third, replace the split Astro-summary/nested-action-island boundary with a focused React dashboard workout island.
It owns the complete card, primary completion action, local grace-period deadline, animation, toast, Undo, submission,
and reconciliation state while preserving existing edit/replacement/delete behavior. This is local to the dashboard;
no global toast dependency or application-wide state is introduced.

## Critical Implementation Details

### Timing & lifecycle

The five-second window precedes persistence. Store an absolute deadline and schedule against it so background timer
throttling cannot shorten the grace period; when execution resumes after the deadline, start the request immediately.
Clear the timer on Undo and unmount. Once PATCH begins, remove Undo and do not attempt a completed-to-planned reversal.
The RPC generates `completed_at` when the transaction accepts completion, which represents the user's uncancelled
decision rather than the initial click.

### State sequencing

The UI state sequence is `idle -> grace-period -> committing -> success/stale/failed`. Start the roughly one-second
collapse when entering the grace period, but keep the toast outside the animated card. Undo reverses the presentation
and restores actions without a request. While grace or commit is active, disable all workout mutations and guard every
timer/request entry point against duplicates.

After a request starts, a network error is ambiguous because the transaction may have committed without its response
arriving. Reconcile both the expected owned workout ID and current-plan state before messaging the user. Only the
expected row in `completed` state proves success. The same ID/revision still planned means restore with a retryable
failure; a different current token means changed-state handling; an absent expected row or failed lookup is
indeterminate and must say completion could not be confirmed rather than infer success from an empty planned slot.

### User experience spec

Use a fixed, non-modal bottom toast with no backdrop or focus trap. Announce the five-second Undo opportunity once in
one polite, atomic live region; do not announce every elapsed second. A subtle visual progress indicator may show the
remaining grace period. Keep Undo keyboard reachable with a 44px minimum target and visible focus. If collapse removes
the focused Mark done button, move focus to Undo; after Undo or failure, return focus to the restored Mark done action.

Animate opacity and layout height for approximately one second so the card leaves no abrupt gap. Under
`prefers-reduced-motion: reduce`, skip movement and use an immediate or very short opacity change while retaining the
full five-second functional grace period. At 360px the toast must remain within page gutters and allow its text and
Undo action to wrap or stack.

## Phase 1: Atomic Completion Persistence

### Overview

Add the supported planned-to-completed database operation and prove lifecycle, ownership, rollback, timestamp,
immutability, and race behavior before exposing it to the application.

### Changes Required:

#### 1. Completion RPC forward migration

**File**: `supabase/migrations/20260902130000_complete_planned_workout.sql`

**Intent**: Add the stale-safe, serialized operation used by the application for marking a plan done while retaining
the existing lower-level owner/RLS lifecycle capability.

**Contract**: Add
`public.complete_planned_workout(p_expected_workout_id uuid, p_expected_revision integer) returns uuid` as
`SECURITY INVOKER` with an empty `search_path`, executable only by `authenticated`. Derive ownership from `auth.uid()`,
reject missing authentication as `PW003`, and reject null/non-positive inputs as `PW002`. Acquire the established
per-user transaction advisory lock before selecting the caller's current planned parent `FOR UPDATE`. Compare its ID
and revision only after both locks; missing, replaced, edited, deleted, completed, cross-user, and mismatched targets
all raise `PW001` without mutation.

On an exact match, atomically set status to completed and set `completed_at` from the database server's transaction
time, returning the same workout UUID. Preserve revision and every other parent/child value. Do not accept a client
timestamp or add a reverse transition. Reuse `PW001`-`PW003` because completion shares the exact token semantics of
the existing origin-neutral planned mutations.

This RPC is the sole completion path used by repository application code, not an exclusive database capability.
Authenticated owners retain the existing direct lifecycle-column update grant and RLS behavior tested by the
foundation suite. Do not broaden this change into a `SECURITY DEFINER` privilege redesign; document that direct owner
access can bypass the application's revision check and server-selected timestamp for that owner's own data.

#### 2. Completion database contract tests

**File**: `supabase/tests/database/planned_workout_completion.test.sql`

**Intent**: Make the completion function's shape, authorization, durable state, and non-disclosure behavior executable.

**Contract**: Add transactional pgTAP coverage for the exact signature/result, invoker mode, empty search path,
authenticated-only execution, manual- and AI-origin success, server-generated timestamp, and preservation of workout
identity, owner, origin, creation time, revision, ordered exercises, sets, and reps. Verify malformed tokens use
`PW002`; absent/replaced/completed/revision-mismatched/cross-user targets use indistinguishable `PW001`; missing auth
uses `PW003`; repeated completion is stale; completed history remains immutable; and completion frees the unique
planned slot without changing existing history or another user's data.

#### 3. Real completion concurrency coverage

**File**: `supabase/tests/database/planned_workout_mutation_concurrency.test.sh`

**Intent**: Replace the temporary direct completion actor and prove every planned-workout mutation coordinates with
the real RPC.

**Contract**: Add a completion helper using authenticated RPC execution and retain the credential-free two-session
pattern. Cover completion/completion, completion/edit, completion/delete, completion/manual replacement, and
completion/child mutation races. Require one valid winner and the appropriate explicit stale loser (`PW001`, or
`MW002` for replacement), no orphaned/mixed prescriptions, preserved AI/manual provenance and revision, lifecycle-
valid timestamps, immutable winning history, one available planned slot after completion, and unchanged other-user
state. Preserve cleanup on every exit path.

#### 4. Generated and documented completion surface

**Files**: `src/types/database.types.ts`, `docs/reference/contract-surfaces.md`

**Intent**: Expose the generated RPC signature and make its lifecycle, error, and lock contracts discoverable to all
later history, recovery, and AI slices.

**Contract**: Regenerate and Prettier-normalize public schema types after a clean local reset; do not hand-edit the
generated file. Append the migration order and exact function signature, return value, `PW001`-`PW003` meanings,
server-owned timestamp, revision preservation, immutable prescription, advisory-lock namespace/order, and terminal
completion semantics to the contract registry. Also record that direct authenticated owner lifecycle updates remain a
lower-level RLS capability and that the RPC is the supported repository application path rather than an exclusive
database boundary.

### Success Criteria:

#### Automated Verification:

- Clean local reset applies the completion migration: `pnpm exec supabase db reset --local`
- Public schema database lint passes: `pnpm exec supabase db lint --local --schema public --fail-on error`
- Completion pgTAP contract passes:
  `pnpm exec supabase test db --local supabase/tests/database/planned_workout_completion.test.sql`
- Complete database suite remains green: `pnpm exec supabase test db --local supabase/tests/database`
- Planned-workout concurrency regression passes with the real completion RPC:
  `bash supabase/tests/database/planned_workout_mutation_concurrency.test.sh`
- Regenerated and Prettier-normalized public database types have no drift

#### Manual Verification:

- With disposable manual- and AI-origin plans, inspect that completion changes only lifecycle fields and preserves
  the exact prescription and revision.
- With two disposable users, confirm neither identity can discover or complete the other's supplied workout ID.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of timestamp, immutability, ownership, and concurrency behavior before proceeding to Phase 2.

---

## Phase 2: Completion Application Boundary

### Overview

Expose the database operation through the existing origin-neutral service and protected planned-workout endpoint,
with exact request parsing and stable safe outcomes.

### Changes Required:

#### 1. Exact completion request contract

**Files**: `src/lib/planned-workout-mutation.ts`, `src/lib/planned-workout-mutation.test.ts`

**Intent**: Give the browser and endpoint one versioned definition of the stale-safe completion token without
weakening the separate update/delete schemas.

**Contract**: Add `PlannedWorkoutCompleteRequest` and `parsePlannedWorkoutCompleteRequest()` with exactly `version`,
`expectedWorkoutId`, and `expectedRevision`. Require version 1, a canonical UUID, and a positive safe-integer revision;
reject arrays, null, unknown keys, missing keys, and update-only exercise data. Keep completion, delete, update, and
manual replacement contracts distinct even where their token fields match. Extend the built-in Node tests for valid,
malformed, extra-field, unsafe-revision, and cross-schema cases.

#### 2. Origin-neutral completion service

**File**: `src/lib/planned-workouts.ts`

**Intent**: Keep session verification, generated RPC invocation, result validation, and database error translation out
of the route and UI.

**Contract**: Add `completePlannedWorkout()` beside update/delete. Re-verify the request-local user, call only the
generated `complete_planned_workout` signature, map `PW001` to `stale_plan`, `PW002` to `validation_failed`, and
`PW003` to `unauthenticated`, and collapse unknown failures to `persistence_failed` with a sanitized technical code.
Treat any returned UUID other than the expected workout ID as `INVALID_RPC_RESULT`. Never accept client ownership,
status, origin, or timestamps and never expose raw Supabase/Postgres errors.

#### 3. Protected PATCH completion endpoint

**Files**: `src/pages/api/workouts/planned.ts`, `src/lib/workout-api.ts`

**Intent**: Add completion to the existing planned-workout resource while preserving its request-security and
diagnostic contract.

**Contract**: Add `complete_planned_workout` to `WorkoutApiOperation` and implement PATCH on
`/api/workouts/planned`. Apply exact Origin equality before body processing, require JSON, enforce declared and actual
32 KiB limits, require authenticated request locals, parse only the completion schema, and delegate to the service.
Return 204 with `X-Request-ID` on success. Preserve the safe `{ code, requestId }` failure envelope and status mapping:
400 validation, 401 authentication, 403 Origin rejection, 409 stale plan, and 500 unknown persistence failure. Logs
remain limited to request ID, operation, layer, safe code, and sanitized technical code.

### Success Criteria:

#### Automated Verification:

- Planned-workout request contract tests pass: `pnpm test:planned-workout`
- Completion pgTAP, full database, and planned concurrency gates remain green
- Generated database type drift check remains green
- Astro types synchronize successfully: `pnpm astro sync`
- Repository lint passes: `pnpm lint`
- Production SSR build succeeds under the Cloudflare adapter: `pnpm build`

#### Manual Verification:

- PATCH rejects missing/mismatched Origin, wrong media type, oversized or malformed JSON, extra fields, invalid tokens,
  signed-out state, and cross-user identifiers with the expected safe status/envelope.
- Known and unknown failures expose only safe code/request-ID feedback and sanitized logs while durable workout state
  remains unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of the endpoint security, safe response, and unchanged edit/delete/replacement paths before Phase 3.

---

## Phase 3: Undoable Dashboard Completion Experience

### Overview

Deliver the primary Mark done action, five-second non-modal Undo window, graceful card transition, authoritative
completion reconciliation, and durable dashboard outcome.

### Changes Required:

#### 1. Interactive planned-workout summary boundary

**Files**: `src/components/workouts/PlannedWorkoutSummary.tsx`, `src/pages/dashboard.astro`

**Intent**: Give one React state owner control of the card presentation and all workout actions so completion can
collapse, restore, lock, and reconcile the complete surface without cross-island DOM coordination.

**Contract**: Make `PlannedWorkoutSummary.tsx` the sole card renderer and mutation-state controller. It renders the
existing origin label, creation time, ordered prescription, and Edit/Build replacement/Delete behaviors; folds in the
existing accessible deletion confirmation and safe stale/error behavior; and prevents competing actions during grace
and commit states. Delete `PlannedWorkoutSummary.astro` and `PlannedWorkoutActions.tsx` after their behavior is moved.
Update `dashboard.astro` to import the React summary explicitly and mount it with `client:load`. Keep props limited to
the existing serializable `CurrentPlannedWorkout`; add no global store or global toast package.

#### 2. Testable completion state machine

**Files**: `src/lib/planned-workout-completion.ts`, `src/lib/planned-workout-completion.test.ts`, `package.json`

**Intent**: Make the deadline, Undo, and exactly-once submission rules executable without adding a browser-test
framework.

**Contract**: Define a pure completion-state reducer that accepts explicit states, events, and current timestamps and
returns the next state plus effects such as `schedule`, `submit`, `restore`, or `none`. Cover idle start, absolute
deadline calculation, early and near-deadline Undo, expiry, duplicate/obsolete callbacks, commit start, and terminal
reset so one intent can emit at most one submit effect. Add the test file to the existing
`pnpm test:planned-workout` command. Keep timers, fetch, DOM, focus, and animation outside the pure module.

#### 3. Five-second grace period, toast, and animation

**File**: `src/components/workouts/PlannedWorkoutSummary.tsx`

**Intent**: Let the user reverse an accidental completion without making durable history reversible or blocking the
rest of the application.

**Contract**: Make Mark done the leading primary action. Drive its lifecycle through the pure reducer. On activation,
record an absolute deadline five seconds in the future, disable workout mutations, start an approximately one-second
opacity/height collapse, and show a fixed non-modal toast outside the animated card. The toast states that the workout
will be marked done and exposes Undo until the deadline; a visual progress treatment may run without per-second live
announcements. Undo clears the timer, dispatches the matching reducer event, reverses/restores the card, and sends no
request. Unmount before commit also clears the timer and cancels completion.

When the deadline expires, remove Undo, announce committing state, and send exactly one PATCH with the displayed ID
and revision. Clear all timers on every terminal path. Add reduced-motion styling so movement is skipped or shortened
without changing the five-second grace period. Keep the toast usable at 360px with 16px viewport offsets, wrapped or
stacked content, a 44px Undo target, visible focus, no backdrop, and no focus trap.

#### 4. Durable success, stale state, and ambiguous-failure reconciliation

**Files**: `src/components/workouts/PlannedWorkoutSummary.tsx`, `src/pages/dashboard.astro`,
`src/lib/planned-workout-client.ts`, `src/lib/planned-workout-client.test.ts`, `src/lib/planned-workouts.ts`,
`src/pages/api/workouts/planned.ts`

**Intent**: Never claim that completion succeeded or failed solely from optimistic UI or an uncertain network
response.

**Contract**: On PATCH 204, navigate to `/dashboard?status=workout-completed`. Add a dashboard success status that is
rendered only when current-plan loading succeeds and returns null; then show the existing no-plan state and Create
manual workout action. On `stale_plan`, navigate to `/dashboard?status=workout-changed` so the latest durable plan or
empty state is rendered.

After a transport/unparseable response, GET the current plan with the expected workout ID as a canonical query value.
Extend the authenticated service/endpoint response without removing `{ currentPlan }`, adding an owner-scoped
`expectedWorkoutState` of `planned`, `completed`, or `absent`; cross-user and missing rows both appear absent. Only
`completed` proves the expected completion committed. The same ID/revision still planned restores the card with a
retryable error; a different current plan uses changed-state navigation; absent plus no conclusive state yields a
neutral alert asking the user to reload. Validate the expanded response before changing UI state and retain request IDs
when available. Existing builder/editor callers remain compatible because `{ currentPlan }` is preserved. Extend pure
client tests for completed, unchanged, changed, absent, malformed, and indeterminate classifications.

#### 5. Accessible responsive interaction verification

**Files**: `src/components/workouts/PlannedWorkoutSummary.tsx`, `src/styles/global.css`

**Intent**: Make the optimistic transition understandable and controllable across keyboard, screen reader, motion
preferences, mobile, and desktop use.

**Contract**: Use one stable polite, atomic live region for grace and commit status and `role="alert"` for failures.
Do not announce each countdown tick. Transfer focus from the disappearing Mark done button to Undo, and return it to
the restored Mark done action after Undo or retryable failure. Ensure long exercise names, action controls, and toast
content wrap without horizontal overflow. Add only the focused transition/reduced-motion styles needed by this
interaction.

### Success Criteria:

#### Automated Verification:

- Final database, completion, concurrency, generated-type, and planned-workout pure TypeScript gates pass
- Pure deadline, Undo, obsolete-callback, and exactly-once completion-state tests pass: `pnpm test:planned-workout`
- Existing manual-workout and cryptography tests pass
- Astro types synchronize successfully: `pnpm astro sync`
- Repository lint passes: `pnpm lint`
- Production Cloudflare Worker build succeeds: `pnpm build`

#### Manual Verification:

- Mark done immediately starts the graceful collapse and non-modal five-second Undo toast while unrelated dashboard
  and navigation controls remain usable.
- Undo at the beginning and near the deadline sends no request, restores the exact card, and leaves the workout
  planned; expiry sends one request and removes Undo.
- Reload, navigation, or tab close before the deadline cancels the uncommitted completion without an unload prompt.
- Successful completion shows the durable dashboard success and empty-plan state after refresh, with the exact
  prescription preserved as immutable completed history.
- Concurrent edit, replacement, delete, and completion attempts produce the latest durable dashboard state without
  completing an unseen workout.
- Network loss before response, malformed responses, known API failures, and failed reconciliation never produce a
  false success/failure claim and retain safe request-ID feedback where available.
- The card transition, toast, Undo focus, deletion flow, alerts, wrapping, and touch targets work at 360px and desktop
  widths with keyboard-only use and `prefers-reduced-motion` enabled.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of the grace period, animation, accessibility, reconciliation, and durable history before closing the
change.

---

## Testing Strategy

### Database Tests:

- Use a focused transactional pgTAP file for completion function shape, privileges, authentication, validation,
  owner isolation, server timestamp, exact-state preservation, stale/repeated calls, immutable history, and the freed
  planned slot.
- Retain lifecycle/RLS tests as lower-level contracts and treat the RPC as the supported application completion path.
- Extend the credential-free two-session script for completion/completion, edit, delete, manual replacement, and child
  mutation races. Require one valid winner, explicit stale outcomes, and no partial or cross-user state.

### Unit Tests:

- Extend Node's built-in TypeScript suite for the exact completion request schema and separation from update/delete.
- Test the pure completion reducer with explicit timestamps/events for grace start, Undo, expiry, obsolete callbacks,
  and exactly-once submission.
- Extend client-safe tests for the expected-workout/current-plan reconciliation envelope and classify completed,
  unchanged, changed, absent, malformed, and indeterminate outcomes.
- Keep React rendering, real timers, Astro environment, and Supabase clients out of pure tests; verify those through
  build gates and focused manual scenarios rather than adding a framework.

### Integration Tests:

- Treat clean reset -> pgTAP -> real completion concurrency -> generated types as the database/RPC integration gate.
- Compile the generated RPC, service, PATCH route, React summary, dashboard, and styles through Astro sync, type-aware
  lint, and the Cloudflare Worker production build.
- Manually exercise endpoint-to-RPC behavior with two users and two browser sessions because no browser automation
  harness is part of this slice.

### Manual Testing Steps:

1. Create a manual planned workout, select Mark done, and Undo early; verify no database fields change.
2. Repeat and Undo close to five seconds; verify no request commits and the exact card/actions return.
3. Repeat without Undo; verify one PATCH, a server completion timestamp, preserved revision/prescription, durable
   success after redirect, and the empty-plan dashboard action.
4. Navigate, reload, and close the tab during the grace period; verify the local intent is cancelled without a prompt.
5. Race completion from one session against edit, delete, replacement, and completion in another; verify stale-safe
   outcomes and no unseen-plan completion.
6. Lose the response after commit and before commit; verify current-plan reconciliation selects success or restoration
   from durable state rather than transport assumptions.
7. Force Origin, schema, auth, database, malformed-response, and reconciliation failures; verify safe messages,
   request IDs, sanitized logs, and no partial lifecycle state.
8. Repeat manual and AI-origin flows with two users to verify provenance, prescription preservation, and isolation.
9. Repeat at 360px and desktop widths using keyboard-only navigation and reduced-motion mode, checking focus, live
   announcements, touch targets, toast wrapping, collapse/restoration, and deletion regression.

## Performance Considerations

The completion request is one indexed current-plan lookup and one row update under the existing per-user lock, so no
caching, queue, or background processing is warranted at the expected small scale. The five-second delay is an
intentional UX grace period, not server latency. Use one deadline timeout rather than a render-driving per-second
interval; any visual progress animation should be CSS-driven. Current-plan reconciliation reuses the existing bounded
GET and occurs only after ambiguous transport outcomes.

## Migration Notes

- Add one forward migration; do not modify already-applied lifecycle or planned-workout mutation migrations.
- Existing planned and completed rows require no backfill or rewrite.
- The RPC preserves revision and prescription rows and changes only `status` and `completed_at` on an exact match.
- Existing authenticated owner grants still permit direct lifecycle-column updates under RLS. The new RPC is the
  supported application path; exclusive privilege hardening is outside this change.
- Regenerate types from a clean local reset with the pinned Supabase CLI and Prettier normalization used by CI.
- Do not use `supabase db reset --linked`, push to a hosted project, deploy the Worker, or change secrets during this
  implementation. A Worker rollback cannot undo a hosted completion-function migration.

## References

- Change identity: `context/changes/mark-planned-workout-done/change.md`
- Roadmap slice: `context/foundation/roadmap.md:127`
- Mark-done requirement: `context/foundation/prd.md:89`, `context/foundation/prd.md:129`
- Lifecycle/RLS contract: `supabase/migrations/20260820090200_create_workout_lifecycle.sql:16`
- Parent child-mutation lock: `supabase/migrations/20260827120000_serialize_workout_exercise_mutations.sql:20`
- Planned mutation lock/token pattern:
  `supabase/migrations/20260902120000_create_planned_workout_mutations.sql:93`
- Existing completion race actor:
  `supabase/tests/database/planned_workout_mutation_concurrency.test.sh:300`
- Stable completion requirement: `docs/reference/contract-surfaces.md:89`
- Current plan service: `src/lib/planned-workouts.ts:95`
- Planned endpoint: `src/pages/api/workouts/planned.ts:28`
- Safe workout API helpers: `src/lib/workout-api.ts:37`
- Dashboard durable status pattern: `src/pages/dashboard.astro:12`
- Current summary/action boundary: `src/components/workouts/PlannedWorkoutSummary.astro:29`
- Current focused test/CI commands: `package.json:10`, `.github/workflows/ci.yml:23`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Atomic Completion Persistence

#### Automated

- [ ] 1.1 Clean local reset applies the completion migration
- [ ] 1.2 Public schema database lint passes
- [ ] 1.3 Completion pgTAP contract passes
- [ ] 1.4 Complete database suite remains green
- [ ] 1.5 Planned-workout concurrency regression passes with the real completion RPC
- [ ] 1.6 Generated public database types have no drift

#### Manual

- [ ] 1.7 Completion changes only lifecycle fields and preserves prescription and revision
- [ ] 1.8 Two authenticated users remain isolated through the completion RPC

### Phase 2: Completion Application Boundary

#### Automated

- [ ] 2.1 Planned-workout request contract tests pass
- [ ] 2.2 Completion database and concurrency gates remain green
- [ ] 2.3 Generated database type drift check remains green
- [ ] 2.4 Astro types synchronize successfully
- [ ] 2.5 Repository lint passes
- [ ] 2.6 Production Cloudflare Worker build succeeds

#### Manual

- [ ] 2.7 PATCH enforces request, authentication, schema, token, and ownership bounds
- [ ] 2.8 API failures expose only safe responses and sanitized logs without durable mutation

### Phase 3: Undoable Dashboard Completion Experience

#### Automated

- [ ] 3.1 Final database, completion, concurrency, generated-type, and planned-workout gates pass
- [ ] 3.2 Pure deadline, Undo, obsolete-callback, and exactly-once completion-state tests pass
- [ ] 3.3 Existing manual-workout and cryptography tests pass
- [ ] 3.4 Astro types synchronize successfully
- [ ] 3.5 Repository lint passes
- [ ] 3.6 Production Cloudflare Worker build succeeds

#### Manual

- [ ] 3.7 Mark done starts a non-blocking collapse and five-second Undo opportunity
- [ ] 3.8 Early and near-deadline Undo restore the exact planned workout without a request
- [ ] 3.9 Navigation before the deadline cancels the uncommitted completion
- [ ] 3.10 Successful completion shows durable success and immutable history
- [ ] 3.11 Concurrent planned mutations resolve without completing an unseen workout
- [ ] 3.12 Ambiguous and known failures reconcile without false state claims
- [ ] 3.13 Responsive, keyboard, live-region, focus, and reduced-motion behavior is correct
