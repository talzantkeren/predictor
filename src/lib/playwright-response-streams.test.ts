import { errors, type BrowserContext, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  closeContextsAfterResponseStreams,
  settleResponseStreamsBeforeCleanup,
} from "../../e2e/support/response-streams";

function fakePage({ closed = false } = {}) {
  return {
    goto: vi.fn(async () => null),
    isClosed: vi.fn(() => closed),
    url: vi.fn(() => "http://localhost:3000/dashboard"),
    waitForLoadState: vi.fn(async () => undefined),
  } as unknown as Page;
}

function fakeContext(pages: Page[]) {
  return {
    close: vi.fn(async () => undefined),
    pages: vi.fn(() => pages),
  } as unknown as BrowserContext;
}

describe("Playwright response-stream settlement", () => {
  it("settles and parks each open page before closing contexts sequentially", async () => {
    const sharedPage = fakePage();
    const closedPage = fakePage({ closed: true });
    const firstContext = fakeContext([sharedPage, closedPage]);
    const secondContext = fakeContext([sharedPage]);

    await closeContextsAfterResponseStreams([firstContext, secondContext]);

    const waitForLoadState = vi.mocked(sharedPage.waitForLoadState);
    const goto = vi.mocked(sharedPage.goto);
    const firstClose = vi.mocked(firstContext.close);
    const secondClose = vi.mocked(secondContext.close);
    expect(waitForLoadState).toHaveBeenCalledOnce();
    expect(waitForLoadState).toHaveBeenCalledWith("networkidle", {
      timeout: 10_000,
    });
    expect(goto).toHaveBeenCalledOnce();
    expect(goto).toHaveBeenCalledWith("about:blank", {
      timeout: 10_000,
      waitUntil: "load",
    });
    expect(closedPage.waitForLoadState).not.toHaveBeenCalled();
    expect(closedPage.goto).not.toHaveBeenCalled();
    expect(firstClose).toHaveBeenCalledOnce();
    expect(secondClose).toHaveBeenCalledOnce();
    expect(goto.mock.invocationCallOrder[0]).toBeLessThan(
      firstClose.mock.invocationCallOrder[0],
    );
    expect(firstClose.mock.invocationCallOrder[0]).toBeLessThan(
      secondClose.mock.invocationCallOrder[0],
    );
  });

  it("binds every E2E spec to the automatic stream-safe fixture", () => {
    const e2eDirectory = join(process.cwd(), "e2e");
    const specs = readdirSync(e2eDirectory).filter((name) =>
      name.endsWith(".spec.ts"),
    );

    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      const source = readFileSync(join(e2eDirectory, spec), "utf8");
      expect(source, spec).toContain('from "./support/stream-safe-test"');
      expect(source, spec).not.toContain('from "@playwright/test"');
    }
  });

  it("settles a directly supplied page without closing it", async () => {
    const page = fakePage();

    await settleResponseStreamsBeforeCleanup([page]);

    expect(page.waitForLoadState).toHaveBeenCalledOnce();
    expect(page.goto).toHaveBeenCalledWith("about:blank", {
      timeout: 10_000,
      waitUntil: "load",
    });
  });

  it("keeps cleanup bounded when unrelated traffic prevents network-idle", async () => {
    const page = fakePage();
    vi.mocked(page.waitForLoadState).mockRejectedValueOnce(
      new errors.TimeoutError("network remained active"),
    );
    const context = fakeContext([page]);

    await closeContextsAfterResponseStreams([context]);

    expect(page.goto).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("disables automatic Next link prefetch without disabling click navigation", () => {
    function componentFiles(directory: string): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const child = join(directory, entry.name);
        if (entry.isDirectory()) return componentFiles(child);
        return entry.name.endsWith(".tsx") ? [child] : [];
      });
    }

    const appLinkPath = join(
      process.cwd(),
      "src",
      "components",
      "ui",
      "app-link.tsx",
    );
    const appLink = readFileSync(appLinkPath, "utf8");
    expect(appLink).toContain('from "next/link"');
    expect(appLink).toContain("<NextLink {...props} prefetch={false} />");

    for (const file of componentFiles(join(process.cwd(), "src"))) {
      if (file === appLinkPath) continue;
      expect(readFileSync(file, "utf8"), file).not.toContain('from "next/link"');
    }

    const predictionLock = readFileSync(
      join(process.cwd(), "e2e", "prediction-lock.spec.ts"),
      "utf8",
    );
    expect(predictionLock).toContain(
      'await page.waitForLoadState("networkidle", { timeout: 10_000 })',
    );
    expect(
      predictionLock.match(/clickServerActionAndWaitForIdle\(/gu),
    ).toHaveLength(6);
  });
});
