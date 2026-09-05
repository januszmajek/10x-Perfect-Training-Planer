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

void test("accepts only the versioned empty generation command", () => {
  assert.deepEqual(parseAiWorkoutGenerationCommand({ version: AI_WORKOUT_GENERATION_VERSION }), { version: 1 });
  assert.equal(parseAiWorkoutGenerationCommand({ version: 1, model: "not-allowed" }), null);
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
});

void test("rejects malformed, unknown, and inconsistent browser response payloads", () => {
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
});
