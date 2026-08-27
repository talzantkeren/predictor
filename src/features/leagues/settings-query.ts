import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { EditableLeagueSettings } from "@/features/leagues/settings-types";
import type { Database } from "@/types/database.generated";

type SettingsAuthorization =
  | { status: "authorized"; editorRole: "manager" | "system-admin" }
  | { status: "not-found" }
  | { status: "error" };

const finiteOffsetDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(new Date(value).getTime()));

const editableSettingsRowSchema = z.object({
  league_id: z.string().uuid(),
  editor_role: z.enum(["manager", "system-admin"]),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(["draft", "open", "active", "completed", "archived"]),
  settings_version: z.number().int().positive(),
  demo_entry_fee_agorot: z.number().int().nonnegative(),
  demo_payment_instructions: z.string().nullable(),
  joins_close_at: finiteOffsetDateTimeSchema.nullable(),
  allow_late_join: z.boolean(),
  database_time: finiteOffsetDateTimeSchema,
  first_kickoff_at: finiteOffsetDateTimeSchema.nullable(),
  has_started_or_latched: z.boolean(),
  rules_locked: z.boolean(),
  exact_points: z.number().int(),
  correct_outcome_points: z.number().int(),
  incorrect_points: z.number().int(),
  scoring_version: z.number().int().positive(),
  scoring_locked_at: finiteOffsetDateTimeSchema.nullable(),
  prizes: z
    .array(
      z.object({
        position: z.number().int().min(1).max(100),
        percentage_bps: z.number().int().min(1).max(10_000),
      }),
    )
    .min(1)
    .max(100),
});

function isOpaqueNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes("LEAGUE_SETTINGS_NOT_FOUND")
  );
}

export async function getLeagueSettingsAuthorization(
  supabase: SupabaseClient<Database>,
  leagueId: string,
): Promise<SettingsAuthorization> {
  const result = await getEditableLeagueSettings(supabase, leagueId);

  if (result.status !== "found") {
    return result;
  }

  return {
    status: "authorized",
    editorRole: result.settings.editorRole,
  };
}

export async function getEditableLeagueSettings(
  supabase: SupabaseClient<Database>,
  leagueId: string,
): Promise<
  | { status: "found"; settings: EditableLeagueSettings }
  | { status: "not-found" }
  | { status: "error" }
> {
  const { data, error } = await supabase.rpc(
    "get_editable_league_settings",
    { p_league_id: leagueId },
  );

  if (error) {
    return isOpaqueNotFoundError(error)
      ? { status: "not-found" }
      : { status: "error" };
  }

  const parsed = editableSettingsRowSchema.safeParse(data?.[0]);

  if (!parsed.success) {
    return { status: "error" };
  }

  const row = parsed.data;

  return {
    status: "found",
    settings: {
      id: row.league_id,
      name: row.name,
      description: row.description,
      status: row.status,
      editorRole: row.editor_role,
      settingsVersion: row.settings_version,
      demoEntryFeeAgorot: row.demo_entry_fee_agorot,
      demoPaymentInstructions: row.demo_payment_instructions,
      joinsCloseAt: row.joins_close_at,
      allowLateJoin: row.allow_late_join,
      databaseTime: row.database_time,
      firstKickoffAt: row.first_kickoff_at,
      hasStartedOrLatched: row.has_started_or_latched,
      rulesLocked: row.rules_locked,
      scoring: {
        exactPoints: row.exact_points,
        correctOutcomePoints: row.correct_outcome_points,
        incorrectPoints: row.incorrect_points,
        version: row.scoring_version,
        lockedAt: row.scoring_locked_at,
      },
      prizes: row.prizes.map((prize) => ({
        position: prize.position,
        percentageBps: prize.percentage_bps,
      })),
    },
  };
}
