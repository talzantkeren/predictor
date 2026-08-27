import { expect, test } from "./support/stream-safe-test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const finalViewportAudit = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

test.describe("home smoke", () => {
  test("@preview loads a stable RTL Demo home page", async ({ page }, testInfo) => {
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

    if (
      process.env.FINAL_VIEWPORT_AUDIT === "true" &&
      testInfo.project.name === "desktop-chromium"
    ) {
      const outputDirectory = join(process.cwd(), "tmp", "final-viewports");
      mkdirSync(outputDirectory, { recursive: true });

      for (const viewport of finalViewportAudit) {
        await page.setViewportSize(viewport);
        const auditResponse = await page.goto("/");
        expect(auditResponse?.ok()).toBe(true);
        await expect(page.getByRole("heading", { name: /ברוכים הבאים/ })).toBeVisible();
        const modeStatus = page.getByRole("status", { name: "מצב הדגמה" });
        await expect(modeStatus).toBeVisible();

        const audit = await page.evaluate(() => {
          const toRgb = (value: string) => {
            const canvas = document.createElement("canvas");
            canvas.width = 1;
            canvas.height = 1;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context) throw new Error("Canvas color conversion is unavailable.");
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = value;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
          };
          const luminance = (channels: number[]) => {
            const linear = channels.map((channel) => {
              const normalized = channel / 255;
              return normalized <= 0.04045
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
            });
            return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
          };
          const status = document.querySelector<HTMLElement>('[role="status"]');
          if (!status) throw new Error("Demo status was missing.");
          const styles = getComputedStyle(status);
          const foreground = luminance(toRgb(styles.color));
          const background = luminance(toRgb(styles.backgroundColor));
          const contrastRatio =
            (Math.max(foreground, background) + 0.05) /
            (Math.min(foreground, background) + 0.05);
          const targets = [...document.querySelectorAll<HTMLElement>('a[href="/register"], a[href="/login"]')]
            .map((target) => target.getBoundingClientRect())
            .map(({ width, height }) => ({ width, height }));
          return {
            clientWidth: document.documentElement.clientWidth,
            contrastRatio,
            dir: document.documentElement.dir,
            scrollWidth: document.documentElement.scrollWidth,
            targets,
          };
        });
        expect(audit.dir).toBe("rtl");
        expect(audit.scrollWidth).toBeLessThanOrEqual(audit.clientWidth);
        expect(audit.contrastRatio).toBeGreaterThanOrEqual(4.5);
        expect(audit.targets).toHaveLength(2);
        for (const target of audit.targets) {
          expect(target.width).toBeGreaterThanOrEqual(44);
          expect(target.height).toBeGreaterThanOrEqual(44);
        }

        await page.keyboard.press("Tab");
        const focusState = await page.evaluate(() => ({
          tagName: document.activeElement?.tagName ?? "",
          visible: document.activeElement?.matches(":focus-visible") ?? false,
        }));
        expect(focusState.tagName).toBe("A");
        expect(focusState.visible).toBe(true);

        await page.screenshot({
          path: join(outputDirectory, `home-${viewport.width}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    }

    const refreshResponse = await page.reload();
    expect(refreshResponse?.ok()).toBe(true);
    await expect(page.getByRole("status", { name: "מצב הדגמה" })).toBeVisible();
    expect(browserErrors).toEqual([]);
  });
});
