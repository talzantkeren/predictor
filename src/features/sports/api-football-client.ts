import "server-only";

import { z } from "zod";

export const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
export const API_FOOTBALL_RESPONSE_LIMIT_BYTES = 8 * 1024 * 1024;
export const API_FOOTBALL_MAX_FIXTURE_IDS = 20;

const errorEnvelopeSchema = z.union([
  z.array(z.unknown()),
  z.record(z.unknown()),
]);

const pagingSchema = z.object({
  current: z.number().int().positive(),
  total: z.number().int().positive(),
});

const coverageSchema = z.object({
  fixtures: z.object({
    events: z.boolean(),
    lineups: z.boolean(),
    statistics_fixtures: z.boolean(),
    statistics_players: z.boolean(),
  }),
  standings: z.boolean(),
  players: z.boolean(),
  injuries: z.boolean(),
  predictions: z.boolean(),
  odds: z.boolean(),
});

export const apiFootballLeagueSchema = z.object({
  league: z.object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).max(100),
    type: z.string().trim().min(1).max(30),
  }),
  country: z.object({
    name: z.string().trim().min(1).max(100),
    code: z.string().regex(/^[A-Z]{2}$/),
  }),
  seasons: z.array(
    z.object({
      year: z.number().int().min(2000).max(2100),
      start: z.string().date(),
      end: z.string().date(),
      current: z.boolean(),
      coverage: coverageSchema,
    }),
  ),
});

export const apiFootballTeamSchema = z.object({
  team: z.object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).max(100),
    code: z.string().trim().min(1).max(10).nullable(),
    country: z.string().trim().min(1).max(100),
  }),
  venue: z
    .object({
      id: z.number().int().positive().nullable(),
      name: z.string().trim().min(1).max(150).nullable(),
      city: z.string().trim().min(1).max(100).nullable(),
    })
    .nullable(),
});

const scorePairSchema = z.object({
  home: z.number().int().nonnegative().nullable(),
  away: z.number().int().nonnegative().nullable(),
});

const fixtureTeamSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(100),
  winner: z.boolean().nullable(),
});

export const apiFootballFixtureSchema = z.object({
  fixture: z.object({
    id: z.number().int().positive(),
    referee: z.string().trim().min(1).max(150).nullable(),
    timezone: z.literal("UTC"),
    date: z.string().datetime({ offset: true }),
    timestamp: z.number().int().positive(),
    periods: z.object({
      first: z.number().int().positive().nullable(),
      second: z.number().int().positive().nullable(),
    }),
    venue: z.object({
      id: z.number().int().positive().nullable(),
      name: z.string().trim().min(1).max(150).nullable(),
      city: z.string().trim().min(1).max(100).nullable(),
    }),
    status: z.object({
      long: z.string().trim().min(1).max(100),
      short: z.string().trim().min(1).max(10),
      elapsed: z.number().int().nonnegative().nullable(),
    }),
  }),
  league: z.object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).max(100),
    country: z.string().trim().min(1).max(100),
    season: z.number().int().min(2000).max(2100),
    round: z.string().trim().min(1).max(100),
  }),
  teams: z.object({ home: fixtureTeamSchema, away: fixtureTeamSchema }),
  goals: scorePairSchema,
  score: z.object({
    halftime: scorePairSchema,
    fulltime: scorePairSchema,
    extratime: scorePairSchema,
    penalty: scorePairSchema,
  }),
});

const roundSchema = z.union([
  z.string().trim().min(1).max(100),
  z.object({
    round: z.string().trim().min(1).max(100),
    dates: z.array(z.string().date()).max(100),
  }),
]);

export type ApiFootballLeague = z.infer<typeof apiFootballLeagueSchema>;
export type ApiFootballTeam = z.infer<typeof apiFootballTeamSchema>;
export type ApiFootballFixture = z.infer<typeof apiFootballFixtureSchema>;

export interface ApiFootballQuota {
  dailyLimit: number | null;
  dailyRemaining: number | null;
  minuteLimit: number | null;
  minuteRemaining: number | null;
}

export interface ApiFootballTransportRequest {
  url: string;
  init: RequestInit;
}

export type ApiFootballTransport = (
  request: ApiFootballTransportRequest,
) => Promise<Response>;

export type ApiFootballClientErrorCode =
  | "PROVIDER_ABORTED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_BAD_RESPONSE"
  | "PROVIDER_CONTRACT_ERROR"
  | "PROVIDER_PAGING_UNSUPPORTED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_RESPONSE_TOO_LARGE"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE";

