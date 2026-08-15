import { randomUUID } from "node:crypto";

import {
  isDefinitiveProofDatabaseRejection,
  isDefinitiveProofStorageRejection,
  ProofError,
} from "@/features/files/errors";
import type { SanitizedProofImage } from "@/features/files/image";
import type { ProofObjectCoordinates } from "@/features/files/storage-path";

export type PrivateProofStorage = {
  upload(
    coordinates: ProofObjectCoordinates,
    image: SanitizedProofImage,
  ): Promise<void>;
  remove(coordinates: ProofObjectCoordinates): Promise<void>;
};

export type ProofFinalizer = (input: {
  requestId: string;
  proofId: string;
  idempotencyKey: string;
  sha256: string;
  sizeBytes: number;
}) => Promise<{
  proofId: string;
  requestId: string;
  status: "pending_approval";
  replayed: boolean;
}>;

export async function storeAndFinalizeProof(
  input: {
    leagueId: string;
    requestId: string;
    idempotencyKey: string;
    image: SanitizedProofImage;
  },
  dependencies: {
    storage: PrivateProofStorage;
    finalize: ProofFinalizer;
    createProofId?: () => string;
    onCompensationFailure?: () => void;
  },
) {
  const proofId = (dependencies.createProofId ?? randomUUID)().toLowerCase();
  const coordinates = {
    leagueId: input.leagueId,
    requestId: input.requestId,
    proofId,
  };

  try {
    await dependencies.storage.upload(coordinates, input.image);
  } catch (error) {
    const uploadError =
      error instanceof ProofError
        ? error
        : new ProofError("STORAGE_UNAVAILABLE", 503, { cause: error });

    if (
      uploadError.code === "STORAGE_UNAVAILABLE" &&
      !isDefinitiveProofStorageRejection(uploadError)
    ) {
      // A transport, timeout, unknown status, or 5xx outcome can hide a
      // committed upload. We cannot safely delete this upsert:false coordinate
      // because the failure also may hide a pre-existing collision, so retain
      // it for private reconciliation.
      reportReconciliationRequired(dependencies);
    }

    throw uploadError;
  }

  const finalizationInput = {
    requestId: input.requestId,
    proofId,
    idempotencyKey: input.idempotencyKey,
    sha256: input.image.sha256,
    sizeBytes: input.image.sizeBytes,
  };
  let finalization: Awaited<ReturnType<ProofFinalizer>>;

  try {
    finalization = await finalizeAndValidate(
      dependencies.finalize,
      finalizationInput,
    );
  } catch (error) {
    if (isDefinitiveProofDatabaseRejection(error)) {
      await compensate(dependencies, coordinates);
      throw error;
    }

    // Connection failures and SQLSTATE 40003 can hide a commit, as can a
    // malformed response. Replay the exact idempotent call once to resolve that
    // outcome without risking deletion of a referenced private object.
    try {
      finalization = await finalizeAndValidate(
        dependencies.finalize,
        finalizationInput,
      );
    } catch (retryError) {
      // A failed replay cannot disprove that the first attempt committed.
      reportReconciliationRequired(dependencies);
      throw new ProofError("INTERNAL_ERROR", 500, { cause: retryError });
    }
  }

  const returnedExistingProof = finalization.proofId !== proofId;

  if (returnedExistingProof) {
    await compensate(dependencies, coordinates);
  }

  return finalization;
}

async function finalizeAndValidate(
  finalize: ProofFinalizer,
  input: Parameters<ProofFinalizer>[0],
) {
  const finalization = await finalize(input);

  if (
    finalization.requestId !== input.requestId ||
    (finalization.proofId !== input.proofId && !finalization.replayed)
  ) {
    throw new ProofError("INTERNAL_ERROR", 500);
  }

  return finalization;
}

async function compensate(
  dependencies: {
    storage: PrivateProofStorage;
    onCompensationFailure?: () => void;
  },
  coordinates: ProofObjectCoordinates,
) {
  try {
    await dependencies.storage.remove(coordinates);
  } catch {
    reportReconciliationRequired(dependencies);
  }
}

function reportReconciliationRequired(dependencies: {
  onCompensationFailure?: () => void;
}) {
  try {
    dependencies.onCompensationFailure?.();
  } catch {
    // A best-effort sanitized signal must never mask the upload outcome.
  }
}
