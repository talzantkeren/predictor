import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env";
import {
  privateJson,
  proofErrorJson,
} from "@/features/files/http";
import { ProofError } from "@/features/files/errors";
import { sanitizeProofImage } from "@/features/files/image";
import { requireUuid } from "@/features/files/identifiers";
import {
  removePrivateProof,
  uploadPrivateProof,
} from "@/features/files/private-proof-storage";
import {
  assertProofRequestSizeHeaders,
  parseProofMultipartForm,
  readBoundedRequestBody,
} from "@/features/files/request-body";
import {
  consumeProofUploadAttempt,
  finalizePaymentProof,
  getJoinRequestUploadContext,
} from "@/features/files/rpc";
import {
  assertDemoMode,
  assertTrustedSameOrigin,
} from "@/features/files/security";
import { storeAndFinalizeProof } from "@/features/files/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const env = getPublicEnv();
    assertTrustedSameOrigin(
      request.headers.get("origin"),
      env.NEXT_PUBLIC_APP_URL,
      [
        process.env.VERCEL_BRANCH_URL,
        process.env.VERCEL_URL,
        process.env.VERCEL_PROJECT_PRODUCTION_URL,
      ],
    );
    assertDemoMode(env.DEMO_MODE);

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new ProofError("UNAUTHENTICATED", 401, { cause: userError });
    }

    const { requestId: rawRequestId } = await context.params;
    const requestId = requireUuid(rawRequestId, "INVALID_REQUEST_ID");

    const uploadContext = await getJoinRequestUploadContext(
      supabase,
      requestId,
    );

    if (uploadContext.requestId !== requestId) {
      throw new ProofError("RESOURCE_UNAVAILABLE", 404);
    }

    await consumeProofUploadAttempt(supabase, requestId);

    assertProofRequestSizeHeaders(request);
    const body = await readBoundedRequestBody(request);
    const { file, idempotencyKey } = await parseProofMultipartForm(
      request,
      body,
    );
    const image = await sanitizeProofImage({
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name,
      declaredMimeType: file.type,
    });
    const finalization = await storeAndFinalizeProof(
      {
        leagueId: uploadContext.leagueId,
        requestId,
        idempotencyKey,
        image,
      },
      {
        storage: {
          upload: uploadPrivateProof,
          remove: removePrivateProof,
        },
        finalize: (input) => finalizePaymentProof(supabase, input),
        onCompensationFailure: () => {
          // Deliberately omit all user, request, object, path, digest, and URL
          // data. The private orphan can be reconciled by a maintenance job.
          console.error(
            JSON.stringify({
              event: "proof_upload_compensation_failed",
              recovery: "private_orphan_reconciliation",
            }),
          );
        },
      },
    );

    return privateJson(
      {
        data: {
          proofId: finalization.proofId,
          requestId: finalization.requestId,
          status: finalization.status,
          replayed: finalization.replayed,
        },
      },
      { status: finalization.replayed ? 200 : 201, varyOrigin: true },
    );
  } catch (error) {
    return proofErrorJson(error, true);
  }
}
