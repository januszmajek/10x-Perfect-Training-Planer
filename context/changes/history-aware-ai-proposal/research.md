---
date: 2026-09-06T19:03:28+02:00
researcher: Codex
git_commit: de848c50899d5c42c694ebd8975a7f046c01e965
branch: master
repository: 10xProjekt
topic: "History-aware, preference-sensitive workout recommendation compatible with the current stack"
tags: [research, codebase, recommendations, recovery, ai-workouts, cloudflare-workers, supabase]
status: complete
last_updated: 2026-09-07
last_updated_by: Codex
last_updated_note: "Added Exa-backed follow-up on 2025-2026 recommender research and edge-native libraries"
---

# Research: History-aware, preference-sensitive workout recommendation

**Date**: 2026-09-06T19:03:28+02:00
**Researcher**: Codex
**Git Commit**: de848c50899d5c42c694ebd8975a7f046c01e965
**Branch**: master
**Repository**: 10xProjekt

## Research Question

Find a library or algorithm that can propose the best workout possible for the user, especially exercises the user
likes or may like to try when they have never tried them. It must cooperate with the application's recovery system and
fit the stack defined in `context/foundation/tech-stack.md`.

## Summary

Use a **recovery-constrained hybrid content-based recommender**, implemented as small pure TypeScript functions and a
compact owner-scoped Supabase aggregate query. Do **not** add a recommendation or machine-learning library for the MVP.

The recommended pipeline is:

1. Recompute recovery from authoritative completed history on every generation request.
2. Remove exercises whose primary muscles are still recovering from the AI candidate pool.
3. Build a weak preference profile from completed-exercise frequency and recency.
4. Split eligible exercises into a familiar/exploit pool and a never-completed/explore pool.
5. Rank unseen exercises by structured similarity to familiar exercises, then use a capped, similarity-gated
   exploration quota and Maximal Marginal Relevance (MMR) to balance likely preference with variety.
6. Give the existing LLM only the vetted shortlist and derived reasons; independently validate its output against the
   same recovery and catalogue constraints.

This is the strongest approach supported by the current data. The app can identify **completed before**, **repeated**,
**recent**, and **never completed**, but cannot truthfully identify **liked** or **disliked**. Completion is only weak
positive implicit feedback. Re-rolls, removed suggestions, ratings, favorites, actual load, RIR, soreness, and
exercise-level completion are not stored. A genuinely learning recommender requires at least proposal exposure and
accept/reject feedback in a later change.

The phrase “best workout” should therefore mean **the most likely acceptable, recovery-compatible proposal under the
signals the app actually records**, not physiological optimization. The product has no goal, experience, injury,
available-time, actual-performance, or equipment-availability inputs with which to make the latter claim.

## Detailed Findings

### 1. The current stack favors a transparent in-process ranker

