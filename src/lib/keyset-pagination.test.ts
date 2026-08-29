import { describe, expect, it } from "vitest";

import {
  buildKeysetPage,
  decodeKeysetCursor,
  encodeKeysetCursor,
  getPostgrestKeysetFilter,
  parseOptionalKeysetCursor,
} from "@/lib/keyset-pagination";

const first = {
  at: "2026-08-26T12:00:00.000Z",
  id: "91000000-0000-4000-8000-000000000001",
};
const second = {
  at: "2026-08-26T12:00:00.000Z",
  id: "91000000-0000-4000-8000-000000000002",
};

describe("bounded keyset pagination", () => {
  it("round-trips a strict opaque timestamp and UUID cursor", () => {
    const encoded = encodeKeysetCursor(first);

    expect(encoded).not.toContain(first.id);
    expect(decodeKeysetCursor(encoded)).toEqual(first);
  });

  it.each([
    undefined,
    "",
    "not+base64",
    Buffer.from("{}", "utf8").toString("base64url"),
    Buffer.from(
      JSON.stringify({ ...first, extra: "untrusted" }),
      "utf8",
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify({ ...first, at: "0000-01-01T00:00:00.000Z" }),
      "utf8",
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify({ ...first, at: "infinity" }),
      "utf8",
    ).toString("base64url"),
  ])("rejects malformed or non-canonical cursors: %s", (value) => {
    expect(decodeKeysetCursor(value)).toBeNull();
  });

  it("distinguishes an omitted cursor from an invalid supplied cursor", () => {
    expect(parseOptionalKeysetCursor(undefined)).toEqual({
      success: true,
      data: undefined,
    });
    expect(parseOptionalKeysetCursor("invalid")).toEqual({ success: false });
  });

  it("uses the UUID tie-breaker for equal timestamps", () => {
    expect(
      getPostgrestKeysetFilter("created_at", "descending", second),
    ).toBe(
      `created_at.lt.${second.at},and(created_at.eq.${second.at},id.lt.${second.id})`,
    );
  });

  it("keeps the server sentinel private and returns an explicit next cursor", () => {
    const page = buildKeysetPage(
      [first, second],
      1,
      (row) => row.id,
      (row) => row,
    );

    expect(page.items).toEqual([first.id]);
    expect(page.hasMore).toBe(true);
    expect(decodeKeysetCursor(page.nextCursor)).toEqual(first);
  });

  it("returns an explicit end state without a cursor", () => {
    expect(
      buildKeysetPage([first], 1, (row) => row.id, (row) => row),
    ).toEqual({ items: [first.id], hasMore: false, nextCursor: null });
  });
});
