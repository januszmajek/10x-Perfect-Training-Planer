---
project: Perfect Training Planner
version: 3
status: draft
created: 2026-06-13
updated: 2026-09-01
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: Perfect Training Planner

> Derived from `context/foundation/prd.md` (v1), the auto-researched codebase baseline, and
> `context/changes/manual-first-workout-sequencing/frame.md`.
> Edit in place; archive only when fully superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Recreational solo lifters need a faster way to decide their next workout without remembering recent muscle-group
load or repeating the same familiar exercises. The product first establishes a complete manual planning loop: build
and save a workout, edit it, mark it done, review the resulting history, and use that history to guide the next manual
plan. AI generation follows this shared lifecycle instead of owning it.

## North star

Here, **north star** means the smallest end-to-end slice whose delivery proves the product's central promise well
enough to guide what gets built next.

**S-07: User can generate, edit, and save a cold-start AI workout** — this is the first slice that proves the PRD's
AI speed-and-variety promise, while the manual-first sequence deliberately places it after the complete manual path.

## At a glance

| ID   | Change ID                      | Outcome (user can ...)                                                                                | Prerequisites | PRD refs                                                                 | Status   |
| ---- | ------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------ | -------- |
| F-01 | domain-data-and-seed-catalogue | (foundation) minimal workout data contracts and seeded preset catalogue are in place                  | —             | FR-003, FR-008, FR-010, FR-012, Privacy, Data durability, Access Control | done     |
| S-01 | private-account-and-ai-key     | sign in to a private planner workspace and manage a masked AI provider key                            | F-01          | FR-001, FR-002, FR-015                                                   | done     |
| S-02 | manual-workout-create-and-save | browse the seeded catalogue, compose sets and reps, and save a manual workout as planned              | F-01, S-01    | FR-003, FR-006, FR-008, Data durability, Access Control                  | done     |
| S-03 | planned-workout-editing        | edit and delete a saved planned workout                                                               | S-02          | FR-009, FR-011                                                           | proposed |
| S-04 | mark-planned-workout-done      | mark a planned workout done so it becomes completed history                                           | S-02          | US-04, FR-010, Data durability                                           | proposed |
| S-05 | history-list-and-filters       | view completed workout history with date and muscle-group filters                                     | S-04          | FR-012                                                                   | proposed |
| S-06 | recovery-aware-manual-builder  | build and save a manual workout while recovery-aware filtering guides catalogue choices               | S-04          | US-03, FR-003, FR-006, FR-007, FR-008                                    | proposed |
| S-07 | cold-start-ai-planned-workout  | generate, re-roll, edit, and save a cold-start AI workout, with the completed manual path as fallback | S-03, S-06    | US-02, FR-004, FR-005, FR-008, FR-016, AI responsiveness                 | proposed |
| S-08 | history-aware-ai-proposal      | generate, re-roll, edit, and save an AI workout that respects recent history and recovery windows     | S-07          | US-01, FR-004, FR-005, FR-008, AI responsiveness, Data durability        | proposed |

## Baseline

What's already in place in the codebase as of `2026-09-01` (auto-researched and consistent with the user-supplied
sequencing frame). Foundations below assume these capabilities are present and do not re-scaffold them.

- **Frontend:** partial — Astro SSR, React islands, Tailwind, and shared UI primitives are present; workout and
  catalogue screens are absent.
- **Backend / API:** partial — authentication and AI-key handlers are present; workout, catalogue, and AI-generation
  handlers are absent.
- **Data:** present — the seeded catalogue, private planned/completed workout lifecycle, mutation locking, and typed
  database contracts are present.
- **Auth:** present — Supabase email/password auth, persistent sessions, protected routes, and encrypted AI-key
  management are present.
- **Deploy / infra:** present — Cloudflare Worker configuration, CI verification, and a manual deployment path are
  present; automated deployment remains deferred.
- **Observability:** partial — platform observability is enabled; application-level logging and AI timing/error signals
  are absent.

## Foundations

### F-01: Domain data and seed catalogue

