# Responsive Navigation and User Journeys Implementation Plan

## Overview

Add a narrow Playwright browser suite and CI gate for the app's authenticated workout journeys and responsive navigation. Fix the confirmed mobile-navigation resize leak; preserve intentionally volatile new-workout drafts and avoid an accessibility/focus-trap expansion.

## Current State Analysis

Node tests cover domain and API contracts, while Vitest/jsdom covers selected rendered component seams. No browser harness exists, so the repository cannot currently verify SSR auth, hydrated islands, CSS breakpoints, navigation history, browser focus/scroll lifecycle, or a save → completion → History journey.

`MobileNavigation` is hidden only at its trigger wrapper; an open portal survives a mobile-to-desktop resize. Workout and History filter drawers are separate owners with similar close behavior, while their URL/history and card semantics differ.

## Desired End State

PR CI runs a deterministic Chromium browser suite against local Supabase and the local Astro/Workers app. The suite proves the critical manual and mocked-AI workout lifecycles, the documented create-draft discard contract, responsive navigation/control reachability, and only the filter semantics/lifecycle that Workout and History actually share. An open mobile drawer closes when the layout changes to desktop.

### Key Discoveries

- `src/components/MobileNavigation.tsx:113-177` portals the drawer outside its `sm:hidden` trigger and does not reconcile open state on resize.
- `src/components/workouts/WorkoutBuilder.tsx:89` keeps a create draft in memory; its normal cancellation/navigation contract is discard (`365-391`).
- `src/components/workouts/WorkoutHistory.tsx:260-277` handles `popstate`; `WorkoutDraftEditor.tsx:123-131` does not, so the routes must not be tested as equivalent browser-history implementations.
- `package.json` and `.github/workflows/ci.yml` contain Vitest/Node coverage but no browser-test command, dependency, or job step.

## What We're NOT Doing

- Adding a confirmation guard or durable storage for unsaved new-workout drafts.
- Adding catalogue Back/Forward behavior merely to mirror History.
- Turning custom drawers into fully focus-trapped modals or adding an accessibility audit suite.
- Running a real OpenRouter request, using a personal key, or introducing a large visual-snapshot matrix.
- Changing database ownership, workout business rules, or existing Node/Vitest test boundaries.

## Implementation Approach

Install Playwright as a separate browser layer. Start from an isolated local Supabase reset, create disposable browser users/data through test-only helpers, and route the browser's same-origin AI-generation API request to a deterministic proposal after SSR has read a locally seeded encrypted provider key. Keep semantic locator assertions as the primary oracle; retain two stable Chromium screenshots only for the open mobile navigation and one responsive workout overlay. Add the smallest production resize effect needed to close the portalled mobile drawer at desktop width.

## Critical Implementation Details

The browser suite must wait on observable navigation, locator state, and routed network completion—never timeout sleeps. Local-only fixture credentials and encrypted provider-key rows must be created only in test setup and must not be committed to application configuration or exposed in browser payloads. Playwright must retain a trace and screenshot only on failure, and CI must upload those artifacts only when the browser job fails.

## Phase 1: Browser Harness and Isolated Fixtures

### Overview

Create the browser-test boundary, make it reproducible against the CI local Supabase stack, and provide reusable authenticated/manual/AI fixture setup without external provider calls.

### Changes Required

#### 1. Browser test configuration and scripts

**Files**: `package.json`, `playwright.config.ts`, `e2e/`

**Intent**: Add the Chromium-only Playwright runner, a separate `test:e2e` command, and configuration that starts the local app with explicit local test environment values.

**Contract**: Browser specs live outside Vitest discovery, run serially or with isolated users, use fixed 360px and desktop projects, and fail on test-only leaks. Screenshot assertions run only in the pinned Chromium project. Configure trace retention and failure screenshots in this phase, then upload the generated Playwright report/artifacts from CI only on failure.

#### 2. Local test environment and fixture helpers

**Files**: `e2e/fixtures.ts`, `e2e/global-setup.ts` (or equivalent), `.github/workflows/ci.yml`, documentation under this change

