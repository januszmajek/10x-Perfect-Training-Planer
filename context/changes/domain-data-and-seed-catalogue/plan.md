# Domain Data and Seed Catalogue Implementation Plan

## Overview

Build the minimum Supabase data foundation required by the workout roadmap: a production catalogue with canonical
exercise metadata, a private planned-to-completed workout lifecycle, generated TypeScript database types, and
repeatable database verification. The change remains migration-first and does not add catalogue/workout APIs, UI,
or deploy anything to the hosted Supabase project.

## Current State Analysis

The application has request-scoped Supabase authentication, but the database integration is otherwise still the
starter baseline. `supabase/` has configuration only: there are no migrations, no `seed.sql`, no database tests, and
no generated database types. The existing Supabase client is untyped, and CI verifies only Astro sync, lint, and
build. The README still states that application tables and migrations are unnecessary.

F-01 must therefore establish the contracts that every later slice will consume while staying narrow enough not to
become an API or UI project. Its highest-risk surface is authorization: user-owned workout data must be isolated by
RLS, while the shared preset catalogue must be authenticated-readable and client-immutable.

## Desired End State

After this plan is complete:

- A clean local Supabase reset creates the canonical catalogue, workout tables, constraints, indexes, grants, and
  RLS policies exclusively from committed migrations.
- The production reference-data migration contains approximately 50–60 exercises covering the agreed taxonomy and
  equipment vocabulary; `seed.sql` is reserved for local-only fixtures and does not duplicate production catalogue
  data.
- Authenticated users can read the preset catalogue but cannot mutate it. Each user can read and mutate only their
  own planned workout; completed workouts are immutable history.
- A partial unique index permits at most one planned workout per user while allowing unlimited completed workouts.
- pgTAP tests prove schema, catalogue coverage, lifecycle constraints, privileges, and cross-user RLS isolation.
- Supabase-generated TypeScript types are committed, the SSR client uses them, and CI detects database regressions
  and generated-type drift alongside the existing lint/build gates.
- No hosted migration has been applied; remote deployment remains a separately approved operational action.

### Key Discoveries:

- F-01 explicitly requires workout contracts, ownership boundaries, and a seeded catalogue, and warns against
  growing into a full data-layer project (`context/foundation/roadmap.md:71`).
- Catalogue filtering requires multi-valued muscle tags and equipment, while exercise muscle tags remain canonical
  and non-editable (`context/foundation/prd.md:94`, `context/foundation/prd.md:124`).
- The fixed recovery rule is 48 hours generally and 72 hours for back and lower-body groups
  (`context/foundation/prd.md:114`, `context/foundation/prd.md:164`).
- The existing server client has no `Database` generic (`src/lib/supabase.ts:5`).
- Supabase migrations and local seeding are enabled, but the configured `supabase/seed.sql` is absent
  (`supabase/config.toml:53`).
- CI does not currently start or validate Supabase (`.github/workflows/ci.yml:21`).
- RLS is the actual privacy boundary, and incomplete policy coverage is already recorded as a high-impact risk
  (`context/foundation/infrastructure.md:73`, `context/foundation/infrastructure.md:90`).

## What We're NOT Doing

- Catalogue browsing/search/filter APIs or UI.
- Workout create/edit/complete/delete API endpoints or UI.
- AI proposal generation, prompt contracts, or provider integration.
- BYOK key storage or encryption.
- Custom exercises, favourites, catalogue administration, or user-defined taxonomy.
- Exercise instructions, images, aliases, difficulty, movement patterns, suggested prescriptions, or AI metadata.
- Repetition ranges, weights, set-by-set logging, volume tracking, or performance analytics.
- Multiple planned workouts, drafts, scheduling, `planned_for`, templates, or queued future sessions.
- History deletion, history cloning, or editing completed workouts.
- Recovery scoring/filter implementation; this change stores the canonical data that later slices will consume.
- Remote `supabase link`, `db push`, `db reset --linked`, production seeding, or Cloudflare deployment.

## Implementation Approach

Use ordered, forward-only Supabase migrations. Phase 1 creates the shared catalogue schema, then a separate data
migration inserts stable reference records by slug. Phase 2 adds the user-owned workout lifecycle and treats RLS plus
column privileges as the authorization contract. Phase 3 generates typed client contracts, documents the stable
names, and makes the complete local database workflow a CI gate.

