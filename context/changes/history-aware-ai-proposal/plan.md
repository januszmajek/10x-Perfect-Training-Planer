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

Each returned proposal has a private proposal identity. The application records exposure, re-roll, exercise removal,
swap, retention, save, and later completion events. Optional per-exercise Like and **Don't suggest** controls persist
until changed or account deletion and affect the next request deterministically. Raw proposal and interaction records
expire through a database-scheduled purge and are never retained beyond the documented 90-day policy. Cold-start
generation, manual editing, AI-origin saving, planned-workout replacement, and completed-history behavior remain
compatible.

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
validates independently, records the proposal, and returns the same editable draft shape plus mode and proposal
metadata.

Extend the existing builder rather than creating a new route. Remove the page-load eligibility gate, let the
authenticated POST determine current mode, render the reduced-size confirmation dialog only for the typed server
outcome, and add per-proposal preference controls. Telemetry must never make local editing inaccessible: user-visible
preference mutations report durable failures, while non-critical behavioral event failures use sanitized diagnostics
and preserve the draft.

## Critical Implementation Details

### Timing & lifecycle

The reduced-workout decision must be derived from the same fresh profile, preferences, catalogue, recovery clock, and
ranking configuration used by the eventual provider request. The confirmation token therefore binds owner, mode,
ready-candidate fingerprint, allowed count, and expiry. The acknowledged request must recompute state and reject a stale
token; it must never honor reduced mode if recomputation finds at least five ready candidates.

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
and event rows carry a database-derived expiry boundary implementing the 90-day maximum retention policy. Any planned
workout linkage is nullable and owner-checked; deleting expired telemetry must not delete or mutate a workout.
Add a separate short-lived, single-use reduced-generation confirmation record containing only owner, candidate
fingerprint, allowed count, expiry, and consumption state; it is operational authorization, not 90-day telemetry.

#### 3. Feedback mutation and proposal-recording functions

**Files**: `supabase/migrations/<timestamp>_create_ai_recommendation_feedback.sql`,
`supabase/tests/database/ai_recommendation_feedback.test.sql`, `src/types/database.types.ts`

**Intent**: Keep ownership, allowed event transitions, preference precedence, and proposal-to-workout linkage
server-authoritative instead of exposing generic table writes.

**Contract**: Add narrow authenticated functions for setting/clearing one exercise preference, atomically recording a
validated proposal with its ordered exercise provenance, appending allowed edit/re-roll events, and linking the final
AI save/completion lifecycle. Functions derive the owner, validate referenced proposal/exercise/workout ownership and
state, use invoker security with empty search paths, and expose stable SQLSTATE outcomes. Browser input cannot set an
owner, expiry, generation mode, seed, similarity score, or arbitrary event type. Preference functions are idempotent;
`dont_suggest` and `liked` are mutually exclusive for one exercise.
Add narrow server-only creation and authenticated consumption functions for reduced-generation confirmations. Persist
only a digest of the random browser token, bind it to the authenticated owner and candidate fingerprint, and consume it
atomically at most once.

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
`src/lib/ai-workout-confirmation.ts`, `src/lib/ai-workout-confirmation.test.ts`

**Intent**: Extend the strict browser command only enough to acknowledge a server-discovered reduced proposal while
preventing client-selected size or stale confirmation reuse.

**Contract**: Preserve the current versioned normal command and add one exact optional acknowledgement form carrying
only an opaque confirmation token. The token is random, short-lived, stored only as a database digest, and validated
through the single-use owner-scoped confirmation function; its record binds history-aware mode, eligible-candidate
fingerprint, allowed count, and expiry. Parsing rejects extra fields, requested counts, seeds, model/provider inputs,
malformed tokens, replay, and expired acknowledgements. Tokens never appear in logs.

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

