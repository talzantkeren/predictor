import { NextResponse } from "next/server";

import { getProofError } from "@/features/files/errors";

const basePrivateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
} as const;

export function privateJson(
  body: unknown,
  init: { status?: number; varyOrigin?: boolean; retryAfterSeconds?: number } = {},
) {
  const headers: Record<string, string> = {
    ...basePrivateHeaders,
    Vary: init.varyOrigin ? "Cookie, Origin" : "Cookie",
  };

  if (init.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(init.retryAfterSeconds);
  }

  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers,
  });
}

export function privateRedirect(url: string) {
  return NextResponse.redirect(url, {
    status: 302,
    headers: basePrivateHeaders,
  });
}

export function proofErrorJson(error: unknown, varyOrigin = false) {
  const safeError = getProofError(error);

  return privateJson(
    {
      code: safeError.code,
      message: safeError.message,
      error: {
        code: safeError.code,
        message: safeError.message,
      },
    },
    {
      status: safeError.status,
      varyOrigin,
      retryAfterSeconds: safeError.retryAfterSeconds,
    },
  );
}
