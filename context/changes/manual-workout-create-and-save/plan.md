# Manual Workout Create and Save Implementation Plan

## Overview

Deliver the first complete workout-planning slice without AI: an authenticated user can open a dedicated manual
builder, search and filter the seeded catalogue, compose an ordered prescription with sets and reps, and save it as
their planned manual workout. If a plan already exists, the user may build freely and explicitly replace it; the
database must commit the replacement atomically or leave the previous plan untouched.

## Current State Analysis

The private Astro workspace and request-scoped authenticated Supabase client are present, but the dashboard is still
a placeholder and there are no workout routes, catalogue UI, workout services, or workout mutation endpoints. The
database foundation is substantially ahead of the application: it contains 58 seeded exercises, normalized primary
and secondary muscle tags, equipment values, owner RLS, ordered workout exercises, positive sets/reps constraints,
and a partial unique index that permits one planned workout per user.

Direct application calls cannot safely implement the requested replacement as a delete followed by separate inserts.
That sequence would expose the existing plan to partial failure. The established database-first pattern and current
Supabase RPC contract support placing the complete create-or-replace operation inside one `SECURITY INVOKER`
PostgreSQL function, where an exception rolls back every mutation.

## Desired End State

After this plan is complete:

- `/workouts/new` is a protected, responsive manual builder linked from the private workspace.
- The complete authenticated catalogue is loaded once and can be searched by name and filtered by multi-select
  muscle groups and equipment.
- Muscle and equipment selections use OR within their own category and AND across categories; both primary and
  secondary muscle tags match.
- Adding an exercise creates an editable 3 sets × 10 reps prescription. Users can remove exercises and change their
  order with accessible controls before saving.
- Draft state exists only in the active React island. The builder's Cancel action always discards it, and no browser
  or server persistence creates an implicit draft.
- A first plan is created atomically. When an existing plan is present, Create and Save requires explicit replacement
  confirmation; success replaces the old plan, while every failure preserves both the old plan and the in-memory
  draft.
- Replacement confirmation is compare-and-swap safe: if the current plan changes after it was shown, the stale
  confirmation cannot delete the newer plan. The builder preserves its draft, refreshes the current-plan summary,
  and requires confirmation against the new plan.
- A successful save navigates to `/dashboard`, where a success status and the durable planned-workout summary are
  visible.
- Database, concurrency, pure builder-logic, Astro sync, lint, and Cloudflare Worker build gates pass. Manual checks
  cover responsive, keyboard, cancellation, failure, and replacement behavior.

### Key Discoveries:

- S-02 requires catalogue browse/filter, sets/reps composition, and a saved manual plan as one vertical slice
  (`context/foundation/roadmap.md:99`).
- Search plus multi-select muscle-group and equipment filters are must-have catalogue behavior
  (`context/foundation/prd.md:96`).
- The database already enforces one plan, ordered unique exercises, and positive prescriptions
  (`supabase/migrations/20260820090200_create_workout_lifecycle.sql:41`).
- Workout child mutations already lock and recheck their planned parent to prevent completion races
  (`supabase/migrations/20260827120000_serialize_workout_exercise_mutations.sql:5`).
- Catalogue rows are authenticated-readable and client-immutable under RLS
  (`supabase/migrations/20260820090000_create_exercise_catalogue.sql:71`).
- Middleware supplies one authenticated request-local client but currently protects only dashboard/account families
  (`src/middleware.ts:4`).
- The dashboard has no workout data or planning entry point yet (`src/pages/dashboard.astro:7`).
- The repository has pgTAP and a two-session database concurrency pattern, plus Node's built-in test runner for
  focused TypeScript contracts; it has no browser test framework (`package.json:10`, `.github/workflows/ci.yml:31`).

## What We're NOT Doing

- AI generation, re-rolls, provider calls, or AI-key fallback behavior.
- Recovery-aware filtering, recovery-window calculations, or completed-history inputs.
- Editing or deleting an already saved plan in place; those remain S-03. This slice only replaces the entire planned
  workout through a new manual creation flow after confirmation.
