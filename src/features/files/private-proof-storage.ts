import "server-only";

import { z } from "zod";

import {
  PROOF_BUCKET,
  PROOF_SIGNED_URL_TTL_SECONDS,
  SANITIZED_PROOF_MIME_TYPE,
} from "@/features/files/constants";
import {
  mapProofStorageUploadError,
  ProofError,
} from "@/features/files/errors";
import {
  assertSanitizedProofForStorage,
  type SanitizedProofImage,
} from "@/features/files/image";
import {
  createProofStoragePath,
  isExpectedProofStoragePath,
  normalizeProofObjectCoordinates,
  type ProofObjectCoordinates,
} from "@/features/files/storage-path";
import { createAdminClient } from "@/lib/supabase/admin";

const proofMetadataSchema = z.object({
  storage_path: z.string().min(1),
  deleted_at: z.null(),
});

type MetadataQueryResult = {
  data: unknown;
  error: unknown;
};

type ProofMetadataClient = {
  from(relation: "payment_proofs"): {
    select(columns: "storage_path,deleted_at"): {
      eq(column: "id", value: string): {
        is(column: "deleted_at", value: null): {
          maybeSingle(): PromiseLike<MetadataQueryResult>;
        };
      };
    };
  };
};

export async function uploadPrivateProof(
  coordinates: ProofObjectCoordinates,
  image: SanitizedProofImage,
) {
  const normalized = normalizeProofObjectCoordinates(coordinates);
  await assertSanitizedProofForStorage(image);
  const path = createProofStoragePath(normalized);
  const admin = createAdminClient();
  const proofBucket = admin.storage.from(PROOF_BUCKET);
  let uploadResult: Awaited<ReturnType<typeof proofBucket.upload>>;

  try {
    uploadResult = await proofBucket.upload(path, image.bytes, {
      cacheControl: "0",
      contentType: SANITIZED_PROOF_MIME_TYPE,
      upsert: false,
    });
  } catch (error) {
    throw mapProofStorageUploadError(error);
  }

  if (uploadResult.error) {
    throw mapProofStorageUploadError(uploadResult.error);
  }
}

export async function removePrivateProof(
  coordinates: ProofObjectCoordinates,
) {
  const path = createProofStoragePath(
    normalizeProofObjectCoordinates(coordinates),
  );
  const admin = createAdminClient();
  const { error } = await admin.storage.from(PROOF_BUCKET).remove([path]);

  if (error) {
    throw new ProofError("STORAGE_UNAVAILABLE", 503, { cause: error });
  }
}

export async function createPrivateProofSignedUrl(
  coordinates: ProofObjectCoordinates,
) {
  const normalized = normalizeProofObjectCoordinates(coordinates);
  const admin = createAdminClient();
  const metadataClient = admin as unknown as ProofMetadataClient;
  const { data, error } = await metadataClient
    .from("payment_proofs")
    .select("storage_path,deleted_at")
    .eq("id", normalized.proofId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new ProofError("INTERNAL_ERROR", 500, { cause: error });
  }

  const metadata = proofMetadataSchema.safeParse(data);

  if (
    !metadata.success ||
    !isExpectedProofStoragePath(metadata.data.storage_path, normalized)
  ) {
    throw new ProofError("RESOURCE_UNAVAILABLE", 404);
  }

  const { data: signedData, error: signedError } = await admin.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(
      metadata.data.storage_path,
      PROOF_SIGNED_URL_TTL_SECONDS,
    );

  if (signedError || !signedData?.signedUrl) {
    throw new ProofError("STORAGE_UNAVAILABLE", 503, {
      cause: signedError,
    });
  }

  return signedData.signedUrl;
}
