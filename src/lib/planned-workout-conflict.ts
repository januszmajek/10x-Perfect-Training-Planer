import type { CurrentPlannedWorkout } from "./planned-workouts.ts";

export type PlannedWorkoutSaveConflict = "confirmation_required" | "stale_plan";

export type PlannedWorkoutConflictTransition =
  | { kind: "first-save-collision"; latestPlan: CurrentPlannedWorkout }
  | { kind: "stale-replacement"; latestPlan: CurrentPlannedWorkout }
  | { kind: "latest-plan-missing" };

/**
 * Converts a refreshed planned-workout response into the one shared conflict protocol.
 * Presentation stays in each controller: manual planning uses a short confirmation dialog,
 * while editing can show a detailed diff before overwriting.
 */
export function resolvePlannedWorkoutConflict(
  conflict: PlannedWorkoutSaveConflict,
  latestPlan: CurrentPlannedWorkout | null,
): PlannedWorkoutConflictTransition {
  if (latestPlan === null) return { kind: "latest-plan-missing" };

  return conflict === "confirmation_required"
    ? { kind: "first-save-collision", latestPlan }
    : { kind: "stale-replacement", latestPlan };
}
