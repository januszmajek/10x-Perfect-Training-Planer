# Navigation and Application State Implementation Plan

## Overview

Prevent browser Back/Forward navigation from restoring stale private pages and transient UI such as dialogs. A
BFCache restore of an authenticated page will reload its current URL, which reruns the server-side auth and data path.
Workout-catalogue filters and recovery sort are promoted to URL state so they survive that reload; all other client
state is intentionally reset.

## Current State Analysis

The app uses full-document Astro SSR navigation with React islands, not a client-side router. Every private page is
wrapped by `AuthenticatedLayout`, and middleware resolves the current Supabase user before each document request.
However, browser BFCache restores a frozen document and JavaScript heap without making that request, so the existing
middleware and page loaders do not run.

Four independent native-dialog flows and the mobile navigation drawer derive their open state from React state:
replacement and reduced-workout confirmation in the builder, delete confirmation on the dashboard, and conflict/
discard confirmation in the editor. A restored snapshot can therefore reopen them. The history page's `popstate`
listener refreshes its API data only for history filter changes; it cannot refresh SSR data, auth, or other islands.

History criteria already have a URL contract. In contrast, the shared workout draft editor holds search, muscle,
equipment, and recovery-order controls in local state, so a deliberate reload would currently lose the criteria the
user asked to retain.

## Desired End State

On Back/Forward restoration from BFCache, a protected page reloads the exact current URL once. The reload recreates
all dialogs, drawers, drafts, pending state, errors, detail expansion, and other volatile island state from their
normal initial values; it also reruns middleware, so a user who signed out is redirected to `/auth/signin` before
private data renders.

The `/history` query continues to preserve its existing filters. Both workout builder routes preserve only catalogue
search, muscle filters, equipment filters, and recovery-order sorting through a validated, canonical query string.
The mobile filter drawer itself remains closed after the reload, and unsaved workout drafts are intentionally not
persisted.

### Key Discoveries:

- `src/layouts/AuthenticatedLayout.astro:10-14` redirects unauthenticated private page requests, but it is skipped
  when a browser restores a frozen page.
- `src/middleware.ts:14-33` refreshes `context.locals.user` from Supabase for every real request and protects all
  private page routes.
- `src/components/workouts/WorkoutBuilder.tsx:93-96` and
  `src/components/workouts/PlannedWorkoutEditor.tsx:64-66` hold dialog state locally; the dashboard's delete dialog
  does likewise in `src/components/workouts/PlannedWorkoutSummary.tsx:74-85`.
- `src/components/workouts/WorkoutHistory.tsx:199-200` already represents applied history filters with
  `history.replaceState`, while `src/components/workouts/WorkoutDraftEditor.tsx:48-52` and
  `src/components/workouts/WorkoutCataloguePanel.tsx:52` keep comparable catalogue criteria only in React state.
