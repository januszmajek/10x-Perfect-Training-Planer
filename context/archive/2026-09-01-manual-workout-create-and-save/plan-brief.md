# Manual Workout Create and Save — Plan Brief

> Full plan: `context/changes/manual-workout-create-and-save/plan.md`

## What & Why

Deliver the first complete workout-planning path without AI. A signed-in user can browse the seeded catalogue,
compose an ordered sets/reps prescription, and save a durable manual plan that later editing, completion, recovery,
history, and AI slices can reuse.

## Starting Point

The private Astro workspace exists, but its dashboard is a placeholder and there are no workout routes or services.
Supabase already contains 58 tagged exercises and owner-isolated planned/completed workout tables with one-plan,
ordering, uniqueness, and positive-prescription constraints.

## Desired End State

`/workouts/new` provides a responsive catalogue and ephemeral manual builder with filtering, 3 × 10 defaults,
add/remove/reorder controls, and explicit save. First save is atomic; confirmed replacement either stores the whole
new plan or preserves the whole old one. Success is visible as a durable ordered summary on the dashboard.

## Key Decisions Made

| Decision             | Choice                                                              | Why                                                                         |
| -------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Builder location     | Dedicated `/workouts/new` route                                     | Keeps the interactive flow focused and reusable by later entry points       |
| Draft controls       | Add, remove, edit sets/reps, and accessible reorder                 | Produces a complete prescription before persistence                         |
| Prescription default | Editable 3 sets × 10 reps                                           | Optimizes for the product's speed goal while staying valid                  |
| Filter semantics     | OR within muscle/equipment; AND across; both tag roles              | Matches the established catalogue contract and useful multi-select behavior |
| Existing plan        | Build freely, then confirm full replacement                         | Preserves user agency without mutating the current plan early               |
| Replacement          | Expected-plan compare-and-swap under explicit user/row locks        | Prevents atomic but stale confirmation from deleting a newer plan           |
| Cancel               | Always discard the in-memory draft                                  | Avoids accidental or hidden persistent-draft behavior                       |
| Save failure         | Preserve exact draft and show inline retry                          | Protects composition work while durable state stays unchanged               |
| Save success         | Dashboard status plus ordered plan summary                          | Makes persistence visible in the current-plan home                          |
| Testing              | pgTAP, two-session concurrency, built-in Node, existing build gates | Covers risky contracts without adding a test framework                      |
| Request boundary     | JSON, exact Origin, 32 KiB, 20 exercises, strict field limits       | Makes CSRF and resource bounds explicit                                     |
| Error contract       | Safe codes + request ID; sanitized private structured logs          | Supports users without exposing database or personal details                |

## Scope

**In scope:**

- Atomic authenticated compare-and-swap RPC, rollback/concurrency tests, generated types, and contract documentation.
- Catalogue/current-plan service, protected async endpoint, shared filtering/draft validation, and focused logic tests.
- Responsive builder, replacement confirmation, discard-only Cancel, navigation, and dashboard planned summary.

**Out of scope:**

- AI, recovery filtering, saved-plan editing/deletion, mark-done, history, custom exercises, and favourites.
- Persistent drafts/autosave, titles/dates/weights, browser-test infrastructure, hosted migrations, and deployment.

## Architecture / Approach

Astro server-renders authenticated catalogue and current-plan data into a React island. The island keeps the draft
only in memory and asynchronously posts a validated ordered payload to a protected Astro endpoint. The endpoint uses
the request-local Supabase client to call one `SECURITY INVOKER` function; RLS and a per-user transaction boundary
own create-or-replace safety. The JSON endpoint verifies Origin, body/field limits, and expected current-plan ID;
errors return only a safe code and request ID while private logs remain sanitized. Success navigates to the
server-rendered dashboard summary.

## Phases at a Glance

| Phase                                              | What it delivers                                                      | Key risk                                       |
| -------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| 1. Atomic Manual-Workout Persistence               | Transactional RPC, RLS/rollback/concurrency tests, generated contract | Partial or cross-user replacement              |
| 2. Builder Application Boundary                    | Pure logic, server service, protected endpoint, CI gates              | Validation/error contracts drift across layers |
| 3. Responsive Manual Builder and Dashboard Outcome | Complete mobile/desktop flow and durable result                       | Draft loss or misleading replacement UX        |

**Prerequisites:** Completed F-01 and S-01, local Supabase/Docker, Node 22.14, and pnpm 10.24.
**Estimated effort:** ~3 focused implementation sessions across 3 phases, plus manual responsive/security checks.

## Open Risks & Assumptions

- The transaction advisory-lock namespace must be reused by later edit/complete RPCs; two-session tests cover current
  completion and child-mutation paths until those callers migrate to the shared boundary.
- The 58-row catalogue remains small enough for one server load and client-side filtering; pagination is deferred.
- Browser interaction has manual rather than Playwright coverage in this slice.
- “Keep editing” dismisses only the replacement prompt; the builder-level Cancel action is the explicit draft discard.

## Success Criteria (Summary)

- A signed-in user can filter the catalogue, compose/reorder prescriptions, and see the saved plan after refresh.
- Confirmed replacement is compare-and-swap atomic under failure and concurrency, with newer, completed, and
  cross-user workouts untouched.
- Cancel never persists a draft; failed saves preserve the exact active draft; all database, logic, lint, and build
  gates pass.
