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
    isClosed: vi.fn(() => closed),
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
  it("settles each open page once before closing its contexts", async () => {
    const sharedPage = fakePage();
    const closedPage = fakePage({ closed: true });
    const firstContext = fakeContext([sharedPage, closedPage]);
    const secondContext = fakeContext([sharedPage]);

    await closeContextsAfterResponseStreams([firstContext, secondContext]);

    const waitForLoadState = vi.mocked(sharedPage.waitForLoadState);
    const firstClose = vi.mocked(firstContext.close);
    expect(waitForLoadState).toHaveBeenCalledOnce();
    expect(waitForLoadState).toHaveBeenCalledWith("networkidle", {
      timeout: 10_000,
    });
    expect(closedPage.waitForLoadState).not.toHaveBeenCalled();
    expect(firstClose).toHaveBeenCalledOnce();
    expect(secondContext.close).toHaveBeenCalledOnce();
    expect(waitForLoadState.mock.invocationCallOrder[0]).toBeLessThan(
      firstClose.mock.invocationCallOrder[0],
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
  });

  it("keeps cleanup bounded when unrelated traffic prevents network-idle", async () => {
    const page = fakePage();
    vi.mocked(page.waitForLoadState).mockRejectedValueOnce(
      new errors.TimeoutError("network remained active"),
    );
    const context = fakeContext([page]);

    await closeContextsAfterResponseStreams([context]);

    expect(context.close).toHaveBeenCalledOnce();
  });
});
