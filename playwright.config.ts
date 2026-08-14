import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Local auth tests mutate one shared Supabase and Mailpit stack. Serializing
  // them avoids cross-project races while preview smoke tests stay parallel.
  workers: externalBaseUrl ? undefined : 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "html" : "line",
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3000",
    // Auth confirmation URLs, invite bearers, and proof signed URLs must never
    // be persisted in CI artifacts. Keep browser recordings disabled.
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "npm run start -- --hostname localhost",
        url: "http://localhost:3000",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
