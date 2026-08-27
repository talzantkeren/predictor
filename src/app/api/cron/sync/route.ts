import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getSyncError, SyncError } from "@/features/sync/errors";
import { runSportsSync } from "@/features/sync/orchestrator";
import { activateDueLeagues } from "@/features/sync/private-sync-gateway";
import { getCronEnv, getSportsSyncEnv } from "@/lib/env";

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

async function hasValidEmptyJsonBody(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 1_024)
  ) {
    return false;
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 1_024) return false;
  try {
    const parsed: unknown = body.length === 0 ? {} : JSON.parse(body);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 0
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
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

  if (!(await hasValidEmptyJsonBody(request))) {
    return errorResponse(new SyncError("INVALID_REQUEST", 400));
  }

  try {
    // Lifecycle activation is the first authenticated business write in the
    // existing Cron. It commits independently before provider configuration,
    // branching, claiming, or I/O, so a provider failure cannot roll it back.
    await activateDueLeagues(cronEnv.SYNC_SYSTEM_ACTOR_ID);

    let sportsEnv: ReturnType<typeof getSportsSyncEnv>;
    try {
      sportsEnv = getSportsSyncEnv();
    } catch (error) {
      throw new SyncError("SYNC_NOT_CONFIGURED", 503, { cause: error });
    }

    const attempt = await runSportsSync({
      systemActorId: cronEnv.SYNC_SYSTEM_ACTOR_ID,
      provider: sportsEnv.SPORTS_API_PROVIDER,
      apiKey: sportsEnv.SPORTS_API_KEY,
      force: false,
    });

    return privateJson(
      {
        data: {
          runId: attempt.runId,
          status: attempt.status,
          reason: attempt.reason,
        },
      },
      attempt.status === "failed" ? 503 : 200,
    );
  } catch (error) {
    return errorResponse(getSyncError(error));
  }
}