**Contract**: Replace the hard-coded metadata literal with a discriminated `cold_start | history_aware` union including
proposal ID, exercise count, and reduced flag only on success. Add typed failure/decision codes for reduced confirmation,
stale confirmation, and insufficient candidates with an optional safe available count/token only on the confirmation
response. Exact-key parsers reject unknown metadata. Failed requests preserve the current draft. Success request IDs
remain diagnostic metadata and are not rendered as errors.

#### 6. Proposal recording and re-roll linkage

**Files**: `src/lib/ai-workouts.ts`, `src/lib/history-aware-ai-profile.ts`,
`src/lib/ai-workouts.test.ts`

**Intent**: Assign a private proposal identity and record exposure/re-roll provenance without sending internal ranking
state to the browser.

**Contract**: After provider output passes validation, record the exact returned proposal and permitted derived
provenance through the narrow database function before returning its ID. A re-roll request links the newly exposed
proposal to the prior browser-held proposal ID only after owner validation. Database failures map to safe outcomes;
provider content and private profile data never enter diagnostics. Cold-start behavior remains compatible and is not
required to create the history-aware feedback trail.

### Success Criteria:

#### Automated Verification:

- Mode-aware command, confirmation, prompt, validator, service, client, and planner-state tests pass with
  `pnpm test:ai-workout`
- Cold-start regression fixtures retain their exact 5–7 full-body behavior
- History-bearing normal requests cannot use cold-start validation or metadata
- Confirmation-required and insufficient-candidate outcomes make zero provider calls
- Cancelled confirmation makes no second request; valid confirmation is required before reduced provider use
- Stale, expired, cross-owner, and candidate-mismatched tokens are rejected before provider use
- Recomputed five-plus eligibility invalidates reduced mode even with a formerly valid token
- History-aware prompts contain only the vetted shortlist/reasons and stay below the 64 KiB ceiling
- Provider output outside shortlist, recovery, size, uniqueness, prescription, or feasible-coverage contracts fails
- Proposal identity and re-roll linkage remain owner-scoped and browser responses contain no raw history
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

## Phase 4: Preference UI, Lifecycle Telemetry, and Release Gates

### Overview

Deliver the history-aware experience through the existing shared builder, connect explicit and behavioral feedback to
the workout lifecycle, add the missing CI gate, and verify the privacy/retention contract in the Worker runtime.

### Changes Required:

#### 1. Shared builder mode and reduced confirmation UI

**Files**: `src/pages/workouts/new.astro`, `src/components/workouts/WorkoutBuilder.tsx`,
`src/lib/ai-workout-planner-state.ts`, corresponding test files

**Intent**: Remove the stale page-load cold-start gate and let one generation control handle current server-selected
mode plus the approved reduced-workout decision.

**Contract**: Stop loading/passing `initialEligibility`; the authenticated POST is authoritative. Keep one Generate
action and the current draft-preservation behavior. On the typed 3–4 candidate response, open an accessible dialog that
states the count and offers **Generate smaller workout** or **Keep planning manually**. Cancel preserves the draft and
makes no provider call. Confirm sends the acknowledgement token, prevents duplicate actions, and replaces the draft only
after validated success. Fewer-than-three feedback keeps manual editing available.

#### 2. Like and Don't suggest controls

**Files**: `src/components/workouts/WorkoutBuilder.tsx`,
`src/components/workouts/WorkoutDraftEditor.tsx`, `src/lib/ai-workout-feedback-client.ts`,
`src/lib/ai-workout-feedback-client.test.ts`, `src/pages/api/workouts/ai/preferences.ts`

**Intent**: Let users create durable, immediately effective preference signals without conflating them with catalogue
favorites or implicit completion.

**Contract**: Show optional Like and **Don't suggest** controls for exercises in a history-aware generated proposal.
Controls expose current pressed state, keyboard/focus semantics, touch-sized targets, pending state, and safe retryable
failure feedback. One state replaces the other; clearing returns to neutral. Preference API requests are authenticated,
same-origin, strictly versioned, and operate on canonical exercise IDs through the narrow database function. A
successful change affects future generation only and does not silently remove or reorder the current draft.

