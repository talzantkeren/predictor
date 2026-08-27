import "server-only";

import {
  ApiFootballClientError,
  type ApiFootballTransport,
} from "@/features/sports/api-football-client";
import { getApiFootballSafeErrorCode } from "@/features/sports/api-football-provider";
import { buildManualCatalogPayload } from "@/features/sports/manual-catalog";
import { createSportsProvider } from "@/features/sports/provider-factory";
import { buildApiFootballApplyPlan } from "@/features/sports/sync-planner";
import type { SportsProviderId, SportsSyncPlan } from "@/features/sports/types";
import { SyncError } from "@/features/sync/errors";
import {
  applyApiFootballSyncBatch,
  applyManualFixtureCatalog,
  claimApiFootballSync,
  finalizeApiFootballSync,
} from "@/features/sync/private-sync-gateway";
import type {
  ClaimedSportsSync,
  SyncInvocationResult,
} from "@/features/sync/types";

type SyncDependencies = {
  applyManual: typeof applyManualFixtureCatalog;
  claim: typeof claimApiFootballSync;
  apply: typeof applyApiFootballSyncBatch;
  finalize: typeof finalizeApiFootballSync;
};

const defaultDependencies: SyncDependencies = {
  applyManual: applyManualFixtureCatalog,
  claim: claimApiFootballSync,
  apply: applyApiFootballSyncBatch,
  finalize: finalizeApiFootballSync,
};

const safeFailureMessages: Record<string, string> = {
  PROVIDER_ABORTED: "The sports provider request was aborted safely.",
  PROVIDER_AUTH_FAILED: "The sports provider rejected its server credential.",
  PROVIDER_BAD_RESPONSE: "The sports provider returned an invalid envelope.",
  PROVIDER_CONTRACT_ERROR: "The sports provider response failed validation.",
  PROVIDER_PAGING_UNSUPPORTED: "The sports provider returned unsupported paging.",
  PROVIDER_RATE_LIMITED: "The sports provider rate limit was reached.",
  PROVIDER_RESPONSE_TOO_LARGE: "The sports provider response exceeded the safe limit.",
  PROVIDER_TIMEOUT: "The sports provider request timed out.",
  PROVIDER_UNAVAILABLE: "The sports provider is temporarily unavailable.",
  SYNC_APPLY_FAILED: "The validated provider batch could not be applied safely.",
  SYNC_FINALIZE_FAILED: "The Sync run could not be finalized safely.",
};

function planFromClaim(claim: ClaimedSportsSync): SportsSyncPlan {
  return claim.syncKind === "targeted"
    ? { kind: "targeted", fixtureIds: claim.fixtureIds }
    : { kind: claim.syncKind };
}

function failureDetails(error: unknown) {
  const errorCode =
    error instanceof SyncError
      ? "SYNC_APPLY_FAILED"
      : getApiFootballSafeErrorCode(error);
  return {
    errorCode,
    errorMessageSafe: safeFailureMessages[errorCode],
    retryAfterSeconds:
      error instanceof ApiFootballClientError
        ? error.retryAfterSeconds
        : null,
    quotaRemaining:
      error instanceof ApiFootballClientError ? error.quotaRemaining : null,
  };
}

export async function runSportsSync(
  input: {
    systemActorId: string;
    provider: SportsProviderId;
    apiKey?: string;
    force: boolean;
    transport?: ApiFootballTransport;
  },
  dependencies: SyncDependencies = defaultDependencies,
): Promise<SyncInvocationResult> {
  if (input.provider === "manual") {
    const provider = createSportsProvider({ provider: "manual" });
    const snapshot = await provider.getSyncSnapshot({ kind: "catalog" });
    const payload = buildManualCatalogPayload(snapshot);
    const attempt = await dependencies.applyManual(input.systemActorId, payload);
    return attempt.status === "failed"
      ? {
          runId: attempt.runId,
          status: "failed",
          reason: attempt.reason,
        }
      : {
          runId: attempt.runId,
          status: "succeeded",
          reason: attempt.reason,
        };
  }

  const claim = await dependencies.claim(input.systemActorId, input.force);
  if (claim.outcome !== "CLAIMED") {
    return {
      runId: claim.runId,
      status: "skipped",
      reason: claim.reason,
    };
  }

  let operatorNotes: string[] = [];
  try {
    const provider = createSportsProvider({
      provider: input.provider,
      apiKey: input.apiKey,
      transport: input.transport,
    });
    const snapshot = await provider.getSyncSnapshot(planFromClaim(claim));
    const applyPlan = buildApiFootballApplyPlan(snapshot);
    operatorNotes = applyPlan.operatorNotes;

    for (const batch of applyPlan.batches) {
      await dependencies.apply(input.systemActorId, claim, batch);
    }

    await dependencies.finalize(input.systemActorId, claim, {
      status: "succeeded",
      fixturesSeen: applyPlan.fixturesSeen,
      operatorNotes: applyPlan.operatorNotes,
      quotaRemaining: snapshot.quota.dailyRemaining,
    });
    return { runId: claim.runId, status: "succeeded", reason: "SUCCEEDED" };
  } catch (error) {
    const failure = failureDetails(error);
    try {
      await dependencies.finalize(input.systemActorId, claim, {
        status: "failed",
        ...failure,
        operatorNotes,
      });
    } catch {
      return {
        runId: claim.runId,
        status: "failed",
        reason: "SYNC_FINALIZE_FAILED",
      };
    }
    return {
      runId: claim.runId,
      status: "failed",
      reason: failure.errorCode,
    };
  }
}
