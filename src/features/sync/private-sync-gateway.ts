import "server-only";

import { z } from "zod";

import { getDatabaseSyncError, SyncError } from "@/features/sync/errors";
import type { ApiFootballApplyBatch } from "@/features/sports/sync-planner";
import type { ManualCatalogPayload } from "@/features/sports";
import { parseSportsSyncClaimRow } from "@/features/sync/claim-contract";
import type { ClaimedSportsSync, ManualCatalogApplication } from "@/features/sync/types";
import { createSystemActorAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database.generated";

const activationSummarySchema = z
  .object({
    activated_count: z.number().int().nonnegative(),
    late_count: z.number().int().nonnegative(),
    recorded_at: z.string().datetime({ offset: true }),
  })
  .refine((summary) => summary.late_count <= summary.activated_count)
  .transform((summary) => ({
    activatedCount: summary.activated_count,
    lateCount: summary.late_count,
    recordedAt: summary.recorded_at,
  }));

export async function activateDueLeagues(systemActorId: string) {
  const admin = createSystemActorAdminClient(systemActorId);
  const { data, error } = await admin.rpc("activate_due_leagues");

  if (error) throw getDatabaseSyncError(error);

  const parsed = activationSummarySchema.safeParse(
    Array.isArray(data) && data.length === 1 ? data[0] : null,
  );
  if (!parsed.success) throw new SyncError("SYNC_UNAVAILABLE", 503);
  return parsed.data;
}

const manualCatalogApplicationSchema = z
  .object({
    result_run_id: z.string().uuid(),
    result_status: z.enum(["succeeded", "failed"]),
    result_code: z.enum([
      "MANUAL_APPLIED",
      "MANUAL_NO_CHANGE",
      "MANUAL_CATALOG_CONFLICT",
    ]),
    result_started_at: z.string().datetime({ offset: true }),
    result_finished_at: z.string().datetime({ offset: true }),
    result_rows_inserted: z.number().int().nonnegative(),
    result_teams_changed: z.number().int().nonnegative(),
    result_matches_changed: z.number().int().nonnegative(),
  })
  .superRefine((row, context) => {
    const validOutcome =
      (row.result_status === "succeeded" &&
        row.result_code !== "MANUAL_CATALOG_CONFLICT") ||
      (row.result_status === "failed" &&
        row.result_code === "MANUAL_CATALOG_CONFLICT");
    if (!validOutcome) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Manual catalog status and result code disagree.",
      });
    }
  })
  .transform((row): ManualCatalogApplication => {
    const details = {
      runId: row.result_run_id,
      startedAt: row.result_started_at,
      finishedAt: row.result_finished_at,
      rowsInserted: row.result_rows_inserted,
      teamsChanged: row.result_teams_changed,
      matchesChanged: row.result_matches_changed,
    };
    return row.result_status === "failed"
      ? {
          ...details,
          status: "failed",
          reason: "MANUAL_CATALOG_CONFLICT",
        }
      : {
          ...details,
          status: "succeeded",
          reason:
            row.result_code === "MANUAL_APPLIED"
              ? "MANUAL_APPLIED"
              : "MANUAL_NO_CHANGE",
        };
  });

export async function applyManualFixtureCatalog(
  systemActorId: string,
  payload: ManualCatalogPayload,
) {
  const admin = createSystemActorAdminClient(systemActorId);
  const { data, error } = await admin.rpc("apply_manual_fixture_catalog", {
    p_payload: JSON.parse(JSON.stringify(payload)) as Json,
  });
  if (error) throw getDatabaseSyncError(error);

  const parsed = manualCatalogApplicationSchema.safeParse(
    Array.isArray(data) && data.length === 1 ? data[0] : null,
  );
  if (!parsed.success) throw new SyncError("SYNC_UNAVAILABLE", 503);
  return parsed.data;
}

