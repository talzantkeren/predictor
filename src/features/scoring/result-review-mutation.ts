import "server-only";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/features/auth/session";
import type { LifecycleDecisionActionState } from "@/features/scoring/lifecycle-decision-action-state";
import { resolveMatchResultReviewAsSystem } from "@/features/scoring/private-scoring-gateway";
import { getManualResultAuthorization } from "@/features/scoring/queries";
import { resultReviewDecisionSchema } from "@/features/scoring/schemas";

export async function mutateResultReview(
  context: Readonly<{ matchId: string; resultVersion: number }>,
  _previousState: LifecycleDecisionActionState,
  formData: FormData,
): Promise<LifecycleDecisionActionState> {
  const { supabase, user } = await requireAuthenticatedUser("/admin/matches");
  const parsed = resultReviewDecisionSchema.safeParse({
    selectedStatus: formData.get("selectedStatus"),
    selectedHomeScore: formData.get("selectedHomeScore"),
    selectedAwayScore: formData.get("selectedAwayScore"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "יש לתקן את הכרעת התוצאה.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const authorization = await getManualResultAuthorization(
    supabase,
    context.matchId,
  );
  if (authorization.status !== "authorized") {
    return {
      status: "error",
      message:
        authorization.status === "error"
          ? "לא ניתן לבדוק את הרשאת מנהל המערכת כרגע. יש לנסות שוב."
          : authorization.status === "not-found"
            ? "המשחק המבוקש אינו זמין."
            : "אין הרשאה להכריע בדיקת תוצאה.",
    };
  }

  const result = await resolveMatchResultReviewAsSystem(user.id, {
    matchId: context.matchId,
    resultVersion: context.resultVersion,
    ...parsed.data,
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/admin/matches");
  revalidatePath("/leagues/[leagueId]", "page");
  revalidatePath("/leagues/[leagueId]/matches", "page");
  revalidatePath("/leagues/[leagueId]/standings", "page");

  return {
    status: "success",
    message: `הבדיקה הוכרעה בגרסת תוצאה ${result.data.result_applied_version}.`,
  };
}
