# Cold-start AI Planned Workout Implementation Plan

## Overview

Implement roadmap slice S-07: an authenticated user with no completed workout history can explicitly generate a
balanced full-body workout through OpenRouter from the shared workout builder, edit the unsaved proposal with the
existing workout editor, and save it as an AI-origin planned workout. The same user-facing generation entry point and
server boundary must be extendable by S-08, but this change stops at a typed eligibility response when completed
history exists.

## Current State Analysis

The application has a complete workout-planning lifecycle, canonical exercise catalogue, recovery-aware catalogue
guidance, optimistic planned-workout replacement, and encrypted OpenRouter credential storage. The shared
`/workouts/new` builder now contains both the editable workout draft and a permanently visible AI proposal card;
`/workouts/ai` has no page or navigation entry. The account card shows a masked key and supports removal; a replacement
is intentionally a remove-then-add operation.

The shared editor is controlled by its parent and can therefore receive an AI-generated draft without duplicating
catalogue filtering, exercise replacement, ordering, or sets/reps editing. Existing planned-workout readers, editing,
completion, and history surfaces already accept and preserve AI provenance.

## Desired End State

From `/workouts/new`, an eligible user explicitly requests an AI workout from the permanently visible AI proposal card
and receives a 5–7 exercise balanced full-body proposal. The proposal stays in browser state until Save, can be edited,
and is persisted atomically as `origin = 'ai'` only after confirmation. The card has one action, `Generate workout`;
using it again replaces the proposal only after a successful validated response.

Users without a usable OpenRouter credential receive a clear route to account configuration and can still build their
workout manually on the same page. Users with completed history receive a stable S-08-not-available response; S-07
neither ignores that history nor implements history-aware generation. Provider failures preserve any existing unsaved
proposal without leaking provider responses or credentials.

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
- No automatic generation on page load, automatic provider retries, background jobs, streaming, server-persisted
  proposal drafts, or application-imposed provider deadline.
- No unrelated exercise-catalogue expansion, recovery-policy changes, workout lifecycle redesign, or AI-key table
  redesign; the only catalogue change is curated push/pull metadata needed by the starter contract.
- No custom exercise generation, new exercises, editable muscle tags, weights, RIR, or volume-aware programming.
- No provider key, raw provider response, prompt, workout payload, or user identifier in logs.
- No live OpenRouter call in CI and no new database concurrency test suite, per the selected verification boundary.
- No modification or cleanup of `context/changes/old-start-ai-planned-workout/`.

## Implementation Approach

Use native Worker `fetch` from a server-only OpenRouter client with a fixed model read from server configuration. The
application does not impose an artificial provider deadline. Request a strict JSON-schema response containing only
catalogue exercise IDs and integer sets/reps. Serialize catalogue context deterministically and reject generation before
the provider call when it exceeds a 64 KiB UTF-8 budget; do not truncate or sample exercises because that would silently
bias the proposal. Keep prompt construction, provider transport, response parsing, eligibility, and final proposal
validation as separable services so mocked tests can cover every failure without real credentials.

The generation API will authenticate the user, verify same origin, confirm lifetime completed-history count is zero,
decrypt the owned credential, load the canonical catalogue, and request a proposal. It will then independently enforce
the 5–7 exercise full-body contract and the existing draft constraints before returning browser-safe data. Each explicit
`Generate workout` request replaces the ephemeral client proposal only after a successful response.

Saving uses a dedicated authenticated SQL function and application service that mirror the established manual save
transaction, advisory-lock ordering, catalogue validation, and expected ID/revision replacement protocol while deriving
`origin = 'ai'`. For this MVP, that value means the workout was saved through the authenticated AI-assisted route; it
is route provenance, not cryptographic attestation that every exercise was model-selected. The existing editor and
planned-workout refresh logic remain the shared lifecycle after generation.

## Critical Implementation Details

### Lifecycle

The application does not impose a generation deadline. A failed generation request must not clear or mutate the current
draft; only a validated successful response may replace it.

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

**Intent**: Encapsulate the non-streaming provider call, bounded response parsing, and sanitized failure map
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
rejection, rate limiting, provider unavailability, invalid output, oversized catalogue context, missing model
configuration, and S-08 eligibility. AI diagnostics include elapsed time and reuse the request ID without forcing
AI-only codes into manual-workout UI message maps. A timeout code remains available only for an upstream/runtime
interruption; the application does not create one with an abort timer.

#### 4. Generation route

**File**: `src/pages/api/workouts/ai/generate.ts`

**Intent**: Expose an authenticated, same-origin POST endpoint for explicit generation.

**Contract**: Accept only a strict empty/versioned JSON command, enforce the established body-size and content-type
rules, and return the same validated proposal shape for every explicit generation request. Never accept a model,
provider URL, provider key, catalogue, history, or workout prescription from the client.

