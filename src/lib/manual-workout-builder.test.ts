import assert from "node:assert/strict";
import test from "node:test";
import {
  addDraftItem,
  areDraftsEqual,
  createDraftFromCurrentPlan,
  createDraftItem,
  filterCatalogue,
  MAX_REPS,
  MAX_SETS,
  MAX_WORKOUT_EXERCISES,
  moveDraftItem,
  parseManualWorkoutRequest,
  replaceDraftItem,
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
      { code: "chest", name: "Chest", role: "primary", recoveryHours: 48 },
      { code: "triceps", name: "Triceps", role: "secondary", recoveryHours: 48 },
    ],
  },
  {
    id: IDS[1],
    name: "Cable Row",
    equipment: "cable",
    muscles: [
      { code: "upper_back", name: "Upper Back", role: "primary", recoveryHours: 72 },
      { code: "biceps", name: "Biceps", role: "secondary", recoveryHours: 48 },
    ],
  },
  {
    id: IDS[2],
    name: "Bodyweight Squat",
    equipment: "bodyweight",
    muscles: [{ code: "quads", name: "Quads", role: "primary", recoveryHours: 72 }],
  },
];

function request(exercises: ManualWorkoutDraftItem[] = [createDraftItem(IDS[0])]) {
  return { version: 1, replaceExisting: false, expectedWorkoutId: null, expectedRevision: null, exercises };
}

void test("filters by case-insensitive trimmed name and returns an empty result", () => {
  assert.deepEqual(
    filterCatalogue(catalogue, { search: "  BENCH ", muscleGroups: [], equipment: [] }).map(({ name }) => name),
    ["Barbell Bench Press"],
  );
  assert.deepEqual(filterCatalogue(catalogue, { search: "missing", muscleGroups: [], equipment: [] }), []);
});

void test("requires all selected muscles while including primary and secondary tags", () => {
  const filtered = filterCatalogue(catalogue, {
    search: "",
    muscleGroups: ["chest", "triceps"],
    equipment: ["barbell", "bodyweight"],
  });

  assert.deepEqual(
    filtered.map(({ name }) => name),
    ["Barbell Bench Press"],
  );
  assert.deepEqual(
    filterCatalogue(catalogue, { search: "", muscleGroups: ["biceps"], equipment: [] }).map(({ name }) => name),
    ["Cable Row"],
  );
  assert.deepEqual(
    filterCatalogue(catalogue, { search: "", muscleGroups: ["triceps", "upper_back"], equipment: [] }),
    [],
  );
  assert.equal(filterCatalogue(catalogue, { search: "", muscleGroups: [], equipment: [] }).length, catalogue.length);
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

void test("creates an ordered draft and replaces one exercise without changing its prescription", () => {
  const draft = createDraftFromCurrentPlan([
    { exerciseId: IDS[1], position: 1, sets: 5, reps: 5 },
    { exerciseId: IDS[0], position: 0, sets: 3, reps: 10 },
  ]);

  assert.deepEqual(draft, [
    { exerciseId: IDS[0], sets: 3, reps: 10 },
    { exerciseId: IDS[1], sets: 5, reps: 5 },
  ]);
  assert.deepEqual(replaceDraftItem(draft, 0, IDS[2]), [
    { exerciseId: IDS[2], sets: 3, reps: 10 },
    { exerciseId: IDS[1], sets: 5, reps: 5 },
  ]);
  assert.deepEqual(replaceDraftItem(draft, 0, IDS[1]), draft);
});

void test("compares complete drafts for dirty state", () => {
  const draft = [createDraftItem(IDS[0]), { exerciseId: IDS[1], sets: 5, reps: 8 }];
  assert.equal(areDraftsEqual(draft, [...draft]), true);
  assert.equal(areDraftsEqual(draft, [...draft].reverse()), false);
  assert.equal(areDraftsEqual(draft, [{ ...draft[0], reps: 9 }, draft[1]]), false);
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
      expectedRevision: 1,
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
  assert.equal(parseManualWorkoutRequest({ ...request(), expectedRevision: 1 }).valid, false);
  assert.equal(parseManualWorkoutRequest({ ...request(), replaceExisting: true }).valid, false);
  assert.equal(
    parseManualWorkoutRequest({ ...request(), replaceExisting: true, expectedWorkoutId: IDS[1], expectedRevision: 0 })
      .valid,
    false,
  );
  assert.equal(parseManualWorkoutRequest({ ...request(), exercises: [createDraftItem("NOT-A-UUID")] }).valid, false);
  assert.equal(parseManualWorkoutRequest(request([createDraftItem(IDS[0]), createDraftItem(IDS[0])])).valid, false);
  assert.equal(
    parseManualWorkoutRequest(request(IDS.slice(0, MAX_WORKOUT_EXERCISES + 1).map(createDraftItem))).valid,
    false,
  );
});
