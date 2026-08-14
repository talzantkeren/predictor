const safeMembershipErrors: Record<string, string> = {
  UNAUTHENTICATED: "פג תוקף ההתחברות. יש להתחבר מחדש.",
  FORBIDDEN: "אין הרשאה לבצע את הפעולה.",
  INVALID_LEAGUE: "הליגה המבוקשת אינה זמינה.",
  INVALID_INVITE: "קישור ההזמנה אינו זמין.",
  INVITE_UNAVAILABLE: "קישור ההזמנה אינו זמין.",
  INVITE_NOT_ALLOWED: "הליגה אינה מקבלת בקשות הצטרפות חדשות.",
  JOIN_CLOSED: "הליגה אינה מקבלת בקשות הצטרפות חדשות.",
  JOIN_REQUEST_STATE_CONFLICT: "מצב בקשת ההצטרפות השתנה. יש לרענן ולנסות שוב.",
  STATE_CONFLICT: "המידע השתנה. יש לרענן ולנסות שוב.",
};

function getErrorValue(error: unknown, key: "code" | "message") {
  if (typeof error !== "object" || error === null || !(key in error)) {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export function getSafeMembershipErrorMessage(error: unknown) {
  const message = getErrorValue(error, "message");

  if (message && safeMembershipErrors[message]) {
    return safeMembershipErrors[message];
  }

  if (getErrorValue(error, "code") === "23505") {
    return "הבקשה כבר נשמרה. יש לרענן כדי לראות את המצב העדכני.";
  }

  return "לא ניתן להשלים את הפעולה כרגע. יש לנסות שוב.";
}
