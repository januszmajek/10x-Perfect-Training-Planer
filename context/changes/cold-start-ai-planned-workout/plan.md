# Cold-start AI Planned Workout Implementation Plan

## Overview

Implement roadmap slice S-07: an authenticated user with no completed workout history can explicitly generate a
balanced full-body workout through OpenRouter, re-roll it, edit the unsaved proposal with the existing workout editor,
and save it as an AI-origin planned workout. The same user-facing generation entry point and server boundary must be
extendable by S-08, but this change stops at a typed eligibility response when completed history exists.

## Current State Analysis

The application already has a complete manual planning lifecycle, canonical exercise catalogue, recovery-aware manual
builder, optimistic planned-workout replacement, and encrypted OpenRouter credential storage. It has no provider client,
AI generation endpoint, generated-output parser, or supported persistence path that creates `origin = 'ai'` workouts.
The catalogue also has no canonical push/pull movement metadata, so the database cannot yet support deterministic
balanced-starter validation without a small taxonomy extension.

The shared editor is controlled by its parent and can therefore receive an AI-generated draft without duplicating
catalogue filtering, exercise replacement, ordering, or sets/reps editing. Existing planned-workout readers, editing,
completion, and history surfaces already accept and preserve AI provenance.

## Desired End State

From the shared workout-planning entry point, an eligible user explicitly requests an AI workout and receives a 5–7
exercise balanced full-body proposal within the product's 10-second end-to-end target. The proposal stays in browser
state until Save, can be re-rolled or edited, and is persisted atomically as `origin = 'ai'` only after confirmation.

Users without a usable OpenRouter credential receive a clear route to account configuration and the existing manual
builder. Users with completed history receive a stable S-08-not-available response; S-07 neither ignores that history
nor implements history-aware generation. Provider failures preserve any existing unsaved proposal and offer the right
retry, configuration, or manual fallback action without leaking provider responses or credentials.

### Key Discoveries:

- Roadmap S-07 explicitly ends at cold-start generation and leaves history-aware behavior to S-08
  (`context/foundation/roadmap.md:169`, `context/foundation/roadmap.md:183`).
- Server-only credential decryption already exposes typed missing, persistence, and encryption failures
  (`src/lib/ai-provider-keys.ts:152`).
- The existing draft contract allows 1–20 unique canonical exercises, sets 1–99, and reps 1–999
  (`src/lib/manual-workout-builder.ts:168`).
- `WorkoutDraftEditor` is a reusable controlled editor for a supplied catalogue and draft
  (`src/components/workouts/WorkoutDraftEditor.tsx:17`).
- Manual saving cannot be reused unchanged because its database function derives `origin = 'manual'`
  (`supabase/migrations/20260902120000_create_planned_workout_mutations.sql:182`).
- The catalogue stores muscle category and muscle roles but no push/pull movement classification
  (`supabase/migrations/20260820090000_create_exercise_catalogue.sql:1`).
- The existing API boundary provides authentication, same-origin enforcement, strict JSON parsing, request IDs, and
  payload-free diagnostics (`src/lib/workout-api.ts:4`).
- OpenRouter structured outputs use `response_format.type = 'json_schema'`, but support varies by model; S-07 therefore
  needs one fixed, server-configured compatible model rather than a browser-selected model.

## What We're NOT Doing

- No history-aware prompt construction, recovery-aware AI selection, or recent-workout context; those belong to S-08.
- No cold-start generation for users who already have completed history.
- No user-selectable provider or model; OpenRouter remains the sole provider and the model is server-configured.
- No automatic generation on page load, automatic provider retries, background jobs, streaming, or server-persisted
  proposal drafts.
- No unrelated exercise-catalogue expansion, recovery-policy changes, workout lifecycle redesign, or AI-key table
  redesign; the only catalogue change is curated push/pull metadata needed by the starter contract.
