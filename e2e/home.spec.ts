import { expect, test } from "@playwright/test";

test.describe("home smoke", () => {
  test("loads an RTL Demo home page on mobile", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Predictor1/);
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: /ברוכים הבאים/ })).toBeVisible();
    await expect(page.getByRole("status", { name: "מצב הדגמה" })).toBeVisible();
    await expect(page.getByText("שגיאה כללית")).toHaveCount(0);
    await expect(page.getByText("משהו השתבש")).toHaveCount(0);

    const viewport = page.viewportSize();
    expect(viewport?.width).toBeLessThanOrEqual(500);
    expect(viewport?.height).toBeGreaterThan(0);
  });
});
