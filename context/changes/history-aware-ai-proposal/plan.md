# History-aware AI Proposal Implementation Plan

## Overview

Implement roadmap slice S-08 by extending the existing shared workout-generation boundary with private history-aware
ranking, explicit exercise preferences, recovery-safe candidate selection, and time-bounded proposal telemetry. A user
with completed history can generate an editable AI workout that favors familiar and explicitly liked exercises,
excludes exercises marked **Don't suggest**, and selectively introduces similar exercises never completed in the app.

History-aware proposals normally retain the established 5–7 exercise contract. A reduced 3–4 exercise proposal is an
exception available only when fewer than five but at least three recovery-compatible exercises exist. The server must
detect that condition before contacting OpenRouter, return a typed confirmation requirement, and accept a second
explicitly acknowledged request. Users can never select a smaller workout when five or more ready candidates exist.

## Current State Analysis

The application already has the complete manual workout lifecycle, immutable owner-scoped completed history, fixed
primary-muscle recovery windows, encrypted OpenRouter credentials, a cold-start AI generation service, an editable
shared workout builder, and atomic AI-origin saving. The generation endpoint accepts a versioned empty command and
returns a validated browser-safe proposal. Failed generations preserve the current draft.

The cold-start implementation deliberately rejects every user with completed history. Its prompt and validator require
full-body coverage, its success metadata is hard-coded to `cold_start`, and the page passes a potentially stale
eligibility flag to the React island. The existing recovery loader is bounded to the active recovery horizon and omits
exercise IDs, while the display-history service is paginated for UI reads. Neither is an appropriate lifetime
preference profile.

No explicit preference or proposal-exposure data exists. Completion can safely indicate familiarity, recency, and
whether an exercise is absent from completed in-app history, but it cannot prove enjoyment, actual performance, or
model-suggestion acceptance. The repository also has no scheduled application job, and the AI Node suite exists in
`package.json` but is not invoked by CI.

## Desired End State

For a user with completed history, every generation request derives a fresh owner-scoped completion profile and
explicit preferences on the server. Primary-muscle recovery removes ineligible exercises before ranking. The
deterministic ranker boosts liked exercises, excludes **Don't suggest** exercises, treats completed frequency and
recency only as weak familiarity, and admits similarity-qualified never-completed exercises through the approved
adaptive quota. A server-supplied seed varies equally ranked candidates on re-roll without sacrificing reproducible
tests.

The provider receives only a compact vetted shortlist and derived recommendation reasons. It never receives raw
history, user or workout identifiers, preferences unrelated to the shortlist, or credentials. The returned proposal is
independently validated against the exact shortlist, prescription bounds, recovery eligibility, uniqueness, requested
size, and feasible ready-only coverage.

When five or more ready candidates exist, the normal 5–7 proposal path is the only allowed history-aware mode. When
exactly 3–4 ready candidates exist, the first request makes no provider call and returns the available count plus a
short-lived server-verifiable confirmation token. Only a second request carrying that token may generate the reduced
proposal. When fewer than three ready candidates exist, generation fails before provider use and directs the user to
manual planning.

Each returned proposal has a private proposal identity. The application records display exposure, re-roll, exercise
removal, swap, retention, save, and later completion events. Optional per-exercise Like and **Don't suggest** controls
persist until changed or account deletion and affect the next request deterministically. Raw proposal and interaction
records expire through a database-scheduled purge and are never retained beyond the documented 90-day policy. A saved
workout may retain only an opaque proposal-lineage UUID, without a foreign key or proposal contents, so a completion
after raw telemetry expiry can create a new time-bounded completion event. Cold-start generation, manual editing,
AI-origin saving, planned-workout replacement, and completed-history behavior remain compatible.

### Key Discoveries:

- The existing generation pipeline is dependency-injected and is the correct extension point
  (`src/lib/ai-workouts.ts:134`).
- The endpoint already owns same-origin enforcement, authentication, request IDs, and strict command parsing
  (`src/pages/api/workouts/ai/generate.ts:13`).
- The current validator hard-codes cold-start lower-body/core/push/pull coverage
  (`src/lib/ai-workout-contract.ts:63`).
- Recovery is already a pure, clock-injected projection with primary-only blocking, latest-deadline semantics, and
  equality treated as ready (`src/lib/recovery-aware-catalogue.ts:55`).
- Completed-history display reads are page-sized and unsuitable for lifetime ranking
  (`src/lib/workout-history.ts:104`).
- The existing `(user_id, status, completed_at DESC)` index supports the owner-scoped completion aggregate
  (`supabase/migrations/20260820090200_create_workout_lifecycle.sql:52`).
- S-07 deliberately established that S-08 extends the same builder and endpoint rather than adding a second planning
  flow (`docs/reference/contract-surfaces.md:121`).
- Supabase Cron supports migration-managed recurring PostgreSQL cleanup via `pg_cron`; this is the selected retention
  boundary rather than a new Worker or external scheduler.
- `pnpm test:ai-workout` is defined but absent from the current GitHub Actions workflow
  (`package.json:19`, `.github/workflows/ci.yml:43`).

## What We're NOT Doing

- Adding a recommendation, machine-learning, embedding, vector-search, or tensor-runtime dependency.
- Implementing a contextual bandit, online training, cross-user collaborative filtering, or model-managed recovery.
- Claiming that completion means like, that absence means never tried outside the app, or that the proposal is
  physiologically optimal.
- Using sets/reps, workout origin, prescribed volume, or an AI-saved workout as proof of item-level performance or
  preference.
- Collecting weight, RPE/RIR, failure, soreness, injuries, goals, experience, available time, equipment availability,
  sleep, health-platform, or fitness-tracker data.
- Weakening primary-muscle recovery rules, blocking manual selection of recovering exercises, or validating recovery
  again during save after the user intentionally edits a proposal.
- Letting users request 3–4 exercises when at least five ready candidates exist or generating any AI proposal with fewer
  than three ready candidates.
- Sending raw completed history, proposal telemetry, account identifiers, workout identifiers, prompts, provider
  responses, or credentials to the browser or logs.
- Adding general catalogue favorites; AI-specific Like remains a recommendation preference.
- Changing the AI save RPC's ownership, replacement, origin, or compare-and-swap semantics beyond the narrow proposal
  linkage needed for lifecycle telemetry.
- Adding automatic provider retries, streaming, browser-selected models, or live OpenRouter calls to CI.

## Implementation Approach

