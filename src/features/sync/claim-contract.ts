import { z } from "zod";

import type {
  ClaimedSportsSync,
  SportsSyncClaim,
} from "@/features/sync/types";

const claimRowSchema = z.object({
  result_outcome: z.enum(["CLAIMED", "NOT_DUE", "CONCURRENT_ATTEMPT"]),
  result_run_id: z.string().uuid().nullable(),
  result_provider: z.literal("api-football"),
  result_sync_kind: z
    .enum(["catalog", "targeted", "reconciliation"])
    .nullable(),
  result_generation: z.number().int().positive().nullable(),
  result_token: z.string().uuid().nullable(),
  result_locked_until: z.string().datetime({ offset: true }).nullable(),
  result_fixture_ids: z.array(z.string().regex(/^[1-9]\d*$/)).max(20),
  result_code: z
    .enum([
      "NOT_DUE",
      "PROVIDER_BACKOFF",
      "FORCE_COOLDOWN",
      "CONCURRENT_ATTEMPT",
    ])
    .nullable(),
});

export function parseSportsSyncClaimRow(value: unknown): SportsSyncClaim | null {
  const parsed = claimRowSchema.safeParse(value);
  if (!parsed.success) return null;
  const row = parsed.data;

  if (
    row.result_outcome === "CLAIMED" &&
    row.result_run_id &&
    row.result_sync_kind &&
    row.result_generation &&
    row.result_token &&
    row.result_locked_until &&
    row.result_code === null
  ) {
    const claim: ClaimedSportsSync = {
      outcome: "CLAIMED",
      runId: row.result_run_id,
      provider: row.result_provider,
      syncKind: row.result_sync_kind,
      generation: row.result_generation,
      token: row.result_token,
      lockedUntil: row.result_locked_until,
      fixtureIds: row.result_fixture_ids,
    };
    return claim;
  }

  if (
    row.result_outcome === "NOT_DUE" &&
    row.result_run_id === null &&
    (row.result_code === "NOT_DUE" ||
      row.result_code === "PROVIDER_BACKOFF" ||
      row.result_code === "FORCE_COOLDOWN")
  ) {
    return {
      outcome: "NOT_DUE",
      runId: null,
      provider: row.result_provider,
      reason: row.result_code,
    };
  }

  if (
    row.result_outcome === "CONCURRENT_ATTEMPT" &&
    row.result_run_id &&
    row.result_code === "CONCURRENT_ATTEMPT"
  ) {
    return {
      outcome: "CONCURRENT_ATTEMPT",
      runId: row.result_run_id,
      provider: row.result_provider,
      reason: row.result_code,
    };
  }
  return null;
}
