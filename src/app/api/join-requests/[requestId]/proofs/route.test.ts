import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_PROOF_FILE_BYTES,
  MAX_PROOF_REQUEST_BYTES,
} from "@/features/files/constants";
import {
  mapProofDatabaseError,
  ProofError,
} from "@/features/files/errors";

const requestId = "22222222-2222-4222-8222-222222222222";
const leagueId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "44444444-4444-4444-8444-444444444444";
const existingProofId = "66666666-6666-4666-8666-666666666666";

const mocks = vi.hoisted(() => ({
  user: { id: "55555555-5555-4555-8555-555555555555" } as
    | { id: string }
    | null,
  userError: null as unknown,
  demoMode: true,
  getUser: vi.fn(),
  getJoinRequestUploadContext: vi.fn(),
  consumeProofUploadAttempt: vi.fn(),
  finalizePaymentProof: vi.fn(),
  uploadPrivateProof: vi.fn(),
  removePrivateProof: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    SPORTS_API_PROVIDER: "manual",
    DEMO_MODE: mocks.demoMode,
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: mocks.getUser,
    },
  }),
}));

vi.mock("@/features/files/private-proof-storage", () => ({
  uploadPrivateProof: mocks.uploadPrivateProof,
  removePrivateProof: mocks.removePrivateProof,
}));

vi.mock("@/features/files/rpc", () => ({
  getJoinRequestUploadContext: mocks.getJoinRequestUploadContext,
  consumeProofUploadAttempt: mocks.consumeProofUploadAttempt,
  finalizePaymentProof: mocks.finalizePaymentProof,
}));

import { POST } from "@/app/api/join-requests/[requestId]/proofs/route";

type FilePart = {
  bytes: Buffer;
  filename: string;
  mimeType: string;
};

function routeContext(value = requestId) {
  return { params: Promise.resolve({ requestId: value }) };
}

function multipartRequest(
  files: FilePart[],
  options: {
    origin?: string | null;
    idempotencyKeys?: string[];
    extraField?: boolean;
  } = {},
) {
  const form = new FormData();

  for (const file of files) {
    const fileBytes = new ArrayBuffer(file.bytes.byteLength);
    new Uint8Array(fileBytes).set(file.bytes);
    form.append(
      "proof",
      new File([fileBytes], file.filename, { type: file.mimeType }),
    );
  }

  for (const key of options.idempotencyKeys ?? [idempotencyKey]) {
    form.append("idempotencyKey", key);
  }

  if (options.extraField) {
    form.append("storagePath", "attacker-controlled");
  }

  const headers = new Headers();
  if (options.origin !== null) {
    headers.set("Origin", options.origin ?? "http://localhost:3000");
  }

  return new Request(`http://localhost:3000/api/join-requests/${requestId}/proofs`, {
    method: "POST",
    headers,
    body: form,
  });
}

async function syntheticImage(
  format: "jpeg" | "png" | "webp",
  width = 64,
  height = 32,
) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 25, g: 100, b: 190 },
    },
  })[format]().toBuffer();
}

async function responseCode(response: Response) {
  const payload = (await response.json()) as { code?: unknown };
  return payload.code;
}

