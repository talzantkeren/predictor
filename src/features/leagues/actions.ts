"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/features/auth/session";
import {
  createLeagueSchema,
  getLeagueFieldErrors,
  type LeagueFieldErrors,
  updateLeagueSettingsSchema,
} from "@/features/leagues/schemas";
import { getLeagueSettingsAuthorization } from "@/features/leagues/settings-query";
import {
  createLeague,
  updateLeagueSettings,
} from "@/features/leagues/service";

export type LeagueActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: LeagueFieldErrors;
};

export type LeagueSettingsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: LeagueFieldErrors;
  settingsVersion?: number;
  scoringVersion?: number;
};

function getPrizeInputs(formData: FormData) {
  const positions = formData.getAll("prizePosition");
  const percentages = formData.getAll("prizePercentage");
  const rowCount = Math.max(positions.length, percentages.length);

  return Array.from({ length: rowCount }, (_, index) => ({
    position: positions[index],
    percentageBps: percentages[index],
  }));
}

export async function createLeagueAction(
  _previousState: LeagueActionState,
  formData: FormData,
): Promise<LeagueActionState> {
  const { supabase } = await requireAuthenticatedUser("/leagues/new");
  const parsed = createLeagueSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    seasonId: formData.get("seasonId"),
    demoEntryFeeAgorot: formData.get("demoEntryFeeAgorot"),
    demoPaymentInstructions: formData.get("demoPaymentInstructions"),
    allowLateJoin: formData.get("allowLateJoin") === "on",
    scoring: {
      exactPoints: formData.get("exactPoints"),
      correctOutcomePoints: formData.get("correctOutcomePoints"),
      incorrectPoints: formData.get("incorrectPoints"),
    },
    prizes: getPrizeInputs(formData),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "יש לתקן את השדות המסומנים.",
      fieldErrors: getLeagueFieldErrors(parsed.error),
    };
  }

  const result = await createLeague(supabase, parsed.data);

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  revalidatePath("/dashboard");
  redirect(`/leagues/${result.leagueId}`);
}

export async function updateLeagueSettingsAction(
  _previousState: LeagueSettingsActionState,
  formData: FormData,
): Promise<LeagueSettingsActionState> {
  const { supabase } = await requireAuthenticatedUser("/dashboard");
  const preservedVersions = {
    settingsVersion: _previousState.settingsVersion,
    scoringVersion: _previousState.scoringVersion,
  };
  const parsed = updateLeagueSettingsSchema.safeParse({
    leagueId: formData.get("leagueId"),
    expectedSettingsVersion: formData.get("expectedSettingsVersion"),
    name: formData.get("name"),
    description: formData.get("description"),
    demoEntryFeeAgorot: formData.get("demoEntryFeeAgorot"),
    demoPaymentInstructions: formData.get("demoPaymentInstructions"),
    joinsCloseAt: formData.get("joinsCloseAt"),
    allowLateJoin: formData.get("allowLateJoin") === "on",
    scoring: {
      exactPoints: formData.get("exactPoints"),
      correctOutcomePoints: formData.get("correctOutcomePoints"),
      incorrectPoints: formData.get("incorrectPoints"),
    },
    prizes: getPrizeInputs(formData),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "יש לתקן את השדות המסומנים.",
      fieldErrors: getLeagueFieldErrors(parsed.error),
      ...preservedVersions,
    };
  }

  const authorization = await getLeagueSettingsAuthorization(
    supabase,
    parsed.data.leagueId,
  );

  if (authorization.status !== "authorized") {
    return {
      status: "error",
      message:
        authorization.status === "error"
          ? "לא ניתן לשמור את הגדרות הליגה כרגע. יש לנסות שוב."
          : "לא ניתן לעדכן את הגדרות הליגה.",
      ...preservedVersions,
    };
  }

  const result = await updateLeagueSettings(supabase, parsed.data);

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
      ...preservedVersions,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/leagues/${parsed.data.leagueId}`);
  revalidatePath(`/leagues/${parsed.data.leagueId}/settings`);

  return {
    status: "success",
    message: result.changed
      ? "הגדרות הליגה נשמרו."
      : "ההגדרות כבר מעודכנות; לא נוצר שינוי נוסף.",
    settingsVersion: result.settingsVersion,
    scoringVersion: result.scoringVersion,
  };
}
