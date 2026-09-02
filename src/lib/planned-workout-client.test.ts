import assert from "node:assert/strict";
import test from "node:test";
import { PLANNED_WORKOUT_API_PATH, parseCurrentPlanResponse } from "./planned-workout-client.ts";

const plan = {
  id: "00000000-0000-0000-0000-000000000001",
  revision: 1,
  origin: "manual",
  createdAt: "2026-09-02T12:00:00.000Z",
  exercises: [{ exerciseId: "00000000-0000-0000-0000-000000000002", name: "Squat", position: 0, sets: 3, reps: 10 }],
};

void test("uses the origin-neutral planned endpoint and accepts a revision-aware current-plan response", () => {
  assert.equal(PLANNED_WORKOUT_API_PATH, "/api/workouts/planned");
  assert.deepEqual(parseCurrentPlanResponse({ currentPlan: plan }), plan);
  assert.equal(parseCurrentPlanResponse({ currentPlan: null }), null);
});

void test("rejects current-plan refresh responses without a valid positive revision", () => {
  assert.equal(parseCurrentPlanResponse({ currentPlan: { ...plan, revision: 0 } }), undefined);
  const { revision: _revision, ...withoutRevision } = plan;
  assert.equal(parseCurrentPlanResponse({ currentPlan: withoutRevision }), undefined);
});
