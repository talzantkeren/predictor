import { z } from "zod";

import { ProofError, mapProofDatabaseError } from "@/features/files/errors";

const uploadContextSchema = z.object({
  request_id: z.string().uuid(),
  league_id: z.string().uuid(),
  status: z.enum(["pending_proof", "pending_approval"]),
});

const rateLimitSchema = z.object({
  allowed: z.boolean(),
  retry_after_seconds: z.number().int().nonnegative().max(86_400).nullish(),
});

const finalizationSchema = z.object({
  proof_id: z.string().uuid(),
  request_id: z.string().uuid(),
  status: z.literal("pending_approval"),
  replayed: z.boolean(),
});

const proofAuthorizationSchema = z.object({
  proof_id: z.string().uuid(),
  request_id: z.string().uuid(),
  league_id: z.string().uuid(),
});

type RpcResult = {
  data?: unknown;
  error?: unknown;
};

type RpcFunction = (
  name: string,
  arguments_: Record<string, unknown>,
) => PromiseLike<unknown>;

async function invokeJsonRpc(
  client: unknown,
  name: string,
  arguments_: Record<string, unknown>,
) {
  if (typeof client !== "object" || client === null || !("rpc" in client)) {
    throw new ProofError("INTERNAL_ERROR", 500);
  }

  const rpc = client.rpc;

  if (typeof rpc !== "function") {
    throw new ProofError("INTERNAL_ERROR", 500);
  }

  const result = (await (rpc as RpcFunction).call(
    client,
    name,
    arguments_,
  )) as RpcResult;

  if (typeof result !== "object" || result === null) {
    throw new ProofError("INTERNAL_ERROR", 500);
  }

  if (result.error) {
    throw mapProofDatabaseError(result.error);
  }

  if (!Array.isArray(result.data)) {
    return result.data;
  }

  if (result.data.length === 0) {
    return null;
  }

  if (result.data.length !== 1) {
    throw new ProofError("INTERNAL_ERROR", 500);
  }

  return result.data[0];
}

export async function getJoinRequestUploadContext(
  client: unknown,
  requestId: string,
) {
  const data = await invokeJsonRpc(client, "get_join_request_upload_context", {
    p_request_id: requestId,
  });
  const parsed = uploadContextSchema.safeParse(data);

  if (!parsed.success) {
    if (data === null || data === undefined) {
      throw new ProofError("RESOURCE_UNAVAILABLE", 404);
    }

    throw new ProofError("INTERNAL_ERROR", 500, { cause: parsed.error });
  }

  return {
    requestId: parsed.data.request_id.toLowerCase(),
    leagueId: parsed.data.league_id.toLowerCase(),
    status: parsed.data.status,
  };
}

export async function consumeProofUploadAttempt(
  client: unknown,
  requestId: string,
) {
  const data = await invokeJsonRpc(client, "consume_proof_upload_rate_limit", {
    p_request_id: requestId,
  });
  const parsed = rateLimitSchema.safeParse(data);

  if (!parsed.success) {
    throw new ProofError("INTERNAL_ERROR", 500, { cause: parsed.error });
  }

  if (!parsed.data.allowed) {
    throw new ProofError("RATE_LIMITED", 429, {
      retryAfterSeconds: Math.max(parsed.data.retry_after_seconds ?? 1, 1),
    });
  }

  return parsed.data;
}

export async function finalizePaymentProof(
  client: unknown,
  input: {
    requestId: string;
    proofId: string;
    idempotencyKey: string;
    sha256: string;
    sizeBytes: number;
  },
) {
  const data = await invokeJsonRpc(client, "finalize_payment_proof", {
    p_request_id: input.requestId,
    p_proof_id: input.proofId,
    p_idempotency_key: input.idempotencyKey,
    p_sha256: input.sha256,
    p_size_bytes: input.sizeBytes,
  });
  const parsed = finalizationSchema.safeParse(data);

  if (!parsed.success) {
    throw new ProofError("INTERNAL_ERROR", 500, { cause: parsed.error });
  }

  return {
    proofId: parsed.data.proof_id.toLowerCase(),
    requestId: parsed.data.request_id.toLowerCase(),
    status: parsed.data.status,
    replayed: parsed.data.replayed,
  };
}

export async function authorizePaymentProof(
  client: unknown,
  proofId: string,
) {
  const data = await invokeJsonRpc(client, "authorize_payment_proof_access", {
    p_proof_id: proofId,
  });
  const parsed = proofAuthorizationSchema.safeParse(data);

  if (!parsed.success) {
    if (data === null || data === undefined) {
      throw new ProofError("RESOURCE_UNAVAILABLE", 404);
    }

    throw new ProofError("INTERNAL_ERROR", 500, { cause: parsed.error });
  }

  return {
    proofId: parsed.data.proof_id.toLowerCase(),
    requestId: parsed.data.request_id.toLowerCase(),
    leagueId: parsed.data.league_id.toLowerCase(),
  };
}
