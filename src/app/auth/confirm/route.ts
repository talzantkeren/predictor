import { createHash } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import {
  getAuthCallbackFailureStatus,
  type AuthCallbackFlow,
  type AuthCallbackStatus,
} from "@/features/auth/auth-flow-results";
import {
  AUTH_CONFIRM_RETURN_COOKIE,
  getAuthConfirmReturnCookieOptions,
  getConfirmationReturnPath,
} from "@/features/auth/confirmation-return";
import { createClient } from "@/lib/supabase/server";

const AUTH_CONSUMED_CALLBACK_COOKIE = "predictor_auth_callback_consumed";
const AUTH_CONSUMED_CALLBACK_MAX_AGE_SECONDS = 10 * 60;

function getConsumedCallbackDigest(flow: AuthCallbackFlow, code: string) {
  const digest = createHash("sha256").update(code).digest("base64url");
  return `${flow}.${digest}`;
}

function privateRedirect(
  request: NextRequest,
  path: string,
  options?: {
    authHeaders?: Record<string, string>;
    consumedCallback?: string;
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

  if (options?.consumedCallback) {
    response.cookies.set(
      AUTH_CONSUMED_CALLBACK_COOKIE,
      options.consumedCallback,
      {
        httpOnly: true,
        maxAge: AUTH_CONSUMED_CALLBACK_MAX_AGE_SECONDS,
        path: "/auth/confirm",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    );
  }

  return response;
}

function authStatusPath(
  pathname: "/login" | "/forgot-password",
  status: AuthCallbackStatus,
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
  const providerErrorCode = request.nextUrl.searchParams.get("error_code");
  const queryNext = request.nextUrl.searchParams.get("next");
  const recoveryFlow = queryNext === "/update-password";
  const flow: AuthCallbackFlow = recoveryFlow ? "recovery" : "confirmation";
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
  const consumedCallback = code
    ? getConsumedCallbackDigest(flow, code)
    : undefined;
  const wasConsumed = Boolean(
    consumedCallback &&
      request.cookies.get(AUTH_CONSUMED_CALLBACK_COOKIE)?.value ===
        consumedCallback,
  );

  if (!code || providerErrorCode || wasConsumed) {
    const status = getAuthCallbackFailureStatus({
      flow,
      error: {
        code: providerErrorCode ?? "missing_callback_code",
      },
      consumed: wasConsumed,
    });

    return privateRedirect(
      request,
      recoveryFlow
        ? authStatusPath("/forgot-password", status)
        : authStatusPath(
            "/login",
            status,
            nextPath === "/dashboard" ? undefined : nextPath,
          ),
      { authHeaders },
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const status = getAuthCallbackFailureStatus({
      flow,
      error,
      consumed: false,
    });
    return privateRedirect(
      request,
      recoveryFlow
        ? authStatusPath("/forgot-password", status)
        : authStatusPath(
            "/login",
            status,
            nextPath === "/dashboard" ? undefined : nextPath,
          ),
      { authHeaders },
    );
  }

  return privateRedirect(request, nextPath, {
    authHeaders,
    consumedCallback,
    recoverySession: recoveryFlow && nextPath === "/update-password",
  });
}
