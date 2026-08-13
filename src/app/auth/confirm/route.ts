import { type NextRequest, NextResponse } from "next/server";

import { getSafeAuthRedirect } from "@/features/auth/redirects";
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

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const recoveryFlow =
    request.nextUrl.searchParams.get("next") === "/update-password";
  const nextPath = getSafeAuthRedirect(
    request.nextUrl.searchParams.get("next"),
    recoveryFlow ? "/update-password" : "/dashboard",
  );

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
          ? "/forgot-password?status=recovery-browser-mismatch"
          : "/login?status=confirmation-completed",
        { authHeaders },
      );
    }

    return privateRedirect(
      request,
      recoveryFlow
        ? "/forgot-password?status=recovery-error"
        : "/login?status=confirmation-error",
      { authHeaders },
    );
  }

  return privateRedirect(request, nextPath, {
    authHeaders,
    recoverySession: recoveryFlow && nextPath === "/update-password",
  });
}
