import "server-only";

import {
  ApiFootballClientError,
  type ApiFootballClientErrorCode,
  type ApiFootballTransport,
} from "@/features/sports/api-football-client";
import { getApiFootballSafeErrorCode } from "@/features/sports/api-football-provider";
import { buildManualCatalogPayload } from "@/features/sports/manual-catalog";
import { createSportsProvider } from "@/features/sports/provider-factory";
import {
  buildApiFootballApplyPlan,
  type PlannedApiFootballApply,
} from "@/features/sports/sync-planner";
import type { SportsProviderId, SportsSyncPlan } from "@/features/sports/types";
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

type FinalizableFailureCode =
  | ApiFootballClientErrorCode
  | "SYNC_APPLY_FAILED"
  | "SYNC_PLAN_FAILED";

type FinalizableFailure = {
  errorCode: FinalizableFailureCode;
  errorMessageSafe: string;
  fixturesSeen: number;
  quotaRemaining: number | null;
  retryAfterSeconds: number | null;
};

const safeFailureMessages: Record<
  FinalizableFailureCode | "SYNC_FINALIZE_FAILED",
  string
> = {
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
  SYNC_PLAN_FAILED: "The normalized provider snapshot could not be planned safely.",
};

function planFromClaim(claim: ClaimedSportsSync): SportsSyncPlan {
  return claim.syncKind === "targeted"
    ? { kind: "targeted", fixtureIds: claim.fixtureIds }
    : { kind: claim.syncKind };
}

function providerFailureDetails(error: unknown): FinalizableFailure {
  const errorCode = getApiFootballSafeErrorCode(error);
  return {
    errorCode,
    errorMessageSafe: safeFailureMessages[errorCode],
    fixturesSeen: 0,
    retryAfterSeconds:
      error instanceof ApiFootballClientError
        ? error.retryAfterSeconds
        : null,
    quotaRemaining:
      error instanceof ApiFootballClientError ? error.quotaRemaining : null,
  };
}

function stageFailureDetails(
  errorCode: "SYNC_APPLY_FAILED" | "SYNC_PLAN_FAILED",
  metadata: { fixturesSeen: number; quotaRemaining: number | null },
): FinalizableFailure {
  return {
    errorCode,
    errorMessageSafe: safeFailureMessages[errorCode],
    fixturesSeen: metadata.fixturesSeen,
    quotaRemaining: metadata.quotaRemaining,
    retryAfterSeconds: null,
  };
}

async function finalizeFailedRun(
  systemActorId: string,
  claim: ClaimedSportsSync,
  failure: FinalizableFailure,
  operatorNotes: string[],
  finalize: SyncDependencies["finalize"],
): Promise<SyncInvocationResult> {
  try {
    await finalize(systemActorId, claim, {
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

  let snapshot: Awaited<
    ReturnType<ReturnType<typeof createSportsProvider>["getSyncSnapshot"]>
  >;
  try {
    const provider = createSportsProvider({
      provider: input.provider,
      apiKey: input.apiKey,
      transport: input.transport,
    });
    snapshot = await provider.getSyncSnapshot(planFromClaim(claim));
  } catch (error) {
    return finalizeFailedRun(
      input.systemActorId,
      claim,
      providerFailureDetails(error),
      [],
      dependencies.finalize,
    );
  }

  let applyPlan: PlannedApiFootballApply;
  try {
    applyPlan = buildApiFootballApplyPlan(snapshot);
  } catch {
    return finalizeFailedRun(
      input.systemActorId,
      claim,
      stageFailureDetails("SYNC_PLAN_FAILED", {
        fixturesSeen: 0,
        quotaRemaining: snapshot.quota.dailyRemaining,
      }),
      [],
      dependencies.finalize,
    );
  }

  try {
    for (const batch of applyPlan.batches) {
      await dependencies.apply(input.systemActorId, claim, batch);
    }
  } catch {
    return finalizeFailedRun(
      input.systemActorId,
      claim,
      stageFailureDetails("SYNC_APPLY_FAILED", {
        fixturesSeen: applyPlan.fixturesSeen,
        quotaRemaining: snapshot.quota.dailyRemaining,
      }),
      applyPlan.operatorNotes,
      dependencies.finalize,
    );
  }

  try {
    await dependencies.finalize(input.systemActorId, claim, {
      status: "succeeded",
      fixturesSeen: applyPlan.fixturesSeen,
      operatorNotes: applyPlan.operatorNotes,
      quotaRemaining: snapshot.quota.dailyRemaining,
    });
    return { runId: claim.runId, status: "succeeded", reason: "SUCCEEDED" };
  } catch {
    return {
      runId: claim.runId,
      status: "failed",
      reason: "SYNC_FINALIZE_FAILED",
    };
  }
}
