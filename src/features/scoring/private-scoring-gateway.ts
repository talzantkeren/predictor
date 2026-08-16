import "server-only";

import { z } from "zod";

import { getSafeScoringErrorMessage } from "@/features/scoring/errors";
import type { ManualResultInput } from "@/features/scoring/schemas";
import { createSystemActorAdminClient } from "@/lib/supabase/admin";

const scoredMatchSchema = z
  .object({
    result_match_id: z.string().uuid(),
    result_status: z.enum(["finished", "canceled"]),
    result_home_score: z.number().int().min(0).max(30).nullable(),
    result_away_score: z.number().int().min(0).max(30).nullable(),
    result_version: z.number().int().nonnegative(),
    result_changed: z.boolean(),
    predictions_scored: z.number().int().nonnegative(),
  })
  .transform((result) => ({
    matchId: result.result_match_id,
    status: result.result_status,
    homeScore: result.result_home_score,
    awayScore: result.result_away_score,
    resultVersion: result.result_version,
    resultChanged: result.result_changed,
    predictionsScored: result.predictions_scored,
  }));

export async function scoreMatchAsSystem(
  systemActorId: string,
  input: ManualResultInput,
) {
  const admin = createSystemActorAdminClient(systemActorId);
  const { data, error } = await admin.rpc("score_match", {
    p_match_id: input.matchId,
    p_status: input.status,
    // PostgreSQL function arguments are nullable at runtime, but generated
    // types cannot encode argument nullability.
    p_home_score: input.homeScore ?? (null as unknown as number),
    p_away_score: input.awayScore ?? (null as unknown as number),
    p_is_manual_override: true,
    p_source: "manual",
  });

  if (error) {
    return {
      ok: false as const,
      message: getSafeScoringErrorMessage(error),
    };
  }

  const parsed = scoredMatchSchema.safeParse(
    Array.isArray(data) && data.length === 1 ? data[0] : null,
  );
  if (!parsed.success) {
    return {
      ok: false as const,
      message: "התוצאה נשמרה, אך לא ניתן לקרוא את מצב הניקוד. יש לרענן.",
    };
  }

  return { ok: true as const, data: parsed.data };
}
