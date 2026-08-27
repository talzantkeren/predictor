import type { Database } from "@/types/database.generated";

export type SyncStatus = Database["public"]["Enums"]["sync_status"];
export type LiveSyncKind = "catalog" | "targeted" | "reconciliation";

type ManualCatalogApplicationDetails = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  rowsInserted: number;
  teamsChanged: number;
  matchesChanged: number;
};

export type ManualCatalogApplication = ManualCatalogApplicationDetails &
  (
    | {
        status: "succeeded";
        reason: "MANUAL_APPLIED" | "MANUAL_NO_CHANGE";
      }
    | {
        status: "failed";
        reason: "MANUAL_CATALOG_CONFLICT";
      }
  );

export interface SyncRunItem {
  id: string;
  provider: string;
  status: SyncStatus;
  startedAt: string;
  finishedAt: string | null;
  fixturesSeen: number;
  matchesChanged: number;
  resultsChanged: number;
  syncKind: string;
  rowsInserted: number;
  teamsChanged: number;
  manualOverridesSkipped: number;
  quotaRemaining: number | null;
  operatorNotes: string[];
  resultCode: string | null;
  errorMessageSafe: string | null;
}

export type ClaimedSportsSync = {
  outcome: "CLAIMED";
  runId: string;
  provider: "api-football";
  syncKind: LiveSyncKind;
  generation: number;
  token: string;
  lockedUntil: string;
  fixtureIds: string[];
};

export type SportsSyncClaim =
  | ClaimedSportsSync
  | {
      outcome: "NOT_DUE";
      runId: null;
      provider: "api-football";
      reason: "NOT_DUE" | "PROVIDER_BACKOFF";
    }
  | {
      outcome: "CONCURRENT_ATTEMPT";
      runId: string;
      provider: "api-football";
      reason: "CONCURRENT_ATTEMPT";
    };

export type SyncInvocationResult =
  | {
      runId: string;
      status: "succeeded";
      reason: "SUCCEEDED" | "MANUAL_APPLIED" | "MANUAL_NO_CHANGE";
    }
  | {
      runId: string;
      status: "failed";
      reason: string;
    }
  | {
      runId: string | null;
      status: "skipped";
      reason:
        | "CONCURRENT_ATTEMPT"
        | "NOT_DUE"
        | "PROVIDER_BACKOFF";
    };
