import { isCanonicalUuid } from "./manual-workout-builder.ts";
import type { CurrentPlannedWorkout } from "./planned-workouts.ts";

export const PLANNED_WORKOUT_API_PATH = "/api/workouts/planned";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCurrentPlannedWorkout(value: unknown): value is CurrentPlannedWorkout {
  return (
    isRecord(value) &&
    isCanonicalUuid(value.id) &&
    Number.isSafeInteger(value.revision) &&
    (value.revision as number) > 0 &&
    (value.origin === "manual" || value.origin === "ai") &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.exercises) &&
    value.exercises.every(
      (exercise) =>
        isRecord(exercise) &&
        isCanonicalUuid(exercise.exerciseId) &&
        typeof exercise.name === "string" &&
        Number.isSafeInteger(exercise.position) &&
        Number.isSafeInteger(exercise.sets) &&
        Number.isSafeInteger(exercise.reps),
    )
  );
}

export function parseCurrentPlanResponse(value: unknown): CurrentPlannedWorkout | null | undefined {
  if (!isRecord(value) || !("currentPlan" in value)) return undefined;
  if (value.currentPlan === null) return null;
  return isCurrentPlannedWorkout(value.currentPlan) ? value.currentPlan : undefined;
}