The catalogue uses normalized exercise-to-muscle rows because an exercise may have several primary and secondary
groups. Fixed small vocabularies use Postgres enums; muscle groups use rows because each group carries category and
recovery metadata. Workouts use an explicit `planned`/`completed` status with a matching `completed_at` invariant,
and a partial unique index enforces one planned workout per user under concurrency.

## Critical Implementation Details

### Timing & lifecycle

Migration order is load-bearing: catalogue schema first, production catalogue rows second, and workout schema third.
Do not edit an applied migration after remote release; correct it with a new forward migration. A Worker rollback
does not roll back Supabase schema or reference data.

### State sequencing

Changing a workout from `planned` to `completed` and setting `completed_at` must happen in one database update. The
status/timestamp check rejects half-completed states, and policies must prevent completed rows or their items from
returning to an editable state.

## Phase 1: Canonical Exercise Catalogue

### Overview

Create the catalogue schema, curate and insert approximately 50–60 production exercises through a versioned data
migration, and verify taxonomy, equipment, primary/secondary tags, and coverage with pgTAP tests.

### Changes Required:

#### 1. Catalogue schema migration

**File**: `supabase/migrations/<timestamp>_create_exercise_catalogue.sql`

**Intent**: Establish the stable taxonomy and normalized catalogue relationships consumed by later catalogue,
history, recovery, and AI slices.

**Contract**: Define `muscle_category` (`upper_body`, `lower_body`, `core`), `equipment_type` (`barbell`, `dumbbell`,
`cable`, `machine`, `bodyweight`, `kettlebell`, `resistance_band`), and `exercise_muscle_role` (`primary`,
`secondary`). Create:

- `muscle_groups(code, name, category, recovery_hours)` with positive recovery hours.
- `exercises(id, slug, name, equipment)` with generated UUID IDs and unique stable slugs/names.
- `exercise_muscle_groups(exercise_id, muscle_group_code, role)` with a composite primary key and restrictive
  foreign keys.

Seed the exact 16 muscle groups as schema-owned reference rows:

- `upper_body`: `chest`, `lats`, `upper_back`, `lower_back`, `front_delts`, `side_delts`, `rear_delts`, `biceps`,
  `triceps`, `forearms`.
- `lower_body`: `quads`, `hamstrings`, `glutes`, `calves`, `adductors`.
- `core`: `core`.

Use 72 hours for `lats`, `upper_back`, `lower_back`, `quads`, `hamstrings`, `glutes`, `calves`, and `adductors`; use
48 hours for every other group. Treat these 16 groups as the maximum MVP granularity.

Enable RLS on all catalogue tables. Grant authenticated `SELECT` and expose no authenticated insert/update/delete
path. Add a reverse lookup index on `(muscle_group_code, role, exercise_id)`; do not add full-text/trigram indexes at
the expected small scale.

#### 2. Production catalogue data migration

**File**: `supabase/migrations/<timestamp>_seed_exercise_catalogue.sql`

**Intent**: Ship the curated preset catalogue through the same versioned production migration path as the schema.

**Contract**: Insert approximately 50–60 familiar exercises with stable kebab-case slugs, human-readable names, one
canonical equipment value, and normalized muscle tags. Allow several primary groups. Each exercise must have at
least one primary tag; secondary tags represent meaningful assistance. Each muscle group must have at least three
primary-tagged exercise options. Smith-machine exercises, if present, use `machine`.

Use primary tags for future full recovery blocking and recovery filtering. Secondary tags are available to future
slices for demotion/scoring only. General catalogue and history muscle filters may match either tag role. Include
curation anchors such as bench press (`chest` primary; `front_delts` and `triceps` secondary) so tests catch semantic
drift rather than only row counts.

#### 3. Local-only seed entry point

**File**: `supabase/seed.sql`

**Intent**: Satisfy the existing local reset configuration without creating a second copy of canonical production
data.

**Contract**: Document that this file is reserved for non-sensitive local fixtures. It must not contain production
catalogue rows, real users, credentials, provider keys, or any data required by production.

#### 4. Catalogue database contract tests

**File**: `supabase/tests/database/catalogue.test.sql`

**Intent**: Make taxonomy and catalogue curation mechanically reviewable and protect it from later drift.

**Contract**: Use transactional pgTAP tests to verify tables, enums, keys, unique constraints, RLS enablement, exact
taxonomy/category/recovery mappings, exact equipment values, catalogue row-count bounds, at least one primary tag per
exercise, at least three primary-tagged exercises per group, multiple-primary support, duplicate-tag rejection, and
the agreed anchor classifications. Prove authenticated reads succeed and authenticated catalogue mutations fail.

### Success Criteria:

