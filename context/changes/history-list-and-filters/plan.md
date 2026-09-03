# History List and Filters Implementation Plan

## Overview

Deliver S-05 as the authenticated, read-only view of completed workout history. Users can browse newest-first
history, filter it by local calendar date and multiple muscle groups without a document reload, expand each entry to
inspect its complete ordered prescription, and load older results in stable 25-item pages.

## Current State Analysis

S-04 already moves the exact planned workout into immutable completed history while preserving its identity, origin,
revision, exercise order, sets, and reps. The database already provides owner RLS, a user/status/completion-time
history index, ordered workout exercises, and reverse muscle-tag lookup. No history route, history query service,
history endpoint, filter contract, or history navigation item exists.

The application uses authenticated Astro SSR pages with focused `client:load` React islands. Server services use the
request-scoped typed Supabase client, verify the authenticated user, map database rows to camelCase DTOs, and return
sanitized failures. Existing interactive components provide patterns for controlled multi-select filters, accessible
empty/error states, ordered exercise lists, and touch-sized controls. The history island introduces the repository's
first cancellable request lifecycle.

Filtering completed parents through a nested muscle relation must not prune the detail relation returned to the UI.
The history service therefore needs separate page-membership and full-detail queries. Completed rows are immutable,
so this bounded two-stage read does not introduce a mutation race or require a database RPC.

## Desired End State

After this plan is complete:

- `/history` is protected, linked from private navigation, and initially server-renders the first matching page.
- History is ordered by `completed_at DESC, id DESC`, displays 25 entries at a time, and exposes Load more only when
  another page exists.
- Date controls offer 7-, 30-, and 90-day presets, All history, and an inclusive custom local-calendar range.
- The browser converts local dates into exact UTC start-inclusive/end-exclusive boundaries before writing the URL or
  calling the API, including across daylight-saving transitions.
- Users can select several muscle groups. A workout matches any selected primary or secondary muscle tag; date and
  muscle constraints combine with AND semantics.
- Every filter change applies automatically without confirmation or document navigation. A short debounce batches
  rapid changes, the URL is updated with `history.replaceState`, and stale requests cannot overwrite newer results.
- Compact history cards expand inline to show origin, completion time, all involved muscle groups, and the complete
  ordered exercise prescription with sets and reps.
- Empty, loading, filtered-empty, request-failure, and load-more-failure states preserve useful context and remain
  accessible at 360px and desktop widths.
- Pure history contracts, existing database/security suites, Astro sync, lint, and Cloudflare Worker build gates pass.

### Key Discoveries:

- S-05 requires date-range and muscle-group filters plus per-entry detail (`context/foundation/roadmap.md:140`,
  `context/foundation/prd.md:135`).
- History deletion, history cloning, and analytics remain outside MVP scope (`context/foundation/roadmap.md:211`,
  `context/foundation/prd.md:187`).
- Completion preserves the full prescription and makes completed rows immutable (`docs/reference/contract-surfaces.md:56`,
  `supabase/migrations/20260902130000_complete_planned_workout.sql:27`).
- `(user_id, status, completed_at DESC)` already supports the primary owner-history access path
  (`supabase/migrations/20260820090200_create_workout_lifecycle.sql:52`).
- RLS limits parent and child reads to the authenticated owner (`supabase/migrations/20260820090200_create_workout_lifecycle.sql:61`,
  `supabase/migrations/20260820090200_create_workout_lifecycle.sql:99`).
- The reverse muscle-tag index and prior domain decision support matching both primary and secondary tags
  (`supabase/migrations/20260820090000_create_exercise_catalogue.sql:49`,
  `context/archive/2026-08-19-domain-data-and-seed-catalogue/plan.md:143`).
- Current services already establish typed nested-query, auth-verification, failure, and camelCase mapping patterns
  (`src/lib/planned-workouts.ts:22`, `src/lib/planned-workouts.ts:60`, `src/lib/planned-workouts.ts:73`).
