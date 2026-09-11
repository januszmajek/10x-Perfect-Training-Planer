import type { APIRequestContext, APIResponse, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const APP_ORIGIN = "http://127.0.0.1:4321";
const GENERATE_PATH = "/api/workouts/ai/generate";
const SAVE_PATH = "/api/workouts/ai/save";
const SUBMITTED_SECRET = "submitted-provider-content-must-not-leak";

function assertPublicFailure(value: unknown, code: string): asserts value is { code: string; requestId: string } {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).code !== code ||
    typeof (value as Record<string, unknown>).requestId !== "string"
  ) {
    throw new Error("Expected a public error response with only a code and request ID.");
  }
}

async function expectSafeFailure(response: APIResponse, status: number, code: string) {
  expect(response.status()).toBe(status);
  const body: unknown = await response.json();
  assertPublicFailure(body, code);
  expect(body).toEqual({ code, requestId: expect.any(String) });
  expect(response.headers()["x-request-id"]).toBe(body.requestId);
  expect(JSON.stringify(body)).not.toContain(SUBMITTED_SECRET);
  expect(JSON.stringify(body)).not.toMatch(/provider|credential|proposalId|userId/i);
}

async function postRaw(request: APIRequestContext, path: string, body: string, headers: Record<string, string> = {}) {
  return request.post(path, {
    headers: { Origin: APP_ORIGIN, "Content-Type": "application/json", ...headers },
    data: Buffer.from(body),
  });
}

async function browserPost(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody: unknown = await response.json();
      return {
        status: response.status,
        body: responseBody,
        requestId: response.headers.get("X-Request-ID"),
      };
    },
    { path, body },
  );
}

test("AI routes reject origin, media, JSON, declared-size, and unauthenticated requests without leaking input", async ({
  request,
}) => {
  for (const path of [GENERATE_PATH, SAVE_PATH]) {
    await expectSafeFailure(
      await request.post(path, {
        headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
        data: JSON.stringify({ version: 1, secret: SUBMITTED_SECRET }),
      }),
      403,
      "origin_rejected",
    );
    await expectSafeFailure(
      await request.post(path, {
        headers: { Origin: APP_ORIGIN, "Content-Type": "text/plain" },
        data: SUBMITTED_SECRET,
      }),
      400,
      "validation_failed",
    );
    await expectSafeFailure(await postRaw(request, path, '{"secret":}'), 400, "validation_failed");
    await expectSafeFailure(await postRaw(request, path, "x".repeat(32 * 1024 + 1)), 400, "validation_failed");
    await expectSafeFailure(await postRaw(request, path, JSON.stringify({ version: 1 })), 401, "unauthenticated");
  }
});

test("authenticated AI routes reject non-exact generation and save commands before services run", async ({
  page,
  authenticatedPage,
}) => {
  expect(authenticatedPage.email).toContain("@example.test");

  for (const path of [GENERATE_PATH, SAVE_PATH]) {
    const result = await browserPost(page, path, { version: 1, secret: SUBMITTED_SECRET });
    expect(result.status).toBe(400);
    assertPublicFailure(result.body, "validation_failed");
    expect(result.body).toEqual({ code: "validation_failed", requestId: expect.any(String) });
    expect(result.requestId).toBe(result.body.requestId);
    expect(JSON.stringify(result.body)).not.toContain(SUBMITTED_SECRET);
  }
});