Add a minimal private data layer for durable exercise preferences, expiring proposals/events, and a compact
owner-derived completion profile. Database functions derive the authenticated owner internally, expose no user-ID
argument, use invoker security with an empty search path, and return only the fields needed by the ranker. A scheduled
database cleanup removes expired proposal data; durable preferences cascade with account deletion.

Implement ranking as a pure TypeScript module independent of Supabase and OpenRouter. Its ordered pipeline is fixed:
apply explicit exclusions, derive recovery eligibility, build weak familiarity, form familiar and unseen pools, apply
the adaptive similarity threshold and exploration cap, reserve feasible ready-only coverage, then use MMR to diversify
remaining shortlist positions. Configuration and clock/seed inputs are explicit so every boundary is deterministic in
tests.

Generalize the existing cold-start generation service into one server-selected mode pipeline. Cold start retains its
current prompt, validator, size, and full-body contract. History-aware mode loads the profile and preferences, prepares
the shortlist, performs the reduced-size handshake when required, calls the existing fixed-model OpenRouter transport,
validates independently, records the proposal, and returns the same editable draft shape plus mode, proposal, original
membership, and safe per-exercise preference metadata.

Extend the existing builder rather than creating a new route. Remove the page-load eligibility gate, let the
authenticated POST determine current mode, render the reduced-size confirmation dialog only for the typed server
outcome, and add per-proposal preference controls. Telemetry must never make local editing inaccessible: user-visible
preference mutations report durable failures, while non-critical behavioral event failures use sanitized diagnostics
and preserve the draft.

## Critical Implementation Details

### Timing & lifecycle

The reduced-workout decision must be derived from the same fresh profile, preferences, catalogue, recovery clock, and
ranking configuration used by the eventual provider request. The confirmation token is a capability signed by the
Worker with a dedicated `AI_CONFIRMATION_SIGNING_SECRET`; it binds owner, mode, ready-candidate fingerprint, allowed
count, expiry, and a random nonce. PostgreSQL stores only the nonce digest for atomic single-use consumption. The
acknowledged request must verify the signature, recompute state, consume the nonce, and reject a stale token; it must
never honor reduced mode if recomputation finds at least five ready candidates. The signing secret is independent from
the provider-key encryption secret and requires its own provisioning and rotation notes.

### State sequencing

Recovery eligibility precedes every preference or diversity score. **Don't suggest** exclusion precedes candidate-count
classification. Like is a positive ranking signal but never overrides recovery, catalogue membership, shortlist
uniqueness, or feasible coverage. A successful preference mutation affects subsequent generations and does not
silently rewrite the currently displayed draft.

### User experience spec

The confirmation dialog states the exact available count and that manual planning remains available. Cancel preserves
the draft and makes no provider call; confirm starts a new pending generation request. Like and **Don't suggest** are
explicit buttons with pressed state, keyboard access, and at least 44px targets. Marking a currently proposed exercise
**Don't suggest** removes it from future proposals, not from the current editable draft without a separate edit action.

### Debug & observability

Diagnostics remain limited to request ID, operation, stable code, sanitized technical code, mode, and elapsed duration.
They must exclude confirmation tokens, seeds, preference payloads, proposal/event rows, candidate IDs, history,
prompts, provider bodies, generated prescriptions, account/workout IDs, and credentials. Scheduled cleanup must have a
documented SQL verification query and failure-inspection path without exposing event content.

## Phase 1: Private Recommendation and Telemetry Data Contracts

### Overview

Establish the owner-scoped completion profile, durable explicit preferences, expiring proposal/event model, lifecycle
linkage, and automatic retention cleanup before application ranking or UI code consumes them.

### Changes Required:

#### 1. Completion-profile database function

**Files**: `supabase/migrations/<timestamp>_create_exercise_completion_profile.sql`,
`supabase/tests/database/exercise_completion_profile.test.sql`, `src/types/database.types.ts`

**Intent**: Return the smallest lifetime history representation that supports familiarity, recency, latest-workout
membership, and recovery derivation without transferring raw workout history through the Worker.

**Contract**: Add an authenticated, stable, `SECURITY INVOKER` function with an empty search path and no user-ID
argument. It derives `auth.uid()`, filters explicitly to that owner's completed workouts, and returns one row per
completed exercise: `exercise_id`, `completed_count`, `last_completed_at`, and
`in_last_completed_workout`. The last workout uses deterministic `completed_at DESC, id DESC` ordering. Planned rows,
other owners, sets/reps, origin, and raw workout IDs are absent. Revoke execution from public/anonymous roles and grant
only authenticated execution.

#### 2. Explicit preference and proposal telemetry schema

**Files**: `supabase/migrations/<timestamp>_create_ai_recommendation_feedback.sql`,
`supabase/tests/database/ai_recommendation_feedback.test.sql`, `src/types/database.types.ts`

**Intent**: Persist actionable preferences separately from expiring behavioral evidence and give every returned
history-aware proposal a private identity that can be followed through editing, saving, and completion.

**Contract**: Add an owner/exercise-unique preference record with the exact states `liked` and `dont_suggest`, creation
and update timestamps, canonical catalogue reference, owner RLS, and account-delete cascade. Add owner-scoped proposal,
ordered proposed-exercise, and constrained event records for exposure, re-roll, removal, swap, retention, save, and
completion. Event shapes must use typed columns and database checks rather than arbitrary client-authored JSON. Proposal
and event rows carry a database-derived expiry boundary implementing the 90-day maximum retention policy. A saved
workout may retain an opaque proposal-lineage UUID without a foreign key or proposal payload; deleting expired telemetry
must not delete or mutate the workout or that lineage marker.
Add a separate short-lived, single-use reduced-generation confirmation record containing only owner, candidate
fingerprint, allowed count, expiry, and consumption state; it is operational authorization, not 90-day telemetry.

#### 3. Feedback mutation and proposal-recording functions

**Files**: `supabase/migrations/<timestamp>_create_ai_recommendation_feedback.sql`,
`supabase/tests/database/ai_recommendation_feedback.test.sql`, `src/types/database.types.ts`

**Intent**: Keep ownership, allowed event transitions, preference precedence, and proposal-to-workout linkage narrow
and application-mediated instead of exposing generic table writes.

