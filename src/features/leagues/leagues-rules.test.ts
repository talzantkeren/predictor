import { describe, expect, it } from "vitest";

import { getSeasonSourceLabel } from "@/features/leagues/display";
import {
  getSafeLeagueErrorMessage,
  getSafeLeagueSettingsErrorMessage,
} from "@/features/leagues/errors";
import {
  createLeagueSchema,
  demoEntryFeeAgorotSchema,
  leagueDescriptionSchema,
  leagueNameSchema,
  percentageToBps,
  prizeRulesSchema,
  scoringRulesSchema,
  updateLeagueSettingsSchema,
} from "@/features/leagues/schemas";
import {
  areLeagueRulesEffectivelyLocked,
  formatUtcDateTimeLocalValue,
  type EditableLeagueSettings,
} from "@/features/leagues/settings-types";

const validLeagueInput = {
  name: "ליגת החברים",
  description: "עונת הבכורה",
  seasonId: "26000000-0000-4000-8000-000000000027",
  demoEntryFeeAgorot: "2500",
  demoPaymentInstructions: "סימון ידני לצורכי הדגמה",
  allowLateJoin: true,
  scoring: {
    exactPoints: "3",
    correctOutcomePoints: "1",
    incorrectPoints: "0",
  },
  prizes: [{ position: "1", percentageBps: "100" }],
};

const validSettingsInput = {
  leagueId: "26000000-0000-4000-8000-000000000028",
  expectedSettingsVersion: "2",
  name: "ליגת החברים",
  description: "עונת הבכורה",
  demoEntryFeeAgorot: "2500",
  demoPaymentInstructions: "סימון ידני לצורכי הדגמה",
  joinsCloseAt: "2026-08-30T17:45:12.123456",
  allowLateJoin: true,
  scoring: {
    exactPoints: "3",
    correctOutcomePoints: "1",
    incorrectPoints: "0",
  },
  prizes: [{ position: "1", percentageBps: "100" }],
};

describe("league fields", () => {
  it("labels identical season names by their catalog provenance", () => {
    expect(getSeasonSourceLabel("api-football")).toBe("API-Football");
    expect(getSeasonSourceLabel(null)).toBe("Demo");
  });

  it("trims a valid league name", () => {
    expect(leagueNameSchema.parse("  ליגת בדיקה  ")).toBe("ליגת בדיקה");
  });

  it("accepts league-name boundaries", () => {
    expect(leagueNameSchema.safeParse("אבג").success).toBe(true);
    expect(leagueNameSchema.safeParse("א".repeat(80)).success).toBe(true);
  });

  it("rejects league names outside the boundaries", () => {
    expect(leagueNameSchema.safeParse("אב").success).toBe(false);
    expect(leagueNameSchema.safeParse("א".repeat(81)).success).toBe(false);
  });

  it("normalizes an empty description and enforces the boundary", () => {
    expect(leagueDescriptionSchema.parse("  ")).toBeUndefined();
    expect(leagueDescriptionSchema.safeParse("א".repeat(500)).success).toBe(true);
    expect(leagueDescriptionSchema.safeParse("א".repeat(501)).success).toBe(false);
  });

  it("accepts only a non-negative integer Demo amount", () => {
    expect(demoEntryFeeAgorotSchema.parse("0")).toBe(0);
    expect(demoEntryFeeAgorotSchema.parse("2500")).toBe(2500);
    expect(demoEntryFeeAgorotSchema.safeParse("-1").success).toBe(false);
    expect(demoEntryFeeAgorotSchema.safeParse("1.5").success).toBe(false);
    expect(demoEntryFeeAgorotSchema.safeParse("NaN").success).toBe(false);
  });

  it("rejects payment links in Demo instructions", () => {
    expect(
      createLeagueSchema.safeParse({
        ...validLeagueInput,
        demoPaymentInstructions: "https://pay.example",
      }).success,
    ).toBe(false);
  });

  it("rejects control characters and line separators in the league name", () => {
    expect(leagueNameSchema.safeParse("אבג\u0000דהו").success).toBe(false);
    expect(leagueNameSchema.safeParse("אבג\u0001דהו").success).toBe(false);
    expect(leagueNameSchema.safeParse("שם\nרב־שורתי").success).toBe(false);
    expect(leagueNameSchema.safeParse("אבג\u0085דהו").success).toBe(false);
    expect(leagueNameSchema.safeParse("שם\u2028רב־שורתי").success).toBe(false);
    expect(leagueNameSchema.safeParse("שם\u2029רב־שורתי").success).toBe(false);
  });

  it("keeps directional marks while rejecting control characters", () => {
    expect(leagueNameSchema.safeParse("ליגה \u200f2026").success).toBe(true);
  });

  it("allows line breaks but not other control characters in multiline fields", () => {
    expect(leagueDescriptionSchema.safeParse("שורה ראשונה\nשורה שנייה").success).toBe(
      true,
    );
    expect(leagueDescriptionSchema.safeParse("תיאור\u0007פגום").success).toBe(false);
    expect(leagueDescriptionSchema.safeParse("תיאור\u0000פגום").success).toBe(false);
    expect(
      createLeagueSchema.safeParse({
        ...validLeagueInput,
        demoPaymentInstructions: "הוראה\u000bפגומה",
      }).success,
    ).toBe(false);
    expect(
      createLeagueSchema.safeParse({
        ...validLeagueInput,
        demoPaymentInstructions: "הוראה\u0000פגומה",
      }).success,
    ).toBe(false);
    expect(
      createLeagueSchema.safeParse({
        ...validLeagueInput,
        demoPaymentInstructions: "שורה ראשונה\r\nשורה שנייה",
      }).success,
    ).toBe(true);
  });
});

