const safePredictionErrors: Record<string, string> = {
  UNAUTHENTICATED: "פג תוקף ההתחברות. יש להתחבר מחדש.",
  FORBIDDEN: "המשחק המבוקש אינו זמין בליגה הזו.",
  PREDICTION_LOCKED: "המשחק כבר ננעל ולא ניתן לשמור או לערוך את הניחוש.",
  STATE_CONFLICT: "המידע השתנה. יש לרענן ולנסות שוב.",
  VALIDATION_ERROR: "יש להזין תוצאה שלמה בין 0 ל־30 לכל קבוצה.",
};

function getErrorValue(error: unknown, key: "code" | "message") {
  if (typeof error !== "object" || error === null || !(key in error)) {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export function getSafePredictionsErrorMessage(error: unknown) {
  const message = getErrorValue(error, "message");
  if (message && safePredictionErrors[message]) {
    return safePredictionErrors[message];
  }

  const code = getErrorValue(error, "code");
  if (code === "22P02" || code === "22003" || code === "23514") {
    return safePredictionErrors.VALIDATION_ERROR;
  }
  if (code === "23505") {
    return "הניחוש כבר נשמר. יש לרענן כדי לראות את המצב העדכני.";
  }

  return "לא ניתן לשמור את הניחוש כרגע. יש לנסות שוב.";
}
