import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getSafeLeagueErrorMessage,
  getSafeLeagueSettingsErrorMessage,
} from "@/features/leagues/errors";
import type {
  CreateLeagueInput,
  UpdateLeagueSettingsInput,
} from "@/features/leagues/schemas";
import type { Database } from "@/types/database.generated";

type CreateLeagueResult =
  | { ok: true; leagueId: string }
  | { ok: false; message: string };

function nullableRpcTimestamp(value: string | null) {
  // Supabase's generated function Args currently erase PostgreSQL parameter
  // nullability even though both RPC signatures intentionally accept NULL.
  return value as unknown as string;
}

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
    p_joins_close_at: nullableRpcTimestamp(null),
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

type UpdateLeagueSettingsResult =
  | {
      ok: true;
      settingsVersion: number;
      scoringVersion: number;
      changed: boolean;
    }
  | { ok: false; message: string };

export async function updateLeagueSettings(
  supabase: SupabaseClient<Database>,
  input: UpdateLeagueSettingsInput,
): Promise<UpdateLeagueSettingsResult> {
  const { data, error } = await supabase.rpc("update_league_settings", {
    p_league_id: input.leagueId,
    p_expected_settings_version: input.expectedSettingsVersion,
    p_name: input.name,
    p_description: input.description ?? "",
    p_demo_entry_fee_agorot: input.demoEntryFeeAgorot,
    p_demo_payment_instructions: input.demoPaymentInstructions ?? "",
    p_joins_close_at: nullableRpcTimestamp(input.joinsCloseAt),
    p_allow_late_join: input.allowLateJoin,
    p_exact_points: input.scoring.exactPoints,
    p_correct_outcome_points: input.scoring.correctOutcomePoints,
    p_incorrect_points: input.scoring.incorrectPoints,
    p_prizes: input.prizes.map((prize) => ({
      position: prize.position,
      percentage_bps: prize.percentageBps,
    })),
  });

  const result = data?.[0];

  if (
    error ||
    !result ||
    !Number.isSafeInteger(result.settings_version) ||
    !Number.isSafeInteger(result.scoring_version) ||
    typeof result.changed !== "boolean"
  ) {
    return {
      ok: false,
      message: getSafeLeagueSettingsErrorMessage(error),
    };
  }

  return {
    ok: true,
    settingsVersion: result.settings_version,
    scoringVersion: result.scoring_version,
    changed: result.changed,
  };
}
