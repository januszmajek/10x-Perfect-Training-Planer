---
project: "Perfect Training Planner"
version: 1
status: draft
created: 2026-05-30
context_type: greenfield
product_type: web_app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: true
  after_hours_only: true
---

## Vision & Problem Statement

Recreational solo lifters (training 3–5x/week, no coach) struggle to plan the next session well: they have to remember which muscle groups they hit and how long ago, and they default to the same handful of exercises out of habit so training stagnates. The decision happens the day after a session (or while opening a notes app/spreadsheet to log) and the cost is mental overhead plus suboptimal recovery splits plus boredom plus slower progress.

An AI proposer that reads the user's last session(s) plus simple muscle-recovery rules can produce a sensible next workout faster than the user can plan it manually — and can inject variety the user wouldn't pick on their own.

## User & Persona

**Primary persona**: a recreational solo lifter.

- Trains 3–5x/week in a gym (no coach, no structured program like PPL/5/3/1).
- Logs workouts informally today (notes app, spreadsheet, memory, or not at all).
- Comfortable with web apps; will plan tomorrow's session either the night before or that morning, on a phone or laptop.
- Motivated by progress and variety; frustrated by stagnation and by spending 10+ minutes planning each session.

## Success Criteria

### Primary

The end-to-end planning loop works:

1. User logs in.
2. User chooses **AI proposer** OR **manual builder**:
   - **AI proposer**: app reads the user's recent _completed_ history (or treats "no history" as a balanced-starter cold-start) and returns a proposed workout (exercises + sets/reps) that respects muscle-recovery windows vs the last session.
   - **Manual builder**: user browses the seeded exercise catalogue with a smart filter that hides muscle groups trained in the recent session(s), and composes a workout manually.
3. The result is saved as a **planned workout** (NOT yet history). User can edit it (swap an exercise for another, add an exercise, remove an exercise, change sets/reps).
4. When the user trains, they mark the planned workout **done** — it then moves into **history** and becomes input for the next AI proposal.

### Secondary

- ≥ 3 workouts/week generated per active user (planning frequency).
- ≥ 75% of generated workouts use the AI proposer (vs manual builder).

### Guardrails

- **Privacy**: a user's workouts and history are never visible to any other user.
- **AI responsiveness**: AI proposal returns in < 10s p95 — user perceives it as "fast enough" relative to manual planning.
- **Data durability**: no completed workout is lost once saved.

## User Stories

### US-01: AI-proposed workout (primary flow)

- **Given** I am logged in and have at least one completed workout in history
- **When** I click "Propose workout"
- **Then** the app returns a workout within 10 seconds that avoids the muscle groups I trained in my most recent session, and I can either save it as planned, re-roll, or edit it before saving

### US-02: AI proposer cold-start

- **Given** I am logged in and have NO completed workouts in history
- **When** I click "Propose workout"
- **Then** the app returns a balanced full-body starter workout within 10 seconds, and I can save, re-roll, or edit it

### US-03: Manual build with smart filter

- **Given** I am logged in and completed a workout yesterday targeting chest and triceps
- **When** I open the manual builder
- **Then** exercises targeting chest and triceps are hidden (or visually demoted) by default because they fall within the 48h recovery window, and I can compose a workout from the remaining catalogue and save it as planned

### US-04: Mark done

- **Given** I have a planned workout for today
- **When** I click "Mark done"
- **Then** the workout moves out of "planned" into history, and the next AI proposal takes this session into account

## Functional Requirements

### Authentication

- FR-001: User can register an account with email + password. Priority: must-have
  > Socrates: stands as written. Email+password is the lowest-risk default;
  > OAuth and magic-link can be added post-MVP.
- FR-002: User can log in and log out. Session persists until the user explicitly logs out (no idle-timeout auto-logout). Priority: must-have
  > Socrates: refined — a gym app re-logging the user every 2 weeks is
  > friction. Sessions persist indefinitely until manual logout.

