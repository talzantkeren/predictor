const safeScoringErrors: Record<string, string> = {
  FORBIDDEN: "אין הרשאה להזין או לתקן תוצאות משחקים.",
  MATCH_NOT_FOUND: "המשחק המבוקש אינו זמין.",
  SCORING_RULES_MISSING: "לא ניתן לחשב ניקוד למשחק במצב הנתונים הנוכחי.",
  VALIDATION_ERROR: "פרטי התוצאה אינם תקינים.",
};

function getErrorValue(error: unknown, key: "code" | "message") {
  if (typeof error !== "object" || error === null || !(key in error)) {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export function getSafeScoringErrorMessage(error: unknown) {
  const message = getErrorValue(error, "message");
  if (message && safeScoringErrors[message]) {
    return safeScoringErrors[message];
  }

  const code = getErrorValue(error, "code");
  if (code === "22P02" || code === "22003" || code === "23514") {
    return safeScoringErrors.VALIDATION_ERROR;
  }

  return "לא ניתן לשמור את התוצאה כרגע. יש לנסות שוב.";
}
