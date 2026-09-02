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

export type ExpectedWorkoutState = "planned" | "completed" | "absent";

export interface CompletionReconciliationResponse {
  currentPlan: CurrentPlannedWorkout | null;
  expectedWorkoutState: ExpectedWorkoutState;
}

export type CompletionReconciliation = "completed" | "unchanged" | "changed" | "indeterminate";

export function parseCompletionReconciliationResponse(value: unknown): CompletionReconciliationResponse | undefined {
  const currentPlan = parseCurrentPlanResponse(value);
  if (!isRecord(value) || currentPlan === undefined) return undefined;
  if (
    value.expectedWorkoutState !== "planned" &&
    value.expectedWorkoutState !== "completed" &&
    value.expectedWorkoutState !== "absent"
  ) {
    return undefined;
  }
  return { currentPlan, expectedWorkoutState: value.expectedWorkoutState };
}

export function classifyCompletionReconciliation(
  response: CompletionReconciliationResponse,
  expectedWorkoutId: string,
  expectedRevision: number,
): CompletionReconciliation {
  if (response.expectedWorkoutState === "completed") return "completed";
  if (
    response.currentPlan &&
    (response.currentPlan.id !== expectedWorkoutId || response.currentPlan.revision !== expectedRevision)
  ) {
    return "changed";
  }
  if (
    response.expectedWorkoutState === "planned" &&
    response.currentPlan?.id === expectedWorkoutId &&
    response.currentPlan.revision === expectedRevision
  ) {
    return "unchanged";
  }
  return "indeterminate";
}
