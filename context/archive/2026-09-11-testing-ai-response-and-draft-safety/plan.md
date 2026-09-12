# AI Response and Draft Safety Implementation Plan

## Overview

Add high-signal tests proving malformed or unsafe AI-provider output cannot reach a user or persistence, while a failed
generation cannot replace a usable workout draft. Add narrow request-boundary checks, but retain existing database
contracts as the source of truth for ownership, rollback, and no-mutation guarantees.

## Current State Analysis

The product already validates provider output at several layers. `ai-workout-contract.ts` enforces exact structure,
known catalogue IDs, unique exercises, prescription limits, count, and workout coverage before `ai-workouts.ts`
returns a proposal. The browser parses the result again and replaces its local draft only after a valid success.

The API applies origin, bounded JSON body, authentication, and exact request-shape checks before services run. Supabase
RLS/RPC contracts then enforce ownership. Existing pgTAP tests prove cross-owner AI save/proposal-linkage attempts roll
back without creating workout rows. Missing coverage is the composed raw-provider-to-parser path, actual route
rejections, and the rendered Builder failure state.

## Desired End State

CI rejects malformed, schema-valid-but-unsafe, and semantically invalid provider proposals before they are displayed or
saved. A failed AI-generation request leaves the visible draft and active proposal untouched, gives a safe retryable
message, and still permits ordinary editing and saving. Crafted generate/save requests return generic errors without
secrets or mutations, while pgTAP continues to prove the cross-user persistence boundary.

### Key Discoveries:

- `src/lib/ai-workout-contract.ts:76-166` owns provider-content validation beyond JSON Schema.
- `src/lib/ai-workouts.ts:176-384` validates provider content before returning a proposal, but tests currently stub the
  parser rather than compose raw provider content with the production parser.
- `src/components/workouts/WorkoutBuilder.tsx:129-168` preserves the draft after malformed and failed generation;
  there is no rendered test for this fetch → parser → state transition.
- `src/pages/api/workouts/ai/generate.ts:16-60` and `src/pages/api/workouts/ai/save.ts:6-50` enforce the same guard
  order: origin, body, authentication, request schema, service.
- `supabase/tests/database/ai_workout_mutation.test.sql:169-271` already proves cross-owner rollback and no partial
  AI-save/history-aware linkage mutation.

## What We're NOT Doing

- Introducing an artificial provider-generation timeout; the PRD requires retryable interruption without an imposed
  deadline.
- Replacing pgTAP/RLS/RPC ownership tests with browser scenarios.
- Adding a real-provider test, a broad route-test framework, testing dependencies, or new infrastructure.
- Changing streamed-request memory handling; this change tests only the existing 32 KiB semantic request limit.
- Changing product validation rules or AI behavior.

## Implementation Approach

Use the cheapest meaningful layer for each risk: Node contracts with independent fixtures for provider validity;
mocked-fetch service composition for raw content parsing; existing local Playwright for actual request guards and the
Builder's visible recovery state; and existing pgTAP for authorization and rollback. New tests must not calculate their
expected result by calling the production validator or filter being tested.

## Critical Implementation Details

The browser scenario must begin with a recognizable edited manual draft. After every failed generation response, it
must verify that exercise and prescription remain visible and that Save still calls the manual endpoint; a generic error
or internal state assertion is not sufficient.

## Phase 1: Specify and Compose AI Proposal Safety

### Overview

Make cold-start and history-aware proposal acceptance observable with independent test oracles and a composed
mocked-provider/production-parser test.

### Changes Required:

#### 1. Proposal contract matrix

**Files**: `src/lib/ai-workout-contract.test.ts`, `src/lib/openrouter-client.test.ts`

**Intent**: Cover the materially distinct ways provider content may be unsafe without copying validation branches.

**Contract**: Fixtures prove one coherent valid proposal and reject malformed JSON, unexpected keys, unknown or duplicate
catalogue IDs, non-integer/out-of-range prescriptions, invalid cold-start/reduced counts, missing required coverage,
and inconsistent history-aware metadata. OpenRouter tests retain the strict schema, bounded response wrapper, and
redacted error behavior without real credentials.

#### 2. Provider-to-service composition

**Files**: `src/lib/ai-workouts.test.ts`, `src/lib/ai-workout-contract.ts` (only if a small dependency seam is needed)

**Intent**: Prove raw mocked provider content cannot bypass the parser before the generation service exposes a proposal.

**Contract**: Combine controlled fetch output with the real OpenRouter client and real cold-start/history-aware parsers.
Malformed wrappers and schema-valid-but-domain-invalid content map to sanitized `invalid_output` and do not record or
save a proposal; a coherent fixture succeeds. Public failures never contain provider content, prompts, or credentials.

### Success Criteria:

#### Automated Verification:

- Contract cases cover valid output and every independent invalid-output class for both proposal modes.
- Composed service tests prove unsafe provider content fails before proposal persistence or save.
- `pnpm test:ai-workout` passes.

