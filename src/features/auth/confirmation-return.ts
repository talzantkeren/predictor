import { getSafeAuthRedirect } from "@/features/auth/redirects";

export const AUTH_CONFIRM_RETURN_COOKIE = "predictor_auth_return";
export const AUTH_CONFIRM_RETURN_MAX_AGE_SECONDS = 30 * 60;

export function getAuthConfirmReturnCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: "/auth/confirm",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function getRegistrationConfirmationUrl(origin: string) {
  return new URL("/auth/confirm", origin).toString();
}

export function getConfirmationReturnPath({
  cookieNext,
  queryNext,
}: {
  cookieNext: unknown;
  queryNext: unknown;
}) {
  return queryNext === null || queryNext === undefined
    ? getSafeAuthRedirect(cookieNext)
    : getSafeAuthRedirect(queryNext);
}