describe("POST /api/join-requests/[requestId]/proofs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "55555555-5555-4555-8555-555555555555" };
    mocks.userError = null;
    mocks.demoMode = true;
    mocks.getUser.mockImplementation(async () => ({
      data: { user: mocks.user },
      error: mocks.userError,
    }));
    mocks.getJoinRequestUploadContext.mockResolvedValue({
      requestId,
      leagueId,
      status: "pending_proof",
    });
    mocks.consumeProofUploadAttempt.mockResolvedValue({ allowed: true });
    mocks.uploadPrivateProof.mockResolvedValue(undefined);
    mocks.removePrivateProof.mockResolvedValue(undefined);
    mocks.finalizePaymentProof.mockImplementation(
      async (_client: unknown, input: { requestId: string; proofId: string }) => ({
        proofId: input.proofId,
        requestId: input.requestId,
        status: "pending_approval",
        replayed: false,
      }),
    );
  });

  it("blocks uploads outside Demo mode before session or private work", async () => {
    mocks.demoMode = false;

    const response = await POST(
      multipartRequest([
        {
          bytes: await syntheticImage("png"),
          filename: "proof.png",
          mimeType: "image/png",
        },
      ]),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(await responseCode(response)).toBe("DEMO_MODE_REQUIRED");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.getJoinRequestUploadContext).not.toHaveBeenCalled();
    expect(mocks.consumeProofUploadAttempt).not.toHaveBeenCalled();
    expect(mocks.uploadPrivateProof).not.toHaveBeenCalled();
    expect(mocks.removePrivateProof).not.toHaveBeenCalled();
    expect(mocks.finalizePaymentProof).not.toHaveBeenCalled();
  });

  it.each([
    ["jpeg", "synthetic.jpg", "image/jpeg"],
    ["png", "synthetic.png", "image/png"],
    ["webp", "synthetic.webp", "image/webp"],
  ] as const)("dispatches a valid %s through sanitization and finalization", async (
    format,
    filename,
    mimeType,
  ) => {
    const response = await POST(
      multipartRequest([
        { bytes: await syntheticImage(format), filename, mimeType },
      ]),
      routeContext(),
    );

    expect(response.status).toBe(201);
    expect(mocks.uploadPrivateProof).toHaveBeenCalledOnce();
    const uploadedImage = mocks.uploadPrivateProof.mock.calls[0]?.[1] as {
      bytes: Buffer;
      mimeType: string;
      sha256: string;
    };
    expect(uploadedImage.mimeType).toBe("image/webp");
    expect((await sharp(uploadedImage.bytes).metadata()).format).toBe("webp");
    expect(uploadedImage.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(mocks.finalizePaymentProof).toHaveBeenCalledOnce();
    const payload = await response.json();
    expect(payload).toEqual({
      data: {
        proofId: expect.any(String),
        requestId,
        status: "pending_approval",
        replayed: false,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("storage_path");
    expect(JSON.stringify(payload)).not.toContain("signedUrl");
  });

  it("dispatches a pending-approval replacement through upload and finalization", async () => {
    mocks.getJoinRequestUploadContext.mockResolvedValue({
      requestId,
      leagueId,
      status: "pending_approval",
    });

    const response = await POST(
      multipartRequest([
        {
          bytes: await syntheticImage("png"),
          filename: "replacement.png",
          mimeType: "image/png",
        },
      ]),
      routeContext(),
    );

    expect(response.status).toBe(201);
    expect(mocks.uploadPrivateProof).toHaveBeenCalledOnce();
    expect(mocks.finalizePaymentProof).toHaveBeenCalledOnce();
  });

  it("returns 200 with the existing proof for an idempotent replay", async () => {
    mocks.finalizePaymentProof.mockImplementation(
      async (_client: unknown, input: { requestId: string }) => ({
        proofId: existingProofId,
        requestId: input.requestId,
        status: "pending_approval",
        replayed: true,
      }),
    );

    const response = await POST(
      multipartRequest([
        {
          bytes: await syntheticImage("png"),
          filename: "proof.png",
          mimeType: "image/png",
        },
      ]),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { proofId: existingProofId, replayed: true },
    });
    expect(mocks.removePrivateProof).toHaveBeenCalledOnce();
  });

  it.each([
    ["synthetic.png", "image/png", Buffer.from("<svg>synthetic</svg>")],
    ["synthetic.jpg", "image/jpeg", Buffer.from("<html>synthetic</html>")],
    ["synthetic.jpg", "image/jpeg", Buffer.from("%PDF-1.7 synthetic")],
    ["synthetic.png", "image/png", Buffer.from("MZ\u0000synthetic")],
  ])("rejects disguised content for %s", async (filename, mimeType, bytes) => {
    const response = await POST(
      multipartRequest([{ bytes, filename, mimeType }]),
      routeContext(),
    );

    expect(response.status).toBe(415);
    expect(await responseCode(response)).toBe("UNSUPPORTED_SIGNATURE");
    expect(mocks.uploadPrivateProof).not.toHaveBeenCalled();
  });

  it("rejects extension/MIME/signature mismatch and corrupt content", async () => {
    const jpeg = await syntheticImage("jpeg");
    const mismatch = await POST(
      multipartRequest([
        { bytes: jpeg, filename: "synthetic.png", mimeType: "image/jpeg" },
      ]),
      routeContext(),
    );
    expect(mismatch.status).toBe(415);
    expect(await responseCode(mismatch)).toBe("IMAGE_TYPE_MISMATCH");

    const corrupt = await POST(
      multipartRequest([
        {
          bytes: jpeg.subarray(0, Math.min(jpeg.byteLength, 24)),
          filename: "synthetic.jpg",
          mimeType: "image/jpeg",
        },
      ]),
      routeContext(),
    );
    expect(corrupt.status).toBe(400);
    expect(await responseCode(corrupt)).toBe("CORRUPT_IMAGE");
  });

  it("rejects empty, oversized, duplicate, and unexpected multipart fields", async () => {
    const empty = await POST(
      multipartRequest([
        { bytes: Buffer.alloc(0), filename: "empty.png", mimeType: "image/png" },
      ]),
      routeContext(),
    );
    expect(await responseCode(empty)).toBe("EMPTY_FILE");

    const oversized = await POST(
      multipartRequest([
        {
          bytes: Buffer.alloc(MAX_PROOF_FILE_BYTES + 1),
          filename: "large.png",
          mimeType: "image/png",
        },
      ]),
      routeContext(),
    );
    expect(await responseCode(oversized)).toBe("FILE_TOO_LARGE");

    const png = await syntheticImage("png");
    const duplicate = await POST(
      multipartRequest([
        { bytes: png, filename: "one.png", mimeType: "image/png" },
        { bytes: png, filename: "two.png", mimeType: "image/png" },
      ]),
      routeContext(),
    );
    expect(await responseCode(duplicate)).toBe("DUPLICATE_FILE");

    const duplicateKey = await POST(
      multipartRequest(
        [{ bytes: png, filename: "one.png", mimeType: "image/png" }],
        { idempotencyKeys: [idempotencyKey, idempotencyKey] },
      ),
      routeContext(),
    );
    expect(await responseCode(duplicateKey)).toBe(
      "DUPLICATE_IDEMPOTENCY_KEY",
    );

    const unexpected = await POST(
      multipartRequest(
        [{ bytes: png, filename: "one.png", mimeType: "image/png" }],
        { extraField: true },
      ),
      routeContext(),
    );
    expect(await responseCode(unexpected)).toBe("UNEXPECTED_FORM_FIELD");
  });

  it("returns rate-limit metadata before reading or dispatching the upload", async () => {
    mocks.consumeProofUploadAttempt.mockRejectedValue(
      new ProofError("RATE_LIMITED", 429, { retryAfterSeconds: 37 }),
    );
    const malformedUnreadRequest = new Request(
      `http://localhost:3000/api/join-requests/${requestId}/proofs`,
      {
        method: "POST",
        headers: { Origin: "http://localhost:3000" },
      },
    );

    const response = await POST(malformedUnreadRequest, routeContext());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("37");
    expect(await responseCode(response)).toBe("RATE_LIMITED");
    expect(mocks.consumeProofUploadAttempt).toHaveBeenCalledOnce();
    expect(mocks.uploadPrivateProof).not.toHaveBeenCalled();
    expect(mocks.finalizePaymentProof).not.toHaveBeenCalled();
  });

  it("rejects a streamed request one byte over the hard request limit after quota", async () => {
    const request = new Request(
      `http://localhost:3000/api/join-requests/${requestId}/proofs`,
      {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "multipart/form-data; boundary=synthetic",
        },
        body: Buffer.alloc(MAX_PROOF_REQUEST_BYTES + 1),
      },
    );
    const response = await POST(request, routeContext());

    expect(response.status).toBe(413);
    expect(await responseCode(response)).toBe("REQUEST_TOO_LARGE");
    expect(mocks.consumeProofUploadAttempt).toHaveBeenCalledOnce();
    expect(mocks.uploadPrivateProof).not.toHaveBeenCalled();
  });

  it("rejects extreme-pixel and animated inputs through the handler", async () => {
    const extreme = await POST(
      multipartRequest([
        {
          bytes: await syntheticImage("png", 5_000, 4_001),
          filename: "extreme.png",
          mimeType: "image/png",
        },
      ]),
      routeContext(),
    );
    expect(extreme.status).toBe(413);
    expect(await responseCode(extreme)).toBe("IMAGE_PIXEL_LIMIT_EXCEEDED");

    const gif = Buffer.from(
      "47494638396101000100800000000000ffffff21f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b",
      "hex",
    );
    const animatedWebp = await sharp(gif, { animated: true })
      .webp({ delay: [100, 100], loop: 0 })
      .toBuffer();
    const animated = await POST(
      multipartRequest([
        {
          bytes: animatedWebp,
          filename: "animated.webp",
          mimeType: "image/webp",
        },
      ]),
      routeContext(),
    );
    expect(animated.status).toBe(415);
    expect(await responseCode(animated)).toBe("ANIMATED_IMAGE_NOT_ALLOWED");
  });

  it("fails before parsing for missing session, malformed UUID, and hostile Origin", async () => {
    const png = await syntheticImage("png");
    const part = { bytes: png, filename: "proof.png", mimeType: "image/png" };

    mocks.user = null;
    const unauthenticated = await POST(multipartRequest([part]), routeContext());
    expect(unauthenticated.status).toBe(401);

    mocks.user = { id: "55555555-5555-4555-8555-555555555555" };
    const malformed = await POST(multipartRequest([part]), routeContext("bad"));
    expect(malformed.status).toBe(400);

    const hostile = await POST(
      multipartRequest([part], { origin: "https://attacker.example" }),
      routeContext(),
    );
    expect(hostile.status).toBe(403);
    expect(mocks.uploadPrivateProof).not.toHaveBeenCalled();
  });

  it.each(["approved", "rejected"])(
    "returns 409 before quota or upload for a request in %s state",
    async () => {
      mocks.getJoinRequestUploadContext.mockRejectedValue(
        new ProofError("REQUEST_NOT_UPLOADABLE", 409),
      );
      const response = await POST(
        multipartRequest([
          {
            bytes: await syntheticImage("png"),
            filename: "proof.png",
            mimeType: "image/png",
          },
        ]),
        routeContext(),
      );

      expect(response.status).toBe(409);
      expect(await responseCode(response)).toBe("REQUEST_NOT_UPLOADABLE");
      expect(mocks.consumeProofUploadAttempt).not.toHaveBeenCalled();
      expect(mocks.uploadPrivateProof).not.toHaveBeenCalled();
      expect(mocks.finalizePaymentProof).not.toHaveBeenCalled();
    },
  );

  it.each(["foreign requester", "league manager"])(
    "returns opaque 404 before quota or upload for a %s",
    async () => {
      mocks.getJoinRequestUploadContext.mockRejectedValue(
        new ProofError("RESOURCE_UNAVAILABLE", 404),
      );
      const response = await POST(
        multipartRequest([
          {
            bytes: await syntheticImage("png"),
            filename: "proof.png",
            mimeType: "image/png",
          },
        ]),
        routeContext(),
      );

      expect(response.status).toBe(404);
      expect(await responseCode(response)).toBe("RESOURCE_UNAVAILABLE");
      expect(mocks.consumeProofUploadAttempt).not.toHaveBeenCalled();
      expect(mocks.uploadPrivateProof).not.toHaveBeenCalled();
      expect(mocks.finalizePaymentProof).not.toHaveBeenCalled();
    },
  );

  it("signals and retains an ambiguous upload that commits then throws", async () => {
    let objectCommitted = false;
    mocks.uploadPrivateProof.mockImplementation(async () => {
      objectCommitted = true;
      throw new Error("private storage detail");
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const response = await POST(
      multipartRequest([
        {
          bytes: await syntheticImage("png"),
          filename: "proof.png",
          mimeType: "image/png",
        },
      ]),
      routeContext(),
    );

    expect(response.status).toBe(503);
    expect(await responseCode(response)).toBe("STORAGE_UNAVAILABLE");
    expect(objectCommitted).toBe(true);
    expect(mocks.finalizePaymentProof).not.toHaveBeenCalled();
    expect(mocks.removePrivateProof).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      JSON.stringify({
        event: "proof_upload_compensation_failed",
        recovery: "private_orphan_reconciliation",
      }),
    );
    consoleError.mockRestore();
  });

  it("deletes the uploaded object when database finalization fails", async () => {
    mocks.finalizePaymentProof.mockRejectedValue(
      new ProofError("IDEMPOTENCY_CONFLICT", 409, {
        definitiveDatabaseRejection: true,
      }),
    );
    const response = await POST(
      multipartRequest([
        {
          bytes: await syntheticImage("png"),
          filename: "proof.png",
          mimeType: "image/png",
        },
      ]),
      routeContext(),
    );

    expect(response.status).toBe(409);
    expect(mocks.removePrivateProof).toHaveBeenCalledOnce();
  });

  it("compensates an upload when league completion wins before finalization", async () => {
    mocks.finalizePaymentProof.mockRejectedValue(
      mapProofDatabaseError({
        code: "P0001",
        message: "REQUEST_NOT_UPLOADABLE",
      }),
    );

    const response = await POST(
      multipartRequest([
        {
          bytes: await syntheticImage("png"),
          filename: "proof.png",
          mimeType: "image/png",
        },
      ]),
      routeContext(),
    );

    expect(response.status).toBe(409);
    expect(await responseCode(response)).toBe("REQUEST_NOT_UPLOADABLE");
    expect(mocks.uploadPrivateProof).toHaveBeenCalledOnce();
    expect(mocks.finalizePaymentProof).toHaveBeenCalledOnce();
    expect(mocks.removePrivateProof).toHaveBeenCalledOnce();
  });

  it("emits only the sanitized recovery event when compensation also fails", async () => {
    mocks.finalizePaymentProof.mockRejectedValue(
      mapProofDatabaseError({
        code: "P0001",
        message: "PROOF_IDEMPOTENCY_CONFLICT",
      }),
    );
    mocks.removePrivateProof.mockRejectedValue(new Error("private object path"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(
      multipartRequest([
        {
          bytes: await syntheticImage("png"),
          filename: "proof.png",
          mimeType: "image/png",
        },
      ]),
      routeContext(),
    );

    expect(response.status).toBe(409);
    expect(mocks.finalizePaymentProof).toHaveBeenCalledOnce();
    expect(mocks.removePrivateProof).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      JSON.stringify({
        event: "proof_upload_compensation_failed",
        recovery: "private_orphan_reconciliation",
      }),
    );
    consoleError.mockRestore();
  });

  it("retries an ambiguous finalization once, retains the object, and emits reconciliation", async () => {
    mocks.finalizePaymentProof.mockRejectedValue(
      new ProofError("INTERNAL_ERROR", 500),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(
      multipartRequest([
        {
          bytes: await syntheticImage("png"),
          filename: "proof.png",
          mimeType: "image/png",
        },
      ]),
      routeContext(),
    );

    expect(response.status).toBe(500);
    expect(mocks.finalizePaymentProof).toHaveBeenCalledTimes(2);
    expect(mocks.finalizePaymentProof.mock.calls[0]?.[1]).toEqual(
      mocks.finalizePaymentProof.mock.calls[1]?.[1],
    );
    expect(mocks.removePrivateProof).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      JSON.stringify({
        event: "proof_upload_compensation_failed",
        recovery: "private_orphan_reconciliation",
      }),
    );
    consoleError.mockRestore();
  });
});