**Contract**: Add narrow authenticated functions for setting/clearing one exercise preference, recording an
application-validated proposal with its ordered exercise provenance, appending allowed edit/re-roll events, and linking
the final AI save/completion lifecycle. Functions derive the owner, validate referenced proposal/exercise/workout
ownership and state, use invoker security with empty search paths, and expose stable SQLSTATE outcomes. The application
APIs never accept an owner, expiry, generation mode, seed, similarity score, or arbitrary event type from browser
payloads. Preference functions are idempotent; `dont_suggest` and `liked` are mutually exclusive for one exercise.

These authenticated RPCs are owner-isolation boundaries, not proof that the caller is the Worker: this repository uses
a publishable/anon Supabase key with the user's JWT, so the same user can call granted Data API functions directly and
could poison only their own telemetry. MVP telemetry is therefore not treated as adversarially tamper-resistant and is
not used for online ranking or training. Add authenticated nonce-registration/consumption functions for reduced
generation, but make authorization depend on the independently verified Worker signature. Persist only the nonce
digest, owner binding, and expiry, and consume it atomically at most once; a fabricated database row without a valid
signature can never authorize reduced generation.

#### 4. Scheduled retention cleanup

**Files**: `supabase/migrations/<timestamp>_schedule_ai_proposal_retention.sql`,
`supabase/tests/database/ai_recommendation_feedback.test.sql`, `README.md`

**Intent**: Enforce raw proposal/event expiry for inactive as well as active users without adding a Worker cron route or
external scheduler.

**Contract**: Enable/use Supabase Cron through the supported `pg_cron` extension and create one stable named cleanup job
from a forward migration. The job deletes expired proposal/event data in dependency-safe order without touching durable
preferences or workouts, and also removes expired/consumed confirmation records. Re-running a clean migration must not
create duplicate jobs. Document how to verify the job, inspect its run status, and deliberately unschedule/replace it
during rollback. Tests assert the job contract and prove expired deletion preserves preferences and workout history.

#### 5. Server-side loaders and mappings

**Files**: `src/lib/history-aware-ai-profile.ts`, `src/lib/history-aware-ai-profile.test.ts`,
`src/lib/planned-workouts.ts`

**Intent**: Map generated RPC results and explicit preferences into one validated application profile while preserving
the existing manual-builder recovery loader.

**Contract**: Expose typed loaders for the authenticated completion aggregate and preferences. Validate counts,
timestamps, identifiers, and enum values; malformed results map to sanitized persistence failures. Missing aggregate
rows mean never completed in this app. The AI path may derive latest primary-muscle recovery from aggregate timestamps
plus canonical catalogue taxonomy, but the manual builder continues using its existing bounded recent-history read.

#### 6. Contract registry and migration order

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Make the recommendation data boundary, privacy model, retention job, and lifecycle linkage discoverable to
later changes while correcting the registry's already-stale migration list.

**Contract**: Record every current migration in executable order, then document the new completion-profile,
preference, proposal/event, function privilege, expiry, cleanup, and account/workout cascade invariants. State that raw
events are private telemetry, completion is weak familiarity, and proposal linkage does not attest that every final
exercise was AI-selected.

### Success Criteria:

#### Automated Verification:

- Clean local migrations apply: `pnpm exec supabase db reset --local`
- Public schema lint passes: `pnpm exec supabase db lint --local --schema public --fail-on error`
- Completion-profile pgTAP tests pass through `pnpm exec supabase test db --local supabase/tests/database`
- Preference, telemetry, ownership, transition, expiry, and cleanup pgTAP tests pass through the full database suite
- Generated database types match the clean schema and format with the pinned Prettier
- Profile loader tests pass through `pnpm test:ai-workout`
- Existing workout lifecycle and concurrency tests remain green
- Repository lint passes: `pnpm lint`

#### Manual Verification:

- Two authenticated users cannot read or mutate each other's profile, preferences, proposals, events, or linkage.
- A clean local database shows exactly one named retention job and its command targets only expired AI telemetry.
- Running the cleanup against expired fixtures removes raw proposal/event rows without changing preferences or workout
  history.
- Account deletion removes durable preferences and private telemetry through the declared cascades.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of ownership, retention, and non-destructive cleanup before proceeding.

---

## Phase 2: Recovery-constrained Recommendation Engine

### Overview

Build the pure recommendation core that turns catalogue, completion profile, explicit preferences, recovery policy,
clock, and seed into a vetted history-aware shortlist or a typed pre-provider decision.

### Changes Required:

#### 1. Recommendation domain and configuration

**Files**: `src/lib/ai-workout-recommender.ts`, `src/lib/ai-workout-recommender.test.ts`

**Intent**: Define transparent candidate, score, reason, shortlist, and failure contracts without coupling them to
Supabase, React, or OpenRouter.

**Contract**: Model familiar, never-completed, liked, and excluded states explicitly. Centralize named initial weights
for primary-muscle, secondary-muscle, movement-pattern, and equipment similarity; familiarity decay; MMR relevance;
confidence threshold; and adaptive exploration caps. Treat these values as product configuration, not learned truth.
Accept an injected clock and deterministic seed. Return only vetted candidate data and derived reasons required by the
prompt/validator, never raw history rows.

#### 2. Recovery and explicit-preference eligibility

**Files**: `src/lib/ai-workout-recommender.ts`, `src/lib/ai-workout-recommender.test.ts`,
`src/lib/recovery-aware-catalogue.ts`, `src/lib/recovery-aware-catalogue.test.ts`

**Intent**: Reuse the canonical primary-muscle recovery algorithm as a hard generation boundary and apply explicit
preferences in the approved precedence order.

**Contract**: Derive recovery from completed timestamps and canonical primary tags using latest-deadline semantics;
ready begins exactly at the configured deadline. Remove recovering and `dont_suggest` exercises before scoring or
candidate-count classification. A liked exercise receives a deterministic positive signal only after eligibility and
can never bypass recovery, exclusion, uniqueness, or coverage. Preserve the manual catalogue's advisory behavior and
existing recovery tests.

#### 3. Familiarity, similarity, and adaptive exploration

**Files**: `src/lib/ai-workout-recommender.ts`, `src/lib/ai-workout-recommender.test.ts`

**Intent**: Prefer likely acceptable exercises while introducing relevant variety without pretending that implicit
completion is a like.

**Contract**: Use diminishing completion frequency, latest completion, and last-workout membership as weak familiarity
features. Classify an exercise as never completed only when its ID is absent from completed app history. An unseen
exercise may enter the exploration pool only above the named structured-similarity threshold. Permit up to two such
exercises for users with 1–2 completed workouts and up to one for users with longer history; use fewer or none when
confidence or feasible coverage does not justify them.

#### 4. Feasible coverage and MMR shortlist assembly

