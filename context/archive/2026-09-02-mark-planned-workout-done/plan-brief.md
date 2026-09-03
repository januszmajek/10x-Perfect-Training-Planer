# Mark Planned Workout Done — Plan Brief

> Full plan: `context/changes/mark-planned-workout-done/plan.md`

## What & Why

S-04 turns the exact current plan into immutable history for later recovery and AI features. A non-blocking
five-second Undo window catches accidental clicks without making durable history reversible.

## Starting Point

The database has lifecycle states, immutable history, RLS, revisions, and locks; completion remains only a test actor.

## Desired End State

Mark done becomes primary with a collapsing card and Undo toast. Only verified completion produces SSR success.

## Key Decisions Made

| Decision                | Choice                                         | Why                                                                                        |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Undo model              | Delay persistence for five seconds             | Undo cancels intent without violating immutable history                                    |
| Completion time         | Server transaction time after grace expiry     | The server records the uncancelled completion decision authoritatively                     |
| History contents        | Preserve the exact planned prescription        | Editing during completion is deferred; later in-session edits can feed the same transition |
| Action hierarchy        | Mark done is primary                           | Completion is the next step in the roadmap's core lifecycle                                |
| Confirmation UI         | No dialog; non-modal toast and card animation  | The user remains free to use the dashboard while retaining a mistake window                |
| Stale state             | Reload latest dashboard state                  | An unseen edited/replaced workout is never completed silently                              |
| Pending behavior        | Lock workout mutations during grace and commit | Prevents duplicate and competing actions from the same page                                |
| Success destination     | Durable dashboard success plus empty state     | History UI remains S-05 and query parameters never substitute for persisted state          |
| Navigation during grace | Cancels the local intent                       | Cross-navigation Undo would require disproportionate durable pending infrastructure        |
| Completion architecture | Revision-aware RPC under the shared lock       | Coordinates safely with edit, delete, replacement, child writes, and another completion    |
| Ambiguous response      | Verify the expected owned workout state        | An empty planned slot alone cannot prove completion                                        |
| Database boundary       | RPC is the supported app path, not exclusive   | Retains the established invoker/RLS model without a privileged-function redesign           |

## Scope

**In scope:**

- Authenticated atomic planned-to-completed RPC with a server-owned timestamp.
- Revision/lock-aware stale handling, RLS, immutability, and concurrency tests.
- PATCH endpoint, owner-scoped reconciliation read, safe errors, request IDs, and exact response parsing.
- Primary Mark done action, tested five-second Undo state, graceful collapse, reduced motion, and accessibility.
- Durable dashboard success and existing empty-plan action after completion.

**Out of scope:**

- History list/detail/filter UI, deletion, or `do again`.
- Editing the prescription during completion or recording actual weights/session performance.
- Reversal, database pending state, durable timers, cross-navigation Undo, or background jobs.
- Privilege redesign, global toast/browser-test infrastructure, hosted migration, or Worker deployment.

## Architecture / Approach

One completion RPC feeds PATCH and an exact reconciliation read; a focused React island uses a tested pure reducer.

## Phases at a Glance

| Phase                                       | What it delivers                                                       | Key risk                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Atomic Completion Persistence            | RPC, pgTAP, real concurrency races, generated types, contract registry | Lock-order or stale-token drift could corrupt lifecycle semantics |
| 2. Completion Application Boundary          | PATCH plus owner-scoped expected-workout reconciliation                | Reads must not disclose another user's workout                    |
| 3. Undoable Dashboard Completion Experience | Tested Undo state, animation, exact reconciliation, durable success    | Focus and optimistic UI must never misstate durable state         |

**Prerequisites:** S-02 and S-03 are complete; local Supabase/Docker is required for database and concurrency gates.

**Estimated effort:** About 3 implementation sessions, each ending at a manual verification gate.

## Open Risks & Assumptions

- The five-second Undo exists only while the dashboard island remains mounted; navigation/reload/tab close cancels it.
- An absolute deadline prevents timer throttling from shortening grace, though a background tab may delay commit.
- A lost PATCH response may hide a commit; only the expected row being completed proves success.
- Direct owner lifecycle updates remain possible below the supported application boundary.
- The React island receives serializable server data; focus, motion, and responsive behavior still need manual checks.

## Success Criteria (Summary)

- Undo within five seconds performs no database mutation and restores the exact planned workout.
- Uncancelled completion atomically creates immutable history with a server timestamp and unchanged prescription.
- Concurrent or ambiguous outcomes never complete an unseen workout or display a false durable state.
