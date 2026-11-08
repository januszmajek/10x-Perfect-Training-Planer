import assert from "node:assert/strict";
import test from "node:test";
import { recommendHistoryAwareWorkout } from "./ai-workout-recommender.ts";
import type { CatalogueExercise } from "./manual-workout-builder.ts";

const NOW = new Date("2026-09-07T12:00:00.000Z");
const id = (number: number) => `00000000-0000-0000-0000-${String(number).padStart(12, "0")}`;
const exercise = (
  number: number,
  category: "upper_body" | "lower_body" | "core",
  pattern: "push" | "pull" | null = null,
): CatalogueExercise => ({
  id: id(number),
  name: `Exercise ${number}`,
  equipment: "barbell",
  movementPattern: pattern,
  muscles: [{ code: `muscle-${number}`, name: `Muscle ${number}`, category, role: "primary", recoveryHours: 48 }],
});
const catalogue = [
  exercise(1, "upper_body", "push"),
  exercise(2, "upper_body", "pull"),
  exercise(3, "lower_body"),
  exercise(4, "core"),
  exercise(5, "upper_body", "push"),
  exercise(6, "upper_body", "pull"),
];
const completion = (exerciseId: string, hoursAgo = 96, count = 1) => ({
  exerciseId,
  completedCount: count,
  lastCompletedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
  inLastCompletedWorkout: false,
});

void test("filters recovering and explicitly excluded exercises before every ranking decision", () => {
  const result = recommendHistoryAwareWorkout({
    catalogue,
    completions: [completion(id(1), 1), completion(id(2))],
    preferences: new Map([[id(2), "dont_suggest"]]),
    now: NOW,
  });
  assert.equal(
    result.readyCandidates.some((candidate) => candidate.id === id(1) || candidate.id === id(2)),
    false,
  );
  assert.deepEqual(result.decision, { kind: "reduced_confirmation_required", availableExerciseCount: 4 });
});

void test("treats exact recovery boundaries as ready and retains the latest recovery deadline", () => {
  const exact = recommendHistoryAwareWorkout({
    catalogue,
    completions: [completion(id(1), 48)],
    preferences: new Map(),
    now: NOW,
  });
  const latest = recommendHistoryAwareWorkout({
    catalogue,
    completions: [completion(id(1), 49), completion(id(1), 1)],
    preferences: new Map(),
    now: NOW,
  });
  assert.equal(
    exact.readyCandidates.some((candidate) => candidate.id === id(1)),
    true,
  );
  assert.equal(
    latest.readyCandidates.some((candidate) => candidate.id === id(1)),
    false,
  );
});

void test("likes boost only eligible familiar candidates and completion remains familiarity", () => {
  const result = recommendHistoryAwareWorkout({
    catalogue,
    completions: [completion(id(1), 96, 2), completion(id(2), 96, 2)],
    preferences: new Map([[id(2), "liked"]]),
    now: NOW,
  });
  assert.equal(result.readyCandidates[0].id, id(2));
  assert.deepEqual(result.readyCandidates.find((candidate) => candidate.id === id(1))?.reasons, ["familiar"]);
});

void test("keeps below-threshold unseen exercises out when enough preferred candidates remain", () => {
  const dissimilar = [
    exercise(1, "upper_body", "push"),
    exercise(2, "lower_body"),
    exercise(3, "core"),
    exercise(4, "lower_body"),
    exercise(5, "core"),
    exercise(6, "lower_body"),
  ];
  const result = recommendHistoryAwareWorkout({
    catalogue: dissimilar,
    completions: dissimilar.slice(0, 5).map(({ id: exerciseId }) => completion(exerciseId)),
    preferences: new Map(),
    now: NOW,
  });
  assert.equal(result.shortlist.filter((candidate) => candidate.reasons.includes("never_completed")).length, 0);
});

void test("reserves feasible coverage, uses unique candidates, and is deterministic for a seed", () => {
  const first = recommendHistoryAwareWorkout({
    catalogue,
    completions: [completion(id(1)), completion(id(2)), completion(id(3)), completion(id(4))],
    preferences: new Map(),
    now: NOW,
    seed: 7,
  });
  const second = recommendHistoryAwareWorkout({
    catalogue,
    completions: [completion(id(1)), completion(id(2)), completion(id(3)), completion(id(4))],
    preferences: new Map(),
    now: NOW,
    seed: 7,
  });
  assert.deepEqual(
    first.shortlist.map((candidate) => candidate.id),
    second.shortlist.map((candidate) => candidate.id),
  );
  assert.equal(new Set(first.shortlist.map((candidate) => candidate.id)).size, first.shortlist.length);
  assert.deepEqual(first.feasibleCoverage, ["lower_body", "core", "upper_body_push", "upper_body_pull"]);
});

void test("returns mutually exclusive candidate-count outcomes", () => {
  assert.equal(
    recommendHistoryAwareWorkout({
      catalogue: catalogue.slice(0, 5),
      completions: catalogue.slice(0, 5).map(({ id: exerciseId }) => completion(exerciseId)),
      preferences: new Map(),
      now: NOW,
    }).decision.kind,
    "normal",
  );
  assert.equal(
    recommendHistoryAwareWorkout({
      catalogue: catalogue.slice(0, 4),
      completions: catalogue.slice(0, 4).map(({ id: exerciseId }) => completion(exerciseId)),
      preferences: new Map(),
      now: NOW,
    }).decision.kind,
    "reduced_confirmation_required",
  );
  assert.equal(
    recommendHistoryAwareWorkout({
      catalogue: catalogue.slice(0, 2),
      completions: catalogue.slice(0, 2).map(({ id: exerciseId }) => completion(exerciseId)),
      preferences: new Map(),
      now: NOW,
    }).decision.kind,
    "insufficient_recovered_candidates",
  );
});