**Files**: `src/lib/ai-workout-recommender.ts`, `src/lib/ai-workout-recommender.test.ts`

**Intent**: Produce varied, recovery-compatible shortlists with the strongest achievable ready-only movement/category
coverage.

**Contract**: Reserve distinct feasible ready categories/movements before filling remaining positions with MMR.
History-aware coverage maximizes available lower-body, core, upper-body push, and upper-body pull representation but
never requires an unavailable recovering category. Deterministic ID tie-breaking makes a fixed seed repeatable; a
different injected seed may vary only equivalent candidates. The final shortlist is unique, canonical, and no larger
than the requested proposal ceiling.

#### 5. Candidate-count decision contract

**Files**: `src/lib/ai-workout-recommender.ts`, `src/lib/ai-workout-recommender.test.ts`

**Intent**: Make normal, confirmation-required, and unavailable outcomes mutually exclusive before any provider work.

**Contract**: Five or more eligible candidates yields only a normal 5–7 request. Exactly 3–4 yields only a typed
reduced-confirmation requirement unless a valid server acknowledgement is supplied. Fewer than three yields
`insufficient_recovered_candidates`. No configuration, seed, user input, or provider output may choose reduced mode
when five or more eligible candidates exist.

### Success Criteria:

#### Automated Verification:

- Pure recommender tests pass through `pnpm test:ai-workout`
- Recovering primary muscles and `dont_suggest` exercises never enter a shortlist
- Exact recovery deadlines are ready and repeated completion uses the latest applicable deadline
- Like boosts eligible exercises but never overrides hard constraints
- Zero-, one-to-two-, and established-history fixtures apply the correct familiarity and exploration policies
- Below-threshold unseen exercises are omitted and no unseen slot is forced when none qualifies
- Feasible ready-only coverage and MMR avoid redundant slates without inventing unavailable categories
- Fixed clock/seed/input produces identical output; alternate seeds vary only eligible ties
- Five-plus, 3–4, and fewer-than-three candidate counts produce the exact mutually exclusive outcomes
- Existing manual recovery tests remain green with `pnpm test:manual-workout`
- Repository lint and production build pass with `pnpm lint` and `pnpm build`

#### Manual Verification:

- Representative profiles produce explainable shortlists whose reasons match the underlying completion/preference
  evidence without using “liked” for implicit completion.
- A liked but recovering exercise and a familiar but excluded exercise are absent from the candidate set.
- Reduced mode cannot be selected through configuration or direct user preference when five ready candidates exist.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human review of
ranking explanations, novelty balance, and the strict reduced-mode invariant.

---

## Phase 3: Mode-aware Generation and Reduced-workout Handshake

### Overview

Integrate the recommender into the existing authenticated endpoint, generalize prompt/validation/metadata contracts,
and add the server-authoritative two-step confirmation without changing the provider or save architecture.

### Changes Required:

#### 1. Versioned command and confirmation token

**Files**: `src/lib/ai-workout-client.ts`, `src/lib/ai-workout-client.test.ts`,
`src/lib/ai-workout-confirmation.ts`, `src/lib/ai-workout-confirmation.test.ts`, `astro.config.mjs`

**Intent**: Extend the strict browser command only enough to acknowledge a server-discovered reduced proposal while
preventing client-selected size or stale confirmation reuse.

**Contract**: Define an exact-key union with four browser commands: initial `{ version }`, re-roll
`{ version, priorProposalId }`, confirmed reduced `{ version, confirmationToken }`, and confirmed reduced re-roll
`{ version, confirmationToken, priorProposalId }`. `priorProposalId` is allowed only when replacing an active
history-aware proposal and is owner-validated before linkage. The confirmation token is a random, short-lived,
Worker-signed capability; only its nonce digest is stored in the database. Parsing rejects all other key combinations,
requested counts, seeds, model/provider inputs, malformed signatures, replay, expiry, and cross-owner proposal IDs.
Tokens and signing material never appear in logs.

#### 2. Mode-aware generation orchestration

**Files**: `src/lib/ai-workouts.ts`, `src/lib/ai-workouts.test.ts`,
`src/pages/api/workouts/ai/generate.ts`

**Intent**: Select cold-start or history-aware behavior from fresh server data and preserve the single injectable
generation pipeline.

**Contract**: Verify authentication, load catalogue/profile/preferences, derive mode, and prepare the candidate
decision before credential decryption or provider use when possible. No-history users follow the unchanged cold-start
path. History-bearing users execute the recommender. Confirmation-required, insufficient-candidate, profile,
preference, and catalogue failures short-circuit without an OpenRouter call. An acknowledged reduced request recomputes
state and verifies the token against the fresh candidate fingerprint before continuing. Keep the fixed model,
user-owned credential, and explicit no-auto-retry behavior.

#### 3. History-aware prompt contract

**Files**: `src/lib/ai-workout-prompt.ts`, `src/lib/ai-workout-prompt.test.ts`

**Intent**: Ask the model to assemble a prescription only from the vetted shortlist while minimizing disclosed private
context.

**Contract**: Add a mode-specific prompt that serializes sorted shortlist IDs, catalogue attributes, eligibility,
familiar/unseen/liked reason labels, feasible coverage targets, and exact requested size bounds. It contains no raw
completion timestamps/counts, preferences outside the shortlist, proposal/event history, owner/workout IDs, seed,
credential, or confirmation token. Preserve deterministic UTF-8 serialization and the existing 64 KiB ceiling; an
oversized prompt fails before provider use.

#### 4. Mode-specific proposal validation

**Files**: `src/lib/ai-workout-contract.ts`, `src/lib/ai-workout-contract.test.ts`

**Intent**: Retain cold-start guarantees while independently enforcing every history-aware application constraint
after the untrusted provider response.

**Contract**: Introduce an explicit generation-mode validation context. Cold start keeps 5–7 and mandatory full-body
coverage unchanged. History-aware normal responses require 5–7; acknowledged reduced responses require exactly the
server-authorized 3–4 bound. Both history-aware variants enforce catalogue/shortlist membership, uniqueness,
prescription bounds, recovery eligibility, explicit exclusion, and feasible coverage. Unknown, recovering,
out-of-shortlist, duplicate, wrong-size, or infeasibly imbalanced output returns `invalid_output` without weakening save
validation.

#### 5. API success, failure, and browser metadata

**Files**: `src/lib/ai-workout-api.ts`, `src/lib/ai-workout-client.ts`,
`src/lib/ai-workout-planner-state.ts`, corresponding test files

