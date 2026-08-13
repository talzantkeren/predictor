export type AuthOperation =
  | "login"
  | "register"
  | "password-update"
  | "confirmation";

function getErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  return typeof error.code === "string" ? error.code : undefined;
}

export function getSafeAuthErrorMessage(
  error: unknown,
  operation: AuthOperation,
) {
  const code = getErrorCode(error);

  if (code === "invalid_credentials") {
    return "כתובת האימייל או הסיסמה שגויות.";
  }

  if (code === "email_not_confirmed") {
    return "יש לאשר את כתובת האימייל לפני ההתחברות.";
  }

  if (code === "weak_password") {
    return "הסיסמה אינה עומדת בדרישות האבטחה.";
  }

  if (code === "same_password") {
    return "יש לבחור סיסמה שונה מהסיסמה הנוכחית.";
  }

  if (code === "over_email_send_rate_limit") {
    return "נשלחו יותר מדי הודעות. יש לנסות שוב בעוד כמה דקות.";
  }

  if (code === "otp_expired" || code === "session_not_found") {
    return "הקישור אינו תקף או שפג תוקפו. יש לבקש קישור חדש.";
  }

  if (operation === "login") {
    return "לא ניתן להתחבר כרגע. יש לנסות שוב.";
  }

  if (operation === "register") {
    return "לא ניתן להשלים את ההרשמה כרגע. יש לבדוק את הפרטים ולנסות שוב.";
  }

  if (operation === "password-update") {
    return "לא ניתן לעדכן את הסיסמה. ייתכן שהקישור פג תוקף.";
  }

  return "לא ניתן לאשר את הקישור. יש לבקש קישור חדש.";
}
