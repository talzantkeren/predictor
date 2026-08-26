export type AuthMessageKind = "success" | "error" | "info";

export type AuthFlowPresentation = {
  kind: AuthMessageKind;
  message: string;
};

type AuthFieldErrors = Record<string, string[] | undefined>;

export type RecoveryRequestState =
  | { outcome: "IDLE" }
  | { outcome: "VALIDATION_ERROR"; fieldErrors: AuthFieldErrors }
  | { outcome: "RECOVERY_ACCEPTED" }
  | { outcome: "RECOVERY_RATE_LIMITED" }
  | { outcome: "RECOVERY_PROVIDER_UNAVAILABLE" };

export type AuthCallbackFlow = "confirmation" | "recovery";

export type AuthCallbackStatus =
  | "confirmation-completed"
  | "confirmation-link-invalid"
  | "confirmation-link-expired"
  | "confirmation-link-reused"
  | "confirmation-session-mismatch"
  | "confirmation-provider-unavailable"
  | "recovery-link-invalid"
  | "recovery-link-expired"
  | "recovery-link-reused"
  | "recovery-session-mismatch"
  | "recovery-provider-unavailable";

const RECOVERY_REQUEST_PRESENTATIONS: Record<
  Exclude<RecoveryRequestState["outcome"], "IDLE">,
  AuthFlowPresentation
> = {
  VALIDATION_ERROR: {
    kind: "error",
    message: "יש לתקן את השדות המסומנים.",
  },
  RECOVERY_ACCEPTED: {
    kind: "success",
    message:
      "אם קיים חשבון התואם לכתובת, נשלח אליו קישור לשחזור הסיסמה.",
  },
  RECOVERY_RATE_LIMITED: {
    kind: "error",
    message:
      "נשלחו יותר מדי בקשות לשחזור. יש להמתין כמה דקות ולנסות שוב.",
  },
  RECOVERY_PROVIDER_UNAVAILABLE: {
    kind: "error",
    message: "שירות שחזור הסיסמה אינו זמין כרגע. יש לנסות שוב מאוחר יותר.",
  },
};

const LOGIN_STATUS_PRESENTATIONS: Record<string, AuthFlowPresentation> = {
  "signed-out": {
    kind: "success",
    message: "התנתקת בהצלחה.",
  },
  "password-updated": {
    kind: "success",
    message: "הסיסמה עודכנה בהצלחה. אפשר להתחבר עם הסיסמה החדשה.",
  },
  "confirmation-completed": {
    kind: "success",
    message:
      "כתובת האימייל אושרה והחיבור הושלם. אפשר להמשיך לחשבון האישי.",
  },
  "confirmation-link-invalid": {
    kind: "error",
    message: "קישור האישור אינו תקין. יש להירשם מחדש או לבקש הודעה חדשה.",
  },
  "confirmation-link-expired": {
    kind: "error",
    message: "תוקף קישור האישור פג. יש להירשם מחדש או לבקש הודעה חדשה.",
  },
  "confirmation-link-reused": {
    kind: "error",
    message: "קישור האישור כבר שימש. אפשר לנסות להתחבר עם הסיסמה שנבחרה.",
  },
  "confirmation-session-mismatch": {
    kind: "error",
    message:
      "לא ניתן להשלים חיבור אוטומטי בדפדפן הזה. ייתכן שהכתובת כבר אושרה; יש לנסות להתחבר עם הסיסמה שנבחרה.",
  },
  "confirmation-provider-unavailable": {
    kind: "error",
    message: "לא ניתן לבדוק את קישור האישור כרגע. יש לנסות שוב מאוחר יותר.",
  },
};

const RECOVERY_STATUS_PRESENTATIONS: Record<string, AuthFlowPresentation> = {
  "recovery-link-invalid": {
    kind: "error",
    message: "קישור השחזור אינו תקין. יש לבקש קישור חדש.",
  },
  "recovery-link-expired": {
    kind: "error",
    message: "תוקף קישור השחזור פג. יש לבקש קישור חדש.",
  },
  "recovery-link-reused": {
    kind: "error",
    message: "קישור השחזור כבר שימש ולא ניתן להשתמש בו שוב. יש לבקש קישור חדש.",
  },
  "recovery-session-mismatch": {
    kind: "error",
    message:
      "לא ניתן להשלים את השחזור בדפדפן הזה. יש לבקש כאן קישור חדש ולפתוח אותו באותו דפדפן.",
  },
  "recovery-provider-unavailable": {
    kind: "error",
    message: "לא ניתן לבדוק את קישור השחזור כרגע. יש לנסות שוב מאוחר יותר.",
  },
};

