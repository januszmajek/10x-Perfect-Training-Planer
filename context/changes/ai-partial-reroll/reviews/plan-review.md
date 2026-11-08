<!-- PLAN-REVIEW-REPORT -->

# Plan Review: AI Partial Re-roll Implementation Plan

- **Plan**: context/changes/ai-partial-reroll/plan.md
- **Mode**: Deep (codebase verification done inline, no sub-agent)
- **Date**: 2026-11-08
- **Verdict**: REVISE
- **Findings**: 0 critical, 4 warnings, 6 observations

> This review ran unattended. Where the skill would ask questions, the reviewer decided and noted it. Every finding is
> left `PENDING`. As instructed, `change.md` was not updated (the skill would normally set `status: plan_reviewed`),
> and plan.md and plan-brief.md were not edited.
> Severity mapping for the caller: WARNING/HIGH-MEDIUM = **major**, OBSERVATION = **minor** or **nit**, as tagged.

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 11/11 existing paths ✓ (new: `ai-workout-partial-reroll.ts`, `src/components/hooks/` (does not exist yet,
created per CLAUDE.md), `WorkoutDraftPanel.test.tsx`), 10/10 symbols ✓ (`parseAiWorkoutGenerationCommand`,
`fingerprintCandidates`, `exerciseCoverage` (private), `selectWithMmr`, `HISTORY_AWARE_RECOMMENDER_CONFIG`,
`logAiGenerationFailure`, `GENERATION_MESSAGES`, `MAX_WORKOUT_EXERCISES`, `record_ai_workout_proposal`, Toaster in
`AuthenticatedLayout.astro:49`). Some line refs are off by 2–10 lines (`ai-workouts.ts:186` → fn at :176, `:243` → :241,
`WorkoutDraftPanel.tsx:152` → aria-label at :155); harmless. brief↔plan ✓. Progress↔Phase ✓: 5/5 phases, every
success-criteria bullet has a matching row, and no checkboxes appear outside Progress. No stale "unmarked = full
re-roll" text was found; the gating, cumulative exclusion and toast are consistent across the plan and brief.

Verified sound: (1) the partial reduced-confirmation binding. It has a domain-separated fingerprint over pool, kept,
marked and excluded ids. `allowedCount` is the merged size. The nonce is registered and consumed once
(`ai-workouts.ts:276-320`, table CHECK 3–4). A token on a normal-path request is rejected. Cross-mode tokens cannot
verify. (2) Server-side validation: exact-key whitelist, canonical UUIDs, bounds and disjointness, a catalogue check,
and request bodies capped at 32 KiB. (3) SQL lineage: `record_ai_workout_proposal` accepts any 3–7 distinct catalogue
ids, and a new lineage is created when no prior id is given (`20260909130000_...sql:21-38`). (4) Retention: it is
derived from proposal ∩ saved exercises (`20260908110000_...sql:72-79`).

## Findings

### F1 — History-aware pick count can exceed the shortlist size, causing deterministic `invalid_output`

- **Severity**: ⚠️ WARNING (major)
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 1 §3 `planPartialReroll`; Phase 2 §3 (`c = readyCandidates.length`)
- **Detail**: `ceil = min(7 − k, c)` uses the ready-candidate count. The model, however, may only pick from
  `shortlist` (enum = shortlist ids, `ai-workouts.ts:340`), and the shortlist is often 5. The cap is
  `preferredTarget = min(maximum, max(5, |selected ∪ preferredCandidates|))` (`ai-workout-recommender.ts:270-283`).
  Example: a 7-item AI draft where the user keeps 1 and marks 6 gives k=1, r=6, floor=4, ceil=6, `newCount.min = 6`.
  For a user with few familiar exercises the shortlist is 5, so the JSON-schema `minItems: 6` cannot be satisfied
  over a 5-value enum, and every attempt ends `invalid_output`. Separately, the existing flow returns
  `insufficient_recovered_candidates` from `recommendation.decision` (`ai-workouts.ts:271`). After the plan removes
  fixed and excluded ids before `makeDecision`, that decision says "insufficient" for c ≤ 2 even when k + c ≥ 5. The
  plan never says the partial branch must ignore `decision`. `preferredTarget` also branches on `decision.kind`
  (`recommender.ts:273`).
