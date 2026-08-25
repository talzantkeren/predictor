import {
  devices,
  expect,
  type BrowserContextOptions,
  type Page,
  test,
} from "@playwright/test";

import {
  addActiveLeagueMemberInDisposableLocalDatabase,
  seedManagerReportStatusesInDisposableLocalDatabase,
  setLeagueStatusInDisposableLocalDatabase,
} from "./support/local-database";
import { registerConfirmedUser } from "./support/local-auth";

test.use({ screenshot: "off", trace: "off", video: "off" });

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type PasswordSessionResponse = {
  access_token?: unknown;
  user?: { id?: unknown };
};

function getLocalSupabaseConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Local Supabase configuration is unavailable.");
  }
  return { publishableKey, url };
}

async function getUserId(email: string, password: string) {
  const { publishableKey, url } = getLocalSupabaseConfiguration();
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
    throw new Error("Local report fixture sign-in failed.");
  }

  const payload = (await response.json()) as PasswordSessionResponse;
  if (
    !response.ok ||
    typeof payload.access_token !== "string" ||
    typeof payload.user?.id !== "string" ||
    !canonicalUuidPattern.test(payload.user.id)
  ) {
    throw new Error("Local report fixture identity was unavailable.");
  }

  return payload.user.id;
}

function getContextOptions(projectName: string): BrowserContextOptions {
  const descriptor = projectName.startsWith("mobile-")
    ? devices["Pixel 5"]
    : devices["Desktop Chrome"];
  return {
    baseURL: "http://localhost:3000",
    deviceScaleFactor: descriptor.deviceScaleFactor,
    hasTouch: descriptor.hasTouch,
    isMobile: descriptor.isMobile,
    timezoneId: "Asia/Jerusalem",
    userAgent: descriptor.userAgent,
    viewport: descriptor.viewport,
  };
}