### Exercise catalogue

- FR-003: User can browse the seeded preset exercise catalogue with search and filter (multi-select muscle groups, equipment). Priority: must-have
  > Socrates: stands as written. Multi-select on muscle groups is required
  > because most compound lifts hit 2–3 groups.

### Workout planning — AI proposer

- FR-004: User can request an AI-proposed workout. The proposer reads the user's recent completed history (or a cold-start signal if none) and returns a workout that (a) respects muscle-recovery windows vs the last session and (b) prefers muscle groups NOT trained in the last session. Priority: must-have
  > Socrates: stands as written. Set/rep/volume awareness is a v1.1
  > sophistication; MVP proves the muscle-group split insight first.
- FR-005: User can re-roll (re-request) the AI proposal if they don't like it. Priority: must-have
  > Socrates: stands as written. Cost-ceiling concern is real and is
  > captured under guardrails (NFR), not by limiting the UX.

### Workout planning — manual builder

- FR-006: User can manually compose a workout by picking exercises from the catalogue. Priority: must-have
  > Socrates: stands as written. Manual builder is the fallback when the
  > user disagrees with AI; cutting it removes user agency.
- FR-007: Manual builder smart filter hides (or visually demotes) exercises whose muscle groups are still within a per-muscle-group recovery window (default 48h; 72h for legs/back) based on the user's recent _completed_ history — not based on a single "last session". Priority: must-have
  > Socrates: refined — "most recent session" is too narrow; a fixed recovery
  > window per muscle group is the right primitive.

### Workout lifecycle

- FR-008: User can save any workout (AI-proposed or manual) as a planned workout. Priority: must-have
  > Socrates: stands as written. The planned/done split is what enables the
  > AI proposer to read REAL completed history (not aspirational). FR-014
  > covers reuse across sessions.
- FR-009: User can edit a planned workout: swap one exercise for another, add an exercise, remove an exercise, change sets/reps. Muscle-group tags are NOT editable (they are canonical properties of each exercise). Priority: must-have
  > Socrates: refined — editing muscle-group tags would desync from the
  > catalogue and corrupt AI proposer history reading. Dropped.
- FR-010: User can mark a planned workout as done, moving it into history. Priority: must-have
  > Socrates: stands as written. The "history is fiction" risk is real but
  > sets/reps/weights tracking is a v1.1 concern; MVP records WHAT was done,
  > v1.1 records HOW WELL.
- FR-011: User can delete a planned workout. Priority: must-have
  > Socrates: stands as written. Soft-delete is a UX refinement, not a
  > capability gap.

### History

- FR-012: User can view their workout history with filtering: by date range and by muscle group. List + per-entry detail. Priority: must-have
  > Socrates: refined — a flat list won't scale; date + muscle-group filters
  > are MVP, not nice-to-have.
- FR-013: User can delete a history entry. Priority: nice-to-have
  > Socrates: kept as nice-to-have. Risk noted — deleting history corrupts
  > AI reasoning. May be dropped if it doesn't fit; revisit during build.
- FR-014: User can "do again" a workout from history — clones a history entry into a new planned workout the user can edit before marking done. Priority: nice-to-have
  > Socrates: kept as nice-to-have. Risk noted — if heavily used, it competes
  > with the AI proposer and threatens the 75%-via-AI metric. Monitor
  > usage post-launch; may be dropped if it doesn't fit MVP timeline.

### BYOK (Bring Your Own Key)

- FR-015: User can add, view (masked), update, and remove their AI provider API key in account settings. Priority: must-have
- FR-016: When a user with no valid API key invokes the AI proposer, the app surfaces a clear "configure API key" prompt and falls back to the manual builder. Priority: must-have

## Non-Functional Requirements