- No custom exercise generation, new exercises, editable muscle tags, weights, RIR, or volume-aware programming.
- No provider key, raw provider response, prompt, workout payload, or user identifier in logs.
- No live OpenRouter call in CI and no new database concurrency test suite, per the selected verification boundary.
- No modification or cleanup of `context/changes/old-start-ai-planned-workout/`.

## Implementation Approach

Use native Worker `fetch` from a server-only OpenRouter client with a fixed model read from server configuration and an
abort deadline below 10 seconds. Request a strict JSON-schema response containing only catalogue exercise IDs and
integer sets/reps. Serialize catalogue context deterministically and reject generation before the provider call when it
exceeds a 64 KiB UTF-8 budget; do not truncate or sample exercises because that would silently bias the proposal. Keep
prompt construction, provider transport, response parsing, eligibility, and final proposal validation as separable
services so mocked tests can cover every failure without real credentials.

The generation API will authenticate the user, verify same origin, confirm lifetime completed-history count is zero,
decrypt the owned credential, load the canonical catalogue, and request a proposal. It will then independently enforce
the 5–7 exercise full-body contract and the existing draft constraints before returning browser-safe data. Re-roll is
the same generation request and only replaces the ephemeral client proposal after a successful response.

Saving uses a dedicated authenticated SQL function and application service that mirror the established manual save
transaction, advisory-lock ordering, catalogue validation, and expected ID/revision replacement protocol while deriving
`origin = 'ai'`. For this MVP, that value means the workout was saved through the authenticated AI-assisted route; it
is route provenance, not cryptographic attestation that every exercise was model-selected. The existing editor and
planned-workout refresh logic remain the shared lifecycle after generation.

## Critical Implementation Details

### Timing & lifecycle

The provider abort deadline must leave time inside the 10-second end-to-end target for authentication, catalogue reads,
parsing, validation, response transfer, and UI rendering. A failed re-roll must not clear or mutate the last successful
proposal; only a validated replacement may update proposal state.

### State sequencing

Cold-start eligibility is based on the existence of any completed workout, not on whether a workout falls inside the
current recovery window. Eligibility, catalogue loading, and credential use are server-authoritative and must be checked
for every generation request so a stale browser cannot bypass the S-07/S-08 boundary.

### Debug & observability

Generation diagnostics should record only request ID, stable operation, sanitized outcome, and elapsed duration. Never
record the Authorization header, decrypted key, prompt, provider body, generated prescription, or account/workout IDs.

## Phase 1: Cold-Start Generation Contracts and Provider Client

### Overview

Establish the server configuration, pure proposal contracts, strict parser/validator, prompt builder, and bounded
OpenRouter transport independently of routes and UI.

### Changes Required:

#### 1. Server configuration contract

**Files**: `astro.config.mjs`, `.env.example` (new)

**Intent**: Add a server-only fixed OpenRouter model setting and document its local/Worker configuration without
introducing a provider key into environment configuration.

**Contract**: `OPENROUTER_MODEL` is required by generation at runtime, is never accepted from a browser request, and
must refer to a model compatible with OpenRouter strict structured output. Astro generates its server-environment types
from the schema in `astro.config.mjs`; `src/env.d.ts` remains limited to application locals.

#### 2. Canonical movement-pattern metadata

**Files**: `supabase/migrations/<timestamp>_add_exercise_movement_pattern.sql`,
`supabase/tests/database/catalogue.test.sql`, `src/types/database.types.ts`, `src/lib/planned-workouts.ts`,
`src/lib/manual-workout-builder.ts`, `src/lib/manual-workouts.test.ts`, `src/lib/manual-workout-builder.test.ts`,
`src/lib/recovery-aware-catalogue.test.ts`, `docs/reference/contract-surfaces.md`

**Intent**: Store the curated push/pull assignment with each seeded exercise so neither the model nor application code
infers movement pattern from names or muscle tags.

