import { describe, expect, it } from "vitest";

import { containsUnexpectedWebServerError } from "@/lib/playwright-server-log";

describe("Playwright web-server log gate", () => {
  it("rejects the observed closed destination stream even when tests pass", () => {
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
