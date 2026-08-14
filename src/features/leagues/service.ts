import type { SupabaseClient } from "@supabase/supabase-js";

import { getSafeLeagueErrorMessage } from "@/features/leagues/errors";
import type { CreateLeagueInput } from "@/features/leagues/schemas";
import type { Database } from "@/types/database.generated";

type CreateLeagueResult =
  | { ok: true; leagueId: string }
  | { ok: false; message: string };

export async function createLeague(
  supabase: SupabaseClient<Database>,
  input: CreateLeagueInput,
): Promise<CreateLeagueResult> {
  const { data, error } = await supabase.rpc("create_league", {
    p_season_id: input.seasonId,
    p_name: input.name,
    p_description: input.description ?? "",
    p_demo_entry_fee_agorot: input.demoEntryFeeAgorot,
    p_demo_payment_instructions: input.demoPaymentInstructions ?? "",
    // The generator does not encode nullable PostgreSQL function arguments.
    // Runtime null is intentional and produces a SQL NULL timestamptz.
    p_joins_close_at: null as unknown as string,
    p_allow_late_join: input.allowLateJoin,
    p_exact_points: input.scoring.exactPoints,
    p_correct_outcome_points: input.scoring.correctOutcomePoints,
    p_incorrect_points: input.scoring.incorrectPoints,
    p_prizes: input.prizes.map((prize) => ({
      position: prize.position,
      percentage_bps: prize.percentageBps,
    })),
  });

  if (error || !data) {
    return { ok: false, message: getSafeLeagueErrorMessage(error) };
  }

  return { ok: true, leagueId: data };
}