- The project has no browser test framework; focused client-safe logic uses Node's built-in runner
  (`package.json:15`, `src/lib/planned-workout-client.test.ts:1`).

## What We're NOT Doing

- Deleting or editing completed workouts.
- Cloning a historical workout into a new planned workout (`do again`).
- Charts, volume curves, personal-record tracking, trends, summaries, or other analytics.
- Weight, duration, notes, ratings, per-set performance, or training-date backfills.
- Search by exercise name, origin filtering, equipment filtering, or saved filter presets.
- A dedicated per-workout detail route; detail expands inside the history list.
- Infinite scrolling, numbered pagination, virtualization, or loading the complete unbounded history.
- A database view, RPC, schema migration, index change, materialized history, cache, or service-role query.
- Editing applied migrations, pushing to hosted Supabase, deploying the Worker, or changing secrets.
- Adding Playwright, Cypress, Vitest, or another test framework.

## Implementation Approach

Use the repository's contract/service -> endpoint/SSR -> interactive UI sequence across three phases.

First, define exact serializable history DTOs and pure filter, date, URL, cursor, response, and pagination contracts.
Add a server-only history service using the authenticated typed Supabase client. Its first bounded query selects the
ordered page membership, applying owner, completed status, UTC boundaries, cursor, and optional nested muscle-match
constraints. Its second query loads complete unfiltered prescriptions and all tags for those IDs, then maps results
back into the first query's order.

Second, expose the service through authenticated `GET /api/workouts/history` and a protected `/history` Astro page.
The page parses canonical URL filters, loads muscle options and the first page on the server, and hydrates one React
island with serializable initial state. The endpoint preserves the existing request-ID, safe response, sanitized log,
and request-local auth patterns.

Third, implement the responsive island. Controlled date and muscle inputs update immediately, synchronize canonical
query parameters with `history.replaceState`, and fetch page one without document navigation. Request cancellation
and generation checks prevent stale updates. Load more appends the next cursor page; entry expansion remains local.

## Critical Implementation Details

### Timing & lifecycle

Every committed filter change aborts the prior request, advances a monotonically increasing request generation,
resets the cursor and accumulated pages, synchronizes the URL, and starts a page-one request. Apply a short debounce
to checkbox and custom-date changes; presets and Clear may run immediately. Treat `AbortError` as cancellation, not
as a user-visible failure. A response may update state only when its generation remains current.

### User experience spec

Filtering never navigates or reloads the document. Keep existing results visible with `aria-busy="true"` while a
replacement request runs, then atomically replace them on valid success. A failed refresh keeps prior results; a
failed Load more keeps accumulated entries. Checkboxes remain enabled during refresh so users can build a
multi-selection naturally.

### State sequencing

The browser owns inclusive local dates. It converts the selected start day to local midnight and the selected end day
to the following local midnight, then serializes both as UTC ISO instants. The server consumes only validated
start-inclusive/end-exclusive instants and never guesses the browser timezone. A filter change clears expanded entry
IDs and pagination; Load more never changes filters or the page URL.

## Phase 1: History Query and Client Contracts

### Overview

Define the read model and executable filter/pagination contracts, then implement the authenticated two-stage history
query without changing routes or UI.

### Changes Required:

#### 1. Client-safe history contracts and pure logic

**Files**: `src/lib/workout-history-client.ts`, `src/lib/workout-history-client.test.ts`

**Intent**: Give SSR, the API route, and the React island one exact definition of filters, date boundaries, cursors,
history pages, URL serialization, response validation, and page merging.

**Contract**: Define a fixed page size of 25 and serializable types for muscle options, completed workout summaries,
ordered exercises with role-aware muscle tags, history filters, history pages, and opaque next cursors. Pure helpers
must:

- Convert valid inclusive browser-local `YYYY-MM-DD` start/end values into UTC ISO `completedFrom` and
  `completedBefore` boundaries using the following local day for the exclusive end.
