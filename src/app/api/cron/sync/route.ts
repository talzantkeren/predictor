import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getSyncError, SyncError } from "@/features/sync/errors";
import { recordManualSyncAttempt } from "@/features/sync/private-sync-gateway";
import { getCronEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateJson(body: unknown, status: number) {
  const response = NextResponse.json(body, { status });
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function errorResponse(error: SyncError) {
  const response = privateJson(
    { error: { code: error.code, message: error.message } },
    error.status,
  );

  if (error.code === "UNAUTHORIZED") {
    response.headers.set("WWW-Authenticate", "Bearer");
  }

  return response;
}

function isExpectedContentType(request: Request) {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function hasValidBearerSecret(request: Request, expectedSecret: string) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const suppliedSecret = authorization.slice("Bearer ".length);
  if (!suppliedSecret) return false;

  const suppliedDigest = digest(suppliedSecret);
  const expectedDigest = digest(expectedSecret);
  return timingSafeEqual(suppliedDigest, expectedDigest);
}

export async function POST(request: Request) {
  if (request.method !== "POST") {
    return errorResponse(new SyncError("INVALID_REQUEST", 405));
  }

  if (!isExpectedContentType(request)) {
    return errorResponse(new SyncError("INVALID_REQUEST", 415));
  }

  let cronEnv: ReturnType<typeof getCronEnv>;
  try {
    cronEnv = getCronEnv();
  } catch (error) {
    return errorResponse(
      new SyncError("SYNC_NOT_CONFIGURED", 503, { cause: error }),
    );
  }

  if (!hasValidBearerSecret(request, cronEnv.CRON_SECRET)) {
    return errorResponse(new SyncError("UNAUTHORIZED", 401));
  }

  try {
    const attempt = await recordManualSyncAttempt(
      cronEnv.SYNC_SYSTEM_ACTOR_ID,
    );

    return privateJson(
      {
        data: {
          runId: attempt.id,
          status: attempt.status,
          reason: attempt.reason,
        },
      },
      200,
    );
  } catch (error) {
    return errorResponse(getSyncError(error));
  }
}
