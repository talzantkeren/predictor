import { beforeEach, describe, expect, it, vi } from "vitest";

const actorId = "70000000-0000-4000-8000-000000000007";
const runId = "71000000-0000-4000-8000-000000000007";
const cronSecret = "local-test-cron-secret";

const mocks = vi.hoisted(() => ({
  getCronEnv: vi.fn(),
  runSportsSync: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getCronEnv: mocks.getCronEnv,
}));

vi.mock("@/features/sync/orchestrator", () => ({
  runSportsSync: mocks.runSportsSync,
}));

import { POST } from "@/app/api/cron/sync/route";
import { SyncError } from "@/features/sync/errors";

function syncRequest(
  options: {
    authorization?: string;
    contentType?: string | null;
    body?: string;
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
    method: "POST",
    headers,
    body: options.body,
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
      SPORTS_API_KEY: undefined,
    });
    mocks.runSportsSync.mockResolvedValue({
      runId,
      status: "succeeded",
      reason: "MANUAL_NO_CHANGE",
    });
  });

  it.each([undefined, "Bearer wrong-secret", "Basic local-test-cron-secret"])(
    "rejects a missing or incorrect bearer secret without an RPC write",
    async (authorization) => {
      const response = await POST(syncRequest({ authorization }));

      expect(response.status).toBe(401);
      expect(await responseErrorCode(response)).toBe("UNAUTHORIZED");
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(mocks.runSportsSync).not.toHaveBeenCalled();
    },
  );

  it("rejects the wrong media type before an RPC write", async () => {
    const wrongMedia = await POST(
      syncRequest({
        authorization: `Bearer ${cronSecret}`,
        contentType: "text/plain",
      }),
    );

    expect(wrongMedia.status).toBe(415);
    expect(mocks.runSportsSync).not.toHaveBeenCalled();
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
    expect(mocks.runSportsSync).not.toHaveBeenCalled();
  });

  it("runs the bounded Manual replay once and returns its terminal result", async () => {
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
        status: "succeeded",
        reason: "MANUAL_NO_CHANGE",
      },
    });
    expect(mocks.runSportsSync).toHaveBeenCalledTimes(1);
    expect(mocks.runSportsSync).toHaveBeenCalledWith({
      systemActorId: actorId,
      provider: "manual",
      apiKey: undefined,
      force: false,
    });
  });

  it("rejects a nonempty or oversized JSON body", async () => {
    const response = await POST(
      syncRequest({
        authorization: `Bearer ${cronSecret}`,
        body: JSON.stringify({ force: true }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await responseErrorCode(response)).toBe("INVALID_REQUEST");
    expect(mocks.runSportsSync).not.toHaveBeenCalled();
  });

  it("returns API-Football NOT_DUE without exposing provider credentials", async () => {
    mocks.getCronEnv.mockReturnValue({
      CRON_SECRET: cronSecret,
      SYNC_SYSTEM_ACTOR_ID: actorId,
      SPORTS_API_PROVIDER: "api-football",
      SPORTS_API_KEY: "never-return-this-key",
    });
    mocks.runSportsSync.mockResolvedValue({
      runId: null,
      status: "skipped",
      reason: "NOT_DUE",
    });
    const response = await POST(
      syncRequest({ authorization: `Bearer ${cronSecret}` }),
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("NOT_DUE");
    expect(body).not.toContain("never-return-this-key");
  });

  it("returns a recorded provider failure with a safe 503 result", async () => {
    mocks.runSportsSync.mockResolvedValue({
      runId,
      status: "failed",
      reason: "PROVIDER_TIMEOUT",
    });
    const response = await POST(
      syncRequest({ authorization: `Bearer ${cronSecret}` }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      data: { runId, status: "failed", reason: "PROVIDER_TIMEOUT" },
    });
  });

  it("maps an actor rejected by the RPC to a safe response", async () => {
    mocks.runSportsSync.mockRejectedValue(
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
    mocks.runSportsSync.mockRejectedValue(
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
