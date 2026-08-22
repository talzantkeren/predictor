import type { SupabaseClient } from "@supabase/supabase-js";

import { getSystemAdminAuthorization } from "@/features/scoring/queries";
import type { SyncRunItem } from "@/features/sync/types";
import type { Database } from "@/types/database.generated";

const MAX_SYNC_RUNS = 100;

function isNonnegativeInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isTimestamp(value: string | null): value is string {
  return value !== null && Number.isFinite(Date.parse(value));
}

export function mapSyncRun(
  row: Database["public"]["Tables"]["sync_runs"]["Row"],
): SyncRunItem | null {
  if (
    !isTimestamp(row.started_at) ||
    (row.finished_at !== null && !isTimestamp(row.finished_at)) ||
    !isNonnegativeInteger(row.fixtures_seen) ||
    !isNonnegativeInteger(row.matches_changed) ||
    !isNonnegativeInteger(row.results_changed)
  ) {
    return null;
  }

  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    fixturesSeen: row.fixtures_seen,
    matchesChanged: row.matches_changed,
    resultsChanged: row.results_changed,
    resultCode: row.error_code,
    errorMessageSafe: row.error_message_safe,
  };
}

export async function getSystemSyncRuns(
  supabase: SupabaseClient<Database>,
): Promise<
  | { status: "found"; runs: SyncRunItem[] }
  | { status: "denied" }
  | { status: "error" }
> {
  const authorization = await getSystemAdminAuthorization(supabase);
  if (authorization.status !== "authorized") return authorization;

  const { data, error } = await supabase
    .from("sync_runs")
    .select(
      "id, provider, status, started_at, finished_at, fixtures_seen, matches_changed, results_changed, error_code, error_message_safe",
    )
    .order("started_at", { ascending: false })
    .limit(MAX_SYNC_RUNS);

  if (error || !data) {
    return { status: "error" };
  }

  const runs = data.map(mapSyncRun);
  if (runs.some((run) => run === null)) {
    return { status: "error" };
  }

  return { status: "found", runs: runs as SyncRunItem[] };
}