#### Automated Verification:

- Local Supabase starts successfully: `pnpm exec supabase start`
- A clean local rebuild applies catalogue schema, reference data, and local seed entry point:
  `pnpm exec supabase db reset --local`
- Catalogue SQL passes database lint: `pnpm exec supabase db lint --local --schema public --fail-on error`
- Catalogue pgTAP tests pass:
  `pnpm exec supabase test db --local supabase/tests/database/catalogue.test.sql`

#### Manual Verification:

- Review the complete 50–60 exercise list for useful variety and no accidental fine-grained muscle subdivisions.
- Spot-check compound-lift classifications and equipment values, including bench press and representative back,
  shoulder, lower-body, arm, and core movements.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation that catalogue curation and tag semantics are acceptable before proceeding to Phase 2.

---

## Phase 2: Private Workout Lifecycle

### Overview

Add the minimal workout persistence contract for one current plan per user, immutable completed history, ordered
exercise prescriptions, and database-enforced ownership.

### Changes Required:

#### 1. Workout lifecycle migration

**File**: `supabase/migrations/<timestamp>_create_workout_lifecycle.sql`

**Intent**: Establish durable data and authorization contracts for later cold-start, editing, mark-done, history,
and manual-builder slices without implementing those application flows yet.

**Contract**: Define `workout_status` (`planned`, `completed`) and `workout_origin` (`ai`, `manual`). Create:

- `workouts(id, user_id, status, origin, created_at, completed_at)` with generated UUID IDs, an `auth.users`
  ownership foreign key, immutable creation origin, and a check tying `planned` to a null `completed_at` and
  `completed` to a non-null completion timestamp that is not earlier than creation.
- `workout_exercises(id, workout_id, exercise_id, position, sets, reps)` with positive integer sets/reps,
  non-negative ordering, restrictive exercise references, cascading removal with a deletable planned parent, and
  uniqueness for both `(workout_id, position)` and `(workout_id, exercise_id)`.

Add a unique partial index on `workouts(user_id)` where status is `planned`. Add `(user_id, status, completed_at
desc)` for owned recent-history access and the necessary child/reference indexes. A uniqueness conflict is expected
to surface as PostgreSQL `23505`; later API work must translate it into an existing-plan conflict.

Enable RLS on both tables and define explicit per-operation policies:

- Owners may select their own planned and completed workouts/items.
- Inserts must target the authenticated owner and create a planned workout.
- Only planned workouts and their items may be updated or deleted.
- Completion is one-way; completed workouts and items are immutable.
- Child writes must verify ownership and planned state through the parent.
- `USING` and `WITH CHECK` must prevent ownership reassignment and cross-user writes.

Use table/column privileges with RLS so authenticated updates cannot mutate `user_id`, `origin`, or `created_at`.
Origin remains `ai` after editing an AI-created plan and `manual` after editing a manual plan.

#### 2. Workout and RLS database tests

**File**: `supabase/tests/database/workout_lifecycle.test.sql`

**Intent**: Prove data durability and privacy at the database boundary rather than relying on later API correctness.

**Contract**: Use transactional pgTAP tests and disposable local auth identities to verify positive sets/reps,
ordering uniqueness, status/timestamp consistency, immutable origin, one planned workout per user, `23505` on a
second plan, independent plans for different users, completion freeing the planned slot, completed-history
immutability, catalogue foreign keys, own-row access, and cross-user read/write denial. Include policy tests for
child items and deletion of planned versus completed parents.

### Success Criteria:

#### Automated Verification:

- A clean reset applies all catalogue and workout migrations in order: `pnpm exec supabase db reset --local`
- Public-schema SQL passes database lint: `pnpm exec supabase db lint --local --schema public --fail-on error`
- Workout lifecycle and RLS pgTAP tests pass:
  `pnpm exec supabase test db --local supabase/tests/database/workout_lifecycle.test.sql`
- The full database suite passes: `pnpm exec supabase test db --local supabase/tests/database`

#### Manual Verification:

- Using two disposable local users, inspect the resulting access behavior and confirm neither identity can view or
  mutate the other's workout rows.
- Inspect one planned-to-completed transition and confirm the completed row and its items can no longer be changed
  or deleted while a new planned workout can be created.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation that lifecycle and isolation behavior are correct before proceeding to Phase 3.

---

## Phase 3: Typed Integration and Continuous Verification

### Overview

Expose the database contract safely to the TypeScript application, document its stable names, and make full database
reproducibility part of CI and contributor setup.

