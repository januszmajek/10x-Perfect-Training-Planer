# Contract Surfaces

This registry names the database contracts that later changes must reuse. Migrations remain the executable source
of truth; generated TypeScript types expose that schema to application code.

## Migration order

1. `supabase/migrations/20260820090000_create_exercise_catalogue.sql`
2. `supabase/migrations/20260820090100_seed_exercise_catalogue.sql`
3. `supabase/migrations/20260820090200_create_workout_lifecycle.sql`
4. `supabase/migrations/20260827120000_serialize_workout_exercise_mutations.sql`
5. `supabase/migrations/20260827130000_create_ai_provider_keys.sql`
6. `supabase/migrations/20260901120000_create_manual_workout_mutation.sql`
7. `supabase/migrations/20260902120000_create_planned_workout_mutations.sql`
8. `supabase/migrations/20260902130000_complete_planned_workout.sql`
9. `supabase/migrations/20260905110000_add_exercise_movement_pattern.sql`
10. `supabase/migrations/20260905120000_create_ai_workout_mutation.sql`
11. `supabase/migrations/20260905230000_add_ai_provider_key_prefix.sql`
12. `supabase/migrations/20260907110000_create_exercise_completion_profile.sql`
13. `supabase/migrations/20260907120000_create_ai_recommendation_feedback.sql`
14. `supabase/migrations/20260907130000_schedule_ai_proposal_retention.sql`
15. `supabase/migrations/20260907140000_secure_ai_recommendation_rpc_access.sql`
16. `supabase/migrations/20260907150000_grant_private_rpc_schema_usage.sql`
17. `supabase/migrations/20260907160000_fix_ai_proposal_recording.sql`
18. `supabase/migrations/20260907170000_link_ai_proposal_rerolls.sql`
19. `supabase/migrations/20260907180000_secure_legacy_ai_proposal_recording.sql`
20. `supabase/migrations/20260908100000_remove_overloaded_ai_proposal_rpc.sql`
21. `supabase/migrations/20260908110000_link_history_aware_ai_workout_lifecycle.sql`

Production catalogue data belongs in the second migration. `supabase/seed.sql` is only for non-sensitive local
fixtures and must not contain data required by production.

## Enums

| Enum                        | Ordered values                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `muscle_category`           | `upper_body`, `lower_body`, `core`                                                       |
| `equipment_type`            | `barbell`, `dumbbell`, `cable`, `machine`, `bodyweight`, `kettlebell`, `resistance_band` |
| `exercise_muscle_role`      | `primary`, `secondary`                                                                   |
| `exercise_movement_pattern` | `push`, `pull`                                                                           |
| `workout_status`            | `planned`, `completed`                                                                   |
| `workout_origin`            | `ai`, `manual`                                                                           |
| `ai_provider`               | `openrouter`                                                                             |
| `ai_exercise_preference`    | `liked`, `dont_suggest`                                                                  |
| `ai_proposal_event_type`    | `exposure`, `reroll`, `removal`, `swap`, `retention`, `save`, `completion`               |

## Tables and key columns

| Table                                 | Primary key                                | Load-bearing columns and relationships                                                              |
| ------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `muscle_groups`                       | `code`                                     | `name`, `category`, `recovery_hours`                                                                |
| `exercises`                           | `id`                                       | unique `slug`, unique `name`, `equipment`, nullable curated `movement_pattern`                      |
| `exercise_muscle_groups`              | `exercise_id`, `muscle_group_code`, `role` | restrictive references to `exercises.id` and `muscle_groups.code`                                   |
| `workouts`                            | `id`                                       | `user_id` → `auth.users.id`, `status`, immutable `origin`, `revision`, `created_at`, `completed_at` |
| `workout_exercises`                   | `id`                                       | `workout_id`, `exercise_id`, `position`, `sets`, `reps`                                             |
| `ai_provider_keys`                    | `user_id`                                  | `provider`, `ciphertext`, `iv`, `key_hint`, `encryption_key_version`, timestamps                    |
| `ai_exercise_preferences`             | `user_id`, `exercise_id`                   | owner-only recommendation signal; `liked` and `dont_suggest` are mutually exclusive                 |
| `ai_workout_proposals`                | `id`                                       | private owner proposal, opaque `lineage_id`, database-derived 90-day expiry                         |
| `ai_workout_proposal_events`          | `id`                                       | private typed owner events; proposal payloads and events expire independently of workouts           |
| `ai_workout_completion_events`        | `workout_id`                               | private owner/lineage completion evidence with an independent 90-day expiry                         |
| `ai_reduced_generation_confirmations` | `nonce_digest`                             | owner-bound short-lived single-use authorization record, not telemetry                              |

## Muscle taxonomy

