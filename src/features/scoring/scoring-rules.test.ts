import { describe, expect, it } from "vitest";

import {
  classifyOutcome,
  scorePrediction,
} from "@/features/scoring/__tests__/scoring-specification";

describe("football outcome classification", () => {
  it.each([
    [{ homeScore: 2, awayScore: 1 }, "HOME"],
    [{ homeScore: 0, awayScore: 0 }, "DRAW"],
    [{ homeScore: 1, awayScore: 3 }, "AWAY"],
  ] as const)("classifies %o as %s", (score, expected) => {
    expect(classifyOutcome(score)).toBe(expected);
  });
});

describe("prediction scoring", () => {
  const defaultRules = {
    exactPoints: 3,
    correctOutcomePoints: 1,
    incorrectPoints: 0,
  };

  it.each([
    [
      "exact home score",
      { homeScore: 2, awayScore: 1 },
      { homeScore: 2, awayScore: 1 },
      { points: 3, isExact: true, isCorrectOutcome: true },
    ],
    [
      "non-exact home outcome",
      { homeScore: 3, awayScore: 0 },
      { homeScore: 2, awayScore: 1 },
      { points: 1, isExact: false, isCorrectOutcome: true },
    ],
    [
      "non-exact away outcome",
      { homeScore: 0, awayScore: 2 },
      { homeScore: 1, awayScore: 3 },
      { points: 1, isExact: false, isCorrectOutcome: true },
    ],
    [
      "non-exact draw outcome",
      { homeScore: 0, awayScore: 0 },
      { homeScore: 2, awayScore: 2 },
      { points: 1, isExact: false, isCorrectOutcome: true },
    ],
    [
      "wrong outcome",
      { homeScore: 0, awayScore: 1 },
      { homeScore: 2, awayScore: 1 },
      { points: 0, isExact: false, isCorrectOutcome: false },
    ],
  ] as const)("scores a %s", (_label, prediction, result, expected) => {
    expect(scorePrediction(prediction, result, defaultRules)).toEqual(expected);
  });

  it("uses each league's rule values for the same prediction and result", () => {
    const prediction = { homeScore: 2, awayScore: 1 };
    const result = { homeScore: 2, awayScore: 1 };

    expect(scorePrediction(prediction, result, defaultRules).points).toBe(3);
    expect(
      scorePrediction(prediction, result, {
        exactPoints: 7,
        correctOutcomePoints: 2,
        incorrectPoints: 1,
      }).points,
    ).toBe(7);
  });
});
