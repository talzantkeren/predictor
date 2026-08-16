import { describe, expect, it } from "vitest";

import { getSafeScoringErrorMessage } from "@/features/scoring/errors";

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
});
