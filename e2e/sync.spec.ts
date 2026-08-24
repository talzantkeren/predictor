import {
  devices,
  expect,
  type BrowserContextOptions,
  test,
} from "@playwright/test";

import {
  countSyncRunsInDisposableLocalDatabase,
  grantSystemAdminInDisposableLocalDatabase,
  removeProviderPredictionLockFixtureFromDisposableLocalDatabase,
  removeSyncFixturesFromDisposableLocalDatabase,
  seedProviderPredictionLockFixtureInDisposableLocalDatabase,
  seedSyncObservabilityRunsInDisposableLocalDatabase,
  type ProviderPredictionLockFixtureIds,
} from "./support/local-database";
import { registerConfirmedUser } from "./support/local-auth";

test.use({ screenshot: "off", trace: "off", video: "off" });

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const uuidSearchPattern =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/;

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

async function callSyncRoute(authorization?: string, method = "POST") {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization !== undefined) {
    headers.set("Authorization", authorization);
  }

  try {
    return await fetch("http://localhost:3000/api/cron/sync", {
      method,
      headers,
      redirect: "manual",
    });
  } catch {
    throw new Error("Local Cron request failed.");
  }
}

test.describe("Sports Sync observability and provider prediction lock", () => {
  let cleanup:
    | { runIds: string[]; systemAdminUserId: string }
    | undefined;
  let providerCleanup: ProviderPredictionLockFixtureIds | undefined;

  test.afterEach(() => {
    if (providerCleanup) {
      removeProviderPredictionLockFixtureFromDisposableLocalDatabase(
        providerCleanup,
      );
      providerCleanup = undefined;
    }
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
    const ordinaryUserId = await getRegisteredUserId(ordinaryEmail, password);
    grantSystemAdminInDisposableLocalDatabase(adminUserId);
    const observabilityRunIds = {
      succeeded: crypto.randomUUID(),
      failed: crypto.randomUUID(),
      concurrent: crypto.randomUUID(),
    };
    seedSyncObservabilityRunsInDisposableLocalDatabase(observabilityRunIds);
    providerCleanup = {
      competitionId: crypto.randomUUID(),
      seasonId: crypto.randomUUID(),
      homeTeamId: crypto.randomUUID(),
      awayTeamId: crypto.randomUUID(),
      matchId: crypto.randomUUID(),
      leagueId: crypto.randomUUID(),
    };
    seedProviderPredictionLockFixtureInDisposableLocalDatabase(
      providerCleanup,
      ordinaryUserId,
    );

    const beforeUnauthorized = countSyncRunsInDisposableLocalDatabase();
    const wrongMethod = await callSyncRoute(`Bearer ${cronSecret}`, "GET");
    const missingSecret = await callSyncRoute();
    const wrongSecret = await callSyncRoute("Bearer definitely-not-the-secret");

    expect(wrongMethod.status).toBe(405);
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
    cleanup = {
      runIds: [runId, ...Object.values(observabilityRunIds)],
      systemAdminUserId: adminUserId,
    };
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
    await expect(
      admin.page.locator("article").filter({ hasText: observabilityRunIds.succeeded }).getByText("הושלם", { exact: true }),
    ).toBeVisible();
    await expect(
      admin.page.locator("article").filter({ hasText: observabilityRunIds.failed }).getByText(/פרטי כשל:/),
    ).toBeVisible();
    await expect(
      admin.page.locator("article").filter({ hasText: observabilityRunIds.concurrent }).getByText(/סיבת דילוג:/),
    ).toBeVisible();

    await admin.page.getByRole("button", { name: "הפעלת סנכרון" }).click();
    await expect(
      admin.page.getByText("המערכת מוגדרת לספק ידני ולכן לא נשלחה קריאת רשת."),
    ).toBeVisible();
    const actionStatus = admin.page.getByRole("status");
    const actionText = await actionStatus.textContent();
    const actionRunId = actionText?.match(uuidSearchPattern)?.[0];
    if (!actionRunId) {
      throw new Error("The manual admin trigger did not return a safe run ID.");
    }
    cleanup.runIds.push(actionRunId);

    await ordinary.page.goto("/leagues/new");
    const seasonOptions = ordinary.page.locator("#league-season option");
    await expect(seasonOptions.filter({ hasText: "(API-Football)" })).toHaveCount(1);
    await expect(seasonOptions.filter({ hasText: "(Demo)" })).toHaveCount(1);

    await ordinary.page.goto(
      `/leagues/${providerCleanup.leagueId}/matches?round=26`,
    );
    const providerMatchCard = ordinary.page
      .locator("article")
      .filter({ hasText: "קבוצת ספק בית" });
    await expect(
      providerMatchCard.getByText("מחזור 26", { exact: true }),
    ).toBeVisible();
    await expect(
      providerMatchCard.getByText("קבוצת ספק בית", { exact: true }),
    ).toBeVisible();
    await expect(
      providerMatchCard.getByText("דורש בדיקה", { exact: true }),
    ).toBeVisible();
    await expect(
      providerMatchCard.getByText("נעול", { exact: true }).first(),
    ).toBeVisible();
    await ordinary.page.goto(
      `/matches/${providerCleanup.matchId}?league=${providerCleanup.leagueId}`,
    );
    await expect(
      ordinary.page.getByText("דורש בדיקה", { exact: true }),
    ).toBeVisible();
    await expect(ordinary.page.getByText("הניחוש נעול", { exact: true })).toBeVisible();
    await expect(ordinary.page.getByRole("button", { name: /שמירת ניחוש/ })).toHaveCount(0);

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
