const safeLeagueErrors: Record<string, string> = {
  UNAUTHENTICATED: "פג תוקף ההתחברות. יש להתחבר מחדש.",
  INVALID_SEASON: "העונה שנבחרה אינה זמינה.",
  INVALID_LEAGUE: "פרטי הליגה אינם תקינים. יש לבדוק את השדות ולנסות שוב.",
  INVALID_SCORING_RULES: "חוקי הניקוד אינם תקינים.",
  INVALID_PRIZE_RULES: "חלוקת הפרסים אינה תקינה וחייבת להסתכם ב־100%.",
  SCORING_RULES_LOCKED: "חוקי הניקוד כבר נעולים ואינם ניתנים לשינוי.",
};

function getDatabaseErrorValue(error: unknown, key: "code" | "message") {
  if (typeof error !== "object" || error === null || !(key in error)) {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export function getSafeLeagueErrorMessage(error: unknown) {
  const message = getDatabaseErrorValue(error, "message");

  if (message && safeLeagueErrors[message]) {
    return safeLeagueErrors[message];
  }

  if (getDatabaseErrorValue(error, "code") === "23505") {
    return "לא ניתן לשמור את הליגה בגלל התנגשות בנתונים. יש לנסות שוב.";
  }

  return "לא ניתן ליצור את הליגה כרגע. יש לנסות שוב.";
}
