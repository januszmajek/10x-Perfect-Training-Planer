---
date: 2026-09-11T23:06:52+02:00
researcher: Janusz Majek
git_commit: 65b588f460aaadd2817487b175ada43610e627fc
branch: master
repository: januszmajek/10x-Perfect-Training-Planer
topic: "testing-quality-gates-and-cookbook"
tags: [research, codebase, testing, ci, playwright, vitest]
status: complete
last_updated: 2026-09-11
last_updated_by: Janusz Majek
---

# Research: testing-quality-gates-and-cookbook

**Date**: 2026-09-11T23:06:52+02:00  
**Researcher**: Janusz Majek  
**Git Commit**: 65b588f460aaadd2817487b175ada43610e627fc  
**Branch**: master  
**Repository**: januszmajek/10x-Perfect-Training-Planer

## Research Question

What quality gates and testing cookbook are needed for rollout Phase 4, `testing-quality-gates-and-cookbook`?

## Summary

The high-signal suites are already wired into the sole required CI job. Phase 4 should verify and document that
existing path, not add a parallel runner, workflow, coverage threshold, or external-provider dependency. The
implementation should make the discovery boundaries explicit: Node tests need inclusion in an appropriate explicit
package script; rendered tests must be `src/**/*.test.tsx`; Playwright specs under `e2e/` are discovered automatically;
and database tests are run from the explicit Supabase directory.

The cookbook should turn the completed Phase 1–3 patterns into concrete guidance: independent fixtures and observable
assertions for Node tests, controlled rendered behavior for Vitest, Playwright only for browser/SSR/persistence/viewport
seams, and provider-edge fixtures plus a single recovery journey for AI safety. It should retain the deliberately narrow
scope: no broad snapshots, general accessibility suite, real AI calls, or infrastructure expansion.

## Detailed Findings

### Existing CI is already the aggregate quality gate