export async function claimApiFootballSync(
  systemActorId: string,
  force: boolean,
) {
  const admin = createSystemActorAdminClient(systemActorId);
  const { data, error } = await admin.rpc("claim_sports_sync", {
    p_provider: "api-football",
    p_force: force,
  });
  if (error) throw getDatabaseSyncError(error);

  const parsed = parseSportsSyncClaimRow(
    Array.isArray(data) && data.length === 1 ? data[0] : null,
  );
  if (!parsed) throw new SyncError("SYNC_UNAVAILABLE", 503);
  return parsed;
}

const applyResultSchema = z.object({
  result_rows_inserted: z.number().int().nonnegative(),
  result_teams_changed: z.number().int().nonnegative(),
  result_matches_changed: z.number().int().nonnegative(),
  result_results_changed: z.number().int().nonnegative(),
  result_manual_overrides_skipped: z.number().int().nonnegative(),
});

export async function applyApiFootballSyncBatch(
  systemActorId: string,
  claim: ClaimedSportsSync,
  payload: ApiFootballApplyBatch,
) {
  const admin = createSystemActorAdminClient(systemActorId);
  const args: Database["public"]["Functions"]["apply_api_football_sync_batch"]["Args"] = {
    p_run_id: claim.runId,
    p_generation: claim.generation,
    p_token: claim.token,
    p_payload: JSON.parse(JSON.stringify(payload)) as Json,
  };
  const { data, error } = await admin.rpc(
    "apply_api_football_sync_batch",
    args,
  );
  if (error) throw getDatabaseSyncError(error);
  const parsed = applyResultSchema.safeParse(
    Array.isArray(data) && data.length === 1 ? data[0] : null,
  );
  if (!parsed.success) throw new SyncError("SYNC_UNAVAILABLE", 503);
  return parsed.data;
}

const finalizedRunSchema = z.object({
  result_run_id: z.string().uuid(),
  result_status: z.enum(["succeeded", "failed"]),
  result_code: z.string().nullable(),
  result_finished_at: z.string().datetime({ offset: true }),
});

export async function finalizeApiFootballSync(
  systemActorId: string,
  claim: ClaimedSportsSync,
  result:
    | {
        status: "succeeded";
        fixturesSeen: number;
        operatorNotes: string[];
        quotaRemaining: number | null;
      }
    | {
        status: "failed";
        errorCode: string;
        errorMessageSafe: string;
        retryAfterSeconds: number | null;
        quotaRemaining: number | null;
        operatorNotes: string[];
      },
) {
  const admin = createSystemActorAdminClient(systemActorId);
  // Supabase's generated function-argument types do not preserve PostgreSQL
  // nullability. The RPC contract requires actual JSON nulls for terminal
  // metadata that does not apply to the selected status.
  const nullableText = (value: string | null) => value as string;
  const nullableNumber = (value: number | null) => value as number;
  const { data, error } = await admin.rpc("finalize_sports_sync", {
    p_run_id: claim.runId,
    p_generation: claim.generation,
    p_token: claim.token,
    p_status: result.status,
    p_error_code: nullableText(
      result.status === "failed" ? result.errorCode : null,
    ),
    p_error_message_safe: nullableText(
      result.status === "failed" ? result.errorMessageSafe : null,
    ),
    p_fixtures_seen: result.status === "succeeded" ? result.fixturesSeen : 0,
    p_operator_notes: result.operatorNotes,
    p_quota_remaining: nullableNumber(
      result.quotaRemaining,
    ),
    p_retry_after_seconds:
      result.status === "failed"
        ? (result.retryAfterSeconds ?? undefined)
        : undefined,
  });
  if (error) throw getDatabaseSyncError(error);
  const parsed = finalizedRunSchema.safeParse(
    Array.isArray(data) && data.length === 1 ? data[0] : null,
  );
  if (!parsed.success || parsed.data.result_run_id !== claim.runId) {
    throw new SyncError("SYNC_UNAVAILABLE", 503);
  }
  return parsed.data;
}