### Success Criteria:

#### Automated Verification:

- AI service and client-parser tests pass with `pnpm test:ai-workout`.
- Tests prove history-bearing users do not trigger provider calls.
- Tests cover missing/corrupt/rejected keys, rate limits, provider failures, invalid output, and success.
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

## Phase 4: Shared AI Planning Interface, End-to-End Verification, and Documentation

### Overview

Deliver the unified workout builder: a permanently visible AI proposal card, manual editing, AI-origin save,
configuration/deletion, and S-08 handoff on mobile and desktop using the established draft editor and planned-workout
conflict behavior. Verify the completed S-07 boundary in the Worker runtime and document the operational and S-08
extension contracts before closing the change.

### Changes Required:

#### 1. Shared workout-builder page data

**Files**: `src/pages/workouts/new.astro`, `src/lib/manual-workouts.ts`, `src/lib/ai-provider-keys.ts`,
`src/lib/planned-workouts.ts`

**Intent**: Render the shared workout builder with canonical catalogue, current planned workout, masked key
availability, and cold-start eligibility while keeping credential plaintext server-only.

**Contract**: `/workouts/new` is the only workout-creation page. Page props may contain only catalogue data, current
plan, masked/configured status, and eligibility; they must never contain decrypted credentials or raw history. The page
supports viewports at least 360px wide. `/workouts/ai` and its page component do not exist.

#### 2. Shared workout-builder controller

**Files**: `src/components/workouts/WorkoutBuilder.tsx`, `src/components/workouts/WorkoutDraftEditor.tsx`,
`src/components/workouts/WorkoutDraftPanel.tsx`, `src/components/workouts/PlannedWorkoutEditor.tsx`,
`src/lib/planned-workout-client.ts`, `src/lib/planned-workout-conflict.ts`,
`src/lib/planned-workout-conflict.test.ts`

**Intent**: Manage generation and save state around the shared controlled editor without duplicating its catalogue and
draft interactions.

**Contract**: The permanently visible `AI workout proposal` card has exactly one action, `Generate workout`, which
initiates every explicit generation request. A failed generation preserves the current draft; a successful validated
response replaces it. Edit actions affect only ephemeral state; Save follows expected ID/revision confirmation; pending
operations prevent duplicate submissions. The generated draft keeps AI provenance through later edits so it uses the AI
save path; a manually built draft uses the manual save path. Reuse a narrow extraction of the existing replacement and
stale-refresh transitions through a pure conflict-transition helper; do not create a divergent conflict protocol. The
workout draft is not sticky and scrolls with the exercise list.

#### 3. Typed generation states

**File**: `src/components/workouts/WorkoutBuilder.tsx`

**Intent**: Show safe generation states while retaining the current draft.

**Contract**: Missing or rejected credentials direct the user to `/account`; configured keys are removed and then added
again rather than replaced in place. Rate-limit, upstream timeout, and temporary provider failures are explained without
clearing the draft; the single `Generate workout` action remains the only generation control. History-bearing users see
that personalized AI planning is reserved for the next slice rather than receiving a misleading cold-start result.

#### 4. Entry points and success messaging

**Files**: `src/pages/dashboard.astro`, `src/layouts/AuthenticatedLayout.astro`

**Intent**: Keep navigation focused on the shared workout builder and make AI-save completion understandable.

**Contract**: Navigation links only to `/workouts/new` for workout creation; the dashboard has no generation CTA and no
account-setup card. Successful AI save redirects to the dashboard using a distinct safe status and the existing summary
displays `origin = 'ai'` correctly.

#### 5. Configuration and operational documentation

**Files**: `README.md`, `context/deployment/deployment-plan.md`, `src/components/account/AiKeyForm.tsx`,
`src/lib/ai-provider-keys.ts`, `supabase/migrations/20260905230000_add_ai_provider_key_prefix.sql`

**Intent**: Document the fixed model setting, Worker secret prerequisite, safe manual provider check, account-key
masking/removal contract, and diagnostic outcomes needed to operate the feature.

**Contract**: Documentation uses Workers/Wrangler commands only, never includes a real key, and distinguishes the app's
versioned encryption root secret from each user's OpenRouter BYOK credential. The account card reveals only the first
and last four characters, lets an existing encrypted key be removed with a compact trash icon, and intentionally has no
in-place update input or button.

#### 6. S-08 extension seam

**Files**: `docs/reference/contract-surfaces.md`, `context/foundation/roadmap.md`

**Intent**: Record the stable S-07 generation/save contracts and clarify that S-08 extends server-selected generation
behavior behind the same endpoint and UI entry point.