**Contract**: Add a nullable database movement-pattern field backed by a `push | pull` enum. Seeded exercises that
qualify as upper-body push or pull movements receive an explicit value; lower-body, core, isolation, and genuinely
unclassified movements remain null. Catalogue reads and the shared `CatalogueExercise` contract expose this field plus
each muscle's canonical category, authenticated users cannot mutate either taxonomy, and generated types, fixtures,
catalogue contract tests, and the contract registry record the additions. The forward migration updates existing seeded
rows by stable slug; it does not edit the historical seed migration.

#### 3. Proposal domain and validation

**Files**: `src/lib/ai-workout-contract.ts`, `src/lib/ai-workout-contract.test.ts`

**Intent**: Define the browser-safe generated proposal and validate untrusted provider output against both the shared
draft rules and the cold-start full-body definition.

**Contract**: A valid proposal contains 5–7 unique canonical exercise IDs with integer sets/reps within existing bounds.
It includes at least one exercise whose primary muscle category is lower body, one upper-body exercise whose database
movement pattern is `push`, one upper-body exercise whose database movement pattern is `pull`, and one whose primary
muscle category is core. Unknown IDs, duplicates, extra fields, malformed JSON, missing coverage, and out-of-range
values are rejected.

#### 4. Prompt construction

**Files**: `src/lib/ai-workout-prompt.ts`, `src/lib/ai-workout-prompt.test.ts`

**Intent**: Produce a deterministic cold-start request from the canonical catalogue while minimizing disclosed data.

**Contract**: The prompt contains catalogue IDs, names, equipment, database movement pattern, and canonical muscle tags
plus the balanced-starter rules. It contains no user, workout, credential, timestamp, or history data and requires only
the strict prescription schema in response. Deterministic UTF-8 serialization is capped at 64 KiB; an oversized context
returns `catalogue_context_too_large` before any provider request rather than truncating the catalogue.

#### 5. OpenRouter transport

**Files**: `src/lib/openrouter-client.ts`, `src/lib/openrouter-client.test.ts`

**Intent**: Encapsulate the non-streaming provider call, deadline, bounded response parsing, and sanitized failure map
behind an injectable fetch boundary.

**Contract**: POST `https://openrouter.ai/api/v1/chat/completions` with Bearer authentication, the fixed model, and
strict JSON-schema response format. Return typed outcomes for invalid credential, rate limit, timeout, temporary provider
failure, network failure, oversized/malformed response, and schema-invalid completion; never return raw provider bodies.

#### 6. Test command

**File**: `package.json`

**Intent**: Provide a deterministic Node test command for all AI-generation unit tests without a live provider call.

**Contract**: Add `test:ai-workout` using the repository's existing TypeScript Node-test convention.

### Success Criteria:

#### Automated Verification:

- AI contract, prompt, and provider-client tests pass with `pnpm test:ai-workout`.
- The catalogue migration and updated catalogue contract tests pass in the local database suite.
- Maximum-size prompt tests prove the 64 KiB input budget and no-call oversize behavior.
- Existing crypto tests pass with `pnpm test:crypto`.
- Static lint passes with `pnpm lint`.

#### Manual Verification:

- The documented model configuration is understandable and contains no secret or real provider key.
- Logged mocked failures contain no prompt, proposal, credential, provider body, or user data.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual
confirmation before proceeding.

---

## Phase 2: Cold-Start Eligibility and Generation API

### Overview

Compose authentication, lifetime-history eligibility, canonical catalogue loading, owned credential decryption, provider
generation, final validation, and safe API responses into the S-07 server boundary.

### Changes Required:

#### 1. Cold-start eligibility query

**Files**: `src/lib/planned-workouts.ts`, `src/lib/ai-workouts.ts`, `src/lib/ai-workouts.test.ts`

**Intent**: Detect whether the authenticated owner has ever completed a workout without loading history content or
mistaking an empty recent-recovery window for cold start.

