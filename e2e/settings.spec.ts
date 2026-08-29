import {
  devices,
  expect,
  type BrowserContextOptions,
  type Page,
  test,
} from "./support/stream-safe-test";

import { closeContextsAfterResponseStreams } from "./support/response-streams";

import {
  grantSystemAdminInDisposableLocalDatabase,
  setLeagueStatusInDisposableLocalDatabase,
} from "./support/local-database";
import { registerConfirmedUser } from "./support/local-auth";

test.use({ screenshot: "off", trace: "off", video: "off" });

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type PasswordSessionResponse = {
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
    timezoneId: "Asia/Jerusalem",
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
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = (await response.json()) as PasswordSessionResponse;

  if (
    !response.ok ||
    typeof payload.user?.id !== "string" ||
    !canonicalUuidPattern.test(payload.user.id)
  ) {
    throw new Error("Local settings administrator identity was unavailable.");
  }

  return payload.user.id;
}

async function createLeague(page: Page, leagueName: string) {
  await page.goto("/leagues/new");
  await page.getByLabel("שם הליגה").fill(leagueName);
  await page.getByRole("button", { name: "יצירת ליגה", exact: true }).click();
  await expect(page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);

  const leagueId = new URL(page.url()).pathname.split("/").at(-1);

  if (!leagueId || !canonicalUuidPattern.test(leagueId)) {
    throw new Error("Created settings league ID was invalid.");
  }

  return leagueId;
}

