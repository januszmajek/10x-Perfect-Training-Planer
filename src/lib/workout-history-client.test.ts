import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKOUT_HISTORY_API_PATH,
  compareWorkoutHistoryPositions,
  deduplicateHistoryMuscleOptions,
  decodeWorkoutHistoryCursor,
  emptyWorkoutHistoryFilters,
  encodeWorkoutHistoryCursor,
  historyPresetRange,
  isCurrentHistoryRequest,
  localDateRangeToHistoryFilters,
  matchesWorkoutHistoryFilters,
  matchesWorkoutHistoryMuscles,
  mergeWorkoutHistoryPage,
  parseWorkoutHistoryResponse,
  parseWorkoutHistorySearchParams,
  toWorkoutHistoryApiUrl,
  toWorkoutHistoryPageUrl,
  type CompletedWorkoutHistoryEntry,
  type WorkoutHistoryPage,
} from "./workout-history-client.ts";

const WORKOUT_ONE = "00000000-0000-0000-0000-000000000001";
const WORKOUT_TWO = "00000000-0000-0000-0000-000000000002";
const EXERCISE_ONE = "00000000-0000-0000-0000-000000000003";

const entry: CompletedWorkoutHistoryEntry = {
  id: WORKOUT_ONE,
  origin: "manual",
  createdAt: "2026-03-08T12:00:00.000Z",
  completedAt: "2026-03-09T12:00:00.000Z",
  exercises: [
    {
      exerciseId: EXERCISE_ONE,
      name: "Barbell Bench Press",
      position: 0,
      sets: 3,
      reps: 10,
      muscles: [
        { code: "chest", name: "Chest", role: "primary" },
        { code: "triceps", name: "Triceps", role: "secondary" },
      ],
    },
  ],
};

const page: WorkoutHistoryPage = { entries: [entry], nextCursor: null };

void test("builds 7, 30, and 90-day local presets without changing the local calendar day", () => {
  const now = new Date(2026, 2, 9, 18, 30);
  assert.deepEqual(historyPresetRange("7d", now), { start: "2026-03-03", end: "2026-03-09" });
  assert.deepEqual(historyPresetRange("30d", now), { start: "2026-02-08", end: "2026-03-09" });
  assert.deepEqual(historyPresetRange("90d", now), { start: "2025-12-10", end: "2026-03-09" });
  assert.equal(historyPresetRange("all", now), null);
});

void test("converts inclusive calendar dates to start-inclusive, next-day-exclusive UTC boundaries", () => {
  const filters = localDateRangeToHistoryFilters({ start: "2026-03-08", end: "2026-03-08" }, ["triceps", "chest"]);
  assert.ok(filters);
  assert.equal(filters.completedFrom, "2026-03-08T00:00:00.000Z");
  assert.equal(filters.completedBefore, "2026-03-09T00:00:00.000Z");
  assert.deepEqual(filters.muscles, ["chest", "triceps"]);
});

void test("keeps every completion on a selected one-day range", () => {
  const filters = localDateRangeToHistoryFilters({ start: "2026-03-08", end: "2026-03-08" });
  assert.ok(filters);
  const lastInstant = new Date(Date.parse(filters.completedBefore) - 1).toISOString();
  assert.equal(matchesWorkoutHistoryFilters({ ...entry, completedAt: lastInstant }, filters), true);
});

void test("keeps start-only and end-only calendar filters open-ended", () => {
  const startOnly = localDateRangeToHistoryFilters({ start: "2026-09-14", end: "" });
  assert.deepEqual(startOnly, {
    completedFrom: "2026-09-14T00:00:00.000Z",
    muscles: [],
    equipment: [],
  });
  assert.ok(startOnly);
  assert.equal(matchesWorkoutHistoryFilters({ ...entry, completedAt: "2026-09-13T23:59:59.999Z" }, startOnly), false);
  assert.equal(matchesWorkoutHistoryFilters({ ...entry, completedAt: "2026-09-15T00:00:00.000Z" }, startOnly), true);
  const startOnlyUrl = new URL(toWorkoutHistoryPageUrl(startOnly), "https://example.test");
  assert.equal(startOnlyUrl.searchParams.get("completedFrom"), startOnly.completedFrom);
  assert.equal(startOnlyUrl.searchParams.has("completedBefore"), false);

  const endOnly = localDateRangeToHistoryFilters({ start: "", end: "2026-09-14" });
  assert.deepEqual(endOnly, {
    completedBefore: "2026-09-15T00:00:00.000Z",
    muscles: [],
    equipment: [],
  });
  assert.ok(endOnly);
  assert.equal(matchesWorkoutHistoryFilters({ ...entry, completedAt: "2026-09-14T23:59:59.999Z" }, endOnly), true);
  assert.equal(matchesWorkoutHistoryFilters({ ...entry, completedAt: "2026-09-15T00:00:00.000Z" }, endOnly), false);
  const endOnlyUrl = new URL(toWorkoutHistoryPageUrl(endOnly), "https://example.test");
  assert.equal(endOnlyUrl.searchParams.has("completedFrom"), false);
  assert.equal(endOnlyUrl.searchParams.get("completedBefore"), endOnly.completedBefore);
});