**Contract**: Return eligible only when no owner-scoped `workouts` row with `status = 'completed'` exists. A user with
any completed row receives a typed `history_aware_not_available` result reserved for S-08.

#### 2. Generation orchestration

**Files**: `src/lib/ai-workouts.ts`, `src/lib/ai-workouts.test.ts`

**Intent**: Coordinate the eligibility check, catalogue load, credential decryption, prompt creation, provider call,
strict parsing, and independent domain validation.

**Contract**: No provider call occurs for unauthenticated, history-bearing, missing-key, encryption-unavailable, or
catalogue-failure outcomes. Successful data contains only the validated draft and non-sensitive proposal metadata.

#### 3. API error and observability contract

**Files**: `src/lib/workout-api.ts`, `src/lib/ai-workout-api.ts`, `src/lib/ai-workout-client.ts`,
`src/lib/ai-workout-client.test.ts`

**Intent**: Add request-ID responses with stable AI-generation codes and client parsing without widening the global
workout persistence error union.

**Contract**: Add generation/save operation names to the shared operation union, but define a separate
`AiGenerationErrorCode` and AI-specific exhaustive HTTP-status mapper. Browser-safe codes cover key configuration, key
rejection, rate limiting, timeout, provider unavailability, invalid output, oversized catalogue context, missing model
configuration, and S-08 eligibility. AI diagnostics include elapsed time and reuse the request ID without forcing
AI-only codes into manual-workout UI message maps.

#### 4. Generation route

**File**: `src/pages/api/workouts/ai/generate.ts`

**Intent**: Expose an authenticated, same-origin POST endpoint for initial generation and re-roll.

**Contract**: Accept only a strict empty/versioned JSON command, enforce the established body-size and content-type
rules, and return the same validated proposal shape for both initial generation and re-roll. Never accept a model,
provider URL, provider key, catalogue, history, or workout prescription from the client.

### Success Criteria:

#### Automated Verification:

- AI service and client-parser tests pass with `pnpm test:ai-workout`.
- Tests prove history-bearing users do not trigger provider calls.
- Tests cover missing/corrupt/rejected keys, rate limits, timeout, provider failures, invalid output, and success.
- Existing manual, planned-workout, and history tests pass with `pnpm test:manual-workout`,
  `pnpm test:planned-workout`, and `pnpm test:history`.
- Static lint and production build pass with `pnpm lint` and `pnpm build`.

#### Manual Verification:

- API failure responses and logs reveal no credential, prompt, proposal, raw history, provider response, or identifiers.
- A user with completed history receives the S-08-not-available response and no cold-start proposal.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual
confirmation before proceeding.

---

## Phase 3: Atomic AI-Origin Planned-Workout Saving

### Overview

Add the supported persistence path for an edited AI proposal while retaining all established one-plan, ownership,
validation, confirmation, and stale-write guarantees.

### Changes Required:

#### 1. AI save database function

**Files**: `supabase/migrations/<timestamp>_create_ai_workout_mutation.sql`, `src/types/database.types.ts`,
`supabase/tests/database/ai_workout_mutation.test.sql`, `docs/reference/contract-surfaces.md`

**Intent**: Create an authenticated atomic save operation for AI-origin plans without weakening or changing the manual
save contract.

**Contract**: Add `save_ai_planned_workout` with the same prescription JSON, expected workout ID/revision, replacement
flags, advisory-lock namespace, lock ordering, catalogue validation, and transactional outcomes as manual save. Derive
owner, status, positions, timestamps, and `origin = 'ai'` server-side; expose execution only to `authenticated`. Add
direct pgTAP coverage for the signature, empty `search_path`, privileges, malformed/duplicate/unknown exercises,
derived fields, confirmation and stale-CAS outcomes, transactional rollback, completed-history preservation, and
cross-owner and unauthenticated isolation. No new concurrency shell suite is required.

#### 2. AI save service

**Files**: `src/lib/ai-workouts.ts`, `src/lib/ai-workouts.test.ts`

