import "server-only";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/features/auth/session";
import type { ManualMatchActionState } from "@/features/scoring/manual-match-action-state";
import { createOrCorrectMatchAsSystem } from "@/features/scoring/private-scoring-gateway";
import { getSystemAdminAuthorization } from "@/features/scoring/queries";
import {
  getManualMatchFieldErrors,
  manualMatchInputSchema,
} from "@/features/scoring/schemas";

export type ManualMatchMutationContext = Readonly<{
  operation: "create" | "correct";
  matchId: string;
}>;

export async function mutateManualMatch(
  context: ManualMatchMutationContext,
  _previousState: ManualMatchActionState,
  formData: FormData,
): Promise<ManualMatchActionState> {
  const { supabase, user } = await requireAuthenticatedUser("/admin/matches");
  const parsed = manualMatchInputSchema.safeParse({
    // These fields are captured by the Server Component action. Form fields
    // with the same names are deliberately ignored at this trusted boundary.
    operation: context.operation,
    matchId: context.matchId,
    seasonId: formData.get("seasonId"),
    homeTeamId: formData.get("homeTeamId"),
    awayTeamId: formData.get("awayTeamId"),
    roundNumber: formData.get("roundNumber"),
    kickoffAt: formData.get("kickoffAt"),
    status: formData.get("status"),
    homeScore: formData.get("homeScore"),
    awayScore: formData.get("awayScore"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "יש לתקן את פרטי המשחק.",
      fieldErrors: getManualMatchFieldErrors(parsed.error),
    };
  }

  const authorization = await getSystemAdminAuthorization(supabase);
  if (authorization.status !== "authorized") {
    return {
      status: "error",
      message:
        authorization.status === "error"
          ? "לא ניתן לבדוק את הרשאת מנהל המערכת כרגע. יש לנסות שוב."
          : "אין הרשאה ליצור או לתקן משחקים.",
    };
  }

  const result = await createOrCorrectMatchAsSystem(user.id, parsed.data);
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  // Keep the server-issued create UUID mounted after success so a retained
  // second submission is an idempotent replay. A normal refresh remounts the
  // keyed create form with a new UUID and cleared values.
  if (context.operation === "correct") {
    revalidatePath("/admin/matches");
    revalidatePath("/leagues/[leagueId]/standings", "page");
    revalidatePath("/leagues/[leagueId]/matches", "page");
    revalidatePath("/matches/[matchId]", "page");
  }

  return {
    status: "success",
    message: result.data.created
      ? "המשחק נוצר ונשמר בבעלות ידנית."
      : !result.data.changed
        ? "המשחק כבר תואם לפרטים שנשלחו."
        : parsed.data.status === "finished" || parsed.data.status === "canceled"
          ? "התוצאה נשמרה והדירוגים חושבו מחדש."
          : "פרטי המשחק נשמרו בבעלות ידנית.",
    resultVersion: result.data.resultVersion,
  };
}
