import type { Database } from "@/types/database.generated";

export type SyncStatus = Database["public"]["Enums"]["sync_status"];
export type SyncSkipReason = "CONCURRENT_ATTEMPT" | "MANUAL_PROVIDER";

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
  resultCode: string | null;
  errorMessageSafe: string | null;
}
