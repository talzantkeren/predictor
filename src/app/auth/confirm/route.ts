import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { getSafeAuthRedirect } from "@/features/auth/redirects";
import { createClient } from "@/lib/supabase/server";

const allowedOtpTypes = new Set<EmailOtpType>(["email", "recovery", "signup"]);

function privateRedirect(
  request: NextRequest,
  path: string,
  options?: { recoverySession?: boolean },
) {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");

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
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const rawType = request.nextUrl.searchParams.get("type");
  const type = allowedOtpTypes.has(rawType as EmailOtpType)
    ? (rawType as EmailOtpType)
    : null;
  const recoveryFlow =
    type === "recovery" ||
    request.nextUrl.searchParams.get("next") === "/update-password";
  const nextPath = getSafeAuthRedirect(
    request.nextUrl.searchParams.get("next"),
    recoveryFlow ? "/update-password" : "/dashboard",
  );

  const supabase = await createClient();
  let failed = true;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    failed = Boolean(error);
  }

  if (failed) {
    return privateRedirect(
      request,
      recoveryFlow
        ? "/forgot-password?status=recovery-error"
        : "/login?status=confirmation-error",
    );
  }

  return privateRedirect(request, nextPath, {
    recoverySession: recoveryFlow && nextPath === "/update-password",
  });
}
