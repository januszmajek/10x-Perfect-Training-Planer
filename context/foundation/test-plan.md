# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-11

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   an area" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`.

## 2. Risk Map

Risks are ordered by impact × likelihood. Sources are evidence, not assumed code anchors.

| #   | Risk (failure scenario)                                                                                                                                  | Impact | Likelihood | Source (evidence — not anchor)                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | A core journey breaks across authentication, workout creation, editing, saving, completion, or History, leaving stale state or losing user work.         | High   | High       | PRD lines 37–45; interview Q2–Q4; archived navigation and auth Back-navigation changes                           |
| 2   | Mobile or desktop layouts make controls unreachable, obscure content, overflow, or behave differently at key breakpoints.                                | High   | High       | PRD lines 161–162; interview Q1–Q4; archived responsive corrections                                              |
| 3   | Tests pass while a user-visible regression ships because assertions mirror implementation or never exercise rendered behavior.                           | High   | Medium     | interview Q4; test-base profile; archived implementation-review fixes                                            |
| 4   | An AI response is accepted or displayed despite being malformed, incoherent, recovery-unsafe, preference-violating, or destructive to the current draft. | High   | Medium     | PRD lines 61–70 and 103–107; interview Q1 and Q4; archived AI rollout adaptations                                |
| 5   | Filters, cards, dialogs, and navigation patterns drift between pages, giving identical concepts different semantics or behavior.                         | Medium | High       | interview Q2–Q4; archived filtering/navigation changes; hot-spot dir `src/components/workouts/` (57 touches/30d) |
| 6   | A crafted request accesses or mutates another user's workouts, preferences, history, or key-related state.                                               | High   | Low        | PRD lines 53 and 156–160; archived ownership and concurrency changes                                             |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                  | Must challenge                                                             | Context `/10x-research` must ground                                                | Likely cheapest layer                                        | Anti-pattern to avoid                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| #1   | A user completes representative manual and AI journeys while navigation, Back/Forward, durable state, and unsaved state behave as specified. | Individually working pages imply the journey works.                        | Route sequence, session transitions, persisted versus volatile state, side effects | Focused e2e                                                  | Happy-path-only journeys; arbitrary waits         |
| #2   | At 360px and desktop widths, controls remain reachable, content does not overflow, drawers restore focus, and essential actions work.        | A successful build or desktop screenshot proves responsiveness.            | Breakpoints, overlay lifecycle, focus contract, critical viewports                 | Browser assertions plus selective deterministic visual diffs | Large brittle screenshot suites                   |
| #3   | Representative defects fail tests for business-visible reasons, with expected values derived from product contracts.                         | Test count and green CI imply strong protection.                           | Existing oracles, mocking boundaries, negative cases, rendered gaps                | Test audit plus targeted replacement                         | Assertions copied from production logic           |
| #4   | Invalid proposals are rejected before display/save, valid proposals satisfy independent workout rules, and failures preserve the draft.      | Schema-valid JSON is a valid workout.                                      | Provider boundary, server rules, error translation, draft and save lifecycle       | Contract and integration tests at the mocked provider edge   | Mirroring validators; one-fixture coverage        |
| #5   | Equivalent filter and card interactions obey one observable contract across Workout and History.                                             | Similar appearance proves shared behavior; shared code proves correctness. | Current ownership, semantic differences, reuse boundary, URL state, accessibility  | Rendered component integration                               | Snapshots; duplicated implementation mirrors      |
| #6   | Two-user and malformed-request scenarios fail closed without leaked data, secrets, or mutations.                                             | Authentication proves ownership; client validation protects the server.    | Ownership checks, request validation, error and logging boundary                   | Preserve database contracts plus targeted API integration    | Broad infrastructure testing; framework retesting |

## 3. Phased Rollout

Each phase opens its own change folder. Status values are orchestrator state.

