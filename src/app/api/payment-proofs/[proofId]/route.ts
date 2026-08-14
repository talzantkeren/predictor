import { getPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { ProofError } from "@/features/files/errors";
import { privateRedirect, proofErrorJson } from "@/features/files/http";
import { requireUuid } from "@/features/files/identifiers";
import { createPrivateProofSignedUrl } from "@/features/files/private-proof-storage";
import { authorizePaymentProof } from "@/features/files/rpc";
import { assertDemoMode } from "@/features/files/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ proofId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    assertDemoMode(getPublicEnv().DEMO_MODE);

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new ProofError("UNAUTHENTICATED", 401, { cause: userError });
    }

    const { proofId: rawProofId } = await context.params;
    const proofId = requireUuid(rawProofId, "INVALID_PROOF_ID");

    const authorization = await authorizePaymentProof(supabase, proofId);

    if (authorization.proofId !== proofId) {
      throw new ProofError("RESOURCE_UNAVAILABLE", 404);
    }

    const url = await createPrivateProofSignedUrl({
      proofId,
      requestId: authorization.requestId,
      leagueId: authorization.leagueId,
    });

    return privateRedirect(url);
  } catch (error) {
    return proofErrorJson(error);
  }
}
