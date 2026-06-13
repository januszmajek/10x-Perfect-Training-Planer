---
project: Perfect Training Planner
version: 1
status: draft
created: 2026-06-13
updated: 2026-06-13
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: Perfect Training Planner

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Recreational solo lifters need a faster way to decide their next workout without remembering recent
muscle-group load or repeating the same familiar exercises. Perfect Training Planner proves value when a user can
save a planned workout from either an AI proposal or a manual builder, mark it done, and have that completed history
inform the next recommendation.

## North star

Here, **north star** means the smallest end-to-end slice whose delivery proves the product's main bet well enough to
guide what gets built next.

**S-02: User can generate and save a cold-start AI workout** — this is first because it proves the AI planning loop
without waiting for completed workout history, which keeps the shortest path to an MVP.

## At a glance

| ID   | Change ID                      | Outcome (user can ...)                                                                          | Prerequisites | PRD refs                                                                 | Status   |
| ---- | ------------------------------ | ----------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------ | -------- |
| F-01 | domain-data-and-seed-catalogue | (foundation) minimal workout data contracts and seeded preset catalogue are in place            | -             | FR-003, FR-008, FR-010, FR-012, Privacy, Data durability, Access Control | ready    |
| S-01 | private-account-and-ai-key     | sign in to a private planner workspace and manage a masked AI provider key                      | F-01          | FR-001, FR-002, FR-015                                                   | proposed |
| S-02 | cold-start-ai-planned-workout  | generate, re-roll, and save a cold-start AI workout as planned                                  | F-01, S-01    | US-02, FR-004, FR-005, FR-008, AI responsiveness, Data durability        | proposed |
| S-03 | planned-workout-editing        | edit and delete a saved planned workout                                                         | S-02          | FR-009, FR-011                                                           | proposed |
| S-04 | mark-planned-workout-done      | mark a planned workout done so it becomes completed history                                     | S-02          | US-04, FR-010, Data durability                                           | proposed |
| S-05 | history-list-and-filters       | view completed workout history with date and muscle-group filters                               | S-04          | FR-012                                                                   | proposed |
| S-06 | history-aware-ai-proposal      | generate an AI workout that respects recent completed history and recovery windows              | S-04          | US-01, FR-004, FR-005, AI responsiveness                                 | proposed |
| S-07 | manual-builder-smart-filter    | build a workout manually from a filtered catalogue and use it when no valid AI key is available | S-01, S-04    | US-03, FR-003, FR-006, FR-007, FR-008, FR-016                            | proposed |

## Streams

Navigation aid - groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency
graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                   | Chain                                          | Note                                                         |
| ------ | ----------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| A      | AI planning path        | `F-01` -> `S-01` -> `S-02` -> `S-04` -> `S-06` | Shortest route from setup to history-aware AI planning.      |
| B      | Planned workout control | `S-03`                                         | Branches after `S-02`; can run beside the done/history path. |
| C      | History and fallback    | `S-05` / `S-07`                                | Joins Stream A at `S-04`; fills required MVP support flows.  |

## Baseline

What's already in place in the codebase as of `2026-06-13` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present - Astro SSR, React islands, Tailwind, and shadcn-style primitives are present.
- **Backend / API:** partial - API routes exist for authentication; workout, catalogue, and AI routes are absent.
- **Data:** partial - Supabase is configured; domain schema, migrations, and seed catalogue are absent.
- **Auth:** present - Supabase auth, signup/signin/signout endpoints, middleware, and protected dashboard are present.
- **Deploy / infra:** present - Cloudflare Workers adapter, Wrangler config, and GitHub Actions CI are present.
- **Observability:** partial - platform observability is enabled; app-level AI timing/error signals are absent.

## Foundations

### F-01: Domain data and seed catalogue

- **Outcome:** (foundation) minimal workout data contracts, user ownership boundaries, and seeded preset exercise
  catalogue are in place for planned workouts, completed history, and catalogue browsing.
- **Change ID:** domain-data-and-seed-catalogue
- **PRD refs:** FR-003, FR-008, FR-010, FR-012, Privacy, Data durability, Access Control
- **Unlocks:** S-01, S-02, S-04, S-05, S-06, S-07
- **Prerequisites:** -
- **Parallel with:** -
- **Blockers:** -
- **Unknowns:** -
- **Risk:** This foundation is intentionally narrow; if it grows into a full data layer project, it delays the first
  AI planning proof point.
- **Status:** ready

## Slices

### S-01: Private account and AI key

- **Outcome:** User can sign in to a private planner workspace and add, view masked, update, or remove an AI provider
  API key.
- **Change ID:** private-account-and-ai-key
- **PRD refs:** FR-001, FR-002, FR-015
- **Prerequisites:** F-01
- **Parallel with:** -
- **Blockers:** -
- **Unknowns:** -
- **Risk:** Existing auth is present, so the risk is overbuilding account settings before the first AI planning flow
  needs only BYOK storage.
- **Status:** proposed

### S-02: Cold-start AI planned workout

- **Outcome:** User with no completed history can generate an AI starter workout, re-roll it, and save it as a planned
  workout.
- **Change ID:** cold-start-ai-planned-workout
- **PRD refs:** US-02, FR-004, FR-005, FR-008, AI responsiveness, Data durability
- **Prerequisites:** F-01, S-01
- **Parallel with:** -
- **Blockers:** -
- **Unknowns:**
  - Which supported AI provider shape is allowed for MVP BYOK? - Owner: user. Block: no.
- **Risk:** This is sequenced early because it proves the AI loop fastest; the main risk is spending time on
  history-aware rules before the cold-start path works.
- **Status:** proposed

### S-03: Planned workout editing