- Marking a plan done, history lists/filters, history deletion, or “do again.”
- Persistent drafts, autosave, local/session storage, restore prompts, or a `Save draft` action.
- Workout titles, scheduled dates, notes, weights, rep ranges, set-by-set logging, or volume tracking.
- Custom exercises, favourites, catalogue mutation, exercise instructions, images, or catalogue pagination.
- Drag-only ordering. Reordering must remain usable with keyboard and touch controls.
- Adding Vitest, Playwright, Cypress, or another test framework.
- Applying a hosted Supabase migration, deploying a Worker, or changing production secrets.

## Implementation Approach

Use three layers that follow the repository's existing database → service/endpoint → UI sequence.

First, add one authenticated database function that accepts the ordered prescription and whether replacement was
explicitly confirmed. It derives ownership and manual origin server-side, serializes mutations for the caller, and
creates or replaces the planned workout in one transaction under the existing RLS and privilege model.

Second, add client-safe catalogue/filter/draft validation contracts plus a server-only manual-workout service. A
protected Astro endpoint accepts one bounded same-origin payload, revalidates it, calls the RPC through
`Astro.locals.supabase`, and maps outcomes to stable, non-sensitive response codes. Success uses a redirect target for
the dashboard; failures remain machine-readable so the React island can preserve its draft.

Third, server-render the catalogue and current-plan snapshot into a React builder island. The island owns only
ephemeral composition state and async submission UX. The dashboard and workspace navigation expose the entry point
and durable saved result.

## Critical Implementation Details

### Timing & lifecycle

The replacement function must validate the caller and complete prescription, acquire a transaction-scoped advisory
lock keyed by `hashtextextended('perfect-training-planner:planned-workout:' || auth.uid()::text, 0)`, then lock the
current planned parent with `FOR UPDATE` before comparing expected state or changing rows. The advisory-lock key is a
load-bearing namespace that later planned-workout edit/complete RPCs must reuse. Deleting the current plan and
inserting the new parent/items occur inside the same RPC transaction; no application-level delete-first or
compensating cleanup is allowed. Concurrent create, replace, completion, and child-mutation attempts must end with a
complete lifecycle-valid state.

### State sequencing

The browser's draft is never the source of durable truth. A confirmed replacement may clear the draft only after the
RPC succeeds. On a response, validation, network, or database failure, close the replacement confirmation, retain
the draft exactly as submitted, surface an inline error, and leave the existing plan unchanged. The builder-level
Cancel action discards the draft and returns to the dashboard; the replacement prompt should use “Keep editing” for
its non-destructive dismissal so it cannot be confused with draft cancellation.

Client-side validation failures never call the API. Network/transport failures are a separate local UI state and do
not masquerade as an API response. API failures use only the public error envelope and never expose a database error.

### User experience spec

Create and Save submits immediately when no current plan exists. When one exists—or a concurrent plan conflict is
reported after page load—it presents the current-plan replacement warning before retrying with explicit confirmation.
Confirmation carries the exact current workout ID shown to the user. A stale-plan response keeps the draft, refreshes
the current-plan summary through the endpoint's authenticated GET representation, and requires confirmation against
that new ID before another replacement attempt.
Reordering must expose labelled Move up/Move down controls and visible order, not rely solely on drag gestures.
Submission and confirmation controls prevent duplicate requests while pending, and focus returns to a useful control
after errors or prompt dismissal.

### Debug & observability

Generate a request ID for every workout API request. On failure, private server logs record only the request ID,
operation, originating layer (`request`, `validation`, `service`, or `database`), public error code, and a sanitized
technical code such as a known SQLSTATE. Never log request bodies, exercise/workout/user IDs, raw Supabase errors,
SQL messages/details/hints, stack traces, cookies, secrets, or other user data. Error responses contain only the safe
public code and request ID.

## Phase 1: Atomic Manual-Workout Persistence

### Overview

Add the database transaction that creates or replaces an owned planned manual workout, prove its authorization and
rollback contracts, and expose the generated RPC type to the application.

