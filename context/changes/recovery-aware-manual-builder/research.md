---
date: 2026-09-04T10:57:15+02:00
researcher: Codex
git_commit: c5bca5b6ce7b46bf06b1c5694254e144356b596b
branch: master
repository: 10xProjekt
topic: "Choose an existing recovery-time system for recovery-aware manual workout building"
tags: [research, recovery, workout-history, exercise-catalogue, manual-builder]
status: complete
last_updated: 2026-09-04
last_updated_by: Codex
last_updated_note: "Added evidence on primary and secondary muscle workload accounting"
---

# Research: Choose an existing recovery-time system for recovery-aware manual workout building

**Date**: 2026-09-04T10:57:15+02:00  
**Researcher**: Codex  
**Git Commit**: c5bca5b6ce7b46bf06b1c5694254e144356b596b  
**Branch**: master  
**Repository**: 10xProjekt

## Research Question

Which existing recovery-time system should Perfect Training Planner use for recovery-aware manual workout building, rather than inventing a proprietary recovery algorithm?

## Summary

Adopt the established **fixed per-muscle recovery-window** model. Use the project's existing `muscle_groups.recovery_hours` values as the policy table: a completed workout marks every mapped muscle group as recovering until `completed_at + recovery_hours`; the builder then visually demotes exercises that touch a recovering group while leaving them selectable.

