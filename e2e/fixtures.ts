import { expect, test as base } from "@playwright/test";
import { configureAiProviderKey, loadWorkoutFixture, seedCompletedHistoryFixture } from "./local-fixtures";

const PASSWORD = "e2e-local-password";

interface E2eUser {
  email: string;
  password: string;
}

export const test = base.extend<{ authenticatedPage: E2eUser }>({
  authenticatedPage: async ({ page }, use, testInfo) => {
    const email = `e2e-${testInfo.workerIndex}-${testInfo.parallelIndex}-${Date.now()}@example.test`;
    await page.goto("/auth/signup");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByText("Your account was created successfully.", { exact: true })).toBeVisible();
    // Playwright fixtures use a callback named `use`; it is not a React hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use({ email, password: PASSWORD });
  },
});

export { configureAiProviderKey };
export { loadWorkoutFixture };
export { seedCompletedHistoryFixture };

export { expect };
