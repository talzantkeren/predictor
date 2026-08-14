import { describe, expect, it, vi } from "vitest";

import {
  mapProofDatabaseError,
  mapProofStorageUploadError,
  ProofError,
} from "@/features/files/errors";
import { storeAndFinalizeProof } from "@/features/files/service";

const leagueId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const generatedProofId = "33333333-3333-4333-8333-333333333333";
const originalProofId = "44444444-4444-4444-8444-444444444444";
const idempotencyKey = "55555555-5555-4555-8555-555555555555";
const image = {
  bytes: Buffer.from("sanitized-webp"),
  mimeType: "image/webp" as const,
  sha256: "a".repeat(64),
  sizeBytes: 14,
  width: 10,
  height: 10,
};

function createDependencies() {
  return {
    storage: {
      upload: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    finalize: vi.fn().mockResolvedValue({
      proofId: generatedProofId,
      requestId,
      status: "pending_approval" as const,
      replayed: false,
    }),
    createProofId: () => generatedProofId,
    onCompensationFailure: vi.fn(),
  };
}

describe("private proof upload orchestration", () => {
  it("uploads a fresh immutable object and finalizes only its safe metadata", async () => {
    const dependencies = createDependencies();
    const result = await storeAndFinalizeProof(
      { leagueId, requestId, idempotencyKey, image },
      dependencies,
    );

    expect(dependencies.storage.upload).toHaveBeenCalledWith(
      { leagueId, requestId, proofId: generatedProofId },
      image,
    );
    expect(dependencies.finalize).toHaveBeenCalledWith({
      requestId,
      proofId: generatedProofId,
      idempotencyKey,
      sha256: image.sha256,
      sizeBytes: image.sizeBytes,
    });
    expect(dependencies.storage.remove).not.toHaveBeenCalled();
    expect(result).toMatchObject({ proofId: generatedProofId, replayed: false });
  });

  it("does not reconcile a definitive Storage rejection", async () => {
    const dependencies = createDependencies();
    dependencies.storage.upload.mockRejectedValue(
      mapProofStorageUploadError({ status: 409, message: "object exists" }),
    );

    await expect(
      storeAndFinalizeProof(
        { leagueId, requestId, idempotencyKey, image },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE", status: 503 });
    expect(dependencies.finalize).not.toHaveBeenCalled();
    expect(dependencies.storage.remove).not.toHaveBeenCalled();
    expect(dependencies.onCompensationFailure).not.toHaveBeenCalled();
  });

  it("retains and signals when an upload commits and then throws", async () => {
    const dependencies = createDependencies();
    let objectCommitted = false;
    dependencies.storage.upload.mockImplementation(async () => {
      objectCommitted = true;
      throw new Error("connection closed after storage commit");
    });

    await expect(
      storeAndFinalizeProof(
        { leagueId, requestId, idempotencyKey, image },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE", status: 503 });
    expect(objectCommitted).toBe(true);
    expect(dependencies.finalize).not.toHaveBeenCalled();
    expect(dependencies.storage.remove).not.toHaveBeenCalled();
    expect(dependencies.onCompensationFailure).toHaveBeenCalledOnce();
  });

  it.each([
    [{ status: 400 }, true],
    [{ status: 401 }, true],
    [{ status: 403 }, true],
    [{ status: 404 }, true],
    [{ status: 409 }, true],
    [{ status: 411 }, true],
    [{ status: 413 }, true],
    [{ status: 415 }, true],
    [{ status: 422 }, true],
    [{ statusCode: "429" }, true],
    [{ status: 408 }, false],
    [{ status: 425 }, false],
    [{ status: 499 }, false],
    [{ status: 418 }, false],
    [{ status: 500 }, false],
    [{ status: 503 }, false],
    [new Error("transport unavailable"), false],
  ])(
    "classifies Storage upload outcomes without parsing messages",
    (error, definitive) => {
      expect(
        mapProofStorageUploadError(error).definitiveStorageRejection,
      ).toBe(definitive);
    },
  );

  it.each([408, 425, 499, 503, 418])(
    "retains and reconciles a Storage upload with ambiguous HTTP status %s",
    async (status) => {
      const dependencies = createDependencies();
      dependencies.storage.upload.mockRejectedValue(
        mapProofStorageUploadError({
          status,
          message: "storage outcome unavailable",
        }),
      );

      await expect(
        storeAndFinalizeProof(
          { leagueId, requestId, idempotencyKey, image },
          dependencies,
        ),
      ).rejects.toMatchObject({
        code: "STORAGE_UNAVAILABLE",
        definitiveStorageRejection: false,
      });
      expect(dependencies.finalize).not.toHaveBeenCalled();
      expect(dependencies.storage.remove).not.toHaveBeenCalled();
      expect(dependencies.onCompensationFailure).toHaveBeenCalledOnce();
    },
  );

  it.each(["40003", "08007"])(
    "replays the exact finalizer after commit-ambiguous SQLSTATE %s",
    async (sqlState) => {
      const dependencies = createDependencies();
      dependencies.finalize
        .mockRejectedValueOnce(
          mapProofDatabaseError({
            code: sqlState,
            message: "database response outcome unknown",
          }),
        )
        .mockResolvedValueOnce({
          proofId: generatedProofId,
          requestId,
          status: "pending_approval",
          replayed: true,
        });

      await expect(
        storeAndFinalizeProof(
          { leagueId, requestId, idempotencyKey, image },
          dependencies,
        ),
      ).resolves.toMatchObject({ proofId: generatedProofId, replayed: true });
      expect(dependencies.finalize).toHaveBeenCalledTimes(2);
      expect(dependencies.finalize.mock.calls[0]).toEqual(
        dependencies.finalize.mock.calls[1],
      );
      expect(dependencies.storage.remove).not.toHaveBeenCalled();
      expect(dependencies.onCompensationFailure).not.toHaveBeenCalled();
    },
  );

  it("retains and reconciles when a 40003 replay remains unclassified", async () => {
    const dependencies = createDependencies();
    dependencies.finalize
      .mockRejectedValueOnce(
        mapProofDatabaseError({
          code: "40003",
          message: "statement completion unknown",
        }),
      )
      .mockRejectedValueOnce(
        mapProofDatabaseError({
          code: "ZZ999",
          message: "unclassified database outcome",
        }),
      );

    await expect(
      storeAndFinalizeProof(
        { leagueId, requestId, idempotencyKey, image },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(dependencies.finalize).toHaveBeenCalledTimes(2);
    expect(dependencies.finalize.mock.calls[0]).toEqual(
      dependencies.finalize.mock.calls[1],
    );
    expect(dependencies.storage.remove).not.toHaveBeenCalled();
    expect(dependencies.onCompensationFailure).toHaveBeenCalledOnce();
  });

  it("deletes the uploaded object when DB finalization fails", async () => {
    const dependencies = createDependencies();
    const conflict = mapProofDatabaseError({
      code: "P0001",
      message: "PROOF_IDEMPOTENCY_CONFLICT",
    });
    dependencies.finalize.mockRejectedValue(conflict);

    await expect(
      storeAndFinalizeProof(
        { leagueId, requestId, idempotencyKey, image },
        dependencies,
      ),
    ).rejects.toBe(conflict);
    expect(dependencies.finalize).toHaveBeenCalledOnce();
    expect(dependencies.storage.remove).toHaveBeenCalledWith({
      leagueId,
      requestId,
      proofId: generatedProofId,
    });
  });

  it("replays the exact finalizer after an ambiguous committed response and keeps the referenced object", async () => {
    const dependencies = createDependencies();
    let committed = false;
    dependencies.finalize.mockImplementation(async () => {
      if (!committed) {
        committed = true;
        throw new Error("connection closed after commit");
      }

      return {
        proofId: generatedProofId,
        requestId,
        status: "pending_approval",
        replayed: true,
      };
    });

    const result = await storeAndFinalizeProof(
      { leagueId, requestId, idempotencyKey, image },
      dependencies,
    );

    expect(result).toMatchObject({
      proofId: generatedProofId,
      replayed: true,
    });
    expect(dependencies.finalize).toHaveBeenCalledTimes(2);
    expect(dependencies.finalize.mock.calls[0]).toEqual(
      dependencies.finalize.mock.calls[1],
    );
    expect(dependencies.storage.remove).not.toHaveBeenCalled();
    expect(dependencies.onCompensationFailure).not.toHaveBeenCalled();
  });

  it("replays once after an ambiguous response-schema failure", async () => {
    const dependencies = createDependencies();
    dependencies.finalize
      .mockRejectedValueOnce(new ProofError("INTERNAL_ERROR", 500))
      .mockResolvedValueOnce({
        proofId: generatedProofId,
        requestId,
        status: "pending_approval",
        replayed: true,
      });

    await expect(
      storeAndFinalizeProof(
        { leagueId, requestId, idempotencyKey, image },
        dependencies,
      ),
    ).resolves.toMatchObject({ proofId: generatedProofId, replayed: true });
    expect(dependencies.finalize).toHaveBeenCalledTimes(2);
    expect(dependencies.storage.remove).not.toHaveBeenCalled();
  });

  it("retains the private object and requests reconciliation when both outcomes are ambiguous", async () => {
    const dependencies = createDependencies();
    dependencies.finalize.mockRejectedValue(new Error("network unavailable"));

    await expect(
      storeAndFinalizeProof(
        { leagueId, requestId, idempotencyKey, image },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(dependencies.finalize).toHaveBeenCalledTimes(2);
    expect(dependencies.storage.remove).not.toHaveBeenCalled();
    expect(dependencies.onCompensationFailure).toHaveBeenCalledOnce();
  });

  it("retains the object when a retry rejection cannot disprove the first ambiguous commit", async () => {
    const dependencies = createDependencies();
    dependencies.finalize
      .mockRejectedValueOnce(new Error("response lost"))
      .mockRejectedValueOnce(
        mapProofDatabaseError({
          code: "P0001",
          message: "UNAUTHENTICATED",
        }),
      );

    await expect(
      storeAndFinalizeProof(
        { leagueId, requestId, idempotencyKey, image },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(dependencies.finalize).toHaveBeenCalledTimes(2);
    expect(dependencies.storage.remove).not.toHaveBeenCalled();
    expect(dependencies.onCompensationFailure).toHaveBeenCalledOnce();
  });

  it("returns the original result and removes the new object on an identical retry", async () => {
    const dependencies = createDependencies();
    dependencies.finalize.mockResolvedValue({
      proofId: originalProofId,
      requestId,
      status: "pending_approval",
      replayed: true,
    });

    const result = await storeAndFinalizeProof(
      { leagueId, requestId, idempotencyKey, image },
      dependencies,
    );

    expect(result).toMatchObject({ proofId: originalProofId, replayed: true });
    expect(dependencies.storage.remove).toHaveBeenCalledTimes(1);
  });

  it("retains and reconciles if repeated finalization responses name another request", async () => {
    const dependencies = createDependencies();
    dependencies.finalize.mockResolvedValue({
      proofId: generatedProofId,
      requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "pending_approval",
      replayed: false,
    });

    await expect(
      storeAndFinalizeProof(
        { leagueId, requestId, idempotencyKey, image },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(dependencies.finalize).toHaveBeenCalledTimes(2);
    expect(dependencies.storage.remove).not.toHaveBeenCalled();
    expect(dependencies.onCompensationFailure).toHaveBeenCalledOnce();
  });

  it("retains and reconciles on repeated inconsistent replay results", async () => {
    const dependencies = createDependencies();
    dependencies.finalize.mockResolvedValue({
      proofId: originalProofId,
      requestId,
      status: "pending_approval",
      replayed: false,
    });

    await expect(
      storeAndFinalizeProof(
        { leagueId, requestId, idempotencyKey, image },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(dependencies.finalize).toHaveBeenCalledTimes(2);
    expect(dependencies.storage.remove).not.toHaveBeenCalled();
    expect(dependencies.onCompensationFailure).toHaveBeenCalledOnce();
  });

  it("reports only a sanitized event if compensation itself fails", async () => {
    const dependencies = createDependencies();
    const databaseFailure = mapProofDatabaseError({
      code: "P0001",
      message: "PROOF_IDEMPOTENCY_CONFLICT",
    });
    dependencies.finalize.mockRejectedValue(databaseFailure);
    dependencies.storage.remove.mockRejectedValue(new Error("secret path"));

    await expect(
      storeAndFinalizeProof(
        { leagueId, requestId, idempotencyKey, image },
        dependencies,
      ),
    ).rejects.toBe(databaseFailure);
    expect(dependencies.storage.remove).toHaveBeenCalledOnce();
    expect(dependencies.onCompensationFailure).toHaveBeenCalledOnce();
  });
});