- **Fix**: In history mode, compute `ceil = min(7 − k, shortlist.length)`. Have the recommender in fixed-context mode
  size the shortlist to at least `min(c, max(5, 7 − k))` non-fixed candidates. State explicitly that the partial branch
  uses `planPartialReroll` instead of `recommendation.decision`. Add planner and recommender tests for k=1, r=6 with a
  5-candidate preferred pool.
  - Strength: a small contract edit. `floor ≤ shortlist` holds whenever k + c ≥ 5.
  - Tradeoff: the recommender gains a size input that depends on k.
  - Confidence: HIGH — derived directly from `recommender.ts:226-283` and `contract.ts:40-41`.
  - Blind spot: how the "fixed as already selected" MMR counting interacts with the target count.
- **Decision**: PENDING

### F2 — The partial reduced path breaks FR-017's "must not be available when ≥ 5 ready exist"

- **Severity**: ⚠️ WARNING (major)
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §3 (reduced when `3 ≤ k + c ≤ 4`); Phase 5 §1 (only FR-005 is amended)
- **Detail**: The pool `c` excludes marked ids and cumulative exclusions. Example: 2 ready kept exercises, 3 marked,
  5 other ready exercises of which 3 are the marked ones, so c = 2 and the merged size is 4. That triggers the reduced
  dialog while 7 ready exercises exist. PRD FR-017 (`prd.md:106`) forbids this literally. Kept _recovering_
  exercises also count toward "five" (3 recovering kept + 2 ready = normal, no dialog). The brief (Open Risks) calls
  this "treated like Don't suggest", but no PRD text records it. Cumulative exclusion itself is a settled user
  decision; only its FR-017 consequence is at issue.
- **Fix A ⭐ Recommended**: Add an FR-017 note in Phase 5: for partial re-rolls, readiness is counted after removing
  marked and previously replaced exercises, and kept exercises count toward the merged size. Add a matching sentence
  to contract-surfaces S-08.
  - Strength: matches the settled cumulative-exclusion decision; doc-only.
  - Tradeoff: FR-017 gets a mode-specific exception.
  - Confidence: HIGH.
  - Blind spot: none significant.
- **Fix B**: Allow the partial reduced path only when the account-level ready count (pool ∪ ready marked/excluded ∪
  ready kept) is < 5. Otherwise return `replacement_not_feasible` and suggest Mark all.
  - Strength: keeps the letter of FR-017.
  - Tradeoff: more not-feasible outcomes; one more input to the planner.
  - Confidence: MED.
  - Blind spot: whether users prefer a 4-item workout to a refusal.
- **Decision**: PENDING

### F3 — The exploration-cap promise is not enforced for merged workouts

- **Severity**: ⚠️ WARNING (major)
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Desired End State (plan:89-91); Phase 1 §3 validator, §4 recommender
- **Detail**: The plan promises the FR-017 cap "counting kept never-completed exercises". The only lever is reducing
  the `exploration` slice (`recommender.ts:260-264`). The fallback MMR fill still adds any ranked candidate, including
  unseen ones over budget, whenever the preferred pool is short (`recommender.ts:278-283`). Coverage reservation picks
  from all candidates (`:249-258`). The history validator checks only shortlist membership and coverage
  (`contract.ts:139-154`), and the new partial validator adds no unseen-count check. In partial mode, exclusions and
  kept unseen exercises shrink the familiar pool, so over-cap picks become more likely.
- **Fix**: In fixed-context mode, exclude over-budget never-completed candidates from the fallback fill unless they
  are the only source of a missing coverage. Add `explorationBudget` to the planner and validator context, and have
  `parsePartialRerollPicksJson` reject picks whose unseen count exceeds the budget plus coverage-forced picks. Add a
  test with 2 kept unseen exercises and cap 2. Alternatively, reword the end state to "shortlist-shaped, as for full
  generation".
  - Strength: makes the stated FR-017 guarantee checkable.
  - Tradeoff: slightly more `not_feasible` or `invalid_output` outcomes.
  - Confidence: MED — today's full path has the same soft cap.
  - Blind spot: whether existing tests assume the soft behaviour.
- **Decision**: PENDING

### F4 — Telemetry and metrics contamination from manual-origin partials is undocumented and contradicts "derivable by diffing"

- **Severity**: ⚠️ WARNING (major)
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: What We're NOT Doing (plan:121-122); Phase 2 §3; Phase 3 §3 (`draftOrigin = "ai"`); Phase 5 §2
- **Detail**: Consider a manual 6-item draft where 1 item is marked. The service records a new-lineage proposal with
  `rerolled_from_proposal_id = NULL`, and in the DB that row looks exactly like an initial generation. There is no
  prior proposal to diff, so the plan's claim that partial and replaced ids are "derivable offline by diffing" fails
  for this path. All 6 user-chosen exercises become proposal members. They then emit retention events at save
  (`20260908110000_...sql:72-79`) and attribute later completion to the AI lineage. `draftOrigin` becomes `"ai"`, so
  the save goes through `/api/workouts/ai/save` with `origin = 'ai'` (`WorkoutBuilder.tsx:211`). That feeds the PRD
  success metric "≥ 75% of generated workouts use the AI proposer" (`prd.md:49`). The same applies to manually added
  exercises kept in an AI draft.