| #   | Phase name                              | Goal (one line)                                                                                      | Risks covered     | Test types                               | Status        | Change folder                                   |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------- | ------------- | ----------------------------------------------- |
| 1   | High-signal UI contracts                | Establish trustworthy rendered behavior coverage for filters, cards, and shared interaction patterns | #3, #5            | test audit, component integration        | complete      | testing-high-signal-ui-contracts                |
| 2   | Responsive navigation and user journeys | Protect critical flows, navigation state, responsive layouts, drawers, and dialogs                   | #1, #2, #5        | focused e2e, deterministic visual checks | complete      | testing-responsive-navigation-and-user-journeys |
| 3   | AI response and draft safety            | Prove invalid provider output and failures cannot create unsafe workouts or destroy user work        | #4, #6            | contract, integration, targeted e2e      | complete      | testing-ai-response-and-draft-safety            |
| 4   | Quality gates and cookbook              | Wire the high-signal suites into CI and preserve canonical UI-testing patterns                       | #3, cross-cutting | CI gates, cookbook                       | change opened | testing-quality-gates-and-cookbook              |

## 4. Stack

| Layer                | Tool                   | Version         | Notes                                                                                                                                       |
| -------------------- | ---------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Node contracts       | Node test runner       | 22.14.0         | `pnpm test:node` discovers direct `src/lib/*.test.ts`; focused `test:*` Node scripts remain diagnostic subsets.                             |
| database contracts   | Supabase CLI / pgTAP   | 2.117.0         | Start and reset local Supabase, then run `pnpm exec supabase test db --local supabase/tests/database` and the explicit concurrency scripts. |
| rendered components  | Vitest / jsdom         | 4.1.11 / 28.1.0 | `pnpm test:ui` runs only `src/**/*.test.tsx` with the shared UI setup.                                                                      |
| browser journeys     | Playwright / Chromium  | 1.63.0          | `pnpm test:e2e` automatically discovers `e2e/`; it requires local Supabase and `pnpm exec playwright install chromium`.                     |
| deterministic visual | Playwright screenshots | 1.63.0          | Keep screenshots limited to stable, high-risk responsive surfaces; retain failure evidence in CI.                                           |

Test-base profile: **meaningful** — 23 direct Node contract files, four rendered-component files, five browser specs, and
database/explicit concurrency checks. The layers deliberately cover domain boundaries, controlled rendering, browser
lifecycle, and persistence without overlapping runner ownership.

**Stack grounding tools (current session):**

- Docs: Context7 — Astro 6.3.1 component-testing and Workers runtime-testing guidance checked; checked: 2026-09-10
- Search: web search available but not used because current official documentation was available through Context7; checked: 2026-09-10
- Runtime/browser: repository Vitest/jsdom and Playwright/Chromium harnesses are configured; checked: 2026-09-11
- Provider/platform: no provider MCP used; local manifests and configuration supplied sufficient rollout evidence; checked: 2026-09-10

## 5. Quality Gates

| Gate                                   | Local command or prerequisite                                                                                                      | CI ownership                     | Catches                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| database contracts                     | Running local Supabase; `pnpm exec supabase db reset --local`; database test directory plus the three explicit concurrency scripts | required                         | schema, pgTAP, ownership, and concurrency regressions                                      |
| Node contracts                         | `pnpm test:node` → `src/lib/*.test.ts`                                                                                             | required                         | pure domain, request, provider-edge, and client-contract regressions                       |
| rendered UI behavior                   | `pnpm test:ui` → `src/**/*.test.tsx` in jsdom                                                                                      | required                         | filter, card, dialog, and controlled interaction regressions                               |
| browser journeys and selective visuals | Running local Supabase; `pnpm exec playwright install chromium`; `pnpm test:e2e` → automatic `e2e/` discovery                      | required; failure-only artifacts | navigation, responsive, lifecycle, state-boundary, and stable high-risk visual regressions |
| type, style, and Worker build          | `pnpm astro sync`, `pnpm lint`, `pnpm build`                                                                                       | required                         | generated-type, syntax, type, SSR, lint, and build drift                                   |