**Intent**: Make generation mode, proposal identity, reduced confirmation, and insufficient-candidate recovery exact and
browser-safe.

**Contract**: Replace the hard-coded metadata literal with a discriminated `cold_start | history_aware` union. A
history-aware success includes proposal ID, exercise count, reduced flag, the original proposed exercise IDs, and the
safe `liked | neutral` preference state for each returned exercise; cold start retains only its compatible public
metadata. Add typed failure/decision codes for reduced confirmation, stale confirmation, and insufficient candidates
with an optional safe available count/token only on the confirmation response. Exact-key parsers reject unknown
metadata. `applyAiGenerationResponse` returns an active-proposal state containing mode, proposal ID, original exercise
IDs, and preference states alongside the draft. Failed requests preserve both the current draft and active-proposal
state. A later successful proposal replaces both. Success request IDs remain diagnostic metadata and are not rendered
as errors.

#### 6. Proposal recording and re-roll linkage

**Files**: `src/lib/ai-workouts.ts`, `src/lib/history-aware-ai-profile.ts`,
`src/lib/ai-workouts.test.ts`

**Intent**: Assign a private proposal identity and record exposure/re-roll provenance without sending internal ranking
state to the browser.

**Contract**: After provider output passes validation, record the exact returned proposal and permitted derived
provenance through the narrow database function before returning its ID, but do not call that record an exposure yet.
A re-roll command carries and owner-validates the prior browser-held proposal ID before linking the new proposal.
Database failures map to safe outcomes; provider content and private profile data never enter diagnostics. Cold-start
behavior remains compatible and is not required to create the history-aware feedback trail.

### Success Criteria:

#### Automated Verification:

- Mode-aware command, confirmation, prompt, validator, service, client, and planner-state tests pass with
  `pnpm test:ai-workout`
- Cold-start regression fixtures retain their exact 5–7 full-body behavior
- History-bearing normal requests cannot use cold-start validation or metadata
- Confirmation-required and insufficient-candidate outcomes make zero provider calls
- Cancelled confirmation makes no second request; valid confirmation is required before reduced provider use
- Stale, expired, tampered, cross-owner, and candidate-mismatched tokens are rejected before provider use; missing
  signing configuration fails closed
- Recomputed five-plus eligibility invalidates reduced mode even with a formerly valid token
- History-aware prompts contain only the vetted shortlist/reasons and stay below the 64 KiB ceiling
- Provider output outside shortlist, recovery, size, uniqueness, prescription, or feasible-coverage contracts fails
- Proposal identity, active-proposal state, preference hydration, and re-roll linkage remain owner-scoped and browser
  responses contain no raw history
- Existing crypto, manual, planned-workout, and history suites remain green
- Repository lint and production build pass with `pnpm lint` and `pnpm build`

#### Manual Verification:

- API responses and logs reveal no token contents, seed, preferences, history, candidate IDs, prompt, proposal body,
  provider body, account/workout ID, or credential.
- A user with five-plus ready candidates cannot obtain the reduced confirmation response or submit a reduced request.
- A user with 3–4 ready candidates sees no provider charge before confirmation and receives only the confirmed count
  after accepting.
- A user with fewer than three ready candidates is directed to the still-available manual builder.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of provider-call ordering, token invalidation, and cold-start compatibility before changing the UI.

---

## Phase 4A: Save and Completion Lifecycle Data Contract

### Overview

Extend the existing AI-save and planned-completion transactions with opaque proposal lineage while keeping their
ownership, compare-and-swap, lock-order, and immutable-history contracts intact.

### Changes Required:

#### 1. Exact AI-save parser and atomic proposal linkage

**Files**: `src/lib/ai-workout-save-request.ts`, `src/lib/ai-workout-save-request.test.ts`,
`src/components/workouts/WorkoutBuilder.tsx`, `src/pages/api/workouts/ai/save.ts`, `src/lib/ai-workouts.ts`,
`src/lib/ai-workouts.test.ts`, a new forward migration, `src/types/database.types.ts`, and matching pgTAP tests.

**Contract**: Define a separate exact-key AI-save request parser that composes the existing manual-save fields with nullable
`proposalId` without widening `parseManualWorkoutRequest` or the manual endpoint. The browser supplies the active
history-aware proposal ID or null for cold-start/legacy drafts. Keep the existing four-argument
`save_ai_planned_workout` callable, which remains the cold-start/legacy path. Add the uniquely named, non-overloaded
`save_history_aware_ai_planned_workout` RPC for a supplied proposal ID; the route selects it only when `proposalId` is
non-null. The public history-aware RPC remains `SECURITY INVOKER` and calls the narrow owner-derived
`private.link_history_aware_ai_save_for_current_user` `SECURITY DEFINER` helper for the otherwise ungranted
lineage-column write and event inserts. That helper validates live owner-scoped proposal state,
derives retained exercises from the canonical submitted draft, records retained/save events, and copies only the opaque
lineage UUID to the new workout in the same transaction. Do not grant direct authenticated write access to
`workouts.ai_proposal_lineage_id`, drop the legacy RPC, or add an overload; migration tests assert the exact
PostgREST-visible function set, grants, and old-client rollback compatibility. Telemetry failure rolls back the new
history-aware save transaction and leaves the local draft available for a safe retry.

#### 2. Expiry-surviving completion telemetry

**Files**: a new forward migration, `src/lib/planned-workouts.ts`,
`src/lib/planned-workout-completion.test.ts`, `supabase/tests/database/ai_recommendation_feedback.test.sql`,
`supabase/tests/database/ai_workout_mutation.test.sql`, `supabase/tests/database/planned_workout_completion.test.sql`,
and `src/types/database.types.ts`.

**Contract**: The applied `ai_workout_proposal_events.proposal_id` is non-null and cascade-deleted with raw proposals,
so it cannot represent a completion after raw telemetry expiry. Add a private, independently expiring completion record
keyed by workout and carrying only owner, opaque proposal-lineage UUID, completion time, and expiry; it has no foreign
key to proposal telemetry. Replace the body of `complete_planned_workout(uuid, integer)` in a forward migration without
changing its callable signature. After the normal terminal transition, it inserts this record idempotently only when the
completed workout has an owner-matched lineage marker. Manual, cold-start, and unlinked legacy AI workouts complete
exactly as before; absent or malformed telemetry state never changes completion time, revision, lock order, or immutable
prescriptions.

#### 3. Retention and contract updates