- **Outcome:** (foundation) minimal workout data contracts, user ownership boundaries, and seeded preset exercise
  catalogue are in place for planned workouts, completed history, and catalogue browsing.
- **Change ID:** domain-data-and-seed-catalogue
- **PRD refs:** FR-003, FR-008, FR-010, FR-012, Privacy, Data durability, Access Control
- **Unlocks:** S-02, S-03, S-04, S-05, S-06, S-07, S-08
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This completed foundation stays narrow; each user-facing slice still integrates and verifies its own
  catalogue and workout behavior.
- **Status:** done

## Slices

### S-01: Private account and AI key

- **Outcome:** User can sign in to a private planner workspace and add, view masked, update, or remove an AI provider
  API key.
- **Change ID:** private-account-and-ai-key
- **PRD refs:** FR-001, FR-002, FR-015
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This completed slice establishes the private workspace used by both manual and AI planning without making
  generation a prerequisite for workout ownership.
- **Status:** done

### S-02: Manual workout create and save

- **Outcome:** User can browse and filter the seeded exercise catalogue, compose a workout with sets and reps, and
  save it as a planned manual workout.
- **Change ID:** manual-workout-create-and-save
- **PRD refs:** FR-003, FR-006, FR-008, Data durability, Access Control
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the first unfinished slice because it creates a real, durable plan that every later manual
  lifecycle capability can exercise without AI coupling.
- **Status:** done

### S-03: Planned workout editing

- **Outcome:** User can edit a saved planned workout by swapping, adding, or removing exercises, changing sets/reps,
  and deleting the planned workout.
- **Change ID:** planned-workout-editing
- **PRD refs:** FR-009, FR-011
- **Prerequisites:** S-02
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Editing follows manual save so it is verified against a real planned workout and remains independent of
  how that workout was originally created.
- **Status:** proposed

### S-04: Mark planned workout done

- **Outcome:** User can mark a planned workout done, moving it into completed history for future planning.
- **Change ID:** mark-planned-workout-done
- **PRD refs:** US-04, FR-010, Data durability
- **Prerequisites:** S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This follows manual save because it creates the real completed-history input required by recovery-aware
  manual filtering and later AI recommendations.
- **Status:** proposed

### S-05: History list and filters

- **Outcome:** User can view completed workout history with date-range and muscle-group filters plus per-entry detail.
- **Change ID:** history-list-and-filters
- **PRD refs:** FR-012
- **Prerequisites:** S-04
- **Parallel with:** S-03, S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** History display follows completion so its list and filters are exercised against real workouts instead of
  static examples.
- **Status:** proposed

### S-06: Recovery-aware manual builder

- **Outcome:** User can compose and save another manual workout while exercises for recovering muscle groups are
  hidden or visually demoted using recent completed history.
- **Change ID:** recovery-aware-manual-builder
- **PRD refs:** US-03, FR-003, FR-006, FR-007, FR-008
- **Prerequisites:** S-04
- **Parallel with:** S-03, S-05
- **Blockers:** —
- **Unknowns:**
  - Should recovery-aware filtering hide exercises completely or visually demote them by default? — Owner: user.
    Block: no.
- **Risk:** Smart filtering waits for a real completion event so recovery behavior is validated with genuine history,
  while basic manual creation remains available earlier.
- **Status:** proposed

### S-07: Cold-start AI planned workout

- **Outcome:** User with no completed history can generate, re-roll, and edit an AI starter workout before saving it
  as planned, and reach the completed manual builder when no valid AI key is available.
- **Change ID:** cold-start-ai-planned-workout
- **PRD refs:** US-02, FR-004, FR-005, FR-008, FR-016, AI responsiveness
- **Prerequisites:** S-03, S-06
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** S-03 and S-06 provide the shared editing and fallback capabilities this slice consumes; S-05 remains
  sequenced before AI as a manual-first delivery decision rather than a false functional dependency.
- **Status:** proposed

### S-08: History-aware AI proposal

- **Outcome:** User with completed history can generate, re-roll, edit, and save an AI workout that respects recent
  muscle-group recovery windows.
