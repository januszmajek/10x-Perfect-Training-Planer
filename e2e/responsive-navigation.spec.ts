import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const mobileViewport = { width: 360, height: 720 };
const desktopViewport = { width: 1280, height: 720 };

async function expectScrollLock(page: Page, locked: boolean) {
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(locked ? "hidden" : "");
}

test("closes the portalled mobile navigation when resizing to the desktop layout", async ({
  page,
  authenticatedPage,
}) => {
  await page.setViewportSize(mobileViewport);
  await page.goto("/dashboard");

  const menuButton = page.getByRole("button", { name: "Open navigation menu" });
  await menuButton.click();
  const drawer = page.getByRole("dialog", { name: "Private workspace navigation" });
  await expect(drawer).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard" }).last()).toBeFocused();
  await expectScrollLock(page, true);
  await expect(drawer).toHaveScreenshot("mobile-navigation-open.png", { animations: "disabled", caret: "hide" });

  await page.setViewportSize(desktopViewport);
  await expect(drawer).not.toBeVisible();
  await expectScrollLock(page, false);
  await expect(page.getByRole("link", { name: "Workout", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page).toHaveURL("/history");

  expect(authenticatedPage.email).toContain("@example.test");
});

test("keeps responsive navigation and independently owned filter drawers operable", async ({
  page,
  authenticatedPage,
}) => {
  await page.setViewportSize(mobileViewport);
  await page.goto("/workouts/new");

  const menuButton = page.getByRole("button", { name: "Open navigation menu" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await page.getByRole("link", { name: "History", exact: true }).last().click();
  await expect(page).toHaveURL("/history");

  const historyFilterTrigger = page.getByRole("button", { name: "Filters", exact: true });
  await historyFilterTrigger.click();
  const historyFilters = page.locator("aside").filter({ has: page.getByRole("heading", { name: "Filters" }) });
  await expect(historyFilters).toBeVisible();
  await expectScrollLock(page, true);
  await page.keyboard.press("Escape");
  await expect(historyFilterTrigger).toBeFocused();
  await expectScrollLock(page, false);

  await page.goto("/workouts/new");
  const workoutFilterTrigger = page.getByRole("button", { name: "Filters", exact: true });
  await workoutFilterTrigger.click();
  const workoutFilters = page.locator("aside").filter({ has: page.getByRole("heading", { name: "Filters" }) });
  await expect(workoutFilters).toBeVisible();
  await expectScrollLock(page, true);
  await expect(workoutFilters).toHaveScreenshot("workout-filters-open.png", { animations: "disabled", caret: "hide" });
  await page
    .getByRole("button", { name: "Close filters" })
    .first()
    .click({ position: { x: 340, y: 360 } });
  await expect(workoutFilterTrigger).toBeFocused();
  await expectScrollLock(page, false);

  await page.setViewportSize(desktopViewport);
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Filters", exact: true })).not.toBeVisible();
  await expect(workoutFilters).toBeVisible();

  expect(authenticatedPage.email).toContain("@example.test");
});
