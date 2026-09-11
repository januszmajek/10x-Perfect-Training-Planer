# High-Signal UI Contracts — Plan Brief

> Full plan: `context/changes/testing-high-signal-ui-contracts/plan.md`

## What & Why

This change adds the project's first rendered React-component test suite for the workout catalogue and History cards. It addresses the risk that green pure-domain tests can still allow user-visible interaction and cross-page UI drift to ship.

## Starting Point

The repository has meaningful Node and database contracts, but no DOM, component, or browser test harness. React islands already expose controlled catalogue components and a local History-card detail interaction that can be tested without production changes or end-to-end infrastructure.

## Desired End State

`pnpm test:ui` is a required CI gate. Explicit fixtures prove that catalogue filters, cards, and ordering show the right visible behavior and that completed History cards reveal the saved prescription; the existing pure tests remain the source of truth for their domain calculations.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Test runner | Vitest + jsdom + Testing Library | It tests interactive React islands cleanly without replacing the Node contract runner. |
| CI timing | Enforce `test:ui` immediately | New UI contracts only prevent regressions when every PR and push runs them. |
| UI scope | Catalogue plus static History cards | This directly covers Risks #3 and #5 while leaving browser journeys bounded to Phase 2. |
| Test oracle | Explicit fixtures and visible outcomes | Production helpers must not determine the expected result they are meant to verify. |
| Accessibility | No automated accessibility coverage | The user explicitly excluded accessibility testing, so the rollout must not promise it. |
| Audit | Manual-builder and History-client suites only | It tests the relevant high-signal premise without turning the change into a whole-suite rewrite. |

## Scope

**In scope:**

- Vitest/jsdom UI harness, script, CI gate, and focused audit record.
- Rendered contracts for catalogue filters, panels/cards, recovery/order states, and History-card expansion.
- Test-rollout alignment that removes automated accessibility commitments.

**Out of scope:**

- Production changes; browser/E2E/visual/responsive/drawer tests; native dialogs; History networking/pagination.
- Accessibility scans or accessibility-specific assertions; broad legacy-test audit; database work.

## Architecture / Approach

The existing Node runner stays responsible for pure contracts. A separate Vitest/jsdom command renders only React TSX components with small fixed fixtures, drives visible interactions, and checks callback effects or visible output. CI runs this command alongside the current Node, database, lint, Astro sync, and Worker-build gates.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Policy, Harness, and Audit | Truthful strategy, UI runner, CI gate, bounded audit | Misconfigured alias/setup or advisory-only gate |
| 2. Catalogue Interactions | Filter, card, order, and no-match UI contracts | Tests mirror domain implementation |
| 3. History Card Behavior | Stable Show/Hide prescription contract | Async History scope expands unintentionally |

**Prerequisites:** A clean `pnpm install` after the dependency update; existing Node suites remain runnable.
**Estimated effort:** 2–3 implementation sessions across 3 phases.

## Open Risks & Assumptions

- Vitest config enables jsdom visual mode for the `requestAnimationFrame` used by the selected History mount; native dialogs and other browser-only APIs are deliberately not loaded.
- No automated accessibility coverage will exist after the strategy update; static lint and manual review remain outside this change's test contract.

## Success Criteria (Summary)

- `pnpm test:ui` passes locally and runs as a required CI step.
- Selected UI contracts fail for visible catalogue or History regressions while existing pure tests remain green.
- The implementation adds no production behavior, browser harness, or accessibility-specific automated tests.
