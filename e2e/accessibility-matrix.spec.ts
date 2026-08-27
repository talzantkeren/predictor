import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "./support/stream-safe-test";

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

const publicEntryRoutes = ["/", "/login", "/register", "/forgot-password"] as const;

type BrowserAudit = {
  clientWidth: number;
  direction: string;
  focusableCount: number;
  focusOrder: string[];
  scrollWidth: number;
  undersizedTargets: Array<{
    height: number;
    label: string;
    tag: string;
    width: number;
  }>;
};

async function auditBrowserContracts(page: Page) {
  return page.evaluate<BrowserAudit>(() => {
    const selector =
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
    const candidates = [...document.querySelectorAll<HTMLElement>(selector)].filter(
      (element) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-hidden") !== "true" &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          bounds.width > 0 &&
          bounds.height > 0
        );
      },
    );
    const undersizedTargets = candidates.flatMap((element) => {
      const style = getComputedStyle(element);
      const isInlineTextLink =
        element.tagName === "A" && style.display === "inline";
      if (isInlineTextLink) return [];
      const bounds = element.getBoundingClientRect();
      if (bounds.width >= 44 && bounds.height >= 44) return [];
      return [
        {
          height: bounds.height,
          label:
            element.getAttribute("aria-label") ??
            element.textContent?.trim().slice(0, 80) ??
            "",
          tag: element.tagName,
          width: bounds.width,
        },
      ];
    });

    const focusOrder = candidates.map((element, index) => {
      const order = String(index);
      element.dataset.accessibilityMatrixOrder = order;
      return order;
    });

    return {
      clientWidth: document.documentElement.clientWidth,
      direction: document.documentElement.dir,
      focusableCount: candidates.length,
      focusOrder,
      scrollWidth: document.documentElement.scrollWidth,
      undersizedTargets,
    };
  });
}

async function auditRoute({
  outputDirectory,
  page,
  route,
  viewport,
}: {
  outputDirectory: string;
  page: Page;
  route: (typeof publicEntryRoutes)[number];
  viewport: { height: number; width: number };
}) {
  const response = await page.goto(route);
  expect(response?.ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("main")).toHaveCount(1);

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    axe.violations,
    axe.violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.help} (${violation.nodes.length})`,
      )
      .join("\n"),
  ).toEqual([]);
  expect(
    axe.incomplete.filter((result) => result.id === "color-contrast"),
    "Every applicable text node must receive a conclusive axe contrast result.",
  ).toEqual([]);

  const audit = await auditBrowserContracts(page);
  expect(audit.direction).toBe("rtl");
  expect(audit.scrollWidth).toBeLessThanOrEqual(audit.clientWidth);
  expect(audit.focusableCount).toBeGreaterThan(0);
  expect(audit.undersizedTargets).toEqual([]);

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  });
  const observedFocusOrder: string[] = [];
  for (let index = 0; index < audit.focusableCount; index += 1) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return undefined;
      const bounds = active.getBoundingClientRect();
      const style = getComputedStyle(active);
      return {
        bottom: bounds.bottom,
        focusVisible: active.matches(":focus-visible"),
        left: bounds.left,
        order: active.dataset.accessibilityMatrixOrder,
        right: bounds.right,
        top: bounds.top,
        visibleIndicator:
          (style.outlineStyle !== "none" &&
            Number.parseFloat(style.outlineWidth) >= 2) ||
          style.boxShadow !== "none",
      };
    });
    expect(focus).toBeDefined();
    expect(focus?.order).toBe(String(index));
    expect(focus?.focusVisible).toBe(true);
    expect(focus?.visibleIndicator).toBe(true);
    expect(focus?.right).toBeGreaterThan(0);
    expect(focus?.left).toBeLessThan(viewport.width);
    expect(focus?.bottom).toBeGreaterThan(0);
    expect(focus?.top).toBeLessThan(viewport.height);

    const accessibilitySnapshot = await page
      .locator(`[data-accessibility-matrix-order="${index}"]`)
      .ariaSnapshot();
    expect(
      accessibilitySnapshot,
      `Focusable item ${index} on ${route} must expose a non-empty accessible name.`,
    ).toMatch(/^- [^\n]+ "[^"]+"/mu);
    observedFocusOrder.push(focus?.order ?? "missing");
  }
  expect(observedFocusOrder).toEqual(audit.focusOrder);

  const routeName = route === "/" ? "home" : route.slice(1);
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: join(outputDirectory, `${routeName}-${viewport.width}.png`),
  });
}

test.describe("automated accessibility viewport matrix", () => {
  for (const viewport of viewports) {
    test(`${viewport.width}px: names, order, focus, contrast and touch contracts`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const browserErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(message.text());
      });
      page.on("pageerror", (error) => browserErrors.push(error.message));

      const outputDirectory = join(
        process.cwd(),
        "tmp",
        "final-accessibility",
        testInfo.project.name,
      );
      mkdirSync(outputDirectory, { recursive: true });

      for (const route of publicEntryRoutes) {
        await auditRoute({
          outputDirectory,
          page,
          route,
          viewport,
        });
      }

      expect(browserErrors).toEqual([]);
    });
  }
});

test("emulated 200% reflow approximation at a 1440x900 physical raster", async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Run the one emulated reflow context once.",
  );

  const viewport = { height: 450, width: 720 };
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    screen: viewport,
    viewport,
  });
  const page = await context.newPage();
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  const outputDirectory = join(
    process.cwd(),
    "tmp",
    "final-accessibility",
    "emulated-200-percent",
  );
  mkdirSync(outputDirectory, { recursive: true });

  expect(
    await page.evaluate(() => ({
      devicePixelRatio: window.devicePixelRatio,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
    })),
  ).toEqual({ devicePixelRatio: 2, innerHeight: 450, innerWidth: 720 });

  try {
    for (const route of publicEntryRoutes) {
      await auditRoute({ outputDirectory, page, route, viewport });
    }
    expect(browserErrors).toEqual([]);
  } finally {
    await context.close();
  }
});
