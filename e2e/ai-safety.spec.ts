import type { APIRequestContext, APIResponse, Page } from "@playwright/test";
import { configureAiProviderKey, expect, loadWorkoutFixture, test } from "./fixtures";

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

async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
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

test("failed generation keeps an edited manual draft editable and saves it manually", async ({ page, authenticatedPage }) => {
  const exercises = loadWorkoutFixture();
  await configureAiProviderKey(authenticatedPage.email);
  const generationBodies = [
    "{",
    JSON.stringify({
      proposal: { exercises: [{ exerciseId: exercises[1].id, sets: 3, reps: 10 }] },
      metadata: { kind: "cold_start", exerciseCount: 1 },
      requestId: "e2e-invalid-structure",
    }),
    JSON.stringify({ code: "provider_unavailable", requestId: "e2e-provider-failure" }),
    JSON.stringify({
      proposal: { exercises: exercises.map(({ id }) => ({ exerciseId: id, sets: 3, reps: 10 })) },
      metadata: { kind: "cold_start", exerciseCount: exercises.length },
      requestId: "e2e-valid-replacement",
    }),
  ];
  let generationCall = 0;
  await page.route("**/api/workouts/ai/generate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: generationBodies[generationCall++] ?? generationBodies[2],
    });
  });

  await page.goto("/workouts/new");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Add Barbell Bench Press" }).click();
  await page.getByLabel("Sets").fill("4");

  for (const alertText of [
    "The AI response was not a valid balanced workout",
    "The AI response was not a valid balanced workout",
    "The AI provider is temporarily unavailable",
  ]) {
    await page.getByRole("button", { name: "Generate workout" }).click();
    await expect(page.getByRole("alert")).toContainText(alertText);
    await expect(page.getByRole("list", { name: "Workout draft exercises" })).toContainText("Barbell Bench Press");
    await expect(page.getByLabel("Sets")).toHaveValue("4");
  }

  await page.getByLabel("Reps").fill("12");
  let manualSavePath = "";
  await page.route("**/api/workouts/manual", async (route) => {
    manualSavePath = new URL(route.request().url()).pathname;
    await route.fulfill({ status: 500, json: { code: "persistence_failed", requestId: "e2e-manual-save" } });
  });
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your draft and existing plan are unchanged" })).toBeVisible();
  expect(manualSavePath).toBe("/api/workouts/manual");
  await expect(page.getByLabel("Reps")).toHaveValue("12");

  await page.getByRole("button", { name: "Generate workout" }).click();
  await expect(page.getByRole("list", { name: "Workout draft exercises" })).toContainText(exercises[1].name);
  await expect(page.getByLabel("Reps").first()).toHaveValue("10");
});
