import { configureAiProviderKey, expect, loadWorkoutFixture, test } from "./fixtures";

const COMPLETED_DASHBOARD_URL = /\/dashboard\?status=workout-completed/u;

async function waitForHydration(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}

async function completePlannedWorkout(page: import("@playwright/test").Page) {
  await waitForHydration(page);
  const completion = page.waitForURL(COMPLETED_DASHBOARD_URL, { timeout: 10_000 });
  await page.getByRole("button", { name: "Mark done" }).click();
  await completion;
}

async function expectHistoryPrescription(
  page: import("@playwright/test").Page,
  origin: "Manual" | "AI",
  exercise: string,
) {
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page).toHaveURL("/history");
  const card = page
    .getByRole("listitem")
    .filter({ hasText: `${origin} workout` })
    .first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Show details" }).click();
  await expect(card.getByText(exercise, { exact: false })).toBeVisible();
}

test("persists a manual workout through edit, completion, and History", async ({ page, authenticatedPage }) => {
  expect(authenticatedPage.email).toContain("@example.test");
  await page.goto("/workouts/new");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Add Barbell Bench Press" }).click();
  await expect(page.getByRole("list", { name: "Workout draft exercises" })).toContainText("Barbell Bench Press");
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page).toHaveURL(/\/dashboard\?status=workout-saved/u);
  await waitForHydration(page);

  await page.getByRole("link", { name: "Edit workout" }).click();
  await expect(page).toHaveURL("/workouts/edit");
  await waitForHydration(page);
  await page.getByLabel("Sets").fill("4");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/dashboard\?status=workout-updated/u);
  await waitForHydration(page);
  await expect(page.getByText("4 sets × 10 reps")).toBeVisible();

  await completePlannedWorkout(page);
  await expectHistoryPrescription(page, "Manual", "Barbell Bench Press");
  await expect(page.getByText("4 sets × 10 reps")).toBeVisible();
});

test("persists a routed AI proposal through edit, completion, and History", async ({ page, authenticatedPage }) => {
  const exercises = loadWorkoutFixture();
  await configureAiProviderKey(authenticatedPage.email);
  await page.route("**/api/workouts/ai/generate", async (route) => {
    await route.fulfill({
      json: {
        proposal: { exercises: exercises.map(({ id }) => ({ exerciseId: id, sets: 3, reps: 10 })) },
        metadata: { kind: "cold_start", exerciseCount: exercises.length },
        requestId: "e2e-routed-ai-proposal",
      },
    });
  });
  await page.goto("/workouts/new");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Generate workout" }).click();
  await expect(page.getByRole("list", { name: "Workout draft exercises" })).toContainText(exercises[0].name);
  await page.getByLabel("Sets").first().fill("4");
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page).toHaveURL(/\/dashboard\?status=ai-workout-saved/u);
  await waitForHydration(page);

  await page.getByRole("link", { name: "Edit workout" }).click();
  await expect(page).toHaveURL("/workouts/edit");
  await waitForHydration(page);
  await page.getByLabel("Reps").first().fill("12");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/dashboard\?status=workout-updated/u);
  await completePlannedWorkout(page);
  await expectHistoryPrescription(page, "AI", exercises[0].name);
  await expect(page.getByText("4 sets × 12 reps")).toBeVisible();
});

test("discards an unsaved create draft on navigation and retains it after a failed save", async ({
  page,
  authenticatedPage,
}) => {
  expect(authenticatedPage.email).toContain("@example.test");
  await page.goto("/workouts/new");
  await page.getByRole("button", { name: "Add Barbell Bench Press" }).click();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.getByRole("link", { name: "Workout", exact: true }).click();
  await expect(page.getByText("Your draft is empty")).toBeVisible();

  await page.getByRole("button", { name: "Add Barbell Bench Press" }).click();
  await page.route("**/api/workouts/manual", async (route) => {
    await route.fulfill({ status: 500, json: { code: "persistence_failed", requestId: "e2e-failed-save" } });
  });
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page.getByRole("alert")).toContainText("Your draft and existing plan are unchanged");
  await expect(page.getByRole("list", { name: "Workout draft exercises" })).toContainText("Barbell Bench Press");
});
