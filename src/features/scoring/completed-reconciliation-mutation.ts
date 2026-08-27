import "server-only";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/features/auth/session";
import type { LifecycleDecisionActionState } from "@/features/scoring/lifecycle-decision-action-state";
import { reconcileCompletedLeagueAsSystem } from "@/features/scoring/private-scoring-gateway";
import { getSystemAdminAuthorization } from "@/features/scoring/queries";
import { completedReconciliationDecisionSchema } from "@/features/scoring/schemas";

export async function mutateCompletedReconciliation(
  context: Readonly<{
    reconciliationId: string;
    expectedResultVersion: number;
  }>,
  _previousState: LifecycleDecisionActionState,
  formData: FormData,
): Promise<LifecycleDecisionActionState> {
  const { supabase, user } = await requireAuthenticatedUser("/admin/matches");
  const parsed = completedReconciliationDecisionSchema.safeParse({
    decision: formData.get("decision"),
  });
  if (!parsed.success) {
    return { status: "error", message: "הכרעת היישוב אינה תקינה." };
  }

  const authorization = await getSystemAdminAuthorization(supabase);
  if (authorization.status !== "authorized") {
    return {
      status: "error",
      message:
        authorization.status === "error"
          ? "לא ניתן לבדוק את הרשאת מנהל המערכת כרגע. יש לנסות שוב."
          : "אין הרשאה להכריע יישוב תוצאה סופית.",
    };
  }

  const result = await reconcileCompletedLeagueAsSystem(user.id, {
    reconciliationId: context.reconciliationId,
    expectedResultVersion: context.expectedResultVersion,
    decision: parsed.data.decision,
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/admin/matches");
  revalidatePath("/leagues/[leagueId]/matches", "page");
  revalidatePath("/leagues/[leagueId]/standings", "page");
  revalidatePath("/leagues/[leagueId]/reports", "page");

  return {
    status: "success",
    message:
      result.data.result_disposition === "applied"
        ? "התוצאה הסופית והדירוג עודכנו במפורש."
        : "היישוב נדחה ללא שינוי בתוצאה הסופית.",
  };
}
