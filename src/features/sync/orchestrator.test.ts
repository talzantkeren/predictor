import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import fixturesEnvelope from "@/features/sports/__fixtures__/api-football/fixtures-sample-383-2026.json";
import leagueEnvelope from "@/features/sports/__fixtures__/api-football/league-383-2026.json";
import providerErrorEnvelope from "@/features/sports/__fixtures__/api-football/provider-error.json";
import roundsEnvelope from "@/features/sports/__fixtures__/api-football/rounds-383-2026.json";
import teamsEnvelope from "@/features/sports/__fixtures__/api-football/teams-383-2026.json";
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
    applyManual: vi.fn(async () => ({
      runId,
      status: "succeeded" as const,
      startedAt: "2026-08-23T18:00:00.000Z",
      finishedAt: "2026-08-23T18:00:00.000Z",
      reason: "MANUAL_NO_CHANGE" as const,
      rowsInserted: 0,
      teamsChanged: 0,
      matchesChanged: 0,
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
  it("persists the bounded Manual adapter catalog without creating a live lease or HTTP request", async () => {
    const deps = dependencies();
    const unavailableProviderTransport = vi.fn(async () => {
      throw new Error("Provider outage");
    });
    await expect(
      runSportsSync(
        {
          systemActorId: actorId,
          provider: "manual",
          force: false,
          transport: unavailableProviderTransport,
        },
        deps,
      ),
    ).resolves.toEqual({
      runId,
      status: "succeeded",
      reason: "MANUAL_NO_CHANGE",
    });
    expect(deps.applyManual).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        catalogId: "manual-catalog-v1",
        teams: expect.any(Array),
        matches: expect.any(Array),
      }),
    );
    expect(deps.claim).not.toHaveBeenCalled();
    expect(unavailableProviderTransport).not.toHaveBeenCalled();
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
    expect(JSON.stringify([result, deps.finalize.mock.calls])).not.toContain(
      secret,
    );
    expect(deps.apply).not.toHaveBeenCalled();
    expect(deps.finalize).toHaveBeenCalledWith(
      actorId,
      claim,
      expect.objectContaining({
        status: "failed",
        errorCode: "PROVIDER_BAD_RESPONSE",
        fixturesSeen: 0,
        operatorNotes: [],
      }),
    );
  });

  it("finalizes a long provider throttle with durable bounded metadata", async () => {
    const deps = dependencies();
    const targetedClaim = {
      ...claim,
      syncKind: "targeted" as const,
      fixtureIds: ["1900001"],
    };
    deps.claim.mockResolvedValueOnce(targetedClaim);
    const transport = vi.fn(async () =>
      new Response("{}", {
        status: 429,
        headers: {
          "Retry-After": "120",
          "x-ratelimit-requests-remaining": "9",
          "x-provider-private-detail": "never-persist",
        },
      }),
    );

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
    ).resolves.toEqual({
      runId,
      status: "failed",
      reason: "PROVIDER_RATE_LIMITED",
    });
    expect(transport).toHaveBeenCalledOnce();
    expect(deps.apply).not.toHaveBeenCalled();
    expect(deps.finalize).toHaveBeenCalledWith(
      actorId,
      targetedClaim,
      {
        status: "failed",
        errorCode: "PROVIDER_RATE_LIMITED",
        errorMessageSafe: "The sports provider rate limit was reached.",
        fixturesSeen: 0,
        retryAfterSeconds: 120,
        quotaRemaining: 9,
        operatorNotes: [],
      },
    );
    expect(JSON.stringify(deps.finalize.mock.calls)).not.toContain(
      "never-persist",
    );
  });

  it("classifies a normalized snapshot planner failure without leaking team metadata", async () => {
    const deps = dependencies();
    const plannerSecret = "private-planner-team";
    const conflictingFixtures = structuredClone(fixturesEnvelope);
    conflictingFixtures.response[0].teams.home.id = 999001;
    conflictingFixtures.response[0].teams.home.name = `${plannerSecret}-a`;
    conflictingFixtures.response[1].teams.home.id = 999001;
    conflictingFixtures.response[1].teams.home.name = `${plannerSecret}-b`;

    const result = await runSportsSync(
      {
        systemActorId: actorId,
        provider: "api-football",
        apiKey: "recorded-test-key",
        force: true,
        transport: recordedTransport(false, conflictingFixtures),
      },
      deps,
    );

    expect(result).toEqual({
      runId,
      status: "failed",
      reason: "SYNC_PLAN_FAILED",
    });
    expect(deps.apply).not.toHaveBeenCalled();
    expect(deps.finalize).toHaveBeenCalledOnce();
    expect(deps.finalize).toHaveBeenCalledWith(actorId, claim, {
      status: "failed",
      errorCode: "SYNC_PLAN_FAILED",
      errorMessageSafe:
        "The normalized provider snapshot could not be planned safely.",
      fixturesSeen: 0,
      quotaRemaining: null,
      retryAfterSeconds: null,
      operatorNotes: [],
    });
    expect(JSON.stringify([result, deps.finalize.mock.calls])).not.toContain(
      plannerSecret,
    );
  });

  it("finalizes exactly once after a controlled slow default retry path", async () => {
    vi.useFakeTimers();
    try {
      const deps = dependencies();
      const targetedClaim = {
        ...claim,
        syncKind: "targeted" as const,
        fixtureIds: ["1900001"],
      };
      deps.claim.mockResolvedValueOnce(targetedClaim);
      const transport = vi.fn(
        async () =>
          new Promise<Response>((resolve) => {
            setTimeout(
              () => resolve(new Response("{}", { status: 503 })),
              7_000,
            );
          }),
      );

      const result = runSportsSync(
        {
          systemActorId: actorId,
          provider: "api-football",
          apiKey: "recorded-test-key",
          force: false,
          transport,
        },
        deps,
      );
      await vi.runAllTimersAsync();

      await expect(result).resolves.toEqual({
        runId,
        status: "failed",
        reason: "PROVIDER_UNAVAILABLE",
      });
      expect(transport).toHaveBeenCalledTimes(3);
      expect(deps.apply).not.toHaveBeenCalled();
      expect(deps.finalize).toHaveBeenCalledOnce();
      expect(deps.finalize).toHaveBeenCalledWith(
        actorId,
        targetedClaim,
        expect.objectContaining({
          status: "failed",
          errorCode: "PROVIDER_UNAVAILABLE",
          fixturesSeen: 0,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a typed failure when failure finalization also fails", async () => {
    const deps = dependencies();
    deps.finalize.mockRejectedValueOnce(new Error("stale lease"));

    await expect(
      runSportsSync(
        {
          systemActorId: actorId,
          provider: "api-football",
          apiKey: "recorded-test-key",
          force: true,
          transport: recordedTransport(true),
        },
        deps,
      ),
    ).resolves.toEqual({
      runId,
      status: "failed",
      reason: "SYNC_FINALIZE_FAILED",
    });
    expect(deps.finalize).toHaveBeenCalledOnce();
  });

  it("does not re-finalize when the success finalizer fails", async () => {
    const deps = dependencies();
    const finalizeSecret = "private-finalizer-detail";
    deps.finalize.mockRejectedValueOnce(new Error(finalizeSecret));

    const result = await runSportsSync(
      {
        systemActorId: actorId,
        provider: "api-football",
        apiKey: "recorded-test-key",
        force: true,
        transport: recordedTransport(),
      },
      deps,
    );

    expect(result).toEqual({
      runId,
      status: "failed",
      reason: "SYNC_FINALIZE_FAILED",
    });
    expect(deps.apply).toHaveBeenCalledOnce();
    expect(deps.finalize).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain(finalizeSecret);
  });

  it("retains safe review notes when a later apply batch fails", async () => {
    const deps = dependencies();
    const applySecret = "private-sql-apply-detail";
    deps.apply.mockRejectedValueOnce(new Error(applySecret));
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
        errorCode: "SYNC_APPLY_FAILED",
        fixturesSeen: 2,
        operatorNotes: ["AET_REQUIRES_REVIEW:1900001"],
      }),
    );
    expect(deps.finalize).toHaveBeenCalledOnce();
    expect(JSON.stringify(deps.finalize.mock.calls)).not.toContain(applySecret);
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
    expect(deps.claim).toHaveBeenCalledWith(actorId, false);
    expect(transport).not.toHaveBeenCalled();
    expect(deps.apply).not.toHaveBeenCalled();
    expect(deps.finalize).not.toHaveBeenCalled();
  });

  it("returns a forced cooldown skip without provider I/O or a finalizer call", async () => {
    const deps = dependencies();
    deps.claim.mockResolvedValueOnce({
      outcome: "NOT_DUE",
      runId: null,
      provider: "api-football",
      reason: "FORCE_COOLDOWN",
    });
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
    ).resolves.toEqual({
      runId: null,
      status: "skipped",
      reason: "FORCE_COOLDOWN",
    });
    expect(deps.claim).toHaveBeenCalledWith(actorId, true);
    expect(transport).not.toHaveBeenCalled();
    expect(deps.apply).not.toHaveBeenCalled();
    expect(deps.finalize).not.toHaveBeenCalled();
  });
});