#### 3. Edit, retention, re-roll, and save telemetry

**Files**: `src/components/workouts/WorkoutBuilder.tsx`, `src/lib/ai-workout-planner-state.ts`,
`src/lib/ai-workout-feedback-client.ts`, `src/pages/api/workouts/ai/events.ts`,
`src/pages/api/workouts/ai/save.ts`, `src/lib/ai-workouts.ts`, corresponding test files

**Intent**: Record the approved behavioral evidence while preserving local editing responsiveness and the existing
atomic AI-save outcome.

**Contract**: Track proposal exposure server-side. Associate subsequent re-rolls with the prior proposal. Record
exercise remove and swap actions against the active owner-validated proposal through a bounded, strictly typed event
API. At AI save, compare the submitted canonical draft with the recorded proposal server-side and record retained
exercises plus the save/workout linkage; do not trust browser-authored “retained” claims. The proposal ID is optional for
legacy/cold-start save compatibility but mandatory for history-aware telemetry. Extend
`save_ai_planned_workout` with an optional proposal-ID argument, remove the superseded callable signature, and keep null
as the cold-start/legacy path. When supplied, the same save transaction validates owner/proposal state, writes retained
and save events, and links the resulting workout without adding a cascading workout-to-telemetry foreign key. Telemetry
errors preserve local draft state and use safe retry/error behavior; saving must not silently claim complete telemetry
when linkage fails.

#### 4. Completion telemetry linkage

**Files**: `src/lib/planned-workouts.ts`, `src/pages/api/workouts/planned/complete.ts`,
`supabase/migrations/<timestamp>_create_ai_recommendation_feedback.sql`, corresponding application and pgTAP tests

**Intent**: Record that a retained history-aware proposal reached completed history without changing completion's
terminal workout semantics.

**Contract**: Replace the body of the existing `complete_planned_workout(uuid, integer)` function in a forward
migration without changing its callable signature. In the same transaction, after the normal state transition, insert
one idempotent completion event when the completed workout has a live owner-matched history-aware proposal link.
Manual, cold-start, expired-link, and unlinked legacy AI workouts complete exactly as before. Telemetry linkage cannot
change server-owned completion time, prescription immutability, revision behavior, owner isolation, or the planned-
workout advisory lock order; missing or expired proposal data never blocks workout completion.

#### 5. Responsive, accessible, and privacy-safe presentation

**Files**: `src/components/workouts/WorkoutBuilder.tsx`,
`src/components/workouts/WorkoutDraftEditor.tsx`, `src/pages/workouts/new.astro`

**Intent**: Keep generation, confirmation, preferences, and manual fallback usable from 360px through desktop without
exposing the private profile.

**Contract**: Preserve 44px targets, visible focus, dialog focus containment/restoration, live pending/error messaging,
long-name wrapping, and no horizontal overflow. Copy says “never completed in this app,” not “never tried,” and frames
recovery as a planning constraint for AI rather than medical advice. Browser props and network responses contain only
the active proposal, safe preference state for its exercises, public metadata, and opaque identifiers/tokens needed by
the contracts—never raw history or telemetry collections.

#### 6. CI, documentation, and operational verification

**Files**: `.github/workflows/ci.yml`, `package.json`, `README.md`,
`context/deployment/deployment-plan.md`, `docs/reference/contract-surfaces.md`

**Intent**: Make recommendation, feedback, retention, and history-aware generation executable release gates and leave a
safe operating/rollback path.

**Contract**: Include every new Node test in `pnpm test:ai-workout` and add that command as a distinct CI step before
Astro sync/lint/build. Preserve all existing database, concurrency, generated-type, crypto, manual, planned, and history
gates. Document the history-aware Worker smoke flow, reduced confirmation/no-call check, preference behavior, 90-day
cleanup verification, safe diagnostics, migration rollout, and additive rollback. Do not deploy, push linked migrations,
or modify real secrets during implementation.

### Success Criteria:

#### Automated Verification:

