import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const nativeScaleAudit = process.env.S9_NATIVE_SCALE_AUDIT === "1";
const nativeScaleViewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

const projects = nativeScaleAudit
  ? nativeScaleViewports.map((viewport) => ({
      name: `native-scale-${viewport.width}x${viewport.height}`,
      use: {
        // A null viewport prevents Playwright from installing a device-metrics
        // override that would replace the browser process's forced scale.
        viewport: null,
        userAgent: devices["Desktop Chrome"].userAgent,
        launchOptions: {
          headless: true,
          args: [
            "--enable-automation",
            "--force-device-scale-factor=2",
            `--window-size=${viewport.width},${viewport.height}`,
          ],
        },
      },
    }))
  : [
      {
        name: "desktop-chromium",
        use: { ...devices["Desktop Chrome"] },
      },
      {
        name: "mobile-chromium",
        use: { ...devices["Pixel 5"] },
      },
    ];

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
  projects,
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "npm run start -- --hostname localhost",
        url: "http://localhost:3000",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
