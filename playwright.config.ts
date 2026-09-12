import { defineConfig } from "@playwright/test";

const isListing = process.argv.includes("--list");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "blob" : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:4321",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-mobile",
      testMatch: /responsive-navigation\.spec\.ts/u,
      use: { browserName: "chromium", viewport: { width: 360, height: 720 } },
    },
    {
      name: "chromium-desktop",
      testIgnore: /responsive-navigation\.spec\.ts/u,
      use: { browserName: "chromium", viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: isListing
    ? undefined
    : {
        command: "pnpm dev --host 127.0.0.1 --port 4321",
        url: "http://127.0.0.1:4321",
        reuseExistingServer: !process.env.CI,
        stdout: "ignore",
        stderr: "pipe",
      },
});
