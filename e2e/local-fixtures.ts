import { execFileSync } from "node:child_process";
import { encryptAiProviderKey } from "@/lib/ai-provider-key-crypto";

export interface WorkoutFixtureExercise {
  id: string;
  name: string;
}

const WORKOUT_FIXTURE_SLUGS = [
  "barbell-bench-press",
  "pull-up",
  "conventional-deadlift",
  "overhead-barbell-press",
  "plank",
] as const;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing local E2E environment: ${name}`);
  return value;
}

export async function configureAiProviderKey(email: string) {
  const databaseUrl = required("SUPABASE_DB_URL");
  const userId = execFileSync("psql", [databaseUrl, "-Atqc", `select id from auth.users where email = '${email}';`], {
    encoding: "utf8",
  }).trim();
  if (!userId) throw new Error("The E2E user was not available to configure an AI key.");

  const encrypted = await encryptAiProviderKey("e2e-local-provider-key", required("AI_KEY_ENCRYPTION_KEY_V1"), {
    userId,
    provider: "openrouter",
    encryptionKeyVersion: 1,
  });
  execFileSync(
    "psql",
    [
      databaseUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `insert into public.ai_provider_keys (user_id, ciphertext, iv, encryption_key_version)
       values ('${userId}', '${encrypted.ciphertext}', '${encrypted.iv}', ${encrypted.encryptionKeyVersion})
       on conflict (user_id) do update set ciphertext = excluded.ciphertext, iv = excluded.iv,
       encryption_key_version = excluded.encryption_key_version;`,
    ],
    { stdio: "pipe" },
  );
}

export function loadWorkoutFixture(): WorkoutFixtureExercise[] {
  const databaseUrl = required("SUPABASE_DB_URL");
  const output = execFileSync(
    "psql",
    [
      databaseUrl,
      "-AtF",
      "|",
      "-c",
      `select slug, id, name from public.exercises where slug in (${WORKOUT_FIXTURE_SLUGS.map((slug) => `'${slug}'`).join(", ")});`,
    ],
    { encoding: "utf8" },
  );
  const bySlug = new Map(
    output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("|"))
      .map(([slug, id, name]) => [slug, { id, name }] as const),
  );
  const exercises = WORKOUT_FIXTURE_SLUGS.map((slug) => bySlug.get(slug));
  if (exercises.some((exercise) => !exercise)) {
    throw new Error("The local E2E catalogue fixture is incomplete.");
  }
  return exercises as WorkoutFixtureExercise[];
}

export function seedCompletedHistoryFixture(email: string, exercise: WorkoutFixtureExercise) {
  const databaseUrl = required("SUPABASE_DB_URL");
  const workoutId = execFileSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-v", `email=${email}`, "-v", `exercise_id=${exercise.id}`, "-Atq"],
    {
      encoding: "utf8",
      input: `begin;
       insert into public.workouts (user_id, status, origin)
       select id, 'planned', 'manual' from auth.users where email = :'email'
       returning id
       \\gset
       insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps)
       values (:'id'::uuid, :'exercise_id'::uuid, 0, 3, 10);
       update public.workouts set status = 'completed', completed_at = now()
       where id = :'id'::uuid
       returning id;
       commit;`,
    },
  ).trim();
  if (!workoutId) throw new Error("The E2E completed-history fixture could not be created.");
  return workoutId;
}