**Intent**: Provision disposable confirmed users, authenticated browser contexts, current plans/history inputs, and a configured encrypted AI-key record after local Supabase reset. Make the AI journey browser-visible without a real key by routing the browser's same-origin generation API request to a deterministic valid proposal.

**Contract**: Global setup reads local-only Supabase URL, anon/service credentials, model, confirmation secret, and encryption root secret at runtime; starts the app with its SSR-required public/runtime values; creates unique immediately-confirmed users; and encrypts/upserts each test user's provider-key row using the same test root secret. The helper never serializes those values into committed files, test output, page fixtures, or frontend code. The CI step runs after database reset and before lint/build, starts the local app through Playwright's web-server lifecycle, executes `pnpm test:e2e`, and uploads failure-only artifacts.

### Success Criteria

#### Automated Verification

- `pnpm test:e2e -- --list` discovers only the intended browser projects/specs.
- A fresh local Supabase reset plus `pnpm test:e2e` can create/authenticate isolated test users and enable the SSR Generate control without external OpenRouter traffic.
- CI runs the browser suite after local Supabase setup and fails the job on any browser assertion failure.

#### Manual Verification

- Confirm committed fixture/config sources and sanitized Phase 1 runner output contain no credential values.

---

## Phase 2: Responsive Navigation Fix and Browser Contracts

### Overview

Fix the mobile-to-desktop drawer leak and protect the smallest set of 360px/desktop navigation and filter-overlay behaviors that users can observe.

### Changes Required

#### 1. Mobile navigation resize reconciliation

**File**: `src/components/MobileNavigation.tsx`

**Intent**: Close an open portalled drawer when the viewport crosses into the desktop sidebar layout, allowing existing effect cleanup to restore scroll state and prevent the overlay covering desktop navigation.

**Contract**: An open mobile drawer is valid only below Tailwind's `sm` breakpoint. Crossing to `sm` or wider closes it; no listener remains after unmount and existing Escape/backdrop/trigger close behavior remains unchanged.

#### 2. Responsive navigation and drawer browser specifications

**Files**: `e2e/responsive-navigation.spec.ts`, `e2e/visual/` snapshots

**Intent**: Prove essential global navigation is reachable at 360px and desktop, and exercise the independently owned Workout and History filter drawer close lifecycles without treating matching styling as shared implementation.

**Contract**: At 360px, assert the menu/filter triggers, route links, and essential close controls are visible and actionable; assert Escape/backdrop closes the applicable drawer, scroll state restores, and the opener regains focus. Resize an open mobile menu to desktop and assert the portal is non-visible/non-interactive while desktop navigation is usable; the minimal state-close fix does not need to unmount the portal. At desktop, assert sidebar routes and static filter controls remain reachable. Use only two stable screenshots: open global navigation and one open workout filter/dialog surface.

### Success Criteria

#### Automated Verification

- The mobile-to-desktop resize scenario fails before the `MobileNavigation` fix and passes after it.
- 360px and desktop semantic/geometry assertions prove each critical route/control can be operated.
- Drawer close assertions prove current Escape/backdrop/focus-return/scroll-return behavior for the scoped surfaces without introducing a Tab-trap requirement.
- The two approved Chromium visual checkpoints are deterministic and reviewed.

#### Manual Verification

- At a physical narrow viewport, open and close the navigation and workout/history filters, then rotate/resize to desktop and confirm no overlay remains.

---

## Phase 3: Durable Workout Journeys and True Cross-Route Contracts

### Overview

Add representative manual and AI lifecycle journeys, asserting actual persistence and History rendering rather than success messages or isolated component behavior.

### Changes Required

#### 1. Manual and AI workout lifecycle specifications

**Files**: `e2e/workout-journeys.spec.ts`, `e2e/fixtures.ts`

**Intent**: Exercise the complete manual flow and an AI-proposal flow through authenticated SSR, hydrated islands, save redirects, editing/completion, and rendered History data.