**Files**: new forward migration, `README.md`, `docs/reference/contract-surfaces.md`, and the database tests above.

**Contract**: Extend the daily cleanup job idempotently to remove expired independent completion records without touching
durable preferences or workouts. Document the additive rollback behavior and that proposal expiry cannot prevent a later
completion record.

### Success Criteria:

#### Automated Verification:

- AI-save parser/service tests prove exact keys, legacy/history-aware RPC selection, owner validation, atomic
  retention/save events, lineage copying, and rollback on linkage failure.
- Database tests prove the distinct non-overloaded RPC set, least-privilege lineage write, completion idempotency,
  owner isolation, CAS/advisory-lock preservation, completion-event creation after raw proposal expiry, and normal
  completion with no or unmatched lineage marker.
- Clean reset, schema lint, pgTAP, generated-type drift, and existing lifecycle/concurrency gates pass.

#### Manual Verification:

- Saving a history-aware draft records server-derived retained/save evidence and only an opaque lineage UUID on the
  workout.
- Completing after raw proposal expiry creates time-bounded completion telemetry while leaving the workout and durable
  preferences intact.

**Implementation Note**: This is the only checkpoint permitted to change the AI-save or completion SQL contracts.

---

## Phase 4B: Preference Feedback and Interaction UI

### Overview

Build the remaining history-aware browser controls against the final lifecycle contracts from Phase 4A. The stale
page-load eligibility gate, reduced-workout dialog, active-proposal state, and atomic re-roll provenance were already
delivered by Phase 3 and are explicitly out of scope here.

### Changes Required:

#### 1. Like and Don't suggest controls

**Files**: `src/components/workouts/WorkoutBuilder.tsx`, `src/components/workouts/WorkoutDraftEditor.tsx`,
`src/lib/ai-workout-feedback-client.ts`, `src/lib/ai-workout-feedback-client.test.ts`,
`src/pages/api/workouts/ai/preferences.ts`, and pure Node parser/client tests.

**Contract**: Show optional Like and **Don't suggest** controls only for IDs in the active proposal's original exercise
set, never for later manual additions. Hydrate pressed state from the history-aware response and update it only after a
successful authenticated, same-origin, strictly versioned preference mutation. One preference replaces the other;
clearing returns to neutral. A successful change affects only future generations and never silently reorders or removes
the current draft.

#### 2. Display and edit telemetry

**Files**: `src/components/workouts/WorkoutBuilder.tsx`, `src/components/workouts/WorkoutDraftEditor.tsx`,
`src/lib/ai-workout-planner-state.ts`, `src/lib/ai-workout-feedback-client.ts`,
`src/lib/ai-workout-feedback-client.test.ts`, `src/pages/api/workouts/ai/events.ts`, a forward telemetry migration,
`supabase/tests/database/ai_recommendation_feedback.test.sql`, and pure Node tests.

**Contract**: After a validated history-aware response commits to active browser state, send an idempotent non-blocking
`exposure` acknowledgement. Proposal creation before the HTTP response is not display exposure. Enforce one exposure
per proposal in the database with a partial unique index and an `ON CONFLICT DO NOTHING` path in the narrow event helper;
test a duplicate delivery produces exactly one row. Define a strictly versioned exact-key event request and a
discriminated editor mutation contract: `remove` carries the removed original proposal exercise ID and `swap` carries
the original proposal exercise plus its replacement. The editor emits that mutation before the draft-state callback;
add, reorder, prescription-only edits, and edits of manually added exercises emit no proposal event. Event failures
preserve the local draft and active proposal. Do not add a browser re-roll event because Phase 3 records that provenance
atomically.

#### 3. Accessible, private presentation

**Files**: `src/components/workouts/WorkoutBuilder.tsx`, `src/components/workouts/WorkoutDraftEditor.tsx`, and
corresponding tests.

**Contract**: Preserve 44px targets, visible focus, live pending/error messaging, long-name wrapping, and no horizontal
overflow from 360px through desktop. Copy says “never completed in this app,” not “never tried,” and browser props or
responses expose only safe active-proposal metadata, opaque IDs, and necessary confirmation tokens.

### Success Criteria:

#### Automated Verification:

- Pure preference request/parser/client and discriminated interaction-mutation tests pass through `pnpm test:ai-workout`.
- Database tests prove duplicate exposure delivery creates exactly one event.
- Existing AI, manual, planned-workout, and history suites remain green; Astro sync and repository lint pass.

#### Manual Verification:

- Like and **Don't suggest** persist, are mutually exclusive, and affect only later proposals.
- Display acknowledgement is idempotent; removal and swap are owner-scoped, typed, and non-blocking; re-roll is
  recorded once. Reordering, prescription-only edits, and manually added exercises create no proposal event.
- Feedback controls work with keyboard and screen-reader semantics at mobile and desktop widths.

**Implementation Note**: Do not change the AI-save/completion transaction or CI configuration in this checkpoint.

---

## Phase 4C: Release Gates and Operational Verification

### Overview

Make the completed S-08 behavior continuously verifiable and collect the explicitly human-only Worker and retention
evidence. This checkpoint contains no product-feature changes.

### Changes Required:

#### 1. CI, documentation, and operational verification

**Files**: `.github/workflows/ci.yml`, `package.json`, `README.md`,
`context/deployment/deployment-plan.md`, and `docs/reference/contract-surfaces.md`.

**Contract**: Include every new Node test in `pnpm test:ai-workout` and add it as a distinct CI step before Astro
sync/lint/build. Preserve all database, concurrency, generated-type, crypto, manual, planned, and history gates.
Document independent confirmation-secret provisioning/rotation, history-aware Worker smoke steps, reduced
confirmation/no-call behavior, preference behavior, 90-day cleanup verification, safe diagnostics, migration rollout,
and additive rollback. Do not deploy, push linked migrations, or modify real secrets during implementation.

### Success Criteria:

#### Automated Verification:

- CI executes `pnpm test:ai-workout` as a distinct step.
- Clean database, schema lint, pgTAP, generated-type drift, concurrency, crypto, manual, planned-workout, history, Astro
  sync, repository lint, and production Worker build gates pass.

#### Manual Verification:

- A human verifies five-plus, 3–4, and fewer-than-three candidate outcomes; persistence and owner-scoped lifecycle
  telemetry; retention; cold-start regression; and responsive accessible behavior.
- A human performs the disposable-key Worker-runtime smoke test and retention-job inspection using sanitized
  diagnostics. This release gate cannot be self-attested by implementation code.

