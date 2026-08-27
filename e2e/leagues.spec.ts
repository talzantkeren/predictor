import { expect, test } from "./support/stream-safe-test";

import { closeContextsAfterResponseStreams } from "./support/response-streams";

import {
  fillPasswordWithoutReportValue,
  registerConfirmedUser,
} from "./support/local-auth";

test.describe("league creation and isolation", () => {
  test("creates an atomic Demo league and hides it from another user", async ({
    browser,
    page,
    request,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const password = `Aa1!${crypto.randomUUID()}`;
    const leagueName = `ליגת Slice 2 ${suffix}`;
    const first = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: `league-owner-${suffix}@example.com`,
      password,
      displayName: "מנהלת ליגה",
    });

    await expect(first.page.getByRole("heading", { name: "הליגות שלי" })).toBeVisible();
    await expect(first.page.getByRole("heading", { name: "עדיין אין לך ליגות" })).toBeVisible();
    await expect(
      first.page.getByRole("navigation", { name: "ניווט משתמש" }),
    ).toBeVisible();
    const skipLink = first.page.getByRole("link", {
      name: "דילוג לתוכן הראשי",
    });
    await skipLink.focus();
    await expect(skipLink).toBeFocused();
    await first.page.keyboard.press("Enter");
    await expect(first.page.locator("#main-content")).toBeFocused();

    const dashboardDimensions = await first.page.evaluate(() => ({
      dir: document.documentElement.dir,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dashboardDimensions.dir).toBe("rtl");
    expect(dashboardDimensions.scrollWidth).toBeLessThanOrEqual(
      dashboardDimensions.clientWidth,
    );

    await first.page.getByRole("link", { name: "יצירת הליגה הראשונה" }).click();
    await expect(first.page).toHaveURL(/\/leagues\/new$/);
    await expect(first.page.getByRole("heading", { name: "יצירת ליגה" })).toBeVisible();
    await expect(first.page.getByLabel("עונה")).toContainText("2026/27");

    const creationDimensions = await first.page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(creationDimensions.scrollWidth).toBeLessThanOrEqual(
      creationDimensions.clientWidth,
    );

    await first.page.getByLabel("שם הליגה").fill("אב");
    await first.page.getByLabel("סכום השתתפות Demo באגורות").fill("-1");
    await first.page.getByLabel("תוצאה מדויקת").fill("0");
    await first.page.getByLabel("כיוון נכון").fill("1");
    await first.page.getByRole("button", { name: "יצירת ליגה", exact: true }).click();

    await expect(first.page.getByText("שם הליגה חייב לכלול לפחות 3 תווים")).toBeVisible();
    await expect(first.page.getByText("סכום Demo שלם ולא־שלילי")).toBeVisible();
    await expect(first.page.getByText("ניקוד לתוצאה מדויקת חייב להיות לפחות")).toBeVisible();
    await expect(first.page.getByLabel("שם הליגה")).toHaveAttribute("aria-invalid", "true");
    await expect(first.page.getByLabel("שם הליגה")).toHaveAttribute(
      "aria-describedby",
      /league-name-error/,
    );

    await first.page.getByLabel("שם הליגה").fill("ליגת \u202eSpoof");
    await first.page.getByLabel("סכום השתתפות Demo באגורות").fill("2500");
    await first.page.getByLabel("תוצאה מדויקת").fill("5");
    await first.page.getByLabel("כיוון נכון").fill("2");
    await first.page.getByLabel("כיוון שגוי").fill("0");
    await first.page.getByRole("button", { name: "יצירת ליגה", exact: true }).click();
    await expect(
      first.page.getByText("שם הליגה מכיל תווי בקרה, כיווניות או מפרידי שורה"),
    ).toBeVisible();
    await expect(first.page).toHaveURL(/\/leagues\/new$/);

    await first.page.getByLabel("שם הליגה").fill(leagueName);
    await first.page.getByLabel("תיאור").fill("ליגה פרטית לבדיקת Slice 2");
    await first.page.getByLabel("סכום השתתפות Demo באגורות").fill("2500");
    await first.page.getByLabel("הוראות Demo").fill("סימון ידני לצורכי הדגמה בלבד");
    await first.page.getByLabel("תוצאה מדויקת").fill("5");
    await first.page.getByLabel("כיוון נכון").fill("2");
    await first.page.getByLabel("כיוון שגוי").fill("0");

    // Removing a middle prize row must renumber the remaining rows so the
    // submitted positions stay consecutive.
    await first.page.getByRole("button", { name: "הוספת מיקום פרס" }).click();
    await first.page.getByRole("button", { name: "הוספת מיקום פרס" }).click();
    await expect(first.page.getByLabel("מיקום", { exact: true })).toHaveCount(3);
    await expect(first.page.getByLabel("מיקום", { exact: true }).nth(2)).toHaveValue("3");
    const readonlyPrizePosition = first.page
      .getByLabel("מיקום", { exact: true })
      .first();
    await expect(readonlyPrizePosition).toHaveAttribute("readonly", "");
    expect(
      await readonlyPrizePosition.evaluate((element) => ({
        backgroundColor: getComputedStyle(element).backgroundColor,
        borderTopColor: getComputedStyle(element).borderTopColor,
      })),
    ).toEqual({
      backgroundColor: "rgb(255, 255, 255)",
      borderTopColor: "rgb(127, 144, 164)",
    });
    await first.page.getByRole("button", { name: "הסרת מיקום פרס 2", exact: true }).click();
    await expect(first.page.getByLabel("מיקום", { exact: true })).toHaveCount(2);
    await expect(first.page.getByLabel("מיקום", { exact: true }).nth(0)).toHaveValue("1");
    await expect(first.page.getByLabel("מיקום", { exact: true }).nth(1)).toHaveValue("2");

    await first.page.getByLabel("אחוז").nth(0).fill("60");
    await first.page.getByLabel("אחוז").nth(1).fill("40");
    await first.page.getByRole("button", { name: "יצירת ליגה", exact: true }).click();

    await expect(first.page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
    const leagueUrl = new URL(first.page.url());
    const leagueId = leagueUrl.pathname.split("/").at(-1);
    expect(leagueId).toMatch(/^[0-9a-f-]{36}$/);
    const leagueHeading = first.page.getByRole("heading", { name: leagueName });
    await expect(leagueHeading).toBeVisible();
    await expect(leagueHeading.locator('bdi[dir="auto"]')).toHaveText(leagueName);
    await expect(
      first.page.getByRole("navigation", { name: "ניווט בליגה" }),
    ).toBeVisible();
    await expect(first.page.getByText("Demo בלבד — ללא כסף אמיתי")).toBeVisible();
    await expect(first.page.getByText(/25\.00/)).toBeVisible();
    await expect(first.page.getByText("מנהל/ת וחבר/ה פעיל/ה")).toBeVisible();
    await expect(first.page.getByRole("heading", { name: "חוקי ניקוד" })).toBeVisible();
    await expect(first.page.getByText("60%")).toBeVisible();
    await expect(first.page.getByText("40%")).toBeVisible();

    await first.page.goto("/dashboard");
    const leagueCard = first.page.getByRole("link", {
      name: new RegExp(leagueName),
    });
    await expect(leagueCard).toBeVisible();
    await expect(leagueCard.locator('h3 bdi[dir="auto"]')).toHaveText(leagueName);

    // A shared league link opened while logged out must return to that league
    // after login, not fall back to the dashboard.
    const returning = await browser.newContext();
    const returningPage = await returning.newPage();
    await returningPage.goto(
      new URL(`/leagues/${leagueId}`, first.page.url()).toString(),
    );
    await expect(returningPage).toHaveURL(/\/login\?next=/);
    await returningPage.getByLabel("כתובת אימייל").fill(`league-owner-${suffix}@example.com`);
    await fillPasswordWithoutReportValue(returningPage, "סיסמה", password);
    await returningPage.getByRole("button", { name: "התחברות" }).click();
    await expect(returningPage).toHaveURL(new RegExp(`/leagues/${leagueId}$`));
    await expect(returningPage.getByRole("heading", { name: leagueName })).toBeVisible();
    await closeContextsAfterResponseStreams([returning]);

    const second = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      email: `league-outsider-${suffix}@example.com`,
      password,
      displayName: "משתמש זר",
    });

    await expect(second.page.getByRole("heading", { name: "עדיין אין לך ליגות" })).toBeVisible();
    await expect(second.page.getByText(leagueName)).toHaveCount(0);
    await second.page.goto(`/leagues/${leagueId}`);
    await expect(second.page.getByRole("heading", { name: "הדף לא נמצא" })).toBeVisible();
    await expect(second.page.getByText(leagueName)).toHaveCount(0);

    await closeContextsAfterResponseStreams([first.context, second.context]);
  });
});