**Contract**: The manual flow adds a fixture exercise, saves, edits, completes after the visible grace-period transition, then asserts the persisted completed card/details in History. The AI flow routes only the browser's `/api/workouts/ai/generate` request to a deterministic valid API response, permits a visible adjustment, saves, and proves the same durable lifecycle; Node/API contracts remain responsible for the server provider boundary. Assertions target role/name, URL, and persisted user-visible results; they do not use arbitrary waits or production helper-derived expectations.

#### 2. State-boundary and filter-contract specifications

**Files**: `e2e/workout-journeys.spec.ts`, `e2e/history-filters.spec.ts`

**Intent**: Make volatile versus durable state and the genuinely shared Workout/History filter contract explicit.

**Contract**: A populated new-workout draft discarded through ordinary in-app navigation is absent on return, while a failed save retains its visible draft. Each route proves all-selected muscle/equipment filtering through fixture-declared output and canonical URL, then reloads to prove URL-derived state. Only History receives a Back/Forward restoration assertion; catalogue is asserted only for its documented canonical-current-URL behavior.

### Success Criteria

#### Automated Verification

- The manual journey proves save → dashboard/edit → completion → rendered History card/details.
- The mocked-AI journey proves save → dashboard/edit → completion → rendered History card/details.
- Failed-save and ordinary create-draft-navigation scenarios distinguish durable work from intentional volatile discard.
- Workout and History filter tests prove their shared all-selected filter outcome and reload behavior without requiring equal card, dialog, search/date, or Back/Forward semantics.
- `pnpm test:e2e`, `pnpm test:ui`, `pnpm lint`, and `pnpm build` pass.

#### Manual Verification

- Review browser trace/screenshot artifacts for a failed journey only; confirm they contain no secret material and that failure output identifies a user-visible contract.

## Testing Strategy

- Preserve Node tests for domain, API, completion, and query parsing; preserve Vitest tests for static rendered controls/cards.
- Use Playwright only where real browser/SSR/hydration/persistence/viewport semantics are required.
- Use locator, URL, and response-driven assertions. Keep screenshots scoped to the two stable high-risk responsive surfaces.

## Performance Considerations

Run Chromium only and use fixture-scoped users/data to keep CI time bounded. Do not add cross-browser or broad visual matrices in this rollout.

## Migration Notes

No database migration or production data migration is required. The browser harness depends on the existing CI local Supabase reset.

## References

- Research: `context/changes/testing-responsive-navigation-and-user-journeys/research.md`
- Existing UI contract boundary: `context/archive/2026-09-10-testing-high-signal-ui-contracts/plan.md`
- Mobile navigation: `src/components/MobileNavigation.tsx:35-179`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Browser Harness and Isolated Fixtures

#### Automated

- [x] 1.1 Add and discover the isolated Chromium browser harness.
- [x] 1.2 Provision local-only authenticated/manual/AI fixtures without external provider traffic.
- [x] 1.3 Run the browser suite in CI after local Supabase setup.

#### Manual

- [x] 1.4 Confirm committed fixture/config sources and sanitized Phase 1 runner output contain no credential values.

### Phase 2: Responsive Navigation Fix and Browser Contracts

#### Automated

- [ ] 2.1 Fix and prove mobile-to-desktop drawer reconciliation.
- [ ] 2.2 Prove scoped 360px and desktop navigation/filter reachability.
- [ ] 2.3 Prove scoped drawer close lifecycle.
- [ ] 2.4 Review the two deterministic Chromium visual checkpoints.

#### Manual

- [ ] 2.5 Verify narrow-to-desktop navigation and filter behavior in a real browser viewport.

### Phase 3: Durable Workout Journeys and True Cross-Route Contracts

#### Automated

- [ ] 3.1 Prove the manual save, edit, completion, and History journey.
- [ ] 3.2 Prove the mocked-AI save, edit, completion, and History journey.
- [ ] 3.3 Prove volatile create-draft discard and failed-save retention.
- [ ] 3.4 Prove scoped filter URL contracts.
- [ ] 3.5 Run browser, UI, lint, and Worker build gates.

#### Manual

- [ ] 3.6 Review failure-only journey artifacts for meaningful user-visible diagnostics and absent secrets.