- Support 7-, 30-, and 90-day presets plus an unbounded All history state.
- Parse and serialize canonical query parameters with optional UTC boundaries, sorted repeated `muscle` values, and
  no cursor in the user-facing page URL.
- Reject invalid dates, reversed/equal bounds, unknown parameters where required by the API contract, unknown muscle
  codes after validation, partial/malformed cursors, unsafe cursor lengths, and malformed response DTOs.
- Encode/decode an opaque base64url cursor containing only canonical `completedAt` and workout `id` values. The
  cursor is an ordering position, not a server-side binding to a filter set; callers discard it whenever filters
  change.
- Build page-one and cursor API URLs, merge append results defensively by workout ID, and distinguish replacement
  from append behavior.

Use Node's built-in TypeScript runner. Cover preset boundaries, custom ranges, DST transition dates, inclusive-end
conversion, invalid/reversed ranges, repeated/reordered muscles, primary/secondary OR semantics, cursor round trips,
equal-timestamp tie breaking, malformed payloads, page replacement, deduplicating append, and stale-generation
rejection.

#### 2. Authenticated history query service

**File**: `src/lib/workout-history.ts`

**Intent**: Load stable pages of complete completed-workout history without exposing Supabase result shapes or
allowing a nested muscle filter to truncate entry detail.

**Contract**: Add an origin-neutral server service that accepts the request-local typed Supabase client, verified user
ID, validated filters, and optional validated cursor. Reuse `verifyOwnedSession()` and the existing `WorkoutResult`
failure model. Query only `status = 'completed'` rows owned by the verified user.

The membership query applies optional `completed_at >= completedFrom`, `completed_at < completedBefore`, and muscle
matching through `workout_exercises -> exercises -> exercise_muscle_groups`. When muscles are selected, use an inner
embed at every filtering boundary (`workout_exercises!inner`, `exercises!inner`, and
`exercise_muscle_groups!inner`), qualify the muscle-code filter to the final relation, and select only parent
membership fields. Selected muscles use OR semantics and match either role. Order by `completed_at DESC, id DESC`;
cursor continuation is strictly older than the cursor tuple. Request 26 parent rows, return the first 25, and derive
`nextCursor` from item 25 only when item 26 exists.

Load the selected IDs through a second bounded query that returns origin, creation/completion timestamps, every
ordered exercise, and every primary/secondary muscle tag. Reassemble entries in membership-query order and sort child
prescriptions by position. Any missing, duplicate, null-completion, malformed, or mismatched detail row is a sanitized
`persistence_failed` result rather than a partial page. An empty membership page skips the detail query.

Also expose a bounded authenticated muscle-option query using the canonical `muscle_groups` table. Do not use
`service_role`, cache user data, add an RPC, or mutate any row.

### Success Criteria:

#### Automated Verification:

- History contract tests pass: `pnpm test:history`
- Existing planned-workout tests remain green: `pnpm test:planned-workout`
- Astro types synchronize successfully: `pnpm astro sync`
- Repository lint passes: `pnpm lint`
- Production Cloudflare Worker build succeeds: `pnpm build`

#### Manual Verification:

- Inspect equal-timestamp fixtures and confirm cursor pages are complete, stable, and duplicate-free.
- With completed compound exercises, confirm muscle membership uses primary and secondary tags while returned detail
  still contains every exercise and tag.
- With two users, confirm the service returns only the authenticated owner's completed workouts.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of date, muscle, pagination, and complete-detail semantics before proceeding to Phase 2.

---

## Phase 2: Protected History API and SSR Entry Point

### Overview

Expose validated history reads through the existing safe workout API boundary and create the protected,
server-rendered history destination.

### Changes Required:

#### 1. Protected history endpoint

**Files**: `src/pages/api/workouts/history.ts`, `src/lib/workout-api.ts`

