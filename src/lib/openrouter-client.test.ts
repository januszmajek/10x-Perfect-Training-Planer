import assert from "node:assert/strict";
import test from "node:test";
import { AI_WORKOUT_RESPONSE_SCHEMA } from "./ai-workout-contract.ts";
import { buildColdStartWorkoutPrompt } from "./ai-workout-prompt.ts";
import {
  MAX_OPENROUTER_RESPONSE_BYTES,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  requestOpenRouterWorkout,
  type OpenRouterFetch,
} from "./openrouter-client.ts";
import type { CatalogueExercise } from "./manual-workout-builder.ts";

const catalogue: CatalogueExercise[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Bench Press",
    equipment: "barbell",
    movementPattern: "push",
    muscles: [{ code: "chest", name: "Chest", category: "upper_body", role: "primary", recoveryHours: 48 }],
  },
];

function request(fetchImpl: OpenRouterFetch) {
  const prompt = buildColdStartWorkoutPrompt(catalogue);
  assert.equal(prompt.ok, true);
  return requestOpenRouterWorkout({ apiKey: "test-key", model: "test/model", prompt: prompt.data }, fetchImpl);
}

function completion(content = '{"exercises":[]}'): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

void test("posts fixed-model non-streaming strict JSON-schema requests and returns only completion content", async () => {
  const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const result = await request((input, init) => {
    calls.push({ input, init });
    return Promise.resolve(
      completion('{"exercises":[{"exerciseId":"00000000-0000-0000-0000-000000000001","sets":3,"reps":10}]}'),
    );
  });

  assert.deepEqual(result, {
    ok: true,
    data: { content: '{"exercises":[{"exerciseId":"00000000-0000-0000-0000-000000000001","sets":3,"reps":10}]}' },
  });
  const captured = calls[0];
  assert.equal(captured.input, OPENROUTER_CHAT_COMPLETIONS_URL);
  assert.equal(new Headers(captured.init?.headers).get("Authorization"), "Bearer test-key");
  assert.equal(captured.init?.signal, undefined);
  const requestBody = captured.init?.body;
  if (typeof requestBody !== "string") throw new Error("expected JSON request body");
  const body = JSON.parse(requestBody) as {
    model?: unknown;
    stream?: unknown;
    provider?: unknown;
    response_format?: unknown;
  };
  assert.equal(body.model, "test/model");
  assert.equal(body.stream, false);
  assert.deepEqual(body.provider, { require_parameters: true });
  assert.deepEqual(body.response_format, {
    type: "json_schema",
    json_schema: {
      name: "ai_workout_proposal",
      strict: true,
      schema: AI_WORKOUT_RESPONSE_SCHEMA,
    },
  });
});

void test("maps provider status and safe transport failures without exposing provider bodies", async () => {
  assert.deepEqual(await request(() => Promise.resolve(new Response("secret", { status: 401 }))), {
    ok: false,
    code: "invalid_credential",
  });
  assert.deepEqual(await request(() => Promise.resolve(new Response("secret", { status: 429 }))), {
    ok: false,
    code: "rate_limited",
  });
  assert.deepEqual(await request(() => Promise.resolve(new Response("secret", { status: 503 }))), {
    ok: false,
    code: "provider_unavailable",
  });
  assert.deepEqual(await request(() => Promise.reject(new Error("network secret"))), {
    ok: false,
    code: "network_failure",
  });
  assert.deepEqual(await request(() => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }))), {
    ok: false,
    code: "timeout",
  });
});

void test("rejects oversized, malformed, and structurally invalid provider completions", async () => {
  assert.deepEqual(
    await request(() =>
      Promise.resolve(new Response("{}", { headers: { "Content-Length": String(MAX_OPENROUTER_RESPONSE_BYTES + 1) } })),
    ),
    { ok: false, code: "response_too_large" },
  );
  assert.deepEqual(await request(() => Promise.resolve(new Response("not-json"))), {
    ok: false,
    code: "malformed_response",
  });
  assert.deepEqual(await request(() => Promise.resolve(new Response(JSON.stringify({ choices: [] })))), {
    ok: false,
    code: "invalid_completion",
  });
});
