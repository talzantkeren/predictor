import {
  devices,
  expect,
  type BrowserContextOptions,
  test,
} from "@playwright/test";

import {
  countSyncRunsInDisposableLocalDatabase,
  grantSystemAdminInDisposableLocalDatabase,
  removeSyncFixturesFromDisposableLocalDatabase,
} from "./support/local-database";
import { registerConfirmedUser } from "./support/local-auth";

test.use({ screenshot: "off", trace: "off", video: "off" });

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type PasswordSessionResponse = {
  user?: { id?: unknown };
};

type SyncRouteResponse = {
  data?: {
    runId?: unknown;
    status?: unknown;
    reason?: unknown;
  };
  error?: { code?: unknown; message?: unknown };
};

function getContextOptions(projectName: string): BrowserContextOptions {
  const descriptor = projectName.startsWith("mobile-")
    ? devices["Pixel 5"]
    : devices["Desktop Chrome"];
  return {
    baseURL: "http://localhost:3000",
    deviceScaleFactor: descriptor.deviceScaleFactor,
    hasTouch: descriptor.hasTouch,
    isMobile: descriptor.isMobile,
    timezoneId: projectName.startsWith("mobile-") ? "Asia/Jerusalem" : "UTC",
    userAgent: descriptor.userAgent,
    viewport: descriptor.viewport,
  };
}

function localSupabaseConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Local Supabase configuration is unavailable.");
  }
  return { publishableKey, url };
}

async function getRegisteredUserId(email: string, password: string) {
  const { publishableKey, url } = localSupabaseConfiguration();
  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("Local sync user lookup failed.");
  }

  const payload = (await response.json()) as PasswordSessionResponse;
  if (
    !response.ok ||
    typeof payload.user?.id !== "string" ||
    !canonicalUuidPattern.test(payload.user.id)
  ) {
    throw new Error("Local sync user identity was unavailable.");
  }
  return payload.user.id;
}

async function callSyncRoute(authorization?: string) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization !== undefined) {
    headers.set("Authorization", authorization);
  }

  try {
    return await fetch("http://localhost:3000/api/cron/sync", {
      method: "POST",
      headers,
      redirect: "manual",
    });
  } catch {
    throw new Error("Local Cron request failed.");
  }
}

test.describe("manual Sync observability", () => {
  let cleanup:
    | { runId: string; systemAdminUserId: string }
    | undefined;

  test.afterEach(() => {
    if (!cleanup) return;
    removeSyncFixturesFromDisposableLocalDatabase(cleanup);
    cleanup = undefined;
  });

  test("records one authorized skip, hides it from a normal user, and renders an RTL admin status", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      throw new Error("Local Cron configuration is unavailable.");
    }

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const password = `Aa1!${crypto.randomUUID()}`;
    const contextOptions = getContextOptions(testInfo.project.name);
    const adminEmail = `sync-admin-${suffix}@example.com`;
    const ordinaryEmail = `sync-user-${suffix}@example.com`;

    const admin = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: adminEmail,
      password,
      displayName: `מנהלת סנכרון ${suffix.slice(-6)}`,
      contextOptions,
    });
    const ordinary = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: ordinaryEmail,
      password,
      displayName: `משתמשת רגילה ${suffix.slice(-6)}`,
      contextOptions,
    });
    const adminUserId = await getRegisteredUserId(adminEmail, password);
    grantSystemAdminInDisposableLocalDatabase(adminUserId);

    const beforeUnauthorized = countSyncRunsInDisposableLocalDatabase();
    const missingSecret = await callSyncRoute();
    const wrongSecret = await callSyncRoute("Bearer definitely-not-the-secret");

    expect(missingSecret.status).toBe(401);
    expect(wrongSecret.status).toBe(401);
    for (const response of [missingSecret, wrongSecret]) {
      const payload = (await response.json()) as SyncRouteResponse;
      expect(payload.error?.code).toBe("UNAUTHORIZED");
      expect(JSON.stringify(payload)).not.toContain(cronSecret);
    }
    expect(countSyncRunsInDisposableLocalDatabase()).toBe(beforeUnauthorized);

    const authorized = await callSyncRoute(`Bearer ${cronSecret}`);
    const payload = (await authorized.json()) as SyncRouteResponse;
    expect(authorized.status).toBe(200);
    expect(payload.data).toMatchObject({
      status: "skipped",
      reason: "MANUAL_PROVIDER",
    });
    expect(typeof payload.data?.runId).toBe("string");
    const runId = payload.data?.runId;
    if (typeof runId !== "string" || !canonicalUuidPattern.test(runId)) {
      throw new Error("The manual Sync attempt returned an invalid run ID.");
    }
    cleanup = { runId, systemAdminUserId: adminUserId };
    expect(countSyncRunsInDisposableLocalDatabase()).toBe(
      beforeUnauthorized + 1,
    );

    await admin.page.goto("/admin/sync");
    await expect(
      admin.page.getByRole("heading", { name: "סטטוס סנכרון" }),
    ).toBeVisible();
    const runCard = admin.page.locator("article").filter({ hasText: runId });
    await expect(runCard).toHaveCount(1);
    await expect(runCard.getByText("דולג", { exact: true })).toBeVisible();
    await expect(runCard.getByText(/סיבת דילוג:/)).toBeVisible();
    await expect(
      runCard.getByText("המערכת מוגדרת למסלול ידני ללא ספק חי"),
    ).toBeVisible();
    await expect(runCard.getByText(/פרטי כשל:/)).toHaveCount(0);

    const layout = await admin.page.evaluate(() => ({
      dir: document.documentElement.dir,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.dir).toBe("rtl");
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);

    await ordinary.page.goto("/admin/sync");
    await expect(
      ordinary.page.getByRole("heading", { name: "הדף לא נמצא" }),
    ).toBeVisible();
  });
});
