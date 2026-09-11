# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-10

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   an area" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`.

## 2. Risk Map

Risks are ordered by impact × likelihood. Sources are evidence, not assumed code anchors.

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | A core journey breaks across authentication, workout creation, editing, saving, completion, or History, leaving stale state or losing user work. | High | High | PRD lines 37–45; interview Q2–Q4; archived navigation and auth Back-navigation changes |
| 2 | Mobile or desktop layouts make controls unreachable, obscure content, overflow, or behave differently at key breakpoints. | High | High | PRD lines 161–162; interview Q1–Q4; archived responsive corrections |
| 3 | Tests pass while a user-visible regression ships because assertions mirror implementation or never exercise rendered behavior. | High | Medium | interview Q4; test-base profile; archived implementation-review fixes |
| 4 | An AI response is accepted or displayed despite being malformed, incoherent, recovery-unsafe, preference-violating, or destructive to the current draft. | High | Medium | PRD lines 61–70 and 103–107; interview Q1 and Q4; archived AI rollout adaptations |
| 5 | Filters, cards, dialogs, and navigation patterns drift between pages, giving identical concepts different semantics or behavior. | Medium | High | interview Q2–Q4; archived filtering/navigation changes; hot-spot dir `src/components/workouts/` (57 touches/30d) |
| 6 | A crafted request accesses or mutates another user's workouts, preferences, history, or key-related state. | High | Low | PRD lines 53 and 156–160; archived ownership and concurrency changes |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | A user completes representative manual and AI journeys while navigation, Back/Forward, durable state, and unsaved state behave as specified. | Individually working pages imply the journey works. | Route sequence, session transitions, persisted versus volatile state, side effects | Focused e2e | Happy-path-only journeys; arbitrary waits |
| #2 | At 360px and desktop widths, controls remain reachable, content does not overflow, drawers restore focus, and essential actions work. | A successful build or desktop screenshot proves responsiveness. | Breakpoints, overlay lifecycle, focus contract, critical viewports | Browser assertions plus selective deterministic visual diffs | Large brittle screenshot suites |
| #3 | Representative defects fail tests for business-visible reasons, with expected values derived from product contracts. | Test count and green CI imply strong protection. | Existing oracles, mocking boundaries, negative cases, rendered gaps | Test audit plus targeted replacement | Assertions copied from production logic |
| #4 | Invalid proposals are rejected before display/save, valid proposals satisfy independent workout rules, and failures preserve the draft. | Schema-valid JSON is a valid workout. | Provider boundary, server rules, error translation, draft and save lifecycle | Contract and integration tests at the mocked provider edge | Mirroring validators; one-fixture coverage |
| #5 | Equivalent filter and card interactions obey one observable contract across Workout and History. | Similar appearance proves shared behavior; shared code proves correctness. | Current ownership, semantic differences, reuse boundary, URL state, accessibility | Rendered component integration | Snapshots; duplicated implementation mirrors |
| #6 | Two-user and malformed-request scenarios fail closed without leaked data, secrets, or mutations. | Authentication proves ownership; client validation protects the server. | Ownership checks, request validation, error and logging boundary | Preserve database contracts plus targeted API integration | Broad infrastructure testing; framework retesting |

## 3. Phased Rollout

Each phase opens its own change folder. Status values are orchestrator state.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | High-signal UI contracts | Establish trustworthy rendered behavior coverage for filters, cards, and shared interaction patterns | #3, #5 | test audit, component integration | complete | testing-high-signal-ui-contracts |
| 2 | Responsive navigation and user journeys | Protect critical flows, navigation state, responsive layouts, drawers, and dialogs | #1, #2, #5 | focused e2e, deterministic visual checks | complete | testing-responsive-navigation-and-user-journeys |
| 3 | AI response and draft safety | Prove invalid provider output and failures cannot create unsafe workouts or destroy user work | #4, #6 | contract, integration, targeted e2e | change opened | testing-ai-response-and-draft-safety |
| 4 | Quality gates and cookbook | Wire the high-signal suites into CI and preserve canonical UI-testing patterns | #3, cross-cutting | CI gates, cookbook | not started | — |

