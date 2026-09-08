import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAiWorkoutResponseSchema,
  parseAiWorkoutProposal,
  parseAiWorkoutProposalJson,
  parseHistoryAwareAiWorkoutProposal,
  type AiWorkoutProposal,
} from "./ai-workout-contract.ts";
import type { CatalogueExercise } from "./manual-workout-builder.ts";

const IDS = Array.from({ length: 8 }, (_, index) => `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`);

const catalogue: CatalogueExercise[] = [
  {
    id: IDS[0],
    name: "Bench Press",
    equipment: "barbell",
    movementPattern: "push",
    muscles: [{ code: "chest", name: "Chest", category: "upper_body", role: "primary", recoveryHours: 48 }],
  },
  {
    id: IDS[1],
    name: "Cable Row",
    equipment: "cable",
    movementPattern: "pull",
    muscles: [{ code: "lats", name: "Lats", category: "upper_body", role: "primary", recoveryHours: 72 }],
  },
  {
    id: IDS[2],
    name: "Squat",
    equipment: "barbell",
    movementPattern: null,
    muscles: [{ code: "quads", name: "Quads", category: "lower_body", role: "primary", recoveryHours: 72 }],
  },
  {
    id: IDS[3],
    name: "Plank",
    equipment: "bodyweight",
    movementPattern: null,
    muscles: [{ code: "core", name: "Core", category: "core", role: "primary", recoveryHours: 48 }],
  },
  {
    id: IDS[4],
    name: "Lunge",
    equipment: "dumbbell",
    movementPattern: null,
    muscles: [{ code: "glutes", name: "Glutes", category: "lower_body", role: "primary", recoveryHours: 72 }],
  },
  {
    id: IDS[5],
    name: "Push-Up",
    equipment: "bodyweight",
    movementPattern: "push",
    muscles: [{ code: "chest", name: "Chest", category: "upper_body", role: "primary", recoveryHours: 48 }],
  },
  {
    id: IDS[6],
    name: "Pull-Up",
    equipment: "bodyweight",
    movementPattern: "pull",
    muscles: [{ code: "upper_back", name: "Upper Back", category: "upper_body", role: "primary", recoveryHours: 72 }],
  },
];

function proposal(exerciseIds = IDS.slice(0, 5)): AiWorkoutProposal {
  return { exercises: exerciseIds.map((exerciseId) => ({ exerciseId, sets: 3, reps: 10 })) };
}

void test("accepts a balanced 5-7 exercise proposal from the canonical catalogue", () => {
  assert.deepEqual(parseAiWorkoutProposal(proposal(), catalogue), { ok: true, data: proposal() });
  assert.equal(parseAiWorkoutProposal(proposal(IDS.slice(0, 7)), catalogue).ok, true);
});

void test("rejects malformed JSON, unknown IDs, duplicates, extra fields, and invalid prescriptions", () => {
  assert.deepEqual(parseAiWorkoutProposalJson("not-json", catalogue), { ok: false, code: "malformed_json" });
  assert.equal(
    parseAiWorkoutProposal(
      { exercises: [{ exerciseId: IDS[7], sets: 3, reps: 10 }, ...proposal().exercises.slice(1)] },
      catalogue,
    ).ok,
    false,
  );
  assert.equal(parseAiWorkoutProposal(proposal([IDS[0], IDS[0], ...IDS.slice(2, 5)]), catalogue).ok, false);
  assert.equal(parseAiWorkoutProposal({ ...proposal(), unexpected: true }, catalogue).ok, false);
  assert.equal(
    parseAiWorkoutProposal(
      { exercises: proposal().exercises.map((item, index) => (index === 0 ? { ...item, sets: 1.5 } : item)) },
      catalogue,
    ).ok,
    false,
  );
});

void test("rejects proposals that omit a required full-body coverage category", () => {
  assert.equal(parseAiWorkoutProposal(proposal([IDS[0], IDS[1], IDS[2], IDS[4], IDS[5]]), catalogue).ok, false);
  assert.equal(parseAiWorkoutProposal(proposal([IDS[0], IDS[2], IDS[3], IDS[4], IDS[5]]), catalogue).ok, false);
  assert.equal(parseAiWorkoutProposal(proposal([IDS[0], IDS[1], IDS[3], IDS[5], IDS[6]]), catalogue).ok, false);
});

void test("builds a provider schema constrained to the vetted IDs and requested size", () => {
  const schema = buildAiWorkoutResponseSchema(IDS.slice(0, 4), { min: 3, max: 4 });

  assert.equal(schema.properties.exercises.minItems, 3);
  assert.equal(schema.properties.exercises.maxItems, 4);
  assert.deepEqual(schema.properties.exercises.items.properties.exerciseId.enum, IDS.slice(0, 4));
});

void test("history-aware validation rejects extra provider fields", () => {
  const input = {
    exercises: proposal(IDS.slice(0, 4)).exercises.map((item, index) =>
      index === 0 ? { ...item, explanation: "extra" } : item,
    ),
  };

  assert.deepEqual(
    parseHistoryAwareAiWorkoutProposal(input, {
      shortlist: catalogue.slice(0, 4),
      feasibleCoverage: ["lower_body", "core", "upper_body_push", "upper_body_pull"],
      requestedExerciseCount: { min: 3, max: 3 },
    }),
    { ok: false, code: "invalid_proposal" },
  );
});
