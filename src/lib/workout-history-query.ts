import type { WorkoutHistoryCursor } from "./workout-history-client.ts";

function quotePostgrestValue(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function buildWorkoutHistoryCursorPredicate(cursor: WorkoutHistoryCursor): string {
  const completedAt = quotePostgrestValue(cursor.completedAt);
  return `completed_at.lt.${completedAt},and(completed_at.eq.${completedAt},id.lt.${cursor.id})`;
}
