import { NextResponse } from "next/server";

import {
  encodeInviteAccessCookie,
  getInviteAccessCookieOptions,
  INVITE_ACCESS_COOKIE,
  INVITE_ACCESS_MAX_AGE_SECONDS,
  isTrustedInviteExchangeOrigin,
  MAX_INVITE_EXCHANGE_BODY_BYTES,
} from "@/features/membership/invite-access";
import { resolveInvite } from "@/features/membership/queries";
import {
  inviteExchangeInputSchema,
  invitePublicIdSchema,
} from "@/features/membership/schemas";
import { getPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ publicId: string }>;
};

function privateResponse(status: number, publicId?: string) {
  const response = NextResponse.json(
    {
      error: {
        code: "INVITE_UNAVAILABLE",
        message: "קישור ההזמנה אינו זמין.",
      },
    },
    { status },
  );
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Vary", "Origin");

  if (publicId) {
    response.cookies.set(
      INVITE_ACCESS_COOKIE,
      "",
      getInviteAccessCookieOptions(publicId, 0),
    );
  }

  return response;
}

async function readBoundedJson(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/json" || !request.body) {
    return null;
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      return null;
    }

    const declaredLength = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength > MAX_INVITE_EXCHANGE_BODY_BYTES
    ) {
      return null;
    }
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      total += value.byteLength;
      if (total > MAX_INVITE_EXCHANGE_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return null;
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { publicId: rawPublicId } = await context.params;
  const parsedPublicId = invitePublicIdSchema.safeParse(rawPublicId);

  if (!parsedPublicId.success) {
    return privateResponse(404);
  }

  const publicId = parsedPublicId.data;

  try {
    const env = getPublicEnv();
    if (
      !isTrustedInviteExchangeOrigin(
        request.headers.get("origin"),
        env.NEXT_PUBLIC_APP_URL,
        [
          process.env.VERCEL_BRANCH_URL,
          process.env.VERCEL_URL,
          process.env.VERCEL_PROJECT_PRODUCTION_URL,
        ],
      )
    ) {
      return privateResponse(403);
    }

    const parsedBody = inviteExchangeInputSchema.safeParse(
      await readBoundedJson(request),
    );
    if (!parsedBody.success) {
      return privateResponse(404, publicId);
    }

    const supabase = await createClient();
    const result = await resolveInvite(
      supabase,
      publicId,
      parsedBody.data.tokenHash,
    );

    if (result.status !== "found") {
      return privateResponse(result.status === "error" ? 503 : 404, publicId);
    }

    const response = NextResponse.json(
      { data: { exchanged: true } },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
          Pragma: "no-cache",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
          Vary: "Origin",
        },
      },
    );
    response.cookies.set(
      INVITE_ACCESS_COOKIE,
      encodeInviteAccessCookie(publicId, parsedBody.data.tokenHash),
      getInviteAccessCookieOptions(
        publicId,
        INVITE_ACCESS_MAX_AGE_SECONDS,
      ),
    );
    return response;
  } catch {
    return privateResponse(503, publicId);
  }
}