**Intent**: Give the hydrated history island a stable authenticated JSON read boundary with safe validation and
diagnostics.

**Contract**: Add `get_completed_history` to `WorkoutApiOperation` and implement authenticated GET at
`/api/workouts/history`. Accept only optional `completedFrom`, `completedBefore`, repeated `muscle`, and opaque
`cursor` parameters. Enforce canonical UTC timestamps, paired cursor fields inside the opaque token, a bounded number
of unique muscle codes, known muscle codes, valid range ordering, and fixed server page size 25. The cursor supplies
only its ordering tuple; the endpoint evaluates it with the filters present in the current validated request. The
island discards the cursor whenever its filters change and re-sends its canonical filters for every append request.

Require request-local user and Supabase values, delegate to the history service, and return the exact validated
`WorkoutHistoryPage` JSON plus `X-Request-ID`. Use the existing safe status mapping and structured diagnostics.
Responses and logs must not expose raw Supabase errors, SQL details, cookies, user IDs, workout IDs, filter payloads,
or other user data.

#### 2. Protected SSR history page

**File**: `src/pages/history.astro`

**Intent**: Make history useful on the first response and provide a stable hydration boundary for no-reload
interaction.

**Contract**: Render in `AuthenticatedLayout`, require verified request locals, and parse the canonical URL filters
with the shared pure contract. When parsing produces a normalized replacement and its canonical path/query differs
from the request, return an HTTP 302 redirect to that canonical `/history?...` URL before querying. Otherwise,
concurrently load muscle options plus the first history page. Mount
`WorkoutHistory.tsx` with `client:load` only after both reads succeed, passing `initialFilters`, `initialPage`, and
`muscleOptions` as serializable props.

On server-load failure, render the existing bounded error-card pattern with retry and dashboard actions. The SSR
render performs no mutation and does not claim an empty history when loading failed.

#### 3. Route protection and navigation

**Files**: `src/middleware.ts`, `src/layouts/AuthenticatedLayout.astro`

**Intent**: Make completed history private and discoverable throughout the authenticated workspace.

**Contract**: Add `/history` to the centralized protected page families. Add a History navigation destination with
boundary-aware active-state behavior while preserving Dashboard, Workout, Account, sign-out semantics, responsive
wrapping, and current workout-family matching. `/api/workouts/history` remains covered by the existing
`/api/workouts` API family and must return an authenticated API failure rather than a page redirect.

#### 4. History contract verification gate

**Files**: `package.json`, `.github/workflows/ci.yml`

**Intent**: Run history parsing, timezone, cursor, and response tests on every push and pull request without adding a
new test framework.

**Contract**: Add `pnpm test:history` using Node 22's built-in TypeScript-stripping test runner. Add a distinct CI step
before Astro sync/lint/build. Preserve all existing database, concurrency, generated-type, cryptography, manual, and
planned-workout gates.

### Success Criteria:

#### Automated Verification:

- History contract tests pass: `pnpm test:history`
- Full local database suite remains green: `pnpm exec supabase test db --local supabase/tests/database`
- Existing workout lifecycle and mutation concurrency gates remain green
- Astro types synchronize successfully: `pnpm astro sync`
- Repository lint passes: `pnpm lint`
- Production Cloudflare Worker build succeeds: `pnpm build`

#### Manual Verification:

- Signed-out `/history` requests redirect to sign-in while signed-out API requests return the safe unauthenticated
  envelope.
- Invalid timestamps, reversed ranges, unknown muscles, malformed cursors, and excessive repeated parameters are
  rejected or normalized according to the page/API contracts without database errors.
- Two authenticated users cannot retrieve each other's history through supplied filters or cursors.
- The first history page and active History navigation state render correctly before client interaction.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of authentication, input bounds, SSR output, and safe diagnostics before proceeding to Phase 3.

---

## Phase 3: Responsive No-Reload History Experience

### Overview

Build the filterable, paginated, inline-detail React experience while preserving server-rendered initial content and
the user's current context during background requests.