const safeErrorMessages: Record<ApiFootballClientErrorCode, string> = {
  PROVIDER_ABORTED: "Sports provider request was aborted.",
  PROVIDER_AUTH_FAILED: "Sports provider authentication was rejected.",
  PROVIDER_BAD_RESPONSE: "Sports provider returned an invalid response.",
  PROVIDER_CONTRACT_ERROR: "Sports provider response failed validation.",
  PROVIDER_PAGING_UNSUPPORTED: "Sports provider returned an unsupported page count.",
  PROVIDER_RATE_LIMITED: "Sports provider rate limit was reached.",
  PROVIDER_RESPONSE_TOO_LARGE: "Sports provider response exceeded the safe limit.",
  PROVIDER_TIMEOUT: "Sports provider request timed out.",
  PROVIDER_UNAVAILABLE: "Sports provider is temporarily unavailable.",
};

export class ApiFootballClientError extends Error {
  readonly code: ApiFootballClientErrorCode;
  readonly retryAfterSeconds: number | null;

  constructor(
    code: ApiFootballClientErrorCode,
    options: { retryAfterSeconds?: number | null } = {},
  ) {
    super(safeErrorMessages[code]);
    this.name = "ApiFootballClientError";
    this.code = code;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

interface ApiFootballClientOptions {
  apiKey: string;
  transport?: ApiFootballTransport;
  timeoutMs?: number;
  totalBudgetMs?: number;
  maxAttempts?: number;
  responseLimitBytes?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

type AllowedPath = "/leagues" | "/teams" | "/fixtures/rounds" | "/fixtures";

function parseHeaderInteger(headers: Headers, name: string) {
  const raw = headers.get(name);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function quotaFromHeaders(headers: Headers): ApiFootballQuota {
  return {
    dailyLimit: parseHeaderInteger(headers, "x-ratelimit-requests-limit"),
    dailyRemaining: parseHeaderInteger(
      headers,
      "x-ratelimit-requests-remaining",
    ),
    minuteLimit: parseHeaderInteger(headers, "x-ratelimit-limit"),
    minuteRemaining: parseHeaderInteger(headers, "x-ratelimit-remaining"),
  };
}

function retryAfterSeconds(headers: Headers, now: number) {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Math.min(Number(raw), 30);
  const date = Date.parse(raw);
  if (!Number.isFinite(date)) return null;
  return Math.min(30, Math.max(0, Math.ceil((date - now) / 1_000)));
}

async function readBoundedText(response: Response, limit: number) {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > limit) {
    throw new ApiFootballClientError("PROVIDER_RESPONSE_TOO_LARGE");
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new ApiFootballClientError("PROVIDER_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

function hasProviderErrors(errors: z.infer<typeof errorEnvelopeSchema>) {
  return Array.isArray(errors)
    ? errors.length > 0
    : Object.keys(errors).length > 0;
}

function assertUnique<T>(items: readonly T[], identity: (item: T) => string) {
  const seen = new Set<string>();
  for (const item of items) {
    const id = identity(item);
    if (seen.has(id)) {
      throw new ApiFootballClientError("PROVIDER_CONTRACT_ERROR");
    }
    seen.add(id);
  }
}

export class ApiFootballClient {
  private readonly apiKey: string;
  private readonly transport: ApiFootballTransport;
  private readonly timeoutMs: number;
  private readonly totalBudgetMs: number;
  private readonly maxAttempts: number;
  private readonly responseLimitBytes: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(options: ApiFootballClientOptions) {
    if (!options.apiKey.trim()) {
      throw new ApiFootballClientError("PROVIDER_AUTH_FAILED");
    }
    this.apiKey = options.apiKey;
    this.transport =
      options.transport ?? ((request) => fetch(request.url, request.init));
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.totalBudgetMs = options.totalBudgetMs ?? 30_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.responseLimitBytes =
      options.responseLimitBytes ?? API_FOOTBALL_RESPONSE_LIMIT_BYTES;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  private async request<T>(
    path: AllowedPath,
    parameters: Readonly<Record<string, string>>,
    responseSchema: z.ZodType<T>,
  ): Promise<{ data: T[]; quota: ApiFootballQuota }> {
    const url = new URL(path, API_FOOTBALL_BASE_URL);
    for (const [name, value] of Object.entries(parameters)) {
      url.searchParams.set(name, value);
    }

    const startedAt = this.now();
    let lastRetryAfter: number | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const elapsed = this.now() - startedAt;
      if (elapsed >= this.totalBudgetMs) {
        throw new ApiFootballClientError("PROVIDER_TIMEOUT");
      }

      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let response: Response;
      try {
        response = await Promise.race([
          this.transport({
            url: url.toString(),
            init: {
              method: "GET",
              headers: { "x-apisports-key": this.apiKey },
              signal: controller.signal,
            },
          }),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              controller.abort();
              reject(new ApiFootballClientError("PROVIDER_TIMEOUT"));
            }, Math.min(this.timeoutMs, this.totalBudgetMs - elapsed));
          }),
        ]);
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        const classified =
          error instanceof ApiFootballClientError
            ? error
            : controller.signal.aborted
              ? new ApiFootballClientError("PROVIDER_ABORTED")
              : new ApiFootballClientError("PROVIDER_UNAVAILABLE");
        if (attempt >= this.maxAttempts) throw classified;
        await this.waitBeforeRetry(attempt, null, startedAt);
        continue;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }

      const quota = quotaFromHeaders(response.headers);
      lastRetryAfter = retryAfterSeconds(response.headers, this.now());
      const retryableStatus =
        response.status === 429 ||
        response.status === 499 ||
        response.status >= 500;

      if (!response.ok) {
        if (response.status === 403) {
          throw new ApiFootballClientError("PROVIDER_AUTH_FAILED");
        }
        if (retryableStatus && attempt < this.maxAttempts) {
          await response.body?.cancel();
          await this.waitBeforeRetry(attempt, lastRetryAfter, startedAt);
          continue;
        }
        throw new ApiFootballClientError(
          response.status === 429
            ? "PROVIDER_RATE_LIMITED"
            : retryableStatus
              ? "PROVIDER_UNAVAILABLE"
              : "PROVIDER_BAD_RESPONSE",
          { retryAfterSeconds: lastRetryAfter },
        );
      }

      let unknownPayload: unknown;
      try {
        unknownPayload = JSON.parse(
          await readBoundedText(response, this.responseLimitBytes),
        ) as unknown;
      } catch (error) {
        if (error instanceof ApiFootballClientError) throw error;
        throw new ApiFootballClientError("PROVIDER_BAD_RESPONSE");
      }

      const envelope = z
        .object({
          get: z.string().min(1),
          parameters: z.unknown(),
          errors: errorEnvelopeSchema,
          results: z.number().int().nonnegative(),
          paging: pagingSchema,
          response: z.array(responseSchema),
        })
        .safeParse(unknownPayload);
      if (!envelope.success) {
        throw new ApiFootballClientError("PROVIDER_CONTRACT_ERROR");
      }
      if (hasProviderErrors(envelope.data.errors)) {
        throw new ApiFootballClientError("PROVIDER_BAD_RESPONSE");
      }
      if (envelope.data.paging.total !== 1 || envelope.data.paging.current !== 1) {
        throw new ApiFootballClientError("PROVIDER_PAGING_UNSUPPORTED");
      }
      if (envelope.data.results !== envelope.data.response.length) {
        throw new ApiFootballClientError("PROVIDER_CONTRACT_ERROR");
      }

      return { data: envelope.data.response, quota };
    }

    throw new ApiFootballClientError("PROVIDER_UNAVAILABLE", {
      retryAfterSeconds: lastRetryAfter,
    });
  }

  private async waitBeforeRetry(
    attempt: number,
    retryAfter: number | null,
    startedAt: number,
  ) {
    const exponential = 250 * 2 ** (attempt - 1);
    const jitter = Math.floor(this.random() * 100);
    const requested = retryAfter === null ? exponential + jitter : retryAfter * 1_000;
    const remaining = this.totalBudgetMs - (this.now() - startedAt);
    if (remaining <= 0 || requested >= remaining) {
      throw new ApiFootballClientError("PROVIDER_TIMEOUT");
    }
    await this.sleep(requested);
  }

  async getLeague() {
    const result = await this.request(
      "/leagues",
      { id: "383", season: "2026" },
      apiFootballLeagueSchema,
    );
    assertUnique(result.data, (item) => String(item.league.id));
    return result;
  }

  async getTeams() {
    const result = await this.request(
      "/teams",
      { league: "383", season: "2026" },
      apiFootballTeamSchema,
    );
    assertUnique(result.data, (item) => String(item.team.id));
    return result;
  }

  async getRounds() {
    const result = await this.request(
      "/fixtures/rounds",
      { league: "383", season: "2026", dates: "true" },
      roundSchema,
    );
    const labels = result.data.map((item) =>
      typeof item === "string" ? item : item.round,
    );
    assertUnique(labels, (item) => item);
    return { data: labels, quota: result.quota };
  }

  async getSeasonFixtures() {
    const result = await this.request(
      "/fixtures",
      { league: "383", season: "2026", timezone: "UTC" },
      apiFootballFixtureSchema,
    );
    assertUnique(result.data, (item) => String(item.fixture.id));
    return result;
  }

  async getFixturesByIds(fixtureIds: readonly string[]) {
    if (
      fixtureIds.length < 1 ||
      fixtureIds.length > API_FOOTBALL_MAX_FIXTURE_IDS ||
      fixtureIds.some((id) => !/^[1-9]\d*$/.test(id)) ||
      new Set(fixtureIds).size !== fixtureIds.length
    ) {
      throw new ApiFootballClientError("PROVIDER_CONTRACT_ERROR");
    }
    const result = await this.request(
      "/fixtures",
      { ids: fixtureIds.join("-"), timezone: "UTC" },
      apiFootballFixtureSchema,
    );
    assertUnique(result.data, (item) => String(item.fixture.id));
    return result;
  }
}
