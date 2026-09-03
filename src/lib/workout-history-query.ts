import type { WorkoutHistoryCursor } from "./workout-history-client.ts";

interface MuscleMembershipFilter {
  alias: string;
  code: string;
}

function membershipFilters(muscles: readonly string[]): MuscleMembershipFilter[] {
  return muscles.map((code, index) => ({ alias: `muscle_match_${index}`, code }));
}

export function buildHistoryMembershipSelect(muscles: readonly string[], equipment: readonly string[] = []): string {
  if (muscles.length === 0 && equipment.length === 0) return "id,completed_at";

  return [
    "id",
    "completed_at",
    ...membershipFilters(muscles).map(
      ({ alias }) =>
        `${alias}:workout_exercises!inner(exercises!inner(exercise_muscle_groups!inner(muscle_group_code)))`,
    ),
    ...(equipment.length ? ["equipment_match:workout_exercises!inner(exercises!inner(equipment))"] : []),
  ].join(",");
}

export function historyMembershipFilters(muscles: readonly string[]): readonly MuscleMembershipFilter[] {
  return membershipFilters(muscles);
}

function quotePostgrestValue(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function buildWorkoutHistoryCursorPredicate(cursor: WorkoutHistoryCursor): string {
  const completedAt = quotePostgrestValue(cursor.completedAt);
  return `completed_at.lt.${completedAt},and(completed_at.eq.${completedAt},id.lt.${cursor.id})`;
}