### Changes Required:

#### 1. Manual planned-workout mutation

**File**: `supabase/migrations/20260901120000_create_manual_workout_mutation.sql`

**Intent**: Provide one durable operation for both first save and confirmed full replacement so an old plan cannot be
lost to a partial application-level sequence.

**Contract**: Add public function
`save_manual_planned_workout(p_exercises jsonb, p_replace_existing boolean, p_expected_workout_id uuid)` that returns
the saved workout UUID. The ordered JSON array contains only `exercise_id`, `sets`, and `reps`; array order defines
zero-based `position`. The function obtains ownership from `auth.uid()`, always writes `origin = 'manual'` and
`status = 'planned'`, and accepts no caller-supplied user, origin, status, timestamps, new workout ID, or position.
`p_expected_workout_id` is null only when the browser observed no current plan; confirmed replacement supplies the
exact current plan UUID rendered in the confirmation.

The function must be `SECURITY INVOKER` with an empty `search_path`, executable only by `authenticated`, and subject
to existing RLS/column privileges. It rejects unauthenticated callers, an empty or malformed prescription, duplicate
exercise IDs, unknown catalogue IDs, and non-positive/non-integer sets or reps with stable non-sensitive outcomes.
Before looking up the plan, it acquires the exact transaction-scoped advisory lock named under Timing & lifecycle,
then locks any current planned parent `FOR UPDATE`. Its compare-and-swap matrix is explicit:

- Expected null + current null + replacement false creates the first plan.
- Expected null + current present returns `confirmation_required` without mutation.
- Expected non-null + current absent or a different UUID returns `stale_plan` without mutation.
- Expected UUID matching the current plan + replacement true performs the atomic replacement.
- Every other flag/state combination returns `validation_failed` without mutation.

The function uses fixed custom SQLSTATEs `MW001` (`confirmation_required`), `MW002` (`stale_plan`), `MW003`
(`validation_failed`), and `MW004` (`unauthenticated`). It replaces only that caller's planned workout and its
children. Completed workouts and other users' rows are never selected for replacement. Any error rolls back the
complete operation; every unknown SQLSTATE is treated as an internal persistence failure by the service.

#### 2. RPC schema, RLS, and rollback tests

**File**: `supabase/tests/database/manual_workout_mutation.test.sql`

**Intent**: Make atomicity, ownership, input validation, and create-versus-replace behavior executable database
contracts.

**Contract**: Add transactional pgTAP coverage for the function signature, invoker security, empty search path,
authenticated-only execution, first create, immutable manual origin, derived positions, exact prescriptions,
unconfirmed conflict, stale expected-plan rejection, confirmed compare-and-swap replacement, child cascade,
completed-history preservation, cross-user isolation, exact custom SQLSTATEs, and all rejected payload shapes. Force
a child-insert failure during replacement and prove the prior parent and all prior exercises remain byte-for-byte
present. Tests use disposable local auth identities and roll back.

#### 3. Concurrent save and replacement regression

**File**: `supabase/tests/database/manual_workout_mutation_concurrency.test.sh`

**Intent**: Prove that two simultaneous calls for the same owner cannot land duplicate, empty, or partially replaced
plans.

**Contract**: Extend the repository's credential-free two-session `psql` pattern to exercise concurrent first saves,
concurrent confirmed replacements against the same expected UUID, RPC versus completion, and RPC versus child
mutation. Verify advisory-lock then parent-row-lock ordering, stale-plan rejection rather than last-write-wins,
exactly one final planned parent, contiguous positions, the full winning exercise set, no orphaned children, and no
changes to another user's or a completed workout. Clean up disposable rows on every exit path.

#### 4. Generated and documented RPC surface

**Files**: `src/types/database.types.ts`, `docs/reference/contract-surfaces.md`

**Intent**: Make application code call the generated RPC signature and keep the mutation's name and invariants in the
load-bearing contract registry.

