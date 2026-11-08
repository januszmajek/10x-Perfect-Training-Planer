# AI Partial Re-roll Implementation Plan

## Overview

Let the user mark one or more exercises in a non-empty workout draft (AI- or manual-origin) for replacement. The
builder's AI button reads **Replace selected (N)** and is enabled only when at least one exercise is marked; a
**Mark all / Unmark all** shortcut keeps a full re-roll (FR-005) one quick action. A partial re-roll asks the model to
replace only the marked exercises with picks that fit the kept ones; exercises already replaced earlier in the same
draft stay excluded (cumulative exclusion), so A→B followed by replacing B never returns A. Kept exercises keep their
position and their (possibly user-edited) sets/reps. The merged workout must still satisfy FR-004 / FR-017 (feasible
coverage, recovery, Don't suggest, exploration cap, reduced-size confirmation) and FR-018 lineage. Generation failures
are shown both inline (existing `role="alert"`) and as a visual-only sonner toast. An empty draft keeps the unchanged
**Generate workout** initial generation.

The change also includes, as a separable code phase, a deterministic fix for the root complaint that a full re-roll
keeps returning the same workout: a "Mark all" re-roll deprioritises (history-aware) or avoids (cold start) the
exercises currently on screen.

This plan was produced unattended and then revised after user review. Decisions taken autonomously are recorded in
`plan-brief.md` with Source = "Plan (auto)"; the three user-reviewed decisions (cumulative exclusion, failure toast,
button gating) have Source = "User".

## Current State Analysis

- **Single generation route.** `POST /api/workouts/ai/generate` (`src/pages/api/workouts/ai/generate.ts`) parses a
  strict versioned command and calls `generateColdStartAiWorkout` (`src/lib/ai-workouts.ts:176`), which re-checks
  cold-start eligibility on every request and delegates to `generateHistoryAwareAiWorkout`
  (`src/lib/ai-workouts.ts:241`) for accounts with completed history.
- **Command contract.** `parseAiWorkoutGenerationCommand` (`src/lib/ai-workout-client.ts:111`) accepts exactly four
  exact-key shapes: `{version}`, `{version, priorProposalId}`, `{version, confirmationToken}`,
  `{version, confirmationToken, priorProposalId}`. Nothing in the command describes the current draft.
- **Re-roll is lineage only.** `priorProposalId` is only forwarded to `record_ai_workout_proposal` as
  `p_rerolled_from_proposal_id` (`src/lib/ai-workouts.ts:357`); the private RPC validates owner + expiry, reuses the
  lineage UUID and inserts a `reroll` event on the prior proposal; with no prior id it creates a fresh lineage
  (`supabase/migrations/20260909130000_allow_ai_workout_proposal_lineage_rerolls.sql`).
- **Why full re-rolls repeat.** Cold start sends a byte-identical prompt each time (fixed system prompt, catalogue
  sorted by id — `src/lib/ai-workout-prompt.ts:28`; no temperature/seed in `src/lib/openrouter-client.ts`; strict
  `json_schema`). History-aware ranking is deterministic (`seed = 0`, never passed —
  `src/lib/ai-workout-recommender.ts:177`), the shortlist is capped at `proposalCeiling: 7` while the model is asked
  for 5–7 (`src/lib/ai-workout-recommender.ts:19,227`), and familiarity reinforces repeats.
- **Recommender.** Pure function with Don't-suggest + recovery hard filters, familiarity/liked/similarity ranking,
  feasible-coverage reservation over `lower_body | core | upper_body_push | upper_body_pull`, exploration cap
  (2 for ≤2 profile entries, 1 otherwise) and MMR fill (`selectWithMmr`, `src/lib/ai-workout-recommender.ts:134`).
  Its `decision` (normal / reduced 3–4 / insufficient 0–2) counts hard-eligible ready candidates.
- **Validators.** Cold start: `parseAiWorkoutProposal` requires 5–7 unique catalogue ids and all four coverages.
  History-aware: `parseHistoryAwareAiWorkoutProposal` requires shortlist membership, requested size and every
  feasible coverage (`src/lib/ai-workout-contract.ts`).
- **Reduced confirmation.** HMAC-signed token binds `{ownerId, candidateFingerprint, allowedCount 3|4, expiresAt,
  nonce}`; fingerprint = `sha256(sorted ready-candidate ids)` (`fingerprintCandidates`,
  `src/lib/ai-workout-confirmation.ts:41`); nonce digest registered/consumed via
  `register_/consume_ai_reduced_generation_confirmation` (`src/lib/ai-workouts.ts:274-322`).
- **Response contract.** `parseAiWorkoutGenerationResponse` requires 3–7 exercises; cold start ≥ 5; history-aware
  `originalExerciseIds` must equal the proposal ids, `reduced` ⇔ 3–4 (`src/lib/ai-workout-client.ts:150-235`).
- **Save / retention.** `link_history_aware_ai_save_for_current_user` records one `retention` event per proposal
  exercise present in the saved workout, then `save`
  (`supabase/migrations/20260908110000_link_history_aware_ai_workout_lifecycle.sql`). Proposal tables are private;
  the Worker has no read RPC for a proposal's exercises.
- **UI.** `WorkoutBuilder.tsx` owns draft, `draftOrigin`, `activeProposal`, reduced-confirmation state and the
  "Generate workout" button (`:323`), which today replaces any draft (manual or AI) in full; a "full re-roll" is just
  clicking it again (`generationCommand`, `:123`). `WorkoutDraftPanel.tsx` renders each card with sets/reps inputs,
  move, a manual **Replace** (catalogue swap) icon button named `Replace {name}` (`:155`) and Remove; inputs are
  disabled while `pending`. Remove/swap telemetry fires only for `originalExerciseIds`
  (`src/lib/ai-workout-planner-state.ts:21`). Generation failures render one inline `role="alert"`
  (`WorkoutBuilder.tsx`, AI section).
- **Toasts.** `StatusToast` mounts the shared `Toaster` (`src/components/ui/sonner.tsx`) via
  `src/layouts/AuthenticatedLayout.astro:49` (`client:load`), which wraps both `/workouts/new` and `/workouts/edit`;
  `PlannedWorkoutSummary.tsx:133` already calls `toast()` from a separate island, so cross-island toasts work. Sonner
  renders toasts inside an `aria-live="polite"` region.
- **Tests.** Library tests use `node:test` (`src/lib/*.test.ts`, run by `pnpm test:node` in CI and the curated
  `pnpm test:ai-workout` list); component tests use Vitest + jsdom (`src/components/**/*.test.tsx`, fixtures in
  `src/test/ui/workout-fixtures.ts`); Playwright E2E in `e2e/` mocks `/api/workouts/ai/generate` with `page.route`.
  "Generate workout" is clicked on an **empty** draft in `e2e/harness.spec.ts:9` and `e2e/workout-journeys.spec.ts:75`
  and on a **non-empty manual** draft in `e2e/ai-safety.spec.ts:143,160`.
- **Lessons.** `context/foundation/lessons.md`: prove blocking E2E gates in the CI environment; assert user-visible
  state, not cross-host pixels.

## Desired End State

- **Empty draft:** "Generate workout" is enabled (with a configured key) and performs the initial generation, as
  today.
- **Any non-empty draft (AI or manual origin):** each card shows a **Replace with AI** checkbox; the header shows a
  **Mark all / Unmark all** toggle and the button **Replace selected (N)**, disabled with a hint while N = 0. There is
  no implicit unmarked full re-roll.
- **Partial (1 ≤ N < draft length):** merged workout — kept exercises keep position and current sets/reps; new picks
  fill the replaced slots (extra coverage picks appended). Marked, previously replaced (cumulative exclusions) and kept
  exercises are never returned as new picks.
- **All marked:** full re-roll — a fresh proposal (lineage-linked when a prior proposal exists), cumulative
  exclusions reset, and (Phase 4) on-screen exercises are deprioritised/avoided deterministically.
- The merged workout satisfies 5–7 exercises (or a confirmed 3–4 reduced size), every feasible coverage target
  (cold start: all four), new picks recovery-compatible and not Don't-suggest, and the FR-017 exploration cap counting
  kept never-completed exercises — enforced by both shortlist construction and the pick validator. The partial
  reduced-size (3–4) path is reachable only when the account-wide ready count is below five, exactly as FR-017 says.
- History-aware results are recorded as a new full proposal: with `rerolled_from_proposal_id` when the draft came
  from an active proposal, otherwise as a new lineage (manual draft or cold-start draft).
- Every generation failure (including `invalid_output` and `replacement_not_feasible`) shows the inline alert with
  full guidance and a visual-only toast; screen readers hear the message once (inline alert).
- PRD FR-005 carries a clarifying note; `docs/reference/contract-surfaces.md` documents command, error code,
  exclusion and lineage semantics.

Verify with `pnpm test:node`, `pnpm test:ui`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`, plus the manual steps in
"Testing Strategy".

### Key Discoveries:

- Response shape can stay unchanged if the server returns the full merged proposal — `isProposal` already allows 3–7
  and `originalExerciseIds` = all proposal ids (`src/lib/ai-workout-client.ts:77,202-215`).
- `record_ai_workout_proposal` accepts any 3–7 distinct catalogue ids, links lineage when given a prior id and starts
  a new lineage otherwise; no migration is needed (`20260909130000_...sql`).
- Retention is derived at save time from proposal ∩ saved exercises, so recording the merged list keeps retention
  working for kept exercises without new events (`20260908110000_...sql`).
- The confirmation fingerprint column accepts any 64-hex digest; a domain-separated digest that also covers the
  cumulative exclusions needs no schema change (`ai_reduced_generation_confirmations`).
- Request bodies are capped at 32 KiB (`src/lib/workout-api.ts:4`); 20 draft items + 20 exclusions is far below.
- The catalogue has 58 exercises (`supabase/migrations/20260820090100_seed_exercise_catalogue.sql`); excluding up to
  20 + marked ids can exhaust a category in history mode, so infeasibility must be handled explicitly.
- The Toaster is already mounted on both workout pages through `AuthenticatedLayout`; no mounting change is needed.
- The existing manual swap button is named "Replace {name}"; the new control uses a different role and accessible
  name.

## What We're NOT Doing

- No database migration, no new `ai_proposal_event_type`, no new RPC. Partial vs full re-roll and replaced ids are
  derivable offline by diffing the prior and new proposal's exercises **only when a prior proposal exists**; a partial
  on a manual or cold-start draft records a new-lineage proposal indistinguishable in the database from an initial
  generation (documented in Phase 5, listed in the brief's Open Risks).
- No server-side persistence of cumulative exclusions (client-held per draft; lost on reload by design).
- No `removal`/`swap` events emitted for replaced exercises.
- No randomness (`Math.random`, provider `temperature`/`seed`) — PRD Non-Goals require deterministic, explainable
  ranking.
- No change to the shortlist ceiling (7), familiarity weights, exploration-cap definition or reduced-path rules for
  initial generation.
- No change to save routes, `PlannedWorkoutEditor` (edit page gets no AI controls), or History.
- No automatic provider retry on `invalid_output`.
- No toasts for save failures (only generation failures).

## Implementation Approach

Treat a partial re-roll as "generation with fixed context". The browser sends its ordered draft in a new optional
`reroll` field — kept items with their prescription, marked items as `{exerciseId, replace: true}` — plus the
cumulative `excludedExerciseIds` for the current draft. The server:

1. validates the command structurally (parser) and semantically (catalogue membership); the submitted draft is the
   source of truth, which is safe because the user may freely edit the draft anyway;
2. builds the candidate pool with kept, marked and excluded ids removed, computes coverage already provided by kept
   exercises, the remaining exploration budget and the number of new picks (pure `planPartialReroll`);
3. short-circuits pre-provider on infeasibility (`replacement_not_feasible`) or on the reduced path (confirmation
   token bound to a fingerprint over pool + kept + marked + excluded);
4. prompts the model with kept exercises as fixed context and only the candidates in the response-schema enum;
5. validates the new picks and the merged workout, merges positionally, records the merged list as a new proposal
   (history-aware) and returns the existing response shape.

The browser replaces its draft with the merged proposal (so kept prescriptions round-trip unchanged), sets
`draftOrigin = "ai"`, clears the selection and adds the replaced ids to its exclusion list. "Mark all" uses the same
`reroll` field with every item marked and no exclusions; the server treats it as a full re-roll (Phase 2) that
Phase 4 turns into a deterministic variety signal.

Pure logic lives in a new `src/lib/ai-workout-partial-reroll.ts` (planning, validation, merge) plus additive inputs
on the recommender, prompt and confirmation modules, so `ai-workouts.ts` only orchestrates. Browser state logic lives
in `src/lib/ai-workout-planner-state.ts` and one hook in `src/components/hooks/`.

## Critical Implementation Details

### State sequencing

Kept, marked and cumulative-excluded ids must be removed from the candidate pool **before** the pool count, feasible
coverage, partial plan and confirmation fingerprint are computed; the account-wide ready count used for the FR-017
reduced-path gate is taken **before** that removal. The partial branch decides only via `planPartialReroll` and never
reads `recommendation.decision` (which, after exclusion, would report "insufficient" for small pools even when kept +
pool ≥ 5). Each mode validates the re-roll right after its own catalogue load, and every partial infeasibility,
unknown-id and confirmation decision happens before `decryptOwnedAiProviderKey` and any provider call — cold start
today decrypts before loading the catalogue (`src/lib/ai-workouts.ts:193,206`), so its partial branch loads the
catalogue first. On the client, exclusions are updated only after a successful partial response:
`excluded = cap20(excluded ∪ markedIds)` (oldest evicted first); they are reset on a
successful initial or all-marked generation and whenever the draft becomes empty, and an id is pruned from the list
as soon as the user puts it back into the draft manually (kept wins).

### Timing & lifecycle

The partial confirmation fingerprint is recomputed from fresh data and covers pool, kept, marked and excluded ids
under a domain separator, so a full-generation token cannot authorise a partial request (or vice versa) and any change
to selection or exclusions yields `stale_confirmation`. A token on a request whose recomputation lands on the normal
path is rejected like the existing `REDUCED_NOT_ALLOWED` branch.

### User experience spec

The reduced dialog's confirm resends the exact command that triggered `confirmation_required` (stored with the
confirmation state). Selection is keyed by `exerciseId`, survives reorder and failed generations, drops ids that leave
the draft (remove/swap) and clears only on success. Checkboxes, Mark all and the button are disabled while any
operation is pending and hidden/disabled without a configured key (FR-016 unchanged). Failure toasts use a fixed id
(`ai-generation-failure`) so repeated failures replace rather than stack, show a short code-specific headline only
(full guidance and request ID stay in the inline alert), and wrap their content in `aria-hidden="true"` so the
polite toast region does not re-announce what the inline `role="alert"` already announced; the toast's close button
stays accessible. `confirmation_required` opens the dialog and produces no toast.

## Phase 1: Partial Re-roll Domain Core

### Overview

Add the pure building blocks — planner, recommender inputs, prompt, validator/merge, fingerprint, error code — with
exhaustive `node:test` coverage and no behavior change for existing callers. The browser command parser is widened in
Phase 2 together with the service that honours it, so no intermediate build accepts a partial command and silently
runs a full generation.

### Changes Required:

#### 1. Public error code

**File**: `src/lib/ai-workouts.ts` (type only), `src/lib/ai-workout-client.ts`, `src/lib/ai-workout-api.ts`

**Intent**: Give partial infeasibility a distinct, browser-safe outcome.

**Contract**: Add `replacement_not_feasible` to `AiGenerationErrorCode`, `AI_GENERATION_ERROR_CODES`, the status map
(409) and the "expected decision" `console.info` branch of `logAiGenerationFailure`.

#### 2. Partial re-roll planner, validator and merge

**File**: `src/lib/ai-workout-partial-reroll.ts` (new), `src/lib/ai-workout-partial-reroll.test.ts` (new)

**Intent**: One deterministic module answering "how many picks, is it feasible, is it reduced, is the model output
acceptable, what is the merged workout".

**Contract**:

- `coverageOf(exercise)` — export the coverage derivation the recommender already uses (move `exerciseCoverage` to a
  shared export rather than duplicating it).
- `planPartialReroll({ mode, keptCount k, markedCount r, poolCount c, pickableCount p, accountReadyCount a,
  missingCoverageCount m, missingCoverageFeasible })` →
  `{kind:"normal", newCount:{min,max}} | {kind:"reduced_confirmation_required", mergedSize:3|4, newCount:{min:p,max:p}} | {kind:"not_feasible", reason}`.
  `c` is the pool **after** kept, marked and excluded ids are removed; `p` is what the model may actually pick from
  (history-aware: `shortlist.length`; cold start: `c`); `a` is the account-wide hard-eligible ready count **before**
  removing marked/excluded ids (the count a full generation would use; history-aware only).
  - `floor = max(1, 5 − k)`, `ceil = min(7 − k, p)`.
  - normal when `k + c ≥ 5` and `ceil ≥ floor` (cold start: always required): `min = clamp(r, floor, ceil)`,
    `max = clamp(max(r, m), floor, ceil)` — one-for-one by default, widened only to restore coverage, merged 5–7.
  - history-aware reduced only when `3 ≤ k + p ≤ 4` **and** `a < 5` (FR-017: no reduced path while five ready
    exercises exist account-wide) → `mergedSize = k + p`.
  - otherwise `not_feasible`, with `reason`: `no_candidates` (`p = 0`), `coverage_unreachable` (missing coverage not
    in the pool, or `m > ceil`), `pool_too_small` (history `a ≥ 5` but merged size 5 unreachable after exclusions, or
    `k + p < 3`). All reasons map to `replacement_not_feasible`; `reason` is only a sanitized technical code.
- `parsePartialRerollPicksJson(content, { allowedIds, kept, catalogueById, requiredCoverage, newCount,
  neverCompletedIds, explorationBudget })` → new picks or `malformed_json | invalid_proposal`: exact keys, unique, all
  in `allowedIds` (never kept/marked/excluded), count within `newCount`, prescription bounds, at most
  `explorationBudget` picks from `neverCompletedIds` (history-aware; cold start passes no budget), and **merged**
  (kept ∪ picks) covers every `requiredCoverage` entry.
- `mergePartialReroll(items, picks)` → `ManualWorkoutDraftItem[]`: walk submitted items in order; kept → unchanged
  (submitted sets/reps); marked → next pick in model order, or dropped when picks run out; leftover picks appended.

#### 3. Recommender fixed-context inputs

**File**: `src/lib/ai-workout-recommender.ts`, `src/lib/ai-workout-recommender.test.ts`

**Intent**: Let the existing pipeline rank only replacement candidates while accounting for what kept exercises
already provide.

**Contract**: Add optional `fixedExerciseIds` (kept) and `excludedExerciseIds` (marked ∪ cumulative exclusions) to
`RecommendHistoryAwareWorkoutInput`. When present: both are removed from `candidates` before the decision;
`feasibleCoverage` is computed over candidates ∪ fixed exercises (fixed counted regardless of recovery or
Don't-suggest); coverage reservation only runs for coverage not already provided by fixed exercises; the exploration
cap is reduced by the number of fixed exercises with no completion entry (floor 0); MMR redundancy treats fixed
exercises as already selected but they are never emitted in `shortlist`/`readyCandidates`. In fixed-context mode:
the shortlist target is at least `min(c, max(5, 7 − k))` non-fixed candidates (so `p` can reach `ceil`); never-
completed candidates beyond the remaining exploration budget are excluded from coverage reservation and from the
fallback MMR fill unless one is the sole source of a missing coverage (each such coverage-forced exercise raises the
returned budget by one). Return additionally `fixedCoverage: RecommendationCoverage[]`, `accountReadyCount` (hard-
eligible ready count before fixed/excluded removal), `explorationBudget` and `neverCompletedIds`. With both inputs
absent, output is identical to today.

#### 4. Partial prompts

**File**: `src/lib/ai-workout-prompt.ts`, `src/lib/ai-workout-prompt.test.ts`

**Intent**: Tell the model what is fixed and ask only for the missing picks.

**Contract**: `buildPartialRerollPrompt({ mode, kept, candidates, missingCoverage, requiredCoverage, newCount })`.
System text: existing exercises are fixed and must not be returned; return `min`–`max` unique exercises only from the
candidates; together with the fixed exercises the workout must include every required coverage target; integer
sets 1–99, reps 1–999; JSON schema only. User payload: deterministic sorted JSON of `fixed` (id, name, equipment,
movementPattern, muscles code/category/role), `candidates` (history-aware: existing shortlist serialization incl.
reasons; cold start: existing catalogue serialization), `missingCoverage`, `requestedExerciseCount`. Never include
marked or excluded ids, completion counts/timestamps, preferences outside candidates, proposal ids or tokens. Same
64 KiB ceiling.

#### 5. Partial confirmation fingerprint

**File**: `src/lib/ai-workout-confirmation.ts`, `src/lib/ai-workout-confirmation.test.ts`

**Intent**: Bind reduced-size confirmation to the exact partial request, including exclusions that shaped the pool.

**Contract**: `fingerprintPartialReroll({ candidateIds, keptIds, markedIds, excludedIds })` = SHA-256 hex of
`"partial-reroll-v1\nC:" + sorted(candidateIds) + "\nK:" + sorted(keptIds) + "\nR:" + sorted(markedIds) + "\nX:" + sorted(excludedIds)`
(each list `,`-joined). Must differ from `fingerprintCandidates` for the same candidates and change when any list
changes. Token payload and `allowedCount` (= merged size 3|4) unchanged.

#### 6. Test script

**File**: `package.json`

**Intent**: Keep the curated AI suite complete.

**Contract**: Append `src/lib/ai-workout-partial-reroll.test.ts` to `test:ai-workout` (`test:node` picks it up by glob).

### Success Criteria:

#### Automated Verification:

- Planner boundary tests pass (k = 1…6, c/p = 0…8, one-for-one k = 4/r = 1 → exactly 1 pick, k = 1/r = 6 with p = 5 → 5 picks, r > ceil, m > ceil, ceil < floor, cold-start infeasible coverage)
- Planner FR-017 gate tests pass on both sides: `a = 4`, k + p = 4 → reduced; `a = 7`, k + p = 4 → `not_feasible` (`pool_too_small`)
- Validator/merge tests pass (kept, marked or excluded id returned, out-of-pool id, wrong count, over-budget unseen pick, merged coverage gap, positional merge with fewer/more picks)
- Recommender fixed-context tests pass: k = 1 with a 5-candidate preferred pool still yields a shortlist of ≥ min(c, 6); 2 kept unseen + cap 2 yields no unseen shortlist entries except a sole-coverage source; `recommendation.decision` unused by partial callers; pre-existing recommender tests unchanged and green
- Prompt privacy/determinism and partial fingerprint tests pass (fingerprint changes when exclusions change)
- `pnpm test:node` passes
- `pnpm lint` passes

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to the next phase.

**Implementation notes (Phase 1, as built)**:

- `GENERATION_MESSAGES` in `WorkoutBuilder.tsx` is an exhaustive `Record<AiGenerationErrorCode | …>`, so adding
  `replacement_not_feasible` required its message in this phase to keep the type sound; the Phase 3 copy was used
  verbatim. The rest of the Phase 3 UI work (recovery action, toast, gating) is untouched.
- `coverageOf` lives in `ai-workout-recommender.ts` (renamed from `exerciseCoverage`) and is re-exported from
  `ai-workout-partial-reroll.ts`, avoiding a value-level import cycle.
- Fixed-context mode is active when either `fixedExerciseIds` or `excludedExerciseIds` is passed (even empty).

---

## Phase 2: Server Orchestration for Partial Re-roll

### Overview

Wire the pure core into both generation paths, the confirmation handshake and proposal recording, without changing
the HTTP response shape.

### Changes Required:

#### 1. Generation command contract (moved from Phase 1)

**File**: `src/lib/ai-workout-client.ts`, `src/lib/ai-workout-client.test.ts`

**Intent**: Extend the strict browser command with an optional ordered draft description and cumulative exclusions
while keeping unknown keys and malformed values rejected.

**Contract**: Replace the four-variant exact-key union with a single interface parsed by a key whitelist
(`version` required; `priorProposalId`, `confirmationToken`, `reroll` optional; any other key → `null`). Absent
optional fields are omitted from the parsed object (never `undefined`).

```ts
export const MAX_REROLL_EXCLUSIONS = 20;
export type AiWorkoutRerollItem =
  | { exerciseId: string; sets: number; reps: number } // kept, exact keys
  | { exerciseId: string; replace: true }; // marked, exact keys
export interface AiWorkoutGenerationCommand {
  version: 1;
  priorProposalId?: string;
  confirmationToken?: string;
  reroll?: { exercises: AiWorkoutRerollItem[]; excludedExerciseIds?: string[] };
}
```

Structural rules: 1–`MAX_WORKOUT_EXERCISES` (20) items; canonical, unique UUIDs; kept prescriptions within
`MIN/MAX_SETS`, `MIN/MAX_REPS` safe integers; at least one marked item; at most `MAX_AI_WORKOUT_EXERCISES − 1` (6)
kept items. `excludedExerciseIds`: 0–`MAX_REROLL_EXCLUSIONS` canonical unique UUIDs, disjoint from every item id, and
only allowed on a partial request (present on an all-marked request → `null`). Export helpers
`rerollKeptItems`, `rerollMarkedIds`, `rerollExcludedIds`, `isFullReroll` (every item marked). The four legacy shapes
still parse identically.

#### 2. Per-branch re-roll validation

**File**: `src/lib/ai-workouts.ts`, `src/lib/ai-workouts.test.ts`

**Intent**: Validate a re-roll command against each mode's own fresh catalogue load without adding a query.

**Contract**: Each branch, immediately after its own `loadWorkoutCatalogue` (cold start: moved ahead of
`decryptOwnedAiProviderKey` for re-roll commands; history-aware: the existing parallel profile + catalogue load),
checks that every item id and every excluded id exists in the catalogue, else `validation_failed` (technical
`REROLL_UNKNOWN_EXERCISE`). An all-marked request (`isFullReroll`) follows the existing full path unchanged in this
phase (ids validated but otherwise ignored; Phase 4 adds variety).

#### 3. Cold-start partial branch

**File**: `src/lib/ai-workouts.ts`

**Intent**: Support partial replace for accounts without history, for AI and manual drafts alike.

**Contract**: Pool = catalogue − kept − marked − excluded; required coverage = all four; missing = required − kept
coverage; `planPartialReroll({mode:"cold_start", p: c…})`; `not_feasible` → `replacement_not_feasible` before
`decryptOwnedAiProviderKey` is called. Then credential → `buildPartialRerollPrompt` → `requestOpenRouterWorkout` with `allowedExerciseIds` = pool ids
and `requestedExerciseCount` = `newCount` → `parsePartialRerollPicksJson` → `mergePartialReroll`. Metadata
`{kind:"cold_start", exerciseCount: merged.length}`. Provider error mapping identical to today's cold-start map.

#### 4. History-aware partial branch

**File**: `src/lib/ai-workouts.ts`

**Intent**: Same flow with recovery, preferences, exploration and reduced confirmation.

**Contract**: Call `recommendHistoryAwareWorkout` with `fixedExerciseIds` = kept and `excludedExerciseIds` = marked ∪
excluded; required coverage = `feasibleCoverage`; missing = feasible − `fixedCoverage`; `c = readyCandidates.length`,
`p = shortlist.length`, `a = accountReadyCount`. Decide only via `planPartialReroll`, never `recommendation.decision`.
Plan: `not_feasible` → `replacement_not_feasible` (before decrypt); reduced → same register/verify/consume sequence as today with
`fingerprintPartialReroll` and `allowedCount = mergedSize`; a token on a normal-path partial request →
`stale_confirmation`. Provider call uses shortlist ids and `newCount`; the validator receives the recommender's
`explorationBudget` and `neverCompletedIds`, so over-budget unseen picks end `invalid_output`. After validation and merge, record the merged
ids (merged order) through `record_ai_workout_proposal`, passing `p_rerolled_from_proposal_id` only when
`priorProposalId` is present; a manual-origin or cold-start-origin draft (no prior id) starts a new lineage.
Metadata: `proposalId`, `exerciseCount = merged.length`, `reduced = merged.length < 5`, `originalExerciseIds` = merged
ids, `preferences` derived from the profile for every merged id (liked/neutral, as today).

#### 5. Route

**File**: `src/pages/api/workouts/ai/generate.ts`

**Intent**: No logic change; confirm the parsed command flows through. Only touch if types require it.

**Contract**: Unchanged dependencies object; `parseAiWorkoutGenerationCommand` remains the only gate.

#### 6. API-level E2E guard

**File**: `e2e/ai-safety.spec.ts`

**Intent**: Prove malformed re-roll commands are rejected before services run, without leaking input.

**Contract**: Extend "authenticated AI routes reject non-exact generation and save commands" with a `reroll` carrying
an unknown item key, one with seven kept items and one with an excluded id equal to a kept id → 400
`validation_failed`, body exactly `{code, requestId}`.

### Success Criteria:

#### Automated Verification:

- Command parser tests pass for legacy, partial (with and without exclusions) and all-marked shapes and every rejection case (unknown key, duplicate id, zero marked items, 7 kept items, bad prescription, excluded id overlapping an item, 21 exclusions, exclusions on an all-marked request)
- Service tests pass for cold-start partial: kept prescriptions echoed, picks in marked slots, kept/marked/excluded ids absent from provider enum, merged coverage enforced
- Service tests pass for history-aware partial: fixed and excluded context passed to recommender, merged ids recorded with lineage when a prior id exists and as a new lineage otherwise, metadata consistent with `parseAiWorkoutGenerationResponse`
- Partial `replacement_not_feasible` (including exclusion-induced exhaustion), reduced confirmation (register, verify, consume), cross-mode token rejection and stale-token-after-exclusion-change paths short-circuit before provider use
- Unknown item or excluded catalogue ids return `validation_failed`, and `replacement_not_feasible` is returned, without calling `decryptOwnedAiProviderKey` or the provider (both modes)
- FR-017 gate service test: account-wide ready ≥ 5 with an exhausted partial pool returns `replacement_not_feasible`, never `confirmation_required`
- Existing full-generation and re-roll service tests remain green
- `pnpm test:node` passes
- `pnpm lint` and `pnpm build` pass
- `pnpm test:e2e` passes including the new malformed-command cases

#### Manual Verification:

- With a real OpenRouter key on a history account, a devtools partial request returns a merged workout whose kept items and prescriptions are unchanged
- Worker logs for partial requests contain only requestId/operation/layer/code/technicalCode/elapsedMs
- Local Supabase SQL check of a manual-draft partial on a history account: new lineage, `rerolled_from_proposal_id` null, proposal members include the user-chosen kept exercises

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to the next phase.

**Implementation notes (Phase 2, as built)**:

- History-aware `missingCoverageFeasible` is evaluated over the recommender's `shortlist` (what the model may pick),
  not all ready candidates, so a coverage the shortlist cannot supply ends `replacement_not_feasible` pre-provider
  instead of `invalid_output`.
- `buildPartialRerollPrompt`, `parsePartialRerollPicksJson` and `mergePartialReroll` are imported directly by
  `ai-workouts.ts` rather than injected, keeping the route's dependencies object unchanged (contract item 5).
- Cold start keeps the existing order `eligibility → model check`; only re-roll commands then load the catalogue
  before `decryptOwnedAiProviderKey` (legacy commands keep decrypt-then-catalogue). A cold-start partial ignores a
  `confirmationToken`, matching today's cold-start full path, which has no reduced handshake.
- The reduced-size register/verify/consume sequence was extracted into one helper shared by the full and partial
  history-aware paths; technical codes are unchanged. The four legacy command shapes still parse identically.

---

## Phase 3: Builder UI — Mark, Replace, Exclude, Notify

### Overview

Gate the AI button on the draft state, add per-card marking with Mark all, hold cumulative exclusions, send the right
command, reuse the reduced dialog, and add failure toasts. Update the E2E journeys whose behavior changes.

### Changes Required:

#### 1. Planner state helpers

**File**: `src/lib/ai-workout-planner-state.ts`, `src/lib/ai-workout-planner-state.test.ts`

**Intent**: Keep all selection/exclusion/command logic pure and testable.

**Contract**:
- `getAiButtonState({ draft, selectedIds, credentialConfigured })` →
  `{ mode: "initial" | "replace", label, enabled, hint }`: empty draft → `initial`, "Generate workout", enabled with a
  key; non-empty draft → `replace`, label "Replace selected" when N = 0 (disabled, hint `mark_to_replace`) or
  "Replace selected (N)"; disabled with hint `too_many_kept` when more than 6 would be kept,
  `marked_exceeds_slots` on a partial request (k ≥ 1) when `r > 7 − k` (AI workouts hold at most 7, so marked
  exercises would silently vanish), or `invalid_kept_prescription` when a kept item has invalid sets/reps. All marked
  is enabled (full re-roll) regardless of draft length.
- `buildAiGenerationCommand({ draft, selectedIds, excludedIds, activeProposal })`: empty draft → `{version}` plus
  `priorProposalId` when an active proposal still exists (preserves today's FR-018 `reroll` event when the user clears
  an AI draft and generates again); all
  marked → every item `{exerciseId, replace:true}`, no exclusions, plus `priorProposalId` when an active proposal
  exists; partial → kept items with prescription and marked items in draft order, `excludedExerciseIds` (pruned to ids
  not in the draft, omitted when empty), plus `priorProposalId` when present. Works identically for manual drafts.
- `nextRerollExclusions({ previous, command, mergedIds })`: partial success → `cap20(previous ∪ marked)`
  (oldest evicted; no subtraction needed — picks are never marked or excluded); all-marked or initial success → `[]`.
- `pruneRerollSelection(selectedIds, draft)` and `pruneRerollExclusions(excludedIds, draft)`.

#### 2. Selection hook

**File**: `src/components/hooks/useRerollSelection.ts` (new)

**Intent**: Follow the repo convention of extracting React state hooks.

**Contract**: Holds selected ids (`Set<string>`) and ordered exclusions (`string[]`); exposes `selected`, `toggle`,
`markAll(draft)`, `clearSelection`, `excluded`, `applySuccess(command, mergedIds)`, `reset`; prunes both against the
current draft on every draft change and resets exclusions when the draft becomes empty.

#### 3. WorkoutBuilder wiring

**File**: `src/components/workouts/WorkoutBuilder.tsx`

**Intent**: One button whose meaning follows the draft state; correct commands; consistent feedback.

**Contract**: Button label/enabled/hint from `getAiButtonState` ("Generating…" while pending, as today); hint
rendered as helper text in the AI section ("Mark exercises to replace them, or use Mark all for a new workout.",
"Keep at most 6 exercises when replacing.", "AI workouts hold at most 7 exercises — with {k} kept, mark at most
{7 − k}.", "Fix the highlighted sets/reps before replacing."). **Mark all / Unmark
all** toggle beside it on non-empty drafts. `generateWorkout` sends `buildAiGenerationCommand(...)`;
`reducedConfirmation` also stores the triggering command and the dialog confirm resends it with the token. On success:
replace draft, `draftOrigin = "ai"`, `applySuccess`, set/clear `activeProposal` as today. On failure: keep draft,
selection and exclusions. Add `replacement_not_feasible` to `GENERATION_MESSAGES` ("No eligible replacements fit the
exercises you kept — exercises you already replaced in this draft are not offered again. Your draft is unchanged; mark
fewer exercises, use Mark all to start over with a fresh workout (this clears earlier replacements), or edit
manually.") with recovery action `manual`. Pass
`rerollSelection = { selectedIds, onToggle }` to the editor whenever the draft is non-empty and a key is configured.

#### 4. Failure toast

**File**: `src/components/workouts/WorkoutBuilder.tsx`, `src/lib/ai-workout-planner-state.ts`

**Intent**: Make generation failures noticeable even when the AI section is scrolled out of view, without double
screen-reader announcements.

**Contract**: For every failed generation except `confirmation_required` (dialog) — parsed failure codes, unparseable
responses (`invalid_output`) and network errors — call `toast.error(<span aria-hidden="true">{headline}</span>,
{ id: "ai-generation-failure" })` from `sonner`, with `getGenerationFailureHeadline(code)` returning a short headline
(e.g. `invalid_output` → "The AI returned an unbalanced workout", `replacement_not_feasible` → "No eligible
replacements", default → "Workout generation failed"). The inline `role="alert"` keeps the full message and request ID
and remains the only announced text. No Toaster mounting change (already in `AuthenticatedLayout`).

#### 5. Draft editor and panel

**File**: `src/components/workouts/WorkoutDraftEditor.tsx`, `src/components/workouts/WorkoutDraftPanel.tsx`

**Intent**: Render one checkbox per card when selection is enabled.

**Contract**: New optional prop threaded through the editor (`rerollSelection?: { selectedIds; onToggle }`). Panel
renders, when provided, a native `<input type="checkbox">` with visible label "Replace with AI" and accessible name
`Replace with AI: {name}`, ≥ 44px hit area, disabled while `pending`; marked cards get a highlight via `cn()`.
Existing manual **Replace** icon button, remove, move and inputs unchanged. `PlannedWorkoutEditor` passes nothing.

#### 6. Reduced confirmation copy

**File**: `src/components/workouts/ReducedWorkoutConfirmationDialog.tsx`

**Intent**: Explain that the smaller size includes kept exercises and excludes earlier replacements.

**Contract**: Optional `variant: "full" | "partial"`; partial copy: "Only {count} exercises fit right now, including
the ones you kept (exercises you already replaced are not offered again)…" with the same buttons. Default unchanged.

#### 7. Component and E2E tests

**File**: `src/components/workouts/WorkoutDraftPanel.test.tsx` (new), `e2e/ai-partial-reroll.spec.ts` (new),
`e2e/ai-safety.spec.ts`

**Intent**: Lock the new user-visible contract and adapt journeys whose behavior intentionally changes.

**Contract**:
- Vitest: checkbox renders only with selection props, toggles by exercise id, disabled while pending, distinct from
  the `Replace {name}` button.
- New Playwright spec (route-mocked generate, cold-start fixture): (a) empty draft → "Generate workout" → AI draft;
  button now "Replace selected" disabled; edit sets of a kept exercise; mark two → "Replace selected (2)"; intercepted
  body has ordered `reroll.exercises` with the **edited** kept sets/reps and two marked items and no exclusions — this
  body assertion is the real preservation check; fulfil merged response → new exercises in marked slots (wiring-only
  display check, since the response is mocked). (b) mark one of the new picks → body carries
  `excludedExerciseIds` equal to the two earlier replaced ids. (c) Mark all → body has all items marked and no
  exclusions → full replacement. (d) route returns `replacement_not_feasible` → inline alert text, toast headline
  visible, draft and checkboxes unchanged. (e) manual draft (Add one exercise) → checkboxes visible, Mark all →
  replaced. Assert visible state only (lessons.md). Per lessons.md, run `e2e/ai-partial-reroll.spec.ts` in the CI Linux environment
  (GitHub Actions run of the branch) and confirm it passes there before treating it as a blocking gate.
- Existing E2E impact:
  - `e2e/harness.spec.ts:9` — empty draft, "Generate workout" enabled: **unchanged**.
  - `e2e/workout-journeys.spec.ts:75` — empty draft, "Generate workout": **unchanged**.
  - `e2e/ai-safety.spec.ts:143` ("failed generation keeps an edited manual draft…") — the draft is non-empty manual,
    so "Generate workout" no longer exists: click "Mark all" once before the loop and click "Replace selected (1)" in
    the loop (selection survives failures); keep the draft/sets assertions; assert the failure toast headline appears.
  - `e2e/ai-safety.spec.ts:160` (final full replacement in the same test) — click "Replace selected (1)" (still all
    marked) instead of "Generate workout"; the expected full replacement is unchanged.
  - Inline-alert locators `page.getByRole("alert")` must stay unambiguous with toasts present; if Sonner exposes a
    conflicting role in the pinned version, scope those locators to the AI section.

### Success Criteria:

#### Automated Verification:

- Planner-state helper tests pass (button state per draft/selection incl. `marked_exceeds_slots`, command per origin/selection incl. `priorProposalId` on empty-draft generation, exclusion accumulation/cap/reset/prune, failure headlines)
- `pnpm test:ui` passes including `WorkoutDraftPanel.test.tsx`
- `pnpm test:node` passes
- `pnpm test:e2e` passes including `e2e/ai-partial-reroll.spec.ts`, the updated `e2e/ai-safety.spec.ts` journey and unchanged `harness`/`workout-journeys` specs
- `e2e/ai-partial-reroll.spec.ts` passes in the GitHub Actions Linux CI run before it is treated as blocking
- `pnpm lint` and `pnpm build` pass

#### Manual Verification:

- On mobile (375px) and desktop, checkboxes, Mark all and the button fit without horizontal scroll; keyboard toggles and focus order are sensible
- Screen reader announces each generation failure once (inline alert) and the checkbox as "Replace with AI: {name}"
- History account with fewer than five ready exercises account-wide: partial replace shows the partial reduced-size dialog, and confirm produces that size
- Replace A, then mark its replacement B: A is not returned; removing or swapping a marked exercise updates the count
- Like / Don't suggest and remove/swap telemetry still work on a merged proposal (one new exposure event)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to the next phase.

**Implementation notes (Phase 3, as built)**:

- Row 3.5 (GitHub Actions Linux run of `e2e/ai-partial-reroll.spec.ts`) stays pending: this unattended run may not
  push, so the spec is proven locally only and must not be treated as a blocking gate until a CI run of the branch
  passes (lessons.md). The spec asserts only visible state and request bodies; no screenshots or pixel baselines.
- `getAiButtonState` also returns `keptCount` so the `marked_exceeds_slots` copy can name `k` and `7 − k`; without a
  configured key the hint is `null` (the existing "Add an OpenRouter key" notice is shown instead).
- `buildAiGenerationCommand` returns `null` for a non-empty draft with nothing marked (the button is disabled then),
  so no implicit full re-roll command can be built. `nextRerollExclusions` additionally drops any id present in the
  merged result (defensive; picks are never marked or excluded).
- `useRerollSelection` prunes selection/exclusions by adjusting state during render when the draft identity changes
  (React's recommended alternative), because `react-hooks/set-state-in-effect` rejects a syncing effect.
- A successful generation dismisses the `ai-generation-failure` toast. `replacement_not_feasible` maps explicitly to
  recovery action `manual`. The manual **Replace** button's class concatenation was converted to `cn()` while adding
  the marked-card highlight.
- E2E needed real catalogue ids beyond the five-exercise fixture, so `e2e/local-fixtures.ts` gained
  `loadCatalogueExercises(slugs)` (re-exported with the `WorkoutFixtureExercise` type from `e2e/fixtures.ts`);
  `loadWorkoutFixture` now delegates to it. The updated `ai-safety` journey asserts each failure's toast headline.

---

## Phase 4: Deterministic Variety for Mark-all Re-roll

### Overview

Address the root complaint: an all-marked re-roll deprioritises what the user is looking at, deterministically.
Applies only to the all-marked case (partial requests already hard-exclude); can be dropped without affecting
Phases 1–3. Limits: cold start excludes only the ids currently on screen, so A → B → A two-cycles are possible; the
history-aware penalty only changes shortlist **membership** (the prompt is sorted by id and carries no rank), so a
history account whose preferred pool is ≤ 7 may see no change at all.

### Changes Required:

#### 1. History-aware penalty

**File**: `src/lib/ai-workout-recommender.ts`, `src/lib/ai-workout-recommender.test.ts`, `src/lib/ai-workouts.ts`

**Intent**: Push on-screen exercises behind comparable alternatives without changing eligibility.

**Contract**: Add `rerollRepeatPenalty: 1` to `HISTORY_AWARE_RECOMMENDER_CONFIG` and optional
`penalizedExerciseIds`: subtract the penalty from `rankScore` of matching candidates before coverage reservation and
MMR. Candidate count, `decision` and feasible coverage are unaffected (reduced-path rules unchanged). The service
passes the all-marked ids as `penalizedExerciseIds`.

#### 2. Cold-start avoidance

**File**: `src/lib/ai-workouts.ts`, `src/lib/ai-workouts.test.ts`

**Intent**: Break the identical cold-start prompt on an all-marked re-roll.

**Contract**: Build the prompt, provider enum and validator catalogue from catalogue − on-screen ids when that
reduced catalogue still contains all four coverage categories; otherwise use the full catalogue.

### Success Criteria:

#### Automated Verification:

- Recommender penalty tests pass: shortlist membership changes (penalised exercises drop out) when same-coverage alternatives exist, they stay when they are the only coverage option, decision/count unchanged
- Cold-start all-marked test passes: on-screen ids absent from the provider enum when coverage stays feasible, present otherwise
- `pnpm test:node`, `pnpm test:ui`, `pnpm test:e2e` pass
- `pnpm lint` and `pnpm build` pass

#### Manual Verification:

- With a real key on a cold-start account, each Mark-all result differs from the workout it replaced
- On a history account with a large ready pool, each Mark-all result differs from the workout it replaced when alternatives exist; with a small pool it may repeat but still succeeds

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to the next phase.

**Implementation notes (Phase 4, as built)**:

- Cold-start avoidance additionally requires the reduced catalogue to hold at least five exercises (the cold-start
  validator's minimum), not only all four coverage categories; otherwise the full catalogue is used. With the
  58-exercise catalogue and at most 20 on-screen ids this never triggers in practice.
- The penalty is applied to `rankScore` at candidate construction, so `readyCandidates` order also reflects it; the
  candidate set, `decision`, `accountReadyCount` and `feasibleCoverage` are unchanged (asserted). The history-aware
  full path passes `penalizedExerciseIds` only for an all-marked `reroll`; legacy commands pass no penalty.
- `isPartialReroll` became a plain boolean helper (it was a type guard whose false branch narrowed `command.reroll`
  to `undefined`, which hid the all-marked case from the type checker).

---

## Phase 5: Product and Contract Documentation

### Overview

Record the behavior in the PRD and the contract reference.

### Changes Required:

#### 1. PRD clarification

**File**: `context/foundation/prd.md`

**Intent**: Make partial re-roll an explicit refinement of FR-005, not new scope.

**Contract**: Append a note to FR-005: "On any non-empty draft the user marks the exercises to re-roll; 'Mark all'
re-rolls the whole workout (deterministically deprioritising the exercises shown). Marking some exercises replaces
only those: kept exercises and their sets/reps are preserved, exercises already replaced in the same draft are not
offered again, and the merged workout must satisfy FR-004 and FR-017 (a reduced 3–4 merged workout is offered only
when fewer than five ready exercises exist account-wide). On an empty draft the user generates a new proposal."
Also append a measurement note under the success metric "≥ 75% of generated workouts use the AI proposer"
(`prd.md:49`): a partial re-roll on a manual draft saves the workout with `origin = 'ai'` and makes the user-chosen
kept exercises members of the AI proposal, so their retention and later completion are attributed to the AI lineage
and the workout counts toward the AI share. FR-017 itself is not edited (PRD is locked).

#### 2. Contract surfaces

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Keep the contract reference authoritative.

**Contract**: Rewrite (not merely append to) the two S-07 statements at `contract-surfaces.md:157-159`, flagged as an
**additive contract change**: "accepts only the versioned empty generation command" becomes "accepts the versioned
generation command, optionally carrying `priorProposalId`, `confirmationToken` and a `reroll` draft description";
"no browser request can select a provider, model, credential, or prescription" becomes "no browser request can select
a provider, model or credential; on a re-roll the browser may supply kept prescriptions, which the server bounds-
checks and echoes in the merged proposal but never sends to the provider, and kept, marked and excluded ids are
catalogue-validated". Then in the S-07 / S-08 sections document: the generate command's optional `reroll` field (items, kept
limit 6, `excludedExerciseIds` ≤ 20, partial-only, client-held per draft); `replacement_not_feasible` (409); the
partial reduced-confirmation fingerprint domain (pool + kept + marked + excluded); that a re-roll records the merged
list as a new proposal — lineage-linked only with a prior proposal id, new lineage for manual/cold-start drafts — so
kept exercises (including user-chosen ones) are proposal members and count toward retention, consistent with "lineage
marker does not attest AI selection"; that a manual-draft partial saves with `origin = 'ai'` and attributes retention
and completion of user-chosen kept exercises to the AI lineage; the FR-017 reduced-path gate on the account-wide ready
count; that no new event type exists and replaced ids are derivable by diffing **only when a prior proposal exists**.

### Success Criteria:

#### Automated Verification:

- `pnpm format` leaves no diff in the edited Markdown files
- `pnpm lint` passes

#### Manual Verification:

- Reviewer confirms PRD note and contract-surfaces text match the implemented behavior

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to the next phase.

**Implementation notes (Phase 5, as built)**:

- PRD notes are added as blockquote notes under FR-005 (separate paragraph after the Socrates note) and under the
  ≥ 75%-via-AI secondary metric; FR-017 and every other requirement text are untouched (PRD stays `status: locked`).
- `contract-surfaces.md` also documents the Phase 4 Mark-all behavior (cold-start avoidance with its ≥ 5 /
  four-coverage fallback, history-aware rank penalty) in S-07, since the generate route contract now depends on it.
- 5.1 is scoped to the edited docs (`prd.md`, `contract-surfaces.md`), which are Prettier-clean. `plan.md` itself is
  not Prettier-clean at HEAD in its read-only phase blocks; it was left unformatted to keep those blocks unchanged.

---

## Testing Strategy

### Unit Tests:

- Command parser: legacy shapes; partial/all-marked shapes; exclusions limits, overlap and all-marked rejection;
  unknown keys, duplicates, 0 marked, 7 kept, bad prescriptions, `replace:false`.
- `planPartialReroll`: k = 6/r = 1 → 1 pick; k = 1/r = 1 → 4 picks; k = 4/r = 1 → exactly 1; k = 1/r = 6/p = 5 →
  5 picks; k = 4/r = 1/m = 2 → min 1, max 2; p = 0 → not feasible; k + p = 3 or 4 with a < 5 → reduced, with a ≥ 5
  → not feasible (`pool_too_small`); m > ceil or ceil < floor → not feasible; cold start with a missing coverage
  absent from the pool → not feasible.
- Validator: rejects kept, marked or excluded id, out-of-pool id, duplicate, wrong count, over-budget unseen picks,
  merged coverage gap; accepts a pick covering two missing categories.
- Merge: kept positions/prescriptions preserved; fewer picks drop trailing marked slots; extra picks appended.
- Recommender: kept recovering/Don't-suggest exercise contributes coverage but never appears in shortlist; marked and
  excluded ids never appear; exploration budget reduced by kept never-completed (2 kept unseen + cap 2 → no unseen
  shortlist entries unless sole coverage source); shortlist ≥ min(c, max(5, 7 − k)); `accountReadyCount` counted
  before exclusion; absent inputs → identical output.
- Confirmation: partial fingerprint ≠ full fingerprint; changes with kept/marked/excluded.
- Planner state: button state matrix (empty / non-empty × 0 / some / all marked × valid / invalid kept × >6 kept ×
  r > 7 − k); empty-draft command keeps `priorProposalId` when a proposal is active;
  exclusion accumulation, cap eviction order, reset on all-marked/initial/empty draft, prune on manual re-add.
- Service: cold/history partial happy paths; manual-draft partial without prior id → new lineage; reduced handshake;
  cross-mode and stale tokens; FR-017 gate (account-wide ready ≥ 5 → `replacement_not_feasible`); neither decrypt nor
  provider called on infeasible/unknown ids.

### Integration Tests:

- `e2e/ai-partial-reroll.spec.ts` (partial, cumulative exclusion, Mark all, infeasible + toast, manual draft).
- `e2e/ai-safety.spec.ts`: malformed `reroll` rejection; updated failed-generation journey (Mark all + "Replace
  selected (1)").
- `e2e/harness.spec.ts` and `e2e/workout-journeys.spec.ts` unchanged and green.

### Manual Testing Steps:

1. Cold-start account: generate, edit sets on exercise 1, mark exercises 2 and 3, click "Replace selected (2)";
   exercise 1 keeps its edited sets, 2 and 3 are replaced, workout still has lower/core/push/pull.
2. Mark one of the new picks and replace again; neither original 2 nor 3 comes back.
3. History account: same flow; save; check (SQL, local Supabase) the new proposal has `rerolled_from_proposal_id`
   and retention events include the kept exercises. Repeat from a manual draft: new lineage, no `rerolled_from`.
4. Mark all on an 8-exercise draft → full re-roll; mark 1 of 8 → button disabled with "Keep at most 6" hint; on a
   7-exercise draft keep 2 and mark 5 → enabled, keep 6 and mark 1 → enabled; on a 10-item manual draft keep 4 and
   mark 6 → disabled with the "mark at most 3" hint.
5. History account: keep replacing the push slot until no ready push remains → the merged workout is accepted
   without push (no longer feasible); exhaust the pool entirely → "No eligible replacements…" inline alert + toast,
   draft and selection unchanged, and no reduced-size dialog while five ready exercises exist account-wide; Mark all
   clears exclusions and succeeds.
6. Clear a kept exercise's sets → button disabled with hint.
7. With a screen reader, trigger `invalid_output`: message announced once.

## Performance Considerations

One extra pass over the catalogue to remove fixed/marked/excluded ids and compute coverage; prompts are no larger
than today. No additional database round trips beyond today's (profile, catalogue, optional confirmation RPCs,
proposal record). Exclusion list is bounded at 20 ids.

## Migration Notes

No schema migration and no generated-type change. The command change is additive: legacy shapes keep working; a stale
browser bundle simply never sends `reroll`. The visible behavior change (no implicit full re-roll on a non-empty
draft) ships with the UI phase. Rollback = revert the application commits; recorded proposals are ordinary proposals
and expire through the existing 90-day job.

## References

- Change identity: `context/changes/ai-partial-reroll/change.md`
- Prior change: `context/archive/2026-09-06-history-aware-ai-proposal/plan.md`
- PRD: `context/foundation/prd.md` (FR-004, FR-005, FR-009, FR-016, FR-017, FR-018, Non-Goals)
- Contracts: `docs/reference/contract-surfaces.md`
- Generation service: `src/lib/ai-workouts.ts:176,193,206,241,256,271,276,357`
- Recommender: `src/lib/ai-workout-recommender.ts:19,134,177,227-246`
- Command/response parser: `src/lib/ai-workout-client.ts:77,111,202`
- Builder UI: `src/components/workouts/WorkoutBuilder.tsx:123,323,357`, `src/components/workouts/WorkoutDraftPanel.tsx:155`
- Toasts: `src/layouts/AuthenticatedLayout.astro:49`, `src/components/StatusToast.tsx`, `src/components/workouts/PlannedWorkoutSummary.tsx:133`
- E2E touchpoints: `e2e/ai-safety.spec.ts:143,160`, `e2e/harness.spec.ts:9`, `e2e/workout-journeys.spec.ts:75`
- Lineage/retention SQL: `supabase/migrations/20260909130000_allow_ai_workout_proposal_lineage_rerolls.sql`,
  `supabase/migrations/20260908110000_link_history_aware_ai_workout_lifecycle.sql`
- Lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Partial Re-roll Domain Core

#### Automated

- [x] 1.1 Planner boundary tests pass — 5aa6620
- [x] 1.2 Planner FR-017 reduced-path gate tests pass on both sides — 5aa6620
- [x] 1.3 Validator and merge tests pass including over-budget unseen picks — 5aa6620
- [x] 1.4 Recommender fixed-context tests pass and pre-existing recommender tests are unchanged — 5aa6620
- [x] 1.5 Prompt privacy/determinism and partial fingerprint tests pass — 5aa6620
- [x] 1.6 `pnpm test:node` passes — 5aa6620
- [x] 1.7 `pnpm lint` passes — 5aa6620

### Phase 2: Server Orchestration for Partial Re-roll

#### Automated

- [x] 2.1 Command parser tests pass for legacy, partial, exclusion and all-marked shapes and every rejection case — 9d18ca2
- [x] 2.2 Cold-start partial service tests pass — 9d18ca2
- [x] 2.3 History-aware partial service tests pass including new-lineage case — 9d18ca2
- [x] 2.4 Infeasible, reduced confirmation, cross-mode and stale token paths short-circuit before provider use — 9d18ca2
- [x] 2.5 Unknown ids and infeasible requests never call decrypt or the provider — 9d18ca2
- [x] 2.6 FR-017 gate service test returns replacement_not_feasible when five ready exist account-wide — 9d18ca2
- [x] 2.7 Existing full-generation and re-roll service tests remain green — 9d18ca2
- [x] 2.8 `pnpm test:node` passes — 9d18ca2
- [x] 2.9 `pnpm lint` and `pnpm build` pass — 9d18ca2
- [x] 2.10 `pnpm test:e2e` passes including malformed re-roll command cases — 9d18ca2

#### Manual

- [ ] 2.11 Real-key partial request returns merged workout with kept items and prescriptions unchanged
- [ ] 2.12 Worker logs for partial requests contain no private generation data
- [ ] 2.13 Manual-draft partial SQL shape is a new lineage containing user-chosen kept exercises

### Phase 3: Builder UI — Mark, Replace, Exclude, Notify

#### Automated

- [x] 3.1 Planner-state helper tests pass — 485aafc
- [x] 3.2 `pnpm test:ui` passes including WorkoutDraftPanel tests — 485aafc
- [x] 3.3 `pnpm test:node` passes — 485aafc
- [x] 3.4 `pnpm test:e2e` passes including ai-partial-reroll spec, updated ai-safety journey and unchanged journeys — 485aafc
- [ ] 3.5 ai-partial-reroll spec passes in the GitHub Actions Linux CI run
- [x] 3.6 `pnpm lint` and `pnpm build` pass — 485aafc

#### Manual

- [ ] 3.7 Mobile and desktop layout and keyboard behavior is correct
- [ ] 3.8 Screen reader announces each failure once and the checkbox name correctly
- [ ] 3.9 Partial reduced-size dialog and confirm work when fewer than five ready exist account-wide
- [ ] 3.10 Cumulative exclusion holds and button count tracks remove/swap
- [ ] 3.11 Preferences and telemetry still work on a merged proposal

### Phase 4: Deterministic Variety for Mark-all Re-roll

#### Automated

- [x] 4.1 Recommender penalty tests pass with shortlist membership change asserted — 4be3794
- [x] 4.2 Cold-start all-marked avoidance test passes — 4be3794
- [x] 4.3 `pnpm test:node`, `pnpm test:ui`, `pnpm test:e2e` pass — 4be3794
- [x] 4.4 `pnpm lint` and `pnpm build` pass — 4be3794

#### Manual

- [ ] 4.5 Each cold-start Mark-all result differs from the workout it replaced
- [ ] 4.6 History-aware Mark-all result differs when alternatives exist and still succeeds with a small pool

### Phase 5: Product and Contract Documentation

#### Automated

- [x] 5.1 `pnpm format` leaves no diff in edited Markdown files
- [x] 5.2 `pnpm lint` passes

#### Manual

- [ ] 5.3 Reviewer confirms PRD notes and contract-surfaces text match implemented behavior
