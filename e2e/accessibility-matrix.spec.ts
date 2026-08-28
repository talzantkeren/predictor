import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from "./support/stream-safe-test";

import {
  grantSystemAdminInDisposableLocalDatabase,
  seedManagerReportStatusesInDisposableLocalDatabase,
} from "./support/local-database";
import { registerConfirmedUser } from "./support/local-auth";
import { closeContextsAfterResponseStreams } from "./support/response-streams";

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

const publicEntryRoutes = ["/", "/login", "/register", "/forgot-password"] as const;
const nativeScaleAudit = process.env.S9_NATIVE_SCALE_AUDIT === "1";

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type PasswordSessionResponse = {
  user?: { id?: unknown };
};

type BrowserAudit = {
  clientWidth: number;
  clippedTargets: Array<{
    label: string;
    left: number;
    right: number;
    tag: string;
  }>;
  direction: string;
  focusableCount: number;
  focusOrder: string[];
  overlappingTargets: Array<{
    first: string;
    second: string;
  }>;
  scrollWidth: number;
  undersizedTargets: Array<{
    height: number;
    label: string;
    tag: string;
    width: number;
  }>;
};

type FocusAudit =
  | {
      bottom: number;
      focusVisible: boolean;
      left: number;
      order: string | undefined;
      right: number;
      top: number;
      visibleIndicator: boolean;
    }
  | undefined;

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
      const bounds = element.getBoundingClientRect();
      if (bounds.width >= 44 && bounds.height >= 44) return [];
      // A checkbox/radio label is part of the native control's clickable target.
      if (
        element instanceof HTMLInputElement &&
        ["checkbox", "radio"].includes(element.type) &&
        [...(element.labels ?? [])].some((label) => {
          const labelBounds = label.getBoundingClientRect();
          return labelBounds.width >= 44 && labelBounds.height >= 44;
        })
      ) {
        return [];
      }
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

    const targetLabel = (element: HTMLElement) =>
      element.getAttribute("aria-label") ??
      element.textContent?.trim().replace(/\s+/gu, " ").slice(0, 80) ??
      element.tagName;
    const clippedTargets = candidates.flatMap((element) => {
      const bounds = element.getBoundingClientRect();
      if (
        bounds.left >= -0.5 &&
        bounds.right <= document.documentElement.clientWidth + 0.5
      ) {
        return [];
      }
      let ancestor = element.parentElement;
      while (ancestor) {
        const overflowX = getComputedStyle(ancestor).overflowX;
        if (
          ["auto", "scroll"].includes(overflowX) &&
          ancestor.scrollWidth > ancestor.clientWidth + 1
        ) {
          // Deliberate component-level scrolling is not page clipping. The
          // keyboard pass below must still scroll every target fully onscreen.
          return [];
        }
        ancestor = ancestor.parentElement;
      }
      return [
        {
          label: targetLabel(element),
          left: bounds.left,
          right: bounds.right,
          tag: element.tagName,
        },
      ];
    });
    const overlappingTargets = candidates.flatMap((first, firstIndex) =>
      candidates.slice(firstIndex + 1).flatMap((second) => {
        if (first.contains(second) || second.contains(first)) return [];
        const firstBounds = first.getBoundingClientRect();
        const secondBounds = second.getBoundingClientRect();
        const isOnscreen = (bounds: DOMRect) =>
          bounds.right > 0 &&
          bounds.left < document.documentElement.clientWidth &&
          bounds.bottom > 0 &&
          bounds.top < window.innerHeight;
        if (!isOnscreen(firstBounds) || !isOnscreen(secondBounds)) return [];
        const overlapWidth =
          Math.min(firstBounds.right, secondBounds.right) -
          Math.max(firstBounds.left, secondBounds.left);
        const overlapHeight =
          Math.min(firstBounds.bottom, secondBounds.bottom) -
          Math.max(firstBounds.top, secondBounds.top);
        if (overlapWidth <= 1 || overlapHeight <= 1) return [];
        return [
          {
            first: targetLabel(first),
            second: targetLabel(second),
          },
        ];
      }),
    );

    const focusOrder = candidates.map((element, index) => {
      const order = String(index);
      element.dataset.accessibilityMatrixOrder = order;
      return order;
    });

    return {
      clientWidth: document.documentElement.clientWidth,
      clippedTargets,
      direction: document.documentElement.dir,
      focusableCount: candidates.length,
      focusOrder,
      overlappingTargets,
      scrollWidth: document.documentElement.scrollWidth,
      undersizedTargets,
    };
  });
}

