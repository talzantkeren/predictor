import { beforeEach, describe, expect, it, vi } from "vitest";

const actorId = "70000000-0000-4000-8000-000000000007";
const runId = "71000000-0000-4000-8000-000000000007";
const cronSecret = "local-test-cron-secret";

const mocks = vi.hoisted(() => ({
  getCronEnv: vi.fn(),
  recordManualSyncAttempt: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getCronEnv: mocks.getCronEnv,
}));

vi.mock("@/features/sync/private-sync-gateway", () => ({
  recordManualSyncAttempt: mocks.recordManualSyncAttempt,
}));

import { POST } from "@/app/api/cron/sync/route";
import { SyncError } from "@/features/sync/errors";

function syncRequest(
  options: {
    authorization?: string;
    contentType?: string | null;
    method?: string;
  } = {},
) {
  const headers = new Headers();
  if (options.authorization !== undefined) {
    headers.set("Authorization", options.authorization);
  }
  if (options.contentType !== null) {
    headers.set("Content-Type", options.contentType ?? "application/json");
  }

  return new Request("http://localhost:3000/api/cron/sync", {
    method: options.method ?? "POST",
    headers,
  });
}

async function responseErrorCode(response: Response) {
  const body = (await response.json()) as { error?: { code?: unknown } };
  return body.error?.code;
}

describe("POST /api/cron/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCronEnv.mockReturnValue({
      CRON_SECRET: cronSecret,
      SYNC_SYSTEM_ACTOR_ID: actorId,
      SPORTS_API_PROVIDER: "manual",
    });
    mocks.recordManualSyncAttempt.mockResolvedValue({
      id: runId,
      provider: "manual",
      status: "skipped",
      startedAt: "2026-08-22T10:00:00.000Z",
      finishedAt: "2026-08-22T10:00:00.000Z",
      reason: "MANUAL_PROVIDER",
    });
  });

  it.each([undefined, "Bearer wrong-secret", "Basic local-test-cron-secret"])(
    "rejects a missing or incorrect bearer secret without an RPC write",
    async (authorization) => {
      const response = await POST(syncRequest({ authorization }));

      expect(response.status).toBe(401);
      expect(await responseErrorCode(response)).toBe("UNAUTHORIZED");
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(mocks.recordManualSyncAttempt).not.toHaveBeenCalled();
    },
  );

  it("rejects the wrong method or media type before an RPC write", async () => {
    const wrongMethod = await POST(
      syncRequest({
        authorization: `Bearer ${cronSecret}`,
        method: "PUT",
      }),
    );
    const wrongMedia = await POST(
      syncRequest({
        authorization: `Bearer ${cronSecret}`,
        contentType: "text/plain",
      }),
    );

    expect(wrongMethod.status).toBe(405);
    expect(wrongMedia.status).toBe(415);
    expect(mocks.recordManualSyncAttempt).not.toHaveBeenCalled();
  });

  it("fails closed when the manual Cron environment is incomplete", async () => {
    mocks.getCronEnv.mockImplementation(() => {
      throw new Error(`Invalid actor ${actorId}`);
    });

    const response = await POST(
      syncRequest({ authorization: `Bearer ${cronSecret}` }),
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("SYNC_NOT_CONFIGURED");
    expect(body).not.toContain(actorId);
    expect(mocks.recordManualSyncAttempt).not.toHaveBeenCalled();
  });

  it("records exactly one manual attempt and returns a neutral skipped result", async () => {
    const response = await POST(
      syncRequest({
        authorization: `Bearer ${cronSecret}`,
        contentType: "application/json; charset=utf-8",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        runId,
        status: "skipped",
        reason: "MANUAL_PROVIDER",
      },
    });
    expect(mocks.recordManualSyncAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.recordManualSyncAttempt).toHaveBeenCalledWith(actorId);
  });

  it("maps an actor rejected by the RPC to a safe response", async () => {
    mocks.recordManualSyncAttempt.mockRejectedValue(
      new SyncError("FORBIDDEN", 403, {
        cause: new Error(`Rejected actor ${actorId}`),
      }),
    );

    const response = await POST(
      syncRequest({ authorization: `Bearer ${cronSecret}` }),
    );
    const body = await response.text();

    expect(response.status).toBe(403);
    expect(body).toContain("FORBIDDEN");
    expect(body).not.toContain(actorId);
    expect(body).not.toContain(cronSecret);
  });

  it("does not expose unexpected database details", async () => {
    mocks.recordManualSyncAttempt.mockRejectedValue(
      new Error("password=database-secret"),
    );

    const response = await POST(
      syncRequest({ authorization: `Bearer ${cronSecret}` }),
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("SYNC_UNAVAILABLE");
    expect(body).not.toContain("database-secret");
  });
});