### Changes Required:

#### 1. Interactive workout history island

**File**: `src/components/workouts/WorkoutHistory.tsx`

**Intent**: Let users browse and refine completed history continuously without confirmation steps or document reloads.

**Contract**: Initialize controlled filters and results from SSR props. Provide 7-, 30-, and 90-day preset actions,
All history, custom start/end date inputs, a collapsible multi-select muscle fieldset, active-filter summary, result
count, and Clear filters. Selecting any date or muscle updates control state immediately. Debounce checkbox and
custom-date requests briefly; presets and Clear may commit immediately.

On a committed filter change, convert local calendar values to UTC boundaries, serialize a canonical `/history` URL
with sorted repeated muscle parameters, call `window.history.replaceState`, clear expansion and pagination state,
and fetch page one from `/api/workouts/history` without Astro navigation or document reload. Register `popstate` to
restore filters and fetch the corresponding first page without writing the URL again.

Use an `AbortController` plus a monotonic generation guard for every replacement and append request. The effect
cleanup must abort active work, clear a pending debounce timer, and remove the `popstate` listener; disposed work must
never update React state. Keep controls enabled during replacement, preserve current results until valid success,
expose `aria-busy`, and announce only the settled result count. Cancellation is silent. Replacement failure preserves
prior entries and presents Retry plus a safe request ID when available.

#### 2. History cards and inline detail

**File**: `src/components/workouts/WorkoutHistory.tsx`

**Intent**: Keep the list scannable while making the immutable completed prescription available in context.

**Contract**: Each collapsed card shows localized completion date/time, manual or AI origin, exercise count, and
deduplicated involved-muscle chips. An explicit button toggles a stable controlled panel through `aria-expanded` and
`aria-controls`. Expanded detail renders the complete prescription as an ordered list with exercise name, sets, reps,
and primary/secondary muscle context. Several cards may remain open until a filter change resets the result set.

Use locale-aware browser formatting while retaining machine-readable `<time dateTime>` values. Long exercise and
muscle names must wrap. Expansion does not fetch another record because each page already contains complete details.

#### 3. Pagination, loading, empty, and failure states

**File**: `src/components/workouts/WorkoutHistory.tsx`

**Intent**: Preserve accumulated history and user orientation across page loads, empty results, and recoverable
failures.

**Contract**: Show Load more only when `nextCursor` exists. Append the next 25 entries while preserving expansion and
filters; disable duplicate pagination requests. A filter change aborts an active append. Append failure keeps all
existing entries and presents a retry local to the Load more area.

Distinguish initial empty history from filtered empty results. Initial empty explains that marking a planned workout
done adds it to history and links to the dashboard. Filtered empty offers Clear filters. Do not replace visible
results with an empty state while a request is pending. Use `role="alert"` for failures and one polite live region for
settled result counts and loading completion.

#### 4. Responsive and accessible presentation

**Files**: `src/components/workouts/WorkoutHistory.tsx`, `src/styles/global.css`

**Intent**: Make history filtering and inspection usable from the product's 360px minimum viewport through desktop,
including keyboard and assistive-technology use.

**Contract**: Stack date controls and actions on narrow screens, preserve at least 44px interaction targets, use
semantic fieldset/legend markup for muscle selection, expose visible focus states, and avoid horizontal overflow.
Background result updates must not steal focus. Clear retains useful focus; expansion keeps focus on its trigger.
Add global CSS only for behavior not expressible cleanly through existing Tailwind classes.

### Success Criteria:

#### Automated Verification:

- Final history contract suite passes: `pnpm test:history`
- Existing cryptography, manual-workout, and planned-workout tests pass
- Full database suite and concurrency regressions remain green
- Astro types synchronize successfully: `pnpm astro sync`
- Repository lint passes: `pnpm lint`
- Production Cloudflare Worker build succeeds: `pnpm build`

#### Manual Verification:

