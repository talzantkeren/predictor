import { describe, expect, it } from "vitest";

import { getSafePredictionsErrorMessage } from "@/features/predictions/errors";
import {
  canWritePrediction,
  derivePredictionDisplayState,
  formatDateTimeInTimeZone,
  formatRemainingDuration,
  getCountdownSeconds,
  getLockCountdownAnnouncement,
  getMatchStatusLabel,
  getProviderReviewLabel,
  getPredictionStateLabel,
  getUtcDateRange,
  isKickoffLocked,
} from "@/features/predictions/display";
import {
  parseMatchListFilter,
  savePredictionInputSchema,
} from "@/features/predictions/schemas";

const basePredictionInput = {
  leagueId: "26000000-0000-4000-8000-000000000027",
  matchId: "26000000-0000-4000-8000-000000000201",
  predictedHomeScore: "2",
  predictedAwayScore: "1",
};

describe("prediction input validation", () => {
  it.each([
    ["0", "0", 0, 0],
    ["30", "30", 30, 30],
    ["2", "1", 2, 1],
  ])("accepts bounded integer scores %s-%s", (home, away, expectedHome, expectedAway) => {
    const parsed = savePredictionInputSchema.parse({
      ...basePredictionInput,
      predictedHomeScore: home,
      predictedAwayScore: away,
    });
    expect(parsed.predictedHomeScore).toBe(expectedHome);
    expect(parsed.predictedAwayScore).toBe(expectedAway);
  });

  it.each(["", "-1", "31", "1.5", "1.0", " 1", "1 ", "abc", null])(
    "rejects a malformed or out-of-range score: %j",
    (score) => {
      expect(
        savePredictionInputSchema.safeParse({
          ...basePredictionInput,
          predictedHomeScore: score,
        }).success,
      ).toBe(false);
    },
  );

  it("rejects a non-integer numeric value", () => {
    expect(
      savePredictionInputSchema.safeParse({
        ...basePredictionInput,
        predictedHomeScore: 1.5,
      }).success,
    ).toBe(false);
  });
});

describe("database-time lock and prediction view state", () => {
  const kickoffAt = "2026-08-22T16:00:00.000Z";

  it("keeps the exact boundary locked", () => {
    expect(isKickoffLocked(kickoffAt, "2026-08-22T15:59:59.999Z")).toBe(false);
    expect(isKickoffLocked(kickoffAt, kickoffAt)).toBe(true);
    expect(isKickoffLocked(kickoffAt, "2026-08-22T16:00:00.001Z")).toBe(true);
    expect(getCountdownSeconds(kickoffAt, "2026-08-22T15:59:59.999Z")).toBe(1);
    expect(getCountdownSeconds(kickoffAt, kickoffAt)).toBe(0);
  });

  it.each(["draft", "open", "active"] as const)(
    "allows an active member before kickoff while the league is %s",
    (leagueStatus) => {
      expect(
        canWritePrediction({
          leagueStatus,
          status: "scheduled",
          kickoffAt,
          now: "2026-08-22T15:59:59.999Z",
          isActiveMember: true,
        }),
      ).toBe(true);
    },
  );

  it.each(["scheduled", "postponed"] as const)(
    "allows an active member before kickoff when match status is %s",
    (status) => {
      expect(
        canWritePrediction({
          leagueStatus: "active",
          status,
          kickoffAt,
          now: "2026-08-22T15:59:59.999Z",
          isActiveMember: true,
        }),
      ).toBe(true);
    },
  );

  it.each(["completed", "archived"] as const)(
    "keeps a %s league read-only even before kickoff",
    (leagueStatus) => {
      expect(
        canWritePrediction({
          leagueStatus,
          status: "scheduled",
          kickoffAt,
          now: "2026-08-22T15:00:00.000Z",
          isActiveMember: true,
        }),
      ).toBe(false);
    },
  );

  it.each(["live", "finished", "canceled"] as const)(
    "never opens a future-dated %s match for writing",
    (status) => {
      expect(
        canWritePrediction({
          leagueStatus: "active",
          status,
          kickoffAt,
          now: "2026-08-22T15:00:00.000Z",
          isActiveMember: true,
        }),
      ).toBe(false);
    },
  );

  it("derives open, editable, locked, and unavailable states", () => {
    const base = {
      leagueStatus: "active" as const,
      status: "scheduled" as const,
      kickoffAt,
      isActiveMember: true,
    };
    expect(
      derivePredictionDisplayState({
        ...base,
        now: "2026-08-22T15:00:00.000Z",
        hasPrediction: false,
      }),
    ).toBe("open");
    expect(
      derivePredictionDisplayState({
        ...base,
        now: "2026-08-22T15:00:00.000Z",
        hasPrediction: true,
      }),
    ).toBe("editable");
    expect(
      derivePredictionDisplayState({ ...base, now: kickoffAt, hasPrediction: true }),
    ).toBe("locked");
    expect(
      derivePredictionDisplayState({
        ...base,
        status: "canceled",
        now: "2026-08-22T15:00:00.000Z",
        hasPrediction: false,
      }),
    ).toBe("unavailable");
  });
});

