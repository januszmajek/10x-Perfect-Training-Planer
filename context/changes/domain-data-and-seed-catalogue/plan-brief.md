# Domain Data and Seed Catalogue — Plan Brief

> Full plan: `context/changes/domain-data-and-seed-catalogue/plan.md`

## What & Why

Build the database foundation that every workout roadmap slice depends on: a curated preset exercise catalogue,
private planned/completed workout persistence, and typed, testable Supabase contracts. This proves privacy and data
durability at the database boundary before APIs, AI, or UI are built on top.

## Starting Point

The repo has working Supabase Auth and a request-scoped SSR client, but no application migrations, catalogue,
`seed.sql`, database tests, or generated database types. CI currently checks only Astro sync, lint, and build.

## Desired End State

A clean local Supabase reset creates the complete catalogue and workout domain from committed migrations. The shared
catalogue is authenticated-readable and client-immutable; workouts are owner-isolated, permit one current plan, and
become immutable history when completed. pgTAP and CI verify the contract, while remote deployment remains separate.

## Key Decisions Made

| Decision          | Choice                                                      | Why                                                                                       |
| ----------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Muscle taxonomy   | 16 fixed groups under `upper_body`, `lower_body`, `core`    | Useful recovery detail without muscle-head or chest-region sprawl                         |
| Tag semantics     | Multiple `primary` and `secondary` tags                     | Primary tags block recovery; secondary tags support later demotion without over-filtering |
| Recovery policy   | 72h for back/lower-body groups; 48h otherwise               | Concretizes the PRD rule in one canonical vocabulary                                      |
| Repetitions       | One positive integer                                        | Keeps MVP prescriptions structured and intentionally simple                               |
| Planned workout   | Explicit `planned` status; at most one per user             | “Planned” means the next workout and needs no scheduling input                            |
| Completed history | Immutable                                                   | Preserves reliable AI/history inputs and data durability                                  |
| Catalogue breadth | Approximately 50–60 exercises; ≥3 primary options per group | Gives later AI/manual flows meaningful variety                                            |
| Equipment         | Seven fixed equipment values; Smith maps to `machine`       | Enables stable filters without equipment taxonomy sprawl                                  |
| Origin metric     | Immutable `ai` or `manual`; edits preserve origin           | Measures which creation flow initiated the workout                                        |
| Catalogue access  | Authenticated read only                                     | Matches the private planner and prevents client-side curation                             |
| Verification      | pgTAP plus reset/lint/type-drift CI gates                   | Makes RLS and migration regressions merge blockers                                        |
| Data delivery     | Production rows in a versioned migration                    | Makes environments reproducible without relying on local seed behavior                    |
| Deployment        | Local verification only                                     | Hosted database changes require separate human approval                                   |

## Scope

**In scope:**

- Catalogue schema, 16 muscle groups, role-aware tags, and 50–60 exercises in versioned migrations.
- Workout tables, lifecycle constraints, indexes, grants, and RLS.
- Catalogue, constraint, lifecycle, and cross-user policy tests with pgTAP.
- Generated Supabase types, typed SSR client, contract registry, README, secret ignores, and CI gates.

**Out of scope:**

- APIs, UI, AI/BYOK integrations, recovery algorithms, custom exercises, favourites, and analytics.
- Scheduling, multiple plans/drafts, rep ranges, weights, history mutations, remote migrations, and deployment.

## Architecture / Approach

Migrations create catalogue schema → production rows → private workout schema. Database constraints, normalized
tags, privileges, and RLS own the invariants; generated types expose them to the Astro client. pgTAP and CI recreate
and validate the contract locally.

## Phases at a Glance

| Phase                                            | What it delivers                                                     | Key risk                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------- |
| 1. Canonical Exercise Catalogue                  | Schema, 50–60 production exercises, tag semantics, catalogue tests   | Inconsistent manual classification or weak group coverage |
| 2. Private Workout Lifecycle                     | One-plan lifecycle, immutable history, ownership RLS, security tests | Policy gaps or invalid state transitions                  |
| 3. Typed Integration and Continuous Verification | Generated types, typed client, docs, and CI database gates           | CI runtime/type drift becoming unreliable                 |

**Prerequisites:** Docker, pnpm 10.24.0, Node 22.14.0, Supabase CLI. **Effort:** ~3 sessions plus catalogue review.

## Open Risks & Assumptions

- Catalogue quality is partly editorial; pgTAP can enforce coverage and anchors but cannot judge every classification.
- Starting Supabase in CI increases runtime and depends on Docker image availability.
- One-plan enforcement and deployed schema/data changes require forward migrations to revise.

## Success Criteria (Summary)

- A clean local reset produces the exact taxonomy, 50–60 exercises, workout schema, constraints, grants, and RLS.
- pgTAP proves catalogue coverage, one-plan lifecycle, immutable completed history, and cross-user isolation.
- Generated types have no drift, lint/build and CI pass, and implementation changes no hosted state.