- **Fix A ⭐ Recommended**: Narrow the "NOT doing" claim to "derivable only when a prior proposal exists". In Phase 5
  (PRD metric note plus contract-surfaces S-08), state that a partial on a manual draft yields an AI-origin workout
  and a proposal whose members include user-chosen exercises. Add a manual verification row for the SQL shape.
  - Strength: no migration; honest analytics caveat.
  - Tradeoff: metric inflation remains, only disclosed.
  - Confidence: HIGH.
  - Blind spot: how the metric is actually computed.
- **Fix B**: For a draft with no `activeProposal`, keep `draftOrigin = "manual"` after a partial whose kept count
  exceeds the AI pick count, or record the proposal only for AI-origin drafts.
  - Strength: protects the headline metric.
  - Tradeoff: new branching, and the AI picks lose FR-018 telemetry.
  - Confidence: LOW.
  - Blind spot: product intent.
- **Decision**: PENDING

### F5 — "Before credential use" and "shared preparation" conflict with the current call order (minor)

- **Severity**: 🔍 OBSERVATION (minor)
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 §1–§2
- **Detail**: Cold start decrypts the credential (`ai-workouts.ts:193`) before it loads the catalogue (`:206`). Mode
  dispatch (`:183-188`) also runs before any catalogue load. History loads the catalogue in parallel with the profile
  (`:256-259`). A single "shared partial preparation before any mode-specific work" therefore needs an extra
  catalogue query or a restructure.
- **Fix**: Specify per-branch validation right after each branch's own catalogue load. In the cold-start partial
  branch, move `loadWorkoutCatalogue` ahead of `decryptOwnedAiProviderKey`. Add a test that asserts decrypt is not
  called on `replacement_not_feasible` or `REROLL_UNKNOWN_EXERCISE`.
- **Decision**: PENDING

### F6 — The S-07 contract invariant is loosened but the plan says "document", not "rewrite" (minor)

- **Severity**: 🔍 OBSERVATION (minor)
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 5 §2
- **Detail**: `contract-surfaces.md:157-159` says the route "accepts only the versioned empty generation command" and
  "no browser request can select a provider, model, credential, or prescription". With this change the browser
  supplies kept prescriptions that are echoed in the response, and supplies kept ids that are recorded as proposal
  members.
- **Fix**: In Phase 5, explicitly replace those two sentences. New wording: the browser may supply kept
  prescriptions, which the server echoes after bounds checks and never sends to the provider. Kept and marked ids are
  catalogue-validated. Flag the change as an additive contract change.
- **Decision**: PENDING

### F7 — Partial re-roll silently drops marked exercises on drafts with more than 7 items (minor)

- **Severity**: 🔍 OBSERVATION (minor)
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §3 `mergePartialReroll`; Phase 3 §1 `getAiButtonState`
- **Detail**: Example: a 20-item manual draft with 6 kept and 14 marked gives ceil=1. The user gets 1 pick, and 13
  marked exercises vanish, while the button reads "Replace selected (14)". The behaviour is correct under the 5–7
  rule but surprising.
- **Fix**: When `r > 7 − k`, add the hint `marked_exceeds_slots`: "AI workouts hold at most 7; {r − (7 − k)} marked
  exercises will be removed." Cover it with a planner-state test and one manual step.
- **Decision**: PENDING

### F8 — Phase 4 variety: success criteria likely fail or flake (minor)

- **Severity**: 🔍 OBSERVATION (minor)
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §1–§2; Manual 4.5/4.6
- **Detail**: Cold-start avoidance excludes only the ids currently on screen. Run 3 uses the prompt "catalogue − B"
  and can deterministically return A (an A→B→A two-cycle), so 4.5 ("three consecutive … different") may fail. The
  history-aware penalty only changes shortlist _membership_: the prompt sorts the shortlist by id and carries no rank
  (`ai-workout-prompt.ts:52-69`). When the preferred pool is ≤ 7 the prompt is byte-identical and the output repeats.
- **Fix**: Reword 4.5 to "each Mark-all result differs from the workout it replaced when alternatives exist". Add an
  automated assertion that shortlist membership changes in the penalty test. Note in Phase 4 that small-pool history
  accounts see no change.
