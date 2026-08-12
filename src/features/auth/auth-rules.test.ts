import { describe, expect, it } from "vitest";

import { getSafeAuthErrorMessage } from "@/features/auth/errors";
import {
  getSafeAuthOrigin,
  getSafeAuthRedirect,
} from "@/features/auth/redirects";
import {
  displayNameSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  updatePasswordSchema,
} from "@/features/auth/schemas";

describe("Slice 1 authentication validation", () => {
  it("normalizes a valid email address", () => {
    expect(
      loginSchema.parse({
        email: "  USER@Example.COM ",
        password: "password123",
      }).email,
    ).toBe("user@example.com");
  });

  it("rejects malformed email addresses", () => {
    expect(
      forgotPasswordSchema.safeParse({ email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("requires at least eight password characters", () => {
    expect(
      loginSchema.safeParse({ email: "user@example.com", password: "short" })
        .success,
    ).toBe(false);
  });

  it("rejects mismatched registration password confirmation", () => {
    const result = registerSchema.safeParse({
      displayName: "משתמש",
      email: "user@example.com",
      password: "password123",
      passwordConfirmation: "password456",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.passwordConfirmation).toEqual([
        "אימות הסיסמה אינו תואם לסיסמה.",
      ]);
    }
  });

  it("rejects mismatched password-reset confirmation", () => {
    expect(
      updatePasswordSchema.safeParse({
        password: "password123",
        passwordConfirmation: "password456",
      }).success,
    ).toBe(false);
  });
});

describe("display-name validation", () => {
  it("trims a valid display name", () => {
    expect(displayNameSchema.parse("  טל כהן  ")).toBe("טל כהן");
  });

  it.each(["", " ", "א"])("rejects a value shorter than two: %j", (name) => {
    expect(displayNameSchema.safeParse(name).success).toBe(false);
  });

  it("accepts exactly fifty characters", () => {
    expect(displayNameSchema.safeParse("א".repeat(50)).success).toBe(true);
  });

  it("rejects more than fifty characters", () => {
    expect(displayNameSchema.safeParse("א".repeat(51)).success).toBe(false);
  });
});

describe("safe authentication redirects", () => {
  it.each(["/dashboard", "/profile", "/update-password"])(
    "accepts the approved internal path %s",
    (path) => {
      expect(getSafeAuthRedirect(path)).toBe(path);
    },
  );

  it.each([
    "https://attacker.example/path",
    "//attacker.example/path",
    "javascript:alert(1)",
    "data:text/html,malicious",
    "%2f%2fattacker.example/path",
    "/%2f%2fattacker.example/path",
    "%09//attacker.example/path",
    "\u0000/dashboard",
    "/\\attacker.example/path",
    "\\attacker.example/path",
    "dashboard",
    "/dashboard?next=https://attacker.example",
    "/unknown",
    "",
    null,
    undefined,
    42,
  ])("blocks an external or malformed redirect: %j", (value) => {
    expect(getSafeAuthRedirect(value)).toBe("/dashboard");
  });

  it("uses the caller's safe fallback", () => {
    expect(getSafeAuthRedirect("https://attacker.example", "/login")).toBe(
      "/login",
    );
  });

  it("accepts only an exact allowlisted callback origin", () => {
    const allowedOrigins = [
      "https://predictor-swart.vercel.app",
      "https://predictor-preview.vercel.app",
    ];

    expect(
      getSafeAuthOrigin(
        "https://predictor-preview.vercel.app/path?ignored=true",
        allowedOrigins,
        allowedOrigins[0],
      ),
    ).toBe("https://predictor-preview.vercel.app");
  });

  it.each([
    "https://attacker.example",
    "predictor-preview.vercel.app.attacker.example",
    "javascript:alert(1)",
    "https:\\attacker.example",
    null,
  ])("falls back for an untrusted callback origin: %j", (candidate) => {
    expect(
      getSafeAuthOrigin(
        candidate,
        ["https://predictor-preview.vercel.app"],
        "https://predictor-swart.vercel.app",
      ),
    ).toBe("https://predictor-swart.vercel.app");
  });
});

describe("safe authentication errors", () => {
  it.each([
    ["invalid_credentials", "כתובת האימייל או הסיסמה שגויות."],
    ["email_not_confirmed", "יש לאשר את כתובת האימייל לפני ההתחברות."],
    ["weak_password", "הסיסמה אינה עומדת בדרישות האבטחה."],
    ["otp_expired", "הקישור אינו תקף או שפג תוקפו. יש לבקש קישור חדש."],
  ])("maps %s to a safe Hebrew message", (code, message) => {
    expect(getSafeAuthErrorMessage({ code, message: "sensitive" }, "login")).toBe(
      message,
    );
  });

  it("does not expose an unknown provider error", () => {
    const providerMessage = "database error containing private details";
    const message = getSafeAuthErrorMessage(
      { code: "unexpected", message: providerMessage },
      "register",
    );

    expect(message).not.toContain(providerMessage);
    expect(message).toBe(
      "לא ניתן להשלים את ההרשמה כרגע. יש לבדוק את הפרטים ולנסות שוב.",
    );
  });
});
