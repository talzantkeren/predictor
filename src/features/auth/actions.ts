"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSafeAuthErrorMessage } from "@/features/auth/errors";
import {
  getSafeAuthOrigin,
  getSafeAuthRedirect,
} from "@/features/auth/redirects";
import {
  forgotPasswordSchema,
  getFieldErrors,
  loginSchema,
  registerSchema,
  updatePasswordSchema,
  updateProfileSchema,
} from "@/features/auth/schemas";
import { getPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export type ProfileActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const CONSISTENT_RECOVERY_MESSAGE =
  "אם קיים חשבון התואם לכתובת, נשלח אליו קישור לשחזור הסיסמה.";

function validationFailure(
  fieldErrors: Record<string, string[] | undefined>,
): AuthActionState {
  return {
    status: "error",
    message: "יש לתקן את השדות המסומנים.",
    fieldErrors,
  };
}

async function getAuthRequestOrigin() {
  const env = getPublicEnv();
  const configuredOrigin = new URL(env.NEXT_PUBLIC_APP_URL).origin;
  const allowedOrigins = [
    configuredOrigin,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000",
    process.env.NODE_ENV === "production" ? undefined : "http://127.0.0.1:3000",
  ].filter((origin): origin is string => Boolean(origin));
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const requestOrigin = host
    ? `${host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https"}://${host}`
    : undefined;

  return getSafeAuthOrigin(
    requestOrigin,
    allowedOrigins,
    configuredOrigin,
  );
}

export async function registerAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  if (!parsed.success) {
    return validationFailure(getFieldErrors(parsed.error));
  }

  const origin = await getAuthRequestOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${origin}/auth/confirm?next=/dashboard`,
    },
  });

  if (error) {
    return {
      status: "error",
      message: getSafeAuthErrorMessage(error, "register"),
    };
  }

  return {
    status: "success",
    message:
      "ההרשמה התקבלה. שלחנו הודעת אישור לכתובת שהזנת. יש לפתוח את הקישור בהודעה לפני ההתחברות.",
  };
}

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const nextPath = getSafeAuthRedirect(formData.get("next"));
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return validationFailure(getFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return {
      status: "error",
      message: getSafeAuthErrorMessage(error, "login"),
    };
  }

  redirect(nextPath);
}

export async function forgotPasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return validationFailure(getFieldErrors(parsed.error));
  }

  const origin = await getAuthRequestOrigin();
  const supabase = await createClient();

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/confirm?next=/update-password`,
  });

  return {
    status: "success",
    message: CONSISTENT_RECOVERY_MESSAGE,
  };
}

export async function updatePasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  if (!parsed.success) {
    return validationFailure(getFieldErrors(parsed.error));
  }

  const cookieStore = await cookies();

  if (cookieStore.get("predictor_recovery")?.value !== "active") {
    return {
      status: "error",
      message: "הקישור אינו תקף או שפג תוקפו. יש לבקש קישור חדש.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    cookieStore.delete("predictor_recovery");
    return {
      status: "error",
      message: "הקישור אינו תקף או שפג תוקפו. יש לבקש קישור חדש.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      status: "error",
      message: getSafeAuthErrorMessage(error, "password-update"),
    };
  }

  await supabase.auth.signOut({ scope: "local" });
  cookieStore.delete("predictor_recovery");
  redirect("/login?status=password-updated");
}

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
  const cookieStore = await cookies();

  await supabase.auth.getUser();
  await supabase.auth.signOut({ scope: "local" });
  cookieStore.delete("predictor_recovery");

  redirect("/login?status=signed-out");
}
