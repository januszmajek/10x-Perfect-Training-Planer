import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_WORKOUT_GENERATION_VERSION,
  parseAiWorkoutGenerationCommand,
  parseAiWorkoutGenerationResponse,
} from "./ai-workout-client.ts";

const exercises = [1, 2, 3, 4, 5].map((number) => ({
  exerciseId: `00000000-0000-0000-0000-${String(number).padStart(12, "0")}`,
  sets: 3,
  reps: 10,
}));
const proposalId = "00000000-0000-0000-0000-000000000099";

void test("accepts only the four exact versioned generation commands", () => {
  assert.deepEqual(parseAiWorkoutGenerationCommand({ version: AI_WORKOUT_GENERATION_VERSION }), { version: 1 });
  assert.deepEqual(parseAiWorkoutGenerationCommand({ version: 1, priorProposalId: proposalId }), {
    version: 1,
    priorProposalId: proposalId,
  });
  assert.deepEqual(parseAiWorkoutGenerationCommand({ version: 1, confirmationToken: "signed-token" }), {
    version: 1,
    confirmationToken: "signed-token",
  });
  assert.deepEqual(
    parseAiWorkoutGenerationCommand({ version: 1, confirmationToken: "signed-token", priorProposalId: proposalId }),
    { version: 1, confirmationToken: "signed-token", priorProposalId: proposalId },
  );
  assert.equal(parseAiWorkoutGenerationCommand({ version: 1, model: "not-allowed" }), null);
  assert.equal(parseAiWorkoutGenerationCommand({ version: 1, confirmationToken: "", requestedCount: 3 }), null);
  assert.equal(parseAiWorkoutGenerationCommand({}), null);
});

void test("parses exact safe generation success and failure responses", () => {
  const success = {
    proposal: { exercises },
    metadata: { kind: "cold_start", exerciseCount: exercises.length },
    requestId: "request-1",
  };
  assert.deepEqual(parseAiWorkoutGenerationResponse(success), { ok: true, data: success });
  assert.deepEqual(parseAiWorkoutGenerationResponse({ code: "rate_limited", requestId: "request-2" }), {
    ok: false,
    code: "rate_limited",
    requestId: "request-2",
  });
  assert.deepEqual(parseAiWorkoutGenerationResponse({ code: "confirmation_required", requestId: "request-3" }), {
    ok: false,
    code: "confirmation_required",
    requestId: "request-3",
  });
  assert.deepEqual(parseAiWorkoutGenerationResponse({ code: "stale_plan", requestId: "request-4" }), {
    ok: false,
    code: "stale_plan",
    requestId: "request-4",
  });
});

void test("parses history-aware metadata only when it matches the displayed proposal", () => {
  const metadata = {
    kind: "history_aware",
    proposalId,
    exerciseCount: exercises.length,
    reduced: false,
    originalExerciseIds: exercises.map(({ exerciseId }) => exerciseId),
    preferences: Object.fromEntries(exercises.map(({ exerciseId }) => [exerciseId, "neutral"])),
  } as const;
  assert.equal(
    parseAiWorkoutGenerationResponse({ proposal: { exercises }, metadata, requestId: "request-history" })?.ok,
    true,
  );
  assert.equal(
    parseAiWorkoutGenerationResponse({
      proposal: { exercises },
      metadata: { ...metadata, originalExerciseIds: [...metadata.originalExerciseIds.slice(1), proposalId] },
      requestId: "request-history",
    }),
    null,
  );
});

void test("rejects malformed, unknown, and inconsistent browser response payloads", () => {
  assert.equal(parseAiWorkoutGenerationResponse(null), null);
  assert.equal(parseAiWorkoutGenerationResponse("not-json"), null);
  assert.equal(parseAiWorkoutGenerationResponse({ code: "provider-secret", requestId: "request-1" }), null);
  assert.equal(
    parseAiWorkoutGenerationResponse({
      proposal: { exercises },
      metadata: { kind: "cold_start", exerciseCount: 7 },
      requestId: "request-1",
    }),
    null,
  );
  assert.equal(
    parseAiWorkoutGenerationResponse({
      proposal: { exercises: [...exercises, exercises[0]] },
      metadata: { kind: "cold_start", exerciseCount: 6 },
      requestId: "request-1",
    }),
    null,
  );
  assert.deepEqual(parseAiWorkoutGenerationResponse({ code: "provider_unavailable", requestId: "request-5" }), {
    ok: false,
    code: "provider_unavailable",
    requestId: "request-5",
  });
});
