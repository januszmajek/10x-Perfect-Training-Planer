import type { SupabaseClient } from "@supabase/supabase-js";
import { validateDraftItems, type CatalogueExercise, type ManualWorkoutRequest } from "@/lib/manual-workout-builder";
import type { Database, Json } from "@/types/database.types";

type WorkoutClient = SupabaseClient<Database>;

export type ManualWorkoutErrorCode =
  | "validation_failed"
  | "confirmation_required"
  | "stale_plan"
  | "unauthenticated"
  | "origin_rejected"
  | "persistence_failed";

export type ManualWorkoutFailureLayer = "service" | "database";

interface ManualWorkoutFailure {
  ok: false;
  code: ManualWorkoutErrorCode;
  internal: {
    layer: ManualWorkoutFailureLayer;
    technicalCode: string;
  };
}

type ManualWorkoutResult<T> = { ok: true; data: T } | ManualWorkoutFailure;

export interface CurrentPlannedWorkoutExercise {
  exerciseId: string;
  name: string;
  position: number;
  sets: number;
  reps: number;
}

export interface CurrentPlannedWorkout {
  id: string;
  revision: number;
  origin: Database["public"]["Enums"]["workout_origin"];
  createdAt: string;
  exercises: CurrentPlannedWorkoutExercise[];
}

export interface ManualWorkoutBuilderData {
  catalogue: CatalogueExercise[];
  currentPlan: CurrentPlannedWorkout | null;
}

function sanitizeTechnicalCode(code: unknown): string {
  return typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : "UNKNOWN";
}

function failure(
  code: ManualWorkoutErrorCode,
  layer: ManualWorkoutFailureLayer,
  technicalCode: string,
): ManualWorkoutFailure {
  return { ok: false, code, internal: { layer, technicalCode: sanitizeTechnicalCode(technicalCode) } };
}

async function verifyOwnedSession(client: WorkoutClient, userId: string): Promise<ManualWorkoutFailure | null> {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || user?.id !== userId) {
    return failure("unauthenticated", "service", error ? "AUTH_LOOKUP_FAILED" : "AUTH_MISMATCH");
  }

  return null;
}

export async function loadCurrentPlannedWorkout(
  client: WorkoutClient,
  userId: string | null,
): Promise<ManualWorkoutResult<CurrentPlannedWorkout | null>> {
  if (!userId) return failure("unauthenticated", "service", "AUTH_MISSING");
  const authFailure = await verifyOwnedSession(client, userId);
  if (authFailure) return authFailure;

  const { data, error } = await client
    .from("workouts")
    .select("id,revision,origin,created_at,workout_exercises(exercise_id,position,sets,reps,exercises(name))")
    .eq("user_id", userId)
    .eq("status", "planned")
    .order("position", { referencedTable: "workout_exercises", ascending: true })
    .maybeSingle();

  if (error) {
    return failure("persistence_failed", "database", error.code);
  }

  if (!data) {
    return { ok: true, data: null };
  }

  return {
    ok: true,
    data: {
      id: data.id,
      revision: data.revision,
      origin: data.origin,
      createdAt: data.created_at,
      exercises: data.workout_exercises.map((item) => ({
        exerciseId: item.exercise_id,
        name: item.exercises.name,
        position: item.position,
        sets: item.sets,
        reps: item.reps,
      })),
    },
  };
}

