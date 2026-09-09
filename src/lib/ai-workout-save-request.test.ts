import assert from "node:assert/strict";
import test from "node:test";
import { parseAiWorkoutSaveRequest } from "./ai-workout-save-request.ts";

const EXERCISE_ID = "00000000-0000-0000-0000-000000000001";
const PROPOSAL_ID = "00000000-0000-0000-0000-000000000002";

function request(proposalId: string | null = null) {
  return {
    version: 1,
    replaceExisting: false,
    expectedWorkoutId: null,
    expectedRevision: null,
    proposalId,
    exercises: [{ exerciseId: EXERCISE_ID, sets: 3, reps: 10 }],
  };
}

void test("parses exact legacy and history-aware AI save requests", () => {
  assert.deepEqual(parseAiWorkoutSaveRequest(request(null)), { valid: true, value: request(null) });
  assert.deepEqual(parseAiWorkoutSaveRequest(request(PROPOSAL_ID)), { valid: true, value: request(PROPOSAL_ID) });
});

void test("rejects omitted, malformed, and extra proposal fields without widening manual saves", () => {
  const { proposalId: _proposalId, ...missingProposal } = request();
  assert.deepEqual(parseAiWorkoutSaveRequest(missingProposal), { valid: false });
  assert.deepEqual(parseAiWorkoutSaveRequest(request("not-a-uuid")), { valid: false });
  assert.deepEqual(parseAiWorkoutSaveRequest({ ...request(), lineageId: PROPOSAL_ID }), { valid: false });
});

void test("retains the manual save replacement invariants", () => {
  assert.deepEqual(parseAiWorkoutSaveRequest({ ...request(), replaceExisting: true }), { valid: false });
  assert.equal(
    parseAiWorkoutSaveRequest({
      ...request(PROPOSAL_ID),
      replaceExisting: true,
      expectedWorkoutId: EXERCISE_ID,
      expectedRevision: 2,
    }).valid,
    true,
  );
});