**Contract**: Keep S-07 and S-08 as separate roadmap slices. Mark S-07 complete only after implementation; do not move
history-aware requirements, progress, or status into this change.

### Success Criteria:

#### Automated Verification:

- AI UI state/helper and shared conflict-transition tests pass with `pnpm test:ai-workout`.
- Existing workout client and lifecycle suites pass with `pnpm test:manual-workout`, `pnpm test:planned-workout`, and
  `pnpm test:history`.
- Static lint and production build pass with `pnpm lint` and `pnpm build`.
- All configured application suites pass: `pnpm test:crypto`, `pnpm test:manual-workout`,
  `pnpm test:planned-workout`, `pnpm test:history`, and `pnpm test:ai-workout`.
- Full local database suite passes with `pnpm exec supabase test db --local supabase/tests/database`.

#### Manual Verification:

- At 360px and desktop widths, an eligible user can use the single `Generate workout` action, edit, save, and confirm
  replacement without clipped controls, lost focus, unintended horizontal scrolling, or a sticky workout draft.
- A failed generation preserves the previous proposal and its user edits until a later successful `Generate workout`
  request replaces it.
- Missing/rejected key, upstream timeout/rate-limit/provider failure, and the same-page manual builder lead to the
  expected recovery path without exposing technical details.
- A history-bearing user reaches the same Generate entry point but receives the S-08 handoff state, not a cold-start
  proposal.
- An AI-saved plan remains editable, completable, and visible in history through the existing lifecycle.
- With a disposable valid OpenRouter key on a deployed or Worker-runtime preview, cold-start generation returns an
  editable balanced full-body proposal without an application-imposed time limit.
- Repeated explicit Generate requests, edit, first save, replacement confirmation, dashboard display, completion, and
  history display work end to end for an AI-origin workout.
- A deliberately invalid key and simulated provider outage produce sanitized actionable errors and preserve any prior
  proposal.
- A user with completed history cannot receive a cold-start proposal and is directed toward the future personalized
  behavior without breaking the shared workout builder.
- Browser-visible payloads, logs, and persisted database rows contain no plaintext OpenRouter credential.

**Implementation Note**: This final phase requires human confirmation of the real-key Worker smoke test before the
change is considered implemented.

---

## Testing Strategy

### Unit Tests:

- Strict proposal JSON/schema parsing and rejection of extra, missing, malformed, duplicate, unknown, and out-of-range
  values.
- Balanced full-body coverage using primary muscle categories for lower body/core and database movement-pattern metadata
  for push/pull.
- Deterministic prompt construction and proof that user/history/credential data is absent.
- Maximum-catalogue serialization, the 64 KiB prompt budget, and pre-provider oversize rejection.
- Provider status mapping for rejected credentials, rate limits, upstream timeouts, transient errors, network failures,
  oversized responses, embedded completion errors, and invalid structured output.
- Generation orchestration short-circuits before provider invocation for every ineligible or unsafe prerequisite.
- Client response parsing and UI-state transitions preserve a valid proposal across failed generation requests.
- AI saving maps first-save, confirmation, stale, validation, authentication, and persistence outcomes correctly.

### Integration Tests:

- Application tests use injected/mock fetch and mocked Supabase boundaries; CI never calls OpenRouter.
- Existing Supabase tests verify that the migration does not regress RLS, workout lifecycle, manual saving, editing,
  completion, or history contracts. No new AI-save concurrency test is added in this change.
- Existing application suites remain regression gates for manual creation, planned editing/completion, and history.

### Manual Testing Steps:

1. Create a new authenticated user with no completed workouts and configure a disposable OpenRouter key.
2. Open `/workouts/new`, generate a proposal, and verify 5–7 canonical exercises cover lower body, push, pull, and core.
3. Edit order, exercises, sets, and reps; force a failed generation and verify the current proposal remains intact.
4. Use the same `Generate workout` action again and verify the proposal changes only after the validated response arrives.
5. Save with no existing plan, then edit, complete, and inspect the AI-origin entry in history.
6. Repeat with an existing planned workout; cancel replacement, then confirm replacement and verify CAS behavior.
7. Remove or invalidate the key and verify the remove-then-add account flow and the same-page workout-builder recovery.
8. Use an account with completed history and verify the S-08 handoff state with no provider request or cold-start result.
9. Inspect browser payloads, Worker logs, and stored rows for credential or raw-provider leakage.
10. Repeat the principal flow at 360px and desktop widths; verify the workout draft scrolls with the exercise list.

## Performance Considerations

- Do not impose an application-level generation deadline; record only sanitized elapsed duration for diagnostics.
- Keep the OpenRouter request bounded to the seeded catalogue (currently capped at 200 exercises), enforce the 64 KiB
  serialized-context ceiling before the call, and use non-streaming structured output to avoid client parsing complexity.