export async function loadManualWorkoutBuilderData(
  client: WorkoutClient,
  userId: string | null,
): Promise<ManualWorkoutResult<ManualWorkoutBuilderData>> {
  if (!userId) return failure("unauthenticated", "service", "AUTH_MISSING");
  const authFailure = await verifyOwnedSession(client, userId);
  if (authFailure) return authFailure;

  const [catalogueResult, currentPlanResult] = await Promise.all([
    client
      .from("exercises")
      .select("id,name,equipment,exercise_muscle_groups(muscle_group_code,role,muscle_groups(name))")
      .order("name", { ascending: true })
      .limit(200),
    client
      .from("workouts")
      .select("id,revision,origin,created_at,workout_exercises(exercise_id,position,sets,reps,exercises(name))")
      .eq("user_id", userId)
      .eq("status", "planned")
      .order("position", { referencedTable: "workout_exercises", ascending: true })
      .maybeSingle(),
  ]);

  if (catalogueResult.error) {
    return failure("persistence_failed", "database", catalogueResult.error.code);
  }
  if (currentPlanResult.error) {
    return failure("persistence_failed", "database", currentPlanResult.error.code);
  }

  const catalogue: CatalogueExercise[] = catalogueResult.data.map((exercise) => ({
    id: exercise.id,
    name: exercise.name,
    equipment: exercise.equipment,
    muscles: exercise.exercise_muscle_groups.map((tag) => ({
      code: tag.muscle_group_code,
      name: tag.muscle_groups.name,
      role: tag.role,
    })),
  }));

  const currentPlan = currentPlanResult.data
    ? {
        id: currentPlanResult.data.id,
        revision: currentPlanResult.data.revision,
        origin: currentPlanResult.data.origin,
        createdAt: currentPlanResult.data.created_at,
        exercises: currentPlanResult.data.workout_exercises.map((item) => ({
          exerciseId: item.exercise_id,
          name: item.exercises.name,
          position: item.position,
          sets: item.sets,
          reps: item.reps,
        })),
      }
    : null;

  return { ok: true, data: { catalogue, currentPlan } };
}

export async function saveManualPlannedWorkout(
  client: WorkoutClient,
  userId: string | null,
  request: ManualWorkoutRequest,
): Promise<ManualWorkoutResult<{ workoutId: string }>> {
  if (!userId) return failure("unauthenticated", "service", "AUTH_MISSING");
  const authFailure = await verifyOwnedSession(client, userId);
  if (authFailure) return authFailure;

  const requestedIds = request.exercises.map(({ exerciseId }) => exerciseId);
  const { data: knownExercises, error: catalogueError } = await client
    .from("exercises")
    .select("id")
    .in("id", requestedIds)
    .limit(20);

  if (catalogueError) {
    return failure("persistence_failed", "database", catalogueError.code);
  }

  if (!validateDraftItems(request.exercises, new Set(knownExercises.map(({ id }) => id)))) {
    return failure("validation_failed", "service", "CATALOGUE_MISMATCH");
  }

  const exercises: Json = request.exercises.map(({ exerciseId, sets, reps }) => ({
    exercise_id: exerciseId,
    sets,
    reps,
  }));

  let rpcArgs: Database["public"]["Functions"]["save_manual_planned_workout"]["Args"];
  if (request.replaceExisting) {
    if (request.expectedWorkoutId === null || request.expectedRevision === null) {
      return failure("validation_failed", "service", "EXPECTED_PLAN_MISSING");
    }
    rpcArgs = {
      p_exercises: exercises,
      p_replace_existing: true,
      p_expected_workout_id: request.expectedWorkoutId,
      p_expected_revision: request.expectedRevision,
    };
  } else {
    rpcArgs = {
      p_exercises: exercises,
      p_replace_existing: false,
    };
  }
  const { data, error } = await client.rpc("save_manual_planned_workout", rpcArgs);

  if (error) {
    const knownCodes: Partial<Record<string, ManualWorkoutErrorCode>> = {
      MW001: "confirmation_required",
      MW002: "stale_plan",
      MW003: "validation_failed",
      MW004: "unauthenticated",
    };
    const code = knownCodes[error.code];
    return failure(code ?? "persistence_failed", "database", code ? error.code : "UNKNOWN_SQLSTATE");
  }

  if (!data) {
    return failure("persistence_failed", "database", "EMPTY_RPC_RESULT");
  }

  return { ok: true, data: { workoutId: data } };
}
