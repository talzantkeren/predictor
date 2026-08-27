import "server-only";

import { z } from "zod";

import {
  getSafeManualOverrideClearErrorMessage,
  getSafeScoringErrorMessage,
} from "@/features/scoring/errors";
import type { ManualMatchInput } from "@/features/scoring/schemas";
import { createSystemActorAdminClient } from "@/lib/supabase/admin";

const manualMatchMutationSchema = z
  .object({
    result_match_id: z.string().uuid(),
    result_status: z.enum([
      "scheduled",
      "live",
      "finished",
      "postponed",
      "canceled",
    ]),
    result_home_score: z.number().int().min(0).max(30).nullable(),
    result_away_score: z.number().int().min(0).max(30).nullable(),
    result_version: z.number().int().nonnegative(),
    result_created: z.boolean(),
    result_changed: z.boolean(),
    result_manual_override: z.literal(true),
  })
  .transform((result) => ({
    matchId: result.result_match_id,
    status: result.result_status,
    homeScore: result.result_home_score,
    awayScore: result.result_away_score,
    resultVersion: result.result_version,
    created: result.result_created,
    changed: result.result_changed,
    isManuallyOverridden: result.result_manual_override,
  }));

const manualOverrideClearSchema = z
  .object({
    result_match_id: z.string().uuid(),
    result_status: z.enum([
      "scheduled",
      "live",
      "finished",
      "postponed",
      "canceled",
    ]),
    result_home_score: z.number().int().min(0).max(30).nullable(),
    result_away_score: z.number().int().min(0).max(30).nullable(),
    result_version: z.number().int().nonnegative(),
    result_external_provider: z.literal("api-football"),
    result_cleared: z.boolean(),
    result_manual_override: z.literal(false),
  })
  .transform((result) => ({
    matchId: result.result_match_id,
    status: result.result_status,
    homeScore: result.result_home_score,
    awayScore: result.result_away_score,
    resultVersion: result.result_version,
    externalProvider: result.result_external_provider,
    cleared: result.result_cleared,
    isManuallyOverridden: result.result_manual_override,
  }));

export async function createOrCorrectMatchAsSystem(
  systemActorId: string,
  input: ManualMatchInput,
) {
  const admin = createSystemActorAdminClient(systemActorId);
  const nullableScore = (value: number | null) =>
    value ?? (null as unknown as number);
  const { data, error } = await admin.rpc("create_or_correct_match", {
    p_operation: input.operation,
    p_match_id: input.matchId,
    p_season_id: input.seasonId,
    p_home_team_id: input.homeTeamId,
    p_away_team_id: input.awayTeamId,
    p_round_number: input.roundNumber,
    p_kickoff_at: input.kickoffAt,
    p_status: input.status,
    p_home_score: nullableScore(input.homeScore),
    p_away_score: nullableScore(input.awayScore),
  });

  if (error) {
    return {
      ok: false as const,
      message: getSafeScoringErrorMessage(error),
    };
  }

  const parsed = manualMatchMutationSchema.safeParse(
    Array.isArray(data) && data.length === 1 ? data[0] : null,
  );
  if (!parsed.success) {
    return {
      ok: false as const,
      message: "השינוי נשמר, אך לא ניתן לקרוא את מצב המשחק. יש לרענן.",
    };
  }

  return { ok: true as const, data: parsed.data };
}

export async function clearManualMatchOverrideAsSystem(
  systemActorId: string,
  matchId: string,
) {
  const admin = createSystemActorAdminClient(systemActorId);
  const { data, error } = await admin.rpc("clear_manual_match_override", {
    p_match_id: matchId,
  });

  if (error) {
    return {
      ok: false as const,
      message: getSafeManualOverrideClearErrorMessage(error),
    };
  }

  const parsed = manualOverrideClearSchema.safeParse(
    Array.isArray(data) && data.length === 1 ? data[0] : null,
  );
  if (!parsed.success) {
    return {
      ok: false as const,
      message:
        "הבעלות עודכנה, אך לא ניתן לקרוא את מצב המשחק. יש לרענן.",
    };
  }

  return { ok: true as const, data: parsed.data };
}
