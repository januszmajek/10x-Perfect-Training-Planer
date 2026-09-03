import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkoutHistoryCursorPredicate } from "./workout-history-query.ts";

void test("quotes ISO timestamps in PostgREST cursor continuation predicates", () => {
  assert.equal(
    buildWorkoutHistoryCursorPredicate({
      completedAt: "2026-09-03T08:15:30.000Z",
      id: "00000000-0000-0000-0000-000000000001",
    }),
    'completed_at.lt."2026-09-03T08:15:30.000Z",and(completed_at.eq."2026-09-03T08:15:30.000Z",id.lt.00000000-0000-0000-0000-000000000001)',
  );
});