- Final AI workout and feedback suite passes: `pnpm test:ai-workout`
- Existing cryptography, manual, planned-workout, and history suites pass
- Clean local database reset, schema lint, pgTAP suite, and generated-type drift check pass
- Existing workout lifecycle and mutation concurrency gates remain green
- CI contains and executes a distinct AI workout test step
- Astro types synchronize successfully: `pnpm astro sync`
- Repository lint passes: `pnpm lint`
- Production Cloudflare Worker build succeeds: `pnpm build`

#### Manual Verification:

- With five or more ready candidates, generation never offers or accepts a reduced-size proposal.
- With exactly 3–4 ready candidates, the dialog appears before provider use; cancel preserves the draft and confirm
  produces only the available ready exercises.
- With fewer than three ready candidates, AI generation is unavailable while manual planning remains usable.
- Like and **Don't suggest** persist across reloads, are mutually exclusive, and deterministically affect the next
  proposal without changing the current draft.
- Re-roll, remove, swap, retention, save, and later completion create only owner-scoped typed events; cross-user IDs and
  expired proposal IDs are rejected safely.
- Expired telemetry is purged on schedule while durable preferences, planned workouts, and completed history remain.
- Cold-start generation, failed-request draft preservation, edit, first save, replacement confirmation, completion,
  and history display remain unchanged.
- At 360px and desktop widths, generation, confirmation, preference controls, editing, and error recovery work with
  keyboard and screen-reader semantics, correct focus restoration, and no overflow.
- A disposable-key Worker-runtime smoke test proves history-aware normal and confirmed-reduced generation, explicit
  preferences, safe failure handling, and absence of private data in browser payloads and logs.

**Implementation Note**: This final phase requires human confirmation of the real-key Worker smoke test and retention
job inspection before the change is considered implemented.

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
- Verify save/completion linkage is idempotent and preserves existing AI/manual lifecycle, CAS, locking, rollback, RLS,
  and immutable-history contracts.

### Unit Tests:

- Pure recovery-first ranking across no/sparse/established history, explicit positive/negative preferences, similarity
  thresholds, adaptive exploration, MMR, feasible coverage, ties, seed variation, and all candidate-count boundaries.
- Confirmation token creation/verification, expiry, owner binding, candidate fingerprint mismatch, and reduced-mode
  rejection after state changes.
- Cold-start and history-aware prompt isolation, byte ceilings, response validation, mode metadata, and exact browser
  parsing.
- Orchestration call ordering and no-provider guarantees for confirmation, insufficient candidates, missing key/model,
  persistence failures, invalid acknowledgements, and oversized prompts.
- UI state transitions for dialog cancel/confirm, pending prevention, draft preservation, preference state, re-roll
  linkage, safe error recovery, and proposal identity.

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
7. Remove, swap, restore, save, replace an existing plan, and complete the saved workout; inspect only owner-scoped typed
   events and the correct proposal/workout linkage.
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
  the revised AI-save signature, same-signature completion function body, and scheduled cleanup. Never edit an applied
  migration.
- Regenerate `src/types/database.types.ts` from a clean local database and normalize it with the pinned Prettier.
- The new schema is additive. Rolling application code back leaves unused private tables/functions and the cleanup job;
  preserve them until a deliberate follow-up migration verifies no active S-08 client depends on them.
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

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Private Recommendation and Telemetry Data Contracts

#### Automated

- [ ] 1.1 Clean local migrations apply
- [ ] 1.2 Public schema lint passes
- [ ] 1.3 Completion-profile database contract tests pass
- [ ] 1.4 Preference, telemetry, ownership, expiry, and cleanup database tests pass
- [ ] 1.5 Generated database types match the clean schema
- [ ] 1.6 Profile loader and AI tests pass
- [ ] 1.7 Existing workout database and concurrency tests remain green
- [ ] 1.8 Repository lint passes

#### Manual