**Contract**: Regenerate and Prettier-normalize public-schema types after a clean reset; do not hand-edit the generated
file. Record the migration order, exact function/parameter/result names, authenticated invoker boundary,
server-derived ownership/origin/positions, existing-plan confirmation behavior, and atomic rollback/concurrency
invariants. Include the expected-plan compare-and-swap matrix, custom SQLSTATE mapping, and exact advisory-lock key
namespace so future edit/complete RPCs coordinate through the same mutation boundary.

### Success Criteria:

#### Automated Verification:

- Clean reset applies the manual workout RPC migration: `pnpm exec supabase db reset --local`
- Public schema passes database lint: `pnpm exec supabase db lint --local --schema public --fail-on error`
- Manual mutation pgTAP contract passes:
  `pnpm exec supabase test db --local supabase/tests/database/manual_workout_mutation.test.sql`
- Full database suite remains green: `pnpm exec supabase test db --local supabase/tests/database`
- Atomic replacement, stale-plan, completion, and child-mutation concurrency regressions pass:
  `bash supabase/tests/database/manual_workout_mutation_concurrency.test.sh`
- Regenerated and Prettier-normalized public database types have no diff from `src/types/database.types.ts`

#### Manual Verification:

- Force stale and failed confirmed replacements and inspect that the newer/original plan and every prescription
  remain unchanged.
- With two disposable users, confirm neither identity can call the RPC to replace the other's plan.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation that replacement rollback and ownership behavior are correct before proceeding to Phase 2.

---

## Phase 2: Builder Application Boundary

### Overview

Add shared catalogue/draft contracts, server-side data and mutation services, the protected asynchronous endpoint,
and focused logic tests without building the visual workflow yet.

### Changes Required:

#### 1. Client-safe builder contracts and pure logic

**Files**: `src/lib/manual-workout-builder.ts`, `src/lib/manual-workout-builder.test.ts`

**Intent**: Give the React builder and server boundary one typed, executable definition of catalogue shape, filter
semantics, ordered draft items, and prescription validation.

**Contract**: Define serializable catalogue items containing exercise identity/name/equipment plus role-aware muscle
tags, and draft items containing exercise identity with positive integer sets/reps. Pure operations cover case-
insensitive trimmed name search; OR matching within selected muscle groups and equipment; AND matching across active
categories; matching both primary and secondary muscle tags; 3 × 10 item creation; unique addition; removal; stable
Move up/Move down ordering; and complete-payload validation. Empty drafts, duplicates, unknown IDs, non-integers,
unsafe numbers, and values outside the public schema are invalid. The API request schema is version `1`, allows only
the exact top-level keys `version`, `replaceExisting`, `expectedWorkoutId`, and `exercises`, and allows only
`exerciseId`, `sets`, and `reps` inside each exercise. `expectedWorkoutId` and `exerciseId` are either null where
allowed or canonical 36-character UUID strings; a workout contains 1–20 unique exercises; `sets` is an integer from
1–99; and `reps` is an integer from 1–999. Unknown keys are rejected. The module imports no Astro server environment
or Supabase client.

Use Node 22's built-in runner for positive, empty-result, combined-filter, compound-exercise secondary-tag,
first/last reorder, duplicate, exact-key schema, 20-item boundary, UUID, and numeric-boundary cases. Tests use
relative imports compatible with `--experimental-strip-types`.

#### 2. Server-only manual-workout service

**File**: `src/lib/manual-workouts.ts`

**Intent**: Keep catalogue/current-plan queries, RPC invocation, and database error translation out of routes and UI
components.

**Contract**: Use the request-local typed Supabase client to load the complete authenticated catalogue with muscle
metadata in a bounded query and to load the caller's current planned workout with ordered exercises. Expose a small
serializable builder-data result and a save operation that accepts the verified user ID only as an ownership
cross-check, invokes `save_manual_planned_workout`, and maps outcomes to success, invalid input, existing-plan
confirmation required, stale plan, unauthenticated, origin rejection, or persistence failure. The service maps only
the known `MW001`–`MW004` SQLSTATEs; unknown database failures collapse to `persistence_failed`. Internal failure
metadata contains only a layer and sanitized technical code for endpoint logging. Never return or log raw
Supabase/Postgres errors and never accept browser-supplied ownership/origin/status. Keep completed history outside
builder queries.

