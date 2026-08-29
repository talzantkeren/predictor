import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { containsUnexpectedWebServerError } from "@/lib/playwright-server-log";

describe("Playwright web-server log gate", () => {
  it("pins the upstream abort fix and still rejects real closed streams", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    // Next 16.3.0 reported client-aborted RSC streams as render failures:
    // https://github.com/vercel/next.js/issues/96704
    // The fix merged before this canary was published:
    // https://github.com/vercel/next.js/pull/96715
    expect(packageJson.dependencies?.next).toBe("16.4.0-canary.9");
    expect(packageJson.devDependencies?.["@next/env"]).toBe(
      "16.4.0-canary.9",
    );
    expect(packageJson.devDependencies?.["eslint-config-next"]).toBe(
      "16.4.0-canary.9",
    );

    expect(
      containsUnexpectedWebServerError(
        "[WebServer] ⨯ Error: The destination stream closed early.\n  2 passed",
      ),
    ).toBe(true);
  });

  it("allows ordinary prefixed warnings and clean passing output", () => {
    expect(
      containsUnexpectedWebServerError(
        "[WebServer] (node:123) Warning: NO_COLOR was ignored\n  2 passed",
      ),
    ).toBe(false);
  });
});
