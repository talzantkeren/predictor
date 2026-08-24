import {
  devices,
  expect,
  type BrowserContextOptions,
  type Page,
  test,
} from "@playwright/test";

import {
  addActiveLeagueMemberInDisposableLocalDatabase,
  addPendingJoinRequestInDisposableLocalDatabase,
  moveMatchKickoffToPastInDisposableLocalDatabase,
  removePredictionMatchesFromDisposableLocalDatabase,
  seedPredictionMatchesInDisposableLocalDatabase,
  type PredictionMatchFixtureIds,
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
    throw new Error("Sensitive local API request failed.");
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
    throw new Error("Local Data API sign-in failed.");
  }
  return { accessToken: payload.access_token, userId: payload.user.id };
}

async function callSavePrediction(
  accessToken: string,
  input: {
    leagueId: string;
    matchId: string;
    homeScore: number;
    awayScore: number;
  },
) {
  const { publishableKey, url } = getLocalSupabaseConfiguration();
  return fetchSensitiveUrl(`${url}/rest/v1/rpc/save_prediction`, {
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
  });
}

async function readFilteredPredictions(
  accessToken: string,
  input: { leagueId: string; matchId: string; userId?: string },
) {
  const { publishableKey, url } = getLocalSupabaseConfiguration();
  const query = new URLSearchParams({
    select: "id,user_id,predicted_home_score,predicted_away_score",
    league_id: `eq.${input.leagueId}`,
    match_id: `eq.${input.matchId}`,
  });
  if (input.userId) query.set("user_id", `eq.${input.userId}`);

  const response = await fetchSensitiveUrl(
    `${url}/rest/v1/predictions?${query.toString()}`,
    {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!response.ok) throw new Error("Filtered prediction read failed.");
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) throw new Error("Filtered prediction response was invalid.");
  return payload;
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
    throw new Error("Created league ID was invalid.");
  }
  return leagueId;
}

