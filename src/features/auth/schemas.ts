import { z } from "zod";

import { containsDangerousBidiControl } from "@/lib/untrusted-text";

export const PASSWORD_MAX_UTF8_BYTES = 72;

const utf8ByteLength = (value: string) => new TextEncoder().encode(value).byteLength;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("יש להזין כתובת אימייל תקינה.");

const passwordSchema = z
  .string()
  .min(8, "הסיסמה חייבת לכלול לפחות 8 תווים.")
  .refine(
    (value) => utf8ByteLength(value) <= PASSWORD_MAX_UTF8_BYTES,
    "הסיסמה ארוכה מדי; אפשר להזין עד 72 בתים בקידוד UTF-8.",
  );

export const displayNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(2, "שם התצוגה חייב לכלול לפחות 2 תווים.")
      .max(50, "שם התצוגה יכול לכלול עד 50 תווים."),
  )
  .refine(
    (value) => !containsDangerousBidiControl(value),
    "שם התצוגה מכיל תווי כיווניות בלתי־נראים שאינם מותרים.",
  );

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const registerSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    password: passwordSchema,
    passwordConfirmation: passwordSchema,
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "אימות הסיסמה אינו תואם לסיסמה.",
  });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    passwordConfirmation: passwordSchema,
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "אימות הסיסמה אינו תואם לסיסמה.",
  });

export const updateProfileSchema = z.object({
  displayName: displayNameSchema,
});

export type AuthFieldErrors = Record<string, string[] | undefined>;

export function getFieldErrors(error: z.ZodError): AuthFieldErrors {
  return error.flatten().fieldErrors;
}