**Intent**: Validate the edited browser draft against canonical catalogue membership and translate database outcomes
into the established confirmation, stale-plan, validation, authentication, and persistence codes.

**Contract**: Accept the same versioned save shape used by the manual controller, call only the AI save function, and
never trust generation as proof that an edited draft is still valid. `origin = 'ai'` records that the authenticated user
saved through this AI-assisted route; it does not attest that the submitted exercise list is identical to a generated
proposal, because editing is intentionally unrestricted within canonical draft validation.

#### 3. AI save route

**File**: `src/pages/api/workouts/ai/save.ts`

**Intent**: Expose safe AI-origin persistence separately from generation while reusing the shared workout API boundary.

**Contract**: Authenticated same-origin JSON POST with strict request parsing, request ID, atomic first-save/replacement,
and the same `confirmation_required` and `stale_plan` browser contract as manual saving.

### Success Criteria:

#### Automated Verification:

- AI save service and route-boundary tests pass with `pnpm test:ai-workout` using mocked database/provider boundaries.
- A clean local Supabase migration run succeeds with `pnpm exec supabase db reset`.
- Generated database types contain the new AI save function and format cleanly.
- AI save pgTAP contract tests cover security, validation, CAS outcomes, rollback, ownership, and AI provenance.
- Existing database suite passes with `pnpm exec supabase test db --local supabase/tests/database`.
- Existing manual and planned-workout tests pass with `pnpm test:manual-workout` and `pnpm test:planned-workout`.
- Static lint and production build pass with `pnpm lint` and `pnpm build`.

#### Manual Verification:

- First save creates exactly one editable planned workout labeled as AI-generated.
- Replacement confirmation preserves the existing plan until the user explicitly confirms.
- A stale expected ID/revision refreshes authoritative state without silently replacing another plan.

**Implementation Note**: No new database concurrency tests are required by the selected verification boundary. After
automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 4: Shared AI Planning Interface

### Overview

Deliver the explicit generate, re-roll, edit, save, configuration, manual-fallback, and S-08 handoff experience on
mobile and desktop using the established draft editor and planned-workout conflict behavior.

### Changes Required:

#### 1. AI planner page data

**Files**: `src/pages/workouts/ai.astro`, `src/lib/ai-workouts.ts`

**Intent**: Render the shared AI planning shell with canonical catalogue, current planned workout, masked key
availability, and cold-start eligibility while keeping credential plaintext server-only.

**Contract**: Page props may contain only catalogue data, current plan, masked/configured status, and eligibility; they
must never contain decrypted credentials or raw history. The page supports viewports at least 360px wide.

#### 2. AI planner controller

**Files**: `src/components/workouts/AiWorkoutPlanner.tsx`, `src/components/workouts/WorkoutDraftEditor.tsx`,
`src/components/workouts/ManualWorkoutBuilder.tsx`, `src/components/workouts/PlannedWorkoutEditor.tsx`,
`src/lib/planned-workout-client.ts`, `src/lib/planned-workout-conflict.ts`,
`src/lib/planned-workout-conflict.test.ts`

**Intent**: Manage generation and save state around the shared controlled editor without duplicating its catalogue and
draft interactions.

**Contract**: Explicit Generate initiates the first request; Re-roll requests a replacement but preserves the current
proposal on failure; edit actions affect only ephemeral state; Save follows expected ID/revision confirmation; pending
operations prevent duplicate submissions. Initial generation, re-roll, and save errors remain distinct. Reuse or make a
narrow extraction of the existing manual replacement-confirmation and planned-editor stale-refresh transitions through
a pure conflict-transition helper; do not create a third divergent conflict protocol. The shared contract distinguishes
first-save collision from stale replacement and covers refresh success, missing latest plan, refresh failure, overwrite
with the refreshed ID/revision, load-latest, and preservation of the local draft and request ID. Controllers retain
their existing presentation-specific dialog behavior.