## 4. Stack

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Node test runner | 22.14.0 | Existing TypeScript contract tests; audit signal in Phase 1 |
| database contracts | Supabase CLI / pgTAP | 2.117.0 | Existing suite is preserved; no infrastructure expansion |
| rendered components | none yet — see Phase 1 | — | Select only after research verifies Astro/React boundaries |
| e2e | none yet — see Phase 2 | — | Browser journeys and responsive behavior |
| deterministic visual | none yet — see Phase 2 | — | Limit to stable, high-risk responsive surfaces |

Test-base profile: **meaningful** — 22 TypeScript test files and 12 Supabase database/concurrency tests, concentrated in domain and persistence behavior; no rendered-component or browser harness.

**Stack grounding tools (current session):**
- Docs: Context7 — Astro 6.3.1 component-testing and Workers runtime-testing guidance checked; checked: 2026-09-10
- Search: web search available but not used because current official documentation was available through Context7; checked: 2026-09-10
- Runtime/browser: browser automation available for verification, but no repository Playwright harness exists; checked: 2026-09-10
- Provider/platform: no provider MCP used; local manifests and configuration supplied sufficient rollout evidence; checked: 2026-09-10

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + Astro sync + Worker build | local + CI | required | syntax, type, SSR, and build drift |
| existing Node and database suites | local + CI | required | domain, persistence, ownership, and concurrency regressions |
| rendered UI behavior | local + CI | required after §3 Phase 1 | filter, card, and interaction regressions; automated accessibility coverage is outside this rollout |
| critical browser journeys | CI on PR | required after §3 Phase 2 | navigation, responsive, lifecycle, and state-boundary failures |
| AI response integration | local + CI | required after §3 Phase 3 | unsafe output, error recovery, and draft-loss regressions |
| selective deterministic visual checks | CI on PR | required after §3 Phase 2 | stable layout and responsive rendering regressions |

## 6. Cookbook Patterns

### 6.1 Auditing or adding a behavior-level unit test

TBD — see §3 Phase 1 for independent oracles and high-signal negative cases.

### 6.2 Testing a filter, card, dialog, or local UI component

TBD — see §3 Phase 1 for rendered behavior patterns. Automated accessibility coverage is outside this rollout.

### 6.3 Testing a responsive navigation or user journey

TBD — see §3 Phase 2 for viewport, Back/Forward, drawer, dialog, and state-lifecycle patterns.

### 6.4 Testing an AI response or provider failure

Use independent fixtures at the provider boundary; never derive expected validity from the production validator. Compose
mocked provider output with the production parser in Node tests, and keep a single authenticated Builder journey for
the rendered recovery seam. That journey starts from an edited manual draft, covers malformed JSON, structurally invalid
JSON, and a typed provider failure, then proves the visible alert, editable draft, and manual-save endpoint remain
intact. Keep pgTAP as the authority for ownership and rollback; do not duplicate it in browser attacks. Exclude real
provider calls and artificial generation deadlines.

### 6.5 Per-rollout-phase notes

Phase 3: AI response and draft safety uses contract fixtures for proposal validity, controlled provider responses for
service composition, and one browser recovery journey for the state-to-render boundary. This keeps failures retryable
without broad endpoint harnesses or real-provider dependencies.

## 7. What We Deliberately Don't Test

- **New infrastructure and deployment internals** — preserve existing database, security, build, and runtime gates, but spend new rollout budget on UI, UX, AI responses, and user journeys. Re-evaluate if the hosting or persistence architecture changes. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-10
- Stack versions last verified: 2026-09-10
- AI-native tool references last verified: 2026-09-10

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
