import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_WORKOUT_GENERATION_VERSION,
  MAX_REROLL_EXCLUSIONS,
  isFullReroll,
  parseAiWorkoutGenerationCommand,
  parseAiWorkoutGenerationResponse,
  rerollExcludedIds,
  rerollKeptItems,
  rerollMarkedIds,
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

function uuid(number: number): string {
  return `00000000-0000-0000-0000-${String(number).padStart(12, "0")}`;
}

const kept = (number: number, sets = 3, reps = 10) => ({ exerciseId: uuid(number), sets, reps });
const marked = (number: number) => ({ exerciseId: uuid(number), replace: true as const });

void test("parses partial re-roll commands with and without exclusions, preserving draft order", () => {
  const partial = {
    version: 1,
    priorProposalId: proposalId,
    reroll: { exercises: [kept(1, 4, 8), marked(2), kept(3), marked(4)] },
  };
  const parsed = parseAiWorkoutGenerationCommand(partial);
  assert.deepEqual(parsed, partial);
  assert.ok(parsed.reroll);
  assert.equal(Object.hasOwn(parsed.reroll, "excludedExerciseIds"), false);
  assert.deepEqual(rerollKeptItems(parsed.reroll), [kept(1, 4, 8), kept(3)]);
  assert.deepEqual(rerollMarkedIds(parsed.reroll), [uuid(2), uuid(4)]);
  assert.deepEqual(rerollExcludedIds(parsed.reroll), []);
  assert.equal(isFullReroll(parsed.reroll), false);

  const withExclusions = {
    version: 1,
    confirmationToken: "signed-token",
    reroll: { exercises: [kept(1), marked(2)], excludedExerciseIds: [uuid(10), uuid(11)] },
  };
  const parsedExclusions = parseAiWorkoutGenerationCommand(withExclusions);
  assert.deepEqual(parsedExclusions, withExclusions);
  assert.ok(parsedExclusions.reroll);
  assert.deepEqual(rerollExcludedIds(parsedExclusions.reroll), [uuid(10), uuid(11)]);
  assert.equal(Object.hasOwn(parsedExclusions, "priorProposalId"), false);

  const emptyExclusions = parseAiWorkoutGenerationCommand({
    version: 1,
    reroll: { exercises: [kept(1), marked(2)], excludedExerciseIds: [] },
  });
  assert.deepEqual(emptyExclusions?.reroll?.excludedExerciseIds, []);

  const maxExclusions = Array.from({ length: MAX_REROLL_EXCLUSIONS }, (_, index) => uuid(100 + index));
  assert.ok(
    parseAiWorkoutGenerationCommand({
      version: 1,
      reroll: { exercises: [kept(1), marked(2)], excludedExerciseIds: maxExclusions },
    }),
  );
});

void test("parses an all-marked re-roll as a full re-roll", () => {
  const command = {
    version: 1,
    priorProposalId: proposalId,
    reroll: { exercises: Array.from({ length: 8 }, (_, index) => marked(index + 1)) },
  };
  const parsed = parseAiWorkoutGenerationCommand(command);
  assert.deepEqual(parsed, command);
  assert.ok(parsed.reroll);
  assert.equal(isFullReroll(parsed.reroll), true);
  assert.deepEqual(rerollKeptItems(parsed.reroll), []);
});

void test("rejects every malformed re-roll command", () => {
  const sevenKept = [1, 2, 3, 4, 5, 6, 7].map((number) => kept(number));
  const cases: [string, unknown][] = [
    ["unknown reroll key", { exercises: [kept(1), marked(2)], extra: true }],
    ["unknown item key", { exercises: [{ ...kept(1), note: "x" }, marked(2)] }],
    ["unknown marked item key", { exercises: [kept(1), { ...marked(2), sets: 3 }] }],
    ["replace false", { exercises: [kept(1), { exerciseId: uuid(2), replace: false }] }],
    ["duplicate item id", { exercises: [kept(1), marked(1)] }],
    ["non-canonical id", { exercises: [kept(1), { exerciseId: "not-a-uuid", replace: true }] }],
    ["zero marked items", { exercises: [kept(1), kept(2)] }],
    ["no items", { exercises: [] }],
    ["21 items", { exercises: Array.from({ length: 21 }, (_, index) => marked(index + 1)) }],
    ["7 kept items", { exercises: [...sevenKept, marked(8)] }],
    ["sets too low", { exercises: [kept(1, 0, 10), marked(2)] }],
    ["reps too high", { exercises: [kept(1, 3, 1000), marked(2)] }],
    ["fractional sets", { exercises: [kept(1, 2.5, 10), marked(2)] }],
    ["string reps", { exercises: [{ exerciseId: uuid(1), sets: 3, reps: "10" }, marked(2)] }],
    ["excluded overlaps kept", { exercises: [kept(1), marked(2)], excludedExerciseIds: [uuid(1)] }],
    ["excluded overlaps marked", { exercises: [kept(1), marked(2)], excludedExerciseIds: [uuid(2)] }],
    ["duplicate exclusion", { exercises: [kept(1), marked(2)], excludedExerciseIds: [uuid(9), uuid(9)] }],
    ["non-canonical exclusion", { exercises: [kept(1), marked(2)], excludedExerciseIds: ["nope"] }],
    [
      "21 exclusions",
      {
        exercises: [kept(1), marked(2)],
        excludedExerciseIds: Array.from({ length: MAX_REROLL_EXCLUSIONS + 1 }, (_, index) => uuid(100 + index)),
      },
    ],
    ["exclusions on all-marked", { exercises: [marked(1), marked(2)], excludedExerciseIds: [uuid(9)] }],
    ["empty exclusions on all-marked", { exercises: [marked(1), marked(2)], excludedExerciseIds: [] }],
    ["exclusions not an array", { exercises: [kept(1), marked(2)], excludedExerciseIds: uuid(9) }],
    ["reroll not an object", [kept(1), marked(2)]],
  ];
  for (const [name, reroll] of cases) {
    assert.equal(parseAiWorkoutGenerationCommand({ version: 1, reroll }), null, name);
  }
  assert.equal(
    parseAiWorkoutGenerationCommand({ version: 1, reroll: { exercises: [kept(1), marked(2)] }, secret: "x" }),
    null,
  );
  assert.equal(parseAiWorkoutGenerationCommand({ version: 1, priorProposalId: "not-a-uuid" }), null);
  assert.equal(parseAiWorkoutGenerationCommand({ version: 1, confirmationToken: 7 }), null);
  assert.equal(parseAiWorkoutGenerationCommand({ version: 2, reroll: { exercises: [marked(1)] } }), null);
  assert.ok(
    parseAiWorkoutGenerationCommand({ version: 1, reroll: { exercises: [...sevenKept.slice(0, 6), marked(8)] } }),
  );
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