#### Manual Verification:

- Review the fixtures to confirm they state expected workout validity independently of production helpers.

**Implementation Note**: After automated checks pass, pause for human confirmation that the fixture oracle represents
the product's workout rules before proceeding.

---

## Phase 2: Verify AI API Rejection and Ownership Boundaries

### Overview

Exercise only the generate/save route guards that pure services cannot prove, and preserve database tests as the
authoritative ownership evidence.

### Changes Required:

#### 1. Narrow AI route checks

**Files**: `e2e/ai-safety.spec.ts` (new), `e2e/fixtures.ts`, `e2e/local-fixtures.ts`, `src/lib/workout-api.test.ts`
(new)

**Intent**: Test locally running AI routes using the established authenticated and unauthenticated Playwright contexts,
without introducing an Astro route-test harness.

**Contract**: Playwright route checks cover wrong origin, missing/invalid JSON media or body, declared over-32-KiB
payloads, unauthenticated context, and invalid command/save shape. `workout-api.test.ts` constructs a minimal request
without `Content-Length` to cover the `BODY_TOO_LARGE` actual-byte branch directly. All failures return the applicable
generic status, code, and request ID before their service runs, and expose no provider payload, credential, user ID,
proposal ID, or submitted request data.

#### 2. Retain database ownership and atomicity proof

**Files**: `supabase/tests/database/ai_workout_mutation.test.sql`,
`supabase/tests/database/ai_recommendation_feedback.test.sql`, `supabase/tests/database/ai_provider_keys.test.sql`

**Intent**: Preserve strong two-user and malformed-mutation evidence, extending it only for a concrete gap discovered
while implementing the request checks.

**Contract**: A second user cannot save against another user's plan, link another user's proposal, read an owner-scoped
credential, or leave partial workout/prescription rows after rejection. Do not duplicate these cases as browser attacks.

### Success Criteria:

#### Automated Verification:

- Targeted generate/save checks prove origin, auth, media/body, declared-size, and exact-schema guards fail closed.
- The direct request-parser test proves an oversized body without `Content-Length` fails with `BODY_TOO_LARGE`.
- Public failures contain only approved response fields and never secrets or submitted data.
- Existing AI mutation, feedback, and key ownership cases pass with no partial rows.
- `pnpm exec supabase test db --local supabase/tests/database` and `pnpm test:e2e -- ai-safety` pass.

#### Manual Verification:

- Confirm the route cases stop at request-boundary behavior and do not duplicate database authorization proof.

**Implementation Note**: After automated checks pass, pause for human confirmation that security coverage stays narrow
and pgTAP remains the ownership authority.

---

## Phase 3: Prove Rendered Draft Preservation

### Overview

Use state tests and one authenticated browser journey to prove failed AI generation never destroys or silently converts
an editable manual draft.

### Changes Required:

#### 1. Planner transition coverage

**Files**: `src/lib/ai-workout-planner-state.test.ts`, `src/lib/ai-workout-client.test.ts`

**Intent**: Cover every failed parsed response that the Builder can receive and explicitly preserve edited draft and
history-aware active-proposal metadata.

**Contract**: Null/malformed parsed responses, `invalid_output`, and provider failures retain the exact current draft
and proposal. Only a fully valid parsed success replaces the draft and changes its origin to AI.

#### 2. Authenticated Builder safety journey

**Files**: `e2e/ai-safety.spec.ts` (new), `e2e/workout-journeys.spec.ts` (only if shared setup is extracted)

**Intent**: Observe real browser generation fetch, response parsing, state update, alert, and save selection in a
compact deterministic scenario.

**Contract**: After adding a recognizable manual exercise, malformed JSON, structurally invalid JSON, and typed provider
failure each show the safe alert while that exercise and its prescription remain visible/editable. The next Save request
still targets the manual endpoint. A valid intercepted response replaces the draft only when it satisfies the public
generation response contract. Assertions use locators and response-driven waits, never sleeps or production helpers.

#### 3. Record the Phase 3 cookbook pattern

**Files**: `context/foundation/test-plan.md`

**Intent**: Replace the AI response/provider failure cookbook placeholder with the canonical project testing pattern.

**Contract**: Document independent fixtures, controlled provider boundaries, the one Builder recovery seam, retained
pgTAP authorization proof, and the exclusions of real-provider calls and artificial generation deadlines.

### Success Criteria:

#### Automated Verification:

- Planner-state tests prove every failed generation transition preserves the draft and active proposal.
- The browser scenario proves malformed/invalid/provider-failure generation preserves the manual draft and save route.
- `pnpm test:ai-workout`, `pnpm test:e2e -- ai-safety`, and `pnpm test:ui` pass.

#### Manual Verification:

- In local browser smoke testing, trigger a controlled generation failure from an edited manual draft and confirm its
  alert wording and controls remain usable.

**Implementation Note**: After automated checks pass, pause for human confirmation of the visible recovery behavior.