- The `ci` job runs on pushes and pull requests to `master`, installs locked dependencies, starts and resets local
  Supabase, and then runs schema/database/type-drift checks ([CI workflow](https://github.com/januszmajek/10x-Perfect-Training-Planer/blob/65b588f460aaadd2817487b175ada43610e627fc/.github/workflows/ci.yml#L3)).
- It runs the Node contract suites, Vitest UI suite, Playwright suite, Astro sync, lint, and Cloudflare Worker build in
  one ordered job ([CI workflow](https://github.com/januszmajek/10x-Perfect-Training-Planer/blob/65b588f460aaadd2817487b175ada43610e627fc/.github/workflows/ci.yml#L43)).
- Chromium is installed only for the browser layer; failed browser runs retain screenshots, traces, and the blob report
  as an artifact ([CI workflow](https://github.com/januszmajek/10x-Perfect-Training-Planer/blob/65b588f460aaadd2817487b175ada43610e627fc/.github/workflows/ci.yml#L55)).
- The frozen quality strategy requires these same layers, including UI after Phase 1, browser and selective visual
  checks after Phase 2, and AI integration after Phase 3 ([test plan](https://github.com/januszmajek/10x-Perfect-Training-Planer/blob/65b588f460aaadd2817487b175ada43610e627fc/context/foundation/test-plan.md#L85)).

### Discovery boundaries are the principal guardrail

- Node suites are explicit file lists in `package.json`; a newly added `*.test.ts` is not automatically protected until
  it is placed in the relevant script ([package scripts](https://github.com/januszmajek/10x-Perfect-Training-Planer/blob/65b588f460aaadd2817487b175ada43610e627fc/package.json#L15)).
- Vitest is intentionally restricted to `src/**/*.test.tsx`, using jsdom and the shared UI setup; `*.test.ts` does not
  belong to this runner ([Vitest config](https://github.com/januszmajek/10x-Perfect-Training-Planer/blob/65b588f460aaadd2817487b175ada43610e627fc/vitest.config.ts#L10)).
- Playwright discovers the `e2e/` directory automatically. It is serial, Chromium-only, retries once in CI, and retains
  evidence only on failure ([Playwright config](https://github.com/januszmajek/10x-Perfect-Training-Planer/blob/65b588f460aaadd2817487b175ada43610e627fc/playwright.config.ts#L5)).
- The browser wrapper derives local Supabase settings and ephemeral local secrets at runtime, and refuses to run without
  Supabase; its tests do not invoke a live provider ([E2E runner](https://github.com/januszmajek/10x-Perfect-Training-Planer/blob/65b588f460aaadd2817487b175ada43610e627fc/scripts/run-e2e.mjs#L9)).

### Cookbook patterns have clear ownership boundaries

- UI tests should use fixed fixtures, user interaction, accessible queries, visible outcomes, and callback effects—as in
  the catalogue filters test—not production helpers to derive expected values ([UI example](https://github.com/januszmajek/10x-Perfect-Training-Planer/blob/65b588f460aaadd2817487b175ada43610e627fc/src/components/workouts/WorkoutCatalogueFilters.test.tsx#L53)).
- Browser tests should cover true viewport, hydration, navigation, focus, scroll-lock, and durable-state behavior using
  locators, URLs, and observable waits rather than sleeps. Keep visual checks to the stable, high-risk surfaces already
  established in responsive navigation ([browser example](https://github.com/januszmajek/10x-Perfect-Training-Planer/blob/65b588f460aaadd2817487b175ada43610e627fc/e2e/responsive-navigation.spec.ts#L11)).
- AI response tests already have the correct boundary: independent fixtures at the provider edge, production parser
  composition, one authenticated rendered recovery seam, and pgTAP as the ownership/rollback authority
  ([test plan](https://github.com/januszmajek/10x-Perfect-Training-Planer/blob/65b588f460aaadd2817487b175ada43610e627fc/context/foundation/test-plan.md#L110)).

### Documentation drift is the real current gap

- Cookbook sections 6.1–6.3 remain `TBD`, even though their Phase 1 and Phase 2 implementations are complete
  ([test plan](https://github.com/januszmajek/10x-Perfect-Training-Planer/blob/65b588f460aaadd2817487b175ada43610e627fc/context/foundation/test-plan.md#L96)).
- The stack profile still says there is no rendered or browser harness, which is obsolete given the checked-in Vitest and
  Playwright configuration ([test plan](https://github.com/januszmajek/10x-Perfect-Training-Planer/blob/65b588f460aaadd2817487b175ada43610e627fc/context/foundation/test-plan.md#L69)).
- README CI prose likewise omits the current UI and browser gates; Phase 4 should bring it in line with the workflow
  ([README](https://github.com/januszmajek/10x-Perfect-Training-Planer/blob/65b588f460aaadd2817487b175ada43610e627fc/README.md#L293)).

## Code References

- `.github/workflows/ci.yml:21` — canonical CI sequence and local Supabase lifecycle.
- `package.json:15` — explicit Node suite membership; `test:ui` and `test:e2e` entry points.
- `vitest.config.ts:10` — rendered-test discovery and jsdom boundary.
- `playwright.config.ts:5` — browser test behavior and failure evidence policy.
- `scripts/run-e2e.mjs:9` — local-only E2E environment construction.
- `src/components/workouts/WorkoutCatalogueFilters.test.tsx:53` — canonical controlled rendered interaction.
- `e2e/responsive-navigation.spec.ts:11` — responsive interaction and selective visual checks.
- `context/foundation/test-plan.md:85` — frozen quality-gate contract and deliberate exclusions.

## Architecture Insights

The project uses a deliberately layered strategy: explicit Node contracts protect pure domain and boundary behavior;
Vitest protects controlled React rendering; Playwright protects SSR/hydration, browser lifecycle, responsive behavior,
and persistence seams; pgTAP protects database ownership and transaction semantics. CI is the integration point for those
layers. The cookbook must preserve this division so test assertions remain independent and business-visible rather than
mirroring implementation.

## Historical Context (from prior changes)

- `context/archive/2026-09-10-testing-high-signal-ui-contracts/plan.md` established deterministic Vitest/jsdom UI
  contracts with explicit fixtures and observable effects, while excluding network/timer/browser emulation.
- `context/changes/testing-responsive-navigation-and-user-journeys/plan.md` restricts Playwright to browser and state
  semantics, no arbitrary waits, Chromium-only execution, and two stable visual checks.
- `context/changes/testing-ai-response-and-draft-safety/plan.md` explicitly directs Phase 4 to rely on existing
  aggregate discovery and change CI/scripts only if research finds a genuine gap.

## Related Research

- `context/changes/testing-responsive-navigation-and-user-journeys/research.md` — browser lifecycle, responsive, and
  user-journey grounding.

## Open Questions

- Should Phase 4 add a lightweight discovery guard (for example, documented or tested expected suite membership) to make
  omissions from explicit Node scripts visible, or is the cookbook checklist sufficient?
- The local developer experience lacks one aggregate verification command. Decide whether to add a documented ordered
  sequence only, or a new convenience command that intentionally mirrors CI without duplicating its workflow.
