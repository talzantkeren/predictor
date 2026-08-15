import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  INVITE_ACCESS_COOKIE,
  MAX_INVITE_EXCHANGE_BODY_BYTES,
} from "@/features/membership/invite-access";

const publicId = "26000000-0000-4000-8000-000000000031";
const otherPublicId = "26000000-0000-4000-8000-000000000032";
const tokenHash =
  "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a";
const rawToken = "A".repeat(43);

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  resolveInvite: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/features/membership/queries", () => ({
  resolveInvite: mocks.resolveInvite,
}));

import { POST } from "@/app/api/invites/[publicId]/exchange/route";

function routeContext(value = publicId) {
  return { params: Promise.resolve({ publicId: value }) };
}

function exchangeRequest(
  body: unknown,
  options: {
    contentType?: string;
    origin?: string | null;
  } = {},
) {
  const headers = new Headers();
  if (options.origin !== null) {
    headers.set("Origin", options.origin ?? "http://localhost:3000");
  }
  headers.set("Content-Type", options.contentType ?? "application/json");

  return new Request(
    `http://localhost:3000/api/invites/${publicId}/exchange`,
    {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}

async function responseCode(response: Response) {
  const body = (await response.json()) as { error?: { code?: unknown } };
  return body.error?.code;
}

describe("POST /api/invites/[publicId]/exchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ kind: "user-scoped-client" });
    mocks.resolveInvite.mockResolvedValue({
      status: "found",
      data: { viewerState: "guest" },
    });
  });

  it("exchanges only a public ID plus digest for a short-lived path cookie", async () => {
    const response = await POST(
      exchangeRequest({ tokenHash }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ data: { exchanged: true } });
    expect(mocks.resolveInvite).toHaveBeenCalledWith(
      { kind: "user-scoped-client" },
      publicId,
      tokenHash,
    );

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${INVITE_ACCESS_COOKIE}=${publicId}.${tokenHash}`);
    expect(setCookie).toContain(`Path=/invite/${publicId}`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Max-Age=1800");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(JSON.stringify(payload)).not.toContain(tokenHash);
    expect(JSON.stringify(mocks.resolveInvite.mock.calls)).not.toContain(
      rawToken,
    );
  });

  it("returns one opaque denial and clears a stale cookie for a wrong pair", async () => {
    mocks.resolveInvite.mockResolvedValue({ status: "unavailable" });

    const response = await POST(
      exchangeRequest({ tokenHash }),
      routeContext(otherPublicId),
    );

    expect(response.status).toBe(404);
    expect(await responseCode(response)).toBe("INVITE_UNAVAILABLE");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${INVITE_ACCESS_COOKIE}=`);
    expect(setCookie).toContain(`Path=/invite/${otherPublicId}`);
    expect(setCookie).toContain("Max-Age=0");
  });

  it.each([
    ["missing Origin", { origin: null }],
    ["hostile Origin", { origin: "https://attacker.example" }],
  ])("rejects %s before session or RPC work", async (_label, options) => {
    const response = await POST(
      exchangeRequest({ tokenHash }, options),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.resolveInvite).not.toHaveBeenCalled();
  });

  it("accepts the exact configured preview Origin", async () => {
    const previous = process.env.VERCEL_BRANCH_URL;
    process.env.VERCEL_BRANCH_URL = "slice-three.example.vercel.app";

    try {
      const response = await POST(
        exchangeRequest(
          { tokenHash },
          { origin: "https://slice-three.example.vercel.app" },
        ),
        routeContext(),
      );
      expect(response.status).toBe(200);
    } finally {
      process.env.VERCEL_BRANCH_URL = previous;
    }
  });

  it.each([
    ["raw bearer instead of digest", { tokenHash: rawToken }],
    ["uppercase digest", { tokenHash: tokenHash.toUpperCase() }],
    ["extra field", { tokenHash, rawToken }],
    ["missing field", {}],
  ])("rejects a malformed JSON contract: %s", async (_label, body) => {
    const response = await POST(exchangeRequest(body), routeContext());

    expect(response.status).toBe(404);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.resolveInvite).not.toHaveBeenCalled();
  });

  it("rejects malformed IDs, media types, and bodies over the fixed cap", async () => {
    const malformedId = await POST(
      exchangeRequest({ tokenHash }),
      routeContext("not-a-uuid"),
    );
    expect(malformedId.status).toBe(404);

    const wrongMedia = await POST(
      exchangeRequest({ tokenHash }, { contentType: "text/plain" }),
      routeContext(),
    );
    expect(wrongMedia.status).toBe(404);

    const oversized = await POST(
      exchangeRequest("x".repeat(MAX_INVITE_EXCHANGE_BODY_BYTES + 1)),
      routeContext(),
    );
    expect(oversized.status).toBe(404);
    expect(mocks.resolveInvite).not.toHaveBeenCalled();
  });

  it("fails closed without exposing a resolver failure", async () => {
    mocks.resolveInvite.mockResolvedValue({ status: "error" });

    const response = await POST(
      exchangeRequest({ tokenHash }),
      routeContext(),
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("INVITE_UNAVAILABLE");
    expect(body).not.toContain("database");
  });
});
