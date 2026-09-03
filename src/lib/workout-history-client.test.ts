import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKOUT_HISTORY_API_PATH,
  compareWorkoutHistoryPositions,
  decodeWorkoutHistoryCursor,
  emptyWorkoutHistoryFilters,
  encodeWorkoutHistoryCursor,
  historyPresetRange,
  isCurrentHistoryRequest,
  localDateRangeToHistoryFilters,
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

void test("converts inclusive local dates to start-inclusive, next-local-day-exclusive UTC boundaries", () => {
  const filters = localDateRangeToHistoryFilters({ start: "2026-03-08", end: "2026-03-08" }, ["triceps", "chest"]);
  assert.ok(filters);
  assert.equal(filters.completedFrom, new Date(2026, 2, 8).toISOString());
  assert.equal(filters.completedBefore, new Date(2026, 2, 9).toISOString());
  assert.deepEqual(filters.muscles, ["chest", "triceps"]);
});

void test("keeps DST transition boundaries based on local midnight", () => {
  const filters = localDateRangeToHistoryFilters({ start: "2026-03-29", end: "2026-03-29" });
  assert.ok(filters);
  assert.equal(filters.completedFrom, new Date(2026, 2, 29).toISOString());
  assert.equal(filters.completedBefore, new Date(2026, 2, 30).toISOString());
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

void test("uses primary and secondary tags with OR semantics", () => {
  assert.equal(matchesWorkoutHistoryMuscles(entry, ["triceps"]), true);
  assert.equal(matchesWorkoutHistoryMuscles(entry, ["chest", "quads"]), true);
  assert.equal(matchesWorkoutHistoryMuscles(entry, ["quads"]), false);
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