**Implementation Note**: Human Worker smoke and retention-job confirmation are required before the change is complete.

---

## Testing Strategy

### Database Tests:

- Verify completion-profile signature, invoker security, empty search path, grants, owner/completed-only filtering,
  aggregation, deterministic latest-workout membership, and empty history.
- Verify preference uniqueness, valid state transitions, canonical exercise references, owner RLS, account cascade,
  idempotency, and cross-owner denial.
- Verify proposal/exercise/event schemas, typed event shapes, expiry derivation, owner linkage, workout preservation, and
  invalid transition rejection.
- Verify scheduled cleanup identity, non-duplication, expired-row deletion, durable preference preservation, and no
  workout mutation.
- Verify save/completion linkage is idempotent, survives raw proposal expiry through the opaque lineage marker, and
  preserves existing AI/manual lifecycle, CAS, locking, rollback, RLS, and immutable-history contracts.

### Unit Tests:

- Pure recovery-first ranking across no/sparse/established history, explicit positive/negative preferences, similarity
  thresholds, adaptive exploration, MMR, feasible coverage, ties, seed variation, and all candidate-count boundaries.
- Confirmation token signing/verification, nonce consumption, expiry, owner binding, tampering, missing signing
  configuration, candidate fingerprint mismatch, and reduced-mode rejection after state changes.
- Cold-start and history-aware prompt isolation, byte ceilings, response validation, mode metadata, and exact browser
  parsing.
- Orchestration call ordering and no-provider guarantees for confirmation, insufficient candidates, missing key/model,
  persistence failures, invalid acknowledgements, and oversized prompts.
- UI state transitions for dialog cancel/confirm, pending prevention, draft and active-proposal preservation, preference
  hydration, display acknowledgement, re-roll linkage, safe error recovery, and proposal identity.

### Integration Tests:

- Use mocked OpenRouter transport and typed Supabase dependencies in Node tests; CI never uses a real provider key.
- Compile API routes, SSR page, React island, generated database types, and Cloudflare Worker runtime through Astro sync,
  lint, and production build.
- Exercise database functions with two authenticated users and local completed-workout fixtures.
- Preserve the complete local database and concurrency suite as the executable lifecycle/security regression boundary.

### Manual Testing Steps:

1. Create history fixtures that produce at least five, exactly four, exactly three, exactly two, and zero ready
   candidates at a fixed clock boundary.
2. Verify normal generation at five-plus never exposes a reduced-size control.
3. Verify 3–4 returns confirmation before provider use; cancel, confirm, token expiry, and recovery-state changes all
   produce the specified outcomes.
4. Verify fewer than three produces no AI call and leaves the manual catalogue/editor available.
5. Like one eligible exercise and mark another **Don't suggest**; reload and confirm the states persist and affect only
   subsequent generation.
6. Generate and re-roll with sparse and established histories; confirm the adaptive unseen quota, safe wording, feasible
   coverage, and seeded variation.
7. Retry an exposure acknowledgement and confirm exactly one exposure row exists. Remove and swap original proposal
   exercises, then add/reorder/change prescriptions on manual items; inspect that only the removal/swap actions create
   owner-scoped typed events. Restore, save, replace an existing plan, and complete the saved workout; inspect the
   correct proposal/workout linkage.
8. Run the retention job against expired fixtures and confirm workout history/preferences remain intact; inspect job
   status through the documented safe query.
9. Repeat preference, event, proposal, save, and completion requests as another user with supplied IDs and confirm
   isolation.
10. Repeat the principal flow at 360px and desktop widths with keyboard and assistive-technology checks.
11. In a Worker-runtime preview or deployment, use a disposable OpenRouter key for normal and confirmed-reduced
    generation, then inspect sanitized diagnostics and remove the key.

## Performance Considerations

- Aggregate lifetime completion data in PostgreSQL and return one compact row per previously completed exercise; do not
  transfer raw lifetime workouts to the Worker.
- Reuse the existing owner/status/completion index and catalogue cap. Add indexes only for owner/preference lookup,
  proposal identity/linkage, and expiry cleanup paths proven by the new schema.
- Rank at most the bounded canonical catalogue in pure TypeScript. Avoid request-time training, embeddings, vector
  search, Wasm, or tensor runtimes within the Worker CPU/memory budget.
- Keep prompts limited to the vetted shortlist and preserve the 64 KiB input and 128 KiB provider-response ceilings.
- Do not automatically retry OpenRouter calls; re-roll and confirmed reduced generation are explicit BYOK actions.
- Batch or bound telemetry writes where possible, but do not allow unbounded client queues or raw event reads in the
  generation path.

## Migration Notes

- Use forward-only migrations for the completion-profile function, feedback/proposal/confirmation schema, narrow RPCs,
  a distinct history-aware AI-save RPC plus private linkage helper while retaining the legacy AI-save RPC, opaque
  workout lineage marker, same-signature completion function body, and scheduled cleanup. Never edit an applied
  migration.
- Regenerate `src/types/database.types.ts` from a clean local database and normalize it with the pinned Prettier.
- The new schema is additive. Rolling application code back leaves unused private tables/functions, opaque workout
  lineage markers, and the cleanup job; preserve them until a deliberate follow-up migration verifies no active S-08
  client depends on them.
- Unscheduling or replacing the cleanup job is a distinct migration/operational action. Do not disable retention merely
  because application code is rolled back.
- Hosted migration application requires the existing human review and explicit approval flow. This plan does not
  authorize `supabase db push`, Worker deployment, or secret mutation.
- Preference and telemetry account cascades must be tested before rollout. Expired telemetry deletion must never cascade
  into planned or completed workouts.

## References

- Change research: `context/changes/history-aware-ai-proposal/research.md`
- Product requirements: `context/foundation/prd.md` (v2)
- Roadmap slice: `context/foundation/roadmap.md` (v4), S-08
- Stack constraints: `context/foundation/tech-stack.md`
- Database and recovery contracts: `docs/reference/contract-surfaces.md`
- Cold-start implementation plan: `context/archive/2026-09-05-cold-start-ai-planned-workout/plan.md`
- Recovery implementation plan: `context/archive/2026-09-04-recovery-aware-manual-builder/plan.md`
- History implementation plan: `context/archive/2026-09-03-history-list-and-filters/plan.md`
- Current generation service: `src/lib/ai-workouts.ts:134`
- Current generation endpoint: `src/pages/api/workouts/ai/generate.ts:13`
- Current recovery projection: `src/lib/recovery-aware-catalogue.ts:55`
- Current proposal validator: `src/lib/ai-workout-contract.ts:63`
- Current browser metadata parser: `src/lib/ai-workout-client.ts:17`
- Current shared builder: `src/components/workouts/WorkoutBuilder.tsx:92`
- Current history service: `src/lib/workout-history.ts:104`
- Current workout schema/indexes: `supabase/migrations/20260820090200_create_workout_lifecycle.sql:5`
- Supabase Cron scheduling: `https://supabase.com/docs/guides/cron`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Private Recommendation and Telemetry Data Contracts