async function auditAxeContracts(page: Page) {
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

  const manuallyMeasuredSelectors = new Set<string>();
  const unresolvedContrastNodes = axe.incomplete
    .filter((result) => result.id === "color-contrast")
    .flatMap((result) => result.nodes)
    .filter((node) => {
      const decorativeNonText =
        node.html.includes('aria-hidden="true"') &&
        node.failureSummary?.includes("non-text characters");
      const partiallyObscured = node.failureSummary?.includes(
        "partially obscured",
      );
      // Axe cannot resolve text behind some native controls/pseudo-elements;
      // retain those findings and adjudicate their computed CSS ratio below.
      if (partiallyObscured) {
        const selector = node.target[0];
        if (typeof selector === "string") {
          manuallyMeasuredSelectors.add(selector);
          return false;
        }
      }
      return !decorativeNonText;
    });
  expect(
    unresolvedContrastNodes,
    "Every applicable text node must receive either a conclusive axe result or an explicit manual CSS ratio check.",
  ).toEqual([]);

  const manuallyMeasuredRatios = await page.evaluate((selectors) => {
    const parseRgb = (value: string) => {
      const channels = value.match(/[\d.]+/gu)?.map(Number) ?? [];
      return {
        alpha: channels.length >= 4 ? channels[3] : 1,
        channels: channels.slice(0, 3),
      };
    };
    const luminance = (channels: number[]) => {
      if (channels.length !== 3) return Number.NaN;
      const linear = channels.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };

    return selectors.flatMap((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return [];
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (
        bounds.width <= 0 ||
        bounds.height <= 0 ||
        style.display === "none" ||
        style.visibility === "hidden"
      ) {
        return [];
      }

      let backgroundChannels: number[] = [];
      let backgroundElement: HTMLElement | null = element;
      while (backgroundElement) {
        const background = parseRgb(
          getComputedStyle(backgroundElement).backgroundColor,
        );
        if (background.alpha === 1 && background.channels.length === 3) {
          backgroundChannels = background.channels;
          break;
        }
        backgroundElement = backgroundElement.parentElement;
      }

      const foreground = luminance(parseRgb(style.color).channels);
      const background = luminance(backgroundChannels);
      const ratio =
        (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05);
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = Number.parseInt(style.fontWeight, 10);
      const threshold =
        fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
      return [{ ratio, selector, threshold }];
    });
  }, [...manuallyMeasuredSelectors]);
  expect(manuallyMeasuredRatios).toHaveLength(manuallyMeasuredSelectors.size);
  for (const measurement of manuallyMeasuredRatios) {
    expect(
      measurement.ratio,
      `Manually adjudicated ${measurement.selector} contrast must meet its WCAG threshold.`,
    ).toBeGreaterThanOrEqual(measurement.threshold);
  }
}

async function auditRoute({
  artifactName,
  outputDirectory,
  page,
  route,
  viewport,
}: {
  artifactName?: string;
  outputDirectory: string;
  page: Page;
  route: string;
  viewport: { height: number; width: number };
}) {
  const response = await page.goto(route);
  expect(response?.ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("main")).toHaveCount(1);

  await auditAxeContracts(page);

  const audit = await auditBrowserContracts(page);
  expect(audit.direction).toBe("rtl");
  expect(audit.scrollWidth).toBeLessThanOrEqual(audit.clientWidth);
  expect(audit.clippedTargets).toEqual([]);
  expect(audit.focusableCount).toBeGreaterThan(0);
  expect(audit.overlappingTargets).toEqual([]);
  expect(audit.undersizedTargets).toEqual([]);

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  });
  const observedFocusOrder: string[] = [];
  for (let index = 0; index < audit.focusableCount; index += 1) {
    let focus: FocusAudit = undefined;
    // datetime-local exposes several user-agent sub-stops while activeElement
    // remains the same input. Collapse only those repeats and keep DOM order exact.
    for (let browserStop = 0; browserStop < 8; browserStop += 1) {
      await page.keyboard.press("Tab");
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      focus = await page.evaluate<FocusAudit>(() => {
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
      if (focus?.order !== String(index - 1)) break;
    }
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

  const routeName =
    artifactName ?? (route === "/" ? "home" : route.slice(1).replaceAll("/", "-"));
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: join(outputDirectory, `${routeName}-${viewport.width}.png`),
  });
}

