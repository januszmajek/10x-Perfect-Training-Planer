import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeToastStatus,
  getToastNotification,
  isToastStatus,
  setToastStatus,
  TOAST_NOTIFICATIONS,
} from "./toast-notifications.ts";

void test("every supported status resolves to a specific toast notification", () => {
  for (const status of Object.keys(TOAST_NOTIFICATIONS) as (keyof typeof TOAST_NOTIFICATIONS)[]) {
    assert.equal(isToastStatus(status), true);
    assert.equal(getToastNotification(status), TOAST_NOTIFICATIONS[status]);
  }

  assert.equal(isToastStatus("unknown"), false);
});

void test("a flash status is configured for one-time, short-lived delivery", () => {
  let stored: string | undefined;
  let setOptions: Record<string, unknown> | undefined;
  let deleteOptions: Record<string, unknown> | undefined;
  const cookies = {
    get: () => (stored ? { value: stored } : undefined),
    set: (_name: string, value: string, options: Record<string, unknown>) => {
      stored = value;
      setOptions = options;
    },
    delete: (_name: string, options: Record<string, unknown>) => {
      stored = undefined;
      deleteOptions = options;
    },
  } as unknown as Parameters<typeof setToastStatus>[0];

  setToastStatus(cookies, "workout-saved", true);

  assert.equal(stored, "workout-saved");
  assert.deepEqual(setOptions, {
    httpOnly: false,
    maxAge: 60,
    path: "/",
    sameSite: "lax",
    secure: true,
  });
  assert.equal(consumeToastStatus(cookies), "workout-saved");
  assert.equal(stored, undefined);
  assert.deepEqual(deleteOptions, { path: "/" });
  assert.equal(consumeToastStatus(cookies), null);
});
