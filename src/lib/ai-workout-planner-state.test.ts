import assert from "node:assert/strict";
import test from "node:test";
import { applyAiGenerationResponse, getAiPlannerRecoveryAction } from "./ai-workout-planner-state.ts";

const existingDraft = [
  { exerciseId: "00000000-0000-0000-0000-000000000001", sets: 4, reps: 6 },
  { exerciseId: "00000000-0000-0000-0000-000000000002", sets: 3, reps: 10 },
];
const replacementDraft = Array.from({ length: 5 }, (_, index) => ({
  exerciseId: `00000000-0000-0000-0000-${String(index + 3).padStart(12, "0")}`,
  sets: 3,
  reps: 8,
}));

void test("keeps the current proposal and its edits after a failed generation", () => {
  assert.deepEqual(applyAiGenerationResponse(existingDraft, { ok: false, code: "timeout", requestId: "request-1" }), {
    draft: existingDraft,
    code: "timeout",
    requestId: "request-1",
  });
});

void test("replaces a proposal only after a validated generation response", () => {
  assert.deepEqual(
    applyAiGenerationResponse(existingDraft, {
      ok: true,
      data: {
        proposal: { exercises: replacementDraft },
        metadata: { kind: "cold_start", exerciseCount: replacementDraft.length },
        requestId: "request-2",
      },
    }),
    { draft: replacementDraft, code: null, requestId: "request-2" },
  );
});

void test("maps typed failures to safe recovery actions", () => {
  assert.equal(getAiPlannerRecoveryAction("key_not_configured"), "account");
  assert.equal(getAiPlannerRecoveryAction("key_rejected"), "account");
  assert.equal(getAiPlannerRecoveryAction("key_encryption_unavailable"), "none");
  assert.equal(getAiPlannerRecoveryAction("rate_limited"), "retry");
  assert.equal(getAiPlannerRecoveryAction("history_aware_not_available"), "manual");
});