void test("uses hard eligibility for the decision and backfills a viable shortlist", () => {
  const result = recommendHistoryAwareWorkout({
    catalogue,
    completions: [completion(id(1)), completion(id(2))],
    preferences: new Map(),
    now: NOW,
  });

  assert.equal(result.readyCandidates.length, 6);
  assert.equal(result.shortlist.length, 5);
  assert.equal(
    result.shortlist.every(({ recovery }) => recovery.state === "ready"),
    true,
  );
  assert.deepEqual(result.decision, { kind: "normal", requestedExerciseCount: { min: 5, max: 7 } });
});

void test("offers the exact reduced count when only three hard-eligible exercises remain", () => {
  const result = recommendHistoryAwareWorkout({
    catalogue,
    completions: [completion(id(1), 1), completion(id(2), 1), completion(id(3), 1)],
    preferences: new Map(),
    now: NOW,
  });

  assert.equal(result.readyCandidates.length, 3);
  assert.equal(result.shortlist.length, 3);
  assert.deepEqual(result.decision, { kind: "reduced_confirmation_required", availableExerciseCount: 3 });
});

void test("without fixed-context inputs the recommendation is unchanged and reports account-wide counts", () => {
  const input = {
    catalogue,
    completions: [completion(id(1)), completion(id(2))],
    preferences: new Map(),
    now: NOW,
  };
  const legacy = recommendHistoryAwareWorkout(input);
  const explicit = recommendHistoryAwareWorkout({
    ...input,
    fixedExerciseIds: undefined,
    excludedExerciseIds: undefined,
  });
  assert.deepEqual(explicit, legacy);
  assert.deepEqual(legacy.fixedCoverage, []);
  assert.equal(legacy.accountReadyCount, legacy.readyCandidates.length);
  assert.equal(legacy.explorationBudget, 2);
  assert.deepEqual([...legacy.neverCompletedIds].sort(), [id(3), id(4), id(5), id(6)]);
});

void test("fixed exercises contribute coverage regardless of eligibility and never appear as candidates", () => {
  const result = recommendHistoryAwareWorkout({
    catalogue,
    completions: [completion(id(1), 1), completion(id(2)), completion(id(3)), completion(id(4))],
    preferences: new Map([[id(4), "dont_suggest"]]),
    now: NOW,
    fixedExerciseIds: [id(1), id(4)],
    excludedExerciseIds: [id(5)],
  });
  const emitted = [...result.shortlist, ...result.readyCandidates].map((candidate) => candidate.id);
  for (const removed of [id(1), id(4), id(5)]) assert.equal(emitted.includes(removed), false);
  assert.deepEqual(result.readyCandidates.map((candidate) => candidate.id).sort(), [id(2), id(3), id(6)]);
  assert.equal(result.accountReadyCount, 4);
  assert.deepEqual(result.fixedCoverage, ["core", "upper_body_push"]);
  assert.deepEqual(result.feasibleCoverage, ["lower_body", "core", "upper_body_push", "upper_body_pull"]);
});

void test("fixed context sizes the shortlist so one kept exercise can still take six new picks", () => {
  const pool = [
    exercise(100, "upper_body", "push"),
    exercise(1, "upper_body", "push"),
    exercise(2, "upper_body", "pull"),
    exercise(3, "lower_body"),
    exercise(4, "core"),
    exercise(5, "upper_body", "pull"),
    exercise(20, "lower_body"),
    exercise(21, "core"),
    exercise(22, "lower_body"),
    exercise(23, "core"),
  ];
  const completions = [100, 1, 2, 3, 4, 5].map((number) => completion(id(number)));
  const legacy = recommendHistoryAwareWorkout({
    catalogue: pool.slice(1),
    completions,
    preferences: new Map(),
    now: NOW,
  });
  const result = recommendHistoryAwareWorkout({
    catalogue: pool,
    completions,
    preferences: new Map(),
    now: NOW,
    fixedExerciseIds: [id(100)],
    excludedExerciseIds: [],
  });
  assert.equal(legacy.shortlist.length, 5);
  const poolCount = result.readyCandidates.length;
  assert.equal(poolCount, 9);
  assert.ok(result.shortlist.length >= Math.min(poolCount, 6));
  assert.equal(
    result.shortlist.some((candidate) => candidate.id === id(100)),
    false,
  );
  assert.ok(
    result.shortlist.filter((candidate) => candidate.reasons.includes("never_completed")).length <=
      result.explorationBudget,
  );
});

void test("kept never-completed exercises consume the exploration budget except for a sole coverage source", () => {
  const pool = [
    exercise(1, "upper_body", "push"),
    exercise(2, "lower_body"),
    exercise(30, "core"),
    exercise(31, "lower_body"),
    exercise(40, "lower_body"),
    exercise(41, "core"),
    exercise(42, "upper_body", "pull"),
    exercise(43, "upper_body", "push"),
  ];
  const result = recommendHistoryAwareWorkout({
    catalogue: pool,
    completions: [completion(id(1)), completion(id(2))],
    preferences: new Map(),
    now: NOW,
    fixedExerciseIds: [id(30), id(31)],
    excludedExerciseIds: [],
  });
  const unseen = result.shortlist.filter((candidate) => candidate.reasons.includes("never_completed"));
  assert.deepEqual(
    unseen.map((candidate) => candidate.id),
    [id(42)],
  );
  assert.equal(result.explorationBudget, 1);
  assert.deepEqual(result.fixedCoverage, ["lower_body", "core"]);
  assert.equal(
    result.shortlist.some((candidate) => candidate.id === id(1)),
    true,
  );
  assert.ok(result.neverCompletedIds.includes(id(42)));
});
