import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHistoryMembershipSelect,
  buildWorkoutHistoryCursorPredicate,
  historyMembershipFilters,
} from "./workout-history-query.ts";

void test("quotes ISO timestamps in PostgREST cursor continuation predicates", () => {
  assert.equal(
    buildWorkoutHistoryCursorPredicate({
      completedAt: "2026-09-03T08:15:30.000Z",
      id: "00000000-0000-0000-0000-000000000001",
    }),
    'completed_at.lt."2026-09-03T08:15:30.000Z",and(completed_at.eq."2026-09-03T08:15:30.000Z",id.lt.00000000-0000-0000-0000-000000000001)',
  );
});

void test("builds one required inner membership path per selected muscle", () => {
  assert.equal(buildHistoryMembershipSelect([]), "id,completed_at");
  assert.deepEqual(historyMembershipFilters(["chest", "triceps"]), [
    { alias: "muscle_match_0", code: "chest" },
    { alias: "muscle_match_1", code: "triceps" },
  ]);
  assert.equal(
    buildHistoryMembershipSelect(["chest", "triceps"]),
    "id,completed_at,muscle_match_0:workout_exercises!inner(exercises!inner(exercise_muscle_groups!inner(muscle_group_code))),muscle_match_1:workout_exercises!inner(exercises!inner(exercise_muscle_groups!inner(muscle_group_code)))",
  );
});
