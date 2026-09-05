import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlannedWorkoutConflict } from "./planned-workout-conflict.ts";

const plan = {
  id: "00000000-0000-0000-0000-000000000001",
  revision: 2,
  origin: "manual" as const,
  createdAt: "2026-09-05T12:00:00.000Z",
  exercises: [{ exerciseId: "00000000-0000-0000-0000-000000000002", name: "Squat", position: 0, sets: 3, reps: 8 }],
};

void test("separates a first-save collision from a stale replacement using the refreshed plan", () => {
  assert.deepEqual(resolvePlannedWorkoutConflict("confirmation_required", plan), {
    kind: "first-save-collision",
    latestPlan: plan,
  });
  assert.deepEqual(resolvePlannedWorkoutConflict("stale_plan", plan), {
    kind: "stale-replacement",
    latestPlan: plan,
  });
});

void test("surfaces a disappeared latest plan instead of inventing overwrite tokens", () => {
  assert.deepEqual(resolvePlannedWorkoutConflict("stale_plan", null), { kind: "latest-plan-missing" });
});