test.describe("editable league settings", () => {
  let leagueStatusCleanupId: string | undefined;

  test.afterEach(() => {
    if (!leagueStatusCleanupId) return;
    setLeagueStatusInDisposableLocalDatabase(leagueStatusCleanupId, "open");
    leagueStatusCleanupId = undefined;
  });

  test("saves versioned settings, isolates roles, and reflects lock states in RTL", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(10_000);

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const password = `Aa1!${crypto.randomUUID()}`;
    const contextOptions = getContextOptions(testInfo.project.name);
    const originalName = `ליגת הגדרות ${suffix}`;
    const firstSavedName = `ליגת הגדרות שמורה ${suffix}`;
    const secondSavedName = `ליגת הגדרות גרסה שנייה ${suffix}`;
    const activeSavedName = `ליגת הגדרות פעילה ${suffix}`;
    const managerEmail = `settings-manager-${suffix}@example.com`;
    const outsiderEmail = `settings-outsider-${suffix}@example.com`;
    const adminEmail = `settings-admin-${suffix}@example.com`;

    const manager = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: managerEmail,
      password,
      displayName: "מנהלת הגדרות",
      contextOptions,
    });
    const leagueId = await createLeague(manager.page, originalName);
    leagueStatusCleanupId = leagueId;

    await manager.page.goto(`/leagues/${leagueId}/settings`);
    await expect(
      manager.page.getByRole("heading", { name: "הגדרות ליגה" }),
    ).toBeVisible();
    await expect(
      manager.page.getByRole("heading", { name: "קישור ההזמנה" }),
    ).toBeVisible();

    const layout = await manager.page.evaluate(() => ({
      dir: document.documentElement.dir,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.dir).toBe("rtl");
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);

    const joinsCloseInput = manager.page.getByLabel(
      "סגירת בקשות הצטרפות (UTC)",
      { exact: true },
    );
    await expect(joinsCloseInput).toHaveAttribute("type", "text");
    const addPrizeButton = manager.page.getByRole("button", {
      name: "הוספת מיקום פרס",
    });
    const saveButton = manager.page.getByRole("button", {
      name: "שמירת הגדרות",
    });
    await addPrizeButton.focus();
    await manager.page.keyboard.press("Tab");
    await expect(saveButton).toBeFocused();
    const saveButtonBox = await saveButton.boundingBox();
    expect(saveButtonBox).not.toBeNull();
    expect(saveButtonBox?.width).toBeGreaterThanOrEqual(44);
    expect(saveButtonBox?.height).toBeGreaterThanOrEqual(44);
    const addPrizeButtonBox = await addPrizeButton.boundingBox();
    expect(addPrizeButtonBox).not.toBeNull();
    expect(addPrizeButtonBox?.width).toBeGreaterThanOrEqual(44);
    expect(addPrizeButtonBox?.height).toBeGreaterThanOrEqual(44);

    await addPrizeButton.click();
    const removePrizeButton = manager.page.getByRole("button", {
      name: "הסרת מיקום פרס 1",
    });
    const removePrizeButtonBox = await removePrizeButton.boundingBox();
    expect(removePrizeButtonBox).not.toBeNull();
    expect(removePrizeButtonBox?.width).toBeGreaterThanOrEqual(44);
    expect(removePrizeButtonBox?.height).toBeGreaterThanOrEqual(44);
    await manager.page.getByLabel("שם הליגה", { exact: true }).fill("אב");
    await manager.page.getByLabel("תוצאה מדויקת", { exact: true }).fill("-1");
    await manager.page.getByLabel("אחוז", { exact: true }).nth(0).fill("60");
    await manager.page.getByLabel("אחוז", { exact: true }).nth(1).fill("30");
    await manager.page
      .getByRole("button", { name: "שמירת הגדרות" })
      .click();

    await expect(
      manager.page.getByText("שם הליגה חייב לכלול לפחות 3 תווים"),
    ).toBeVisible();
    await expect(
      manager.page.getByText("ניקוד לתוצאה מדויקת חייב להיות מספר שלם"),
    ).toBeVisible();
    await expect(
      manager.page.getByText("סך חלוקת הפרסים חייב להיות 100% בדיוק"),
    ).toBeVisible();

    await manager.page
      .getByLabel("שם הליגה", { exact: true })
      .fill(firstSavedName);
    await manager.page.getByLabel("תיאור").fill("פרטים מעודכנים במסך הגדרות");
    await manager.page
      .getByLabel("סכום השתתפות Demo באגורות")
      .fill("2600");
    await manager.page.getByLabel("הוראות Demo").fill("סימון Demo בלבד");
    await joinsCloseInput.fill("2098-12-31T23:59:59.123456");
    await manager.page.getByLabel("תוצאה מדויקת", { exact: true }).fill("5");
    await manager.page.getByLabel("כיוון נכון", { exact: true }).fill("2");
    await manager.page.getByLabel("כיוון שגוי", { exact: true }).fill("0");
    await manager.page.getByLabel("אחוז", { exact: true }).nth(1).fill("40");
    await manager.page
      .getByRole("button", { name: "שמירת הגדרות" })
      .click();

    await expect(manager.page.getByText("הגדרות הליגה נשמרו.")).toBeVisible();
    await expect(
      manager.page.locator('input[name="expectedSettingsVersion"]'),
    ).toHaveValue("2");

    // A validation error after version 2 must retain version 2. The corrected
    // next submission then succeeds instead of falling back to stale version 1.
    await manager.page.getByLabel("תוצאה מדויקת", { exact: true }).fill("-1");
    await manager.page
      .getByRole("button", { name: "שמירת הגדרות" })
      .click();
    await expect(
      manager.page.getByText("ניקוד לתוצאה מדויקת חייב להיות מספר שלם"),
    ).toBeVisible();
    await expect(
      manager.page.locator('input[name="expectedSettingsVersion"]'),
    ).toHaveValue("2");

    await manager.page.getByLabel("תוצאה מדויקת", { exact: true }).fill("5");
    await manager.page
      .getByLabel("שם הליגה", { exact: true })
      .fill(secondSavedName);
    await manager.page
      .getByRole("button", { name: "שמירת הגדרות" })
      .click();
    await expect(manager.page.getByText("הגדרות הליגה נשמרו.")).toBeVisible();
    await expect(
      manager.page.locator('input[name="expectedSettingsVersion"]'),
    ).toHaveValue("3");

    await saveButton.click();
    await expect(
      manager.page.getByText("ההגדרות כבר מעודכנות; לא נוצר שינוי נוסף."),
    ).toBeVisible();
    await expect(
      manager.page.locator('input[name="expectedSettingsVersion"]'),
    ).toHaveValue("3");

    await manager.page.reload();
    await expect(
      manager.page.getByLabel("שם הליגה", { exact: true }),
    ).toHaveValue(secondSavedName);
    await expect(joinsCloseInput).toHaveValue(
      "2098-12-31T23:59:59.123456",
    );
    await expect(manager.page.getByLabel("אחוז", { exact: true })).toHaveCount(2);

    const outsider = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: outsiderEmail,
      password,
      displayName: "מנהלת ליגה זרה",
      contextOptions,
    });
    await outsider.page.goto(`/leagues/${leagueId}/settings`);
    await expect(
      outsider.page.getByRole("heading", { name: "הדף לא נמצא" }),
    ).toBeVisible();
    await expect(outsider.page.getByText(secondSavedName)).toHaveCount(0);

    const admin = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: adminEmail,
      password,
      displayName: "מנהלת מערכת הגדרות",
      contextOptions,
    });
    const adminUserId = await getRegisteredUserId(adminEmail, password);
    grantSystemAdminInDisposableLocalDatabase(adminUserId);

    await admin.page.goto("/dashboard");
    await expect(admin.page.getByText(secondSavedName)).toHaveCount(0);
    await admin.page.goto(`/leagues/${leagueId}/settings`);
    await expect(
      admin.page.getByText("העמוד נפתח בהרשאת מנהל מערכת"),
    ).toBeVisible();
    await expect(
      admin.page.getByLabel("שם הליגה", { exact: true }),
    ).toHaveValue(secondSavedName);
    await expect(
      admin.page.getByRole("heading", { name: "קישור ההזמנה" }),
    ).toHaveCount(0);
    await expect(
      admin.page.getByRole("navigation", { name: "ניווט בליגה" }).getByRole("link"),
    ).toHaveCount(1);

    setLeagueStatusInDisposableLocalDatabase(leagueId, "active");
    await manager.page.reload();
    await expect(
      manager.page.getByLabel("תוצאה מדויקת", { exact: true }),
    ).toHaveAttribute("readonly", "");
    await expect(manager.page.getByLabel("אחוז", { exact: true }).first()).toHaveAttribute(
      "readonly",
      "",
    );
    await expect(
      manager.page.getByRole("button", { name: "הוספת מיקום פרס" }),
    ).toBeDisabled();
    await expect(
      manager.page.getByLabel("שם הליגה", { exact: true }),
    ).not.toHaveAttribute("readonly", "");
    await manager.page
      .getByLabel("שם הליגה", { exact: true })
      .fill(activeSavedName);
    await manager.page
      .getByRole("button", { name: "שמירת הגדרות" })
      .click();
    await expect(manager.page.getByText("הגדרות הליגה נשמרו.")).toBeVisible();

    setLeagueStatusInDisposableLocalDatabase(leagueId, "completed");
    await manager.page.reload();
    await expect(
      manager.page.getByLabel("שם הליגה", { exact: true }),
    ).toHaveAttribute("readonly", "");
    await expect(
      manager.page.getByRole("button", { name: "שמירת הגדרות" }),
    ).toBeDisabled();
    await expect(
      manager.page.getByText("ליגה שהושלמה או הועברה לארכיון היא לקריאה בלבד"),
    ).toBeVisible();

    await closeContextsAfterResponseStreams([
      manager.context,
      outsider.context,
      admin.context,
    ]);
  });
});
