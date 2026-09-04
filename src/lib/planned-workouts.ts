import type { SupabaseClient } from "@supabase/supabase-js";
import { validateDraftItems, type CatalogueExercise, type ManualWorkoutDraftItem } from "./manual-workout-builder.ts";
import type {
  PlannedWorkoutCompleteRequest,
  PlannedWorkoutDeleteRequest,
  PlannedWorkoutUpdateRequest,
} from "@/lib/planned-workout-mutation";
import type { Database, Json } from "@/types/database.types";

type WorkoutClient = SupabaseClient<Database>;

export type WorkoutErrorCode =
  | "validation_failed"
  | "confirmation_required"
  | "stale_plan"
  | "unauthenticated"
  | "origin_rejected"
  | "persistence_failed";

export type WorkoutFailureLayer = "service" | "database";

export interface WorkoutFailure {
  ok: false;
  code: WorkoutErrorCode;
  internal: { layer: WorkoutFailureLayer; technicalCode: string };
}

export type WorkoutResult<T> = { ok: true; data: T } | WorkoutFailure;

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

export type ExpectedWorkoutState = "planned" | "completed" | "absent";

export interface CompletedRecoveryWorkout {
  completedAt: string;
  exercises: { sets: number; muscles: CatalogueExercise["muscles"] }[];
}

function sanitizeTechnicalCode(code: unknown): string {
  return typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : "UNKNOWN";
}

export function workoutFailure(
  code: WorkoutErrorCode,
  layer: WorkoutFailureLayer,
  technicalCode: string,
): WorkoutFailure {
  return { ok: false, code, internal: { layer, technicalCode: sanitizeTechnicalCode(technicalCode) } };
}

export async function verifyOwnedSession(client: WorkoutClient, userId: string): Promise<WorkoutFailure | null> {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || user?.id !== userId) {
    return workoutFailure("unauthenticated", "service", error ? "AUTH_LOOKUP_FAILED" : "AUTH_MISMATCH");
  }

  return null;
}

function mapCurrentPlan(data: {
  id: string;
  revision: number;
  origin: Database["public"]["Enums"]["workout_origin"];
  created_at: string;
  workout_exercises: {
    exercise_id: string;
    position: number;
    sets: number;
    reps: number;
    exercises: { name: string };
  }[];
}): CurrentPlannedWorkout {
  return {
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
  };
}

export async function loadCurrentPlannedWorkout(
  client: WorkoutClient,
  userId: string | null,
): Promise<WorkoutResult<CurrentPlannedWorkout | null>> {
  if (!userId) return workoutFailure("unauthenticated", "service", "AUTH_MISSING");
  const authFailure = await verifyOwnedSession(client, userId);
  if (authFailure) return authFailure;

  const { data, error } = await client
    .from("workouts")
    .select("id,revision,origin,created_at,workout_exercises(exercise_id,position,sets,reps,exercises(name))")
    .eq("user_id", userId)
    .eq("status", "planned")
    .order("position", { referencedTable: "workout_exercises", ascending: true })
    .maybeSingle();

  if (error) return workoutFailure("persistence_failed", "database", error.code);
  return { ok: true, data: data ? mapCurrentPlan(data) : null };
}

export async function loadExpectedWorkoutState(
  client: WorkoutClient,
  userId: string | null,
  expectedWorkoutId: string,
): Promise<WorkoutResult<ExpectedWorkoutState>> {
  if (!userId) return workoutFailure("unauthenticated", "service", "AUTH_MISSING");
  const authFailure = await verifyOwnedSession(client, userId);
  if (authFailure) return authFailure;

  const { data, error } = await client
    .from("workouts")
    .select("status")
    .eq("user_id", userId)
    .eq("id", expectedWorkoutId)
    .maybeSingle();

  if (error) return workoutFailure("persistence_failed", "database", error.code);
  if (!data) return { ok: true, data: "absent" };
  return { ok: true, data: data.status === "completed" ? "completed" : "planned" };
}

export async function loadWorkoutCatalogue(client: WorkoutClient): Promise<WorkoutResult<CatalogueExercise[]>> {
  const { data, error } = await client
    .from("exercises")
    .select("id,name,equipment,exercise_muscle_groups(muscle_group_code,role,muscle_groups(name,recovery_hours))")
    .order("name", { ascending: true })
    .limit(200);

  if (error) return workoutFailure("persistence_failed", "database", error.code);

  return {
    ok: true,
    data: data.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      equipment: exercise.equipment,
      muscles: exercise.exercise_muscle_groups.map((tag) => ({
        code: tag.muscle_group_code,
        name: tag.muscle_groups.name,
        role: tag.role,
        recoveryHours: tag.muscle_groups.recovery_hours,
      })),
    })),
  };
}

function isRecoveryHistory(value: unknown): CompletedRecoveryWorkout | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const workout = value as Record<string, unknown>;
  if (typeof workout.completed_at !== "string" || !Array.isArray(workout.workout_exercises)) return null;
  const exercises: CompletedRecoveryWorkout["exercises"] = [];

  for (const value of workout.workout_exercises) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (
      !Number.isSafeInteger(item.sets) ||
      (item.sets as number) < 1 ||
      typeof item.exercises !== "object" ||
      item.exercises === null
    )
      return null;
    const exercise = item.exercises as Record<string, unknown>;
    if (!Array.isArray(exercise.exercise_muscle_groups)) return null;
    const muscles: CatalogueExercise["muscles"] = [];
    for (const value of exercise.exercise_muscle_groups) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
      const tag = value as Record<string, unknown>;
      if (
        typeof tag.muscle_group_code !== "string" ||
        (tag.role !== "primary" && tag.role !== "secondary") ||
        typeof tag.muscle_groups !== "object" ||
        tag.muscle_groups === null
      )
        return null;
      const muscle = tag.muscle_groups as Record<string, unknown>;
      if (
        typeof muscle.name !== "string" ||
        !Number.isSafeInteger(muscle.recovery_hours) ||
        (muscle.recovery_hours as number) < 1
      )
        return null;
      muscles.push({
        code: tag.muscle_group_code,
        name: muscle.name,
        role: tag.role,
        recoveryHours: muscle.recovery_hours as number,
      });
    }
    exercises.push({ sets: item.sets as number, muscles });
  }

  return { completedAt: workout.completed_at, exercises };
}