const RATE_LIMIT_CODES = new Set([
  "over_email_send_rate_limit",
  "over_request_rate_limit",
]);

const ACCOUNT_NEUTRAL_NOT_FOUND_CODES = new Set([
  "identity_not_found",
  "user_not_found",
]);

const EXPIRED_CALLBACK_CODES = new Set([
  "flow_state_expired",
  "otp_expired",
  "session_expired",
]);

const SESSION_MISMATCH_CODES = new Set([
  "bad_code_verifier",
  "pkce_code_verifier_not_found",
]);

const INVALID_CALLBACK_CODES = new Set([
  "flow_state_not_found",
  "invalid_credentials",
  "missing_callback_code",
  "validation_failed",
]);

function getStringProperty(value: unknown, property: string) {
  if (typeof value !== "object" || value === null || !(property in value)) {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>)[property];
  return typeof candidate === "string" ? candidate : undefined;
}

function getNumberProperty(value: unknown, property: string) {
  if (typeof value !== "object" || value === null || !(property in value)) {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>)[property];
  return typeof candidate === "number" ? candidate : undefined;
}

function getAuthErrorCode(error: unknown) {
  const directCode = getStringProperty(error, "code");

  if (directCode) {
    return directCode;
  }

  if (typeof error !== "object" || error === null || !("details" in error)) {
    return undefined;
  }

  return getStringProperty(error.details, "code");
}

export function getRecoveryRequestResult(
  error: unknown,
): RecoveryRequestState {
  if (!error) {
    return { outcome: "RECOVERY_ACCEPTED" };
  }

  const code = getAuthErrorCode(error);
  const status = getNumberProperty(error, "status");

  if (status === 429 || (code && RATE_LIMIT_CODES.has(code))) {
    return { outcome: "RECOVERY_RATE_LIMITED" };
  }

  if (code && ACCOUNT_NEUTRAL_NOT_FOUND_CODES.has(code)) {
    return { outcome: "RECOVERY_ACCEPTED" };
  }

  return { outcome: "RECOVERY_PROVIDER_UNAVAILABLE" };
}

export function getRecoveryRequestPresentation(
  outcome: RecoveryRequestState["outcome"],
) {
  return outcome === "IDLE"
    ? undefined
    : RECOVERY_REQUEST_PRESENTATIONS[outcome];
}

export function getAuthCallbackFailureStatus({
  flow,
  error,
  consumed,
}: {
  flow: AuthCallbackFlow;
  error: unknown;
  consumed: boolean;
}): AuthCallbackStatus {
  const prefix = flow === "recovery" ? "recovery" : "confirmation";

  if (consumed) {
    return `${prefix}-link-reused`;
  }

  const code = getAuthErrorCode(error);
  const name = getStringProperty(error, "name");
  const status = getNumberProperty(error, "status");

  if (code && EXPIRED_CALLBACK_CODES.has(code)) {
    return `${prefix}-link-expired`;
  }

  if (
    (code && SESSION_MISMATCH_CODES.has(code)) ||
    name === "AuthPKCECodeVerifierMissingError"
  ) {
    return `${prefix}-session-mismatch`;
  }

  if (code && INVALID_CALLBACK_CODES.has(code)) {
    return `${prefix}-link-invalid`;
  }

  if (status === 429 || (status !== undefined && status >= 500)) {
    return `${prefix}-provider-unavailable`;
  }

  return `${prefix}-provider-unavailable`;
}

export function getLoginStatusPresentation(status: unknown) {
  return typeof status === "string"
    ? LOGIN_STATUS_PRESENTATIONS[status]
    : undefined;
}

export function getRecoveryStatusPresentation(status: unknown) {
  return typeof status === "string"
    ? RECOVERY_STATUS_PRESENTATIONS[status]
    : undefined;
}