- `upper_body`: `chest`, `lats`, `upper_back`, `lower_back`, `front_delts`, `side_delts`, `rear_delts`, `biceps`,
  `triceps`, `forearms`
- `lower_body`: `quads`, `hamstrings`, `glutes`, `calves`, `adductors`
- `core`: `core`

Recovery is 72 hours for `lats`, `upper_back`, `lower_back`, `quads`, `hamstrings`, `glutes`, `calves`, and
`adductors`; every other group uses 48 hours.

`exercises.movement_pattern` is curated only for qualifying upper-body compound movements: `push` and `pull` are
database taxonomy, not names or model inference. Lower-body, core, isolation, and unclassified movements remain null.
Authenticated users may read this field but cannot mutate it with the rest of the catalogue.

## Recovery-aware manual builder

- Recovery guidance is derived at read time from the signed-in owner's completed workout history only; it is never
  persisted as mutable state.
- `workouts.completed_at` is the authoritative recovery event time. A primary muscle is recovering while
  `now < completed_at + muscle_groups.recovery_hours`; it is ready exactly at the boundary.
- Primary exercise-muscle tags start their configured recovery window. Secondary tags never start or block that
  fixed recovery window.
- The manual-builder catalogue applies search, muscle, and equipment filters independently of recovery state. Its
  ready/recovering presentation is advisory: every matching exercise remains available to add or replace.
- A dynamic recovery score is out of scope until the product records additional inputs such as actual load, RIR,
  failure, and user-reported recovery.

## Lifecycle and access invariants

- `workouts_one_planned_per_user_idx` permits at most one `planned` workout per user; a conflict is PostgreSQL
  `23505`.
- A `planned` workout has `completed_at is null`. A `completed` workout has `completed_at >= created_at`.
- Completion changes `status` and `completed_at` atomically. Completed workouts and their exercise rows are
  immutable and cannot return to `planned`.
- Workout-exercise writes lock and recheck their parent workout, serializing them against concurrent completion.
- Workout `user_id`, `origin`, and `created_at` cannot be changed by authenticated clients.
- `workouts.revision` is a positive opaque compare-and-swap token. It starts at `1`; a trigger converts every
  permitted direct assignment into exactly `OLD.revision + 1`. RLS limits direct advances to the owner's planned row.
- `workout_exercises.position`, `(workout_id, position)`, and `(workout_id, exercise_id)` enforce ordered,
  non-duplicated prescriptions; `sets` and `reps` are positive integers.
- Authenticated users can read the catalogue but cannot mutate it. Anonymous users have no catalogue access.
- RLS restricts workout and workout-exercise reads and writes to the owning authenticated user; child writes also
  require a `planned` parent.

## Manual planned-workout save RPC

- `public.save_manual_planned_workout(p_exercises jsonb, p_replace_existing boolean, p_expected_workout_id uuid,
p_expected_revision integer)` returns the newly saved workout UUID. It is `SECURITY INVOKER`, has an empty
  `search_path`, and only `authenticated` may execute it. The legacy three-argument signature is not callable.
- Ownership, `origin = 'manual'`, `status = 'planned'`, and zero-based exercise positions are derived server-side.
  The input JSON may contain only ordered `exercise_id`, `sets`, and `reps` values; it cannot set user, origin,
  status, timestamps, a workout ID, or positions.
- The function acquires the transaction-scoped advisory lock
  `hashtextextended('perfect-training-planner:planned-workout:' || auth.uid()::text, 0)` before locking the
  caller's current planned parent with `FOR UPDATE`. Future planned-workout edit and completion RPCs must reuse this
  lock namespace and ordering.
- Compare-and-swap outcomes are fixed: expected `null` plus no current plan and `replace = false` creates; expected
  ID/revision plus a current plan raises `MW001` (`confirmation_required`); supplied ID/revision with no exact
  matching current plan raises `MW002` (`stale_plan`); an exact expected pair with `replace = true` replaces
  atomically; every other flag/state combination and malformed input raises `MW003` (`validation_failed`). Missing
  authentication raises `MW004` (`unauthenticated`).
- Replacement deletes only the caller's locked planned parent and inserts the new parent and prescriptions in one
  transaction. Any error rolls back the deletion and every child mutation, leaving completed history and other users'
  data untouched.

## AI planned-workout save RPC

- `public.save_ai_planned_workout(p_exercises jsonb, p_replace_existing boolean, p_expected_workout_id uuid,
p_expected_revision integer)` has the same validation, authentication, advisory-lock namespace, replacement, and
  stale compare-and-swap semantics as the manual save RPC. It is a distinct `SECURITY INVOKER` function with an empty
  `search_path`, and only `authenticated` may execute it.