describe("scoring rules", () => {
  it("accepts the valid default 3/1/0 rules", () => {
    expect(
      scoringRulesSchema.parse({
        exactPoints: "3",
        correctOutcomePoints: "1",
        incorrectPoints: "0",
      }),
    ).toEqual({
      exactPoints: 3,
      correctOutcomePoints: 1,
      incorrectPoints: 0,
    });
  });

  it("enforces integer values in the documented range", () => {
    for (const exactPoints of ["-1", "1.5", "101", ""]) {
      expect(
        scoringRulesSchema.safeParse({
          exactPoints,
          correctOutcomePoints: "1",
          incorrectPoints: "0",
        }).success,
      ).toBe(false);
    }
  });

  it("enforces exact >= outcome >= incorrect", () => {
    expect(
      scoringRulesSchema.safeParse({
        exactPoints: "1",
        correctOutcomePoints: "2",
        incorrectPoints: "0",
      }).success,
    ).toBe(false);
    expect(
      scoringRulesSchema.safeParse({
        exactPoints: "3",
        correctOutcomePoints: "0",
        incorrectPoints: "1",
      }).success,
    ).toBe(false);
  });

  it("retains different custom values for two league inputs", () => {
    const first = createLeagueSchema.parse(validLeagueInput);
    const second = createLeagueSchema.parse({
      ...validLeagueInput,
      name: "ליגה מותאמת",
      scoring: {
        exactPoints: "10",
        correctOutcomePoints: "4",
        incorrectPoints: "2",
      },
    });

    expect(first.scoring).toEqual({
      exactPoints: 3,
      correctOutcomePoints: 1,
      incorrectPoints: 0,
    });
    expect(second.scoring).toEqual({
      exactPoints: 10,
      correctOutcomePoints: 4,
      incorrectPoints: 2,
    });
  });
});

describe("Demo prize rules", () => {
  it.each([
    ["100", 10_000],
    ["50", 5_000],
    ["33.33", 3_333],
    ["1.5", 150],
    ["0.01", 1],
  ])("converts %s percent deterministically to %i bps", (value, expected) => {
    expect(percentageToBps(value)).toBe(expected);
  });

  it.each(["", "0", "-1", "100.01", "1.234", "1,5", "01", "abc"])(
    "rejects malformed, non-positive, over-limit, or over-precision input %s",
    (value) => {
      expect(percentageToBps(value)).toBeNull();
    },
  );

  it("accepts consecutive positive positions totaling 10000 bps", () => {
    expect(
      prizeRulesSchema.parse([
        { position: "1", percentageBps: "60" },
        { position: "2", percentageBps: "40" },
      ]),
    ).toEqual([
      { position: 1, percentageBps: 6000 },
      { position: 2, percentageBps: 4000 },
    ]);
  });

  it("rejects zero and negative positions", () => {
    expect(
      prizeRulesSchema.safeParse([{ position: "0", percentageBps: "100" }])
        .success,
    ).toBe(false);
    expect(
      prizeRulesSchema.safeParse([{ position: "-1", percentageBps: "100" }])
        .success,
    ).toBe(false);
  });

  it("rejects duplicate, missing, or non-consecutive positions", () => {
    expect(
      prizeRulesSchema.safeParse([
        { position: "1", percentageBps: "50" },
        { position: "1", percentageBps: "50" },
      ]).success,
    ).toBe(false);
    expect(prizeRulesSchema.safeParse([]).success).toBe(false);
    expect(
      prizeRulesSchema.safeParse([
        { position: "1", percentageBps: "50" },
        { position: "3", percentageBps: "50" },
      ]).success,
    ).toBe(false);
  });

  it("rejects totals below or above 10000 bps", () => {
    expect(
      prizeRulesSchema.safeParse([
        { position: "1", percentageBps: "99.99" },
      ]).success,
    ).toBe(false);
    expect(
      prizeRulesSchema.safeParse([
        { position: "1", percentageBps: "60" },
        { position: "2", percentageBps: "40.01" },
      ]).success,
    ).toBe(false);
  });
});