## 6. Cookbook Patterns

### 6.1 Auditing or adding a behavior-level unit test

Use a direct Node contract test when behavior is independent of a rendered DOM, browser lifecycle, or database
transaction. Add it as `src/lib/<area>.test.ts`; `pnpm test:node` discovers that exact top-level `src/lib/*.test.ts`
boundary automatically. Use fixed fixtures and product rules to derive expected values independently of the code under
test. Cover one valid case and meaningful negative cases such as malformed input, unsafe values, stale tokens, or
missing headers. Keep focused `test:*` scripts for quick diagnosis, but rely on `test:node` for complete CI discovery.

### 6.2 Testing a filter, card, dialog, or local UI component

Use Vitest only for controlled component behavior at `src/**/*.test.tsx`. Render with fixed props or a tiny controlled
wrapper, interact through Testing Library's accessible roles and labels, and assert user-visible state plus callback
effects. For example, assert a reset button disappears after filters reset and the corresponding callback receives the
new value; do not derive expected output with production helpers. Browser navigation, viewport, persistence, and
hydration behavior belong in Playwright, not Vitest. A general automated accessibility scan is outside this rollout.

### 6.3 Testing a responsive navigation or user journey

Use Playwright for SSR/hydration, navigation, responsive layout, focus, scroll lock, durable state, and browser-only
recovery seams. Start local Supabase, run `pnpm exec playwright install chromium`, then run `pnpm test:e2e`; Playwright
automatically discovers specs under `e2e/`. Create isolated local users through the harness. Use role- or label-based
locators and wait for observable URLs, responses, or web-first assertions instead of sleeps. Keep visual assertions to
stable high-risk responsive surfaces; do not create a broad visual-snapshot suite.

### 6.4 Testing an AI response or provider failure

Use independent fixtures at the provider boundary; never derive expected validity from the production validator. Compose
mocked provider output with the production parser in Node tests, and keep a single authenticated Builder journey for
the rendered recovery seam. That journey starts from an edited manual draft, covers malformed JSON, structurally invalid
JSON, and a typed provider failure, then proves the visible alert, editable draft, and manual-save endpoint remain
intact. Keep pgTAP as the authority for ownership and rollback; do not duplicate it in browser attacks. Exclude real
provider calls and artificial generation deadlines.

### 6.5 Runner selection and discovery checklist

Choose one cheapest independent layer for each regression:

- **Domain, parser, or request contract:** add `src/lib/*.test.ts`; run `pnpm test:node`. Use a focused Node script
  only for diagnosis, not as the sole discovery boundary.
- **Filter, card, dialog, or local React behavior:** add `src/**/*.test.tsx`; run `pnpm test:ui` in jsdom with
  accessible user-visible assertions and callback effects.
- **Route, responsive, hydration, focus, persistence, or browser recovery behavior:** add an `e2e/` spec; start local
  Supabase, install Chromium with `pnpm exec playwright install chromium`, then run `pnpm test:e2e`.
- **Ownership, rollback, schema, or concurrency behavior:** use local Supabase and the explicit
  `supabase/tests/database` pgTAP command or relevant concurrency script.

Keep the AI-safety boundary in §6.4: no real-provider calls. Do not add browser emulation to Vitest, broad visual
suites, general accessibility scans, aggregate local orchestration, or duplicate database ownership tests in browser
flows.

## 7. What We Deliberately Don't Test

- **New infrastructure and deployment internals** — preserve existing database, security, build, and runtime gates, but spend new rollout budget on UI, UX, AI responses, and user journeys. Re-evaluate if the hosting or persistence architecture changes. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-11
- Stack versions last verified: 2026-09-11
- AI-native tool references last verified: 2026-09-10

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