### Changes Required:

#### 1. Generated Supabase types

**File**: `src/types/database.types.ts`

**Intent**: Give later application slices compile-time visibility into tables, relationships, enums, inserts, and
updates generated from the committed schema.

**Contract**: Generate from the reset local `public` schema with Supabase CLI 2.102.0, then normalize the generated
output with the repository's pinned Prettier configuration before committing it. Treat the file as generated output;
schema changes must run the same generation-and-formatting pipeline, and CI must fail when that pipeline produces a
diff.

#### 2. Typed SSR Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: Make every later server-side query inherit the generated database contract without changing the current
cookie/session behavior.

**Contract**: Import `Database` as a type and parameterize `createServerClient<Database>`. Preserve the existing
nullable configuration behavior, request-header cookie reads, and cookie refresh writes.

#### 3. Database verification in CI

**File**: `.github/workflows/ci.yml`

**Intent**: Turn reproducibility, SQL lint, pgTAP security coverage, and generated-type freshness into merge gates.

**Contract**: On the existing Ubuntu job, use the pnpm-locked Supabase CLI to start the local stack while suppressing
its local credential summary, reset from migrations, lint `public`, run all database tests, regenerate the `public`
TypeScript types into a temporary file, normalize that file with the repository's pinned Prettier configuration, and
compare it with `src/types/database.types.ts`. The committed file and CI temporary file must use the exact same
generation-and-formatting pipeline. Retain `pnpm astro sync`, `pnpm lint`, and `pnpm build`. Do not link to or mutate
a hosted Supabase project and do not print credentials.

#### 4. Local setup and secret hygiene

**Files**: `README.md`, `.gitignore`

**Intent**: Replace the obsolete auth-only database instructions with the actual reproducible workflow and prevent
local environment files from entering version control.

**Contract**: Document Docker prerequisites, start/reset/lint/test/type-generation commands, the distinction between
production catalogue migrations and local-only `seed.sql`, and the explicit human gate for any hosted `db push`.
Remove the claim that no tables or migrations exist. Ignore `.env`, `.env.*`, and `.env.production` while preserving
the option to track a future `.env.example`; retain `.dev.vars` protection. Never document real values.

#### 5. Load-bearing contract registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Create the registry already named by the repository workflow so later plans and implementations reuse
the same schema vocabulary.

**Contract**: Record the exact migration order, enum names/values, table and key-column names, taxonomy codes,
generated type path, test paths, and the one-planned-workout/RLS invariants. Keep this a names-and-invariants registry,
not a duplicate schema tutorial.

### Success Criteria:

#### Automated Verification:

- A clean local database reset succeeds: `pnpm exec supabase db reset --local`
- Database lint and the full pgTAP suite pass:
  `pnpm exec supabase db lint --local --schema public --fail-on error` and
  `pnpm exec supabase test db --local supabase/tests/database`
- Regenerating and Prettier-normalizing local public-schema types produces no diff from
  `src/types/database.types.ts`
- Astro types synchronize successfully: `pnpm astro sync`
- Repository lint passes: `pnpm lint`
- Production SSR build passes under the Cloudflare adapter: `pnpm build`

#### Manual Verification:

- Review a CI run and confirm database reset, lint, pgTAP, type drift, Astro sync, lint, and build are distinct
  visible gates.
- Follow the README from a clean local database state and confirm it neither requires nor mutates a hosted project.
- Confirm no hosted Supabase migration or Cloudflare deployment occurred during implementation.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of CI visibility, documentation accuracy, and the no-deployment boundary before closing the change.

---

## Testing Strategy

### Database Unit and Policy Tests:

- Use pgTAP under `supabase/tests/database/`; there is no need to add a JavaScript test runner for this foundation.
- Wrap tests in transactions and roll them back so repeated runs are deterministic.
- Validate catalogue content semantically: exact taxonomies, coverage floors, roles, and representative anchor lifts,
  not only total row counts.
- Exercise constraint failures deliberately: duplicate slugs/tags/order positions, non-positive prescriptions,
  invalid lifecycle timestamps, and a second planned workout.
- Test each RLS operation with authenticated identities: catalogue select/mutation, owner and cross-user workout
  select, insert, update, and delete, plus child-item policies.
- Run the full suite after a clean reset so tests never depend on an unreproducible local database state.

### Integration Tests:

- Treat `supabase db reset --local` as migration-plus-reference-data integration verification.
- Regenerate `Database` types from that reset schema, normalize them with the pinned Prettier configuration, and
  compare the normalized output to the committed file.