- The function derives ownership, `status = 'planned'`, zero-based positions, and `origin = 'ai'` server-side.
  `origin = 'ai'` means the authenticated owner used the AI-assisted save route; it is not an attestation that an
  edited prescription exactly matches a generated proposal.
- Stable errors are `AW001` (`confirmation_required`), `AW002` (`stale_plan`), `AW003`
  (`validation_failed`), and `AW004` (`unauthenticated`). It never changes the manual save function or its `MW` map.
- `public.save_history_aware_ai_planned_workout(p_exercises jsonb, p_replace_existing boolean, p_proposal_id uuid,
p_expected_workout_id uuid, p_expected_revision integer)` is the distinct, non-overloaded history-aware save RPC.
  It remains `SECURITY INVOKER` and delegates the original validation, advisory lock, and compare-and-swap operation
  to `save_ai_planned_workout` before a narrow private helper validates the live owner proposal. In the same
  transaction, that helper copies only the opaque lineage UUID, derives retained exercises from the saved canonical
  prescription, and records retention/save evidence. Any linkage failure rolls back the complete save.
- Proposal save-event `workout_id` values are validated against the owner when inserted but remain historical typed
  telemetry rather than a live workout foreign key. Replacing or deleting a planned workout therefore cannot null a
  required save-event field or block the workout transaction; the raw event still expires through the 90-day job.
- Authenticated callers cannot update `workouts.ai_proposal_lineage_id` directly. The private helper is
  owner-derived, uses an empty search path, and is the only application save path granted the required column/event
  privileges. The original four-argument RPC remains callable for cold-start and rollback compatibility.

## S-07 cold-start generation seam

- `POST /api/workouts/ai/generate` accepts only the versioned empty generation command. It authenticates and rechecks
  cold-start eligibility on every request, returns only a validated browser-safe proposal, and uses a fixed
  server-configured `OPENROUTER_MODEL`; no browser request can select a provider, model, credential, or prescription.
- `POST /api/workouts/ai/save` is the distinct authenticated AI-origin persistence route. It retains the established
  confirmation and stale-plan contract while saving through `save_ai_planned_workout`.
- S-07 is deliberately limited to accounts with no completed workouts. S-08 extends the same `/workouts/new` builder
  card and server boundary with history-aware behavior; it must not create a second browser flow or weaken S-07's
  eligibility check.

## S-08 private recommendation data boundary

- `get_exercise_completion_profile()` is authenticated-only, `STABLE`, `SECURITY INVOKER`, has an empty search path,
  accepts no owner argument, and returns only per-exercise count, latest completion time, and deterministic latest-
  workout membership. Completion is weak familiarity, not a preference or performance claim.
- Preferences, proposals, proposal exercises, events, and reduced-generation confirmations are private tables with no
  direct authenticated access. Narrow authenticated RPCs derive ownership from `auth.uid()`; raw events are private
  telemetry and are not used for online learning or training.
- Proposal/event expiry is database-derived and capped at 90 days. The daily `purge-expired-ai-recommendation-data`
  pg_cron job deletes expired completion events, proposal events, and proposals in dependency-safe order and removes
  expired or consumed confirmation records. It never touches preferences, workouts, or the nullable opaque
  `workouts.ai_proposal_lineage_id` marker.
- A proposal lineage marker is not a foreign key and does not attest that every final saved exercise was AI-selected.
  Account deletion cascades private recommendation data; catalogue and workout relationships remain restrictive or
  independent as specified by their own contracts.
- `ai_workout_completion_events` is keyed by workout and stores only owner, opaque lineage, the database-owned
  completion time, and its independent expiry. It has no proposal foreign key, so raw proposal expiry cannot prevent
  later completion evidence. Its composite workout/owner reference prevents cross-owner rows, and authenticated users
  have no direct table access.
- History-aware reduced generation requires the Worker-only `AI_CONFIRMATION_SIGNING_SECRET`. It signs the short-lived
  owner, candidate-fingerprint, count, expiry, and nonce capability; the database stores only a nonce digest and may
  not authorize a request without a valid Worker signature. Rotate this secret independently from
  `AI_KEY_ENCRYPTION_KEY_V1`; rotation invalidates only outstanding reduced confirmations.

## Planned workout edit and delete RPCs

- `public.update_planned_workout(p_expected_workout_id uuid, p_expected_revision integer, p_exercises jsonb)` returns
  the new revision. `public.delete_planned_workout(p_expected_workout_id uuid, p_expected_revision integer)` returns
  the deleted workout UUID. Both are authenticated-only `SECURITY INVOKER` functions with empty `search_path`.
