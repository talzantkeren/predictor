import {
  devices,
  expect,
  type BrowserContextOptions,
  type Locator,
  type Page,
  test,
} from "./support/stream-safe-test";

import { closeContextsAfterResponseStreams } from "./support/response-streams";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

import {
  grantSystemAdminInDisposableLocalDatabase,
  removeLifecycleFixtureFromDisposableLocalDatabase,
  seedLifecycleCatalogInDisposableLocalDatabase,
  type LifecycleCatalogFixtureIds,
} from "./support/local-database";
import { registerConfirmedUser } from "./support/local-auth";

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

function getLocalSupabaseConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Local Supabase configuration is unavailable.");
  }
  return { publishableKey, url };
}

async function getLocalUserId(email: string, password: string) {
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
    throw new Error("Local lifecycle identity request failed.");
  }
  const payload = (await response.json()) as PasswordSessionResponse;
  if (
    !response.ok ||
    typeof payload.access_token !== "string" ||
    typeof payload.user?.id !== "string" ||
    !canonicalUuidPattern.test(payload.user.id)
  ) {
    throw new Error("Local lifecycle identity was unavailable.");
  }
  return payload.user.id;
}

async function navigateToInvite(page: Page, inviteUrl: string) {
  const parsed = new URL(inviteUrl);
  if (!/^#invite=[A-Za-z0-9_-]{43}$/.test(parsed.hash)) {
    throw new Error("Sensitive lifecycle invite URL was malformed.");
  }
  try {
    await page.evaluate((target) => window.location.assign(target), inviteUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(() => window.location.hash === "");
  } catch {
    throw new Error("Sensitive lifecycle invite navigation failed.");
  }
}

async function createLeague(
  page: Page,
  leagueName: string,
  seasonId: string,
) {
  await page.goto("/leagues/new");
  await page.getByLabel("שם הליגה").fill(leagueName);
  await page.getByLabel("עונה").selectOption(seasonId);
  await page.getByRole("button", { name: "יצירת ליגה", exact: true }).click();
  await expect(page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
  const leagueId = new URL(page.url()).pathname.split("/").at(-1);
  if (!leagueId || !canonicalUuidPattern.test(leagueId)) {
    throw new Error("Created lifecycle league ID was invalid.");
  }
  return leagueId;
}

function nextSafeUtcMinute() {
  const now = new Date();
  const kickoff = new Date(now);
  kickoff.setUTCSeconds(0, 0);
  kickoff.setUTCMinutes(kickoff.getUTCMinutes() + 1);
  if (kickoff.getTime() - now.getTime() < 30_000) {
    kickoff.setUTCMinutes(kickoff.getUTCMinutes() + 1);
  }
  return kickoff;
}

async function capturePresentationFallback(
  page: Page,
  testInfo: { project: { name: string } },
  filename: string,
  focus?: Locator,
) {
  if (
    process.env.CAPTURE_PRESENTATION_ASSETS !== "true" ||
    testInfo.project.name !== "desktop-chromium"
  ) {
    return;
  }

  const outputDirectory = join(process.cwd(), "presentation", "fallback");
  mkdirSync(outputDirectory, { recursive: true });
  await focus?.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(outputDirectory, filename),
    fullPage: false,
    animations: "disabled",
  });
}

async function expectReportPoints({
  page,
  displayName,
  points,
  mobile,
}: {
  page: Page;
  displayName: string;
  points: number;
  mobile: boolean;
}) {
  if (mobile) {
    const card = page.locator("ol > li").filter({ hasText: displayName });
    await expect(card).toBeVisible();
    await expect(card.getByText(String(points), { exact: true }).first()).toBeVisible();
    return;
  }
  const row = page.getByRole("row").filter({ hasText: displayName });
  await expect(row).toBeVisible();
  await expect(row.locator("td").nth(1)).toHaveText(String(points));
}

