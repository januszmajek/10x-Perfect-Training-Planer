import assert from "node:assert/strict";
import test from "node:test";
import {
  PLANNED_WORKOUT_API_PATH,
  classifyCompletionReconciliation,
  parseCompletionReconciliationResponse,
  parseCurrentPlanResponse,
} from "./planned-workout-client.ts";

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

void test("parses and classifies authoritative completion reconciliation responses", () => {
  const completed = parseCompletionReconciliationResponse({ currentPlan: null, expectedWorkoutState: "completed" });
  const unchanged = parseCompletionReconciliationResponse({ currentPlan: plan, expectedWorkoutState: "planned" });
  const changedPlan = { ...plan, id: "00000000-0000-0000-0000-000000000003", revision: 2 };
  const changed = parseCompletionReconciliationResponse({ currentPlan: changedPlan, expectedWorkoutState: "absent" });

  assert.ok(completed);
  assert.ok(unchanged);
  assert.ok(changed);
  assert.equal(classifyCompletionReconciliation(completed, plan.id, plan.revision), "completed");
  assert.equal(classifyCompletionReconciliation(unchanged, plan.id, plan.revision), "unchanged");
  assert.equal(classifyCompletionReconciliation(changed, plan.id, plan.revision), "changed");
});

void test("keeps absent, malformed, and inconsistent reconciliation responses indeterminate", () => {
  const absent = parseCompletionReconciliationResponse({ currentPlan: null, expectedWorkoutState: "absent" });
  const inconsistent = parseCompletionReconciliationResponse({ currentPlan: null, expectedWorkoutState: "planned" });

  assert.ok(absent);
  assert.ok(inconsistent);
  assert.equal(classifyCompletionReconciliation(absent, plan.id, plan.revision), "indeterminate");
  assert.equal(classifyCompletionReconciliation(inconsistent, plan.id, plan.revision), "indeterminate");
  assert.equal(
    parseCompletionReconciliationResponse({ currentPlan: plan, expectedWorkoutState: "unknown" }),
    undefined,
  );
  assert.equal(parseCompletionReconciliationResponse({ expectedWorkoutState: "completed" }), undefined);
});