- **Privacy**: a user's workouts, history, and API key are never visible to any other user. The API key is stored encrypted at rest.
- **AI responsiveness**: AI proposer call returns within 10s p95 — measured user-perceived, end-to-end (including the call to the user's chosen AI provider).
- **Data durability**: once a workout is saved as planned or marked done, it is never silently lost.
- **Browser support**: works on the last 2 versions of Chrome, Firefox, Safari, and Edge.
- **Responsive layout**: usable on mobile viewports (≥ 360px wide), since users plan from a phone. Device installability (home screen) is optional, not required.
- **AI cost**: NOT a guardrail of this app (BYOK shifts cost to the user). The app does not enforce a per-user cost ceiling.

## Business Logic

Given the user's recent completed-workout history, the app selects a set of exercises (via AI proposer or via the manual builder's smart filter) whose target muscle groups respect per-muscle-group recovery windows — default 48h, 72h for legs and back — and prefer groups NOT recently trained, producing a balanced next workout.

**Inputs the rule consumes (user-facing)**:

- The user's recent completed workouts (which exercises, when, which muscle groups they target).
- The user's preset exercise catalogue (with canonical muscle-group tags per exercise).
- The recovery-window policy (per-muscle-group hours; a default constant in MVP, may become user-tunable later).

**Output**: a candidate set of exercises (and sets/reps in the AI flow) the user can accept, edit, or reject before saving as a planned workout.

**Where the user encounters it**:

- AI proposer flow (FR-004) — applied automatically by the AI given the user's history.
- Manual builder flow (FR-007) — applied as a filter on the catalogue view so the user sees only "fresh" muscle-group exercises by default.

**BYOK (Bring Your Own Key) for AI**: the app does not host or pay for AI inference. The user provides their own API key from a supported inference provider and stores it in their account settings. The app uses that key for FR-004 / FR-005 calls.

## Access Control

- **Auth model**: email + password login. Persistent accounts so workout history and custom exercises persist across devices.
- **Role model**: flat — one user role. Every user sees only their own workouts, custom exercises, and favorites.
- **Preset exercise catalogue**: ships seeded with the app. Users can browse and favorite presets but cannot edit them. Users add/edit/delete only their _own_ custom exercises. (No admin role in MVP — the seed catalogue is curated outside the app, e.g., a data migration.)

## Non-Goals

- **No native mobile apps** (iOS / Android) — web-only MVP. The web app is responsive so users can plan from a phone browser.
- **No integrations with fitness trackers, smartwatches, smartphone health apps** (Garmin, Strava, Fitatu, Apple Health, Google Fit, etc.). Workouts are entered/edited in-app, not imported.
- **No history import from external formats** (PDF, PNG, JPG, DOC, CSV-in). History is built by using the app from day one.
- **No sharing of workouts between users**. No social/community features in MVP.
- **No analytics dashboards** (volume curves, PR tracking, progress trends). History is a list, not a chart.
- **No in-gym real-time exercise substitution** when equipment is busy. This is a _planning_ tool, not an in-session companion.
- **No hosted/paid AI** — BYOK only. The app does not pay for or proxy any AI inference.
- **No custom exercise CRUD in MVP** — deferred to v1.1. MVP uses the seeded preset catalogue only.
- **No favorites in MVP** — deferred to v1.1.
- **No CSV export in MVP** — deferred to v1.1.

## Open Questions

1. **FR-013 (delete history entry) — include in MVP or defer?** — User noted risk: deleting history corrupts AI reasoning for future proposals. Owner: user. Block: no (nice-to-have; MVP works without it).
2. **FR-014 (do again from history) — include in MVP or defer?** — User noted risk: if heavily used, competes with the AI proposer and threatens the ≥ 75%-via-AI secondary metric. Owner: user. Block: no (nice-to-have; MVP works without it).
3. **Recovery window defaults — should they become user-tunable?** — Currently hard-coded (48h general, 72h legs/back). Noted as "may become user-tunable later." Owner: user. Block: no (defaults are sufficient for MVP).