- Both acquire the transaction-scoped advisory lock
  `hashtextextended('perfect-training-planner:planned-workout:' || auth.uid()::text, 0)` before locking the caller's
  current planned parent. S-04 completion must reuse this namespace and advisory-lock-then-parent-lock order.
- Both compare the expected ID and revision after locking. A missing, replaced, completed, cross-user, or
  revision-mismatched target raises `PW001` (`stale_plan`); malformed input raises `PW002` (`validation_failed`);
  missing authentication raises `PW003` (`unauthenticated`).
- Update atomically replaces the complete ordered prescription, derives zero-based contiguous positions, advances
  revision once, and preserves parent ID, owner, origin, creation time, status, and completion time. Delete hard-
  deletes only the exact matched planned parent and cascades its prescription. Exceptions roll back every change.

## Planned workout completion RPC

- `public.complete_planned_workout(p_expected_workout_id uuid, p_expected_revision integer)` returns the completed
  workout UUID. It is an authenticated-only `SECURITY INVOKER` function with an empty `search_path` and is the
  supported repository application path for marking a workout done.
- It acquires the transaction-scoped advisory lock
  `hashtextextended('perfect-training-planner:planned-workout:' || auth.uid()::text, 0)` before locking the caller's
  current planned parent with `FOR UPDATE`, matching the planned-workout mutation lock order.
- A missing, replaced, completed, cross-user, or revision-mismatched target raises `PW001` (`stale_plan`); null or
  non-positive tokens raise `PW002` (`validation_failed`); missing authentication raises `PW003` (`unauthenticated`).
- On an exact match it changes only `status` and `completed_at`, with the timestamp selected by the database
  transaction. It preserves the revision and complete prescription, produces terminal immutable history, and frees
  the caller's planned-workout slot. Existing authenticated owner lifecycle-column updates remain a lower-level RLS
  capability; the RPC does not make that direct access exclusive.
- When the matched workout carries an owner-scoped opaque proposal-lineage marker, completion also inserts one
  idempotent `ai_workout_completion_events` row in the same transaction. The record survives prior raw proposal expiry
  and expires independently within 90 days. Manual, cold-start, and unlinked legacy AI workouts complete without
  proposal completion telemetry.

## AI provider credential invariants

- `ai_provider_keys.user_id` is both the primary key and a cascading reference to `auth.users.id`, enforcing one
  encrypted provider credential per user for the MVP.
- `ai_provider.openrouter` is the only supported provider value. The database supplies it by default and
  authenticated clients cannot mutate it.
- Supabase stores only authenticated-encryption ciphertext, its unpadded-base64url 12-byte IV, the non-secret final
  four-character `key_hint`, and a positive `encryption_key_version`; plaintext provider keys are never persisted.
- `encryption_key_version` selects the matching versioned Worker root secret. Rotation is forward-only: retain old
  versions until all rows have been re-encrypted and verified.
- Owner RLS applies independently to SELECT, INSERT, UPDATE, and DELETE. Authenticated upserts may update the
  same-value `user_id` conflict key, while RLS `WITH CHECK` prevents ownership reassignment.
- Later provider calls obtain plaintext only through the server-side credential service; browser and direct page
  rendering surfaces receive masked metadata only.

## Generated and verified surfaces

- Generated database types: `src/types/database.types.ts`
- Typed SSR client: `src/lib/supabase.ts`
- Catalogue pgTAP contract: `supabase/tests/database/catalogue.test.sql`
- Workout/RLS pgTAP contract: `supabase/tests/database/workout_lifecycle.test.sql`
- Workout lifecycle concurrency contract: `supabase/tests/database/workout_lifecycle_concurrency.test.sh`
- Manual-workout RPC pgTAP contract: `supabase/tests/database/manual_workout_mutation.test.sql`
- Manual-workout RPC concurrency contract: `supabase/tests/database/manual_workout_mutation_concurrency.test.sh`
- Planned-workout RPC pgTAP contract: `supabase/tests/database/planned_workout_mutation.test.sql`
- Planned-workout RPC concurrency contract: `supabase/tests/database/planned_workout_mutation_concurrency.test.sh`
- Completion RPC pgTAP contract: `supabase/tests/database/planned_workout_completion.test.sql`
- AI provider key pgTAP contract: `supabase/tests/database/ai_provider_keys.test.sql`
- AI movement-pattern pgTAP coverage: `supabase/tests/database/catalogue.test.sql`
- Full local suite: `pnpm exec supabase test db --local supabase/tests/database`

After a clean local reset, regenerate types with Supabase CLI 2.102.0 and format them with the pinned Prettier:

```bash
pnpm exec supabase gen types typescript --local --schema public > src/types/database.types.ts
pnpm exec prettier --config .prettierrc.json --write src/types/database.types.ts
```