#### Automated

- [x] 1.1 Clean local migrations apply — 86a2e18
- [x] 1.2 Public schema lint passes — 86a2e18
- [x] 1.3 Completion-profile database contract tests pass — 86a2e18
- [x] 1.4 Preference, telemetry, ownership, expiry, and cleanup database tests pass — 86a2e18
- [x] 1.5 Generated database types match the clean schema — 86a2e18
- [x] 1.6 Profile loader and AI tests pass — 86a2e18
- [x] 1.7 Existing workout database and concurrency tests remain green — 86a2e18
- [x] 1.8 Repository lint passes — 86a2e18

#### Manual

- [x] 1.9 Recommendation data remains owner-isolated across two users — 86a2e18
- [x] 1.10 Exactly one safe retention job is installed — 86a2e18
- [x] 1.11 Expired telemetry cleanup preserves preferences and workout history — 86a2e18
- [x] 1.12 Account deletion cascades through private recommendation data — 86a2e18

### Phase 2: Recovery-constrained Recommendation Engine

#### Automated

- [x] 2.1 Pure recommender tests pass — bd2b21a
- [x] 2.2 Recovery and explicit exclusions always win over ranking signals — bd2b21a
- [x] 2.3 Exact recovery-boundary and latest-deadline tests pass — bd2b21a
- [x] 2.4 Like and familiarity precedence tests pass — bd2b21a
- [x] 2.5 Sparse and established history policies apply correctly — bd2b21a
- [x] 2.6 Adaptive exploration and confidence-gating tests pass — bd2b21a
- [x] 2.7 Feasible coverage and MMR diversity tests pass — bd2b21a
- [x] 2.8 Deterministic seed and tie behavior tests pass — bd2b21a
- [x] 2.9 Candidate-count boundary tests pass — bd2b21a
- [x] 2.10 Existing manual recovery tests remain green — bd2b21a
- [x] 2.11 Repository lint and production build pass — bd2b21a

#### Manual

- [x] 2.12 Recommendation reasons remain evidence-safe and explainable — bd2b21a
- [x] 2.13 Liked-recovering and familiar-excluded exercises stay ineligible — bd2b21a
- [x] 2.14 Reduced mode is unreachable with five ready candidates — bd2b21a

### Phase 3: Mode-aware Generation and Reduced-workout Handshake

#### Automated

- [x] 3.1 Mode-aware command, confirmation, prompt, validator, service, client, and state tests pass — 846418b, 601b9b7
- [x] 3.2 Cold-start 5–7 full-body regressions remain green — 846418b, 601b9b7
- [x] 3.3 History-aware normal requests use only history-aware contracts — 846418b, 601b9b7
- [x] 3.4 Pre-provider confirmation and insufficient-candidate short-circuits pass — 846418b, 601b9b7
- [x] 3.5 Confirmation acceptance and cancellation behavior tests pass — 846418b, 601b9b7
- [x] 3.6 Confirmation token signature, ownership, expiry, and freshness tests pass — 846418b, 601b9b7
- [x] 3.7 Five-plus recomputation invalidates reduced mode — 846418b, 601b9b7
- [x] 3.8 History-aware prompt privacy and byte-budget tests pass — 846418b, 601b9b7
- [x] 3.9 History-aware provider-output validation tests pass — 846418b, 601b9b7
- [x] 3.10 Active proposal identity, preference hydration, and re-roll linkage tests pass — 846418b, 601b9b7
- [x] 3.11 Existing application suites remain green — 846418b, 601b9b7
- [x] 3.12 Repository lint and production build pass — 846418b, 601b9b7

#### Manual

- [x] 3.13 API responses and logs exclude private generation data — 846418b, 601b9b7
- [x] 3.14 Five-plus candidates never expose or accept reduced mode — 846418b, 601b9b7
- [x] 3.15 Confirmed 3–4 candidate generation calls the provider only after acceptance — 846418b, 601b9b7
- [x] 3.16 Fewer than three candidates preserve manual planning — 846418b, 601b9b7

### Phase 4A: Save and Completion Lifecycle Data Contract

#### Automated

- [x] 4A.1 AI-save parser and legacy/history-aware RPC selection tests pass
- [x] 4A.2 Save linkage, retention, completion, grants, and database contract tests pass
- [x] 4A.3 RPC signatures, types, reset, schema lint, and generated-type drift gates pass
- [x] 4A.4 Existing lifecycle and concurrency gates remain green

#### Manual

- [x] 4A.5 Saving a history-aware draft records server-derived lifecycle evidence
- [x] 4A.6 Completion after raw proposal expiry preserves workout and durable preferences

### Phase 4B: Preference Feedback and Interaction UI

#### Automated

- [ ] 4B.1 Pure preference request, parser, and client tests pass
- [ ] 4B.2 Exposure deduplication and discriminated removal/swap mutation tests pass
- [ ] 4B.3 Existing AI, manual, planned-workout, and history suites remain green
- [ ] 4B.4 Astro sync and repository lint pass

#### Manual

- [ ] 4B.5 Like and Don't suggest persist, remain mutually exclusive, and affect future proposals only
- [ ] 4B.6 Interaction telemetry is owner-scoped, typed, and non-blocking
- [ ] 4B.7 Mobile, desktop, keyboard, screen-reader, focus, and overflow behavior is correct

### Phase 4C: Release Gates and Operational Verification

#### Automated

- [ ] 4C.1 CI executes the AI workout test suite as a distinct gate
- [ ] 4C.2 Clean database, generated-type, concurrency, and focused application gates pass
- [ ] 4C.3 Astro sync, repository lint, and production Cloudflare Worker build pass

#### Manual

- [ ] 4C.4 Human verifies candidate-count, retention, cold-start, and lifecycle regression scenarios
- [ ] 4C.5 Disposable-key Worker-runtime history-aware smoke test and retention-job inspection are confirmed by a human
