import assert from "node:assert/strict";
import test from "node:test";
import {
  nextRecoveryOrder,
  orderRecoveryAwareCatalogue,
  projectRecoveryAwareCatalogue,
  type CompletedRecoveryWorkout,
} from "./recovery-aware-catalogue.ts";
import type { CatalogueExercise } from "./manual-workout-builder.ts";

const NOW = new Date("2026-09-04T12:00:00.000Z");

const catalogue: CatalogueExercise[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Bench Press",
    equipment: "barbell",
    muscles: [
      { code: "chest", name: "Chest", role: "primary", recoveryHours: 48 },
      { code: "triceps", name: "Triceps", role: "secondary", recoveryHours: 48 },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Triceps Extension",
    equipment: "cable",
    muscles: [{ code: "triceps", name: "Triceps", role: "primary", recoveryHours: 48 }],
  },
];

function completed(hoursAgo: number, exercises: CompletedRecoveryWorkout["exercises"]): CompletedRecoveryWorkout {
  return { completedAt: new Date(NOW.getTime() - hoursAgo * 60 * 60 * 1000).toISOString(), exercises };
}

void test("returns ready catalogue entries when no completed history exists", () => {
  assert.deepEqual(
    projectRecoveryAwareCatalogue(catalogue, [], NOW).map(({ recovery }) => recovery.state),
    ["ready", "ready"],
  );
});

void test("uses unexpired primary work to mark matching primary catalogue targets as recovering", () => {
  const result = projectRecoveryAwareCatalogue(
    catalogue,
    [completed(24, [{ sets: 3, muscles: [catalogue[0].muscles[0]] }])],
    NOW,
  );

  assert.equal(result[0].recovery.state, "recovering");
  assert.equal(result[0].recovery.recoveringMuscles[0].name, "Chest");
  assert.equal(result[0].recovery.recoveringMuscles[0].remainingMilliseconds, 24 * 60 * 60 * 1000);
  assert.equal(result[1].recovery.state, "ready");
});

void test("treats the exact primary recovery deadline as ready", () => {
  const result = projectRecoveryAwareCatalogue(
    catalogue,
    [completed(48, [{ sets: 3, muscles: [catalogue[0].muscles[0]] }])],
    NOW,
  );

  assert.equal(result[0].recovery.state, "ready");
});

void test("keeps the latest deadline across repeated primary work", () => {
  const result = projectRecoveryAwareCatalogue(
    catalogue,
    [
      completed(47, [{ sets: 3, muscles: [catalogue[0].muscles[0]] }]),
      completed(1, [{ sets: 3, muscles: [catalogue[0].muscles[0]] }]),
    ],
    NOW,
  );

  assert.equal(result[0].recovery.recoveringMuscles[0].remainingMilliseconds, 47 * 60 * 60 * 1000);
});

void test("retains secondary-only fractional workload without blocking readiness", () => {
  const result = projectRecoveryAwareCatalogue(
    catalogue,
    [completed(1, [{ sets: 4, muscles: [catalogue[0].muscles[1]] }])],
    NOW,
  );

  assert.equal(result[1].recovery.state, "ready");
  assert.deepEqual(result[0].recovery.secondaryWorkload, [{ code: "triceps", name: "Triceps", fractionalSets: 2 }]);
});

void test("cycles and stably orders mixed recovery results without removing either state", () => {
  const result = projectRecoveryAwareCatalogue(
    catalogue,
    [completed(24, [{ sets: 3, muscles: [catalogue[0].muscles[0]] }])],
    NOW,
  );

  assert.equal(nextRecoveryOrder("not-sorted"), "ready-first");
  assert.equal(nextRecoveryOrder("ready-first"), "recovering-first");
  assert.equal(nextRecoveryOrder("recovering-first"), "not-sorted");
  assert.deepEqual(
    orderRecoveryAwareCatalogue(result, "not-sorted").map(({ name }) => name),
    ["Bench Press", "Triceps Extension"],
  );
  assert.deepEqual(
    orderRecoveryAwareCatalogue(result, "ready-first").map(({ name }) => name),
    ["Triceps Extension", "Bench Press"],
  );
  assert.deepEqual(
    orderRecoveryAwareCatalogue(result, "recovering-first").map(({ name }) => name),
    ["Bench Press", "Triceps Extension"],
  );
});