#### 3. Protected async save endpoint

**File**: `src/pages/api/workouts/manual.ts`

**Intent**: Provide a same-origin mutation boundary that supports a success redirect while allowing failures to leave
the React draft mounted and retryable.

**Contract**: Implement authenticated GET for the current planned-workout summary and JSON-only POST for mutation.
Both generate a request ID. POST checks the `Origin` header before reading the body and requires an exact match with
`Astro.url.origin`; a missing/mismatched origin returns HTTP 403. Require `Content-Type: application/json`, reject a
declared `Content-Length` over 32 KiB, and also enforce the actual UTF-8 body limit of 32 KiB before JSON parsing.
Reject every other media type. Re-check `Astro.locals.user` and `Astro.locals.supabase`, validate the exact version-1
schema and field limits through the shared contract, and delegate to the service.

A successful POST redirects with HTTP 303 to `/dashboard?status=workout-saved`; async callers follow/navigate to that
GET result. Every API failure returns JSON containing exactly `{ "code": <safe-code>, "requestId": <id> }` and the
same request ID in the `X-Request-ID` header. The stable mapping is:

- HTTP 400 `validation_failed` for malformed JSON, unknown fields, or field/body/item limits.
- HTTP 401 `unauthenticated` for missing verified request locals.
- HTTP 403 `origin_rejected` for a missing or mismatched Origin.
- HTTP 409 `confirmation_required` for expected-null/current-present state.
- HTTP 409 `stale_plan` for an expected/current workout mismatch.
- HTTP 500 `persistence_failed` for unknown database or service failures.

Client-side validation and browser/network failures are local UI outcomes, not API error codes. For every API
failure, log one private structured event containing only request ID, operation, originating layer, safe code, and a
sanitized technical code. Never return or log SQL messages/details/hints, raw errors, stack traces, payloads,
identifiers, secrets, cookies, or user data. The endpoint never performs separate parent/child mutations or
retry-by-deletion.

#### 4. Workout route protection

**File**: `src/middleware.ts`

**Intent**: Extend the centralized authenticated boundary to workout pages and mutations while retaining endpoint-
level defense in depth.

**Contract**: Protect `/workouts` and `/api/workouts` route families with the existing boundary-aware matching logic.
Unauthenticated page requests redirect to sign-in; the mutation endpoint still verifies both request locals and never
trusts payload ownership.

#### 5. Logic and concurrency CI gates

**Files**: `package.json`, `.github/workflows/ci.yml`

**Intent**: Run the selected focused builder tests and new two-session atomic replacement regression on every push and
pull request without introducing a third-party test framework.

**Contract**: Add `pnpm test:manual-workout` using Node 22's built-in TypeScript-stripping test runner. Add distinct CI
steps for that command and `manual_workout_mutation_concurrency.test.sh`, preserving the existing clean reset,
database lint/suite, lifecycle concurrency, generated-type drift, crypto, Astro sync, lint, build, and cleanup gates.

### Success Criteria:

#### Automated Verification:

- Manual builder logic and request-schema tests pass: `pnpm test:manual-workout`
- Astro types synchronize successfully: `pnpm astro sync`
- Repository lint passes: `pnpm lint`
- Production SSR build passes under the Cloudflare adapter: `pnpm build`
- Database, lifecycle concurrency, manual-mutation concurrency, and generated-type regression gates remain green

#### Manual Verification:

- Exercise the endpoint with missing/mismatched Origin, wrong media type, oversized body, too many exercises,
  malformed/extra fields, signed-out state, and two disposable users; confirm bounded failures and owner-only effects.
- Trigger confirmation-required, stale-plan, validation, and forced persistence failures; confirm the exact safe
  code/request-ID envelope and sanitized private log while durable state remains intact.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of the endpoint contract and non-sensitive error behavior before proceeding to Phase 3.

---

## Phase 3: Responsive Manual Builder and Dashboard Outcome

