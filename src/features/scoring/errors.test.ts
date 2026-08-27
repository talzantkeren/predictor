import { describe, expect, it } from "vitest";

import {
  getSafeManualOverrideClearErrorMessage,
  getSafeScoringErrorMessage,
} from "@/features/scoring/errors";

describe("safe scoring errors", () => {
  it("maps a pre-kickoff result rejection without exposing database details", () => {
    expect(
      getSafeScoringErrorMessage({ code: "P0001", message: "MATCH_NOT_STARTED" }),
    ).toBe("אפשר להזין תוצאת סיום רק לאחר מועד פתיחת המשחק.");
  });

  it("keeps unknown database errors generic", () => {
    expect(
      getSafeScoringErrorMessage({ code: "XX000", message: "private details" }),
    ).toBe("לא ניתן לשמור את התוצאה כרגע. יש לנסות שוב.");
  });

  it("maps an unsupported ownership handoff without exposing SQL details", () => {
    expect(
      getSafeScoringErrorMessage({
        code: "P0001",
        message: "MATCH_PROVIDER_OWNERSHIP_REQUIRED",
      }),
    ).toBe(
      "אפשר להחזיר בעלות לספק רק במשחק שמחובר לזהות API-Football תקינה.",
    );
  });

  it("maps a revoked clear actor without reusing result-entry copy", () => {
    expect(
      getSafeManualOverrideClearErrorMessage({
        code: "P0001",
        message: "FORBIDDEN",
      }),
    ).toBe("אין הרשאה להחזיר את ניהול המשחק לספק.");
  });
});
