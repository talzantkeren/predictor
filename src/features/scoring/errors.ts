const safeScoringErrors: Record<string, string> = {
  FORBIDDEN: "אין הרשאה להזין או לתקן תוצאות משחקים.",
  COMPLETED_RECONCILIATION_REQUIRED:
    "אי אפשר לשנות משחק בעונה של ליגה שהושלמה לפני שמתקיים תהליך בדיקה ויישוב.",
  MANUAL_MATCH_CONFLICT:
    "מזהה המשחק כבר שייך למשחק אחר. יש לרענן ולנסות שוב.",
  MATCH_IDENTITY_LOCKED:
    "אי אפשר לשנות את העונה או הקבוצות לאחר שנשמרו ניחושים או שהמשחק ננעל.",
  MATCH_NOT_FOUND: "המשחק המבוקש אינו זמין.",
  MATCH_NOT_STARTED: "אפשר להזין תוצאת סיום רק לאחר מועד פתיחת המשחק.",
  MATCH_PROVIDER_OWNERSHIP_REQUIRED:
    "אפשר להחזיר בעלות לספק רק במשחק שמחובר לזהות API-Football תקינה.",
  SCORING_RULES_MISSING: "לא ניתן לחשב ניקוד למשחק במצב הנתונים הנוכחי.",
  STATE_CONFLICT: "מצב המשחק השתנה. יש לרענן ולנסות שוב.",
  UNSAFE_STATUS_REGRESSION:
    "השינוי עלול לפתוח מחדש משחק שכבר ננעל או להשתמש במועד שאינו בטוח.",
  VALIDATION_ERROR: "פרטי התוצאה אינם תקינים.",
};

const safeManualOverrideClearErrors: Record<string, string> = {
  COMPLETED_RECONCILIATION_REQUIRED:
    "אי אפשר להחזיר בעלות לספק בעונה של ליגה שהושלמה לפני שמתקיים תהליך בדיקה ויישוב.",
  FORBIDDEN: "אין הרשאה להחזיר את ניהול המשחק לספק.",
  MATCH_NOT_FOUND: "המשחק המבוקש אינו זמין.",
  MATCH_PROVIDER_OWNERSHIP_REQUIRED:
    "אפשר להחזיר בעלות לספק רק במשחק שמחובר לזהות API-Football תקינה.",
  STATE_CONFLICT: "מצב המשחק השתנה. יש לרענן ולנסות שוב.",
  VALIDATION_ERROR: "בקשת החזרת הבעלות אינה תקינה.",
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

export function getSafeManualOverrideClearErrorMessage(error: unknown) {
  const message = getErrorValue(error, "message");
  if (message && safeManualOverrideClearErrors[message]) {
    return safeManualOverrideClearErrors[message];
  }

  const code = getErrorValue(error, "code");
  if (code === "22P02" || code === "22003" || code === "23514") {
    return safeManualOverrideClearErrors.VALIDATION_ERROR;
  }

  return "לא ניתן להחזיר את ניהול המשחק לספק כרגע. יש לנסות שוב.";
}