#### 3. Typed recovery actions

**File**: `src/components/workouts/AiWorkoutPlanner.tsx`

**Intent**: Give each safe failure class an actionable next step while retaining the last valid proposal.

**Contract**: Missing or rejected credential links to `/account`; rate limit, timeout, and temporary provider failures
offer Retry; all failures offer `/workouts/new`; history-bearing users see that personalized AI planning is reserved for
the next slice rather than receiving a misleading cold-start result.

#### 4. Entry points and success messaging

**Files**: `src/pages/dashboard.astro`, `src/layouts/AuthenticatedLayout.astro`

**Intent**: Add the shared “Generate workout” entry point and make AI-save completion understandable without weakening
the existing manual path.

**Contract**: The dashboard exposes AI and manual planning actions. Successful AI save redirects to the dashboard using
a distinct safe status and the existing summary displays `origin = 'ai'` correctly.

### Success Criteria:

#### Automated Verification:

- AI UI state/helper and shared conflict-transition tests pass with `pnpm test:ai-workout`.
- Existing workout client and lifecycle suites pass with `pnpm test:manual-workout`, `pnpm test:planned-workout`, and
  `pnpm test:history`.
- Static lint and production build pass with `pnpm lint` and `pnpm build`.

#### Manual Verification:

- At 360px and desktop widths, an eligible user can generate, edit, re-roll, save, and confirm replacement without
  clipped controls, lost focus, or unintended horizontal scrolling.
- Re-roll failure preserves the previous proposal and its user edits until a later successful re-roll replaces it.
- Missing/rejected key, timeout/rate-limit/provider failure, and manual fallback actions lead to the expected recovery
  path without exposing technical details.
- A history-bearing user reaches the same Generate entry point but receives the S-08 handoff state, not a cold-start
  proposal.
- An AI-saved plan remains editable, completable, and visible in history through the existing lifecycle.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual
confirmation before proceeding.

---

## Phase 5: End-to-End Verification and Documentation

### Overview

Verify the complete S-07 boundary in the Worker runtime, document its operational requirements, and confirm that S-08
can extend the same entry point without rewriting the completed flow.

### Changes Required:

#### 1. Configuration and operational documentation

**Files**: `README.md`, `context/deployment/deployment-plan.md`

**Intent**: Document the fixed model setting, Worker secret prerequisite, safe manual provider check, and diagnostic
outcomes needed to operate the feature.

**Contract**: Documentation uses Workers/Wrangler commands only, never includes a real key, and distinguishes the app's
versioned encryption root secret from each user's OpenRouter BYOK credential.

#### 2. S-08 extension seam

**Files**: `docs/reference/contract-surfaces.md`, `context/foundation/roadmap.md`

**Intent**: Record the stable S-07 generation/save contracts and clarify that S-08 extends server-selected generation
behavior behind the same endpoint and UI entry point.

**Contract**: Keep S-07 and S-08 as separate roadmap slices. Mark S-07 complete only after implementation; do not move
history-aware requirements, progress, or status into this change.

### Success Criteria:

#### Automated Verification:

- All configured application suites pass: `pnpm test:crypto`, `pnpm test:manual-workout`,
  `pnpm test:planned-workout`, `pnpm test:history`, and `pnpm test:ai-workout`.
- Full local database suite passes with `pnpm exec supabase test db --local supabase/tests/database`.
- Final static and production gates pass with `pnpm lint` and `pnpm build`.

#### Manual Verification:

- With a disposable valid OpenRouter key on a deployed or Worker-runtime preview, cold-start generation completes within
  10 seconds and returns an editable balanced full-body proposal.
- Re-roll, edit, first save, replacement confirmation, dashboard display, completion, and history display work end to
  end for an AI-origin workout.
- A deliberately invalid key and simulated provider outage produce sanitized actionable errors and preserve any prior
  proposal.