function getContextOptions(projectName: string): BrowserContextOptions {
  if (nativeScaleAudit) {
    return {
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
      timezoneId: "Asia/Jerusalem",
      userAgent: devices["Desktop Chrome"].userAgent,
      viewport: null,
    };
  }

  const descriptor = projectName.startsWith("mobile-")
    ? devices["Pixel 5"]
    : devices["Desktop Chrome"];

  return {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    deviceScaleFactor: descriptor.deviceScaleFactor,
    hasTouch: descriptor.hasTouch,
    isMobile: descriptor.isMobile,
    timezoneId: "Asia/Jerusalem",
    userAgent: descriptor.userAgent,
    viewport: descriptor.viewport,
  };
}

function getNativeScaleViewport(projectName: string) {
  const match = /^native-scale-(\d+)x(\d+)$/u.exec(projectName);
  if (!match) {
    throw new Error(`Native-scale project name is invalid: ${projectName}`);
  }
  return { height: Number(match[2]), width: Number(match[1]) };
}

async function assertNativeScaleProcess({
  browser,
  outputDirectory,
  page,
  viewport,
}: {
  browser: Browser;
  outputDirectory: string;
  page: Page;
  viewport: { height: number; width: number };
}) {
  const cdp = await page.context().newCDPSession(page);
  const commandLine = (await cdp.send("Browser.getBrowserCommandLine")) as {
    arguments?: unknown;
  };
  const argumentsList = Array.isArray(commandLine.arguments)
    ? commandLine.arguments.filter(
        (argument): argument is string => typeof argument === "string",
      )
    : [];
  expect(argumentsList).toContain("--force-device-scale-factor=2");

  const metrics = await page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    visualViewportScale: window.visualViewport?.scale ?? null,
  }));
  expect(metrics).toEqual({
    devicePixelRatio: 2,
    innerHeight: viewport.height,
    innerWidth: viewport.width,
    visualViewportScale: 1,
  });

  const screenshot = await page.screenshot({ animations: "disabled" });
  const raster = await sharp(screenshot).metadata();
  expect({ height: raster.height, width: raster.width }).toEqual({
    height: viewport.height * 2,
    width: viewport.width * 2,
  });

  writeFileSync(
    join(outputDirectory, `native-scale-${viewport.width}.json`),
    `${JSON.stringify(
      {
        browserVersion: browser.version(),
        commandLineScale: 2,
        cssViewport: viewport,
        devicePixelRatio: metrics.devicePixelRatio,
        raster: { height: raster.height, width: raster.width },
        visualViewportScale: metrics.visualViewportScale,
        viewportEmulation: false,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
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
    throw new Error("Local accessibility-test identity was unavailable.");
  }

  return payload.user.id;
}

async function createLeague(page: Page, leagueName: string) {
  await page.goto("/leagues/new");
  await page.getByLabel("שם הליגה").fill(leagueName);
  await page.getByRole("button", { name: "יצירת ליגה", exact: true }).click();
  await expect(page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/u);

  const leagueId = new URL(page.url()).pathname.split("/").at(-1);
  if (!leagueId || !canonicalUuidPattern.test(leagueId)) {
    throw new Error("Accessibility-test league ID was invalid.");
  }

  return leagueId;
}

async function assertInvalidRejectionState({
  outputDirectory,
  page,
  viewport,
}: {
  outputDirectory: string;
  page: Page;
  viewport: { height: number; width: number };
}) {
  const rejectionReason = page.getByLabel("סיבת דחייה");
  const pendingRequestCard = page.locator("article").filter({
    has: rejectionReason,
  });
  const rejectButton = pendingRequestCard.getByRole("button", {
    name: "דחיית הבקשה",
  });

  await rejectionReason.fill(`סיבה ${String.fromCodePoint(0x202e)} נסתרת`);
  await rejectButton.click();
  await expect(rejectionReason).toBeFocused();
  await expect(rejectionReason).toHaveAttribute("aria-invalid", "true");
  const describedBy = await rejectionReason.getAttribute("aria-describedby");
  expect(describedBy?.trim().split(/\s+/u)).toHaveLength(2);
  await expect(
    pendingRequestCard.getByText(
      "סיבת הדחייה מכילה תווי כיווניות בלתי־נראים שאינם מותרים.",
    ),
  ).toBeVisible();
  await expect(pendingRequestCard.getByRole("alert")).toHaveCount(1);

  const focusIndicator = await rejectionReason.evaluate((textarea) => {
    const style = getComputedStyle(textarea);
    return (
      style.boxShadow !== "none" ||
      (style.outlineStyle !== "none" &&
        Number.parseFloat(style.outlineWidth) >= 2)
    );
  });
  expect(focusIndicator).toBe(true);

  await auditAxeContracts(page);

  const audit = await auditBrowserContracts(page);
  expect(audit.direction).toBe("rtl");
  expect(audit.scrollWidth).toBeLessThanOrEqual(audit.clientWidth);
  expect(audit.clippedTargets).toEqual([]);
  expect(audit.overlappingTargets).toEqual([]);
  expect(audit.undersizedTargets).toEqual([]);

  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: join(
      outputDirectory,
      `league-members-invalid-rejection-${viewport.width}.png`,
    ),
  });
}

async function auditPublicMatrix({
  page,
  testInfo,
  viewport,
}: {
  page: Page;
  testInfo: TestInfo;
  viewport: { height: number; width: number };
}) {
  if (!nativeScaleAudit) {
    await page.setViewportSize(viewport);
  }
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
    await auditRoute({ outputDirectory, page, route, viewport });
  }

  expect(browserErrors).toEqual([]);
}

if (nativeScaleAudit) {
  test("forced browser scale: public accessibility matrix", async ({
    browser,
    page,
  }, testInfo) => {
    const viewport = getNativeScaleViewport(testInfo.project.name);
    await auditPublicMatrix({ page, testInfo, viewport });
    await assertNativeScaleProcess({
      browser,
      outputDirectory: join(
        process.cwd(),
        "tmp",
        "final-accessibility",
        testInfo.project.name,
      ),
      page,
      viewport,
    });
  });
} else {
  test.describe("automated accessibility viewport matrix", () => {
    for (const viewport of viewports) {
      test(`${viewport.width}px: names, order, focus, contrast and touch contracts`, async ({
        page,
      }, testInfo) => {
        await auditPublicMatrix({ page, testInfo, viewport });
      });
    }
  });
}

test("authenticated admin, members and settings matrix", async ({
  browser,
  page,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = `Aa1!${crypto.randomUUID()}`;
  const contextOptions = getContextOptions(testInfo.project.name);
  const contexts: BrowserContext[] = [];

  try {
    const managerEmail = `a11y-manager-${suffix}@example.com`;
    const manager = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      contextOptions,
      displayName: "מנהלת נגישות",
      email: managerEmail,
      password,
    });
    contexts.push(manager.context);
    const managerId = await getRegisteredUserId(managerEmail, password);
    grantSystemAdminInDisposableLocalDatabase(managerId);
    const leagueId = await createLeague(
      manager.page,
      `ליגת נגישות ${suffix}`,
    );

    const removedPendingEmail = `a11y-removed-${suffix}@example.com`;
    const removedPending = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      contextOptions,
      displayName: "מבקשת הוכחה",
      email: removedPendingEmail,
      password,
    });
    contexts.push(removedPending.context);
    const removedPendingUserId = await getRegisteredUserId(
      removedPendingEmail,
      password,
    );

    const approvalEmail = `a11y-approval-${suffix}@example.com`;
    const approval = await registerConfirmedUser({
      browser,
      registrationPage: page,
      request,
      contextOptions,
      displayName: "מבקשת הצטרפות",
      email: approvalEmail,
      password,
    });
    contexts.push(approval.context);
    const approvalUserId = await getRegisteredUserId(approvalEmail, password);

    seedManagerReportStatusesInDisposableLocalDatabase({
      approvalUserId,
      leagueId,
      managerId,
      removedPendingUserId,
    });

    const browserErrors: string[] = [];
    manager.page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    manager.page.on("pageerror", (error) => browserErrors.push(error.message));
    await manager.page.emulateMedia({ reducedMotion: "reduce" });

    const authenticatedRoutes = [
      { artifactName: "admin-matches", route: "/admin/matches" },
      { artifactName: "admin-sync", route: "/admin/sync" },
      {
        artifactName: "league-members",
        route: `/leagues/${leagueId}/members`,
      },
      {
        artifactName: "league-settings",
        route: `/leagues/${leagueId}/settings`,
      },
    ];
    const outputDirectory = join(
      process.cwd(),
      "tmp",
      "final-accessibility",
      `authenticated-${testInfo.project.name}`,
    );
    mkdirSync(outputDirectory, { recursive: true });

    const activeViewports = nativeScaleAudit
      ? [getNativeScaleViewport(testInfo.project.name)]
      : viewports;
    if (nativeScaleAudit) {
      await assertNativeScaleProcess({
        browser,
        outputDirectory,
        page: manager.page,
        viewport: activeViewports[0],
      });
    }

    for (const viewport of activeViewports) {
      if (!nativeScaleAudit) {
        await manager.page.setViewportSize(viewport);
      }
      for (const authenticatedRoute of authenticatedRoutes) {
        await auditRoute({
          ...authenticatedRoute,
          outputDirectory,
          page: manager.page,
          viewport,
        });
        if (authenticatedRoute.artifactName === "league-members") {
          await assertInvalidRejectionState({
            outputDirectory,
            page: manager.page,
            viewport,
          });
        }
      }
    }

    if (!nativeScaleAudit) {
      const emulatedViewport = { height: 450, width: 720 };
      const emulatedContext = await browser.newContext({
        ...contextOptions,
        deviceScaleFactor: 2,
        reducedMotion: "reduce",
        screen: emulatedViewport,
        storageState: await manager.context.storageState(),
        viewport: emulatedViewport,
      });
      contexts.push(emulatedContext);
      const emulatedPage = await emulatedContext.newPage();
      emulatedPage.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(message.text());
      });
      emulatedPage.on("pageerror", (error) =>
        browserErrors.push(error.message),
      );
      const emulatedResponse = await emulatedPage.goto("/admin/matches");
      expect(emulatedResponse?.ok()).toBe(true);
      expect(
        await emulatedPage.evaluate(() => ({
          devicePixelRatio: window.devicePixelRatio,
          innerHeight: window.innerHeight,
          innerWidth: window.innerWidth,
        })),
      ).toEqual({ devicePixelRatio: 2, innerHeight: 450, innerWidth: 720 });

      const emulatedOutputDirectory = join(
        process.cwd(),
        "tmp",
        "final-accessibility",
        `authenticated-emulated-200-percent-${testInfo.project.name}`,
      );
      mkdirSync(emulatedOutputDirectory, { recursive: true });
      for (const authenticatedRoute of authenticatedRoutes) {
        await auditRoute({
          ...authenticatedRoute,
          outputDirectory: emulatedOutputDirectory,
          page: emulatedPage,
          viewport: emulatedViewport,
        });
        if (authenticatedRoute.artifactName === "league-members") {
          await assertInvalidRejectionState({
            outputDirectory: emulatedOutputDirectory,
            page: emulatedPage,
            viewport: emulatedViewport,
          });
        }
      }
    }
    expect(browserErrors).toEqual([]);
  } finally {
    await closeContextsAfterResponseStreams(contexts);
  }
});

if (!nativeScaleAudit) {
  test("emulated 200% reflow approximation at a 1440x900 physical raster", async ({
    browser,
  }, testInfo) => {
  const viewport = { height: 450, width: 720 };
  const profile = getContextOptions(testInfo.project.name);
  const context = await browser.newContext({
    ...profile,
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
    `emulated-200-percent-${testInfo.project.name}`,
  );
  mkdirSync(outputDirectory, { recursive: true });

  const initialResponse = await page.goto("/");
  expect(initialResponse?.ok()).toBe(true);
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
}
