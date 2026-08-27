import "server-only";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/features/auth/session";
import type { ManualOverrideClearActionState } from "@/features/scoring/manual-override-clear-action-state";
import { clearManualMatchOverrideAsSystem } from "@/features/scoring/private-scoring-gateway";
import { getManualResultAuthorization } from "@/features/scoring/queries";
import { manualOverrideClearConfirmationSchema } from "@/features/scoring/schemas";

export type ManualOverrideClearMutationContext = Readonly<{
  matchId: string;
}>;

export async function mutateManualOverrideClear(
  context: ManualOverrideClearMutationContext,
  _previousState: ManualOverrideClearActionState,
  formData: FormData,
): Promise<ManualOverrideClearActionState> {
  const { supabase, user } = await requireAuthenticatedUser("/admin/matches");
  const confirmation = manualOverrideClearConfirmationSchema.safeParse({
    confirmation: formData.get("confirmation"),
  });
  if (!confirmation.success) {
    return {
      status: "error",
      message: "יש לאשר את החזרת הבעלות לספק.",
      confirmationError:
        confirmation.error.flatten().fieldErrors.confirmation?.[0] ??
        "יש לאשר במפורש את החזרת הבעלות לספק.",
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
            : "אין הרשאה להחזיר את ניהול המשחק לספק.",
    };
  }

  const result = await clearManualMatchOverrideAsSystem(
    user.id,
    context.matchId,
  );
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  revalidatePath("/admin/matches");

  return {
    status: "success",
    message: result.data.cleared
      ? "הבעלות הוחזרה ל־API-Football. המצב והתוצאה הנוכחיים נשמרו עד לעדכון ספק מאומת."
      : "הבעלות כבר נמצאת אצל API-Football. המצב והתוצאה לא השתנו.",
    resultVersion: result.data.resultVersion,
    cleared: result.data.cleared,
  };
}