- Cap response bytes before JSON parsing so an unexpected provider payload cannot consume unbounded Worker memory.
- Do not automatically retry: an automatic retry may add BYOK cost. Repeated generation is always an explicit user action.
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
- Roadmap slice S-07: `context/foundation/roadmap.md`
- Infrastructure constraints: `context/foundation/infrastructure.md`
- Database contract registry: `docs/reference/contract-surfaces.md`
- Existing credential service: `src/lib/ai-provider-keys.ts:152`
- Existing workout API conventions: `src/lib/workout-api.ts:4`
- Shared draft rules: `src/lib/manual-workout-builder.ts:168`
- Shared editor: `src/components/workouts/WorkoutDraftEditor.tsx:17`
- Unified builder controller: `src/components/workouts/WorkoutBuilder.tsx`
- Existing stale-refresh controller: `src/components/workouts/PlannedWorkoutEditor.tsx:104`
- Manual save transaction pattern: `supabase/migrations/20260902120000_create_planned_workout_mutations.sql:182`
- OpenRouter structured outputs: `https://openrouter.ai/docs/features/structured-outputs`
- OpenRouter chat completions: `https://openrouter.ai/docs/api-reference/chat-completion`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Cold-Start Generation Contracts and Provider Client

#### Automated

- [x] 1.1 AI contract, prompt, and provider-client tests pass — d057ccd
- [x] 1.2 Catalogue migration and catalogue contract tests pass — d057ccd
- [x] 1.3 Maximum-size prompt budget tests pass — d057ccd
- [x] 1.4 Existing crypto tests pass — d057ccd
- [x] 1.5 Static lint passes — d057ccd

#### Manual

- [x] 1.6 Model configuration is documented without secrets — d057ccd
- [x] 1.7 Mocked failure logs contain no sensitive generation data — d057ccd

### Phase 2: Cold-Start Eligibility and Generation API

#### Automated

- [x] 2.1 AI service and client-parser tests pass — 7e76dd7
- [x] 2.2 History-bearing users are proven not to trigger provider calls — 7e76dd7
- [x] 2.3 Typed generation failure cases are covered — 7e76dd7
- [x] 2.4 Existing workout application suites pass — 7e76dd7
- [x] 2.5 Static lint and production build pass — 7e76dd7

#### Manual

- [x] 2.6 API responses and logs contain no sensitive data — 7e76dd7
- [x] 2.7 History-bearing users receive the S-08-not-available outcome — 7e76dd7

### Phase 3: Atomic AI-Origin Planned-Workout Saving

#### Automated

- [x] 3.1 Mocked AI save service and route-boundary tests pass — bb96910
- [x] 3.2 Clean local Supabase migration run succeeds — bb96910
- [x] 3.3 Generated database types include the AI save function — bb96910
- [x] 3.4 AI save pgTAP contract tests pass — bb96910
- [x] 3.5 Existing local database suite passes — bb96910
- [x] 3.6 Existing manual and planned-workout tests pass — bb96910
- [x] 3.7 Static lint and production build pass — bb96910

#### Manual

- [x] 3.8 First save creates one editable AI-origin plan — bb96910
- [x] 3.9 Replacement requires explicit confirmation — bb96910
- [x] 3.10 Stale replacement refreshes authoritative state without data loss — bb96910

### Phase 4: Shared AI Planning Interface, End-to-End Verification, and Documentation

#### Automated

- [x] 4.1 AI UI state, helper, and shared conflict-transition tests pass — d27eab3
- [x] 4.2 Existing workout lifecycle suites pass — d27eab3
- [x] 4.3 Static lint and production build pass — d27eab3
- [x] 4.4 All configured application suites pass — d27eab3
- [x] 4.5 Full local database suite passes — d27eab3
- [x] 4.6 Final static and production gates pass — d27eab3

#### Manual

- [x] 4.7 Complete AI planner flow works at 360px and desktop widths — d27eab3
- [x] 4.8 Failed generation preserves the current proposal — d27eab3
- [x] 4.6 Typed failure actions lead to the expected recovery paths — d27eab3
- [x] 4.9 History-bearing users receive the S-08 handoff state — d27eab3
- [x] 4.10 AI-origin plans remain compatible with the existing lifecycle — d27eab3
- [x] 4.11 Disposable-key Worker-runtime smoke test is confirmed by a human — 18d1062
- [x] 4.12 Invalid-key and provider-outage recovery is safe and actionable — d27eab3
- [x] 4.13 History-bearing users cannot receive a cold-start proposal — d27eab3
- [x] 4.14 No plaintext credential is exposed or persisted — d27eab3
