import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import fixturesEnvelope from "@/features/sports/__fixtures__/api-football/fixtures-sample-383-2026.json";
import leagueEnvelope from "@/features/sports/__fixtures__/api-football/league-383-2026.json";
import providerErrorEnvelope from "@/features/sports/__fixtures__/api-football/provider-error.json";
import roundsEnvelope from "@/features/sports/__fixtures__/api-football/rounds-383-2026.json";
import teamsEnvelope from "@/features/sports/__fixtures__/api-football/teams-383-2026.json";
import {
  ApiFootballClient,
  ApiFootballClientError,
  API_FOOTBALL_BASE_URL,
  type ApiFootballTransport,
} from "@/features/sports/api-football-client";

function jsonResponse(
  payload: unknown,
  options: { status?: number; headers?: Record<string, string> } = {},
) {
  return new Response(JSON.stringify(payload), {
    status: options.status ?? 200,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
}

function clientWithTransport(
  transport: ApiFootballTransport,
  overrides: Partial<ConstructorParameters<typeof ApiFootballClient>[0]> = {},
) {
  return new ApiFootballClient({
    apiKey: "recorded-test-key",
    transport,
    sleep: async () => undefined,
    random: () => 0,
    ...overrides,
  });
}

describe("API-Football client contract", () => {
  it("uses the fixed origin, GET, and only the documented application headers", async () => {
    const transport = vi.fn<ApiFootballTransport>(async (request) => {
      const headers = new Headers(request.init.headers);
      expect(request.url).toBe(
        `${API_FOOTBALL_BASE_URL}/leagues?id=383&season=2026`,
      );
      expect(request.init.method).toBe("GET");
      expect([...headers.entries()]).toEqual([
        ["accept", "application/json"],
        ["x-apisports-key", "recorded-test-key"],
      ]);
      return jsonResponse(leagueEnvelope);
    });

    const result = await clientWithTransport(transport).getLeague();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].league.id).toBe(383);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("validates the recorded league, 14 teams, 26 rounds, and fixture envelopes", async () => {
    const responses = new Map<string, unknown>([
      ["/leagues", leagueEnvelope],
      ["/teams", teamsEnvelope],
      ["/fixtures/rounds", roundsEnvelope],
      ["/fixtures", fixturesEnvelope],
    ]);
    const transport: ApiFootballTransport = async ({ url }) => {
      const path = new URL(url).pathname;
      return jsonResponse(responses.get(path));
    };
    const client = clientWithTransport(transport);

    await expect(client.getLeague()).resolves.toMatchObject({ data: [{ league: { id: 383 } }] });
    await expect(client.getTeams()).resolves.toMatchObject({ data: { length: 14 } });
    await expect(client.getRounds()).resolves.toMatchObject({ data: { length: 26 } });
    await expect(client.getSeasonFixtures()).resolves.toMatchObject({ data: { length: 2 } });
  });

  it("reads safe quota headers without requiring them", async () => {
    const result = await clientWithTransport(async () =>
      jsonResponse(leagueEnvelope, {
        headers: {
          "x-ratelimit-requests-limit": "7500",
          "x-ratelimit-requests-remaining": "7421",
          "X-RateLimit-Limit": "300",
          "X-RateLimit-Remaining": "299",
        },
      }),
    ).getLeague();

    expect(result.quota).toEqual({
      dailyLimit: 7500,
      dailyRemaining: 7421,
      minuteLimit: 300,
      minuteRemaining: 299,
    });
  });

  it.each([
    providerErrorEnvelope,
    { ...providerErrorEnvelope, errors: ["recorded error"] },
  ])("rejects nonempty provider errors even on HTTP 200", async (payload) => {
    await expect(
      clientWithTransport(async () => jsonResponse(payload)).getFixturesByIds([
        "1900001",
      ]),
    ).rejects.toMatchObject({ code: "PROVIDER_BAD_RESPONSE" });
  });

  it.each([
    "not json",
    JSON.stringify({ ...leagueEnvelope, response: [{ invalid: true }] }),
  ])("rejects invalid JSON or nested schema without raw details", async (body) => {
    const client = clientWithTransport(async () => new Response(body));
    let caught: unknown;
    try {
      await client.getLeague();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiFootballClientError);
    expect(String(caught)).not.toContain(body.slice(0, 20));
  });

  it("rejects paging it cannot safely consume", async () => {
    await expect(
      clientWithTransport(async () =>
        jsonResponse({
          ...teamsEnvelope,
          paging: { current: 1, total: 2 },
        }),
      ).getTeams(),
    ).rejects.toMatchObject({ code: "PROVIDER_PAGING_UNSUPPORTED" });
  });

  it("rejects duplicate league, team, fixture, and round identities", async () => {
    const duplicateCases: Array<() => Promise<unknown>> = [
      () =>
        clientWithTransport(async () =>
          jsonResponse({
            ...leagueEnvelope,
            results: 2,
            response: [leagueEnvelope.response[0], leagueEnvelope.response[0]],
          }),
        ).getLeague(),
      () =>
        clientWithTransport(async () =>
          jsonResponse({
            ...teamsEnvelope,
            results: 15,
            response: [...teamsEnvelope.response, teamsEnvelope.response[0]],
          }),
        ).getTeams(),
      () =>
        clientWithTransport(async () =>
          jsonResponse({
            ...fixturesEnvelope,
            results: 3,
            response: [...fixturesEnvelope.response, fixturesEnvelope.response[0]],
          }),
        ).getSeasonFixtures(),
      () =>
        clientWithTransport(async () =>
          jsonResponse({
            ...roundsEnvelope,
            results: 27,
            response: [...roundsEnvelope.response, roundsEnvelope.response[0]],
          }),
        ).getRounds(),
    ];

    for (const run of duplicateCases) {
      await expect(run()).rejects.toMatchObject({ code: "PROVIDER_CONTRACT_ERROR" });
    }
  });

  it("enforces the response-size cap before and during body streaming", async () => {
    const byHeader = clientWithTransport(
      async () =>
        new Response("{}", { headers: { "Content-Length": "1000" } }),
      { responseLimitBytes: 10 },
    );
    await expect(byHeader.getLeague()).rejects.toMatchObject({
      code: "PROVIDER_RESPONSE_TOO_LARGE",
    });

    const streamed = clientWithTransport(
      async () => new Response("x".repeat(20)),
      { responseLimitBytes: 10 },
    );
    await expect(streamed.getLeague()).rejects.toMatchObject({
      code: "PROVIDER_RESPONSE_TOO_LARGE",
    });
  });

  it("times out and bounds transport retries", async () => {
    const observed: { signal?: AbortSignal } = {};
    const transport = vi.fn<ApiFootballTransport>(async ({ init }) => {
      observed.signal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        observed.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });
    const client = clientWithTransport(transport, {
      timeoutMs: 2,
      totalBudgetMs: 20,
      maxAttempts: 1,
    });

    await expect(client.getLeague()).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(observed.signal?.aborted).toBe(true);
  });

  it("does not retry 403 and never includes the key in the error", async () => {
    const transport = vi.fn<ApiFootballTransport>(async () =>
      jsonResponse({ private: "recorded-test-key" }, { status: 403 }),
    );
    let caught: unknown;
    try {
      await clientWithTransport(transport).getLeague();
    } catch (error) {
      caught = error;
    }
    expect(transport).toHaveBeenCalledTimes(1);
    expect(caught).toMatchObject({ code: "PROVIDER_AUTH_FAILED" });
    expect(String(caught)).not.toContain("recorded-test-key");
  });

  it("cancels an unconsumed non-retryable response body", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });

    await expect(
      clientWithTransport(async () => new Response(body, { status: 400 }))
        .getLeague(),
    ).rejects.toMatchObject({ code: "PROVIDER_BAD_RESPONSE" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([429, 499, 500, 503])(
    "retries retryable HTTP %s with bounded backoff",
    async (status) => {
      const sleeps: number[] = [];
      let attempts = 0;
      const client = clientWithTransport(
        async () => {
          attempts += 1;
          return attempts < 3
            ? jsonResponse({}, {
                status,
                headers: status === 429 ? { "Retry-After": "1" } : {},
              })
            : jsonResponse(leagueEnvelope);
        },
        {
          sleep: async (milliseconds) => {
            sleeps.push(milliseconds);
          },
          maxAttempts: 3,
        },
      );

      await expect(client.getLeague()).resolves.toMatchObject({ data: { length: 1 } });
      expect(attempts).toBe(3);
      expect(sleeps).toHaveLength(2);
      if (status === 429) expect(sleeps).toEqual([1000, 1000]);
    },
  );

  it("returns a bounded Retry-After when the final 429 attempt is exhausted", async () => {
    const client = clientWithTransport(
      async () =>
        jsonResponse({}, { status: 429, headers: { "Retry-After": "45" } }),
      { maxAttempts: 1 },
    );

    await expect(client.getLeague()).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      retryAfterSeconds: 30,
    });
  });

  it("validates targeted IDs and caps a request at 20", async () => {
    const client = clientWithTransport(async () => jsonResponse(fixturesEnvelope));
    await expect(client.getFixturesByIds([])).rejects.toMatchObject({
      code: "PROVIDER_CONTRACT_ERROR",
    });
    await expect(
      client.getFixturesByIds(Array.from({ length: 21 }, (_, index) => String(index + 1))),
    ).rejects.toMatchObject({ code: "PROVIDER_CONTRACT_ERROR" });
    await expect(client.getFixturesByIds(["1", "1"])).rejects.toMatchObject({
      code: "PROVIDER_CONTRACT_ERROR",
    });
  });
});