- `pageshow` exposes `persisted` for BFCache restores; this is the standard lifecycle signal for refreshing
  sensitive or stale state after restoration. See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/pageshow_event)
  and [web.dev](https://web.dev/articles/bfcache).

## What We're NOT Doing

- Persisting unsaved workout drafts, AI proposals, edits, error messages, confirmation tokens, open drawers, dialog
  state, detail expansion, focus, scroll position, or in-flight requests.
- Adding a client-side router, changing API/database contracts, or changing Supabase authentication behavior.
- Adding a browser/E2E test framework or new automated tests for this removal-focused regression fix.
- Changing the existing history-query grammar, sign-out redirect destination, or public sign-in/sign-up page behavior.

## Implementation Approach

Install one `pageshow` listener in `AuthenticatedLayout` that calls `location.reload()` only when
`PageTransitionEvent.persisted` is true. It runs only on routes that have already been accepted as authenticated and
reloads rather than redirects, preserving the browser's Back/Forward position and the current query string.

Create a small shared catalogue-navigation codec for `/workouts/new` and `/workouts/edit`. The codec validates and
canonicalizes a bounded search term, repeated muscle/equipment values, and one recovery-order enum against the
catalogue supplied to the page. Each route passes parsed initial criteria into its island; the shared draft editor
then owns the controlled criteria and calls `history.replaceState` on user changes. This retains only the requested
criteria across the BFCache-triggered reload without storing private workout content or stale UI state.

## Critical Implementation Details

The `pageshow` handler must distinguish an initial load from BFCache restoration with `event.persisted`; reloading on
every `pageshow` would loop. Keep it inside the authenticated layout rather than the root layout so sign-in and
sign-up form values are not disrupted. The URL codec must remove invalid/duplicate recognised values and preserve
unrelated query parameters, but it must not serialize drafts, modal state, confirmation tokens, or active proposals.

## Phase 1: Refresh Restored Private Documents

### Overview

Make Back/Forward restoration of a private document execute the ordinary SSR request path again, resetting all
ephemeral React and native-dialog state as a consequence.

### Changes Required:

#### 1. Protected layout lifecycle boundary

**File**: `src/layouts/AuthenticatedLayout.astro`

**Intent**: Register a browser `pageshow` handler for this already-authenticated shell. Reload only when the document
was restored from BFCache, preserving the current path and query while making the browser request fresh auth and page
data.

**Contract**: The handler accepts the page-transition event and calls `window.location.reload()` exactly when
`event.persisted === true`; it performs no reload on an initial load or ordinary document navigation.

#### 2. Existing private route and dialog boundaries

**Files**: `src/middleware.ts`, `src/components/MobileNavigation.tsx`, `src/components/workouts/WorkoutBuilder.tsx`,
`src/components/workouts/PlannedWorkoutSummary.tsx`, `src/components/workouts/PlannedWorkoutEditor.tsx`

**Intent**: Leave these contracts unchanged and rely on their normal SSR/island initialization after the reload. This
is what closes every currently discovered drawer and dialog and clears stale auth/data without separate reset code.

**Contract**: No component-level BFCache listener, modal-specific history state, or persisted volatile state is added;
middleware remains the sole authentication decision point for the reloaded document.

### Success Criteria:

#### Automated Verification:

- Type-aware lint succeeds: `pnpm lint`
- Production SSR build succeeds: `pnpm build`

#### Manual Verification:

- Open each private-page modal or the mobile navigation drawer, navigate away, then use Back/Forward; the restored
  page is fresh and the transient UI is closed.
- Sign out, use Back to a previously visited private page, and confirm it reloads through middleware to `/auth/signin`
  without showing the old signed-in page.
- Navigate Back/Forward between private pages and confirm the expected current URL remains selected in browser history.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of the manual BFCache and sign-out checks before proceeding.

---

## Phase 2: Preserve Catalogue Filters and Recovery Sort

### Overview

Retain only user-selected catalogue criteria across the intentional protected-page reload, on both new-workout and
edit-workout pages.

### Changes Required:

#### 1. Catalogue navigation codec

**File**: `src/lib/workout-catalogue-navigation.ts` (new)

**Intent**: Define the one client/server-safe representation of catalogue search, selected muscle codes, selected
equipment, and recovery order in the workout-page query string.

**Contract**: Export a typed state shape plus parse/serialize helpers. Recognised query keys are canonicalized using
the current catalogue's valid muscle/equipment vocabulary and `RecoveryOrder`; empty/default values are omitted,
duplicates are removed, and unrelated query parameters survive serialization. The codec contains no draft, workout,
proposal, token, or dialog data.

#### 2. Workout page initialization

**Files**: `src/pages/workouts/new.astro`, `src/pages/workouts/edit.astro`,
`src/components/workouts/WorkoutBuilder.tsx`, `src/components/workouts/PlannedWorkoutEditor.tsx`

**Intent**: Parse the current URL's valid catalogue criteria after each page obtains its catalogue and pass that
initial state through both route-specific controllers to the shared draft editor.

**Contract**: `/workouts/new` and `/workouts/edit` accept the same query grammar and initialize only the catalogue
criteria. Existing catalogue load failures, authentication redirects, workout/draft props, and save/edit contracts do
not change.

#### 3. Controlled catalogue criteria and URL synchronization

**Files**: `src/components/workouts/WorkoutDraftEditor.tsx`, `src/components/workouts/WorkoutCataloguePanel.tsx`

**Intent**: Make search, selected muscles, selected equipment, and recovery order controlled shared state in the draft
editor. Serialize it to the current workout route with `history.replaceState` whenever the user changes it, while
leaving the filters drawer, replace mode, and draft itself transient.

**Contract**: `WorkoutCataloguePanel` receives `order` and an order-change callback rather than owning local sort
state. `WorkoutDraftEditor` receives parsed initial criteria, renders them after reload, and updates the canonical URL
without calling `pushState`, triggering a navigation, or retaining the filters drawer's `open` value.

### Success Criteria:

#### Automated Verification:

- Type-aware lint succeeds: `pnpm lint`
- Production SSR build succeeds: `pnpm build`

#### Manual Verification:

- On `/workouts/new`, set search, muscle/equipment filters, and each non-default recovery sort; navigate away and
  return with Back/Forward. The criteria and displayed catalogue return, while the filters drawer and draft are reset.
- Repeat the same scenario on `/workouts/edit`; confirm no unsaved prescription, replace mode, discard dialog, or
  conflict dialog is restored.
- Reset catalogue criteria in the app, navigate to Dashboard through an app link, then use Back twice. Criteria stay
  reset and the browser does not expose an intermediate catalogue-criteria history entry.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of the private-page navigation scenarios before proceeding.

---

## Phase 3: Regression Verification and Handoff

### Overview

Run the repository gates and complete the agreed manual browser matrix. No automated test files are added or adjusted
unless implementation reveals an existing assertion that has become incorrect.

### Changes Required:

#### 1. Verification evidence

**Files**: No source-file change expected.

**Intent**: Verify the shared lifecycle behavior against the user-visible flows that previously could be restored from
browser history and capture any existing-test adjustment only if a test is demonstrably invalidated.

**Contract**: Do not introduce Playwright, a test runner, or new unit/component test coverage for this change. Preserve
the existing test suite and modify it only when it asserts behavior that the completed change intentionally removes.

### Success Criteria:

#### Automated Verification:

- Repository lint succeeds: `pnpm lint`
- Production SSR build succeeds: `pnpm build`

#### Manual Verification:

- In a BFCache-capable browser, exercise Back and Forward after opening every current dialog: reduced-workout,
  replacement, delete, edit-conflict, and discard; none reopens after the restored page reloads.
- Verify the private data refresh path by completing or deleting a plan in one navigation path, then revisiting a
  previously seen dashboard. On History, apply filters in the app, navigate away, and use Back/Forward; fresh data and
  applied filters return while the filters drawer and expanded details reset.
- Verify sign-out followed by Back cannot reveal an authenticated page, and confirm the same checks in a second major
  browser when available.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation that the manual browser checks passed before marking the change complete.

## Testing Strategy

No new automated tests are planned by explicit product decision. Existing automated gates remain `pnpm lint` and
`pnpm build`; existing test files are changed only if implementation proves that one encodes obsolete restored-state
behavior. Manual testing is the regression guardrail because BFCache restoration is browser lifecycle behavior.

## Performance Considerations

BFCache restores of authenticated pages intentionally trade their instant restored snapshot for a fresh private SSR
request. Reloading only private pages and only when `persisted` is true keeps ordinary navigation and public auth
forms unchanged. URL synchronization uses `replaceState`, so it creates no network request or history-stack entry.

## Migration Notes

No database migration, API migration, deployment configuration change, or rollback data procedure is required. A code
rollback removes the `pageshow` listener and catalogue query parsing while leaving any bookmark/query URL harmlessly
ignored by the previous version.

## References

- Browser lifecycle: [MDN `pageshow`](https://developer.mozilla.org/en-US/docs/Web/API/Window/pageshow_event) and
  [web.dev BFCache guidance](https://web.dev/articles/bfcache)
- Protected auth boundary: `src/layouts/AuthenticatedLayout.astro:10`, `src/middleware.ts:14`
- Existing history URL pattern: `src/components/workouts/WorkoutHistory.tsx:190-201`
- Transient catalogue state: `src/components/workouts/WorkoutDraftEditor.tsx:48-52`,
  `src/components/workouts/WorkoutCataloguePanel.tsx:52`
- Related completed slice: `context/archive/2026-09-06-history-aware-ai-proposal/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Refresh Restored Private Documents

#### Automated

- [x] 1.1 Type-aware lint succeeds: `pnpm lint`
- [x] 1.2 Production SSR build succeeds: `pnpm build`

#### Manual

- [x] 1.3 Dialog and mobile-drawer Back/Forward restores close transient UI
- [x] 1.4 Sign-out Back navigation reloads through middleware to `/auth/signin`
- [x] 1.5 Back/Forward preserves the current private-page URL

### Phase 2: Preserve Catalogue Filters and Recovery Sort

#### Automated

- [ ] 2.1 Type-aware lint succeeds: `pnpm lint`
- [ ] 2.2 Production SSR build succeeds: `pnpm build`

#### Manual

- [ ] 2.3 New-workout catalogue criteria survive Back/Forward while volatile state resets
- [ ] 2.4 Edit-workout catalogue criteria survive Back/Forward while volatile state resets
- [ ] 2.5 Reset catalogue criteria remain reset without extra browser-history entries

### Phase 3: Regression Verification and Handoff

#### Automated

- [ ] 3.1 Repository lint succeeds: `pnpm lint`
- [ ] 3.2 Production SSR build succeeds: `pnpm build`

#### Manual

- [ ] 3.3 Every current dialog stays closed after BFCache Back/Forward restoration
- [ ] 3.4 Dashboard and history data refresh after Back/Forward navigation
- [ ] 3.5 Sign-out Back navigation is private in a second major browser when available