- A user with completed history cannot receive a cold-start proposal and is directed toward the future personalized
  behavior without breaking the manual builder.
- Browser-visible payloads, logs, and persisted database rows contain no plaintext OpenRouter credential.

**Implementation Note**: This phase requires human confirmation of the real-key Worker smoke test before the change is
considered implemented.

---

## Testing Strategy

### Unit Tests:

- Strict proposal JSON/schema parsing and rejection of extra, missing, malformed, duplicate, unknown, and out-of-range
  values.
- Balanced full-body coverage using primary muscle categories for lower body/core and database movement-pattern metadata
  for push/pull.
- Deterministic prompt construction and proof that user/history/credential data is absent.
- Maximum-catalogue serialization, the 64 KiB prompt budget, and pre-provider oversize rejection.
- Provider status mapping for rejected credentials, rate limits, timeouts, transient errors, network failures, oversized
  responses, embedded completion errors, and invalid structured output.
- Generation orchestration short-circuits before provider invocation for every ineligible or unsafe prerequisite.
- Client response parsing and UI-state transitions preserve a valid proposal across failed re-rolls.
- AI saving maps first-save, confirmation, stale, validation, authentication, and persistence outcomes correctly.

### Integration Tests:

- Application tests use injected/mock fetch and mocked Supabase boundaries; CI never calls OpenRouter.
- Existing Supabase tests verify that the migration does not regress RLS, workout lifecycle, manual saving, editing,
  completion, or history contracts. No new AI-save concurrency test is added in this change.
- Existing application suites remain regression gates for manual creation, planned editing/completion, and history.

### Manual Testing Steps:

1. Create a new authenticated user with no completed workouts and configure a disposable OpenRouter key.
2. Generate a proposal and verify 5–7 canonical exercises cover lower body, push, pull, and core within 10 seconds.
3. Edit order, exercises, sets, and reps; force a failed re-roll and verify the current proposal remains intact.
4. Re-roll successfully and verify the proposal changes only after the validated response arrives.
5. Save with no existing plan, then edit, complete, and inspect the AI-origin entry in history.
6. Repeat with an existing planned workout; cancel replacement, then confirm replacement and verify CAS behavior.
7. Remove or invalidate the key and verify configuration, retry, and manual-builder recovery actions.
8. Use an account with completed history and verify the S-08 handoff state with no provider request or cold-start result.
9. Inspect browser payloads, Worker logs, and stored rows for credential or raw-provider leakage.
10. Repeat the principal flow at 360px and desktop widths in supported browsers available for manual QA.

## Performance Considerations

- Set the provider abort deadline below the 10-second end-to-end requirement and measure total server-side generation
  duration with sanitized outcome metadata.
- Keep the OpenRouter request bounded to the seeded catalogue (currently capped at 200 exercises), enforce the 64 KiB
  serialized-context ceiling before the call, and use non-streaming structured output to avoid client parsing complexity.
- Cap response bytes before JSON parsing so an unexpected provider payload cannot consume unbounded Worker memory.
- Do not automatically retry: a retry may add BYOK cost and would threaten the response target.
- Initial page data may reuse catalogue/current-plan queries, but generation must recheck eligibility and prerequisites
  server-side because page state can become stale.

## Migration Notes

- Add a forward-only catalogue migration for curated push/pull metadata and a separate forward-only migration for the AI
  save function. No workout table or origin-enum change is required because `workout_origin` already contains `ai`.
- Preserve the manual function signature and behavior. The AI function must use a distinct name so provenance cannot be
  selected through client input.
- Regenerate `src/types/database.types.ts` after a clean local reset using the locked Supabase CLI and pinned Prettier.
- Worker rollback does not reverse Supabase migrations. The new function is additive, so rolling application code back
  leaves an unused authenticated function; remove it only in a deliberate follow-up migration if necessary.

## References