- Presets, All history, and inclusive custom local dates produce correct results around midnight and DST boundaries.
- Selecting and deselecting several muscles immediately updates results without Apply, confirmation, Astro navigation,
  or document reload; rapid changes never allow stale responses to win.
- URL parameters remain canonical and restore filters/results after refresh and browser navigation.
- Primary and secondary muscle tags use OR semantics, while date and muscle filters combine correctly.
- Load more appends stable duplicate-free pages; changing filters during append resets to the correct first page.
- Several entries expand inline with complete ordered prescriptions and accurate origin/time/muscle summaries.
- Initial empty, filtered empty, refresh failure, malformed response, and load-more failure states preserve appropriate
  data, focus, retry actions, and safe request-ID feedback.
- History remains usable at 360px and desktop widths with keyboard-only navigation, screen-reader semantics, long
  names, touch targets, and no horizontal overflow.
- Navigating away during a pending debounce, replacement, or append leaves no request, timer, listener, or late state
  update behind.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of no-reload filtering, cursor loading, inline detail, accessibility, and responsive behavior before
closing the change.

---

## Testing Strategy

### Database Tests:

- Run the existing pgTAP suite to preserve owner RLS, completed-history immutability, catalogue access, and
  completion-state contracts.
- Add no migration-specific test because this change adds no database object or privilege.
- Use disposable completed rows for two users during manual endpoint/service verification, including equal completion
  timestamps and compound exercises with secondary tags.

### Unit Tests:

- Use Node's built-in TypeScript runner for browser-local date conversion, preset ranges, DST boundaries, canonical
  URL serialization, strict API parsing, cursor validation, stable tuple ordering, response DTO validation, page
  replacement/append behavior, deduplication, and stale-generation rejection.
- Keep React rendering, Astro locals, and live Supabase clients outside pure tests.
- Treat request abortion and generation checks as explicit state/effect contracts where practical; verify real fetch
  integration manually.

### Integration Tests:

- Compile the typed two-stage service, API endpoint, SSR page, and React island through Astro sync, type-aware lint,
  and the Cloudflare Worker production build.
- Exercise the endpoint against local Supabase with two authenticated users because no browser/API integration harness
  currently exists.
- Preserve all existing database, generated-type, concurrency, cryptography, manual-workout, and planned-workout CI
  gates.

### Manual Testing Steps:

1. Complete several manual and AI-origin workout fixtures on different dates, including equal completion timestamps
   and compound exercises.
2. Open `/history` signed in and verify newest-first SSR content, navigation state, compact summaries, and full inline
   prescriptions.
3. Exercise every preset, All history, valid and invalid custom ranges, local-midnight boundaries, and a DST boundary.
4. Rapidly select and deselect several muscles; verify immediate no-reload updates, URL replacement, OR matching, and
   no stale-result flashes.
5. Refresh a filtered URL and use browser navigation; verify the controls and first result page are restored.
6. Load at least three pages with tied timestamps; verify stable order, no gaps, and no duplicate workout IDs.
7. Change filters during Load more and force refresh/append network failures; verify cancellation, retained results,
   retry behavior, and safe messages.
8. Repeat API and page access with a second user and supplied filters/cursors; verify strict owner isolation.
9. Repeat at 360px and desktop widths with keyboard-only navigation, checking focus, fieldsets, live status,
   expansion semantics, touch targets, wrapping, and overflow.

## Performance Considerations

Each page uses one bounded membership query and, when non-empty, one bounded detail query. The first query requests at
most 26 parents and the second at most 25 parent IDs; neither loads unbounded history. Existing owner/status/date and
muscle lookup indexes are sufficient at documented MVP scale. Do not add caching, virtualization, an RPC, or a new
index without measured evidence. Debouncing and cancellation limit redundant client work during rapid multi-select
changes.

## Migration Notes

