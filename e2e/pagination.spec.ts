import {
  devices,
  expect,
  type BrowserContextOptions,
  type Page,
  test,
} from "@playwright/test";

import { registerConfirmedUser } from "./support/local-auth";
import {
  grantSystemAdminInDisposableLocalDatabase,
  removePaginationFixturesFromDisposableLocalDatabase,
  seedPaginationFixturesInDisposableLocalDatabase,
} from "./support/local-database";

test.use({ screenshot: "off", trace: "off", video: "off" });

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type PasswordSessionResponse = {
  access_token?: unknown;
  user?: { id?: unknown };
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

async function getRegisteredUserId(email: string, password: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Local pagination Supabase configuration is unavailable.");
  }

  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("Local pagination Data API sign-in failed.");
  }

  const payload = (await response.json()) as PasswordSessionResponse;
  if (
    !response.ok ||
    typeof payload.access_token !== "string" ||
    typeof payload.user?.id !== "string" ||
    !canonicalUuidPattern.test(payload.user.id)
  ) {
    throw new Error("Local pagination Data API sign-in failed.");
  }
  return payload.user.id;
}

async function createLeague(page: Page, name: string) {
  await page.goto("/leagues/new");
  await page.getByLabel("שם הליגה").fill(name);
  await page.getByRole("button", { name: "יצירת ליגה", exact: true }).click();
  await expect(page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
  const leagueId = new URL(page.url()).pathname.split("/").at(-1);
  if (!leagueId || !canonicalUuidPattern.test(leagueId)) {
    throw new Error("Created pagination league ID was invalid.");
  }
  return leagueId;
}

async function followNextByKeyboard(page: Page, ariaLabel: string) {
  const navigation = page.getByRole("navigation", { name: ariaLabel });
  const next = navigation.getByRole("link", { name: "לעמוד הבא" });
  await expect(next).toBeVisible();
  await next.focus();
  await expect(next).toBeFocused();
  const box = await next.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Enter");
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    dir: document.documentElement.dir,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.dir).toBe("rtl");
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test.describe("bounded keyset pagination and exact authorization", () => {
  let cleanup:
    | {
        namespace: string;
        leagueId: string;
        managerId: string;
        viewerId: string;
      }
    | undefined;

  test.afterEach(() => {
    if (!cleanup) return;
    removePaginationFixturesFromDisposableLocalDatabase(cleanup);
    cleanup = undefined;
  });

  test("reaches later pages, filtered empty/end states, and exact resources", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(12_000);

    const namespace = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
    const suffix = `${Date.now()}-${namespace}`;
    const password = `Aa1!${crypto.randomUUID()}`;
    const contextOptions = getContextOptions(testInfo.project.name);
    const managerEmail = `pagination-manager-${suffix}@example.com`;
    const viewerEmail = `pagination-viewer-${suffix}@example.com`;

    const manager = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: managerEmail,
      password,
      displayName: `מנהלת עמודים ${namespace}`,
      contextOptions,
    });
    manager.page.setDefaultTimeout(12_000);
    const leagueId = await createLeague(
      manager.page,
      `ליגת עמודים ראשית ${namespace}`,
    );
    const managerId = await getRegisteredUserId(managerEmail, password);

    const viewer = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: viewerEmail,
      password,
      displayName: `חברת עמודים ${namespace}`,
      contextOptions,
    });
    viewer.page.setDefaultTimeout(12_000);
    const viewerId = await getRegisteredUserId(viewerEmail, password);

    grantSystemAdminInDisposableLocalDatabase(managerId);
    cleanup = { namespace, leagueId, managerId, viewerId };
    const fixture = seedPaginationFixturesInDisposableLocalDatabase(cleanup);

    await manager.page.goto("/dashboard");
    await expectNoHorizontalOverflow(manager.page);
    await followNextByKeyboard(manager.page, "דפדוף בליגות שלי");
    await expect(manager.page).toHaveURL(/leagueCursor=/);
    await expect(
      manager.page.getByText(fixture.selectorLastLeagueName, { exact: true }),
    ).toBeVisible();
    await manager.page
      .getByRole("navigation", { name: "דפדוף בליגות שלי" })
      .getByRole("link", { name: "לעמוד הבא" })
      .click();
    await expect(
      manager.page
        .getByRole("navigation", { name: "דפדוף בליגות שלי" })
        .getByText("הגעת לסוף הרשימה."),
    ).toBeVisible();

    await manager.page.goto(
      `/leagues/${leagueId}/members?status=pending_approval`,
    );
    await followNextByKeyboard(
      manager.page,
      "דפדוף בבקשות ההצטרפות",
    );
    await expect(
      manager.page.getByText(fixture.queueLastDisplayName, { exact: true }),
    ).toBeVisible();
    await expect(
      manager.page
        .getByRole("navigation", { name: "דפדוף בבקשות ההצטרפות" })
        .getByText("הגעת לסוף הרשימה."),
    ).toBeVisible();
    await manager.page.goto(`/leagues/${leagueId}/members?status=approved`);
    await expect(
      manager.page.getByRole("heading", { name: "אין בקשות במצב שנבחר" }),
    ).toBeVisible();

    await manager.page.goto("/admin/matches?round=77");
    await expectNoHorizontalOverflow(manager.page);
    await followNextByKeyboard(manager.page, "דפדוף במשחקי המערכת");
    await expect(
      manager.page.locator(
        `form[data-manual-match-id="${fixture.futureMatchIds[0]}"]`,
      ),
    ).toHaveCount(1);
    await expect(
      manager.page
        .getByRole("navigation", { name: "דפדוף במשחקי המערכת" })
        .getByText("הגעת לסוף הרשימה."),
    ).toBeVisible();
    await manager.page.goto("/admin/matches?round=78");
    await expect(
      manager.page.getByText("לא נמצאו משחקים שמתאימים למסננים שנבחרו."),
    ).toBeVisible();

    await viewer.page.goto("/dashboard");
    await followNextByKeyboard(viewer.page, "דפדוף בליגות שלי");
    await expect(viewer.page).toHaveURL(/leagueCursor=/);

    await viewer.page.goto(`/leagues/${leagueId}/members`);
    await expectNoHorizontalOverflow(viewer.page);
    await expect(
      viewer.page.getByRole("heading", { name: "חברי הליגה" }),
    ).toBeVisible();
    const activeMembers = viewer.page.getByRole("region", {
      name: "חברים פעילים",
    });
    await expect(activeMembers.getByRole("listitem")).toHaveCount(25);
    await expect(activeMembers).not.toContainText("@example.com");
    await expect(
      viewer.page.getByRole("heading", { name: "בקשות הצטרפות" }),
    ).toHaveCount(0);
    await expect(viewer.page.getByLabel("מצב בקשה")).toHaveCount(0);
    await followNextByKeyboard(viewer.page, "דפדוף בחברי הליגה");
    await expect(viewer.page).toHaveURL(/membersCursor=/);
    await expect(
      viewer.page
        .getByRole("region", { name: "חברים פעילים" })
        .getByRole("listitem"),
    ).toHaveCount(2);
    await expect(
      viewer.page
        .getByRole("navigation", { name: "דפדוף בחברי הליגה" })
        .getByText("הגעת לסוף הרשימה."),
    ).toBeVisible();

    await viewer.page.goto("/dashboard");
    await followNextByKeyboard(
      viewer.page,
      "דפדוף בבקשות ההצטרפות שלי",
    );
    await expect(
      viewer.page.getByText(`ליגת בקשה ${namespace} 1`, { exact: true }),
    ).toBeVisible();
    await expect(
      viewer.page
        .getByRole("navigation", {
          name: "דפדוף בבקשות ההצטרפות שלי",
        })
        .getByText("הגעת לסוף הרשימה."),
    ).toBeVisible();

    await viewer.page.goto(`/leagues/${leagueId}/matches`);
    await expectNoHorizontalOverflow(viewer.page);
    await followNextByKeyboard(viewer.page, "דפדוף במשחקי הליגה");
    await expect(
      viewer.page.locator(`a[href*="${fixture.futureMatchIds[30]}"]`),
    ).toHaveCount(1);
    await viewer.page.goto(`/leagues/${leagueId}/matches?round=78`);
    await expect(
      viewer.page.getByRole("heading", { name: "אין משחקים" }),
    ).toBeVisible();

    await viewer.page.goto(
      `/matches/${fixture.detailMatchId}?league=${leagueId}`,
    );
    await expect(
      viewer.page.getByRole("heading", { name: /קבוצת עמוד בית/ }),
    ).toBeVisible();
    await followNextByKeyboard(viewer.page, "דפדוף בבחירת ליגה");
    await expect(
      viewer.page.getByText(fixture.selectorLastLeagueName, { exact: true }),
    ).toBeVisible();
    await followNextByKeyboard(
      viewer.page,
      "דפדוף בניחושי חברי הליגה",
    );
    await expect(
      viewer.page.getByText(fixture.predictionLastDisplayName, { exact: true }),
    ).toBeVisible();
    await expect(
      viewer.page
        .getByRole("navigation", {
          name: "דפדוף בניחושי חברי הליגה",
        })
        .getByText("הגעת לסוף הרשימה."),
    ).toBeVisible();

    await manager.page.goto(`/leagues/${fixture.foreignLeagueId}/matches`);
    await expect(
      manager.page.getByRole("heading", { name: "הדף לא נמצא" }),
    ).toBeVisible();
    await manager.page.goto(`/leagues/${fixture.foreignLeagueId}/members`);
    await expect(
      manager.page.getByRole("heading", { name: "הדף לא נמצא" }),
    ).toBeVisible();
  });
});
