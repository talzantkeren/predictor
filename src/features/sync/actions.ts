"use server";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/features/auth/session";
import { getSystemAdminAuthorization } from "@/features/scoring/queries";
import { runSportsSync } from "@/features/sync/orchestrator";
import { getSportsSyncEnv } from "@/lib/env";

export type SyncTriggerActionState = {
  status: "idle" | "success" | "skipped" | "error";
  message?: string;
  runId?: string;
};

export async function triggerSportsSyncAction(
  _previousState: SyncTriggerActionState,
): Promise<SyncTriggerActionState> {
  void _previousState;
  const { supabase, user } = await requireAuthenticatedUser("/admin/sync");
  const authorization = await getSystemAdminAuthorization(supabase);
  if (authorization.status !== "authorized") {
    return {
      status: "error",
      message:
        authorization.status === "error"
          ? "לא ניתן לבדוק את הרשאת מנהל המערכת כרגע."
          : "אין הרשאה להפעיל סנכרון.",
    };
  }

  let environment: ReturnType<typeof getSportsSyncEnv>;
  try {
    environment = getSportsSyncEnv();
  } catch {
    return {
      status: "error",
      message: "ספק הספורט אינו מוגדר במלואו בסביבת השרת.",
    };
  }

  try {
    const result = await runSportsSync({
      systemActorId: user.id,
      provider: environment.SPORTS_API_PROVIDER,
      apiKey: environment.SPORTS_API_KEY,
      force: true,
    });
    revalidatePath("/admin/sync");

    if (result.status === "succeeded") {
      return {
        status: "success",
        message: "הסנכרון הושלם. יומן הריצות עודכן.",
        runId: result.runId,
      };
    }
    if (result.status === "skipped") {
      return {
        status: "skipped",
        message:
          result.reason === "CONCURRENT_ATTEMPT"
            ? "ריצה אחרת כבר פעילה; לא נשלחה קריאה נוספת לספק."
            : result.reason === "MANUAL_PROVIDER"
              ? "המערכת מוגדרת לספק ידני ולכן לא נשלחה קריאת רשת."
              : "לא הייתה עבודה שמועד ביצועה הגיע.",
        ...(result.runId ? { runId: result.runId } : {}),
      };
    }
    return {
      status: "error",
      message: "הריצה נכשלה בבטחה. פרטי התפעול נשמרו ביומן.",
      runId: result.runId,
    };
  } catch {
    return {
      status: "error",
      message: "לא ניתן להפעיל את הסנכרון כרגע. יש לנסות שוב.",
    };
  }
}
