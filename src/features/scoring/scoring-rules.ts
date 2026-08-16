export type FootballScore = {
  homeScore: number;
  awayScore: number;
};

export type ScoringRules = {
  exactPoints: number;
  correctOutcomePoints: number;
  incorrectPoints: number;
};

export type MatchOutcome = "HOME" | "DRAW" | "AWAY";

export function classifyOutcome(score: FootballScore): MatchOutcome {
  if (score.homeScore > score.awayScore) return "HOME";
  if (score.homeScore < score.awayScore) return "AWAY";
  return "DRAW";
}

export function scorePrediction(
  prediction: FootballScore,
  result: FootballScore,
  rules: ScoringRules,
) {
  const isExact =
    prediction.homeScore === result.homeScore &&
    prediction.awayScore === result.awayScore;
  const isCorrectOutcome =
    classifyOutcome(prediction) === classifyOutcome(result);

  return {
    points: isExact
      ? rules.exactPoints
      : isCorrectOutcome
        ? rules.correctOutcomePoints
        : rules.incorrectPoints,
    isExact,
    isCorrectOutcome,
  };
}
