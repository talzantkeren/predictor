import { expect, test } from "@playwright/test";

import { registerConfirmedUser } from "./support/local-auth";

test.describe("league creation and isolation", () => {
  test("creates an atomic Demo league and hides it from another user", async ({
    browser,
    page,
    request,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const password = "Predictor123!";
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

    await first.page.getByLabel("שם הליגה").fill(leagueName);
    await first.page.getByLabel("תיאור").fill("ליגה פרטית לבדיקת Slice 2");
    await first.page.getByLabel("סכום השתתפות Demo באגורות").fill("2500");
    await first.page.getByLabel("הוראות Demo").fill("סימון ידני לצורכי הדגמה בלבד");
    await first.page.getByLabel("תוצאה מדויקת").fill("5");
    await first.page.getByLabel("כיוון נכון").fill("2");
    await first.page.getByLabel("כיוון שגוי").fill("0");
    await first.page.getByLabel("אחוז").fill("60");
    await first.page.getByRole("button", { name: "הוספת מיקום פרס" }).click();
    await first.page.getByLabel("אחוז").nth(1).fill("40");
    await first.page.getByRole("button", { name: "יצירת ליגה", exact: true }).click();

    await expect(first.page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
    const leagueUrl = new URL(first.page.url());
    const leagueId = leagueUrl.pathname.split("/").at(-1);
    expect(leagueId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(first.page.getByRole("heading", { name: leagueName })).toBeVisible();
    await expect(first.page.getByText("Demo בלבד — ללא כסף אמיתי")).toBeVisible();
    await expect(first.page.getByText(/25\.00/)).toBeVisible();
    await expect(first.page.getByText("מנהל/ת וחבר/ה פעיל/ה")).toBeVisible();
    await expect(first.page.getByRole("heading", { name: "חוקי ניקוד" })).toBeVisible();
    await expect(first.page.getByText("60%")).toBeVisible();
    await expect(first.page.getByText("40%")).toBeVisible();

    await first.page.goto("/dashboard");
    await expect(first.page.getByRole("link", { name: new RegExp(leagueName) })).toBeVisible();

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

    await first.context.close();
    await second.context.close();
  });
});
