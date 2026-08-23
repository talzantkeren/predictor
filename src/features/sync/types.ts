import type { Database } from "@/types/database.generated";

export type SyncStatus = Database["public"]["Enums"]["sync_status"];
export type SyncSkipReason = "CONCURRENT_ATTEMPT" | "MANUAL_PROVIDER";
export type LiveSyncKind = "catalog" | "targeted" | "reconciliation";

export interface RecordedSyncAttempt {
  id: string;
  provider: "manual";
  status: "skipped";
  startedAt: string;
  finishedAt: string;
  reason: SyncSkipReason;
}

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
      reason: "SUCCEEDED";
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
        | "MANUAL_PROVIDER"
        | "NOT_DUE"
        | "PROVIDER_BACKOFF";
    };
