import { describe, expect, it } from "vitest";

import {
  getDatabaseSyncError,
  getSyncError,
  SyncError,
} from "@/features/sync/errors";

describe("sync error mapping", () => {
  it("maps only the RPC authorization sentinel to FORBIDDEN", () => {
    const error = getDatabaseSyncError({
      code: "P0001",
      message: "FORBIDDEN",
      details: "private database detail",
    });

    expect(error).toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(error.message).not.toContain("database detail");
  });

  it("maps unknown database and thrown values to a stable safe failure", () => {
    for (const failure of [
      { message: "relation sync_runs unavailable" },
      new Error("password=private"),
      "private raw failure",
    ]) {
      const error = getDatabaseSyncError(failure);
      expect(error).toMatchObject({ code: "SYNC_UNAVAILABLE", status: 503 });
      expect(error.message).not.toContain("private");
    }
  });

  it("preserves an already classified boundary error", () => {
    const classified = new SyncError("SYNC_NOT_CONFIGURED", 503);
    expect(getSyncError(classified)).toBe(classified);
  });
});
