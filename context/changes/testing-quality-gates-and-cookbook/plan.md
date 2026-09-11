# Quality Gates and Testing Cookbook Implementation Plan

## Overview

Close the demonstrated Node-test discovery hole, then make the complete local and CI quality-gate model discoverable
to contributors. This preserves the high-signal testing patterns introduced in Phases 1–3 without adding a second
workflow, runner, dependency, real-provider call, or broad coverage mandate.

## Current State Analysis

CI already owns the project’s layered verification sequence: local Supabase database checks, Node contracts, rendered
UI, browser journeys, Astro sync, lint, and Worker build. However, Node suites are split across manually maintained
file lists. `src/lib/workout-api.test.ts` is absent from every list, so its passing request-size regression test does
not run in CI. The test plan also still describes Vitest and Playwright as future work and leaves the Phase 1–2
cookbook sections incomplete; README's CI description omits the rendered and browser gates.

## Desired End State

Every direct Node contract test under `src/lib/` runs once through an explicit `test:node` CI gate, while the focused
domain scripts remain available for fast local diagnosis. Contributors can select the cheapest correct test layer,
know its discovery rule and local prerequisite, and see a README CI description that accurately matches the workflow.

### Key Discoveries:

- `src/lib/workout-api.test.ts:1` is a Node test outside every explicit script in `package.json:15-21`; this is a
  real, user-visible quality-gate omission rather than a hypothetical maintenance concern.
- `.github/workflows/ci.yml:43-58` runs five enumerated Node suites, then the already-established Vitest and
  Playwright gates.
- `vitest.config.ts:10-19` intentionally restricts rendered tests to `src/**/*.test.tsx`, while
  `playwright.config.ts:5-27` discovers `e2e/` specs and owns browser-only behavior.
- `scripts/run-e2e.mjs:9-49` requires local Supabase and constructs ephemeral local credentials, so it must not be
  wrapped into a generic all-tests script.
- `context/foundation/test-plan.md:69-123` contains stale stack facts and the outstanding cookbook placeholders.

## What We're NOT Doing

- Adding a new test framework, CI workflow, coverage threshold, or test infrastructure.
- Removing focused `test:crypto`, `test:ai-workout`, `test:manual-workout`, `test:planned-workout`, or `test:history`
  scripts.
- Adding a `test:all` command that tries to orchestrate Supabase and Playwright locally.
- Adding real provider calls, committed credentials, a broad visual-snapshot matrix, or a general accessibility suite.
- Changing application or database behavior.

## Implementation Approach

Use Node's existing test-runner glob support to establish one complete direct-contract boundary in `src/lib/*.test.ts`.
Run that boundary once in CI so future tests cannot be omitted by a stale per-domain list; retain the focused scripts
for local troubleshooting. Then document the four deliberate runner boundaries—Node, Vitest, Playwright, and
Supabase—and their exact local/CI commands in the test plan and README.

## Critical Implementation Details

The broad Node command must target only `src/lib/*.test.ts`; Vitest owns `.test.tsx` rendered tests and must remain
separate. Do not place browser/Supabase orchestration inside a convenience script: the browser wrapper intentionally
fails without a running local Supabase instance and supplies ephemeral test-only secrets.

## Phase 1: Make Node Contract Discovery Complete

### Overview

Replace manually duplicated CI membership with one automatic Node contract boundary while preserving focused local
commands.

### Changes Required:

#### 1. Package test commands

**File**: `package.json`

**Intent**: Add the canonical aggregate Node contract command, keeping existing domain-specific commands as targeted
developer entry points.

**Contract**: `test:node` invokes Node's current TypeScript test mode over `src/lib/*.test.ts`. It must include
`workout-api.test.ts` and all current direct Node tests, but must not capture rendered `.test.tsx` tests.

#### 2. CI Node-contract gate

**File**: `.github/workflows/ci.yml`

**Intent**: Execute all direct Node contract tests exactly once through the new aggregate command, eliminating the
maintenance gap caused by individual hand-maintained lists.

**Contract**: Replace the five separate Node-suite workflow steps with one clearly named `pnpm test:node` step. Keep
the database, rendered UI, Chromium installation, browser artifact, Astro sync, lint, build, and teardown steps in
their established order.

### Success Criteria:

#### Automated Verification:

- `pnpm test:node` succeeds and includes the `workout-api` request-size test in its reported test set.
- Each retained focused Node script still succeeds.
- `pnpm lint` and `pnpm build` succeed after package and workflow edits.

#### Manual Verification:

- Inspect the CI diff to confirm one aggregate Node gate replaces the five enumerated Node gates and no other gate is
  removed or reordered.

**Implementation Note**: After automated checks pass, pause for human confirmation that CI retains a useful, readable
failure boundary before continuing with documentation work.

---

## Phase 2: Publish the Canonical Runner Cookbook

### Overview

Bring the frozen test-plan stack facts, quality-gate map, and cookbook up to the actual shipped test harnesses.

### Changes Required:

#### 1. Stack and quality-gate map

**File**: `context/foundation/test-plan.md`

**Intent**: Replace obsolete "none yet" claims with the current Node, Supabase/pgTAP, Vitest/jsdom, Playwright, and
selective visual-check stack, and make local prerequisites and CI ownership explicit.

**Contract**: The stack/profile and §5 table name the exact command or prerequisite for database, Node, rendered UI,
browser/visual, and build/type/style checks. The Node discovery entry is `src/lib/*.test.ts` through `test:node`;
Vitest remains `src/**/*.test.tsx`; Playwright remains automatic `e2e/` discovery; database tests retain their explicit
Supabase directory and concurrency scripts.

#### 2. Cookbook sections 6.1–6.3 and runner checklist