describe("editable league settings", () => {
  it("normalizes an explicit UTC control value without losing microseconds", () => {
    const parsed = updateLeagueSettingsSchema.parse(validSettingsInput);

    expect(parsed.joinsCloseAt).toBe("2026-08-30T17:45:12.123456Z");
    expect(parsed.expectedSettingsVersion).toBe(2);
  });

  it.each([
    "0000-08-30T17:45",
    "2026-02-30T17:45",
    "2026-08-30T24:00",
    "infinity",
    "-infinity",
    "2026-08-30T17:45:12.1234567",
  ])("rejects an invalid or non-finite UTC deadline: %s", (joinsCloseAt) => {
    expect(
      updateLeagueSettingsSchema.safeParse({
        ...validSettingsInput,
        joinsCloseAt,
      }).success,
    ).toBe(false);
  });

  it("accepts an empty UTC deadline as null", () => {
    expect(
      updateLeagueSettingsSchema.parse({
        ...validSettingsInput,
        joinsCloseAt: "",
      }).joinsCloseAt,
    ).toBeNull();
  });

  it("preserves the full PostgreSQL UTC precision in the form control", () => {
    expect(
      formatUtcDateTimeLocalValue("2026-08-30T17:45:12.123456+00:00"),
    ).toBe("2026-08-30T17:45:12.123456");
  });

  it("uses the database lock decision instead of the browser clock", () => {
    const settings = {
      rulesLocked: true,
    } as EditableLeagueSettings;

    expect(areLeagueRulesEffectivelyLocked(settings)).toBe(true);
  });

  it("rejects stale or negative settings inputs at the app boundary", () => {
    expect(
      updateLeagueSettingsSchema.safeParse({
        ...validSettingsInput,
        expectedSettingsVersion: "0",
      }).success,
    ).toBe(false);
    expect(
      updateLeagueSettingsSchema.safeParse({
        ...validSettingsInput,
        scoring: { ...validSettingsInput.scoring, exactPoints: "-1" },
      }).success,
    ).toBe(false);
    expect(
      updateLeagueSettingsSchema.safeParse({
        ...validSettingsInput,
        prizes: [{ position: "1", percentageBps: "99.99" }],
      }).success,
    ).toBe(false);
  });
});

describe("safe league errors", () => {
  it("maps known stable database errors", () => {
    expect(getSafeLeagueErrorMessage({ message: "INVALID_PRIZE_RULES" })).toBe(
      "חלוקת הפרסים אינה תקינה וחייבת להסתכם ב־100%.",
    );
    expect(getSafeLeagueErrorMessage({ message: "SCORING_RULES_LOCKED" })).toBe(
      "חוקי הניקוד כבר נעולים ואינם ניתנים לשינוי.",
    );
  });

  it("does not expose unknown SQL details", () => {
    const safeMessage = getSafeLeagueErrorMessage({
      code: "XX000",
      message: "relation private.secret_table does not exist",
      details: "stack trace",
    });

    expect(safeMessage).toBe("לא ניתן ליצור את הליגה כרגע. יש לנסות שוב.");
    expect(safeMessage).not.toContain("secret_table");
    expect(safeMessage).not.toContain("stack");
  });

  it("maps locked and stale settings errors without exposing SQL", () => {
    expect(
      getSafeLeagueSettingsErrorMessage({ message: "LEAGUE_RULES_LOCKED" }),
    ).toContain("נעולים");
    expect(
      getSafeLeagueSettingsErrorMessage({ message: "SETTINGS_STALE" }),
    ).toContain("רענן");
    expect(
      getSafeLeagueSettingsErrorMessage({
        message: "select * from private.secret_settings",
      }),
    ).not.toContain("secret_settings");
  });
});