This is a transparent implementation of the established minimum-rest guidance, not a new physiological scoring system. Public-health guidance commonly uses at least 48 hours before working the same muscle group again. The project already stores a conservative 48/72-hour policy per muscle group, so no external service, account linking, or new user-health data is needed. [Victorian Better Health Channel guidance](https://www.betterhealth.vic.gov.au/health/healthyliving/resistance-training-health-benefits)

Do not integrate Fitbod or Hevy for this feature. Fitbod's percentage engine is proprietary and depends on inputs this MVP does not collect; Hevy's public API exposes workout and exercise data, but not a muscle-recovery calculation. [Fitbod recovery overview](https://help.fitbod.me/hc/en-us/sections/360012732693-Feature-Overview), [Hevy public API](https://api.hevyapp.com/docs/)

## Recommended System

### Fixed per-muscle recovery windows

1. A workout becomes recovery-relevant only after the existing completion transaction assigns its server-owned `completed_at` timestamp.
2. For every exercise in that completed workout, read its primary and secondary muscle-group mappings.
3. For each muscle group, calculate `recovering_until = max(completed_at + recovery_hours)` across its matching completed history.
4. At builder load time, classify a group as `recovering` when `now < recovering_until`; otherwise classify it as `ready`.
5. An exercise touching any recovering group is visually demoted and labelled with the group and remaining time. It remains selectable, so the product guides rather than prescribes training.

This deliberately stops short of a recovery percentage, readiness score, injury prediction, or medical claim. The app only records prescribed sets and reps, not actual load, RPE, failure, sleep, soreness, cardio, body measurements, or health-platform data. Those inputs are required to responsibly approximate Fitbod-like dynamic scoring.

### Product decision

Use **visual demotion by default, never hard hiding**. It matches the roadmap's stated choice, preserves manual control, and avoids treating a time estimate as a safety or medical rule. A short note should say that recovery is a planning guide, not medical advice.

## Detailed Findings

### Existing project foundation already implements the policy data

The catalogue schema already has an explicit positive `recovery_hours` attribute for every muscle group. Its seeded taxonomy uses 48 hours for chest, delts, arms, forearms, and core, and 72 hours for back and lower-body groups. This is exactly the configuration surface needed for the recommended model; a new recovery engine or external provider is unnecessary.

- [create_exercise_catalogue.sql:15](https://github.com/januszmajek/10xProjekt/blob/c5bca5b6ce7b46bf06b1c5694254e144356b596b/supabase/migrations/20260820090000_create_exercise_catalogue.sql#L15) defines `muscle_groups.recovery_hours`.
- [create_exercise_catalogue.sql:34](https://github.com/januszmajek/10xProjekt/blob/c5bca5b6ce7b46bf06b1c5694254e144356b596b/supabase/migrations/20260820090000_create_exercise_catalogue.sql#L34) defines primary and secondary exercise-to-muscle mappings.
- [create_exercise_catalogue.sql:52](https://github.com/januszmajek/10xProjekt/blob/c5bca5b6ce7b46bf06b1c5694254e144356b596b/supabase/migrations/20260820090000_create_exercise_catalogue.sql#L52) seeds the current 48/72-hour policy.

### Completed history supplies the necessary event time and muscle membership

The completion RPC atomically assigns `completed_at`, so recovery must be calculated from completed—not planned—workouts. The history service already scopes reads to the signed-in owner, orders completed events by timestamp, and can return every exercise's muscle mappings. This supports an efficient owner-scoped recovery query without adding a new persistence model.

- [complete_planned_workout.sql:40](https://github.com/januszmajek/10xProjekt/blob/c5bca5b6ce7b46bf06b1c5694254e144356b596b/supabase/migrations/20260902130000_complete_planned_workout.sql#L40) writes the server timestamp during the durable completion transition.
- [workout-history.ts:113](https://github.com/januszmajek/10xProjekt/blob/c5bca5b6ce7b46bf06b1c5694254e144356b596b/src/lib/workout-history.ts#L113) queries only the owner's completed history and orders it by `completed_at`.
- [workout-history.ts:143](https://github.com/januszmajek/10xProjekt/blob/c5bca5b6ce7b46bf06b1c5694254e144356b596b/src/lib/workout-history.ts#L143) selects exercise prescriptions and primary/secondary muscle metadata.

### The catalogue response needs one small contract extension

The builder's current catalogue loader exposes muscle code, name, and role, but not `recovery_hours`. Planning should either join recovery state server-side and return it with each exercise, or include `recovery_hours` in the relation projection. The former keeps the client from reimplementing eligibility logic and is preferable.

- [planned-workouts.ts:142](https://github.com/januszmajek/10xProjekt/blob/c5bca5b6ce7b46bf06b1c5694254e144356b596b/src/lib/planned-workouts.ts#L142) loads the catalogue.
- [planned-workouts.ts:145](https://github.com/januszmajek/10xProjekt/blob/c5bca5b6ce7b46bf06b1c5694254e144356b596b/src/lib/planned-workouts.ts#L145) currently selects only the muscle name, omitting `recovery_hours`.

### Why not copy Fitbod

Fitbod is a good UX precedent: it tracks recovery per muscle group, favors fresher groups, and lets users override the guidance. However, it also estimates impact from sets, reps, and weight, incorporates personal statistics and optionally health-platform data, and says muscles may take up to six days to fully recover. Its calculation is not published as a reusable algorithm or exposed as a public recovery API. [Fitbod muscle recovery](https://help.fitbod.me/hc/en-us/sections/360012732693-Feature-Overview)

Copying its percentage output would therefore be guesswork. Integrating its app would also make the product dependent on a competing closed product and user data that this MVP intentionally does not collect.

### Why not use Hevy as a recovery service

Hevy has a public, Pro-gated API for workout, routine, exercise-template, history, and measurement data. Its documentation does not expose a computed muscle-recovery endpoint. It can be a future import/export integration, but it cannot supply the recovery decision for the project's own completed workouts. [Hevy public API](https://api.hevyapp.com/docs/)

### Evidence boundary

Public-health guidance advises resting a muscle group for at least 48 hours before working it again. Resistance-training recovery research also finds that recovery time changes with training-to-failure and can extend through the 24–48-hour window, which supports avoiding false precision in this MVP. [Victorian Better Health Channel guidance](https://www.betterhealth.vic.gov.au/health/healthyliving/resistance-training-health-benefits), [time course of recovery after resistance training](https://pubmed.ncbi.nlm.nih.gov/28965198/)

The app's 72-hour entries are therefore a conservative product policy layered on top of that minimum, not a claim that every user or muscle has an exact universal recovery duration.

## Architecture Insights

- Keep recovery as a derived, read-time projection of immutable completed history; do not persist a mutable recovery score.
- Reuse the existing `recovery_hours` policy table, exercise-muscle mapping, and server-generated completion timestamp.
- Compute once in the service/API layer and return display-ready state such as `ready`, `recovering`, `recoveringUntil`, and affected muscle names; React should only render it.
- Use all mapped muscles for recovery guidance. Primary/secondary roles can be displayed to explain why an exercise was demoted, but should not create different made-up multipliers in this slice.
- Keep the policy fixed for MVP. The roadmap already identifies user-tunable defaults as a non-blocking future question.

## Historical Context

The data foundation deliberately created completion timestamps, immutable completed workouts, muscle groups, and exercise muscle mappings before this roadmap slice. The completed-workout implementation explicitly identifies completed history as the input required by recovery-aware filtering.

- [domain-data plan](https://github.com/januszmajek/10xProjekt/blob/c5bca5b6ce7b46bf06b1c5694254e144356b596b/context/archive/2026-08-19-domain-data-and-seed-catalogue/plan.md) established the durable workout lifecycle and catalogue contracts.
- [completion plan](https://github.com/januszmajek/10xProjekt/blob/c5bca5b6ce7b46bf06b1c5694254e144356b596b/context/archive/2026-09-02-mark-planned-workout-done/plan.md) established server-owned completion time and immutable history.
- [roadmap](https://github.com/januszmajek/10xProjekt/blob/c5bca5b6ce7b46bf06b1c5694254e144356b596b/context/foundation/roadmap.md#L153) scopes S-06 to guidance based on recent completed history and leaves hide-versus-demote as the product choice.

## Related Research

No earlier research artifact for recovery-aware filtering exists in the active or archived change folders.

## Open Questions

1. Confirm the UX policy: demote and label recovering exercises by default, while always allowing manual selection.
2. Decide whether the 48/72-hour values need a named product-policy explanation in the UI or only in internal documentation.
3. Defer user-specific adjustments, health-platform sync, actual-load/RPE capture, and recovery percentages until the app has trustworthy inputs for them.

## Follow-up Research 2026-09-04T11:19:22+02:00

### Question

How should the builder account for primary and secondary muscle involvement, and is there an established algorithm for it?

### Finding: use fractional-set accounting for workload, not a fabricated recovery score

There is a current, evidence-based convention for counting compound exercises: every set contributes **1.0 set** to a primary muscle and **0.5 sets** to a secondary/synergist muscle. Pelland et al.'s systematic review and meta-regression compared direct-only, full, and fractional indirect-set methods; fractional accounting had the strongest relative evidence for modelling hypertrophy dose response. [Published record](https://doi.org/10.1007/s40279-025-02344-w), [open preprint](https://sportrxiv.org/index.php/server/preprint/view/460)

This is a suitable existing algorithm for estimating *workload*. It is not a validated formula for turning workload into an exact number of recovery hours. Acute EMG data cannot fill that gap: it is not a validated predictor of long-term hypertrophy, and individual technique, load, range of motion, and proximity to failure materially change secondary-muscle contribution. [EMG limitations review](https://pubmed.ncbi.nlm.nih.gov/35006527/)

Fitbod confirms the distinction in product practice: it estimates each muscle's exercise impact from sets, reps, and weight, then combines that with personal and external activity inputs. Its per-muscle impact formula is proprietary, so it cannot be adopted or responsibly reproduced here. [Fitbod algorithm overview](https://fitbod.me/blog/fitbod-algorithm/)

### Recommendation for this change

Use the established fractional-set convention internally:

- `primary contribution = completed sets × 1.0`
- `secondary contribution = completed sets × 0.5`

Then apply a transparent two-level recovery policy rather than claiming a percentage score:

- A muscle is **recovering** for its full configured 48/72-hour window when it received at least one primary set in a completed workout.
- A muscle that received only secondary work remains **ready**, but carries its fractional workload in the response so a future, data-rich version can use it for more nuanced ranking.

This keeps the present ready/recovering split evidence-aligned and explainable. It also avoids marking every chest press as a full recovery event for triceps and front delts when the app does not yet record actual load, RIR, failure, or post-workout feedback.

The application already records only prescribed `sets` and `reps`, while exercise role is canonical catalogue data. The recovery projection can therefore calculate fractional contributions with no schema change, but must not represent them as a medical readiness score.

- [manual-workout-builder.ts:24](https://github.com/januszmajek/10xProjekt/blob/c5bca5b6ce7b46bf06b1c5694254e144356b596b/src/lib/manual-workout-builder.ts#L24) defines the primary/secondary muscle role received by the client.
- [workout-history.ts:143](https://github.com/januszmajek/10xProjekt/blob/c5bca5b6ce7b46bf06b1c5694254e144356b596b/src/lib/workout-history.ts#L143) shows the completed-history fields available for the projection.

### Resulting planning decision to confirm

For this MVP, ready/not-ready bucketing should use full fixed recovery windows for **primary** involvement only. Secondary involvement should be retained as a fractional workload contribution and displayed as context, not as a separate recovery block. A later slice can graduate to a dynamic score after actual load, RIR, failure, or user-reported recovery inputs exist.
