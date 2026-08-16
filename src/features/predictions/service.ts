import type { SupabaseClient } from "@supabase/supabase-js";

import { getSafePredictionsErrorMessage } from "@/features/predictions/errors";
import { savedPredictionRpcSchema } from "@/features/predictions/schemas";
import type { Database } from "@/types/database.generated";

export async function savePrediction(
  supabase: SupabaseClient<Database>,
  input: {
    leagueId: string;
    matchId: string;
    predictedHomeScore: number;
    predictedAwayScore: number;
  },
) {
  const { data, error } = await supabase.rpc("save_prediction", {
    p_league_id: input.leagueId,
    p_match_id: input.matchId,
    p_predicted_home_score: input.predictedHomeScore,
    p_predicted_away_score: input.predictedAwayScore,
  });

  if (error) {
    return {
      ok: false as const,
      message: getSafePredictionsErrorMessage(error),
    };
  }

  const parsed = savedPredictionRpcSchema.safeParse(
    Array.isArray(data) && data.length === 1 ? data[0] : null,
  );
  if (!parsed.success) {
    return {
      ok: false as const,
      message: "הניחוש נשמר, אך לא ניתן לקרוא את המצב העדכני. יש לרענן.",
    };
  }

  return { ok: true as const, data: parsed.data };
}