---

## Phase 4: Run Complete Regression Gates

### Overview

Confirm that Phase 3 uses existing local-Supabase, browser, and Worker-compatible CI commands rather than a parallel
quality gate.

### Changes Required:

#### 1. Test discovery and regression verification

**Files**: `package.json`, `.github/workflows/ci.yml`

**Intent**: Ensure new Node, browser, and database tests are discovered by the existing aggregate commands and CI job.

**Contract**: New Node tests run through `test:ai-workout`, the new browser spec runs through `test:e2e`, and database
contracts remain in the existing Supabase directory. Change scripts or CI only if discovery would otherwise be missed;
do not add dependencies or a separate pipeline.

### Success Criteria:

#### Automated Verification:

- `pnpm exec supabase test db --local supabase/tests/database` passes with local Supabase running.
- `pnpm test:ai-workout`, `pnpm test:ui`, `pnpm test:e2e`, `pnpm lint`, and `pnpm build` pass.

#### Manual Verification:

- Confirm CI discovers every Phase 3 suite and local tests require no committed secrets.

**Implementation Note**: After automated checks pass, pause for human confirmation of the local smoke test and CI
coverage before considering the change complete.

## Testing Strategy

### Unit Tests:

- Use an explicit catalogue/coverage fixture to distinguish valid, malformed, structurally invalid, and semantically
  unsafe proposals.
- Test mocked-fetch provider/service composition, redacted errors, request-size/public-error helpers, and planner
  transition preservation.

### Integration Tests:

- Use local Playwright request contexts for generate/save guards and the existing Supabase pgTAP suite for RLS, RPC,
  ownership, rollback, and no-partial-mutation contracts.

### Manual Testing Steps:

1. Start local Supabase through the existing browser harness.
2. Create an account, add and edit a manual draft, then trigger controlled invalid-output and provider-failure cases.
3. Confirm the safe alert appears, the original draft remains editable, and Save follows the manual-workout path.
4. Trigger a valid controlled proposal and confirm only it may replace the draft.

## Performance Considerations

No production runtime behavior changes. Tests enforce the current 32 KiB semantic request limit but do not claim to
solve streaming allocation when a request omits a trustworthy length.

## Migration Notes

No migration is planned. Reuse existing local Supabase fixtures, RLS policies, RPCs, and database suites.

## References

- Change scope: `context/changes/testing-ai-response-and-draft-safety/change.md`
- Test strategy: `context/foundation/test-plan.md:41-64,89-93,110-112`
- Provider validation: `src/lib/ai-workout-contract.ts:29-166`
- Generation orchestration: `src/lib/ai-workouts.ts:176-384`
- Request guards: `src/lib/workout-api.ts:4-124`
- Draft state: `src/lib/ai-workout-planner-state.ts:26-65`
- Builder: `src/components/workouts/WorkoutBuilder.tsx:129-259`
- Browser fixture pattern: `e2e/fixtures.ts:11-27`, `e2e/workout-journeys.spec.ts:57-115`
- Ownership rollback proof: `supabase/tests/database/ai_workout_mutation.test.sql:169-271`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Specify and Compose AI Proposal Safety

#### Automated

- [x] 1.1 Cover independent valid and invalid provider proposal classes. — 0f16b12
- [x] 1.2 Compose mocked provider responses with production parser and generation service. — 0f16b12
- [x] 1.3 Run the AI workout contract suite. — 0f16b12

#### Manual

- [x] 1.4 Review the independent proposal fixture oracle. — 0f16b12

### Phase 2: Verify AI API Rejection and Ownership Boundaries

#### Automated

- [x] 2.1 Prove AI generate/save request guards and the actual-byte body limit fail closed with safe public responses. — 6653023
- [x] 2.2 Preserve and extend only concrete database ownership and atomicity gaps. — 6653023
- [x] 2.3 Run the local database and targeted AI-safety browser checks. — 6653023

#### Manual

- [x] 2.4 Confirm route checks do not duplicate database ownership contracts. — 6653023

### Phase 3: Prove Rendered Draft Preservation

#### Automated

- [x] 3.1 Cover failed planner transitions and valid replacement transitions. — e30749b
- [x] 3.2 Prove failed generation preserves an editable manual draft in the browser. — e30749b
- [x] 3.3 Record the Phase 3 AI-safety cookbook pattern. — e30749b
- [x] 3.4 Run AI, UI, and targeted browser suites. — e30749b

#### Manual

- [x] 3.5 Confirm controlled generation failures preserve a usable draft in the browser. — e30749b

### Phase 4: Run Complete Regression Gates

#### Automated

- [x] 4.1 Verify test discovery through the existing local and CI commands. — 16cac3e
- [x] 4.2 Run database, AI, UI, browser, lint, and Worker build gates. — 16cac3e

#### Manual

- [x] 4.3 Confirm CI coverage and secret-free local test setup. — 16cac3e