async function createLeague(page: Page, leagueName: string) {
  await page.goto("/leagues/new");
  await page.getByLabel("שם הליגה").fill(leagueName);
  await page.getByRole("button", { name: "יצירת ליגה", exact: true }).click();
  await expect(page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
  const leagueId = new URL(page.url()).pathname.split("/").at(-1);
  if (!leagueId || !canonicalUuidPattern.test(leagueId)) {
    throw new Error("Created report league ID was invalid.");
  }
  return leagueId;
}

test.describe("manager-only non-monetary reports", () => {
  test("shows bounded membership counts and current/final standings only to the exact manager", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const shortSuffix = suffix.slice(-6);
    const password = `Aa1!${crypto.randomUUID()}`;
    const contextOptions = getContextOptions(testInfo.project.name);
    const targetLeagueName = `ליגת דוח ${suffix}`;
    const managerEmail = `report-manager-${suffix}@example.com`;
    const memberEmail = `report-member-${suffix}@example.com`;
    const otherManagerEmail = `report-other-manager-${suffix}@example.com`;
    const requesterEmail = `report-requester-${suffix}@example.com`;

    const manager = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: managerEmail,
      password,
      displayName: `מנהלת דוח ${shortSuffix}`,
      contextOptions,
    });
    const leagueId = await createLeague(manager.page, targetLeagueName);
    const managerId = await getUserId(managerEmail, password);

    const member = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: memberEmail,
      password,
      displayName: `חבר פעיל ${shortSuffix}`,
      contextOptions,
    });
    const memberId = await getUserId(memberEmail, password);
    addActiveLeagueMemberInDisposableLocalDatabase({
      leagueId,
      userId: memberId,
      approvedBy: managerId,
    });

    const otherManager = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: otherManagerEmail,
      password,
      displayName: `מנהל ליגה אחרת ${shortSuffix}`,
      contextOptions,
    });
    const otherManagerId = await getUserId(otherManagerEmail, password);
    await createLeague(otherManager.page, `ליגה אחרת ${suffix}`);

    const requester = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: requesterEmail,
      password,
      displayName: `מבקשת הצטרפות ${shortSuffix}`,
      contextOptions,
    });
    const requesterId = await getUserId(requesterEmail, password);

    seedManagerReportStatusesInDisposableLocalDatabase({
      leagueId,
      managerId,
      removedPendingUserId: otherManagerId,
      approvalUserId: requesterId,
    });
    setLeagueStatusInDisposableLocalDatabase(leagueId, "active");

    const guest = await browser.newContext(contextOptions);
    const guestPage = await guest.newPage();
    await guestPage.goto(`/leagues/${leagueId}/reports`);
    await expect(guestPage).toHaveURL((url) => {
      return (
        url.pathname === "/login" &&
        url.searchParams.get("next") === `/leagues/${leagueId}/reports`
      );
    });
    await guest.close();

    await manager.page.goto(`/leagues/${leagueId}`);
    const reportsLink = manager.page.getByRole("link", {
      name: "דוחות",
      exact: true,
    });
    await expect(reportsLink).toBeVisible();
    await reportsLink.click();
    await expect(manager.page).toHaveURL(`/leagues/${leagueId}/reports`);
    await expect(
      manager.page.getByRole("heading", { name: "דוח מנהל" }),
    ).toBeVisible();
    await expect(manager.page.getByText(targetLeagueName)).toBeVisible();
    await expect(manager.page.getByText("פעילה", { exact: true })).toBeVisible();
    await expect(
      manager.page.getByRole("heading", { name: "דירוג נוכחי" }),
    ).toBeVisible();
    await expect(
      manager.page.getByRole("heading", { name: "דירוג סופי" }),
    ).toHaveCount(0);

    const summary = manager.page.locator(
      'section[aria-labelledby="membership-summary-title"]',
    );
    for (const [label, count] of [
      ["חברים פעילים", "2"],
      ["ממתינות לאישור", "1"],
      ["ממתינות להשלמה", "1"],
      ["בקשות שנדחו", "1"],
    ] as const) {
      const card = summary.locator("dl > div").filter({ hasText: label });
      await expect(card.locator("dd").first()).toHaveText(count);
    }

    await expect(
      manager.page.getByRole("heading", { name: "דוח מידע בלבד" }),
    ).toBeVisible();
    await expect(
      manager.page.getByText(/אינה מציגה או מנהלת תשלומים/),
    ).toBeVisible();
    await expect(
      manager.page.locator('a[href*="payment"], a[href*="finance"]'),
    ).toHaveCount(0);
    const reportText = await manager.page.locator("body").innerText();
    expect(reportText).not.toMatch(/₪|ש["״]ח|%|\bAI\b/i);

    if (testInfo.project.name.startsWith("mobile-")) {
      await expect(manager.page.locator("ol > li")).toHaveCount(2);
      await expect(
        manager.page.getByText("מקום 1", { exact: true }),
      ).toHaveCount(2);
    } else {
      await expect(
        manager.page.getByRole("table", {
          name: /דירוג נוכחי של חברי הליגה/,
        }),
      ).toBeVisible();
      await expect(manager.page.getByRole("row")).toHaveCount(3);
    }

    const layout = await manager.page.evaluate(() => ({
      dir: document.documentElement.dir,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.dir).toBe("rtl");
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);

    await member.page.goto(`/leagues/${leagueId}`);
    await expect(
      member.page.getByRole("link", { name: "דוחות", exact: true }),
    ).toHaveCount(0);
    await member.page.goto(`/leagues/${leagueId}/reports`);
    await expect(
      member.page.getByRole("heading", { name: "הדף לא נמצא" }),
    ).toBeVisible();
    await expect(member.page.getByText(targetLeagueName)).toHaveCount(0);

    await otherManager.page.goto(`/leagues/${leagueId}/reports`);
    await expect(
      otherManager.page.getByRole("heading", { name: "הדף לא נמצא" }),
    ).toBeVisible();
    await expect(otherManager.page.getByText(targetLeagueName)).toHaveCount(0);

    setLeagueStatusInDisposableLocalDatabase(leagueId, "completed");
    await manager.page.reload();
    await expect(
      manager.page.getByRole("heading", { name: "דירוג סופי" }),
    ).toBeVisible();
    await expect(
      manager.page.getByRole("heading", { name: "דירוג נוכחי" }),
    ).toHaveCount(0);

    await manager.context.close();
    await member.context.close();
    await otherManager.context.close();
    await requester.context.close();
  });
});