### Overview

Build the dedicated manual-planning experience, explicit replacement workflow, workspace entry points, and durable
dashboard summary on top of the verified application boundary.

### Changes Required:

#### 1. Manual builder page

**File**: `src/pages/workouts/new.astro`

**Intent**: Establish the protected server-rendered route that provides authenticated catalogue/current-plan data to
the interactive builder.

**Contract**: Render inside `AuthenticatedLayout`, require verified request locals, load builder data through the
manual-workout service, and pass only serializable catalogue/current-plan props to the React island. Show a bounded
page-level load failure rather than mounting an empty/misleading builder. The page creates no draft row and performs
no mutation during render.

#### 2. Interactive manual workout builder

**File**: `src/components/workouts/ManualWorkoutBuilder.tsx`

**Intent**: Let mobile and desktop users find exercises, compose an ordered prescription, and intentionally create or
replace their plan without losing work on failure.

**Contract**: Provide name search, multi-select muscle filters, multi-select equipment filters, active-filter reset,
result count, and a clear no-results state. Apply the approved filter semantics from the shared pure module. Each
catalogue exercise exposes equipment plus primary/secondary muscle context and one Add action; selected exercises
cannot be duplicated.

The draft area starts each added item at editable 3 sets × 10 reps and supports removal plus labelled Move up/Move
down controls with correct first/last disabled states. Validate inline and disable Create and Save for an empty or
invalid draft. The builder-level Cancel action discards all in-memory state and returns to `/dashboard`; do not write
draft state to local storage, session storage, Supabase, cookies, or URL parameters.

If current-plan props are present, keep that plan visible as the unaffected current state while composing. Create
and Save opens an accessible confirmation that explains the full replacement. Its actions are “Replace planned
workout” and “Keep editing”; only the former submits `replaceExisting = true` plus the displayed workout ID as
`expectedWorkoutId`. A `confirmation_required` response refreshes the current summary through authenticated GET and
enters the confirmation path without clearing the draft. A `stale_plan` response preserves the draft, refreshes the
summary, and requires a new confirmation against the returned current ID. While pending, prevent duplicate
submission and announce state accessibly. Map safe API codes to user-friendly messages and show the returned request
ID for support; client validation and network failures use separate local messages. On failure, dismiss the prompt,
retain the exact draft, show an inline retryable error, and restore useful focus. On the successful 303 flow,
navigate to the dashboard GET result.

The layout must remain usable from 360px upward: catalogue and draft stack on narrow screens, interactive controls
have touch-sized targets, long exercise names wrap without hiding prescriptions, and filter controls remain keyboard
and screen-reader operable.

#### 3. Durable planned-workout summary

**Files**: `src/pages/dashboard.astro`, `src/components/workouts/PlannedWorkoutSummary.astro`

**Intent**: Make a successful save observable and give the current planned workout a stable home before S-03 adds
editing/deletion.

**Contract**: Load the current plan through the shared service. On `status=workout-saved`, render a success status
without treating the query string as persistence truth. When a plan exists, show manual origin, creation time, and
ordered exercise name/sets/reps summary plus an entry point to build a replacement. When none exists, show a clear
empty state and primary Create manual workout action. Do not add edit, delete, mark-done, history, or AI controls.

#### 4. Workspace navigation

**File**: `src/layouts/AuthenticatedLayout.astro`

**Intent**: Make manual planning discoverable throughout the private workspace.

**Contract**: Add a Manual workout destination targeting `/workouts/new`, preserve boundary-aware active-state
behavior, sign-out POST semantics, responsive wrapping, and the existing Dashboard/Account destinations.

### Success Criteria:

#### Automated Verification:

- Clean database reset, lint, full pgTAP, both concurrency scripts, and generated-type drift checks pass
- Manual builder logic and request-schema tests pass: `pnpm test:manual-workout`
- Existing crypto tests pass: `pnpm test:crypto`
- Astro types synchronize successfully: `pnpm astro sync`
- Repository lint passes: `pnpm lint`
- Production SSR build passes under the Cloudflare adapter: `pnpm build`

