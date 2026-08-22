import "server-only";

import { z } from "zod";

import { getDatabaseSyncError, SyncError } from "@/features/sync/errors";
import type { RecordedSyncAttempt } from "@/features/sync/types";
import { createSystemActorAdminClient } from "@/lib/supabase/admin";

const recordedAttemptSchema = z
  .object({
    result_id: z.string().uuid(),
    result_provider: z.literal("manual"),
    result_status: z.literal("skipped"),
    result_started_at: z.string().datetime({ offset: true }),
    result_finished_at: z.string().datetime({ offset: true }),
    result_code: z.enum(["CONCURRENT_ATTEMPT", "MANUAL_PROVIDER"]),
  })
  .transform(
    (row): RecordedSyncAttempt => ({
      id: row.result_id,
      provider: row.result_provider,
      status: row.result_status,
      startedAt: row.result_started_at,
      finishedAt: row.result_finished_at,
      reason: row.result_code,
    }),
  );

export async function recordManualSyncAttempt(systemActorId: string) {
  const admin = createSystemActorAdminClient(systemActorId);
  const { data, error } = await admin.rpc("record_sync_attempt");

  if (error) {
    throw getDatabaseSyncError(error);
  }

  const parsed = recordedAttemptSchema.safeParse(
    Array.isArray(data) && data.length === 1 ? data[0] : null,
  );
  if (!parsed.success) {
    throw new SyncError("SYNC_UNAVAILABLE", 503);
  }

  return parsed.data;
}
