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

const safeLeagueSettingsErrors: Record<string, string> = {
  UNAUTHENTICATED: "פג תוקף ההתחברות. יש להתחבר מחדש.",
  INVALID_LEAGUE_SETTINGS: "פרטי הליגה אינם תקינים. יש לבדוק את השדות ולנסות שוב.",
  INVALID_SCORING_RULES: "חוקי הניקוד אינם תקינים.",
  INVALID_PRIZE_RULES: "חלוקת הפרסים אינה תקינה וחייבת להסתכם ב־100%.",
  SETTINGS_STALE: "ההגדרות השתנו מאז טעינת העמוד. יש לרענן ולנסות שוב.",
  LEAGUE_RULES_LOCKED: "חוקי הניקוד ופרסי ה־Demo כבר נעולים ואינם ניתנים לשינוי.",
  LEAGUE_SETTINGS_LOCKED: "ליגה שהושלמה או הועברה לארכיון היא לקריאה בלבד.",
};

export function getSafeLeagueSettingsErrorMessage(error: unknown) {
  const message = getDatabaseErrorValue(error, "message");

  if (message && safeLeagueSettingsErrors[message]) {
    return safeLeagueSettingsErrors[message];
  }

  // Missing and unauthorized resources deliberately share the same opaque
  // response, and unknown database/provider details never reach the browser.
  if (message === "LEAGUE_SETTINGS_NOT_FOUND") {
    return "לא ניתן לעדכן את הגדרות הליגה.";
  }

  return "לא ניתן לשמור את הגדרות הליגה כרגע. יש לנסות שוב.";
}

const safeLeagueLifecycleErrors: Record<string, string> = {
  UNAUTHENTICATED: "פג תוקף ההתחברות. יש להתחבר מחדש.",
  LEAGUE_NOT_STARTABLE: "אפשר להפעיל רק ליגה פתוחה שטרם הופעלה.",
};

export function getSafeLeagueLifecycleErrorMessage(error: unknown) {
  const message = getDatabaseErrorValue(error, "message");

  if (message && safeLeagueLifecycleErrors[message]) {
    return safeLeagueLifecycleErrors[message];
  }

  // Missing and foreign league IDs deliberately share an opaque response.
  if (message === "LEAGUE_NOT_FOUND") {
    return "לא ניתן להפעיל את הליגה.";
  }

  return "לא ניתן להפעיל את הליגה כרגע. יש לנסות שוב.";
}
