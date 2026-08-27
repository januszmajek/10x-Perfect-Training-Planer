# Contract Surfaces

This registry names the database contracts that later changes must reuse. Migrations remain the executable source
of truth; generated TypeScript types expose that schema to application code.

## Migration order

1. `supabase/migrations/20260820090000_create_exercise_catalogue.sql`
2. `supabase/migrations/20260820090100_seed_exercise_catalogue.sql`
3. `supabase/migrations/20260820090200_create_workout_lifecycle.sql`
4. `supabase/migrations/20260827120000_serialize_workout_exercise_mutations.sql`
5. `supabase/migrations/20260827130000_create_ai_provider_keys.sql`

Production catalogue data belongs in the second migration. `supabase/seed.sql` is only for non-sensitive local
fixtures and must not contain data required by production.

## Enums

| Enum                   | Ordered values                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `muscle_category`      | `upper_body`, `lower_body`, `core`                                                       |
| `equipment_type`       | `barbell`, `dumbbell`, `cable`, `machine`, `bodyweight`, `kettlebell`, `resistance_band` |
| `exercise_muscle_role` | `primary`, `secondary`                                                                   |
| `workout_status`       | `planned`, `completed`                                                                   |
| `workout_origin`       | `ai`, `manual`                                                                           |
| `ai_provider`          | `openrouter`                                                                             |

## Tables and key columns

| Table                    | Primary key                                | Load-bearing columns and relationships                                                  |
| ------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `muscle_groups`          | `code`                                     | `name`, `category`, `recovery_hours`                                                    |
| `exercises`              | `id`                                       | unique `slug`, unique `name`, `equipment`                                               |
| `exercise_muscle_groups` | `exercise_id`, `muscle_group_code`, `role` | restrictive references to `exercises.id` and `muscle_groups.code`                       |
| `workouts`               | `id`                                       | `user_id` → `auth.users.id`, `status`, immutable `origin`, `created_at`, `completed_at` |
| `workout_exercises`      | `id`                                       | `workout_id`, `exercise_id`, `position`, `sets`, `reps`                                 |
| `ai_provider_keys`       | `user_id`                                  | `provider`, `ciphertext`, `iv`, `key_hint`, `encryption_key_version`, timestamps        |

## Muscle taxonomy

- `upper_body`: `chest`, `lats`, `upper_back`, `lower_back`, `front_delts`, `side_delts`, `rear_delts`, `biceps`,
  `triceps`, `forearms`
- `lower_body`: `quads`, `hamstrings`, `glutes`, `calves`, `adductors`
- `core`: `core`

Recovery is 72 hours for `lats`, `upper_back`, `lower_back`, `quads`, `hamstrings`, `glutes`, `calves`, and
`adductors`; every other group uses 48 hours.

## Lifecycle and access invariants

- `workouts_one_planned_per_user_idx` permits at most one `planned` workout per user; a conflict is PostgreSQL
  `23505`.
- A `planned` workout has `completed_at is null`. A `completed` workout has `completed_at >= created_at`.
- Completion changes `status` and `completed_at` atomically. Completed workouts and their exercise rows are
  immutable and cannot return to `planned`.
- Workout-exercise writes lock and recheck their parent workout, serializing them against concurrent completion.
- Workout `user_id`, `origin`, and `created_at` cannot be changed by authenticated clients.
- `workout_exercises.position`, `(workout_id, position)`, and `(workout_id, exercise_id)` enforce ordered,
  non-duplicated prescriptions; `sets` and `reps` are positive integers.
- Authenticated users can read the catalogue but cannot mutate it. Anonymous users have no catalogue access.
- RLS restricts workout and workout-exercise reads and writes to the owning authenticated user; child writes also
  require a `planned` parent.

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
- AI provider key pgTAP contract: `supabase/tests/database/ai_provider_keys.test.sql`
- Full local suite: `pnpm exec supabase test db --local supabase/tests/database`

After a clean local reset, regenerate types with Supabase CLI 2.102.0 and format them with the pinned Prettier:

```bash
pnpm exec supabase gen types typescript --local --schema public > src/types/database.types.ts
pnpm exec prettier --config .prettierrc.json --write src/types/database.types.ts
```