test.describe("matches, predictions, lock, and reveal", () => {
  let fixtureIdsForCleanup: PredictionMatchFixtureIds | undefined;

  test.afterEach(() => {
    if (!fixtureIdsForCleanup) return;
    removePredictionMatchesFromDisposableLocalDatabase(fixtureIdsForCleanup);
    fixtureIdsForCleanup = undefined;
  });

  test("enforces the complete two-member flow with database time", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const password = `Aa1!${crypto.randomUUID()}`;
    const managerEmail = `prediction-manager-${suffix}@example.com`;
    const memberEmail = `prediction-member-${suffix}@example.com`;
    const outsiderEmail = `prediction-outsider-${suffix}@example.com`;
    const managerDisplayName = `מנהלת ניחושים ${suffix.slice(-6)}`;
    const memberDisplayName = `חברת ליגה ${suffix.slice(-6)}`;
    const contextOptions = getContextOptions(testInfo.project.name);

    const manager = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: managerEmail,
      password,
      displayName: managerDisplayName,
      contextOptions,
    });
    const leagueName = `ליגת Slice 5 ${suffix}`;
    const leagueId = await createLeague(manager.page, leagueName);
    const managerSession = await signInForDataApi(managerEmail, password);

    const member = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: memberEmail,
      password,
      displayName: memberDisplayName,
      contextOptions,
    });
    const memberSession = await signInForDataApi(memberEmail, password);
    const outsider = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: outsiderEmail,
      password,
      displayName: `משתמשת זרה ${suffix.slice(-6)}`,
      contextOptions,
    });
    const outsiderSession = await signInForDataApi(outsiderEmail, password);

    addActiveLeagueMemberInDisposableLocalDatabase({
      leagueId,
      userId: memberSession.userId,
      approvedBy: managerSession.userId,
    });

    const fixtureIds: PredictionMatchFixtureIds = {
      homeTeamId: crypto.randomUUID(),
      awayTeamId: crypto.randomUUID(),
      openMatchId: crypto.randomUUID(),
      staleCreationMatchId: crypto.randomUUID(),
      postponedMatchId: crypto.randomUUID(),
      canceledMatchId: crypto.randomUUID(),
      liveMatchId: crypto.randomUUID(),
      finishedMatchId: crypto.randomUUID(),
    };
    fixtureIdsForCleanup = fixtureIds;
    const fixtureNames =
      seedPredictionMatchesInDisposableLocalDatabase(fixtureIds);

    await manager.page.goto(`/leagues/${leagueId}`);
    await manager.page
      .getByRole("navigation", { name: "ניווט בליגה" })
      .getByRole("link", { name: "משחקים וניחושים" })
      .click();
    await expect(manager.page).toHaveURL(new RegExp(`/leagues/${leagueId}/matches$`));
    await expect(manager.page.getByRole("heading", { name: "משחקים וניחושים" })).toBeVisible();
    await expect(manager.page.getByText(fixtureNames.homeTeamName).first()).toBeVisible();
    await expect(manager.page.getByText("מתוכנן").first()).toBeVisible();
    await expect(manager.page.getByText("נדחה").first()).toBeVisible();
    await expect(manager.page.getByText("בוטל").first()).toBeVisible();
    await expect(manager.page.getByText("בשידור חי").first()).toBeVisible();
    await expect(manager.page.getByText("הסתיים").first()).toBeVisible();
    await expect(manager.page.getByText("2–1").first()).toBeVisible();
    const officialScore = manager.page.getByRole("img", {
      name: /תוצאה רשמית:/,
    }).first();
    await expect(officialScore.locator('[data-score-side="home"]')).toHaveText(
      "2",
    );
    await expect(officialScore.locator('[data-score-side="away"]')).toHaveText(
      "1",
    );
    const scorePositions = await officialScore.evaluate((element) => ({
      home: element
        .querySelector<HTMLElement>('[data-score-side="home"]')
        ?.getBoundingClientRect().x,
      away: element
        .querySelector<HTMLElement>('[data-score-side="away"]')
        ?.getBoundingClientRect().x,
    }));
    expect(scorePositions.home).toBeGreaterThan(scorePositions.away ?? 0);
    await expect(
      manager.page.getByText(contextOptions.timezoneId ?? "UTC").first(),
    ).toBeVisible();
    await expect(manager.page.getByText(/נותרו/).first()).toBeVisible();

    const openMatchRow = manager.page.locator(
      `[data-match-id="${fixtureIds.openMatchId}"]`,
    );
    await expect(openMatchRow.locator("h3 bdi").nth(0)).toHaveText(
      fixtureNames.homeTeamName,
    );
    await expect(openMatchRow.locator("h3 bdi").nth(1)).toHaveText(
      fixtureNames.awayTeamName,
    );

    const listLayout = await manager.page.evaluate(() => ({
      dir: document.documentElement.dir,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(listLayout.dir).toBe("rtl");
    expect(listLayout.scrollWidth).toBeLessThanOrEqual(listLayout.clientWidth);

    const detailPath = `/matches/${fixtureIds.openMatchId}?league=${leagueId}`;
    await manager.page.goto(detailPath);
    const managerHomeInput = manager.page.getByLabel(
      `שערים — ${fixtureNames.homeTeamName}`,
      { exact: true },
    );
    const managerAwayInput = manager.page.getByLabel(
      `שערים — ${fixtureNames.awayTeamName}`,
      { exact: true },
    );
    const controlBorders = await Promise.all(
      [managerHomeInput, managerAwayInput].map((input) =>
        input.evaluate((element) => getComputedStyle(element).borderTopColor),
      ),
    );
    expect(controlBorders).toEqual([
      "rgb(127, 144, 164)",
      "rgb(127, 144, 164)",
    ]);
    const detailHeading = manager.page.getByRole("heading", { level: 1 });
    await expect(detailHeading.locator("bdi").nth(0)).toHaveText(
      fixtureNames.homeTeamName,
    );
    await expect(detailHeading.locator("bdi").nth(1)).toHaveText(
      fixtureNames.awayTeamName,
    );
    await managerHomeInput.fill("2");
    await managerAwayInput.fill("1");
    await manager.page.getByRole("button", { name: "שמירת הניחוש" }).click();
    await expect(manager.page.getByText("הניחוש נשמר וניתן לעריכה עד מועד הנעילה.")).toBeVisible();

    await manager.page.reload();
    await expect(managerHomeInput).toHaveValue("2");
    await expect(managerAwayInput).toHaveValue("1");
    await expect(manager.page.getByText(/נשמר לאחרונה:/)).toBeVisible();

    const doubleSubmit = await Promise.all([
      callSavePrediction(managerSession.accessToken, {
        leagueId,
        matchId: fixtureIds.openMatchId,
        homeScore: 1,
        awayScore: 0,
      }),
      callSavePrediction(managerSession.accessToken, {
        leagueId,
        matchId: fixtureIds.openMatchId,
        homeScore: 1,
        awayScore: 0,
      }),
    ]);
    expect(doubleSubmit.every((response) => response.ok)).toBe(true);
    expect(
      await readFilteredPredictions(managerSession.accessToken, {
        leagueId,
        matchId: fixtureIds.openMatchId,
        userId: managerSession.userId,
      }),
    ).toHaveLength(1);

    await manager.page.reload();
    await managerHomeInput.fill("2");
    await managerAwayInput.fill("1");
    await manager.page.getByRole("button", { name: "עדכון הניחוש" }).click();
    await expect(manager.page.getByText("הניחוש נשמר וניתן לעריכה עד מועד הנעילה.")).toBeVisible();

    await member.page.goto(detailPath);
    await expect(
      member.page.getByText("ניחושי משתתפים אחרים מוסתרים עד מועד הפתיחה.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(member.page.getByText(managerDisplayName, { exact: true })).toHaveCount(0);
    expect(await member.page.content()).not.toContain(managerDisplayName);
    expect(
      await readFilteredPredictions(memberSession.accessToken, {
        leagueId,
        matchId: fixtureIds.openMatchId,
        userId: managerSession.userId,
      }),
    ).toEqual([]);

    await member.page
      .getByLabel(`שערים — ${fixtureNames.homeTeamName}`, { exact: true })
      .fill("0");
    await member.page
      .getByLabel(`שערים — ${fixtureNames.awayTeamName}`, { exact: true })
      .fill("1");
    await member.page.getByRole("button", { name: "שמירת הניחוש" }).click();
    await expect(member.page.getByText("הניחוש נשמר וניתן לעריכה עד מועד הנעילה.")).toBeVisible();

    expect(
      await readFilteredPredictions(managerSession.accessToken, {
        leagueId,
        matchId: fixtureIds.openMatchId,
        userId: memberSession.userId,
      }),
    ).toEqual([]);

    await manager.page.goto(detailPath);
    const staleCreationPage = await member.context.newPage();
    await staleCreationPage.goto(
      `/matches/${fixtureIds.staleCreationMatchId}?league=${leagueId}`,
    );
    await expect(staleCreationPage.getByRole("button", { name: "שמירת הניחוש" })).toBeVisible();

    moveMatchKickoffToPastInDisposableLocalDatabase(fixtureIds.openMatchId);
    moveMatchKickoffToPastInDisposableLocalDatabase(
      fixtureIds.staleCreationMatchId,
    );

    await managerHomeInput.fill("3");
    await managerAwayInput.fill("2");
    await manager.page.getByRole("button", { name: "עדכון הניחוש" }).click();
    await expect(
      manager.page.getByText(
        "המשחק כבר ננעל ולא ניתן לשמור או לערוך את הניחוש.",
      ),
    ).toBeVisible();

    await staleCreationPage
      .getByLabel(`שערים — ${fixtureNames.awayTeamName}`, { exact: true })
      .fill("1");
    await staleCreationPage
      .getByLabel(`שערים — ${fixtureNames.homeTeamName}`, { exact: true })
      .fill("1");
    await staleCreationPage.getByRole("button", { name: "שמירת הניחוש" }).click();
    await expect(
      staleCreationPage.getByText(
        "המשחק כבר ננעל ולא ניתן לשמור או לערוך את הניחוש.",
      ),
    ).toBeVisible();

    const lockedReplay = await callSavePrediction(managerSession.accessToken, {
      leagueId,
      matchId: fixtureIds.openMatchId,
      homeScore: 4,
      awayScore: 3,
    });
    expect(lockedReplay.ok).toBe(false);
    const lockedPayload = (await lockedReplay.json()) as { message?: unknown };
    expect(lockedPayload.message).toBe("PREDICTION_LOCKED");

    await manager.page.reload();
    const managerReveal = manager.page.getByRole("region", {
      name: "ניחושי חברי הליגה",
    });
    await expect(managerReveal.getByText(managerDisplayName, { exact: false })).toBeVisible();
    await expect(managerReveal.getByText(memberDisplayName, { exact: false })).toBeVisible();
    await expect(managerReveal.getByText("2–1", { exact: true })).toBeVisible();
    await expect(managerReveal.getByText("0–1", { exact: true })).toBeVisible();

    await member.page.goto(detailPath);
    const memberReveal = member.page.getByRole("region", {
      name: "ניחושי חברי הליגה",
    });
    await expect(memberReveal.getByText(managerDisplayName, { exact: false })).toBeVisible();
    await expect(memberReveal.getByText(memberDisplayName, { exact: false })).toBeVisible();

    await outsider.page.goto(`/leagues/${leagueId}/matches`);
    await expect(outsider.page.getByRole("heading", { name: "הדף לא נמצא" })).toBeVisible();
    await outsider.page.goto(detailPath);
    await expect(outsider.page.getByRole("heading", { name: "הדף לא נמצא" })).toBeVisible();
    expect(
      await readFilteredPredictions(outsiderSession.accessToken, {
        leagueId,
        matchId: fixtureIds.openMatchId,
      }),
    ).toEqual([]);

    addPendingJoinRequestInDisposableLocalDatabase({
      leagueId,
      userId: outsiderSession.userId,
    });
    await outsider.page.goto(`/leagues/${leagueId}/matches`);
    await expect(outsider.page.getByRole("heading", { name: "הדף לא נמצא" })).toBeVisible();
    await outsider.page.goto(detailPath);
    await expect(outsider.page.getByRole("heading", { name: "הדף לא נמצא" })).toBeVisible();
    expect(
      await readFilteredPredictions(outsiderSession.accessToken, {
        leagueId,
        matchId: fixtureIds.openMatchId,
      }),
    ).toEqual([]);

    const detailLayout = await manager.page.evaluate(() => ({
      dir: document.documentElement.dir,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(detailLayout.dir).toBe("rtl");
    expect(detailLayout.scrollWidth).toBeLessThanOrEqual(detailLayout.clientWidth);

    await staleCreationPage.close();
    await manager.context.close();
    await member.context.close();
    await outsider.context.close();
  });
});
