"use server";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/features/auth/session";
import { getPredictionWriteAuthorization } from "@/features/predictions/queries";
import {
  getPredictionFieldErrors,
  savePredictionInputSchema,
  type PredictionFieldErrors,
} from "@/features/predictions/schemas";
import { savePrediction } from "@/features/predictions/service";

export type PredictionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  savedAt?: string;
  fieldErrors?: PredictionFieldErrors;
};

export async function savePredictionAction(
  _previousState: PredictionActionState,
  formData: FormData,
): Promise<PredictionActionState> {
  const { supabase, user } = await requireAuthenticatedUser("/dashboard");
  const parsed = savePredictionInputSchema.safeParse({
    leagueId: formData.get("leagueId"),
    matchId: formData.get("matchId"),
    predictedHomeScore: formData.get("predictedHomeScore"),
    predictedAwayScore: formData.get("predictedAwayScore"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "יש לתקן את התוצאה לפני השמירה.",
      fieldErrors: getPredictionFieldErrors(parsed.error),
    };
  }

  const authorization = await getPredictionWriteAuthorization(
    supabase,
    parsed.data.leagueId,
    parsed.data.matchId,
    user.id,
  );
  if (authorization.status !== "authorized") {
    return {
      status: "error",
      message:
        authorization.status === "error"
          ? "לא ניתן לבדוק את הרשאת הניחוש כרגע. יש לנסות שוב."
          : authorization.status === "state-conflict"
            ? "הליגה הושלמה או הועברה לארכיון ולכן היא זמינה לקריאה בלבד."
          : "המשחק המבוקש אינו זמין בליגה הזו.",
    };
  }

  const result = await savePrediction(supabase, parsed.data);
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  revalidatePath(`/leagues/${parsed.data.leagueId}/matches`);
  revalidatePath(`/matches/${parsed.data.matchId}`);

  return {
    status: "success",
    message: "הניחוש נשמר וניתן לעריכה עד מועד הנעילה.",
    savedAt: result.data.updatedAt,
  };
}