- Compile the typed client through `pnpm lint` and `pnpm build` under Astro's Cloudflare adapter.
- Run the same database and application gates in CI without a hosted Supabase link.

### Manual Testing Steps:

1. Review all catalogue entries for spelling, useful coverage, equipment consistency, and sensible primary/secondary
   classifications.
2. Use two disposable local authenticated users to validate ownership isolation through the exposed Supabase API.
3. Create, complete, and attempt to mutate/delete a workout, then create the next planned workout.
4. Confirm the README workflow works from a clean local database and that the hosted project remains untouched.

## Performance Considerations

Expected traffic and data volume are small, so normalized joins are preferable to duplicated JSON or muscle arrays.
The reverse muscle-tag index supports catalogue/history lookup; workout ownership/history and partial-plan indexes
support the expected user-scoped queries. Do not add full-text search, trigram indexes, views, RPCs, cached recovery
summaries, or materialized history in this change. Later API slices should measure before adding search-specific
indexes.

## Migration Notes

- These are the first application migrations; there is no existing domain data to backfill.
- Keep catalogue schema, catalogue data, and workout schema in separate ordered migrations so failures and future
  forward fixes are attributable.
- Production catalogue rows belong in the versioned data migration, not `seed.sql`; ordinary local resets run both
  migrations and local seed afterward.
- Never use `supabase db reset --linked` for this change. It is destructive to the linked remote database.
- Do not rewrite migrations after they have been applied remotely. Add a corrective migration instead.
- Before a later production rollout, a human must review `pnpm exec supabase db push --dry-run`, approve the target,
  and separately authorize `pnpm exec supabase db push`.
- Worker rollback cannot revert Supabase schema/data. Remote rollout notes must identify the migration versions and
  use forward fixes for database defects.

## References

- Product requirements: `context/foundation/prd.md:94`, `context/foundation/prd.md:114`,
  `context/foundation/prd.md:118`, `context/foundation/prd.md:135`, `context/foundation/prd.md:155`,
  `context/foundation/prd.md:181`
- Roadmap contract: `context/foundation/roadmap.md:71`
- Current Supabase configuration: `supabase/config.toml:53`
- Current untyped client: `src/lib/supabase.ts:5`
- Current CI baseline: `.github/workflows/ci.yml:21`
- Current obsolete setup statement: `README.md:108`
- Deployment/RLS constraints: `context/foundation/infrastructure.md:73`,
  `context/foundation/infrastructure.md:80`, `context/foundation/infrastructure.md:90`
- Supabase local migration and seed workflow: https://supabase.com/docs/guides/local-development/cli-workflows
- Supabase database testing: https://supabase.com/docs/guides/database/testing
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase TypeScript generation: https://supabase.com/docs/guides/api/rest/generating-types
- PostgreSQL partial indexes: https://www.postgresql.org/docs/current/indexes-partial.html

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Canonical Exercise Catalogue

#### Automated

- [x] 1.1 Local Supabase starts successfully
- [x] 1.2 Clean local rebuild applies catalogue schema and reference data
- [x] 1.3 Catalogue SQL passes database lint
- [x] 1.4 Catalogue pgTAP tests pass

#### Manual

- [x] 1.5 Complete exercise catalogue has useful variety and bounded taxonomy
- [x] 1.6 Compound-lift tags and equipment classifications are accurate

### Phase 2: Private Workout Lifecycle

#### Automated

- [ ] 2.1 Clean reset applies all catalogue and workout migrations in order
- [ ] 2.2 Public-schema SQL passes database lint
- [ ] 2.3 Workout lifecycle and RLS pgTAP tests pass
- [ ] 2.4 Full database test suite passes

#### Manual

- [ ] 2.5 Two local users are isolated from each other's workout data
- [ ] 2.6 Planned-to-completed transition is immutable and frees the planned slot

### Phase 3: Typed Integration and Continuous Verification

#### Automated

- [ ] 3.1 Clean local database reset succeeds
- [ ] 3.2 Database lint and full pgTAP suite pass
- [ ] 3.3 Generated and Prettier-normalized local public-schema types have no drift
- [ ] 3.4 Astro types synchronize successfully
- [ ] 3.5 Repository lint passes
- [ ] 3.6 Production SSR build passes under the Cloudflare adapter

#### Manual

- [ ] 3.7 CI exposes every database and application verification gate
- [ ] 3.8 README workflow succeeds without a hosted project
- [ ] 3.9 No hosted database migration or Cloudflare deployment occurred
