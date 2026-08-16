"use server";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/features/auth/session";
import { scoreMatchAsSystem } from "@/features/scoring/private-scoring-gateway";
import { getManualResultAuthorization } from "@/features/scoring/queries";
import {
  getManualResultFieldErrors,
  manualResultInputSchema,
  type ManualResultFieldErrors,
} from "@/features/scoring/schemas";

export type ManualResultActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  resultVersion?: number;
  fieldErrors?: ManualResultFieldErrors;
};

export async function applyManualResult(
  _previousState: ManualResultActionState,
  formData: FormData,
): Promise<ManualResultActionState> {
  const { supabase, user } = await requireAuthenticatedUser("/admin/matches");
  const parsed = manualResultInputSchema.safeParse({
    matchId: formData.get("matchId"),
    status: formData.get("status"),
    homeScore: formData.get("homeScore"),
    awayScore: formData.get("awayScore"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "יש לתקן את פרטי התוצאה.",
      fieldErrors: getManualResultFieldErrors(parsed.error),
    };
  }

  const authorization = await getManualResultAuthorization(
    supabase,
    parsed.data.matchId,
  );
  if (authorization.status !== "authorized") {
    return {
      status: "error",
      message:
        authorization.status === "error"
          ? "לא ניתן לבדוק את הרשאת מנהל המערכת כרגע. יש לנסות שוב."
          : authorization.status === "not-found"
            ? "המשחק המבוקש אינו זמין."
            : "אין הרשאה להזין או לתקן תוצאות משחקים.",
    };
  }

  const result = await scoreMatchAsSystem(user.id, parsed.data);
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  revalidatePath("/admin/matches");
  revalidatePath("/leagues/[leagueId]/standings", "page");
  revalidatePath("/leagues/[leagueId]/matches", "page");
  revalidatePath("/matches/[matchId]", "page");

  return {
    status: "success",
    message: "התוצאה נשמרה והדירוגים חושבו מחדש.",
    resultVersion: result.data.resultVersion,
  };
}
