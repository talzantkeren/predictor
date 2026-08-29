import {
  devices,
  expect,
  type BrowserContextOptions,
  type Page,
  test,
} from "./support/stream-safe-test";

import { closeContextsAfterResponseStreams } from "./support/response-streams";

import {
  addActiveLeagueMemberInDisposableLocalDatabase,
  attachApiFootballIdentityToScoringMatchInDisposableLocalDatabase,
  grantSystemAdminInDisposableLocalDatabase,
  moveMatchKickoffToPastInDisposableLocalDatabase,
  readManualMatchBoundaryPersistenceInDisposableLocalDatabase,
  readManualOverrideClearPersistenceInDisposableLocalDatabase,
  removeScoringFixturesFromDisposableLocalDatabase,
  seedScoringMatchInDisposableLocalDatabase,
  type ScoringMatchFixtureIds,
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

async function fetchSensitiveUrl(url: string, init?: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error("Sensitive local scoring request failed.");
  }
}

async function signInForDataApi(email: string, password: string) {
  const { publishableKey, url } = getLocalSupabaseConfiguration();
  const response = await fetchSensitiveUrl(
    `${url}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );
  const payload = (await response.json()) as PasswordSessionResponse;
  if (
    !response.ok ||
    typeof payload.access_token !== "string" ||
    typeof payload.user?.id !== "string" ||
    !canonicalUuidPattern.test(payload.user.id)
  ) {
    throw new Error("Local scoring Data API sign-in failed.");
  }
  return { accessToken: payload.access_token, userId: payload.user.id };
}

async function savePrediction(
  accessToken: string,
  input: {
    leagueId: string;
    matchId: string;
    homeScore: number;
    awayScore: number;
  },
) {
  const { publishableKey, url } = getLocalSupabaseConfiguration();
  const response = await fetchSensitiveUrl(
    `${url}/rest/v1/rpc/save_prediction`,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_league_id: input.leagueId,
        p_match_id: input.matchId,
        p_predicted_home_score: input.homeScore,
        p_predicted_away_score: input.awayScore,
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Local scoring prediction fixture could not be saved.");
  }
}

async function attemptDirectScoreAsUser(
  accessToken: string,
  matchId: string,
) {
  const { publishableKey, url } = getLocalSupabaseConfiguration();
  return fetchSensitiveUrl(`${url}/rest/v1/rpc/score_match`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_match_id: matchId,
      p_status: "finished",
      p_home_score: 9,
      p_away_score: 9,
      p_is_manual_override: true,
      p_source: "manual",
    }),
  });
}

async function attemptDirectClearAsUser(
  accessToken: string,
  matchId: string,
) {
  const { publishableKey, url } = getLocalSupabaseConfiguration();
  return fetchSensitiveUrl(
    `${url}/rest/v1/rpc/clear_manual_match_override`,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_match_id: matchId }),
    },
  );
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
    timezoneId: projectName.startsWith("mobile-") ? "Asia/Jerusalem" : "UTC",
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
    throw new Error("Created scoring league ID was invalid.");
  }
  return leagueId;
}

test.describe("manual results and competition-ranked standings", () => {
  let cleanup:
    | {
        ids: ScoringMatchFixtureIds;
        manualMatchId?: string;
        systemAdminUserId: string;
      }
    | undefined;

  test.afterEach(() => {
    if (!cleanup) return;
    removeScoringFixturesFromDisposableLocalDatabase(cleanup);
    cleanup = undefined;
  });

  test("allows a system operator, denies a member, and renders shared rank 1 then rank 3", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const shortSuffix = suffix.slice(-6);
    const password = `Aa1!${crypto.randomUUID()}`;
    const contextOptions = getContextOptions(testInfo.project.name);
    const adminEmail = `scoring-admin-${suffix}@example.com`;
    const memberAEmail = `scoring-member-a-${suffix}@example.com`;
    const memberBEmail = `scoring-member-b-${suffix}@example.com`;
    const adminDisplayName = `מנהלת תוצאות ${shortSuffix}`;
    const memberADisplayName = `חברה שווה ${shortSuffix}`;
    const memberBDisplayName = `חבר שלישי ${shortSuffix}`;

    const admin = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: adminEmail,
      password,
      displayName: adminDisplayName,
      contextOptions,
    });
    const leagueId = await createLeague(
      admin.page,
      `ליגת דירוג Slice 6 ${suffix}`,
    );
    const adminSession = await signInForDataApi(adminEmail, password);

    const memberA = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: memberAEmail,
      password,
      displayName: memberADisplayName,
      contextOptions,
    });
    const memberASession = await signInForDataApi(memberAEmail, password);
    const memberB = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: memberBEmail,
      password,
      displayName: memberBDisplayName,
      contextOptions,
    });
    const memberBSession = await signInForDataApi(memberBEmail, password);

    grantSystemAdminInDisposableLocalDatabase(adminSession.userId);
    addActiveLeagueMemberInDisposableLocalDatabase({
      leagueId,
      userId: memberASession.userId,
      approvedBy: adminSession.userId,
    });
    addActiveLeagueMemberInDisposableLocalDatabase({
      leagueId,
      userId: memberBSession.userId,
      approvedBy: adminSession.userId,
    });

    const ids: ScoringMatchFixtureIds = {
      homeTeamId: crypto.randomUUID(),
      awayTeamId: crypto.randomUUID(),
      matchId: crypto.randomUUID(),
    };
    cleanup = { ids, systemAdminUserId: adminSession.userId };
    const names = seedScoringMatchInDisposableLocalDatabase(ids);

    await Promise.all([
      savePrediction(adminSession.accessToken, {
        leagueId,
        matchId: ids.matchId,
        homeScore: 2,
        awayScore: 1,
      }),
      savePrediction(memberASession.accessToken, {
        leagueId,
        matchId: ids.matchId,
        homeScore: 2,
        awayScore: 1,
      }),
      savePrediction(memberBSession.accessToken, {
        leagueId,
        matchId: ids.matchId,
        homeScore: 0,
        awayScore: 1,
      }),
    ]);
    moveMatchKickoffToPastInDisposableLocalDatabase(ids.matchId);

    const unauthorizedScore = await attemptDirectScoreAsUser(
      memberASession.accessToken,
      ids.matchId,
    );
    expect(unauthorizedScore.ok).toBe(false);
    await memberA.page.goto("/admin/matches");
    await expect(
      memberA.page.getByRole("heading", { name: "הדף לא נמצא" }),
    ).toBeVisible();

    await admin.page.goto("/admin/matches");
    await expect(
      admin.page.getByRole("heading", { name: "ניהול משחקים ותוצאות" }),
    ).toBeVisible();
    const createSection = admin.page.locator("section").filter({
      has: admin.page.getByRole("heading", {
        name: "יצירת משחק מקטלוג קיים",
      }),
    });
    const createForm = createSection.locator("form");
    await expect(
      admin.page.locator('input[name="operation"], input[name="matchId"]'),
    ).toHaveCount(0);
    const manualMatchId = await createForm.getAttribute("data-manual-match-id");
    if (!manualMatchId || !canonicalUuidPattern.test(manualMatchId)) {
      throw new Error("The server-issued Manual match ID was invalid.");
    }
    cleanup.manualMatchId = manualMatchId;
    await createSection.getByLabel("עונה קיימת").selectOption(
      "26000000-0000-4000-8000-000000000027",
    );
    await createSection.getByLabel("קבוצת בית קיימת").selectOption(ids.homeTeamId);
    await createSection.getByLabel("קבוצת חוץ קיימת").selectOption(ids.awayTeamId);
    await createSection.getByLabel("מועד פתיחה (UTC)").fill("2099-10-17T16:00");
    await createForm.evaluate((form, attackerMatchId) => {
      for (const [name, value] of [
        ["operation", "correct"],
        ["matchId", attackerMatchId],
      ]) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        input.dataset.e2eUntrustedContext = "true";
        form.append(input);
      }
    }, ids.matchId);
    await createSection.getByRole("button", { name: "יצירת משחק ידני" }).click();
    await expect(
      createSection.getByText("המשחק נוצר ונשמר בבעלות ידנית."),
    ).toBeVisible();
    expect(
      readManualMatchBoundaryPersistenceInDisposableLocalDatabase({
        attackerMatchId: ids.matchId,
        awayTeamId: ids.awayTeamId,
        capturedMatchId: manualMatchId,
        homeTeamId: ids.homeTeamId,
      }),
    ).toEqual({
      attackerDefinitionMatchCount: 1,
      capturedMatchCount: 1,
      capturedPayloadMatchCount: 1,
    });
    await createForm.evaluate((form) => {
      form
        .querySelectorAll('[data-e2e-untrusted-context="true"]')
        .forEach((input) => input.remove());
    });
    await expect(
      admin.page.locator('input[name="operation"], input[name="matchId"]'),
    ).toHaveCount(0);
    await createSection.getByRole("button", { name: "יצירת משחק ידני" }).click();
    await expect(
      createSection.getByText("המשחק כבר תואם לפרטים שנשלחו."),
    ).toBeVisible();
    await expect(createForm).toHaveAttribute("data-manual-match-id", manualMatchId);
    expect(
      readManualMatchBoundaryPersistenceInDisposableLocalDatabase({
        attackerMatchId: ids.matchId,
        awayTeamId: ids.awayTeamId,
        capturedMatchId: manualMatchId,
        homeTeamId: ids.homeTeamId,
      }),
    ).toEqual({
      attackerDefinitionMatchCount: 1,
      capturedMatchCount: 1,
      capturedPayloadMatchCount: 1,
    });

    const externalId =
      attachApiFootballIdentityToScoringMatchInDisposableLocalDatabase(
        ids.matchId,
      );
    const unauthorizedClear = await attemptDirectClearAsUser(
      memberASession.accessToken,
      ids.matchId,
    );
    expect(unauthorizedClear.ok).toBe(false);
    await admin.page.reload();

    const matchCard = admin.page
      .locator("article")
      .filter({
        has: admin.page.locator(
          `form[data-manual-match-id="${ids.matchId}"]`,
        ),
      });
    await expect(matchCard).toHaveCount(1);
    await expect(
      matchCard.getByRole("heading", {
        name: `${names.homeTeamName} — ${names.awayTeamName}`,
        exact: true,
      }),
    ).toBeVisible();
    await matchCard.getByLabel("מצב משחק").selectOption("finished");
    await matchCard.getByLabel(`שערי ${names.homeTeamName}`).fill("2");
    await matchCard.getByLabel(`שערי ${names.awayTeamName}`).fill("1");
    await matchCard.getByRole("button", { name: "שמירת תוצאה" }).click();
    await expect(
      matchCard.getByText("התוצאה נשמרה והדירוגים חושבו מחדש."),
    ).toBeVisible();
    await expect(
      matchCard.getByText("תיקון ידני; זהות הספק נשמרה", { exact: true }),
    ).toBeVisible();
    await expect(matchCard.getByText("2–1", { exact: true })).toBeVisible();

    const clearForm = matchCard.locator(
      "form[data-manual-override-clear-match-id]",
    );
    await expect(clearForm).toHaveAttribute(
      "data-manual-override-clear-match-id",
      ids.matchId,
    );
    await expect(clearForm.locator('input[name="matchId"]')).toHaveCount(0);
    const clearConfirmation = clearForm.getByRole("checkbox", {
      name: /אני מאשר\/ת שהעדכון הבא של הספק/,
    });
    const clearButton = clearForm.getByRole("button", {
      name: "אישור והחזרת בעלות לספק",
    });
    await expect(clearButton).toBeDisabled();
    await clearForm.evaluate((form) => {
      (form as HTMLFormElement).requestSubmit();
    });
    await expect(
      clearForm.getByText("יש לאשר במפורש את החזרת הבעלות לספק.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(clearConfirmation).toBeFocused();
    await clearForm.evaluate((form, forgedMatchId) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "matchId";
      input.value = forgedMatchId;
      input.dataset.e2eUntrustedContext = "true";
      form.append(input);
    }, manualMatchId);
    await clearConfirmation.check();
    await expect(clearButton).toBeEnabled();
    await clearButton.click();
    await expect(
      matchCard.getByText(
        "הבעלות הוחזרה ל־API-Football. המצב והתוצאה הנוכחיים נשמרו עד לעדכון ספק מאומת.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      matchCard.getByText("API-Football", { exact: true }).first(),
    ).toBeVisible();
    await expect(matchCard.getByText("2–1", { exact: true })).toBeVisible();
    expect(
      readManualOverrideClearPersistenceInDisposableLocalDatabase({
        externalId,
        forgedMatchId: manualMatchId,
        matchId: ids.matchId,
      }),
    ).toEqual({
      clearAuditCount: 1,
      clearedMatchCount: 1,
      exactPredictionCount: 2,
      forgedClearAuditCount: 0,
      forgedMatchCount: 1,
      wrongPredictionCount: 1,
    });

    await admin.page.goto(`/leagues/${leagueId}/standings`);
    await expect(
      admin.page.getByRole("heading", { name: "טבלת דירוג" }),
    ).toBeVisible();

    if (testInfo.project.name.startsWith("mobile-")) {
      const adminCard = admin.page
        .locator("ol > li")
        .filter({ hasText: adminDisplayName });
      const memberACard = admin.page
        .locator("ol > li")
        .filter({ hasText: memberADisplayName });
      const memberBCard = admin.page
        .locator("ol > li")
        .filter({ hasText: memberBDisplayName });
      await expect(adminCard.getByText("מקום 1", { exact: true })).toBeVisible();
      await expect(memberACard.getByText("מקום 1", { exact: true })).toBeVisible();
      await expect(memberBCard.getByText("מקום 3", { exact: true })).toBeVisible();
      await expect(adminCard.getByText("3", { exact: true }).first()).toBeVisible();
      await expect(memberBCard.getByText("0", { exact: true }).first()).toBeVisible();
    } else {
      const adminRow = admin.page
        .getByRole("row")
        .filter({ hasText: adminDisplayName });
      const memberARow = admin.page
        .getByRole("row")
        .filter({ hasText: memberADisplayName });
      const memberBRow = admin.page
        .getByRole("row")
        .filter({ hasText: memberBDisplayName });
      await expect(adminRow.locator("td").nth(0)).toHaveText("1");
      await expect(memberARow.locator("td").nth(0)).toHaveText("1");
      await expect(memberBRow.locator("td").nth(0)).toHaveText("3");
      await expect(adminRow.locator("td").nth(1)).toHaveText("3");
      await expect(memberBRow.locator("td").nth(1)).toHaveText("0");
    }

    const layout = await admin.page.evaluate(() => ({
      dir: document.documentElement.dir,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.dir).toBe("rtl");
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);

    await memberA.page.goto(`/leagues/${leagueId}/standings`);
    await expect(
      memberA.page.getByRole("heading", { name: "טבלת דירוג" }),
    ).toBeVisible();

    await closeContextsAfterResponseStreams([
      admin.context,
      memberA.context,
      memberB.context,
    ]);
  });
});
