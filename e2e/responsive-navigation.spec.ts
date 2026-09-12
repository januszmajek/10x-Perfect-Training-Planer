import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const desktopViewport = { width: 1280, height: 720 };

async function expectScrollLock(page: Page, locked: boolean) {
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(locked ? "hidden" : "");
}

async function expectHydrated(locator: Locator) {
  const island = locator.locator("xpath=ancestor::astro-island[1]");
  await expect(island).toHaveCount(1);
  await expect(island).not.toHaveAttribute("ssr", "");
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function clickAndWaitForAstroPageLoad(page: Page, link: Locator) {
  const pageLoaded = page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        document.addEventListener(
          "astro:page-load",
          () => {
            resolve();
          },
          { once: true },
        );
      }),
  );
  await link.click();
  await pageLoaded;
}

test("closes the portalled mobile navigation when resizing to the desktop layout", async ({
  page,
  authenticatedPage,
}) => {
  await page.goto("/dashboard");

  const menuButton = page.getByRole("button", { name: "Open navigation menu" });
  await expectHydrated(menuButton);
  await menuButton.click();
  const drawer = page.getByRole("dialog", { name: "Private workspace navigation" });
  await expect(page.getByRole("button", { name: "Close navigation menu" }).first()).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(drawer).toBeInViewport({ ratio: 0.99 });
  await expect(drawer.getByRole("link", { name: "Account" })).toBeInViewport();
  await expect(page.getByRole("link", { name: "Dashboard" }).last()).toBeFocused();
  await expectScrollLock(page, true);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize(desktopViewport);
  await expect(drawer).not.toBeInViewport();
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
  await page.goto("/workouts/new");

  const menuButton = page.getByRole("button", { name: "Open navigation menu" });
  await expect(menuButton).toBeVisible();
  await expectHydrated(menuButton);
  await menuButton.click();
  await clickAndWaitForAstroPageLoad(page, page.getByRole("link", { name: "History", exact: true }).last());
  await expect(page).toHaveURL("/history");

  const historyFilterTrigger = page.getByRole("button", { name: "Filters", exact: true });
  await expectHydrated(historyFilterTrigger);
  await historyFilterTrigger.click();
  const historyFilters = page.locator("aside").filter({ has: page.getByRole("heading", { name: "Filters" }) });
  const historyBackdrop = page.locator("button.fixed.inset-0[aria-label='Close filters']");
  await expect(historyBackdrop).toBeVisible();
  await expect(historyFilters).toBeInViewport({ ratio: 0.99 });
  await expect(historyFilters.getByRole("button", { name: "Close filters" })).toBeVisible();
  await expectScrollLock(page, true);
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press("Escape");
  await expect(historyFilters).not.toBeInViewport();
  await expect(historyFilterTrigger).toBeFocused();
  await expectScrollLock(page, false);

  await historyFilterTrigger.click();
  await expect(historyBackdrop).toBeVisible();
  await expectScrollLock(page, true);
  const historyBackdropBox = await historyBackdrop.boundingBox();
  if (!historyBackdropBox) throw new Error("History filter backdrop has no bounding box.");
  await historyBackdrop.click({
    position: { x: historyBackdropBox.width - 8, y: historyBackdropBox.height / 2 },
  });
  await expect(historyFilters).not.toBeInViewport();
  await expectScrollLock(page, false);

  await page.goto("/workouts/new");
  const workoutFilterTrigger = page.getByRole("button", { name: "Filters", exact: true });
  await expectHydrated(workoutFilterTrigger);
  await workoutFilterTrigger.click();
  const workoutFilters = page.locator("aside").filter({ has: page.getByRole("heading", { name: "Filters" }) });
  await expect(page.locator("button.fixed.inset-0[aria-label='Close filters']")).toBeVisible();
  await expect(workoutFilters).toBeInViewport({ ratio: 0.99 });
  await expect(workoutFilters.getByRole("button", { name: "Close filters" })).toBeVisible();
  await expectScrollLock(page, true);
  await expectNoHorizontalOverflow(page);
  await workoutFilters.getByRole("button", { name: "Close filters" }).click();
  await expect(workoutFilters).not.toBeInViewport();
  await expect(workoutFilterTrigger).toBeFocused();
  await expectScrollLock(page, false);

  await page.setViewportSize(desktopViewport);
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Filters", exact: true })).not.toBeVisible();
  const mainMuscles = workoutFilters.locator("details").filter({ hasText: "Main muscles" });
  const mainMusclesSummary = mainMuscles.locator("summary");
  await expect(workoutFilters).toBeInViewport();
  await expect(mainMusclesSummary).toBeInViewport();
  await mainMusclesSummary.click();
  const desktopChestFilter = mainMuscles.getByLabel("Chest");
  await expect(desktopChestFilter).toBeVisible();
  await desktopChestFilter.check();
  await expect(page).toHaveURL(/\/workouts\/new\?muscle=chest/u);

  expect(authenticatedPage.email).toContain("@example.test");
});
