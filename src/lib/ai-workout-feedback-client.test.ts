import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_WORKOUT_FEEDBACK_VERSION,
  acknowledgeAiWorkoutFeedbackEvent,
  parseAiWorkoutFeedbackEventRequest,
  parseAiWorkoutPreferenceRequest,
  saveAiWorkoutPreference,
} from "./ai-workout-feedback-client.ts";

const exerciseId = "00000000-0000-0000-0000-000000000001";
const replacementExerciseId = "00000000-0000-0000-0000-000000000002";
const proposalId = "00000000-0000-0000-0000-000000000099";

void test("accepts only exact versioned preference and feedback contracts", () => {
  assert.deepEqual(parseAiWorkoutPreferenceRequest({ version: 1, exerciseId, preference: "liked" }), {
    version: AI_WORKOUT_FEEDBACK_VERSION,
    exerciseId,
    preference: "liked",
  });
  assert.deepEqual(parseAiWorkoutPreferenceRequest({ version: 1, exerciseId, preference: null }), {
    version: AI_WORKOUT_FEEDBACK_VERSION,
    exerciseId,
    preference: null,
  });
  assert.equal(parseAiWorkoutPreferenceRequest({ version: 1, exerciseId, preference: "neutral" }), null);
  assert.equal(parseAiWorkoutPreferenceRequest({ version: 1, exerciseId, preference: "liked", owner: "nope" }), null);

  assert.deepEqual(parseAiWorkoutFeedbackEventRequest({ version: 1, proposalId, type: "exposure" }), {
    version: AI_WORKOUT_FEEDBACK_VERSION,
    proposalId,
    type: "exposure",
  });
  assert.deepEqual(parseAiWorkoutFeedbackEventRequest({ version: 1, proposalId, type: "remove", exerciseId }), {
    version: AI_WORKOUT_FEEDBACK_VERSION,
    proposalId,
    type: "remove",
    exerciseId,
  });
  assert.deepEqual(
    parseAiWorkoutFeedbackEventRequest({
      version: 1,
      proposalId,
      type: "swap",
      exerciseId,
      replacementExerciseId,
    }),
    { version: AI_WORKOUT_FEEDBACK_VERSION, proposalId, type: "swap", exerciseId, replacementExerciseId },
  );
  assert.equal(parseAiWorkoutFeedbackEventRequest({ version: 1, proposalId, type: "reroll" }), null);
  assert.equal(
    parseAiWorkoutFeedbackEventRequest({
      version: 1,
      proposalId,
      type: "swap",
      exerciseId,
      replacementExerciseId: exerciseId,
    }),
    null,
  );
});

void test("preference updates accept only an exact safe response and event acknowledgements stay non-blocking", async () => {
  const requests: { url: RequestInfo | URL; init?: RequestInit }[] = [];
  const requestFetch = (url: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url, init });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ preference: "dont_suggest" }) });
  };
  assert.equal(
    await saveAiWorkoutPreference({ version: 1, exerciseId, preference: "dont_suggest" }, requestFetch),
    "dont_suggest",
  );
  assert.equal(
    await acknowledgeAiWorkoutFeedbackEvent({ version: 1, proposalId, type: "exposure" }, requestFetch),
    true,
  );
  assert.deepEqual(
    requests.map(({ url }) => url),
    ["/api/workouts/ai/preferences", "/api/workouts/ai/events"],
  );
  assert.equal(
    await saveAiWorkoutPreference({ version: 1, exerciseId, preference: "liked" }, () =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ preference: "liked", extra: true }) }),
    ),
    undefined,
  );
});
