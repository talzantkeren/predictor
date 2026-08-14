"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/features/auth/session";
import {
  createLeagueSchema,
  getLeagueFieldErrors,
  type LeagueFieldErrors,
} from "@/features/leagues/schemas";
import { createLeague } from "@/features/leagues/service";

export type LeagueActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: LeagueFieldErrors;
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
