import assert from "node:assert/strict";
import test from "node:test";
import type { APIContext } from "astro";
import { MAX_WORKOUT_REQUEST_BYTES, parseJsonBody } from "./workout-api.ts";

function contextFor(body: Uint8Array): APIContext {
  const request = new Request("http://planner.test/api/workouts/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  assert.equal(request.headers.has("Content-Length"), false);
  return { request, url: new URL(request.url) } as APIContext;
}

void test("rejects an actual oversized JSON body when Content-Length is absent", async () => {
  const secret = "submitted-provider-content-must-not-leak";
  const body = new TextEncoder().encode(
    `{"proposal":"${secret}","padding":"${"x".repeat(MAX_WORKOUT_REQUEST_BYTES)}"}`,
  );
  const result = await parseJsonBody(contextFor(body), "request-id", "generate_ai_workout");

  assert.equal(result.ok, false);
  assert.equal(result.response.status, 400);
  const responseText = await result.response.text();
  assert.deepEqual(JSON.parse(responseText), { code: "validation_failed", requestId: "request-id" });
  assert.doesNotMatch(responseText, new RegExp(secret));
});