describe("match and timestamp presentation", () => {
  it("maps all five statuses and prediction labels to Hebrew", () => {
    expect([
      getMatchStatusLabel("scheduled"),
      getMatchStatusLabel("live"),
      getMatchStatusLabel("finished"),
      getMatchStatusLabel("postponed"),
      getMatchStatusLabel("canceled"),
    ]).toEqual(["מתוכנן", "בשידור חי", "הסתיים", "נדחה", "בוטל"]);
    expect(getPredictionStateLabel("saved")).toBe("הניחוש נשמר");
    expect(getPredictionStateLabel("editable")).toContain("פתוח לעריכה");
  });

  it("shows a durable review label only for AET and PEN", () => {
    expect(getProviderReviewLabel("AET")).toBe("דורש בדיקה");
    expect(getProviderReviewLabel("PEN")).toBe("דורש בדיקה");
    expect(getProviderReviewLabel("FT")).toBeNull();
    expect(getProviderReviewLabel(null)).toBeNull();
  });

  it("formats one UTC instant deterministically in two timezones", () => {
    const instant = "2026-08-22T16:00:00.000Z";
    expect(formatDateTimeInTimeZone(instant, "UTC", "en-GB")).toContain("16:00");
    expect(
      formatDateTimeInTimeZone(instant, "Asia/Jerusalem", "en-GB"),
    ).toContain("19:00");
  });

  it("builds DST-aware UTC boundaries for a Jerusalem calendar date", () => {
    expect(getUtcDateRange("2026-08-22", "Asia/Jerusalem")).toEqual({
      start: "2026-08-21T21:00:00.000Z",
      end: "2026-08-22T21:00:00.000Z",
    });
    expect(getUtcDateRange("2027-01-10", "Asia/Jerusalem")).toEqual({
      start: "2027-01-09T22:00:00.000Z",
      end: "2027-01-10T22:00:00.000Z",
    });
  });

  it("formats countdown states without relying on a browser clock", () => {
    expect(formatRemainingDuration(90)).toBe("נותרו דקה אחת ו־30 שניות");
    expect(formatRemainingDuration(3_661)).toBe("נותרו שעה אחת ו־דקה אחת");
    expect(formatRemainingDuration(90_000)).toBe("נותרו יום אחד ו־שעה אחת");
    expect(formatRemainingDuration(86_400)).toBe("נותר יום אחד");
    expect(formatRemainingDuration(3_600)).toBe("נותרה שעה אחת");
    expect(formatRemainingDuration(60)).toBe("נותרה דקה אחת");
    expect(formatRemainingDuration(1)).toBe("נותרה שנייה אחת");
    expect(formatRemainingDuration(0)).toBe("הניחוש נעול");
  });

  it("keeps screen-reader countdown announcements bounded", () => {
    expect(getLockCountdownAnnouncement(0)).toBe("הניחוש נעול");
    expect(getLockCountdownAnnouncement(30)).toBe(
      "נותרה פחות מדקה עד לנעילת הניחוש",
    );
    expect(getLockCountdownAnnouncement(120)).toBe(
      "נותרו 2 דקות עד לנעילת הניחוש",
    );

    const distantAnnouncement = getLockCountdownAnnouncement(
      172_800,
      "2026-08-26T16:00:00.000Z",
      "UTC",
    );
    expect(distantAnnouncement).toContain("הניחוש פתוח עד");
    expect(distantAnnouncement).not.toContain("2880 דקות");
    expect(getLockCountdownAnnouncement(172_800)).toBe(
      "הניחוש פתוח. נותרו 2 ימים",
    );
  });
});

describe("match-list URL filters and safe errors", () => {
  it("accepts one round or one calendar date", () => {
    expect(parseMatchListFilter({ round: "2" })).toEqual({
      success: true,
      data: { kind: "round", round: 2 },
    });
    expect(parseMatchListFilter({ date: "2026-08-22" })).toEqual({
      success: true,
      data: { kind: "date", date: "2026-08-22" },
    });
  });

  it.each([
    { round: "0" },
    { round: "1.5" },
    { date: "2026-02-30" },
    { round: "1", date: "2026-08-22" },
    { round: ["1", "2"] },
  ])("rejects an ambiguous or malformed filter: %j", (value) => {
    expect(parseMatchListFilter(value).success).toBe(false);
  });

  it("maps a stale-tab lock error without exposing provider details", () => {
    expect(
      getSafePredictionsErrorMessage({
        code: "P0001",
        message: "PREDICTION_LOCKED",
        details: "private row contents",
      }),
    ).toBe("המשחק כבר ננעל ולא ניתן לשמור או לערוך את הניחוש.");
    expect(
      getSafePredictionsErrorMessage({ message: "private SQL stack" }),
    ).not.toContain("private SQL stack");
  });
});