- **Outcome:** User can edit a saved planned workout by swapping, adding, or removing exercises, changing sets/reps,
  and deleting the planned workout.
- **Change ID:** planned-workout-editing
- **PRD refs:** FR-009, FR-011
- **Prerequisites:** S-02
- **Parallel with:** S-04
- **Blockers:** -
- **Unknowns:** -
- **Risk:** Editing comes after the first saved plan so it stays tied to a real planned workout, not a standalone
  editor.
- **Status:** proposed

### S-04: Mark planned workout done

- **Outcome:** User can mark a planned workout done, moving it into completed history for future planning.
- **Change ID:** mark-planned-workout-done
- **PRD refs:** US-04, FR-010, Data durability
- **Prerequisites:** S-02
- **Parallel with:** S-03
- **Blockers:** -
- **Unknowns:** -
- **Risk:** This creates the completed-history input needed by both recovery filtering and history-aware AI; delaying
  it would block the real planning loop.
- **Status:** proposed

### S-05: History list and filters

- **Outcome:** User can view completed workout history with date-range and muscle-group filters plus per-entry detail.
- **Change ID:** history-list-and-filters
- **PRD refs:** FR-012
- **Prerequisites:** S-04
- **Parallel with:** S-06, S-07
- **Blockers:** -
- **Unknowns:** -
- **Risk:** History display follows mark-done so filters are exercised against real completed workouts rather than
  static examples.
- **Status:** proposed

### S-06: History-aware AI proposal

- **Outcome:** User with completed history can generate and re-roll an AI workout that respects recent muscle-group
  recovery windows.
- **Change ID:** history-aware-ai-proposal
- **PRD refs:** US-01, FR-004, FR-005, AI responsiveness
- **Prerequisites:** S-04
- **Parallel with:** S-05, S-07
- **Blockers:** -
- **Unknowns:**
  - Should recovery windows remain fixed at 48h general and 72h legs/back for MVP? - Owner: user. Block: no.
- **Risk:** This is the main recovery-rule proof; it waits until completed history exists so the AI can read real
  prior sessions.
- **Status:** proposed

### S-07: Manual builder smart filter

- **Outcome:** User can compose a planned workout manually from the seeded catalogue, with recently trained muscle
  groups hidden or visually demoted, and is routed here when no valid AI key is configured.
- **Change ID:** manual-builder-smart-filter
- **PRD refs:** US-03, FR-003, FR-006, FR-007, FR-008, FR-016
- **Prerequisites:** S-01, S-04
- **Parallel with:** S-05, S-06
- **Blockers:** -
- **Unknowns:**
  - Should smart filtering hide exercises completely or visually demote them by default? - Owner: user. Block: no.
- **Risk:** Manual planning is required for MVP fallback, but placing it after the AI cold-start path keeps the roadmap
  biased toward the fastest AI-led launch path.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                      | Suggested issue title                                 | Ready for `/10x-plan` | Notes                                   |
| ---------- | ------------------------------ | ----------------------------------------------------- | --------------------- | --------------------------------------- |
| F-01       | domain-data-and-seed-catalogue | Establish domain data contracts and seed catalogue    | yes                   | Run first; unlocks the north star path. |
| S-01       | private-account-and-ai-key     | Add private planner account surface and BYOK settings | no                    | Wait for F-01.                          |
| S-02       | cold-start-ai-planned-workout  | Generate and save a cold-start AI planned workout     | no                    | Wait for F-01 and S-01.                 |
| S-03       | planned-workout-editing        | Edit and delete planned workouts                      | no                    | Wait for S-02.                          |
| S-04       | mark-planned-workout-done      | Mark planned workouts done into completed history     | no                    | Wait for S-02.                          |
| S-05       | history-list-and-filters       | View completed workout history with filters           | no                    | Wait for S-04.                          |
| S-06       | history-aware-ai-proposal      | Generate AI proposals from completed workout history  | no                    | Wait for S-04.                          |
| S-07       | manual-builder-smart-filter    | Build workouts manually with recovery-aware filtering | no                    | Wait for S-01 and S-04.                 |

## Open Roadmap Questions

1. **FR-013 (delete history entry) - include in MVP or defer?** - Owner: user. Block: no; nice-to-have and MVP works
   without it.
2. **FR-014 (do again from history) - include in MVP or defer?** - Owner: user. Block: no; nice-to-have and MVP works
   without it.
3. **Recovery window defaults - should they become user-tunable?** - Owner: user. Block: no; fixed defaults are
   sufficient for MVP.

## Parked

- **Native mobile apps** - Why parked: PRD Non-Goals; web-only responsive MVP.
- **Fitness tracker and health-app integrations** - Why parked: PRD Non-Goals; workouts are entered in-app.
- **History import from external formats** - Why parked: PRD Non-Goals; history starts from app usage.
- **Workout sharing and social features** - Why parked: PRD Non-Goals; no sharing between users in MVP.
- **Analytics dashboards** - Why parked: PRD Non-Goals; history is a list, not progress analytics.
- **In-gym real-time substitution** - Why parked: PRD Non-Goals; this is a planning tool, not an in-session companion.
- **Hosted or paid AI** - Why parked: PRD Non-Goals; BYOK keeps inference cost outside the app.
- **Custom exercise CRUD** - Why parked: PRD Non-Goals; seeded preset catalogue is enough for MVP.
- **Favorites** - Why parked: PRD Non-Goals; deferred to v1.1.
- **CSV export** - Why parked: PRD Non-Goals; deferred to v1.1.
- **FR-013 delete history entry** - Why parked: nice-to-have with data-quality risk for AI reasoning.
- **FR-014 do again from history** - Why parked: nice-to-have that may compete with the AI proposer success metric.

## Done