void test("does not include a previous UTC calendar date in a single-day filter", () => {
  const filters = localDateRangeToHistoryFilters({ start: "2026-09-14", end: "2026-09-14" });
  assert.ok(filters);
  assert.equal(matchesWorkoutHistoryFilters({ ...entry, completedAt: "2026-09-13T22:28:29.285Z" }, filters), false);
  assert.equal(matchesWorkoutHistoryFilters({ ...entry, completedAt: "2026-09-14T00:00:00.000Z" }, filters), true);
});

void test("keeps UTC calendar-day boundaries stable across DST transitions", () => {
  const filters = localDateRangeToHistoryFilters({ start: "2026-03-29", end: "2026-03-29" });
  assert.ok(filters);
  assert.equal(filters.completedFrom, "2026-03-29T00:00:00.000Z");
  assert.equal(filters.completedBefore, "2026-03-30T00:00:00.000Z");
});

void test("rejects invalid and reversed custom ranges", () => {
  assert.equal(localDateRangeToHistoryFilters({ start: "2026-02-30", end: "2026-03-01" }), null);
  assert.equal(localDateRangeToHistoryFilters({ start: "2026-03-10", end: "2026-03-09" }), null);
});

void test("canonicalizes repeated muscles and serializes page and API URLs without a page cursor", () => {
  const filters = localDateRangeToHistoryFilters({ start: "2026-03-01", end: "2026-03-09" }, [
    "triceps",
    "chest",
    "triceps",
  ]);
  assert.ok(filters);
  const pageUrl = toWorkoutHistoryPageUrl(filters);
  assert.match(pageUrl, /^\/history\?completedFrom=/u);
  assert.match(pageUrl, /muscle=chest&muscle=triceps$/u);
  assert.equal(toWorkoutHistoryPageUrl(emptyWorkoutHistoryFilters()), "/history");
  assert.equal(toWorkoutHistoryApiUrl(filters).replace(/^.*\?/u, "").includes("cursor="), false);
});

void test("deduplicates history muscle filters by code", () => {
  assert.deepEqual(
    deduplicateHistoryMuscleOptions([
      { code: "chest", name: "Chest" },
      { code: "chest", name: "Chest" },
      { code: "triceps", name: "Triceps" },
      { code: "triceps", name: "Triceps" },
    ]),
    [
      { code: "chest", name: "Chest" },
      { code: "triceps", name: "Triceps" },
    ],
  );
});

void test("parses canonical query parameters and rejects unknown, malformed, and unknown-muscle input", () => {
  const filters = localDateRangeToHistoryFilters({ start: "2026-03-01", end: "2026-03-09" }, ["chest"]);
  assert.ok(filters);
  const parsed = parseWorkoutHistorySearchParams(
    new URL(toWorkoutHistoryApiUrl(filters), "https://example.test").searchParams,
    new Set(["chest"]),
  );
  assert.deepEqual(parsed, { valid: true, filters, cursor: null, normalized: false });
  assert.deepEqual(parseWorkoutHistorySearchParams(new URLSearchParams("unknown=value")), { valid: false });
  assert.deepEqual(parseWorkoutHistorySearchParams(new URLSearchParams("completedFrom=bad&completedBefore=bad")), {
    valid: false,
  });
  assert.deepEqual(parseWorkoutHistorySearchParams(new URLSearchParams("muscle=unknown"), new Set(["chest"])), {
    valid: false,
  });
});

void test("canonicalizes and validates repeated History equipment filters", () => {
  const url = toWorkoutHistoryPageUrl({ muscles: [], equipment: ["machine", "barbell", "machine"] });
  assert.equal(url, "/history?equipment=barbell&equipment=machine");
  assert.deepEqual(parseWorkoutHistorySearchParams(new URLSearchParams("equipment=machine&equipment=unknown")), {
    valid: false,
  });
});

