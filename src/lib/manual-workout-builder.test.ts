import assert from "node:assert/strict";
import test from "node:test";
import {
  addDraftItem,
  createDraftItem,
  filterCatalogue,
  MAX_REPS,
  MAX_SETS,
  MAX_WORKOUT_EXERCISES,
  moveDraftItem,
  parseManualWorkoutRequest,
  removeDraftItem,
  validateDraftItems,
  type CatalogueExercise,
  type ManualWorkoutDraftItem,
} from "./manual-workout-builder.ts";

const IDS = Array.from(
  { length: MAX_WORKOUT_EXERCISES + 1 },
  (_, index) => `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
);

const catalogue: CatalogueExercise[] = [
  {
    id: IDS[0],
    name: "Barbell Bench Press",
    equipment: "barbell",
    muscles: [
      { code: "chest", name: "Chest", role: "primary" },
      { code: "triceps", name: "Triceps", role: "secondary" },
    ],
  },
  {
    id: IDS[1],
    name: "Cable Row",
    equipment: "cable",
    muscles: [
      { code: "upper_back", name: "Upper Back", role: "primary" },
      { code: "biceps", name: "Biceps", role: "secondary" },
    ],
  },
  {
    id: IDS[2],
    name: "Bodyweight Squat",
    equipment: "bodyweight",
    muscles: [{ code: "quads", name: "Quads", role: "primary" }],
  },
];

function request(exercises: ManualWorkoutDraftItem[] = [createDraftItem(IDS[0])]) {
  return { version: 1, replaceExisting: false, expectedWorkoutId: null, exercises };
}

void test("filters by case-insensitive trimmed name and returns an empty result", () => {
  assert.deepEqual(
    filterCatalogue(catalogue, { search: "  BENCH ", muscleGroups: [], equipment: [] }).map(({ name }) => name),
    ["Barbell Bench Press"],
  );
  assert.deepEqual(filterCatalogue(catalogue, { search: "missing", muscleGroups: [], equipment: [] }), []);
});

void test("uses OR within categories, AND across categories, and includes secondary muscles", () => {
  const filtered = filterCatalogue(catalogue, {
    search: "",
    muscleGroups: ["triceps", "biceps"],
    equipment: ["barbell", "bodyweight"],
  });

  assert.deepEqual(
    filtered.map(({ name }) => name),
    ["Barbell Bench Press"],
  );
});

void test("creates 3 x 10 items, prevents duplicates, and removes by exercise ID", () => {
  const first = addDraftItem([], IDS[0]);
  assert.deepEqual(first, [{ exerciseId: IDS[0], sets: 3, reps: 10 }]);
  assert.deepEqual(addDraftItem(first, IDS[0]), first);
  assert.deepEqual(removeDraftItem(first, IDS[0]), []);
});

void test("moves items stably and leaves first/last boundary moves unchanged", () => {
  const draft = IDS.slice(0, 3).map(createDraftItem);
  assert.deepEqual(moveDraftItem(draft, 0, "up"), draft);
  assert.deepEqual(moveDraftItem(draft, 2, "down"), draft);
  assert.deepEqual(
    moveDraftItem(draft, 1, "up").map(({ exerciseId }) => exerciseId),
    [IDS[1], IDS[0], IDS[2]],
  );
  assert.deepEqual(
    moveDraftItem(draft, 1, "down").map(({ exerciseId }) => exerciseId),
    [IDS[0], IDS[2], IDS[1]],
  );
});

void test("validates known, unique draft exercises and numeric bounds", () => {
  const knownIds = new Set(IDS.slice(0, 2));
  assert.equal(validateDraftItems([createDraftItem(IDS[0])], knownIds), true);
  assert.equal(validateDraftItems([], knownIds), false);
  assert.equal(validateDraftItems([createDraftItem(IDS[2])], knownIds), false);
  assert.equal(validateDraftItems([createDraftItem(IDS[0]), createDraftItem(IDS[0])], knownIds), false);
  assert.equal(validateDraftItems([{ exerciseId: IDS[0], sets: 1.5, reps: 10 }], knownIds), false);
  assert.equal(validateDraftItems([{ exerciseId: IDS[0], sets: Number.MAX_SAFE_INTEGER + 1, reps: 10 }]), false);
  assert.equal(validateDraftItems([{ exerciseId: IDS[0], sets: 0, reps: 10 }]), false);
  assert.equal(validateDraftItems([{ exerciseId: IDS[0], sets: MAX_SETS + 1, reps: 10 }]), false);
  assert.equal(validateDraftItems([{ exerciseId: IDS[0], sets: 3, reps: 0 }]), false);
  assert.equal(validateDraftItems([{ exerciseId: IDS[0], sets: 3, reps: MAX_REPS + 1 }]), false);
});

void test("accepts the exact version-1 request schema and 20-item boundary", () => {
  assert.equal(parseManualWorkoutRequest(request()).valid, true);
  assert.equal(
    parseManualWorkoutRequest({
      version: 1,
      replaceExisting: true,
      expectedWorkoutId: IDS[20],
      exercises: IDS.slice(0, MAX_WORKOUT_EXERCISES).map(createDraftItem),
    }).valid,
    true,
  );
});

void test("rejects unknown keys, invalid replacement state, UUIDs, duplicates, and too many items", () => {
  assert.equal(parseManualWorkoutRequest({ ...request(), extra: true }).valid, false);
  assert.equal(
    parseManualWorkoutRequest({ ...request(), exercises: [{ ...createDraftItem(IDS[0]), extra: true }] }).valid,
    false,
  );
  assert.equal(parseManualWorkoutRequest({ ...request(), expectedWorkoutId: IDS[1] }).valid, false);
  assert.equal(parseManualWorkoutRequest({ ...request(), replaceExisting: true }).valid, false);
  assert.equal(parseManualWorkoutRequest({ ...request(), exercises: [createDraftItem("NOT-A-UUID")] }).valid, false);
  assert.equal(parseManualWorkoutRequest(request([createDraftItem(IDS[0]), createDraftItem(IDS[0])])).valid, false);
  assert.equal(
    parseManualWorkoutRequest(request(IDS.slice(0, MAX_WORKOUT_EXERCISES + 1).map(createDraftItem))).valid,
    false,
  );
});
