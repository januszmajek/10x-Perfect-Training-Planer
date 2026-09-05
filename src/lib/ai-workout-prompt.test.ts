import assert from "node:assert/strict";
import test from "node:test";
import { buildColdStartWorkoutPrompt, MAX_AI_CATALOGUE_CONTEXT_BYTES } from "./ai-workout-prompt.ts";
import type { CatalogueExercise } from "./manual-workout-builder.ts";

const catalogue: CatalogueExercise[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Bench Press",
    equipment: "barbell",
    movementPattern: "push",
    muscles: [{ code: "chest", name: "Chest", category: "upper_body", role: "primary", recoveryHours: 48 }],
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Cable Row",
    equipment: "cable",
    movementPattern: "pull",
    muscles: [{ code: "lats", name: "Lats", category: "upper_body", role: "primary", recoveryHours: 72 }],
  },
];

void test("builds deterministic catalogue-only prompts with the balanced-starter instructions", () => {
  const first = buildColdStartWorkoutPrompt([...catalogue].reverse());
  const second = buildColdStartWorkoutPrompt(catalogue);
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);

  assert.match(first.data.system, /5 to 7 unique exercises/);
  assert.match(first.data.user, /Bench Press/);
  assert.match(first.data.user, /"movementPattern":"push"/);
  assert.match(first.data.user, /"category":"upper_body"/);
  assert.doesNotMatch(`${first.data.system}\n${first.data.user}`, /user id|credential|history|timestamp/i);
});

void test("rejects oversized catalogue context without truncating it", () => {
  const oversized: CatalogueExercise[] = [
    {
      ...catalogue[0],
      name: "x".repeat(MAX_AI_CATALOGUE_CONTEXT_BYTES),
    },
  ];
  assert.deepEqual(buildColdStartWorkoutPrompt(oversized), { ok: false, code: "catalogue_context_too_large" });
});