- **Decision**: PENDING

### F9 — Checkbox accessible name does not contain its visible label (nit)

- **Severity**: 🔍 OBSERVATION (nit)
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §5
- **Detail**: The visible label is "Replace with AI" and the accessible name is "Mark {name} for AI replacement",
  which violates WCAG 2.5.3 Label in Name (speech-input users say "Replace with AI").
- **Fix**: Use the accessible name "Replace with AI: {name}". It cannot clash with the button "Replace {name}"
  because the roles differ. Update the Vitest, Playwright and manual 3.7 text to match.
- **Decision**: PENDING

### F10 — Small consistency and lean nits (nit)

- **Severity**: 🔍 OBSERVATION (nit)
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details; Phases 1 and 3
- **Detail**:
  (a) In `excluded = cap20(previous ∪ marked) − mergedIds`, the subtraction is a no-op: picks are never marked or
  excluded, and kept ids are disjoint from the exclusions. Capping before subtracting could evict needlessly.
  (b) Empty draft → `{version}` drops `priorProposalId`. Today it is sent whenever `activeProposal` exists
  (`WorkoutBuilder.tsx:123-127`), so clearing an AI draft and regenerating loses the FR-018 `reroll` event.
  (c) Phase 1 widens the parser, but the service ignores `reroll` until Phase 2. In between, partial commands
  silently run a full generation.
  (d) Manual row 1.8 duplicates the unit cases (k=4, r=1).
  (e) The new E2E check "kept sets preserved" only asserts mocked data. The intercepted-body assertion is the real
  check.
  (f) Per lessons.md, run `e2e/ai-partial-reroll.spec.ts` in the CI Linux environment before it becomes a blocking
  gate.
- **Fix**: (a) Use `cap20(previous ∪ marked)`. (b) Keep `priorProposalId` on an empty-draft generation when
  `activeProposal` exists. (c) Move the parser widening to Phase 2, or reject `reroll` at the route until Phase 2.
  (d) Make 1.8 automated. (e) Label that assertion as wiring-only. (f) Add a CI-run note to Phase 3.
- **Decision**: PENDING

## Triage

Triaged 2026-11-08 by the user via the coordinator; fixes applied to `plan.md` and `plan-brief.md`.

- **F1** → applied: history-mode `ceil = min(7 − k, shortlist.length)`; fixed-context shortlist ≥ `min(c, max(5, 7 − k))`; partial branch decides only via `planPartialReroll`, never `recommendation.decision`; k = 1/r = 6 with a 5-candidate pool test added.
- **F2** → applied-alternative (Fix B): partial reduced 3–4 path only when the account-wide ready count (before removing marked/excluded) is < 5, otherwise `replacement_not_feasible` with "mark fewer / Mark all" copy; both boundary sides tested; FR-017 text untouched (PRD locked).
- **F3** → applied: over-budget unseen candidates excluded from fallback fill unless sole coverage source; `explorationBudget` passed to `parsePartialRerollPicksJson`, over-budget picks → `invalid_output`; 2 kept unseen + cap 2 test; end-state promise kept.
- **F4** → applied (Fix A): "derivable by diffing" narrowed to "only when a prior proposal exists"; Phase 5 adds PRD success-metric note and contract-surfaces S-08 text on origin 'ai', proposal membership and ≥ 75%-via-AI impact; Open Risks and manual SQL row 2.13 added.
- **F5** → applied: per-branch validation after each catalogue load; cold-start partial loads catalogue before decrypt; tests assert decrypt is not called on infeasible / unknown-id requests; wording fixed.
- **F6** → applied: Phase 5 rewrites `contract-surfaces.md:157-159` statements, flagged as an additive contract change.
- **F7** → applied: `marked_exceeds_slots` hint disables the button when r > 7 − k (partial only), with copy, helper test and manual step.
- **F8** → applied: 4.5/4.6 reworded to "differs from the workout it replaced"; penalty test asserts shortlist membership change; small-pool no-change limit noted in Phase 4.
- **F9** → applied: accessible name "Replace with AI: {name}" in plan, Vitest, Playwright and manual rows.
- **F10** → applied all: (a) `cap20(previous ∪ marked)`; (b) `priorProposalId` kept on empty-draft generation; (c) command parser moved to Phase 2; (d) manual 1.8 dropped, covered by automated planner test; (e) E2E asserts the request body for edited kept sets/reps, display check labelled wiring-only; (f) CI Linux run of `e2e/ai-partial-reroll.spec.ts` required before blocking (row 3.5).
