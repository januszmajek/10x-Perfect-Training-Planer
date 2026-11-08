# AI Partial Re-roll — Plan Brief

> Full plan: `context/changes/ai-partial-reroll/plan.md`
> Plan review: `context/changes/ai-partial-reroll/reviews/plan-review.md` (F1–F10 applied, see Triage)

## What & Why

Users who like most of a workout can only re-roll all of it, and a full re-roll tends to return the same workout
(identical cold-start prompt, deterministic ranking, 7-item shortlist for a 5–7 pick). On any non-empty draft the user
now marks exercises (**Replace with AI**, or **Mark all**) and clicks **Replace selected (N)**; only marked exercises
are replaced, kept sets/reps survive, and earlier replacements are never offered again.

## Starting Point

One route (`/api/workouts/ai/generate`) with a strict 4-shape command; cold-start and history-aware paths in
`src/lib/ai-workouts.ts`; a pure recommender; HMAC reduced-size confirmation; `priorProposalId` used only for
lineage. "Generate workout" always replaces the whole draft; failures show only an inline alert.

## Desired End State

Empty draft: "Generate workout" as today. Non-empty draft (AI or manual): checkboxes plus Mark all; the button is
disabled until something is marked. Merged workouts keep kept exercises in place and still satisfy coverage,
recovery, Don't suggest, a hard-enforced exploration cap and FR-017's reduced-size rule; history-aware results are
recorded as new proposals. Failures show the inline alert and a toast; Mark-all re-rolls vary when alternatives exist.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Button gating | Empty → "Generate workout"; non-empty (AI or manual) → checkboxes + Mark all, "Replace selected (N)" disabled at N = 0 or when marked > 7 − kept; all marked = full re-roll | No implicit full re-roll; full re-roll stays one quick action (FR-005) | User |
| Cumulative exclusion | Client keeps `excludedExerciseIds` per draft (`cap20(previous ∪ marked)`), sent with partial requests; server validates, hard-excludes, fingerprints them; reset on initial / Mark-all generation or empty draft | A→B then replacing B must never return A | User |
| Failure toast | Visual-only sonner toast (fixed id, short headline, `aria-hidden` content) for every generation failure except the dialog; inline `role="alert"` stays the only announcement; Toaster already mounted | Visible when off-screen, announced once | User |
| FR-017 reduced path | Partial 3–4 merged workout only when the account-wide ready count (before removing marked/excluded) is < 5; otherwise `replacement_not_feasible` suggesting fewer marks / Mark all | PRD is locked; keeps FR-017's letter | User (review F2) |
| Command shape | Optional `reroll: { exercises, excludedExerciseIds? }`; whitelist parser, widened in Phase 2 with the service | Additive; no build silently ignores partial commands | Plan (auto) + review F10 |
| Merge location | Server merges, returns the full merged proposal; response shape unchanged | Recorded order = what the user sees | Plan (auto) |
| Kept exercises | Fixed context (any catalogue id); count toward size, coverage, exploration budget, MMR | User chose to keep them | Plan (auto) |
| Pick count | One-for-one, widened only for coverage; `ceil = min(7 − k, shortlist)`; fixed-context shortlist ≥ min(c, max(5, 7 − k)); partial ignores `recommendation.decision` | Requested count always pickable | Plan (auto) + review F1 |
| Exploration cap | Over-budget unseen excluded from fallback fill (unless sole coverage source); validator rejects over-budget picks | Makes FR-017's cap checkable | User (review F3) |
| Infeasible | `replacement_not_feasible` (409), decided after each branch's catalogue load, before decrypt/provider | Correct copy; no wasted credential use | Plan (auto) + review F5 |
| Lineage & events | Merged ids recorded as a new proposal; `rerolled_from` only with a prior id; empty-draft generation keeps `priorProposalId`; no migration or new events | Retention and FR-018 reroll event preserved | Plan (auto) + review F10 |
| Mark-all variety | Phase 4: history penalty on on-screen ids; cold start excludes them when coverage stays feasible | Deterministic; droppable | Plan (auto) |
| Docs | FR-005 note + success-metric note; contract-surfaces S-07 sentences rewritten (additive change) + S-08 | Contract really changes | Plan (auto) + review F4/F6 |

## Scope

**In scope:** planner/validator/merge, recommender fixed/excluded/penalised inputs, prompts, fingerprint, command
parser, service branches (cold + history), builder gating/marking/exclusions/toast, dialog copy, node/Vitest/
Playwright tests (incl. `e2e/ai-safety.spec.ts:143,160` → Mark all + "Replace selected (1)"), PRD + docs.

**Out of scope:** migrations, new events/RPCs, server-persisted exclusions, randomness, weight changes for initial
generation, planned-workout editor, auto-retry, save-failure toasts.

## Architecture / Approach

Browser sends ordered draft (kept + marked) and exclusions → parser → per-branch catalogue check → recommender with
kept fixed and marked ∪ excluded removed (cold start: catalogue minus them) → `planPartialReroll` (pick count /
reduced gate / infeasible) → optional confirmation → decrypt → prompt with kept as fixed context, shortlist-only enum →
validate picks (budget, coverage) → positional merge → record proposal (history) → browser replaces draft.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Domain core | Planner, validator/merge, recommender inputs, prompts, fingerprint, error code | Recommender regressions |
| 2. Server orchestration | Command parser, partial branches both modes, confirmation, lineage | Reduced/token edge cases |
| 3. Builder UI | Gating, checkboxes, Mark all, exclusions, toast, E2E updates (CI-proven) | Behavior change breaks journeys |
| 4. Mark-all variety | Penalty / cold-start avoidance of on-screen ids | No change for small pools |
| 5. Docs | PRD notes, contract-surfaces rewrite | Drift |

**Prerequisites:** local Supabase + e2e harness; OpenRouter test key. **Estimated effort:** ~3–4 sessions.

## Open Risks & Assumptions

- The FR-017 gate turns some exclusion-heavy partials into `replacement_not_feasible` instead of a smaller workout; users must mark fewer or Mark all.
- Exclusions can still exhaust a category (it becomes infeasible coverage and is dropped) or the whole pool.
- Hard exploration enforcement can raise `replacement_not_feasible` / `invalid_output` rates for users with tiny familiar pools.
- Manual-draft partials save with `origin = 'ai'`, make user-chosen exercises proposal members (retention/completion attributed to AI) and count toward the ≥ 75%-via-AI metric; without a prior proposal they are indistinguishable from initial generations in the DB.
- Exclusions are client-held (lost on reload); toast relies on `aria-hidden` content in Sonner's polite region and `getByRole("alert")` locators may need scoping.
- Mark-all variety: cold-start A→B→A cycles possible; history accounts with a preferred pool ≤ 7 may see no change. Penalty untuned.

## Success Criteria (Summary)

- Marking exercises replaces only those, keeps edited prescriptions, never brings back earlier replacements, and the result passes the same balance and FR-017 rules.
- Failures are visible (alert + toast), announced once, and never lose the draft.
- Mark-all re-rolls differ from the workout they replace when alternatives exist.