- No schema migration, generated database type change, or data backfill is expected.
- Existing completed workouts become visible immediately through the read path.
- Completed records remain immutable; this change introduces no history mutation capability.
- Do not edit applied migrations, use `supabase db reset --linked`, push to hosted Supabase, or deploy the Worker
  during implementation.

## References

- Change identity: `context/changes/history-list-and-filters/change.md`
- Roadmap slice: `context/foundation/roadmap.md:140`
- History requirement: `context/foundation/prd.md:135`
- Responsive requirement: `context/foundation/prd.md:158`
- Completed-history lifecycle: `docs/reference/contract-surfaces.md:52`
- History index and owner RLS: `supabase/migrations/20260820090200_create_workout_lifecycle.sql:52`
- Muscle reverse lookup and authenticated catalogue access:
  `supabase/migrations/20260820090000_create_exercise_catalogue.sql:49`
- Typed service and mapping pattern: `src/lib/planned-workouts.ts:22`
- Existing API security/diagnostic helpers: `src/lib/workout-api.ts:26`
- Authenticated SSR/island pattern: `src/pages/workouts/new.astro:12`
- Filter and accessible empty-state pattern: `src/components/workouts/WorkoutDraftEditor.tsx:48`
- Ordered workout detail pattern: `src/components/workouts/PlannedWorkoutSummary.tsx:340`
- Current navigation: `src/layouts/AuthenticatedLayout.astro:15`
- Current verification gates: `package.json:15`, `.github/workflows/ci.yml:23`
- Supabase joins and nested resource filtering: `https://supabase.com/docs/guides/database/joins-and-nesting`
- React effect cleanup: `https://react.dev/reference/react/useEffect`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: History Query and Client Contracts

#### Automated

- [x] 1.1 History contract tests pass
- [x] 1.2 Existing planned-workout tests remain green
- [x] 1.3 Astro types synchronize successfully
- [x] 1.4 Repository lint passes
- [x] 1.5 Production Cloudflare Worker build succeeds

#### Manual

- [x] 1.6 Equal-timestamp cursor pages are stable and duplicate-free
- [x] 1.7 Muscle filtering preserves complete workout details
- [x] 1.8 Authenticated history service results remain owner-isolated

### Phase 2: Protected History API and SSR Entry Point

#### Automated

- [ ] 2.1 History contract tests pass
- [ ] 2.2 Full local database suite remains green
- [ ] 2.3 Existing workout concurrency gates remain green
- [ ] 2.4 Astro types synchronize successfully
- [ ] 2.5 Repository lint passes
- [ ] 2.6 Production Cloudflare Worker build succeeds

#### Manual

- [ ] 2.7 Page and API authentication boundaries behave correctly
- [ ] 2.8 Invalid history query parameters are safely rejected or normalized
- [ ] 2.9 History API preserves cross-user isolation
- [ ] 2.10 First-page SSR and History navigation state are correct

### Phase 3: Responsive No-Reload History Experience

#### Automated

- [ ] 3.1 Final history contract suite passes
- [ ] 3.2 Existing focused TypeScript suites pass
- [ ] 3.3 Full database and concurrency gates remain green
- [ ] 3.4 Astro types synchronize successfully
- [ ] 3.5 Repository lint passes
- [ ] 3.6 Production Cloudflare Worker build succeeds

#### Manual

- [ ] 3.7 Date presets and inclusive local ranges return correct history
- [ ] 3.8 Muscle multi-select updates without confirmation or document reload
- [ ] 3.9 Canonical URLs restore filters and results
- [ ] 3.10 Date and muscle matching semantics are correct
- [ ] 3.11 Cursor pagination appends stable duplicate-free results
- [ ] 3.12 Inline details show complete immutable prescriptions
- [ ] 3.13 Empty, loading, and failure states preserve context and recovery
- [ ] 3.14 Responsive, keyboard, screen-reader, focus, and overflow behavior is correct
- [ ] 3.15 Request lifecycle cleanup prevents late updates after navigation
