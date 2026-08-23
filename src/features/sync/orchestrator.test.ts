import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import fixturesEnvelope from "@/features/sports/__fixtures__/api-football/fixtures-sample-383-2026.json";
import leagueEnvelope from "@/features/sports/__fixtures__/api-football/league-383-2026.json";
import providerErrorEnvelope from "@/features/sports/__fixtures__/api-football/provider-error.json";
import roundsEnvelope from "@/features/sports/__fixtures__/api-football/rounds-383-2026.json";
import teamsEnvelope from "@/features/sports/__fixtures__/api-football/teams-383-2026.json";
import { SyncError } from "@/features/sync/errors";
import { runSportsSync } from "@/features/sync/orchestrator";
import type { SportsSyncClaim } from "@/features/sync/types";

const actorId = "70000000-0000-4000-8000-000000000007";
const runId = "71000000-0000-4000-8000-000000000007";
const claim = {
  outcome: "CLAIMED" as const,
  runId,
  provider: "api-football" as const,
  syncKind: "catalog" as const,
  generation: 7,
  token: "72000000-0000-4000-8000-000000000007",
  lockedUntil: "2026-08-23T18:02:00.000Z",
  fixtureIds: [],
};

function dependencies() {
  return {
    recordManual: vi.fn(async () => ({
      id: runId,
      provider: "manual" as const,
      status: "skipped" as const,
      startedAt: "2026-08-23T18:00:00.000Z",
      finishedAt: "2026-08-23T18:00:00.000Z",
      reason: "MANUAL_PROVIDER" as const,
    })),
    claim: vi.fn<
      (_actorId: string, _force: boolean) => Promise<SportsSyncClaim>
    >(async () => claim),
    apply: vi.fn(async () => ({
      result_rows_inserted: 0,
      result_teams_changed: 0,
      result_matches_changed: 0,
      result_results_changed: 0,
      result_manual_overrides_skipped: 0,
    })),
    finalize: vi.fn(async (_actor, _claim, result) => ({
      result_run_id: runId,
      result_status: result.status,
      result_code: result.status === "failed" ? result.errorCode : null,
      result_finished_at: "2026-08-23T18:00:01.000Z",
    })),
  };
}

function recordedTransport(
  error = false,
  fixturePayload: unknown = fixturesEnvelope,
) {
  const responses = new Map<string, unknown>([
    ["/leagues", error ? providerErrorEnvelope : leagueEnvelope],
    ["/teams", teamsEnvelope],
    ["/fixtures/rounds", roundsEnvelope],
    ["/fixtures", fixturePayload],
  ]);
  return vi.fn(async ({ url }: { url: string }) =>
    new Response(JSON.stringify(responses.get(new URL(url).pathname))),
  );
}

describe("shared sports sync orchestration", () => {
  it("retains the manual path without creating a live lease", async () => {
    const deps = dependencies();
    await expect(
      runSportsSync(
        { systemActorId: actorId, provider: "manual", force: false },
        deps,
      ),
    ).resolves.toEqual({
      runId,
      status: "skipped",
      reason: "MANUAL_PROVIDER",
    });
    expect(deps.recordManual).toHaveBeenCalledWith(actorId);
    expect(deps.claim).not.toHaveBeenCalled();
  });

  it("claims, performs recorded HTTP outside the gateway, applies, and finalizes", async () => {
    const deps = dependencies();
    const transport = recordedTransport();
    await expect(
      runSportsSync(
        {
          systemActorId: actorId,
          provider: "api-football",
          apiKey: "recorded-test-key",
          force: true,
          transport,
        },
        deps,
      ),
    ).resolves.toEqual({ runId, status: "succeeded", reason: "SUCCEEDED" });
    expect(transport).toHaveBeenCalledTimes(4);
    expect(deps.apply).toHaveBeenCalledTimes(1);
    expect(deps.finalize).toHaveBeenCalledWith(
      actorId,
      claim,
      expect.objectContaining({ status: "succeeded", fixturesSeen: 2 }),
    );
  });

  it("records a sanitized provider failure and never applies invalid data", async () => {
    const deps = dependencies();
    const secret = "secret-never-visible";
    const result = await runSportsSync(
      {
        systemActorId: actorId,
        provider: "api-football",
        apiKey: secret,
        force: true,
        transport: recordedTransport(true),
      },
      deps,
    );
    expect(result).toEqual({
      runId,
      status: "failed",
      reason: "PROVIDER_BAD_RESPONSE",
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(deps.apply).not.toHaveBeenCalled();
    expect(deps.finalize).toHaveBeenCalledWith(
      actorId,
      claim,
      expect.objectContaining({
        status: "failed",
        errorCode: "PROVIDER_BAD_RESPONSE",
        operatorNotes: [],
      }),
    );
  });

  it("retains safe review notes when a later apply batch fails", async () => {
    const deps = dependencies();
    deps.apply.mockRejectedValueOnce(new SyncError("SYNC_UNAVAILABLE", 503));
    const reviewFixtures = structuredClone(fixturesEnvelope);
    reviewFixtures.response[0].fixture.status.short = "AET";
    reviewFixtures.response[0].fixture.status.long = "Match Finished After Extra Time";

    await expect(
      runSportsSync(
        {
          systemActorId: actorId,
          provider: "api-football",
          apiKey: "recorded-test-key",
          force: true,
          transport: recordedTransport(false, reviewFixtures),
        },
        deps,
      ),
    ).resolves.toEqual({
      runId,
      status: "failed",
      reason: "SYNC_APPLY_FAILED",
    });
    expect(deps.finalize).toHaveBeenCalledWith(
      actorId,
      claim,
      expect.objectContaining({
        status: "failed",
        operatorNotes: ["AET_REQUIRES_REVIEW:1900001"],
      }),
    );
  });

  it("does not contact the provider when the due planner declines the claim", async () => {
    const deps = dependencies();
    deps.claim.mockResolvedValueOnce({
      outcome: "NOT_DUE",
      runId: null,
      provider: "api-football",
      reason: "NOT_DUE",
    });
    const transport = recordedTransport();
    await expect(
      runSportsSync(
        {
          systemActorId: actorId,
          provider: "api-football",
          apiKey: "recorded-test-key",
          force: false,
          transport,
        },
        deps,
      ),
    ).resolves.toEqual({ runId: null, status: "skipped", reason: "NOT_DUE" });
    expect(transport).not.toHaveBeenCalled();
    expect(deps.apply).not.toHaveBeenCalled();
  });
});