- [ ] 1.9 Recommendation data remains owner-isolated across two users
- [ ] 1.10 Exactly one safe retention job is installed
- [ ] 1.11 Expired telemetry cleanup preserves preferences and workout history
- [ ] 1.12 Account deletion cascades through private recommendation data

### Phase 2: Recovery-constrained Recommendation Engine

#### Automated

- [ ] 2.1 Pure recommender tests pass
- [ ] 2.2 Recovery and explicit exclusions always win over ranking signals
- [ ] 2.3 Exact recovery-boundary and latest-deadline tests pass
- [ ] 2.4 Like and familiarity precedence tests pass
- [ ] 2.5 Sparse and established history policies apply correctly
- [ ] 2.6 Adaptive exploration and confidence-gating tests pass
- [ ] 2.7 Feasible coverage and MMR diversity tests pass
- [ ] 2.8 Deterministic seed and tie behavior tests pass
- [ ] 2.9 Candidate-count boundary tests pass
- [ ] 2.10 Existing manual recovery tests remain green
- [ ] 2.11 Repository lint and production build pass

#### Manual

- [ ] 2.12 Recommendation reasons remain evidence-safe and explainable
- [ ] 2.13 Liked-recovering and familiar-excluded exercises stay ineligible
- [ ] 2.14 Reduced mode is unreachable with five ready candidates

### Phase 3: Mode-aware Generation and Reduced-workout Handshake

#### Automated

- [ ] 3.1 Mode-aware command, confirmation, prompt, validator, service, client, and state tests pass
- [ ] 3.2 Cold-start 5–7 full-body regressions remain green
- [ ] 3.3 History-aware normal requests use only history-aware contracts
- [ ] 3.4 Pre-provider confirmation and insufficient-candidate short-circuits pass
- [ ] 3.5 Confirmation acceptance and cancellation behavior tests pass
- [ ] 3.6 Confirmation token ownership, expiry, and freshness tests pass
- [ ] 3.7 Five-plus recomputation invalidates reduced mode
- [ ] 3.8 History-aware prompt privacy and byte-budget tests pass
- [ ] 3.9 History-aware provider-output validation tests pass
- [ ] 3.10 Proposal identity and re-roll linkage tests pass
- [ ] 3.11 Existing application suites remain green
- [ ] 3.12 Repository lint and production build pass

#### Manual

- [ ] 3.13 API responses and logs exclude private generation data
- [ ] 3.14 Five-plus candidates never expose or accept reduced mode
- [ ] 3.15 Confirmed 3–4 candidate generation calls the provider only after acceptance
- [ ] 3.16 Fewer than three candidates preserve manual planning

### Phase 4: Preference UI, Lifecycle Telemetry, and Release Gates

#### Automated

- [ ] 4.1 Final AI workout and feedback suite passes
- [ ] 4.2 Existing focused application suites pass
- [ ] 4.3 Clean database, schema lint, pgTAP, and generated-type gates pass
- [ ] 4.4 Existing concurrency gates remain green
- [ ] 4.5 CI executes the AI workout test suite
- [ ] 4.6 Astro types synchronize successfully
- [ ] 4.7 Repository lint passes
- [ ] 4.8 Production Cloudflare Worker build succeeds

#### Manual

- [ ] 4.9 Five-plus ready candidates never offer a reduced proposal
- [ ] 4.10 Three-to-four candidate confirmation precedes provider use and preserves cancel state
- [ ] 4.11 Fewer than three candidates keep the manual builder available
- [ ] 4.12 Like and Don't suggest persist and affect only future proposals
- [ ] 4.13 Full proposal lifecycle telemetry remains owner-scoped and typed
- [ ] 4.14 Scheduled expiry preserves durable preferences and workouts
- [ ] 4.15 Cold-start and existing workout lifecycle behavior remain unchanged
- [ ] 4.16 Mobile, desktop, keyboard, screen-reader, focus, and overflow behavior is correct
- [ ] 4.17 Disposable-key Worker-runtime history-aware smoke test is confirmed by a human
