import { expect, test } from "@playwright/test";

test.describe("home smoke", () => {
  test("@preview loads a stable RTL Demo home page", async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));

    const response = await page.goto("/");

    expect(response?.ok()).toBe(true);
    await expect(page).toHaveTitle(/Predictor1/);
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      page.getByRole("heading", { name: /ברוכים הבאים/ }),
    ).toBeVisible();
    await expect(page.getByRole("status", { name: "מצב הדגמה" })).toBeVisible();
    await expect(page.getByText("שגיאה כללית")).toHaveCount(0);
    await expect(page.getByText("משהו השתבש")).toHaveCount(0);

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

    const refreshResponse = await page.reload();
    expect(refreshResponse?.ok()).toBe(true);
    await expect(page.getByRole("status", { name: "מצב הדגמה" })).toBeVisible();
    expect(browserErrors).toEqual([]);
  });
});
