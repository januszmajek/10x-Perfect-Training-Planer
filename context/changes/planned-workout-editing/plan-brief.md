# Planned Workout Editing - Plan Brief

> Full plan: `context/changes/planned-workout-editing/plan.md`

## What & Why

Deliver S-03 as the editing boundary shared by manual and future AI-origin plans. Users can edit or hard-delete the
current plan without changing provenance, silently overwriting newer work, or touching completed history.

## Starting Point

S-02 already provides an atomic manual create/replace flow, current-plan dashboard summary, strict workout API
boundary, and reusable catalogue/draft controls. Editing is absent, replacement recreates the parent as manual, and
the current schema has no revision token for concurrent edits to the same workout ID.

## Desired End State

The dashboard offers Edit, Build replacement, and confirmed Delete actions. A dedicated editor starts from the exact
saved prescription, supports direct in-place replacement plus add/remove/reorder and sets/reps changes, saves
atomically, protects dirty exits, and lets users resolve stale edits by loading latest or explicitly overwriting the
reviewed revision.

## Key Decisions Made

| Decision      | Choice                                                    | Why                                                          |
| ------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| Exercise swap | Replace in place, preserving position and sets/reps       | Directly satisfies FR-009 without forcing reorder/re-entry   |
| Ordering      | Include accessible Move up/down editing                   | Reuses established logic and keeps the ordered plan complete |
| Persistence   | Explicit whole-workout Save changes                       | Matches S-02 and gives one atomic mutation boundary          |
| Dirty exit    | Confirm discard only when changed                         | Protects work without adding persistent drafts               |
| Concurrency   | Trigger-derived revision plus expected ID                 | Preserves invoker/RLS writes while preventing chosen tokens  |
| Conflict UX   | Preserve local draft; load latest or reviewed overwrite   | Avoids silent loss on either side                            |
| Deletion      | Dashboard summary modal and hard delete                   | Matches FR-011 with proportionate confirmation               |
| Testing       | Existing pgTAP, shell, Node, lint/build, and manual stack | Covers risk without adding browser infrastructure            |

## Scope

**In scope:**

- Revision-aware edit/delete RPCs and revised S-02 replacement comparison.
- Origin-neutral current-plan service and GET/PUT/DELETE endpoint.
- Reusable controlled draft editor and dedicated edit controller/route.
- In-place replacement, reordering, dirty-exit protection, conflict resolution, and dashboard deletion.
- Database, concurrency, pure TypeScript, CI, responsive, keyboard, and accessibility verification.

**Out of scope:**

- Mark done/history, AI generation, recovery filtering, and completed-workout mutation.
- Persistent drafts/autosave, workout metadata, custom catalogue entries, soft delete, and undo.
- Browser-test framework adoption, hosted migration, Worker deployment, and secret changes.

## Architecture / Approach

The database owns revision comparison, ownership, lock ordering, and atomic mutation. `/api/workouts/planned` owns
current-plan reads and mutations; `/api/workouts/manual` retains only creation/replacement POST. Creation and editing
share a controlled draft UI but retain separate controllers for replacement confirmation versus dirty conflicts.

## Phases at a Glance

| Phase                           | What it delivers                                                  | Key risk                                   |
| ------------------------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| 1. Revisioned persistence       | Revision, RPCs, atomic S-02 caller cutover, tests/types/contracts | Stale mutation or broken replacement flow  |
| 2. Shared editor and boundary   | Draft extraction, exact schemas, services, API, CI gates          | Creation/edit state-machine coupling       |
| 3. Editing/conflict/deletion UX | Edit route, dirty/conflict flows, dashboard actions               | Draft loss or misleading destructive state |

**Prerequisites:** Completed F-01, S-01, and S-02; local Supabase/Docker; Node 22.14; pnpm 10.24.
**Estimated effort:** About 3 focused implementation sessions across 3 phases, plus manual concurrency and responsive checks.

## Open Risks & Assumptions

- Revision is an opaque CAS token; users never interpret or edit it.
- S-04 must preserve the covered completion races, ID/revision CAS, and advisory-lock then parent-lock order.
- A reviewed overwrite remains conditional; another intervening mutation returns another conflict.
- Browser behavior is manually verified because this slice does not introduce an end-to-end test framework.

## Success Criteria (Summary)

- Manual- and AI-origin plans can be fully edited without changing parent identity, provenance, or creation time.
- Concurrent edits/replacements/deletes yield one complete winner and explicit stale outcomes with no silent loss.
- Dirty exits and deletion are confirmed, other-user/history data stays untouched, and automated gates remain green.