export async function loadRecentCompletedRecoveryWorkouts(
  client: WorkoutClient,
  userId: string,
  completedSince: string,
): Promise<WorkoutResult<CompletedRecoveryWorkout[]>> {
  const authFailure = await verifyOwnedSession(client, userId);
  if (authFailure) return authFailure;

  const { data, error } = await client
    .from("workouts")
    .select(
      "completed_at,workout_exercises(sets,exercises(exercise_muscle_groups(muscle_group_code,role,muscle_groups(name,recovery_hours))))",
    )
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("completed_at", completedSince)
    .order("completed_at", { ascending: false });
  if (error) return workoutFailure("persistence_failed", "database", error.code);

  const workouts = (data as unknown[]).map(isRecoveryHistory);
  if (workouts.some((workout) => workout === null))
    return workoutFailure("persistence_failed", "service", "INVALID_RECOVERY_HISTORY");
  return { ok: true, data: workouts as CompletedRecoveryWorkout[] };
}

async function validateKnownExercises(
  client: WorkoutClient,
  exercises: readonly ManualWorkoutDraftItem[],
): Promise<WorkoutFailure | null> {
  const requestedIds = exercises.map(({ exerciseId }) => exerciseId);
  const { data, error } = await client.from("exercises").select("id").in("id", requestedIds).limit(20);

  if (error) return workoutFailure("persistence_failed", "database", error.code);
  if (!validateDraftItems(exercises, new Set(data.map(({ id }) => id)))) {
    return workoutFailure("validation_failed", "service", "CATALOGUE_MISMATCH");
  }

  return null;
}

function toRpcExercises(exercises: readonly ManualWorkoutDraftItem[]): Json {
  return exercises.map(({ exerciseId, sets, reps }) => ({ exercise_id: exerciseId, sets, reps }));
}

function mapPlannedRpcFailure(code: string | undefined): WorkoutErrorCode {
  if (code === "PW001") return "stale_plan";
  if (code === "PW002") return "validation_failed";
  if (code === "PW003") return "unauthenticated";
  return "persistence_failed";
}

export async function updatePlannedWorkout(
  client: WorkoutClient,
  userId: string | null,
  request: PlannedWorkoutUpdateRequest,
): Promise<WorkoutResult<{ workoutId: string; revision: number }>> {
  if (!userId) return workoutFailure("unauthenticated", "service", "AUTH_MISSING");
  const authFailure = await verifyOwnedSession(client, userId);
  if (authFailure) return authFailure;
  const validationFailure = await validateKnownExercises(client, request.exercises);
  if (validationFailure) return validationFailure;

  const { data, error } = await client.rpc("update_planned_workout", {
    p_expected_workout_id: request.expectedWorkoutId,
    p_expected_revision: request.expectedRevision,
    p_exercises: toRpcExercises(request.exercises),
  });

  if (error) {
    const code = mapPlannedRpcFailure(error.code);
    return workoutFailure(code, "database", code === "persistence_failed" ? "UNKNOWN_SQLSTATE" : error.code);
  }
  if (!Number.isSafeInteger(data) || data < 1)
    return workoutFailure("persistence_failed", "database", "INVALID_RPC_RESULT");

  return { ok: true, data: { workoutId: request.expectedWorkoutId, revision: data } };
}

export async function deletePlannedWorkout(
  client: WorkoutClient,
  userId: string | null,
  request: PlannedWorkoutDeleteRequest,
): Promise<WorkoutResult<{ workoutId: string }>> {
  if (!userId) return workoutFailure("unauthenticated", "service", "AUTH_MISSING");
  const authFailure = await verifyOwnedSession(client, userId);
  if (authFailure) return authFailure;

  const { data, error } = await client.rpc("delete_planned_workout", {
    p_expected_workout_id: request.expectedWorkoutId,
    p_expected_revision: request.expectedRevision,
  });

  if (error) {
    const code = mapPlannedRpcFailure(error.code);
    return workoutFailure(code, "database", code === "persistence_failed" ? "UNKNOWN_SQLSTATE" : error.code);
  }
  if (data !== request.expectedWorkoutId) return workoutFailure("persistence_failed", "database", "INVALID_RPC_RESULT");

  return { ok: true, data: { workoutId: data } };
}

export async function completePlannedWorkout(
  client: WorkoutClient,
  userId: string | null,
  request: PlannedWorkoutCompleteRequest,
): Promise<WorkoutResult<{ workoutId: string }>> {
  if (!userId) return workoutFailure("unauthenticated", "service", "AUTH_MISSING");
  const authFailure = await verifyOwnedSession(client, userId);
  if (authFailure) return authFailure;

  const { data, error } = await client.rpc("complete_planned_workout", {
    p_expected_workout_id: request.expectedWorkoutId,
    p_expected_revision: request.expectedRevision,
  });

  if (error) {
    const code = mapPlannedRpcFailure(error.code);
    return workoutFailure(code, "database", code === "persistence_failed" ? "UNKNOWN_SQLSTATE" : error.code);
  }
  if (data !== request.expectedWorkoutId) return workoutFailure("persistence_failed", "database", "INVALID_RPC_RESULT");

  return { ok: true, data: { workoutId: data } };
}
