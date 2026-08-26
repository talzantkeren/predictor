import { describe, expect, it } from "vitest";

import {
  getAuthCallbackFailureStatus,
  getLoginStatusPresentation,
  getRecoveryRequestPresentation,
  getRecoveryRequestResult,
  getRecoveryStatusPresentation,
  type AuthCallbackFlow,
  type AuthCallbackStatus,
} from "@/features/auth/auth-flow-results";

describe("typed password-recovery request results", () => {
  it("returns the same account-neutral result and public copy for success and an unknown address", () => {
    const success = getRecoveryRequestResult(null);
    const unknownAddress = getRecoveryRequestResult({
      code: "user_not_found",
      message: "sensitive provider detail",
    });

    expect(unknownAddress).toEqual(success);
    expect(success).toEqual({ outcome: "RECOVERY_ACCEPTED" });
    expect(getRecoveryRequestPresentation(success.outcome)).toEqual({
      kind: "success",
      message:
        "אם קיים חשבון התואם לכתובת, נשלח אליו קישור לשחזור הסיסמה.",
    });
  });

  it.each([
    [{ code: "over_email_send_rate_limit" }],
    [{ code: "over_request_rate_limit" }],
    [{ status: 429 }],
  ])("maps a cooldown response to a stable actionable result", (error) => {
    const result = getRecoveryRequestResult(error);

    expect(result).toEqual({ outcome: "RECOVERY_RATE_LIMITED" });
    expect(getRecoveryRequestPresentation(result.outcome)?.kind).toBe("error");
  });

  it.each([
    { code: "request_timeout", message: "private timeout detail" },
    { status: 503, message: "private upstream detail" },
    { code: "unknown_provider_failure", message: "private provider detail" },
  ])("maps provider failure to retry-later without exposing details", (error) => {
    const result = getRecoveryRequestResult(error);
    const presentation = getRecoveryRequestPresentation(result.outcome);

    expect(result).toEqual({ outcome: "RECOVERY_PROVIDER_UNAVAILABLE" });
    expect(presentation?.kind).toBe("error");
    expect(presentation?.message).not.toContain(error.message);
  });
});

describe("typed authentication callback results", () => {
  it.each<{
    flow: AuthCallbackFlow;
    error: unknown;
    consumed: boolean;
    expected: AuthCallbackStatus;
  }>([
    {
      flow: "recovery",
      error: { code: "missing_callback_code" },
      consumed: false,
      expected: "recovery-link-invalid",
    },
    {
      flow: "recovery",
      error: { code: "otp_expired" },
      consumed: false,
      expected: "recovery-link-expired",
    },
    {
      flow: "recovery",
      error: { code: "pkce_code_verifier_not_found" },
      consumed: false,
      expected: "recovery-session-mismatch",
    },
    {
      flow: "recovery",
      error: { code: "pkce_code_verifier_not_found" },
      consumed: true,
      expected: "recovery-link-reused",
    },
    {
      flow: "confirmation",
      error: { details: { code: "flow_state_not_found" } },
      consumed: false,
      expected: "confirmation-link-invalid",
    },
    {
      flow: "confirmation",
      error: { name: "AuthPKCECodeVerifierMissingError" },
      consumed: false,
      expected: "confirmation-session-mismatch",
    },
    {
      flow: "confirmation",
      error: { status: 503, message: "private outage detail" },
      consumed: false,
      expected: "confirmation-provider-unavailable",
    },
  ])("maps $expected without provider copy", ({
    flow,
    error,
    consumed,
    expected,
  }) => {
    expect(getAuthCallbackFailureStatus({ flow, error, consumed })).toBe(
      expected,
    );
  });

  it("allowlists query-string presentations and marks failures as alerts", () => {
    expect(
      getRecoveryStatusPresentation("recovery-link-reused"),
    ).toMatchObject({ kind: "error" });
    expect(
      getLoginStatusPresentation("confirmation-session-mismatch"),
    ).toMatchObject({ kind: "error" });
    expect(getLoginStatusPresentation("password-updated")).toMatchObject({
      kind: "success",
    });
    expect(getRecoveryStatusPresentation("provider-secret-detail")).toBeUndefined();
    expect(getLoginStatusPresentation("https://attacker.example")).toBeUndefined();
  });
});
