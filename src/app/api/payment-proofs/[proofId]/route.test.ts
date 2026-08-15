import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProofError } from "@/features/files/errors";

const proofId = "33333333-3333-4333-8333-333333333333";
const requestId = "22222222-2222-4222-8222-222222222222";
const leagueId = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  user: { id: "55555555-5555-4555-8555-555555555555" } as
    | { id: string }
    | null,
  userError: null as unknown,
  demoMode: true,
  getUser: vi.fn(),
  authorizePaymentProof: vi.fn(),
  createPrivateProofSignedUrl: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({ DEMO_MODE: mocks.demoMode }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: mocks.getUser,
    },
  }),
}));

vi.mock("@/features/files/rpc", () => ({
  authorizePaymentProof: mocks.authorizePaymentProof,
}));

vi.mock("@/features/files/private-proof-storage", () => ({
  createPrivateProofSignedUrl: mocks.createPrivateProofSignedUrl,
}));

import { GET } from "@/app/api/payment-proofs/[proofId]/route";

function routeContext(value = proofId) {
  return { params: Promise.resolve({ proofId: value }) };
}

async function errorCode(response: Response) {
  const payload = (await response.json()) as { code?: unknown };
  return payload.code;
}

describe("GET /api/payment-proofs/[proofId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "55555555-5555-4555-8555-555555555555" };
    mocks.userError = null;
    mocks.demoMode = true;
    mocks.getUser.mockImplementation(async () => ({
      data: { user: mocks.user },
      error: mocks.userError,
    }));
    mocks.authorizePaymentProof.mockResolvedValue({
      proofId,
      requestId,
      leagueId,
    });
    mocks.createPrivateProofSignedUrl.mockResolvedValue(
      "https://storage.invalid/private-proof",
    );
  });

  it("blocks proof access outside Demo mode before session or private work", async () => {
    mocks.demoMode = false;

    const response = await GET(
      new Request(`http://localhost:3000/api/payment-proofs/${proofId}`),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("DEMO_MODE_REQUIRED");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.authorizePaymentProof).not.toHaveBeenCalled();
    expect(mocks.createPrivateProofSignedUrl).not.toHaveBeenCalled();
  });

  it.each(["uploader", "exact league manager"])(
    "redirects an authorized %s with private response headers",
    async () => {
      const response = await GET(
        new Request(`http://localhost:3000/api/payment-proofs/${proofId}`),
        routeContext(),
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "https://storage.invalid/private-proof",
      );
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("pragma")).toBe("no-cache");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(mocks.authorizePaymentProof).toHaveBeenCalledWith(
        expect.anything(),
        proofId,
      );
      expect(mocks.createPrivateProofSignedUrl).toHaveBeenCalledWith({
        proofId,
        requestId,
        leagueId,
      });
    },
  );

  it.each(["ordinary outsider", "other league manager"])(
    "returns the same opaque denial for an %s",
    async () => {
      mocks.authorizePaymentProof.mockRejectedValue(
        new ProofError("RESOURCE_UNAVAILABLE", 404),
      );
      const response = await GET(
        new Request(`http://localhost:3000/api/payment-proofs/${proofId}`),
        routeContext(),
      );

      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe("RESOURCE_UNAVAILABLE");
      expect(mocks.createPrivateProofSignedUrl).not.toHaveBeenCalled();
    },
  );

  it("rejects a missing session and malformed proof identifier before signing", async () => {
    mocks.user = null;
    const unauthenticated = await GET(
      new Request(`http://localhost:3000/api/payment-proofs/${proofId}`),
      routeContext(),
    );
    expect(unauthenticated.status).toBe(401);

    mocks.user = { id: "55555555-5555-4555-8555-555555555555" };
    const malformed = await GET(
      new Request("http://localhost:3000/api/payment-proofs/not-a-uuid"),
      routeContext("not-a-uuid"),
    );
    expect(malformed.status).toBe(400);
    expect(mocks.createPrivateProofSignedUrl).not.toHaveBeenCalled();
  });

  it("maps private Storage signing failure without exposing its details", async () => {
    mocks.createPrivateProofSignedUrl.mockRejectedValue(
      new ProofError("STORAGE_UNAVAILABLE", 503, {
        cause: new Error("private backend detail"),
      }),
    );
    const response = await GET(
      new Request(`http://localhost:3000/api/payment-proofs/${proofId}`),
      routeContext(),
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("STORAGE_UNAVAILABLE");
    expect(body).not.toContain("private backend detail");
  });
});
