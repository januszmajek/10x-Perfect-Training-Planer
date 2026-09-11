# High-Signal UI Contracts Implementation Plan

## Overview

Establish a focused rendered-component test foundation for the workout catalogue and History UI. The change adds a separate Vitest/jsdom suite, makes it a required CI gate, documents the two relevant existing Node suites' signal, and adds independent visible-behavior contracts without changing production behavior.

## Current State Analysis

The repository has 22 TypeScript contract-test files run by Node 22's built-in runner, plus database/concurrency tests, but no DOM, component, or browser harness. The UI in scope is already split into client-loaded React islands, so the catalogue's controlled feature components and the History card can be rendered directly without testing Astro SSR or a real browser journey.

The catalogue and History implement related muscle/filter and card concepts through separate owners. Existing pure tests prove data semantics, but they do not prove that rendered controls expose the right state, invoke the intended callback, or reveal the expected history detail. This is the gap covered by Risks #3 and #5 in the test rollout.

## Desired End State

`pnpm test:ui` runs a deterministic jsdom suite locally and on every CI push/PR. The suite proves representative catalogue filters, card actions, preference controls, recovery ordering, and no-match output from explicit fixtures; it also proves that a completed History card reveals and hides its complete saved prescription. Expected outcomes are declared by fixtures and user-visible contracts, not calculated by the production helpers being checked.

### Key Discoveries:

- Existing Node-only scripts use `node --experimental-strip-types --test`; UI rendering needs a separate runner and must not replace those scripts. `package.json:11-19`
- CI already runs focused TypeScript suites before Astro sync, lint, and the Worker build, giving `test:ui` a natural gate location. `.github/workflows/ci.yml:43-58`
- `WorkoutDraftEditor` owns catalogue filter state, but `WorkoutCatalogueFilters`, `WorkoutCataloguePanel`, and `WorkoutCatalogueExerciseCard` are controlled rendering seams. `src/components/workouts/WorkoutDraftEditor.tsx:54-68`, `src/components/workouts/WorkoutCatalogueFilters.tsx:4-18`, `src/components/workouts/WorkoutCataloguePanel.tsx:19-31`
- The catalogue exposes visible action states and recovery grouping; existing tests cover the pure filtering/order rules but not their rendered mapping. `src/components/workouts/WorkoutCataloguePanel.tsx:56-146`, `src/lib/manual-workout-builder.test.ts:61-116`
- History cards own local Show/Hide detail state and render complete prescriptions from initial data, making a fixture-backed component contract possible without fetch, timers, or pagination. `src/components/workouts/WorkoutHistory.tsx:664-754`

## What We're NOT Doing

- Changing any production UI, filter, recovery, history, API, data, or authentication behavior.
- Adding Playwright, browser journeys, visual diffs, responsive assertions, filter-drawer lifecycle checks, or native dialog tests; those remain later browser-level work.
- Adding accessibility scans or accessibility-specific pass/fail assertions. The rollout strategy is updated so it no longer promises automated accessibility coverage.
- Mocking History debouncing, fetch replacement, URL synchronization, stale responses, pagination, or `IntersectionObserver`; this phase tests the static card-detail contract only.
- Auditing all existing TypeScript suites; the audit is limited to manual-builder and History-client tests.
- Replacing existing Node or database test commands, test framework conversions, snapshot-first tests, or test expectations derived by re-running the production helper under test.

## Implementation Approach

Add a Vite-native Vitest configuration with a jsdom setup and a narrow `*.test.tsx` discovery boundary. Retain the current Node scripts unchanged and invoke the new suite through `test:ui` in CI. Use small shared fixtures whose visible expected states are declared in the test, then test controlled catalogue components through callbacks and the History component through supplied initial data. Keep every test deterministic and free of network, timer, real-browser, or viewport emulation.

## Critical Implementation Details

The UI setup must preserve the repository's `@/*` import convention and clean up React renders after each test. Configure jsdom's visual mode so its `requestAnimationFrame`/`cancelAnimationFrame` pair is available to the static `WorkoutHistory` mount; this is an environment guarantee, not a component-level browser mock. Do not add a native `<dialog>` shim: dialogs are intentionally outside this phase. Component tests may locate controls as a user would, but must not add an axe scan or an assertion whose sole purpose is to certify accessibility metadata.

