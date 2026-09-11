import { configureAiProviderKey, expect, test } from "./fixtures";

test("creates an isolated confirmed local user through the browser", async ({ page, authenticatedPage }) => {
  expect(authenticatedPage.email).toContain("@example.test");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await configureAiProviderKey(authenticatedPage.email);
  await page.goto("/workouts/new");
  await expect(page.getByRole("button", { name: "Generate workout" })).toBeEnabled();
});
