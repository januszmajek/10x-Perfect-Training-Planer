import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePlannedWorkoutCompleteRequest,
  parsePlannedWorkoutDeleteRequest,
  parsePlannedWorkoutUpdateRequest,
} from "./planned-workout-mutation.ts";

const ID = "00000000-0000-0000-0000-000000000001";
const EXERCISE_ID = "00000000-0000-0000-0000-000000000002";
const update = {
  version: 1,
  expectedWorkoutId: ID,
  expectedRevision: 1,
  exercises: [{ exerciseId: EXERCISE_ID, sets: 3, reps: 10 }],
};
const deletion = { version: 1, expectedWorkoutId: ID, expectedRevision: 1 };
const completion = { version: 1, expectedWorkoutId: ID, expectedRevision: 1 };

void test("accepts exact version-1 update, delete, and completion contracts", () => {
  assert.equal(parsePlannedWorkoutUpdateRequest(update).valid, true);
  assert.equal(parsePlannedWorkoutDeleteRequest(deletion).valid, true);
  assert.equal(parsePlannedWorkoutCompleteRequest(completion).valid, true);
});

void test("keeps update, delete, and completion schemas separate", () => {
  assert.equal(parsePlannedWorkoutUpdateRequest(deletion).valid, false);
  assert.equal(parsePlannedWorkoutDeleteRequest(update).valid, false);
  assert.equal(parsePlannedWorkoutCompleteRequest(update).valid, false);
  assert.equal(parsePlannedWorkoutUpdateRequest({ ...update, extra: true }).valid, false);
  assert.equal(parsePlannedWorkoutDeleteRequest({ ...deletion, exercises: [] }).valid, false);
  assert.equal(parsePlannedWorkoutCompleteRequest({ ...completion, exercises: [] }).valid, false);
});

void test("rejects stale or unsafe tokens and invalid prescriptions", () => {
  assert.equal(parsePlannedWorkoutUpdateRequest({ ...update, expectedRevision: 0 }).valid, false);
  assert.equal(
    parsePlannedWorkoutDeleteRequest({ ...deletion, expectedRevision: Number.MAX_SAFE_INTEGER + 1 }).valid,
    false,
  );
  assert.equal(parsePlannedWorkoutUpdateRequest({ ...update, expectedWorkoutId: "not-a-uuid" }).valid, false);
  assert.equal(parsePlannedWorkoutUpdateRequest({ ...update, exercises: [] }).valid, false);
  assert.equal(
    parsePlannedWorkoutUpdateRequest({ ...update, exercises: [{ exerciseId: EXERCISE_ID, sets: 100, reps: 10 }] })
      .valid,
    false,
  );
});

void test("rejects malformed completion tokens and non-object request bodies", () => {
  assert.equal(parsePlannedWorkoutCompleteRequest({ ...completion, version: 2 }).valid, false);
  assert.equal(parsePlannedWorkoutCompleteRequest({ ...completion, expectedWorkoutId: "not-a-uuid" }).valid, false);
  assert.equal(parsePlannedWorkoutCompleteRequest({ ...completion, expectedRevision: 0 }).valid, false);
  assert.equal(
    parsePlannedWorkoutCompleteRequest({ ...completion, expectedRevision: Number.MAX_SAFE_INTEGER + 1 }).valid,
    false,
  );
  assert.equal(parsePlannedWorkoutCompleteRequest({ version: 1, expectedWorkoutId: ID }).valid, false);
  assert.equal(parsePlannedWorkoutCompleteRequest(null).valid, false);
  assert.equal(parsePlannedWorkoutCompleteRequest([completion]).valid, false);
});
