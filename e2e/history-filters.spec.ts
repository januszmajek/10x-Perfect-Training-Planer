import { expect, loadWorkoutFixture, seedCompletedHistoryFixture, test } from "./fixtures";

async function waitForHydration(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}

test("keeps all-selected catalogue and History filters in canonical URLs across reloads", async ({
  page,
  authenticatedPage,
}) => {
  expect(authenticatedPage.email).toContain("@example.test");
  const [fixtureExercise] = loadWorkoutFixture();
  seedCompletedHistoryFixture(authenticatedPage.email, fixtureExercise);
  await page.setViewportSize({ width: 360, height: 1200 });
  await page.goto("/workouts/new");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Main muscles" }).click();
  await page.locator("details").filter({ hasText: "Main muscles" }).getByLabel("Chest").check();
  await expect(page).toHaveURL(/\/workouts\/new\?muscle=chest/u);
  await page.locator("summary").filter({ hasText: "Equipment" }).click({ force: true });
  await page.locator("details").filter({ hasText: "Equipment" }).getByLabel("Barbell").check();
  await expect(page).toHaveURL(/\/workouts\/new\?muscle=chest&equipment=barbell/u);
  await expect(page.getByRole("button", { name: `Add ${fixtureExercise.name}` })).toBeVisible();
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator("details").filter({ hasText: "Main muscles" }).getByLabel("Chest")).toBeChecked();
  await expect(page.locator("details").filter({ hasText: "Equipment" }).getByLabel("Barbell")).toBeChecked();

  await page.goto("/history");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Main muscles" }).click();
  await page.locator("details").filter({ hasText: "Main muscles" }).getByLabel("Chest").check();
  await expect(page).toHaveURL(/\/history\?muscle=chest/u);
  await page.locator("summary").filter({ hasText: "Equipment" }).click({ force: true });
  await page.locator("details").filter({ hasText: "Equipment" }).getByLabel("Barbell").check();
  await expect(page).toHaveURL(/\/history\?muscle=chest&equipment=barbell/u);
  const historyFilters = page.locator("aside").filter({ has: page.getByRole("heading", { name: "Filters" }) });
  await historyFilters.getByRole("button", { name: "Close filters" }).click();
  const card = page.getByRole("listitem").filter({ hasText: "Manual workout" }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Show details" }).click();
  await expect(card).toContainText(fixtureExercise.name);
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator("details").filter({ hasText: "Main muscles" }).getByLabel("Chest")).toBeChecked();
  await expect(page.locator("details").filter({ hasText: "Equipment" }).getByLabel("Barbell")).toBeChecked();

  await page.goBack();
  await waitForHydration(page);
  await expect(page).toHaveURL(/\/history\?muscle=chest/u);
  await expect(page.locator("details").filter({ hasText: "Main muscles" }).getByLabel("Chest")).toBeChecked();
  await expect(page.locator("details").filter({ hasText: "Equipment" }).getByLabel("Barbell")).not.toBeChecked();

  await page.goForward();
  await waitForHydration(page);
  await expect(page).toHaveURL(/\/history\?muscle=chest&equipment=barbell/u);
  await expect(page.locator("details").filter({ hasText: "Main muscles" }).getByLabel("Chest")).toBeChecked();
  await expect(page.locator("details").filter({ hasText: "Equipment" }).getByLabel("Barbell")).toBeChecked();
});