#### Manual Verification:

- At 360px and desktop widths, search and combined filters produce the approved results, reset correctly, and expose
  useful empty/result states.
- Add several exercises, verify 3 × 10 defaults, change prescriptions, remove and reorder items with keyboard/touch
  controls, and confirm the saved positions match the visible order.
- Use Cancel with and without an existing plan; confirm the draft is discarded and no draft is restored on return.
- With an existing plan, keep composing without mutation, choose Keep editing, then confirm replacement; verify only
  the successful confirmation changes the durable plan.
- Force client validation, network, confirmation-required, stale-plan, origin, request-schema, and database failures;
  confirm the existing/newer plan and exact in-memory draft remain, the safe code/request ID maps to useful UI, logs
  stay sanitized, the dialog closes, focus is useful, and retry succeeds.
- After first save and replacement, confirm the dashboard success status and ordered summary match durable database
  state, including after refresh/sign-in.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of responsive UX, cancellation, replacement safety, failure preservation, and dashboard durability
before closing the change.

---

## Testing Strategy

### Database Tests:

- Use transactional pgTAP for function shape, privileges, RLS, validation, first create, conflict, replacement,
  expected-plan compare-and-swap, custom SQLSTATEs, rollback, completed-history preservation, and cross-user denial.
- Preserve the existing direct table lifecycle tests; the RPC is an additional application mutation contract, not a
  replacement for lower-level constraints and policies.
- Use the two-session shell test for concurrency that pgTAP cannot represent reliably. Cover no-plan creation,
  same-expected-ID replacement, RPC versus completion, and RPC versus child mutation. Assert lock order,
  stale-plan rejection, completed-history preservation, and one complete planned result rather than merely counting
  parents.

### Unit Tests:

- Use Node's built-in runner for the client-safe filtering, default-prescription, unique-selection, removal,
  reordering, and payload-validation functions.
- Cover muscle primary/secondary matches, OR-within/AND-across filter behavior, case/whitespace search, empty results,
  boundary reorder actions, exact JSON keys, UUIDs, the 20-exercise limit, and rejected duplicates/numeric bounds.
- Keep server environment, React rendering, and Supabase clients out of this pure test module.

### Integration Tests:

- Treat clean reset → pgTAP → concurrency → generated types as the database/RPC integration gate.
- Compile page, service, endpoint, generated RPC type, and React island through Astro sync, type-aware lint, and the
  Cloudflare Worker production build.
- Manually exercise authenticated endpoint-to-RPC behavior with two users because no browser test harness is part of
  this slice.

### Manual Testing Steps:

1. Sign in as a disposable user with no planned workout and open `/workouts/new` from workspace navigation.
2. Exercise search, muscle/equipment combinations, clearing filters, no-results feedback, and secondary-tag matches.
3. Compose, edit, remove, and reorder several exercises; save and verify the dashboard/database order and values.
4. Start another draft, cancel, return to the builder, and verify nothing is restored.
5. Compose over an existing plan, dismiss with Keep editing, then confirm replacement and verify atomic success.
6. Change the current plan from another session before confirmation; verify stale-plan rejection, summary refresh,
   new confirmation, and preserved draft.
7. Force Origin, schema, network, and database failures; verify the safe code/request ID, sanitized logs, old durable
   state, and current browser draft.
8. Repeat with a second user to confirm catalogue access is shared while planned-workout data stays isolated.
9. Repeat the workflow using keyboard-only navigation at 360px and desktop widths, checking focus, labels, live
   status, touch targets, and long exercise names.

## Performance Considerations

The production catalogue contains 58 exercises and expected user/workout volume is small. Load catalogue rows and
their muscle tags in one bounded server query, then search/filter in memory in the React island; pagination,
virtualization, full-text indexes, caching, and server round-trips per filter change are unnecessary. Load the current
plan and ordered exercise details without N+1 queries. Mutation requests are capped at 32 KiB and 20 exercises.
Saving is one RPC/database transaction; do not add application retries that could obscure concurrency outcomes.

