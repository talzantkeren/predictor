import { beforeEach, describe, expect, it, vi } from "vitest";

const actorId = "70000000-0000-4000-8000-000000000007";
const runId = "71000000-0000-4000-8000-000000000007";
const cronSecret = "local-test-cron-secret";

const mocks = vi.hoisted(() => ({
  activateDueLeagues: vi.fn(),
  getCronEnv: vi.fn(),
  getSportsSyncEnv: vi.fn(),
  runSportsSync: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getCronEnv: mocks.getCronEnv,
  getSportsSyncEnv: mocks.getSportsSyncEnv,
}));

vi.mock("@/features/sync/private-sync-gateway", () => ({
  activateDueLeagues: mocks.activateDueLeagues,
}));

vi.mock("@/features/sync/orchestrator", () => ({
  runSportsSync: mocks.runSportsSync,
}));

import { maxDuration, POST } from "@/app/api/cron/sync/route";
import { SyncError } from "@/features/sync/errors";
import {
  SPORTS_SYNC_LEASE_DURATION_MS,
  SPORTS_SYNC_PG_NET_TIMEOUT_MS,
  SPORTS_SYNC_PROVIDER_BUDGET_MS,
  SPORTS_SYNC_ROUTE_MAX_DURATION_SECONDS,
} from "@/features/sync/runtime-budget";

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
    });
    mocks.getSportsSyncEnv.mockReturnValue({
      SPORTS_API_PROVIDER: "manual",
      SPORTS_API_KEY: undefined,
    });
    mocks.activateDueLeagues.mockResolvedValue({
      activatedCount: 0,
      lateCount: 0,
      recordedAt: "2026-08-27T00:00:00.000Z",
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
      expect(mocks.activateDueLeagues).not.toHaveBeenCalled();
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
    expect(mocks.activateDueLeagues).not.toHaveBeenCalled();
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
    expect(mocks.activateDueLeagues).not.toHaveBeenCalled();
    expect(mocks.runSportsSync).not.toHaveBeenCalled();
  });

  it("keeps the route ceiling above the provider budget with margin and below the lease", () => {
    expect(maxDuration).toBe(SPORTS_SYNC_ROUTE_MAX_DURATION_SECONDS);
    expect(SPORTS_SYNC_PG_NET_TIMEOUT_MS).toBeGreaterThan(
      SPORTS_SYNC_PROVIDER_BUDGET_MS + 10_000,
    );
    expect(SPORTS_SYNC_PG_NET_TIMEOUT_MS).toBeLessThan(maxDuration * 1_000);
    expect(maxDuration * 1_000).toBeLessThan(SPORTS_SYNC_LEASE_DURATION_MS);
  });

  it("activates due leagues before the bounded Manual provider branch", async () => {
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
    expect(mocks.activateDueLeagues).toHaveBeenCalledTimes(1);
    expect(mocks.activateDueLeagues).toHaveBeenCalledWith(actorId);
    const activationOrder = mocks.activateDueLeagues.mock.invocationCallOrder[0];
    const environmentOrder = mocks.getSportsSyncEnv.mock.invocationCallOrder[0];
    const providerOrder = mocks.runSportsSync.mock.invocationCallOrder[0];
    expect(activationOrder).toEqual(expect.any(Number));
    expect(environmentOrder).toEqual(expect.any(Number));
    expect(providerOrder).toEqual(expect.any(Number));
    if (
      activationOrder === undefined ||
      environmentOrder === undefined ||
      providerOrder === undefined
    ) {
      throw new Error("Expected all Cron phases to run once.");
    }
    expect(activationOrder).toBeLessThan(environmentOrder);
    expect(environmentOrder).toBeLessThan(providerOrder);
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
    expect(mocks.activateDueLeagues).not.toHaveBeenCalled();
    expect(mocks.runSportsSync).not.toHaveBeenCalled();
  });

  it("commits activation before provider configuration fails", async () => {
    mocks.getSportsSyncEnv.mockImplementation(() => {
      throw new Error("SPORTS_API_KEY is missing");
    });

    const response = await POST(
      syncRequest({ authorization: `Bearer ${cronSecret}` }),
    );

    expect(response.status).toBe(503);
    expect(await responseErrorCode(response)).toBe("SYNC_NOT_CONFIGURED");
    expect(mocks.activateDueLeagues).toHaveBeenCalledWith(actorId);
    expect(mocks.runSportsSync).not.toHaveBeenCalled();
  });

  it("fails closed before provider selection when activation cannot persist", async () => {
    mocks.activateDueLeagues.mockRejectedValue(
      new SyncError("FORBIDDEN", 403),
    );

    const response = await POST(
      syncRequest({ authorization: `Bearer ${cronSecret}` }),
    );

    expect(response.status).toBe(403);
    expect(mocks.getSportsSyncEnv).not.toHaveBeenCalled();
    expect(mocks.runSportsSync).not.toHaveBeenCalled();
  });

  it("returns API-Football NOT_DUE without exposing provider credentials", async () => {
    mocks.getSportsSyncEnv.mockReturnValue({
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

  it("returns FORCE_COOLDOWN as a neutral skip without exposing credentials", async () => {
    mocks.getSportsSyncEnv.mockReturnValue({
      SPORTS_API_PROVIDER: "api-football",
      SPORTS_API_KEY: "never-return-this-key",
    });
    mocks.runSportsSync.mockResolvedValue({
      runId: null,
      status: "skipped",
      reason: "FORCE_COOLDOWN",
    });

    const response = await POST(
      syncRequest({ authorization: `Bearer ${cronSecret}` }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("FORCE_COOLDOWN");
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
    expect(mocks.activateDueLeagues).toHaveBeenCalledWith(actorId);
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