- Product requirements: `context/foundation/prd.md`
- Roadmap slices S-07 and S-08: `context/foundation/roadmap.md`
- Infrastructure constraints: `context/foundation/infrastructure.md`
- Database contract registry: `docs/reference/contract-surfaces.md`
- Existing credential service: `src/lib/ai-provider-keys.ts:152`
- Existing workout API conventions: `src/lib/workout-api.ts:4`
- Shared draft rules: `src/lib/manual-workout-builder.ts:168`
- Shared editor: `src/components/workouts/WorkoutDraftEditor.tsx:17`
- Existing replacement controller: `src/components/workouts/ManualWorkoutBuilder.tsx:64`
- Existing stale-refresh controller: `src/components/workouts/PlannedWorkoutEditor.tsx:104`
- Manual save transaction pattern: `supabase/migrations/20260902120000_create_planned_workout_mutations.sql:182`
- OpenRouter structured outputs: `https://openrouter.ai/docs/features/structured-outputs`
- OpenRouter chat completions: `https://openrouter.ai/docs/api-reference/chat-completion`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Cold-Start Generation Contracts and Provider Client

#### Automated

- [x] 1.1 AI contract, prompt, and provider-client tests pass
- [x] 1.2 Catalogue migration and catalogue contract tests pass
- [x] 1.3 Maximum-size prompt budget tests pass
- [x] 1.4 Existing crypto tests pass
- [x] 1.5 Static lint passes

#### Manual

- [x] 1.6 Model configuration is documented without secrets
- [x] 1.7 Mocked failure logs contain no sensitive generation data

### Phase 2: Cold-Start Eligibility and Generation API

#### Automated

- [x] 2.1 AI service and client-parser tests pass
- [x] 2.2 History-bearing users are proven not to trigger provider calls
- [x] 2.3 Typed generation failure cases are covered
- [x] 2.4 Existing workout application suites pass
- [x] 2.5 Static lint and production build pass

#### Manual

- [x] 2.6 API responses and logs contain no sensitive data
- [x] 2.7 History-bearing users receive the S-08-not-available outcome

### Phase 3: Atomic AI-Origin Planned-Workout Saving

#### Automated

- [x] 3.1 Mocked AI save service and route-boundary tests pass
- [x] 3.2 Clean local Supabase migration run succeeds
- [x] 3.3 Generated database types include the AI save function
- [x] 3.4 AI save pgTAP contract tests pass
- [x] 3.5 Existing local database suite passes
- [x] 3.6 Existing manual and planned-workout tests pass
- [x] 3.7 Static lint and production build pass

#### Manual

- [x] 3.8 First save creates one editable AI-origin plan
- [x] 3.9 Replacement requires explicit confirmation
- [x] 3.10 Stale replacement refreshes authoritative state without data loss

### Phase 4: Shared AI Planning Interface

#### Automated

- [ ] 4.1 AI UI state, helper, and shared conflict-transition tests pass
- [ ] 4.2 Existing workout lifecycle suites pass
- [ ] 4.3 Static lint and production build pass

#### Manual

- [ ] 4.4 Complete AI planner flow works at 360px and desktop widths
- [ ] 4.5 Failed re-roll preserves the current proposal
- [ ] 4.6 Typed failure actions lead to the expected recovery paths
- [ ] 4.7 History-bearing users receive the S-08 handoff state
- [ ] 4.8 AI-origin plans remain compatible with the existing lifecycle

### Phase 5: End-to-End Verification and Documentation

#### Automated

- [ ] 5.1 All configured application test suites pass
- [ ] 5.2 Full local database suite passes
- [ ] 5.3 Final static and production gates pass

#### Manual

- [ ] 5.4 Real-key Worker smoke test meets the 10-second target
- [ ] 5.5 AI generation through history display works end to end
- [ ] 5.6 Invalid-key and provider-outage recovery is safe and actionable
- [ ] 5.7 History-bearing users cannot receive a cold-start proposal
- [ ] 5.8 No plaintext credential is exposed or persisted