## Migration Notes

- This is a forward migration adding a callable function; it does not change existing table shapes or backfill rows.
- Existing planned and completed workouts remain valid. The function touches an existing planned row only after an
  authenticated user explicitly confirms replacement.
- Regenerate `src/types/database.types.ts` from a clean local reset and keep the exact normalized type-generation
  pipeline used by CI.
- Do not edit already-applied catalogue/lifecycle migrations. Correct future defects with another forward migration.
- Do not use `supabase db reset --linked`, push the migration to a hosted project, or deploy the Worker during this
  implementation. A Worker rollback cannot undo a remotely applied database function change.

## References

- Change identity: `context/changes/manual-workout-create-and-save/change.md`
- Roadmap slice: `context/foundation/roadmap.md:99`
- Catalogue and manual requirements: `context/foundation/prd.md:96`, `context/foundation/prd.md:111`,
  `context/foundation/prd.md:120`
- Durability and responsive constraints: `context/foundation/prd.md:157`, `context/foundation/prd.md:159`
- Catalogue access contract: `supabase/migrations/20260820090000_create_exercise_catalogue.sql:71`
- Workout lifecycle and one-plan constraint: `supabase/migrations/20260820090200_create_workout_lifecycle.sql:26`,
  `supabase/migrations/20260820090200_create_workout_lifecycle.sql:48`
- Parent locking pattern: `supabase/migrations/20260827120000_serialize_workout_exercise_mutations.sql:5`
- Stable database contract registry: `docs/reference/contract-surfaces.md:39`
- Request-local auth boundary: `src/middleware.ts:10`
- Existing focused Node test script pattern: `package.json:15`
- Existing database/concurrency CI gates: `.github/workflows/ci.yml:22`, `.github/workflows/ci.yml:31`
- Supabase database functions and RPC: `https://supabase.com/docs/guides/database/functions`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Atomic Manual-Workout Persistence

#### Automated

- [x] 1.1 Clean reset applies the manual workout RPC migration
- [x] 1.2 Public schema passes database lint
- [x] 1.3 Manual mutation pgTAP contract passes
- [x] 1.4 Full database suite remains green
- [x] 1.5 Atomic replacement, stale-plan, completion, and child-mutation concurrency regressions pass
- [x] 1.6 Generated and normalized public database types have no drift

#### Manual

- [x] 1.7 Stale or failed replacement preserves the newer/original plan and prescriptions
- [x] 1.8 Two authenticated users remain isolated through the RPC

### Phase 2: Builder Application Boundary

#### Automated

- [ ] 2.1 Manual builder logic and request-schema tests pass
- [ ] 2.2 Astro types synchronize successfully
- [ ] 2.3 Repository lint passes
- [ ] 2.4 Production Cloudflare Worker build passes
- [ ] 2.5 Database, concurrency, and generated-type regression gates remain green

#### Manual

- [ ] 2.6 Endpoint enforces Origin, media type, body, schema, authentication, and ownership bounds
- [ ] 2.7 Endpoint exposes safe code/request-ID failures and sanitized logs while preserving database state

### Phase 3: Responsive Manual Builder and Dashboard Outcome

#### Automated

- [ ] 3.1 Final database, concurrency, and generated-type gates pass
- [ ] 3.2 Manual builder logic and request-schema tests pass
- [ ] 3.3 Existing crypto tests pass
- [ ] 3.4 Astro types synchronize successfully
- [ ] 3.5 Repository lint passes
- [ ] 3.6 Production Cloudflare Worker build passes

#### Manual

- [ ] 3.7 Catalogue search and combined filters work responsively
- [ ] 3.8 Draft prescriptions, removal, and accessible reordering work
- [ ] 3.9 Cancel always discards the unsaved draft without persistent restoration
- [ ] 3.10 Existing-plan composition and compare-and-swap atomic replacement work
- [ ] 3.11 Client, network, stale-plan, API, and database failures preserve durable state and the exact draft
- [ ] 3.12 Dashboard success status and durable ordered summary remain correct after refresh