void test("round-trips safe opaque cursors and rejects partial or malformed cursor payloads", () => {
  const cursor = encodeWorkoutHistoryCursor({ completedAt: entry.completedAt, id: WORKOUT_ONE });
  assert.ok(cursor);
  assert.deepEqual(decodeWorkoutHistoryCursor(cursor), { completedAt: entry.completedAt, id: WORKOUT_ONE });
  assert.deepEqual(parseWorkoutHistorySearchParams(new URLSearchParams(`cursor=${cursor}`)), {
    valid: true,
    filters: emptyWorkoutHistoryFilters(),
    cursor: { completedAt: entry.completedAt, id: WORKOUT_ONE },
    normalized: false,
  });
  assert.equal(decodeWorkoutHistoryCursor("eyJjb21wbGV0ZWRBdCI6IngifQ"), null);
  assert.equal(decodeWorkoutHistoryCursor("not-a-cursor!"), null);
  assert.match(
    toWorkoutHistoryApiUrl(emptyWorkoutHistoryFilters(), cursor),
    new RegExp(`^${WORKOUT_HISTORY_API_PATH}\\?cursor=`),
  );
});

void test("orders equal completion timestamps by descending workout ID", () => {
  const sameTime = "2026-03-09T12:00:00.000Z";
  assert.ok(
    compareWorkoutHistoryPositions(
      { completedAt: sameTime, id: WORKOUT_TWO },
      { completedAt: sameTime, id: WORKOUT_ONE },
    ) < 0,
  );
  assert.ok(
    compareWorkoutHistoryPositions(
      { completedAt: "2026-03-10T12:00:00.000Z", id: WORKOUT_ONE },
      { completedAt: sameTime, id: WORKOUT_TWO },
    ) < 0,
  );
});

void test("requires every selected muscle across primary and secondary tags", () => {
  assert.equal(matchesWorkoutHistoryMuscles(entry, ["triceps"]), true);
  assert.equal(matchesWorkoutHistoryMuscles(entry, ["chest", "triceps"]), true);
  assert.equal(matchesWorkoutHistoryMuscles(entry, ["chest", "quads"]), false);
  assert.equal(matchesWorkoutHistoryMuscles(entry, ["quads"]), false);
  assert.equal(matchesWorkoutHistoryMuscles(entry, []), true);

  const mixedRoleEntry: CompletedWorkoutHistoryEntry = {
    ...entry,
    exercises: [
      ...entry.exercises,
      {
        exerciseId: "00000000-0000-0000-0000-000000000004",
        name: "Cable Row",
        position: 1,
        sets: 3,
        reps: 10,
        muscles: [
          { code: "upper_back", name: "Upper Back", role: "primary" },
          { code: "biceps", name: "Biceps", role: "secondary" },
        ],
      },
    ],
  };
  assert.equal(matchesWorkoutHistoryMuscles(mixedRoleEntry, ["chest", "biceps"]), true);
  assert.equal(matchesWorkoutHistoryMuscles(mixedRoleEntry, ["triceps", "upper_back"]), true);
});

void test("intersects date and all-selected muscle filters", () => {
  assert.equal(
    matchesWorkoutHistoryFilters(entry, {
      completedFrom: "2026-03-09T00:00:00.000Z",
      completedBefore: "2026-03-10T00:00:00.000Z",
      muscles: ["chest", "triceps"],
    }),
    true,
  );
  assert.equal(
    matchesWorkoutHistoryFilters(entry, {
      completedFrom: "2026-03-10T00:00:00.000Z",
      muscles: ["chest", "triceps"],
    }),
    false,
  );
  assert.equal(matchesWorkoutHistoryFilters(entry, { muscles: ["chest", "quads"] }), false);
});

void test("rejects malformed history DTOs and merges append pages without duplicate workout IDs", () => {
  assert.deepEqual(parseWorkoutHistoryResponse(page), page);
  assert.equal(
    parseWorkoutHistoryResponse({ entries: [{ ...entry, completedAt: "invalid" }], nextCursor: null }),
    undefined,
  );
  assert.equal(parseWorkoutHistoryResponse({ entries: [entry], nextCursor: "not-a-cursor!" }), undefined);
  const appended = mergeWorkoutHistoryPage(
    page,
    { entries: [entry, { ...entry, id: WORKOUT_TWO }], nextCursor: null },
    "append",
  );
  assert.deepEqual(
    appended.entries.map(({ id }) => id),
    [WORKOUT_ONE, WORKOUT_TWO],
  );
  assert.deepEqual(mergeWorkoutHistoryPage(page, { entries: [], nextCursor: null }, "replace"), {
    entries: [],
    nextCursor: null,
  });
});

void test("allows only the latest request generation to settle state", () => {
  assert.equal(isCurrentHistoryRequest(4, 4), true);
  assert.equal(isCurrentHistoryRequest(3, 4), false);
});
