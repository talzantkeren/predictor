"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getFieldErrors, updateProfileSchema } from "@/features/auth/schemas";
import { createClient } from "@/lib/supabase/server";

export type ProfileActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function updateProfileAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = updateProfileSchema.safeParse({
    displayName: formData.get("displayName"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "יש לתקן את השדה המסומן.",
      fieldErrors: getFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      status: "error",
      message: "פג תוקף ההתחברות. יש להתחבר מחדש.",
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", user.id);

  if (error) {
    return {
      status: "error",
      message: "לא ניתן לעדכן את הפרופיל כרגע. יש לנסות שוב.",
    };
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard");

  return {
    status: "success",
    message: "שם התצוגה עודכן בהצלחה.",
  };
}

export async function signOutAction() {
  const supabase = await createClient();

  await supabase.auth.getUser();
  await supabase.auth.signOut({ scope: "local" });

  redirect("/login?status=signed-out");
}
