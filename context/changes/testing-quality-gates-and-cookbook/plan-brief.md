# Quality Gates and Testing Cookbook — Plan Brief

> Full plan: `context/changes/testing-quality-gates-and-cookbook/plan.md`
> Research: `context/changes/testing-quality-gates-and-cookbook/research.md`

## What & Why

This change closes a real CI omission: `src/lib/workout-api.test.ts` currently never runs because Node tests are
manually enumerated in package scripts. It also turns the completed UI, browser, and AI safety testing patterns into a
small, accurate cookbook so future changes use the right runner and remain discoverable.

## Starting Point

One CI job already runs Supabase, Node, Vitest, Playwright, Astro sync, lint, and Worker build gates. The gap is only
in Node’s hand-maintained file lists; the test plan and README have also fallen behind the checked-in harnesses.

## Desired End State

All direct `src/lib/*.test.ts` contracts run once in CI via `test:node`, including the request-size regression test.
Contributors have an accurate runner-selection guide and CI reference that explains local prerequisites without
inventing a brittle aggregate local command.

## Key Decisions Made

| Decision        | Choice                                      | Why                                                          | Source          |
| --------------- | ------------------------------------------- | ------------------------------------------------------------ | --------------- |
| Node discovery  | Add `test:node` and run it once in CI       | It closes the demonstrated omission automatically.           | Research / Plan |
| Focused scripts | Retain the existing domain scripts          | They remain useful for fast local diagnosis.                 | Plan            |
| Local workflow  | Document an ordered sequence; no `test:all` | Supabase and browser setup must remain explicit.             | Plan            |
| Cookbook        | Document all four runner boundaries         | A single selection guide prevents layer and discovery drift. | Research / Plan |

## Scope

**In scope:**

- Automatic direct Node-contract discovery and its CI gate.
- Accurate test-plan stack, gate map, and cookbook sections.
- README CI and local-safety documentation.

**Out of scope:**

- New testing infrastructure, a second workflow, coverage thresholds, application changes, or real-provider tests.

## Architecture / Approach

Node owns direct `src/lib/*.test.ts` contracts through the new aggregate command; Vitest continues to own rendered
`.test.tsx` behavior, Playwright browser/state seams, and Supabase database contracts. CI invokes each layer once;
documentation makes the boundaries and prerequisites explicit.

## Phases at a Glance

| Phase             | What it delivers                            | Key risk                                      |
| ----------------- | ------------------------------------------- | --------------------------------------------- |
| 1. Node discovery | Aggregate `test:node` CI gate               | Accidentally changing runner boundaries       |
| 2. Cookbook       | Accurate test-plan stack, map, and patterns | Documentation drift or scope expansion        |
| 3. CI docs        | README aligned to the workflow              | Misleading local setup or credential guidance |

**Prerequisites:** existing pnpm dependencies; local Supabase and `pnpm exec playwright install chromium` for
database/browser verification.
**Estimated effort:** ~1 focused session across 3 phases.

## Open Risks & Assumptions

- The Node test glob must include only direct `src/lib/*.test.ts` contracts; nested or differently named tests require
  an intentional future decision.
- CI step granularity becomes one Node gate, while focused scripts retain local diagnostic granularity.

## Success Criteria (Summary)

- CI discovers and runs the previously omitted Node request-parser test.
- Test-plan and README accurately match the shipped runner boundaries and CI gate order.
- No new runner, workflow, dependency, real-provider call, or committed credential is introduced.
