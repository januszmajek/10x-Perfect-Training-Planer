import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPLETION_GRACE_PERIOD_MS,
  IDLE_COMPLETION_STATE,
  reduceCompletionState,
  type CompletionState,
} from "./planned-workout-completion.ts";

void test("starts a grace period from an absolute five-second deadline", () => {
  const transition = reduceCompletionState(IDLE_COMPLETION_STATE, { type: "start", now: 100 });

  assert.deepEqual(transition, {
    state: { kind: "grace-period", deadline: 100 + COMPLETION_GRACE_PERIOD_MS },
    effect: { type: "schedule", deadline: 100 + COMPLETION_GRACE_PERIOD_MS },
  });
});

void test("undo restores before the deadline, including immediately before expiry", () => {
  const state: CompletionState = { kind: "grace-period", deadline: 5_100 };

  assert.deepEqual(reduceCompletionState(state, { type: "undo", now: 101 }), {
    state: IDLE_COMPLETION_STATE,
    effect: { type: "restore" },
  });
  assert.deepEqual(reduceCompletionState(state, { type: "undo", now: 5_099 }), {
    state: IDLE_COMPLETION_STATE,
    effect: { type: "restore" },
  });
});

void test("expiry submits once and ignores duplicate or obsolete callbacks", () => {
  const grace: CompletionState = { kind: "grace-period", deadline: 5_100 };
  const expired = reduceCompletionState(grace, { type: "deadline-reached", deadline: 5_100, now: 5_100 });

  assert.deepEqual(expired, { state: { kind: "committing" }, effect: { type: "submit" } });
  assert.deepEqual(reduceCompletionState(expired.state, { type: "deadline-reached", deadline: 5_100, now: 6_000 }), {
    state: { kind: "committing" },
    effect: { type: "none" },
  });
  assert.deepEqual(reduceCompletionState(grace, { type: "deadline-reached", deadline: 5_101, now: 6_000 }), {
    state: grace,
    effect: { type: "none" },
  });
});

void test("an early timer callback is rescheduled against the original deadline", () => {
  const state: CompletionState = { kind: "grace-period", deadline: 5_100 };

  assert.deepEqual(reduceCompletionState(state, { type: "deadline-reached", deadline: 5_100, now: 5_000 }), {
    state,
    effect: { type: "schedule", deadline: 5_100 },
  });
});

void test("an undo delivered at expiry commits instead, and reset returns to idle", () => {
  const grace: CompletionState = { kind: "grace-period", deadline: 5_100 };

  assert.deepEqual(reduceCompletionState(grace, { type: "undo", now: 5_100 }), {
    state: { kind: "committing" },
    effect: { type: "submit" },
  });
  assert.deepEqual(reduceCompletionState({ kind: "committing" }, { type: "reset" }), {
    state: IDLE_COMPLETION_STATE,
    effect: { type: "none" },
  });
});
