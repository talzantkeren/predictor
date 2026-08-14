import { type NextRequest, NextResponse } from "next/server";

import {
  AUTH_CONFIRM_RETURN_COOKIE,
  getAuthConfirmReturnCookieOptions,
  getConfirmationReturnPath,
} from "@/features/auth/confirmation-return";
import { createClient } from "@/lib/supabase/server";

function privateRedirect(
  request: NextRequest,
  path: string,
  options?: {
    authHeaders?: Record<string, string>;
    recoverySession?: boolean;
  },
) {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");

  Object.entries(options?.authHeaders ?? {}).forEach(([name, value]) =>
    response.headers.set(name, value),
  );

  response.cookies.set(
    AUTH_CONFIRM_RETURN_COOKIE,
    "",
    getAuthConfirmReturnCookieOptions(0),
  );

  if (options?.recoverySession) {
    response.cookies.set("predictor_recovery", "active", {
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}

function authStatusPath(
  pathname: "/login" | "/forgot-password",
  status: string,
  nextPath?: string,
) {
  const searchParams = new URLSearchParams({ status });

  if (nextPath) {
    searchParams.set("next", nextPath);
  }

  return `${pathname}?${searchParams.toString()}`;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const queryNext = request.nextUrl.searchParams.get("next");
  const recoveryFlow = queryNext === "/update-password";
  const nextPath = recoveryFlow
    ? "/update-password"
    : getConfirmationReturnPath({
        cookieNext: request.cookies.get(AUTH_CONFIRM_RETURN_COOKIE)?.value,
        queryNext,
      });

  const authHeaders: Record<string, string> = {};
  const supabase = await createClient({
    onAuthHeaders(headers) {
      Object.assign(authHeaders, headers);
    },
  });
  let failed = true;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  }

  if (failed) {
    if (code) {
      return privateRedirect(
        request,
        recoveryFlow
          ? authStatusPath(
              "/forgot-password",
              "recovery-browser-mismatch",
            )
          : authStatusPath(
              "/login",
              "confirmation-completed",
              nextPath === "/dashboard" ? undefined : nextPath,
            ),
        { authHeaders },
      );
    }

    return privateRedirect(
      request,
      recoveryFlow
        ? authStatusPath("/forgot-password", "recovery-error")
        : authStatusPath(
            "/login",
            "confirmation-error",
            nextPath === "/dashboard" ? undefined : nextPath,
          ),
      { authHeaders },
    );
  }

  return privateRedirect(request, nextPath, {
    authHeaders,
    recoverySession: recoveryFlow && nextPath === "/update-password",
  });
}