**File**: `context/foundation/test-plan.md`

**Intent**: Turn the completed Phase 1–3 patterns into contributor guidance for selecting the cheapest independent
test layer and writing high-signal assertions.

**Contract**: Replace the three `TBD` sections with guidance for independent Node fixtures/negative cases, controlled
Vitest rendering using accessible user-visible outcomes and callback effects, and Playwright journeys using isolated
local users plus locator/URL/response waits rather than sleeps. Update §6.5 to provide a compact runner-selection and
discovery checklist. Retain §6.4's AI-safety boundary and all deliberate exclusions.

### Success Criteria:

#### Automated Verification:

- The test plan contains no stale "none yet", "no repository Playwright harness", or `TBD` statements for shipped
  rendered/browser testing layers.
- `pnpm exec prettier --check context/foundation/test-plan.md` passes.
- `pnpm lint` passes.

#### Manual Verification:

- Read the runner checklist for one representative Node, rendered UI, browser, and database change and confirm each
  points to exactly one appropriate runner and local command/prerequisite.
- Confirm the browser entry requires local Supabase and `pnpm exec playwright install chromium` before
  `pnpm test:e2e`.
- Confirm the cookbook explicitly excludes real-provider calls, broad visual suites, general accessibility scans, and
  browser emulation in Vitest.

**Implementation Note**: After automated checks pass, pause for human confirmation that the cookbook is concise
enough to use during ordinary feature work before continuing.

---

## Phase 3: Align Contributor CI Documentation

### Overview

Make README’s CI description a faithful, concise description of the actual ordered workflow and local-safe boundaries.

### Changes Required:

#### 1. CI documentation

**File**: `README.md`

**Intent**: Document the complete required CI sequence so contributors understand which gates run on a push or pull
request and why browser tests are safe to run locally.

**Contract**: The CI section covers trigger scope, local Supabase start/reset, schema and database checks, type drift,
the aggregate Node suite, rendered UI, Chromium/browser harness plus failure-only artifacts, Astro sync, lint, and
Worker build. It states that the build uses a publishable/anon Supabase key only and browser tests do not call the
real provider or use production credentials. It documents local Supabase plus `pnpm exec playwright install chromium`
as prerequisites for the browser harness.

### Success Criteria:

#### Automated Verification:

- `git diff --check` succeeds.
- `pnpm exec prettier --check README.md` succeeds.
- `pnpm lint` and `pnpm build` succeed.

#### Manual Verification:

- Compare the README's CI sequence with `.github/workflows/ci.yml` and confirm every material gate appears once, in
  the same order, without claiming an aggregate local test runner exists.

**Implementation Note**: After automated checks pass, pause for human confirmation that the docs give a contributor a
clear pre-PR path without requiring committed secrets.

## Testing Strategy

### Unit Tests:

- Run `pnpm test:node` to verify glob discovery includes every direct `src/lib/*.test.ts` file, especially
  `workout-api.test.ts`.
- Re-run each focused Node command to verify it remains a valid diagnostic subset.

### Integration Tests:

- With local Supabase running, retain the established database and browser suites rather than creating a new aggregate
  command.

### Manual Testing Steps:

1. Inspect `pnpm test:node` output and verify the request-parser test executes.
2. Compare the revised CI job to the README and test-plan gate map in order.
3. Use the cookbook to classify one potential domain, rendered-component, browser, and database regression.
4. Confirm the browser command requires local Supabase and `pnpm exec playwright install chromium`, and that no
   documentation suggests real credentials.

## Performance Considerations

No product runtime changes occur. The aggregate Node invocation may execute all direct contract tests in one process
instead of multiple CI processes; it should not alter the ownership boundaries of UI, browser, or database runners.

## Migration Notes

No data, deployment, environment, or dependency migration is required. Roll back by restoring the original CI Node
steps and package script if the aggregate command exposes an unsupported test-file pattern.

## References

- Research: `context/changes/testing-quality-gates-and-cookbook/research.md`
- Existing CI gate order: `.github/workflows/ci.yml:21-79`
- Node discovery gap: `package.json:15-21`, `src/lib/workout-api.test.ts:1-28`
- Rendered and browser boundaries: `vitest.config.ts:10-19`, `playwright.config.ts:5-27`
- Local browser precondition: `scripts/run-e2e.mjs:9-49`
- Testing strategy and cookbook: `context/foundation/test-plan.md:69-123`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Make Node Contract Discovery Complete

#### Automated

- [x] 1.1 Run `test:node` and verify it includes the request-size test. — 1fa28b6
- [x] 1.2 Verify retained focused Node scripts pass. — 1fa28b6
- [x] 1.3 Run lint and build after package and workflow edits. — 1fa28b6

#### Manual

- [x] 1.4 Confirm CI retains all non-Node gates in their existing order. — 1fa28b6

### Phase 2: Publish the Canonical Runner Cookbook

#### Automated

- [x] 2.1 Verify the test plan has no stale shipped-harness placeholders. — 9271e11
- [x] 2.2 Run Prettier's check for the test plan. — 9271e11
- [x] 2.3 Run lint. — 9271e11

#### Manual

- [x] 2.4 Confirm every representative regression maps to one runner and prerequisite, including Chromium for browser tests. — 9271e11
- [x] 2.5 Confirm all deliberate scope exclusions remain explicit. — 9271e11

### Phase 3: Align Contributor CI Documentation

#### Automated

- [x] 3.1 Run `git diff --check`.
- [x] 3.2 Run Prettier's check for the README.
- [x] 3.3 Run lint and build.

#### Manual

- [x] 3.4 Compare the README gate sequence to CI and confirm a secret-free pre-PR path.