test.describe("Slice 9 product lifecycle", () => {
  let cleanup:
    | {
        ids: LifecycleCatalogFixtureIds;
        leagueId?: string;
        systemAdminUserId?: string;
      }
    | undefined;

  test.afterEach(() => {
    if (!cleanup) return;
    removeLifecycleFixtureFromDisposableLocalDatabase(cleanup);
    cleanup = undefined;
  });

  test("runs open to active/current to completed/final with frozen reconciliation", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(15_000);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const password = `Aa1!${crypto.randomUUID()}`;
    const managerEmail = `lifecycle-manager-${suffix}@example.com`;
    const memberEmail = `lifecycle-member-${suffix}@example.com`;
    const managerName = "מנהלת ההדגמה";
    const memberName = "חברת ההדגמה";
    const leagueName = "ליגת ההדגמה";
    const contextOptions = getContextOptions(testInfo.project.name);
    const ids: LifecycleCatalogFixtureIds = {
      competitionId: crypto.randomUUID(),
      seasonId: crypto.randomUUID(),
      homeTeamId: crypto.randomUUID(),
      awayTeamId: crypto.randomUUID(),
    };
    cleanup = { ids };
    const catalog = seedLifecycleCatalogInDisposableLocalDatabase(ids);

    const manager = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: managerEmail,
      password,
      displayName: managerName,
      contextOptions,
    });
    manager.page.setDefaultTimeout(15_000);
    const managerId = await getLocalUserId(managerEmail, password);
    cleanup.systemAdminUserId = managerId;
    grantSystemAdminInDisposableLocalDatabase(managerId);

    const leagueId = await createLeague(manager.page, leagueName, ids.seasonId);
    cleanup.leagueId = leagueId;
    await expect(manager.page.getByText("טיוטה", { exact: true })).toBeVisible();

    await manager.page.getByRole("link", { name: "ניהול קישור ההזמנה" }).click();
    await manager.page.getByRole("button", { name: "יצירת קישור חדש" }).click();
    const inviteUrl = await manager.page.getByLabel("הקישור החדש").inputValue();
    await manager.page.goto(`/leagues/${leagueId}`);
    await expect(
      manager.page.getByText("פתוחה להצטרפות", { exact: true }),
    ).toBeVisible();
    await capturePresentationFallback(
      manager.page,
      testInfo,
      "01-open-league.png",
      manager.page.getByRole("heading", { name: leagueName }),
    );

    const member = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: memberEmail,
      password,
      displayName: memberName,
      contextOptions,
    });
    member.page.setDefaultTimeout(15_000);
    await navigateToInvite(member.page, inviteUrl);
    await expect(member.page.getByRole("heading", { name: leagueName })).toBeVisible();
    await member.page
      .getByRole("button", { name: "פתיחת בקשת הצטרפות" })
      .click();
    await expect(
      member.page.getByRole("heading", { name: "הבקשה ממתינה לתמונת Demo" }),
    ).toBeVisible();
    const proofBytes = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: { r: 30, g: 120, b: 210 },
      },
    })
      .png()
      .toBuffer();
    await member.page
      .getByLabel("תמונת Demo מסוג JPEG, PNG או WebP")
      .setInputFiles({
        name: "lifecycle-demo.png",
        mimeType: "image/png",
        buffer: proofBytes,
      });
    await member.page
      .getByRole("button", { name: "העלאת תמונת Demo", exact: true })
      .click();
    await expect(
      member.page.getByRole("heading", {
        name: "הבקשה ממתינה לבדיקת מנהל/ת הליגה",
      }),
    ).toBeVisible();

    await manager.page.goto(`/leagues/${leagueId}/members`);
    await manager.page
      .getByRole("button", { name: "אישור וצירוף לליגה" })
      .click();
    const activeMembers = manager.page.getByRole("region", {
      name: "חברים פעילים",
    });
    await expect(activeMembers.getByText(managerName, { exact: true })).toBeVisible();
    await expect(activeMembers.getByText(memberName, { exact: true })).toBeVisible();
    await expect(activeMembers).not.toContainText(managerEmail);
    await expect(activeMembers).not.toContainText(memberEmail);
    await capturePresentationFallback(
      manager.page,
      testInfo,
      "02-open-approved-members.png",
      activeMembers,
    );

    const kickoff = nextSafeUtcMinute();
    await manager.page.goto("/admin/matches");
    const createSection = manager.page.locator("section").filter({
      has: manager.page.getByRole("heading", {
        name: "יצירת משחק מקטלוג קיים",
      }),
    });
    const createForm = createSection.locator("form");
    const matchId = await createForm.getAttribute("data-manual-match-id");
    if (!matchId || !canonicalUuidPattern.test(matchId)) {
      throw new Error("Server-issued lifecycle match ID was invalid.");
    }
    await createSection.getByLabel("עונה קיימת").selectOption(ids.seasonId);
    await createSection.getByLabel("מחזור").fill("1");
    await createSection
      .getByLabel("מועד פתיחה (UTC)")
      .fill(kickoff.toISOString().slice(0, 16));
    await createSection
      .getByLabel("קבוצת בית קיימת")
      .selectOption(ids.homeTeamId);
    await createSection
      .getByLabel("קבוצת חוץ קיימת")
      .selectOption(ids.awayTeamId);
    await createSection.getByRole("button", { name: "יצירת משחק ידני" }).click();
    await expect(
      createSection.getByText("המשחק נוצר ונשמר בבעלות ידנית."),
    ).toBeVisible();

    await manager.page.goto(`/leagues/${leagueId}`);
    const startButton = manager.page.getByRole("button", {
      name: "הפעלת הליגה",
    });
    await startButton.click();
    await expect(startButton).toBeHidden();
    await expect(manager.page.getByText("פעילה", { exact: true })).toBeVisible();

    await member.page.goto(`/leagues/${leagueId}/matches`);
    const memberMatch = member.page.locator(`li[data-match-id="${matchId}"]`);
    await expect(memberMatch).toBeVisible();
    await memberMatch
      .getByRole("link", { name: "פתיחת המשחק והניחוש" })
      .click();
    await member.page.getByLabel(`שערים — ${catalog.homeTeamName}`).fill("2");
    await member.page.getByLabel(`שערים — ${catalog.awayTeamName}`).fill("1");
    await member.page.getByRole("button", { name: "שמירת הניחוש" }).click();
    await expect(
      member.page.getByText("הניחוש נשמר וניתן לעריכה עד מועד הנעילה."),
    ).toBeVisible();

    const waitForKickoff = kickoff.getTime() - Date.now() + 1_500;
    if (waitForKickoff > 0) {
      await manager.page.waitForTimeout(waitForKickoff);
    }
    await manager.page.goto(`/admin/matches?season=${ids.seasonId}`);
    const resultCard = manager.page.locator("article").filter({
      has: manager.page.getByRole("heading", {
        name: `${catalog.homeTeamName} — ${catalog.awayTeamName}`,
        exact: true,
      }),
    });
    await expect(resultCard).toBeVisible();
    await resultCard.getByLabel("מצב משחק").selectOption("finished");
    await resultCard.getByLabel(`שערי ${catalog.homeTeamName}`).fill("2");
    await resultCard.getByLabel(`שערי ${catalog.awayTeamName}`).fill("1");
    await resultCard.getByRole("button", { name: "שמירת תוצאה" }).click();
    await expect(
      resultCard.getByText(
        "התוצאה נשמרה והדירוגים חושבו מחדש. בליגה שהושלמה נדרש יישוב מפורש.",
      ),
    ).toBeVisible();

    await manager.page.goto(`/leagues/${leagueId}/reports`);
    await expect(manager.page.getByRole("heading", { name: "דירוג נוכחי" })).toBeVisible();
    await expect(manager.page.getByText("הליגה טרם הושלמה")).toBeVisible();
    await expectReportPoints({
      page: manager.page,
      displayName: memberName,
      points: 3,
      mobile: testInfo.project.name.startsWith("mobile-"),
    });
    await capturePresentationFallback(
      manager.page,
      testInfo,
      "03-active-current-report.png",
      manager.page.getByRole("heading", { name: "דירוג נוכחי" }),
    );

    await manager.page.goto(`/leagues/${leagueId}`);
    const completeButton = manager.page.getByRole("button", {
      name: "השלמת הליגה",
    });
    await completeButton.click();
    await expect(completeButton).toBeHidden();
    await expect(manager.page.getByText("הסתיימה", { exact: true })).toBeVisible();

    await member.page.goto(`/leagues/${leagueId}/matches`);
    await expect(
      member.page.getByLabel(
        `תוצאה רשמית: ${catalog.homeTeamName} 2, ${catalog.awayTeamName} 1`,
      ),
    ).toBeVisible();
    await expect(
      member.page.getByLabel(
        `הניחוש שלי: ${catalog.homeTeamName} 2, ${catalog.awayTeamName} 1`,
      ),
    ).toBeVisible();
    await member.page.goto(`/leagues/${leagueId}/members`);
    await expect(
      member.page
        .getByRole("region", { name: "חברים פעילים" })
        .getByText(memberName, { exact: true }),
    ).toBeVisible();
    await manager.page.goto(`/leagues/${leagueId}/reports`);
    await expect(manager.page.getByRole("heading", { name: "דירוג סופי" })).toBeVisible();
    await expectReportPoints({
      page: manager.page,
      displayName: memberName,
      points: 3,
      mobile: testInfo.project.name.startsWith("mobile-"),
    });
    await capturePresentationFallback(
      manager.page,
      testInfo,
      "04-completed-final-frozen.png",
      manager.page.getByRole("heading", { name: "דירוג סופי" }),
    );

    await manager.page.goto(`/admin/matches?season=${ids.seasonId}`);
    const completedCard = manager.page.locator("article").filter({
      has: manager.page.getByRole("heading", {
        name: `${catalog.homeTeamName} — ${catalog.awayTeamName}`,
        exact: true,
      }),
    });
    await completedCard.getByLabel("מצב משחק").selectOption("finished");
    await completedCard.getByLabel(`שערי ${catalog.homeTeamName}`).fill("1");
    await completedCard.getByLabel(`שערי ${catalog.awayTeamName}`).fill("1");
    await completedCard.getByRole("button", { name: "עדכון תוצאה" }).click();
    await expect(
      completedCard.getByText(
        "התוצאה נשמרה והדירוגים חושבו מחדש. בליגה שהושלמה נדרש יישוב מפורש.",
      ),
    ).toBeVisible();

    await member.page.goto(`/leagues/${leagueId}/matches`);
    await expect(
      member.page.getByLabel(
        `תוצאה רשמית: ${catalog.homeTeamName} 2, ${catalog.awayTeamName} 1`,
      ),
    ).toBeVisible();
    await manager.page.goto("/admin/matches");
    const reconciliation = manager.page.locator("article").filter({
      hasText: leagueId,
    });
    await expect(reconciliation).toContainText(`${catalog.homeTeamName} — ${catalog.awayTeamName}`);
    const applyReconciliation = reconciliation.getByRole("button", {
      name: "החלת התוצאה הסופית",
    });
    await applyReconciliation.click();
    await expect(reconciliation).toBeHidden();

    await member.page.goto(`/leagues/${leagueId}/matches`);
    await expect(
      member.page.getByLabel(
        `תוצאה רשמית: ${catalog.homeTeamName} 1, ${catalog.awayTeamName} 1`,
      ),
    ).toBeVisible();
    await manager.page.goto(`/leagues/${leagueId}/reports`);
    await expect(manager.page.getByRole("heading", { name: "דירוג סופי" })).toBeVisible();
    await expectReportPoints({
      page: manager.page,
      displayName: memberName,
      points: 0,
      mobile: testInfo.project.name.startsWith("mobile-"),
    });
    await capturePresentationFallback(
      manager.page,
      testInfo,
      "05-completed-final-reconciled.png",
      manager.page.getByRole("heading", { name: "דירוג סופי" }),
    );

    const layout = await member.page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      dir: document.documentElement.dir,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.dir).toBe("rtl");
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);

    await closeContextsAfterResponseStreams([
      manager.context,
      member.context,
    ]);
  });
});
