import assert from "node:assert/strict";
import test from "node:test";
import {
  buildColdStartWorkoutPrompt,
  buildHistoryAwareWorkoutPrompt,
  buildPartialRerollPrompt,
  MAX_AI_CATALOGUE_CONTEXT_BYTES,
} from "./ai-workout-prompt.ts";
import type { CatalogueExercise } from "./manual-workout-builder.ts";
import type { HistoryAwareRecommendation } from "./ai-workout-recommender.ts";

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

void test("builds deterministic, recovery-safe history-aware prompts without private history", () => {
  const recommendation: Pick<HistoryAwareRecommendation, "shortlist" | "feasibleCoverage"> = {
    shortlist: catalogue.map((exercise) => ({
      ...exercise,
      reasons: ["familiar"],
      familiarityScore: 1,
      similarityScore: 0,
      recovery: { state: "ready" as const, recoveringUntil: null },
    })),
    feasibleCoverage: ["upper_body_pull", "upper_body_push"],
  };
  const first = buildHistoryAwareWorkoutPrompt(recommendation, { min: 3, max: 3 });
  const second = buildHistoryAwareWorkoutPrompt(
    {
      ...recommendation,
      shortlist: [...recommendation.shortlist].reverse(),
      feasibleCoverage: [...recommendation.feasibleCoverage].reverse(),
    },
    { min: 3, max: 3 },
  );
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.match(first.data.user, /"eligibility":"recovery_compatible"/);
  assert.doesNotMatch(`${first.data.system}\n${first.data.user}`, /timestamp|user id|credential|proposal/i);
});

const extra: CatalogueExercise[] = [
  {
    id: "00000000-0000-0000-0000-000000000003",
    name: "Back Squat",
    equipment: "barbell",
    movementPattern: null,
    muscles: [
      { code: "quads", name: "Quads", category: "lower_body", role: "primary", recoveryHours: 48 },
      { code: "glutes", name: "Glutes", category: "lower_body", role: "secondary", recoveryHours: 48 },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    name: "Plank",
    equipment: "bodyweight",
    movementPattern: null,
    muscles: [{ code: "abs", name: "Abs", category: "core", role: "primary", recoveryHours: 24 }],
  },
];

void test("builds deterministic partial re-roll prompts with kept exercises as fixed context", () => {
  const input = {
    mode: "cold_start" as const,
    kept: [catalogue[0], extra[0]],
    candidates: [catalogue[1], extra[1]],
    missingCoverage: ["upper_body_pull", "core"] as const,
    requiredCoverage: ["upper_body_push", "lower_body", "upper_body_pull", "core"] as const,
    newCount: { min: 2, max: 3 },
  };
  const first = buildPartialRerollPrompt(input);
  const second = buildPartialRerollPrompt({
    ...input,
    kept: [...input.kept].reverse(),
    candidates: [...input.candidates].reverse(),
    missingCoverage: [...input.missingCoverage].reverse(),
    requiredCoverage: [...input.requiredCoverage].reverse(),
  });
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.match(first.data.system, /fixed exercises stay in the workout and must not be returned/);
  assert.match(first.data.system, /Return 2 to 3 unique exercises chosen only from the supplied candidates/);
  assert.match(first.data.system, /core, lower_body, upper_body_pull, upper_body_push/);
  const payload = JSON.parse(first.data.user.slice(first.data.user.indexOf("{"))) as {
    fixed: { id: string }[];
    candidates: { id: string }[];
    missingCoverage: string[];
    requestedExerciseCount: { min: number; max: number };
  };
  assert.deepEqual(Object.keys(payload).sort(), ["candidates", "fixed", "missingCoverage", "requestedExerciseCount"]);
  assert.deepEqual(
    payload.fixed.map(({ id }) => id),
    [catalogue[0].id, extra[0].id],
  );
  assert.deepEqual(
    payload.candidates.map(({ id }) => id),
    [catalogue[1].id, extra[1].id],
  );
  assert.deepEqual(payload.missingCoverage, ["core", "upper_body_pull"]);
  assert.deepEqual(payload.requestedExerciseCount, { min: 2, max: 3 });
  assert.doesNotMatch(first.data.user, /recoveryHours/);
});

void test("partial re-roll prompts carry only the supplied fixed and candidate exercises, never private history data", () => {
  const markedId = "00000000-0000-0000-0000-000000000099";
  const result = buildPartialRerollPrompt({
    mode: "history_aware",
    kept: [catalogue[0]],
    candidates: [catalogue[1], ...extra].map((exercise) => ({
      ...exercise,
      reasons: ["never_completed" as const, "familiar" as const],
      familiarityScore: 4.25,
      similarityScore: 0.75,
      recovery: { state: "ready" as const, recoveringUntil: null },
    })),
    missingCoverage: ["upper_body_pull"],
    requiredCoverage: ["upper_body_pull", "upper_body_push"],
    newCount: { min: 1, max: 1 },
  });
  assert.equal(result.ok, true);
  const text = `${result.data.system}\n${result.data.user}`;
  assert.doesNotMatch(text, new RegExp(markedId));
  assert.doesNotMatch(text, /timestamp|user id|credential|proposal|token|familiarityScore|similarityScore|4\.25/i);
  assert.match(result.data.user, /"eligibility":"recovery_compatible"/);
  assert.match(result.data.user, /"reasons":\["familiar","never_completed"\]/);
});

void test("rejects oversized partial re-roll context without truncating it", () => {
  assert.deepEqual(
    buildPartialRerollPrompt({
      mode: "cold_start",
      kept: [{ ...catalogue[0], name: "x".repeat(MAX_AI_CATALOGUE_CONTEXT_BYTES) }],
      candidates: [catalogue[1]],
      missingCoverage: [],
      requiredCoverage: [],
      newCount: { min: 1, max: 1 },
    }),
    { ok: false, code: "catalogue_context_too_large" },
  );
});