The application is a TypeScript-first Astro SSR app deployed to Cloudflare Workers, with Supabase as its authenticated
Postgres data layer and an existing native-`fetch` OpenRouter boundary. The repository has no ML or recommendation
runtime dependency ([package.json:24](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/package.json#L24)).

Cloudflare Workers is a good home for a small ranking pass, but a poor reason to introduce request-time model training.
Current Workers documentation lists 128 MB memory and a 10 ms CPU allowance on the Free plan; network wait time is not
CPU time, but heavier synchronous computation is ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
Workers can load Wasm, but each Worker is single-threaded and Wasm increases bundle/startup cost
([Workers WebAssembly](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)). The catalogue loader is
already capped at 200 items, so a pure TypeScript shortlist/rerank over at most 200 exercises and 5–7 selected items is
tiny compared with loading a general ML runtime
([planned-workouts.ts:168](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/lib/planned-workouts.ts#L168)).

Supabase/Postgres should perform the lifetime aggregation because it can return one compact row per exercise rather
than sending raw lifetime history through the Worker. `pgvector` is stack-compatible, and Supabase documents filtered
vector recommendations, but embeddings require generation, storage, synchronization, and retry infrastructure
([Supabase automatic embeddings](https://supabase.com/docs/guides/ai/automatic-embeddings)). That machinery does not
improve similarity over the catalogue's already-curated muscle, equipment, and movement fields at MVP scale.

### 2. Recovery is already an authoritative algorithm, not an ML feature to relearn

The repository already defines the correct recovery primitive:

- only owner-scoped completed workouts contribute;
- `completed_at` is the authoritative event time;
- only primary muscle tags start or block a window;
- a muscle is recovering while `now < completed_at + recovery_hours` and ready at equality;
- when several workouts affect a muscle, the latest deadline wins;
- 48-hour and 72-hour defaults live in the database taxonomy.

These invariants are recorded in
[contract-surfaces.md:44](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/docs/reference/contract-surfaces.md#L44)
and implemented by
[recovery-aware-catalogue.ts:55](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/lib/recovery-aware-catalogue.ts#L55).
The current builder bounds its recovery query by the largest configured window and derives recovery at read time
([manual-workouts.ts:27](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/lib/manual-workouts.ts#L27)).

For the AI proposal, recovery should be a **hard candidate constraint**, even though the manual catalogue remains
advisory. This preserves user agency: the generated slate contains only ready-primary exercises, while the user may
still manually edit in a recovering exercise after seeing the warning. If fewer than five structurally valid ready
exercises exist, generation should return a typed “insufficient recovered candidates” outcome rather than silently
violate recovery.

The history-aware validator cannot blindly retain the cold-start full-body rule. The current validator always requires
lower body, core, upper-body push, and upper-body pull
([ai-workout-contract.ts:63](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/lib/ai-workout-contract.ts#L63)).
That can be infeasible when a whole category is recovering. Cold-start coverage should remain unchanged; history-aware
coverage should be mode-specific and maximize balanced coverage only among ready candidates.

### 3. What preference signals actually exist

The durable schema stores workout-level origin/status/timestamps plus ordered exercise IDs and prescribed sets/reps
([workout lifecycle migration:5](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/supabase/migrations/20260820090200_create_workout_lifecycle.sql#L5)).
Completion assigns `completed_at` transactionally
([completion migration:27](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/supabase/migrations/20260902130000_complete_planned_workout.sql#L27)).

Available recommendation features are:

| Signal                             | Meaning that is safe to infer   | Important limitation                                     |
| ---------------------------------- | ------------------------------- | -------------------------------------------------------- |
| Completed occurrence count         | familiarity / repeated use      | not proof of enjoyment or efficacy                       |
| Latest `completed_at` per exercise | recency and repetition          | no actual exercise-level completion                      |
| Never present in completed history | never completed in this app     | not the same as never seen, proposed, or tried elsewhere |
| Muscle tags and roles              | content similarity and recovery | taxonomy, not user preference                            |
| Equipment and push/pull metadata   | content similarity and coverage | equipment may reflect availability, not preference       |
| Sets/reps                          | prescribed structure            | PRD explicitly defers actual performance tracking        |
| Workout origin                     | route provenance only           | an edited AI workout still has `origin = 'ai'`           |

The current recovery loader omits exercise IDs and is deliberately limited to the active recovery horizon
([planned-workouts.ts:248](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/lib/planned-workouts.ts#L248)).
The display-history service has exercise IDs but is paginated at 25 and optimized for UI reads
([workout-history.ts:104](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/lib/workout-history.ts#L104)).
History-aware generation therefore needs a dedicated server-side read model returning compact per-exercise aggregates,
not reuse of browser pagination and not raw lifetime history in the prompt.

There is no negative preference signal. A successful re-roll merely replaces local draft state, and failed generation
preserves the existing draft
([ai-workout-planner-state.ts:13](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/lib/ai-workout-planner-state.ts#L13)).
Favorites are explicitly deferred
([prd.md:187](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/context/foundation/prd.md#L187)).
Consequently, the MVP must label its signal as `familiarity` or `completion affinity`, not `likes`.

### 4. Recommended algorithm

#### Stage A — derive a compact profile

For every canonical exercise, query or calculate:

- `completed_count` — number of completed workouts containing the exercise;
- `last_completed_at` — latest authoritative completion timestamp;
- `recent_count` — occurrences in a small recent workout/time window;
- `in_last_completed_workout` — a strong repetition indicator;
- `ready` and affected recovery deadlines from the existing recovery projection.

Do not weight prescribed sets/reps as success, and do not assign item-level meaning to workout `origin`. Both create
false precision with the current schema.

#### Stage B — recovery filter before preference ranking

Build `eligible = catalogue.filter(exercise => exercise.recovery.state === "ready")`. Run all preference and novelty
logic only on this set. This ordering ensures that a frequently repeated exercise can never outrank an active recovery
constraint.

#### Stage C — form exploit and explore pools

For previously completed exercises, use a monotonic but diminishing familiarity score such as normalized
`log1p(completed_count)`, then add a freshness/repetition adjustment. Avoid a raw count winner-takes-all rule, which
would create a feedback loop in which early AI choices become permanently dominant.

For never-completed exercises, compute similarity to the user's familiar profile using only curated categorical
features. A reasonable, testable starting point is weighted overlap of:

- primary muscles: 50%;
- secondary muscles: 15%;
- movement pattern: 20%;
- equipment: 15%.

These are initialization values, not evidence-derived truths. Keep them named and centrally configurable so offline
fixtures and later behavior can tune them. For a cold or very short profile, fall back to balanced catalogue coverage
rather than pretending to know preference.

#### Stage D — assemble a diverse shortlist

Allow at most one or two of the 5–7 proposal slots to contain eligible never-completed exercises. Use an exploration
slot only when the candidate clears a minimum content-similarity/confidence threshold and does not weaken feasible
coverage; otherwise fill it from familiar exercises. Within both pools, use a greedy MMR rerank:

```text
next = argmax(candidate) [lambda * relevance(candidate)
                          - (1 - lambda) * max_similarity(candidate, already_selected)]
```

MMR explicitly balances relevance with non-redundancy; the original method describes this “relevant novelty” trade-off
and the interpolation parameter
([Carbonell and Goldstein, 1998](https://aclanthology.org/X98-1025.pdf)). Here, item similarity can reuse the same
structured muscle/movement/equipment overlap—no embeddings are required. A starting `lambda` around 0.75–0.85 favors
preference while preventing five nearly identical movements. Deterministic ID tie-breaking keeps tests reproducible;
an injected seed can vary equally ranked candidates on re-roll.

Coverage should be enforced during selection, not left to the LLM. First reserve feasible ready candidates for distinct
movement/category needs, then fill remaining slots by MMR. This is a tiny constrained slate-selection problem over no
more than 200 candidates.

#### Stage E — keep the LLM behind the rules

The current provider request already uses native `fetch`, a server-selected model, strict structured output, and a JSON
Schema ([openrouter-client.ts:58](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/lib/openrouter-client.ts#L58)).
Keep that boundary. Send a compact vetted shortlist with derived fields such as `familiar`, `never_completed`, and
`recovery_ready`; do not send raw history. Let the model assemble 5–7 exercises and sets/reps within the shortlist.
Then validate canonical membership, uniqueness, bounds, ready-state membership, and history-aware feasible coverage
independently. The model supplies variation and prescription; application code owns recovery and recommendation
truth.

### 5. Library and platform assessment

| Option                                      | Stack fit                                           | Data fit                                                                                  | Decision                                                                                                                                                                         |
| ------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure TypeScript ranker + Supabase aggregate | Native ESM/Worker fit; no new runtime               | Excellent for ≤200 structured items and sparse per-user history                           | **Adopt for MVP**                                                                                                                                                                |
| `simplebandit`                              | Small TypeScript/JavaScript and serializable        | Needs accept/reject training events the app does not have                                 | Reject: beta and [repository archived in 2025](https://github.com/thoughtworks/simplebandit)                                                                                     |
| TensorFlow.js                               | Pure JS/Wasm can run without native bindings        | Requires a model, training labels, inference budget, and more data                        | Reject for MVP; native `tfjs-node` depends on TensorFlow C bindings ([TensorFlow.js Node guide](https://www.tensorflow.org/js/guide/nodejs))                                     |
| Supabase `pgvector`                         | Compatible with existing Postgres                   | Useful for unstructured semantic similarity, unnecessary for curated categorical features | Defer until descriptions/custom exercises materially expand                                                                                                                      |
| Gorse                                       | Mature standalone recommender with Postgres support | Designed as a separate training/prediction service                                        | Reject: adds a Go service/container and operational boundary ([Gorse architecture](https://github.com/gorse-io/gorse))                                                           |
| BPR/collaborative filtering                 | Established implicit-feedback ranking method        | Requires many user-item interactions and introduces cross-user learning/privacy questions | Reject at current scale; [BPR optimizes ranking from implicit feedback](https://arxiv.org/abs/1205.2618) but the app lacks adequate data                                         |
| LinUCB/contextual bandit                    | Strong later exploration/exploitation model         | Requires a recorded action and reward loop                                                | Defer; the original formulation learns after observing payoff for a chosen action ([LinUCB paper](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/p661.pdf)) |

No evaluated library adds enough value to justify its dependency, model lifecycle, or operational cost. The core MVP
algorithm is a few sorting, normalization, categorical-similarity, and constrained-selection functions that match the
repository's existing pure-function style.

### 6. Exact integration seams

The history-aware mode should extend the current flow rather than create a parallel feature:

- `/workouts/new` currently loads the recovery-aware catalogue, credential status, and eligibility concurrently
  ([new.astro:14](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/pages/workouts/new.astro#L14)).
- The client posts only a versioned generation command and replaces the editable draft on success
  ([WorkoutBuilder.tsx:92](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/components/workouts/WorkoutBuilder.tsx#L92)).
- The generation endpoint already composes injectable services
  ([generate.ts:13](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/pages/api/workouts/ai/generate.ts#L13)).
- The service currently rejects every history-bearing user before credentials, catalogue, prompt, or provider work
  ([ai-workouts.ts:134](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/lib/ai-workouts.ts#L134)).
- The current prompt reconstructs catalogue-only fields and discards attached recovery state
  ([ai-workout-prompt.ts:21](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/lib/ai-workout-prompt.ts#L21)).
- The success metadata is hard-coded to `kind: "cold_start"` and must become a mode union
  ([ai-workout-api.ts:61](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/lib/ai-workout-api.ts#L61)).
- The AI save path already revalidates canonical draft membership and can remain unchanged
  ([ai-workouts.ts:59](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/src/lib/ai-workouts.ts#L59)).

The smallest coherent architecture is therefore:

```text
authenticated POST
  -> select cold-start or history-aware mode from fresh owner history
  -> load catalogue + compact profile + active recovery history
  -> derive ready candidates
  -> rank familiar/unseen candidates and diversify shortlist
  -> call OpenRouter with mode-specific prompt
  -> validate structure + catalogue + recovery + feasible coverage
  -> return the same editable draft shape
```

### 7. Learning path beyond the MVP

If “likes” is a product priority rather than convenient copy, add a minimal feedback contract before adopting a
bandit. Useful events are:

- proposal shown with proposal ID and exercise IDs;
- re-roll/reject of a proposal;
- exercise removed or swapped before save;
- proposed exercise retained and later completed;
- optional explicit like/dislike or “do not suggest” preference.

With those events, a later contextual bandit can observe a real reward and learn exploration rates. Without them, a
bandit would merely turn historical exposure bias into confident-looking math. Proposal telemetry is also private
workout data, so it needs owner scoping and an explicit retention decision.

### 8. Verification and evaluation

The MVP can be evaluated deterministically before any online learning:

- recovery violation rate in generated proposals: **0**;
- unknown/duplicate exercise IDs: **0**;
- 5–7 item and sets/reps bounds: **100% valid**;
- never-completed slot included when eligible and structurally feasible;
- no never-completed slot when none exists;
- repeated exercise cannot bypass active primary-muscle recovery;
- exact recovery deadline is treated as ready;
- deterministic tie order with injected re-roll variation;
- prompt remains below the existing 64 KiB ceiling;
- raw history and identifiers are absent from logs and browser props.

Later product metrics should include save-after-generation rate, re-roll rate, proposal-to-final edit distance, novel
exercise retention, and completion of retained novel exercises. The current schema cannot calculate most of those
accurately; that limitation should be visible rather than hidden behind a library choice.

## Code References

- `src/lib/recovery-aware-catalogue.ts:55-98` — canonical recovery projection and latest-deadline rule.
- `src/lib/manual-workouts.ts:27-57` — bounded recovery history loading for the shared builder.
- `src/lib/planned-workouts.ts:148-194` — current lifetime-history gate and canonical catalogue loader.
- `src/lib/planned-workouts.ts:248-270` — recent recovery loader, insufficient for preference aggregation.
- `src/lib/workout-history.ts:104-180` — owner-scoped paginated display history with exercise IDs.
- `src/lib/ai-workouts.ts:134-188` — injectable cold-start generation pipeline and history rejection.
- `src/lib/ai-workout-prompt.ts:14-43` — deterministic catalogue-only prompt and 64 KiB ceiling.
- `src/lib/ai-workout-contract.ts:21-98` — response schema and cold-start validation.
- `src/lib/openrouter-client.ts:58-79` — Worker-native provider request and structured output.
- `src/pages/api/workouts/ai/generate.ts:13-45` — authenticated same-origin generation boundary.
- `src/components/workouts/WorkoutBuilder.tsx:92-125` — generation/re-roll client behavior.
- `supabase/migrations/20260820090200_create_workout_lifecycle.sql:5-45` — available durable history fields.
- `docs/reference/contract-surfaces.md:44-69` — taxonomy and recovery invariants.

## Architecture Insights

- Recovery is a domain constraint and preference is a ranking signal; they must not be collapsed into one opaque model
  score.
- Derive history context server-side and send only the smallest vetted representation to the provider.
- Separate cold-start and history-aware validation because full-body coverage can conflict with active recovery.
- Keep the recommendation core pure and dependency-injected so Node's built-in test runner can exercise boundary times,
  sparse history, exploration quotas, and deterministic ties.
- A completed AI-origin workout is not evidence that each model suggestion was accepted; `origin` is route provenance.
- A recommendation library cannot compensate for missing feedback semantics.

## Historical Context (from prior changes)

The recovery-aware manual-builder research selected fixed per-muscle windows and explicitly rejected copying a closed
product's recovery percentage or constructing a dynamic score from data the app does not record
([archived recovery research:27](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/context/archive/2026-09-04-recovery-aware-manual-builder/research.md#L27)).
Its plan established server-owned `completed_at`, latest-deadline semantics, primary-only blocking, and advisory manual
selection
([archived recovery plan:71](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/context/archive/2026-09-04-recovery-aware-manual-builder/plan.md#L71)).

The cold-start AI plan established that S-08 must extend the existing builder and generation boundary; the browser must
not receive raw history or credentials, and `origin = 'ai'` is not model-authorship attestation
([archived cold-start plan:77](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/context/archive/2026-09-05-cold-start-ai-planned-workout/plan.md#L77)).
The roadmap keeps favorites, actual performance sophistication, and broader analytics outside this MVP
([roadmap.md:221](https://github.com/januszmajek/10xProjekt/blob/de848c50899d5c42c694ebd8975a7f046c01e965/context/foundation/roadmap.md#L221)).

No `context/foundation/lessons.md` file exists, so there were no additional accepted lesson priors to apply.

## Related Research

- `context/archive/2026-09-04-recovery-aware-manual-builder/research.md` — recovery model and external-product comparison.
- `context/archive/2026-09-04-recovery-aware-manual-builder/plan.md` — implemented recovery query/projection contract.
- `context/archive/2026-09-05-cold-start-ai-planned-workout/plan.md` — existing AI generation, validation, and privacy seam.
- `context/archive/2026-09-03-history-list-and-filters/plan.md` — history query and pagination architecture.

## Open Questions

1. Should history-aware generation fail when fewer than five ready candidates can satisfy feasible coverage? Recommended:
   yes—do not spend the user's BYOK request on a known-invalid or recovery-violating proposal.
2. Should the initial exploration cap be one or two never-completed exercises? Recommended: start with one for users
   with established history and two for users with only 1–2 completed workouts, but use fewer when no unseen candidate
   clears the similarity/confidence threshold; then measure edits and re-rolls.
3. Is “never tried” formally “never present in completed app history”? Recommended: yes for MVP; the app has no safer
   evidence about external experience or merely shown/rejected proposals.
4. Should S-08 add proposal exposure/edit telemetry now? Recommended: only if learning preference is an explicit S-08
   success criterion. Otherwise implement the transparent heuristic and schedule telemetry before any bandit work.
5. What should replace cold-start's mandatory full-body coverage when a category is recovering? Recommended: maximize
   coverage across ready categories/movements, while treating recovery as the stronger invariant.
6. Does the product want physiological personalization later? If yes, it first needs explicit goals, experience,
   injuries/constraints, available equipment/time, actual performed work, and recovery feedback; no current library can
   infer these reliably from the stored prescription alone.

## Follow-up Research 2026-09-07T08:55:14+02:00

### Scope and source method

Exa AI MCP was used to search specifically for 2025–2026 primary sources: official repositories/package documentation,
current Cloudflare and Supabase documentation, and recent ACM/arXiv recommender papers. The strongest sources were then
fetched in full enough to validate their abstracts, implementation claims, runtime assumptions, and maintenance state.

### New algorithm evidence

Three recent papers strengthen the original recommendation while refining its novelty policy:

1. **Implicit completion data needs low confidence.** The KDD 2026 paper
   [Denoising Implicit Feedback for Cold-start Recommendation](https://arxiv.org/abs/2606.19658) identifies position,
   exposure, and behavioral effects as sources of noisy implicit labels. Its deployed approach uses content-similar warm
   items and explicitly weights pseudo-label confidence by content similarity. The application should therefore keep
   `completed_count` as a weak familiarity feature, and attach an explicit similarity/confidence value to each unseen
   exercise rather than treating every completion as a like or every unseen item as equally promising.
2. **Exploration should be selective, not guaranteed.** The RecSys 2025 paper
   [Item-centric Exploration for Cold Start Problem](https://arxiv.org/abs/2507.09423) reports better exploration
   efficiency from a lightweight Bayesian filter that withholds poorly targeted cold items. Although its industrial
   setting is much larger than this app, the relevant transferable principle is simple: an unseen exercise should earn
   an exploration slot by matching the user's structured profile; novelty alone is insufficient.
3. **Default Thompson priors can over-explore.** The 2025 work
   [Dynamic Prior Thompson Sampling for Cold-Start Exploration](https://arxiv.org/abs/2602.00943v1) shows that the common
   uniform `Beta(1,1)` prior may be far too optimistic for new arms and can waste exposure until feedback arrives. This
   reinforces deferring Thompson sampling until the app records real rewards and can estimate a defensible base rate.

The resulting refined policy is:

```text
recovering primary muscle -> ineligible
ready + previously completed -> familiar candidate
ready + never completed + similarity confidence >= threshold -> exploration candidate
ready + never completed + low confidence -> do not force into the slate
final selection -> feasible coverage, capped exploration, then MMR diversification
```

This changes the earlier “reserve one or two whenever available” wording to **permit up to one or two when justified**.
It does not change the recovery-first, content-based, pure-TypeScript architecture.

### New library candidates found by Exa

| Candidate                                                            | New information                                                                                                         | Assessment for this change                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@takk/bayesdecide`](https://github.com/davccavalcante/bayesdecide) | Created June 2026; TypeScript-first, zero runtime dependencies, edge entry point, Thompson sampling, serializable state | Technically Worker-compatible, but designed for prompt/variant experiments, extremely new with minimal adoption, and still needs a valid reward loop. Its documented default is `Beta(1,1)`, precisely the prior recent cold-start research warns may over-explore. Do not adopt for exercise ranking. It could later A/B-test two fixed recommendation policies after telemetry exists. |
| [Traffical JavaScript SDK](https://github.com/traffical/js-sdk)      | Created in 2026; pure TypeScript core with local contextual-bandit scoring and event/assignment tooling                 | Technically compatible at the SDK level, but packages are 0.x and the useful learning loop depends on a separate experimentation platform and event pipeline. It is operationally disproportionate for a solo, low-volume MVP.                                                                                                                                                           |
| [`simplebandit`](https://github.com/thoughtworks/simplebandit)       | Exa reconfirmed the repository is archived and its API is still beta                                                    | Remains rejected.                                                                                                                                                                                                                                                                                                                                                                        |

No mature, widely adopted, exercise-recommendation-specific TypeScript library emerged from the updated search. The
new packages prove that edge-native bandit primitives now exist, but they do not solve this application's missing
feedback semantics, recovery constraints, or slate coverage.

### Updated platform check

Current [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) still list 10 ms CPU
per HTTP request on the Free plan, 128 MB per isolate, compressed Worker size limits, and a one-second startup budget.
Current [Cloudflare WebAssembly documentation](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)
still states that Workers are single-threaded and that Wasm increases bundle/startup cost. This continues to favor a
small TypeScript ranker over a tensor runtime.

Current [Supabase automatic-embeddings guidance](https://supabase.com/docs/guides/ai/automatic-embeddings) still
requires vector storage plus an asynchronous queue, network function, cron, embedding service, and retry lifecycle.
That remains unnecessary for a small catalogue whose useful similarity fields are already categorical and curated.

### Final result after the Exa update

The final recommendation remains **no new recommendation library for S-08**. Implement the recovery-constrained hybrid
ranker directly in pure TypeScript, aggregate lifetime exercise history in Supabase, use confidence-gated exploration
and MMR for the shortlist, and keep the LLM behind server-owned candidate and validation rules.

If later telemetry records proposal exposure, removal, re-roll, retention, and completion, reassess a contextual
bandit. At that point, compare a tiny in-house calibrated Thompson/LinUCB implementation with the maturity of
`@takk/bayesdecide` and Traffical. Do not adopt uniform-prior Thompson sampling merely because an edge-compatible
package exists.
