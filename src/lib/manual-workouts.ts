import type { SupabaseClient } from "@supabase/supabase-js";
import { validateDraftItems, type CatalogueExercise, type ManualWorkoutRequest } from "./manual-workout-builder.ts";
import {
  loadCurrentPlannedWorkout,
  loadRecentCompletedRecoveryWorkouts,
  loadWorkoutCatalogue,
  verifyOwnedSession,
  workoutFailure,
  type CurrentPlannedWorkout,
  type WorkoutErrorCode,
  type WorkoutResult,
} from "./planned-workouts.ts";
import { projectRecoveryAwareCatalogue } from "./recovery-aware-catalogue.ts";
import type { Database, Json } from "@/types/database.types";

type WorkoutClient = SupabaseClient<Database>;

export type ManualWorkoutErrorCode = WorkoutErrorCode;
export type ManualWorkoutResult<T> = WorkoutResult<T>;
export type { CurrentPlannedWorkout };

export interface ManualWorkoutBuilderData {
  catalogue: CatalogueExercise[];
  currentPlan: CurrentPlannedWorkout | null;
}

export async function loadManualWorkoutBuilderData(
  client: WorkoutClient,
  userId: string | null,
): Promise<ManualWorkoutResult<ManualWorkoutBuilderData>> {
  if (!userId) return workoutFailure("unauthenticated", "service", "AUTH_MISSING");

  const catalogueResult = await loadWorkoutCatalogue(client);

  if (!catalogueResult.ok) return catalogueResult;
  const maximumRecoveryHours = Math.max(
    ...catalogueResult.data.flatMap((exercise) => exercise.muscles.map((muscle) => muscle.recoveryHours)),
  );
  if (!Number.isSafeInteger(maximumRecoveryHours) || maximumRecoveryHours < 1) {
    return workoutFailure("persistence_failed", "service", "INVALID_RECOVERY_POLICY");
  }
  const completedSince = new Date(Date.now() - maximumRecoveryHours * 60 * 60 * 1000).toISOString();
  const [currentPlanResult, recoveryHistoryResult] = await Promise.all([
    loadCurrentPlannedWorkout(client, userId),
    loadRecentCompletedRecoveryWorkouts(client, userId, completedSince),
  ]);

  if (!currentPlanResult.ok) return currentPlanResult;
  if (!recoveryHistoryResult.ok) return recoveryHistoryResult;

  return {
    ok: true,
    data: {
      catalogue: projectRecoveryAwareCatalogue(catalogueResult.data, recoveryHistoryResult.data),
      currentPlan: currentPlanResult.data,
    },
  };
}

export async function saveManualPlannedWorkout(
  client: WorkoutClient,
  userId: string | null,
  request: ManualWorkoutRequest,
): Promise<ManualWorkoutResult<{ workoutId: string }>> {
  if (!userId) return workoutFailure("unauthenticated", "service", "AUTH_MISSING");
  const authFailure = await verifyOwnedSession(client, userId);
  if (authFailure) return authFailure;

  const requestedIds = request.exercises.map(({ exerciseId }) => exerciseId);
  const { data: knownExercises, error: catalogueError } = await client
    .from("exercises")
    .select("id")
    .in("id", requestedIds)
    .limit(20);

  if (catalogueError) return workoutFailure("persistence_failed", "database", catalogueError.code);
  if (!validateDraftItems(request.exercises, new Set(knownExercises.map(({ id }) => id)))) {
    return workoutFailure("validation_failed", "service", "CATALOGUE_MISMATCH");
  }

  const exercises: Json = request.exercises.map(({ exerciseId, sets, reps }) => ({
    exercise_id: exerciseId,
    sets,
    reps,
  }));
  let rpcArgs: Database["public"]["Functions"]["save_manual_planned_workout"]["Args"];
  if (request.replaceExisting) {
    if (request.expectedWorkoutId === null || request.expectedRevision === null) {
      return workoutFailure("validation_failed", "service", "EXPECTED_PLAN_MISSING");
    }
    rpcArgs = {
      p_exercises: exercises,
      p_replace_existing: true,
      p_expected_workout_id: request.expectedWorkoutId,
      p_expected_revision: request.expectedRevision,
    };
  } else {
    rpcArgs = { p_exercises: exercises, p_replace_existing: false };
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
    return workoutFailure(code ?? "persistence_failed", "database", code ? error.code : "UNKNOWN_SQLSTATE");
  }
  if (!data) return workoutFailure("persistence_failed", "database", "EMPTY_RPC_RESULT");

  return { ok: true, data: { workoutId: data } };
}