## Phase 1: Align Policy, Harness, and Audit

### Overview

Make the testing strategy accurately exclude automated accessibility coverage, establish the isolated rendered UI suite, enforce it in CI, and record the high-signal audit baseline before adding component contracts.

### Changes Required:

#### 1. Test rollout policy

**File**: `context/foundation/test-plan.md`

**Intent**: Keep the foundation strategy truthful after the explicit decision not to test accessibility.

**Contract**: Update the Phase 1 test-type, risk-response, quality-gate, and cookbook wording that currently promises accessibility checks. Preserve the Phase 1 Risks #3 and #5 goals, rendered interaction coverage, later browser work, and all existing non-UI test gates; state that automated accessibility coverage is outside this rollout rather than silently omitting it.

#### 2. UI test harness and command

**Files**: `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `src/test/ui/setup.ts`

**Intent**: Add a deterministic React-component test environment without altering the Node contract runner.

**Contract**: Add direct development dependencies for Vitest, jsdom, React Testing Library, and user-event. Configure Vitest for jsdom, `@/*` resolution, the shared setup module, and only `src/**/*.test.tsx` UI tests. Enable jsdom's visual mode so `WorkoutHistory` can schedule and cancel its mount-time animation frame; the setup cleans up rendered roots after each test. Add `pnpm test:ui` as the separate suite command; do not change the existing `test:*` Node commands or add network, observer, dialog, or per-test browser emulation.

#### 3. Required CI gate

**Files**: `.github/workflows/ci.yml`, `package.json`

**Intent**: Ensure the new contracts cannot be skipped by pull requests or pushes.

**Contract**: Run `pnpm test:ui` as its own CI step after the existing focused TypeScript suites and before Astro sync/lint/build. Keep the current install, database, concurrency, type-generation, and build gates in their existing order otherwise.

#### 4. Focused test-signal audit

**File**: `context/changes/testing-high-signal-ui-contracts/test-audit.md`

**Intent**: Establish why the new UI contracts add signal instead of merely increasing test count.

**Contract**: Audit `src/lib/manual-workout-builder.test.ts` and `src/lib/workout-history-client.test.ts` against the Risk #3 criterion: identify what each suite independently proves, which rendered outcomes it cannot prove, and which of its existing assertions are retained. Record the selected catalogue and History UI contracts as replacements for the rendered gap, not as a reason to delete valuable pure tests.

### Success Criteria:

#### Automated Verification:

- `pnpm test:ui` runs successfully with one temporary smoke test and then with the committed suite boundary.
- `pnpm test:manual-workout` and `pnpm test:history` still pass unchanged.
- `pnpm lint` and `pnpm build` pass with the Vitest configuration and test files included by project TypeScript rules.
- CI contains a dedicated `pnpm test:ui` step before Astro sync.

#### Manual Verification:

- Review `test-audit.md` and confirm it distinguishes pure-domain coverage from the rendered behavior the new suite must prove.
- Confirm the revised test-plan language no longer promises automated accessibility testing.

**Implementation Note**: After the harness and audit pass, pause for confirmation that the new CI gate and narrowed testing policy are acceptable before adding contracts that rely on them.

---

## Phase 2: Audit and Protect Catalogue Interactions

### Overview

Use explicit representative fixtures to add user-visible catalogue contracts for filters, cards, and panel-derived state without testing `WorkoutDraftEditor`'s drawer lifecycle or re-implementing domain logic inside tests.

### Changes Required:

#### 1. Shared catalogue UI fixtures

**File**: `src/test/ui/workout-fixtures.ts`

**Intent**: Give component tests small, readable exercise/draft/recovery inputs whose expected visible outcomes are obvious without calling the production filter or ordering helpers.

**Contract**: Export fixed catalogue exercises spanning primary and secondary muscle tags, distinct equipment, ready and recovering states, plus controlled callback spies. Keep fixture data local to the UI suite; do not change runtime models or import test data into production code.

#### 2. Controlled filter contract

**File**: `src/components/workouts/WorkoutCatalogueFilters.test.tsx`

**Intent**: Prove that the rendered filter surface reflects controlled values and translates visible user interaction to its declared callbacks.

**Contract**: Cover search-value changes, muscle/equipment checkbox toggles, active-only Reset visibility, and both visible close controls. Assert the caller-visible callback argument and UI outcome; do not assert Escape handling, body-scroll locking, focus restoration, CSS classes, or viewport layout.

#### 3. Catalogue card and panel contracts

**Files**: `src/components/workouts/WorkoutCatalogueExerciseCard.test.tsx`, `src/components/workouts/WorkoutCataloguePanel.test.tsx`

**Intent**: Prove that controlled draft, recovery, pending, and optional-feedback inputs map to the correct visible catalogue behavior.

**Contract**: Test Add/Added/Replace/Current action labels, disabled/pending selection behavior, selection callbacks, feedback controls only when the feedback capability exists, preference callback arguments, recovering-muscle duration text, recovery-order group headings, result count, and no-match output. Expected states must be declared from the fixture and visible text/action behavior; do not take snapshots, call `filterCatalogue` or `orderRecoveryAwareCatalogue` to derive the answer, add accessibility-only checks, or test the 20-item rule beyond the panel's supplied state.

### Success Criteria:

#### Automated Verification:

- `pnpm test:ui` proves the selected filter and catalogue/card contracts with no network, timer, or viewport mocks.
- The UI contracts fail when an action label, controlled callback argument, rendered recovery result, group order, or empty-state message is intentionally changed.
- `pnpm test:manual-workout`, `pnpm lint`, and `pnpm build` pass.

#### Manual Verification:

- On `/workouts/new`, confirm filtering, Add/Added/Replace/Current behavior, preference controls when offered, and recovery ordering still match the tested fixture outcomes in the live product.
- On `/workouts/edit`, confirm the shared editor retains its existing raw-catalogue card behavior.

**Implementation Note**: After automated verification, pause for confirmation that the suite proves product-visible catalogue outcomes rather than merely matching component internals.

---

## Phase 3: Protect History Card Behavior

### Overview

Add a narrow initial-data History contract that verifies completed-workout summary and detail behavior without taking on the asynchronous filter/pagination lifecycle.

### Changes Required:

#### 1. Fixture-backed History-card contract

**File**: `src/components/workouts/WorkoutHistory.test.tsx`

**Intent**: Protect the visible relationship between a completed-workout summary and its complete inline prescription.

**Contract**: Render `WorkoutHistory` with deterministic initial filters, one or more complete history entries, no next cursor, and matching muscle options. Verify the labelled History content shows origin, exercise count, and involved-muscle summary; activating Show details reveals the ordered prescription, sets/reps, and primary/secondary muscle text, while Hide details removes only that expanded content. Do not mock `fetch`, timers, URL replacement, `IntersectionObserver`, breakpoint behavior, requests, or assert accessibility metadata.

#### 2. Suite and gate verification

**Files**: `package.json`, `.github/workflows/ci.yml`

**Intent**: Confirm the final command and its CI use exercise the completed contracts without adding another gate.

**Contract**: Keep `test:ui` as the one UI command and one dedicated CI step introduced in Phase 1. Extend its tests; do not add an accessibility, visual, browser, or second History-specific command.

### Success Criteria:

#### Automated Verification:

- `pnpm test:ui` passes the History summary/detail contract alongside the catalogue contracts.
- `pnpm test:history`, `pnpm lint`, and `pnpm build` pass.
- The History contract fails if the details control no longer reveals the saved prescription or if the rendered prescription omits an exercise, sets/reps, or muscle role from its fixture.

#### Manual Verification:

- On `/history`, confirm a manual and an AI completed workout each expand and collapse inline with their complete prescription preserved.
- Confirm filtering, request replacement, drawer behavior, pagination, and responsive layout receive no new tests or behavioral changes in this phase.

**Implementation Note**: After automated verification, pause for confirmation that this change remains bounded to History-card behavior and has not absorbed the future browser journey scope.

## Testing Strategy

### Component Tests:

- Use Vitest/jsdom only for controlled React component rendering.
- Use explicit fixtures, visible text, user interactions, and callback effects as independent product oracles.
- Preserve existing Node contract tests for filtering, recovery ordering, date/filter parsing, and history DTO logic.
- Keep UI tests deterministic: no live Supabase, network, timer, layout, real-browser, or native-dialog dependencies.

### Integration Tests:

- The required integration evidence is the CI `test:ui` gate plus `pnpm astro sync`, lint, and Cloudflare Worker build compilation.
- No endpoint, SSR, database, or browser integration test is added in this change.

### Manual Testing Steps:

1. Run `pnpm test:ui`, `pnpm test:manual-workout`, `pnpm test:history`, `pnpm lint`, and `pnpm build`.
2. On `/workouts/new`, exercise search, muscle/equipment filtering, draft selection/replacement, recovery ordering, and optional feedback controls against representative catalogue data.
3. On `/workouts/edit`, verify the shared editor has not changed its raw-catalogue behavior.
4. On `/history`, expand and collapse manual and AI entries and compare the full displayed prescription with its saved workout.
5. Confirm no accessibility, browser, responsive, drawer-lifecycle, or asynchronous History test was introduced.

## Performance Considerations

The jsdom suite uses a narrow `*.test.tsx` discovery boundary, small in-memory fixtures, and no network or server startup. It adds CI runtime only for the new focused component suite; it does not change application bundles or runtime behavior.

## Migration Notes

- No database migration, generated type change, data migration, deployment, or secret change is required.
- `pnpm-lock.yaml` changes only through the approved direct development dependencies.
- Existing Node and database suites remain supported throughout; rollback is removing the isolated UI-test files, command, CI step, and newly added development dependencies together.

## References

- Change identity: `context/changes/testing-high-signal-ui-contracts/change.md`
- Rollout strategy: `context/foundation/test-plan.md:1-101`
- Existing test/CI conventions: `package.json:11-19`, `.github/workflows/ci.yml:43-58`
- React island boundaries: `src/pages/workouts/new.astro:43-50`, `src/pages/history.astro:45-50`
- Catalogue seams: `src/components/workouts/WorkoutCatalogueFilters.tsx:4-154`, `src/components/workouts/WorkoutCataloguePanel.tsx:19-150`, `src/components/workouts/WorkoutCatalogueExerciseCard.tsx:7-138`
- History card seam: `src/components/workouts/WorkoutHistory.tsx:664-754`
- Existing pure contracts: `src/lib/manual-workout-builder.test.ts:61-116`, `src/lib/workout-history-client.test.ts:168-213`
- Framework/testing guidance: Context7 Astro, React Testing Library, and Node.js documentation checked 2026-09-11

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Align Policy, Harness, and Audit

#### Automated

- [x] 1.1 Update the test rollout policy to exclude automated accessibility coverage — d79af63
- [x] 1.2 Add and run the isolated Vitest/jsdom UI harness — d79af63
- [x] 1.3 Add the required `pnpm test:ui` CI gate — d79af63
- [x] 1.4 Preserve existing Node suite, lint, and build verification — d79af63

#### Manual

- [x] 1.5 Confirm the focused audit distinguishes retained pure tests from rendered behavior gaps — d79af63
- [x] 1.6 Confirm the narrowed test policy and CI gate are acceptable — d79af63

### Phase 2: Audit and Protect Catalogue Interactions

#### Automated

- [x] 2.1 Add deterministic catalogue UI fixtures — c05b53c
- [x] 2.2 Prove controlled filter callbacks and visible state — c05b53c
- [x] 2.3 Prove card and panel interaction, recovery, and empty-result contracts — c05b53c
- [x] 2.4 Pass UI, manual-workout, lint, and build verification — c05b53c

#### Manual

- [x] 2.5 Confirm live create and edit catalogue interactions match the protected contracts — c05b53c
- [x] 2.6 Confirm the suite remains product-visible and free of accessibility-specific checks — c05b53c

### Phase 3: Protect History Card Behavior

#### Automated

- [x] 3.1 Add the fixture-backed History summary/detail contract — 68e172f
- [x] 3.2 Pass UI, history, lint, and build verification — 68e172f
- [x] 3.3 Confirm one UI command and CI gate cover all new contracts — 68e172f

#### Manual

- [x] 3.4 Confirm manual and AI History cards expand and collapse with complete prescriptions — 68e172f
- [x] 3.5 Confirm browser, responsiveness, drawer, and asynchronous History scope remains deferred — 68e172f
