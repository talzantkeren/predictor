import { describe, expect, it } from "vitest";

import {
  getSyncFailureMessage,
  getSyncSkipReasonLabel,
  getSyncStatusLabel,
  isFailedSyncRun,
} from "@/features/sync/display";

describe("sync run display semantics", () => {
  it("treats status, never a non-null result code, as the failure signal", () => {
    const skippedRun = {
      status: "skipped" as const,
      errorMessageSafe: null,
      resultCode: "MANUAL_PROVIDER",
    };

    expect(isFailedSyncRun(skippedRun)).toBe(false);
    expect(getSyncFailureMessage(skippedRun)).toBeNull();
    expect(getSyncSkipReasonLabel(skippedRun.resultCode)).toBe(
      "המערכת מוגדרת למסלול ידני ללא ספק חי",
    );
  });

  it("shows only the sanitized detail of an explicitly failed run", () => {
    expect(
      getSyncFailureMessage({
        status: "failed",
        errorMessageSafe: "הספק לא היה זמין.",
      }),
    ).toBe("הספק לא היה זמין.");
  });

  it("uses neutral labels for both current skip outcomes", () => {
    expect(getSyncStatusLabel("skipped")).toBe("דולג");
    expect(getSyncSkipReasonLabel("CONCURRENT_ATTEMPT")).toContain(
      "ניסיון מקביל",
    );
    expect(getSyncSkipReasonLabel("FUTURE_REASON")).toBe("סיבת דילוג אחרת");
  });
});