- **Change ID:** history-aware-ai-proposal
- **PRD refs:** US-01, FR-004, FR-005, FR-008, AI responsiveness, Data durability
- **Prerequisites:** S-07
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the final MVP planning capability because it reuses the completed manual lifecycle, the
  proposal-review path, and the recovery behavior already proven through the manual builder.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                      | Suggested issue title                                   | Ready for `/10x-plan` | Notes                                           |
| ---------- | ------------------------------ | ------------------------------------------------------- | --------------------- | ----------------------------------------------- |
| F-01       | domain-data-and-seed-catalogue | Establish domain data contracts and seed catalogue      | no                    | Already done and archived.                      |
| S-01       | private-account-and-ai-key     | Add private planner account surface and BYOK settings   | no                    | Already done and archived.                      |
| S-02       | manual-workout-create-and-save | Build and save the first manual planned workout         | yes                   | Run `/10x-plan manual-workout-create-and-save`. |
| S-03       | planned-workout-editing        | Edit and delete planned workouts                        | no                    | Wait for S-02.                                  |
| S-04       | mark-planned-workout-done      | Mark planned workouts done into completed history       | no                    | Wait for S-02.                                  |
| S-05       | history-list-and-filters       | View completed workout history with filters             | no                    | Wait for S-04.                                  |
| S-06       | recovery-aware-manual-builder  | Add recovery-aware filtering to manual workout planning | no                    | Wait for S-04.                                  |
| S-07       | cold-start-ai-planned-workout  | Generate, edit, and save a cold-start AI workout        | no                    | Requires S-03 and S-06; sequence after S-05.    |
| S-08       | history-aware-ai-proposal      | Generate, edit, and save a history-aware AI workout     | no                    | Wait for S-07.                                  |

## Open Roadmap Questions

1. **FR-013 (delete history entry) — include in MVP or defer?** — Owner: user. Block: no; nice-to-have and MVP works
   without it.
2. **FR-014 (do again from history) — include in MVP or defer?** — Owner: user. Block: no; nice-to-have and MVP works
   without it.
3. **Recovery window defaults — should they become user-tunable?** — Owner: user. Block: no; fixed defaults are
   sufficient for MVP.

## Parked

- **Native mobile apps** — Why parked: PRD Non-Goals; web-only responsive MVP.
- **Fitness tracker and health-app integrations** — Why parked: PRD Non-Goals; workouts are entered in-app.
- **History import from external formats** — Why parked: PRD Non-Goals; history starts from app usage.
- **Workout sharing and social features** — Why parked: PRD Non-Goals; no sharing between users in MVP.
- **Analytics dashboards** — Why parked: PRD Non-Goals; history is a list, not progress analytics.
- **In-gym real-time substitution** — Why parked: PRD Non-Goals; this is a planning tool, not an in-session companion.
- **Hosted or paid AI** — Why parked: PRD Non-Goals; BYOK keeps inference cost outside the app.
- **Custom exercise CRUD** — Why parked: PRD Non-Goals; seeded preset catalogue is enough for MVP.
- **Favorites** — Why parked: PRD Non-Goals; deferred to v1.1.
- **CSV export** — Why parked: PRD Non-Goals; deferred to v1.1.
- **FR-013 delete history entry** — Why parked: nice-to-have with data-quality risk for AI reasoning.
- **FR-014 do again from history** — Why parked: nice-to-have that may compete with the AI proposer success metric.

## Done

- **F-01: (foundation) minimal workout data contracts, user ownership boundaries, and seeded preset exercise catalogue are in place for planned workouts, completed history, and catalogue browsing.** — Archived 2026-08-27 → `context/archive/2026-08-19-domain-data-and-seed-catalogue/`. Lesson: —.
- **S-01: User can sign in to a private planner workspace and manage a masked AI provider key** — Archived 2026-08-28 → `context/archive/2026-08-27-private-account-and-ai-key/`. Lesson: —.
- **S-02: User can browse and filter the seeded exercise catalogue, compose a workout with sets and reps, and save it as a planned manual workout.** — Archived 2026-09-01 → `context/archive/2026-09-01-manual-workout-create-and-save/`. Lesson: —.
